"""Validação numérica real e benchmark pareado, sem servidor/streaming HTTP.

Execute: .venv/Scripts/python.exe validate_gpu.py
Pesos devem estar no cache; resultados em recordings/gpu-validation.json.
"""
import os
os.environ.setdefault('HF_HUB_OFFLINE', '1')
import gc
import json
import platform
import statistics
import threading
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

import torch
import transformers
from app.engine import CaptureRequest, Engine


def validate(engine):
    reference = {}
    handles = []
    def layer_hook(index):
        def hook(module, args, output):
            x = output[0] if isinstance(output, tuple) else output
            reference[index] = x[0, -1].detach().float().cpu()
        return hook
    def model_hook(module, args, kwargs, output):
        reference['input'] = kwargs['input_ids'][0].tolist()
        reference['mask_length'] = kwargs['attention_mask'].shape[-1]
        reference['probs'] = output.logits[0, -1].detach().float().softmax(-1).cpu()
        reference['attention'] = output.attentions[27][0, 3, -1].detach().float().cpu()
    for layer in engine.layer_ids:
        handles.append(engine.model.model.layers[layer].register_forward_hook(layer_hook(layer)))
    handles.append(engine.model.register_forward_hook(model_hook, with_kwargs=True))
    req = CaptureRequest('Explique overfitting em uma frase.', max_tokens=8,
                         temperature=0, attention_layer=27, attention_head=3)
    events = []
    max_rms_error = 0.0
    try:
        for event in engine.stream(req, threading.Event()):
            events.append(event)
            if event['type'] == 'meta':
                context = [t['id'] for t in event['prompt']]
                prompt_length = len(context)
            if event['type'] != 'step':
                continue
            step = event
            assert step['step'] == len(context) - prompt_length
            assert step['input_position'] == len(context)-1
            assert step['input_token']['id'] == context[-1]
            assert step['chosen']['position'] == len(context)
            assert reference['input'] == (context if step['step'] == 0 else context[-1:])
            assert reference['mask_length'] == len(context)
            assert step['forward_tokens'] == (prompt_length if step['step'] == 0 else 1)
            for layer in step['layers']:
                vector = reference[layer['layer']]
                assert abs(layer['rms'] - vector.square().mean().sqrt().item()) < 1e-5
                for group in layer['groups']:
                    part = vector[group['channel_start']:group['channel_end_exclusive']]
                    expected = part.square().mean().sqrt().item()
                    error = abs(layer['bins'][group['group']] - expected)
                    max_rms_error = max(max_rms_error, error)
                    assert error < max(1e-5, abs(expected)*2e-6)
            probs = reference['probs']
            assert step['chosen']['id'] == probs.argmax().item()
            assert step['chosen_probability'] == probs[step['chosen']['id']].item()
            values, ids = probs.topk(5)
            assert [x['id'] for x in step['top']] == ids.tolist()
            torch.testing.assert_close(torch.tensor([x['probability'] for x in step['top']]), values, rtol=0, atol=0)
            attn = step['attention']
            assert attn['query_position'] == len(context)-1
            assert attn['keys_total'] == len(context)
            torch.testing.assert_close(torch.tensor(attn['weights']), reference['attention'], rtol=0, atol=0)
            assert abs(attn['total_mass']-1) < .01  # BF16 softmax rounding
            for key in attn['top']:
                assert key['id'] == context[key['position']]
                assert key['weight'] == reference['attention'][key['position']].item()
            assert abs(sum(k['weight'] for k in attn['top']) + attn['remaining_mass'] - attn['total_mass']) < 1e-6
            context.append(step['chosen']['id'])
    finally:
        for h in handles:
            h.remove()
    return {'passed': True, 'steps': len(context)-prompt_length,
            'max_group_rms_absolute_error': max_rms_error,
            'method': 'Independent hooks: raw block vectors, model logits and attention from the same GPU forward; prompt and KV input positions checked at every step.',
            'request': asdict(req), 'capture': events}


def main():
    assert torch.cuda.is_available(), 'CUDA obrigatória neste diagnóstico'
    engine = Engine('Qwen/Qwen3-0.6B', 'cuda')
    engine.load()
    print('Validando capturas reais...', flush=True)
    validation = validate(engine)
    req = CaptureRequest('Explique overfitting em uma frase.', max_tokens=32, temperature=0)
    # Warm both modes; alternate order to expose drift instead of one cold run.
    for enabled in [False, True]:
        list(engine.stream(CaptureRequest(req.message, max_tokens=4, temperature=0, attention=enabled), threading.Event()))
    runs = []
    sequences = []
    for index, enabled in enumerate([False, True, True, False, False, True]):
        gc.collect()
        torch.cuda.empty_cache()
        req.attention = enabled
        events = list(engine.stream(req, threading.Event()))
        done = events[-1]
        steps = [e for e in events if e['type'] == 'step']
        sequences.append([s['chosen']['id'] for s in steps])
        runs.append({'run': index+1, 'attention': enabled, **done,
                     'prefill_ms': steps[0]['step_ms'],
                     'decode_ms': sum(s['step_ms'] for s in steps[1:]),
                     'prompt_tokens': next(e['prompt_tokens'] for e in events if e['type']=='meta')})
        print(json.dumps(runs[-1]), flush=True)
    assert all(s == sequences[0] for s in sequences), 'Sequências diferentes: comparação não pareada'
    summary = {}
    for enabled in [False, True]:
        selected = [r for r in runs if r['attention'] == enabled]
        summary[str(enabled)] = {key: statistics.median(r[key] for r in selected)
                                for key in ['generation_ms', 'peak_vram_mib', 'peak_reserved_vram_mib', 'prefill_ms', 'decode_ms']}
    report = {'timestamp': datetime.now().astimezone().isoformat(), 'gpu': torch.cuda.get_device_name(),
              'python': platform.python_version(), 'torch': torch.__version__, 'transformers': transformers.__version__,
              'metadata': engine.metadata(), 'validation': validation, 'benchmark_request': asdict(req),
              'protocol': 'Loaded weights; 4-token warmup per mode; 3 runs per mode in ABBAAB order; empty allocator cache before each run. Eager in both modes. Activation hooks always on. Validation hooks removed before benchmark.',
              'identical_greedy_tokens': True, 'runs': runs, 'medians': summary}
    path = Path('recordings/gpu-validation.json')
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: '+str(path.resolve()), flush=True)


if __name__ == '__main__':
    main()
