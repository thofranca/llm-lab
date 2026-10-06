"""Tensores reais de um Qwen3 minúsculo aleatório; sem download de pesos."""
import threading
import torch
from transformers import Qwen3Config, Qwen3ForCausalLM
from app.engine import Engine, CaptureRequest, summarize_vector, selected_layers, channel_groups

class Tokenizer:
    def apply_chat_template(self, messages, **kwargs):
        self.think = kwargs['enable_thinking']
        return 'prompt'
    def __call__(self, prompt, **kwargs):
        return {'input_ids': torch.tensor([[3, 4, 5]]), 'attention_mask': torch.ones((1, 3), dtype=torch.long)}
    def convert_ids_to_tokens(self, i):
        return 't'+str(i)
    def convert_tokens_to_ids(self, text):
        return {'</think>': 60, '<think>': 61}[text]
    def decode(self, ids, **kwargs):
        return ' '.join(self.convert_ids_to_tokens(i) for i in ids)


def make_engine():
    torch.manual_seed(7)
    config = Qwen3Config(vocab_size=64, hidden_size=32, intermediate_size=64,
                         num_hidden_layers=4, num_attention_heads=4,
                         num_key_value_heads=2, head_dim=8, max_position_embeddings=128)
    config._attn_implementation = 'eager'
    model = Qwen3ForCausalLM(config).eval()
    model.generation_config.eos_token_id = 999
    engine = Engine('test-only-random-qwen3', 'cpu')
    engine.model, engine.tokenizer, engine.device = model, Tokenizer(), 'cpu'
    engine.layer_ids = selected_layers(4)
    return engine


def test_summary_is_true_rms():
    result = summarize_vector(torch.tensor([3., 4., -3., -4.]), groups=2)
    assert torch.allclose(torch.tensor(result['bins']), torch.tensor([12.5**.5]*2))
    assert abs(result['rms']-12.5**.5)<1e-6
    assert selected_layers(28)==[0,5,11,16,22,27]


def test_channel_ranges_match_uneven_tensor_split():
    vector = torch.arange(35, dtype=torch.float32)
    result = summarize_vector(vector)
    assert result['groups'] == channel_groups(35)
    covered = []
    for g, measured in zip(result['groups'], result['bins']):
        channels = list(range(g['channel_start'], g['channel_end_exclusive']))
        covered.extend(channels)
        assert abs(measured-vector[channels].square().mean().sqrt().item()) < 1e-6
    assert covered == list(range(35))
    assert len(channel_groups(3)) == 3


def test_capture_matches_same_forward_and_cached_attention():
    engine = make_engine()
    reference = {}
    def hook(module, args, out):
        x=out[0] if isinstance(out, tuple) else out
        reference['last'] = x[0,-1].detach().clone()
    handle=engine.model.model.layers[0].register_forward_hook(hook)
    stream=engine.stream(CaptureRequest('oi', max_tokens=3, temperature=0), threading.Event())
    assert next(stream)['type']=='status'
    assert next(stream)['type']=='meta'
    first=next(stream)
    assert abs(first['layers'][0]['rms']-float(reference['last'].square().mean().sqrt()))<1e-6
    assert first['input_position']==2 and first['chosen']['position']==3
    assert first['chosen']['id']==first['top'][0]['id']
    assert first['attention']['keys_total']==3
    assert first['forward_tokens']==3
    assert first['processed_positions']=={'start':0,'end_exclusive':3}
    assert first['attention']['weights']==[x['weight'] for x in sorted(first['attention']['top'],key=lambda x:x['position'])]
    assert abs(sum(x['weight'] for x in first['attention']['top'])-1)<1e-5
    second=next(stream)
    assert second['input_position']==3 and second['attention']['keys_total']==4
    assert second['input_token']['id']==first['chosen']['id']
    assert second['forward_tokens']==1
    assert second['processed_positions']=={'start':3,'end_exclusive':4}
    rest=list(stream)
    assert rest[-1]['type']=='done' and rest[-1]['generated_tokens']==3
    assert abs(rest[-1]['generation_ms']-sum(s['step_ms'] for s in [first,second,rest[0]])) < .01
    handle.remove()
    assert all(not layer._forward_hooks for layer in engine.model.model.layers)


def test_cancel_and_generator_close_remove_hooks():
    engine=make_engine(); stop=threading.Event()
    it=engine.stream(CaptureRequest('oi'),stop)
    next(it);next(it);next(it)
    assert any(layer._forward_hooks for layer in engine.model.model.layers)
    it.close()
    assert all(not layer._forward_hooks for layer in engine.model.model.layers)
    it=engine.stream(CaptureRequest('oi'),stop)
    next(it);next(it);next(it);stop.set()
    assert list(it)==[]
    assert all(not layer._forward_hooks for layer in engine.model.model.layers)


def test_think_flag_and_attention_disabled():
    engine=make_engine()
    events=list(engine.stream(CaptureRequest('oi', max_tokens=1, think=True, attention=False), threading.Event()))
    step=next(x for x in events if x['type']=='step')
    assert engine.tokenizer.think is True and step['phase']=='thinking'
    assert step['attention'] is None
