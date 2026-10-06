"""Inferência instrumentada. Nenhum valor sintético é usado na aplicação."""
from __future__ import annotations

import os
import math
import threading
import time
from dataclasses import dataclass
from typing import Iterator


@dataclass
class CaptureRequest:
    message: str
    max_tokens: int = 32
    think: bool = False
    attention: bool = True
    attention_layer: int = 0
    attention_head: int = 0
    temperature: float = 0.6
    seed: int = 42


def selected_layers(count: int, maximum: int = 6) -> list[int]:
    if count <= maximum:
        return list(range(count))
    return sorted({round(i * (count - 1) / (maximum - 1)) for i in range(maximum)})


def summarize_vector(vector, groups: int = 16) -> dict:
    """RMS de grupos contíguos de canais; não mede importância semântica."""
    import torch
    vector = vector.detach().float().reshape(-1)
    chunks = torch.tensor_split(vector, min(groups, vector.numel()))
    bins = torch.stack([x.square().mean().sqrt() for x in chunks]).cpu().tolist()
    if not all(math.isfinite(v) for v in bins):
        raise ValueError("Ativações não finitas. Tente CPU ou revise a precisão numérica.")
    return {
        "rms": float(vector.square().mean().sqrt().cpu()),
        "bins": bins,
        "hidden_size": vector.numel(),
    }


class Engine:
    def __init__(self, model_id: str | None = None, device: str | None = None):
        self.model_id = model_id or os.getenv("LLMLAB_MODEL_ID", "Qwen/Qwen3-0.6B")
        self.device_choice = device or os.getenv("LLMLAB_DEVICE", "auto")
        self.model = None
        self.tokenizer = None
        self.device = None
        self.layer_ids: list[int] = []

    def load(self):
        if self.model is not None:
            return
        import torch
        from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer
        config = AutoConfig.from_pretrained(self.model_id, trust_remote_code=False)
        if config.model_type != "qwen3":
            raise ValueError("Este adaptador suporta Qwen3 denso. Gemma precisa de um adaptador específico.")
        device = self.device_choice
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if device not in {"cuda", "cpu"}:
            raise ValueError("LLMLAB_DEVICE deve ser auto, cuda ou cpu.")
        if device == "cuda" and not torch.cuda.is_available():
            raise ValueError("PyTorch não detectou CUDA. Execute doctor.py e confira a instalação.")
        dtype = torch.float32 if device == "cpu" else (
            torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16)
        tokenizer = AutoTokenizer.from_pretrained(self.model_id, trust_remote_code=False)
        model = AutoModelForCausalLM.from_pretrained(
            self.model_id, torch_dtype=dtype, attn_implementation="eager",
            use_safetensors=True, trust_remote_code=False, low_cpu_mem_usage=True,
        ).to(device).eval()
        self.model, self.tokenizer, self.device = model, tokenizer, device
        self.layer_ids = selected_layers(len(model.model.layers))

    def metadata(self):
        config = self.model.config
        return {
            "model": self.model_id,
            "device": self.device,
            "dtype": str(next(self.model.parameters()).dtype),
            "layers_total": config.num_hidden_layers,
            "layers_captured": self.layer_ids,
            "heads": config.num_attention_heads,
            "hidden_size": config.hidden_size,
            "bins": min(16, config.hidden_size),
            "measurement": "RMS de grupos contíguos na saída de blocos decoder, última posição processada",
        }

    def stream(self, req: CaptureRequest, stop: threading.Event) -> Iterator[dict]:
        import torch
        start = time.perf_counter()
        yield {"type": "status", "message": "Carregando modelo. A primeira execução baixa os pesos do Hugging Face."}
        self.load()
        if stop.is_set():
            return
        model, tokenizer = self.model, self.tokenizer
        if not 0 <= req.attention_layer < model.config.num_hidden_layers:
            raise ValueError(f"Camada de atenção deve estar entre 0 e {model.config.num_hidden_layers - 1}.")
        if not 0 <= req.attention_head < model.config.num_attention_heads:
            raise ValueError(f"Cabeça deve estar entre 0 e {model.config.num_attention_heads - 1}.")
        messages = [
            {"role": "system", "content": "Responda em português, de forma curta e didática, sobre Ciência de Dados."},
            {"role": "user", "content": req.message},
        ]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False,
                                               add_generation_prompt=True, enable_thinking=req.think)
        inputs = tokenizer(prompt, return_tensors="pt", add_special_tokens=False)
        context = inputs["input_ids"][0].tolist()
        if len(context) > 256:
            raise ValueError(f"A entrada completa tem {len(context)} tokens. Limite: 256. Encurte a pergunta.")
        yield {"type": "meta", **self.metadata(), "prompt_tokens": len(context),
               "think": req.think, "attention_enabled": req.attention,
               "prompt": [self.token_info(i, n) for n, i in enumerate(context)]}
        current = inputs["input_ids"].to(self.device)
        mask = inputs["attention_mask"].to(self.device)
        generator = torch.Generator(device=self.device).manual_seed(req.seed)
        snapshots: dict = {}
        hooks = []
        output_ids: list[int] = []
        past = None
        phase = "thinking" if req.think else "answer"
        eos_ids = model.generation_config.eos_token_id
        eos_ids = set(eos_ids if isinstance(eos_ids, list) else [eos_ids])
        end_think = tokenizer.convert_tokens_to_ids("</think>")
        begin_think = tokenizer.convert_tokens_to_ids("<think>")
        finish = "length"
        inference_start = time.perf_counter()
        if self.device == "cuda":
            torch.cuda.reset_peak_memory_stats()

        def make_hook(layer):
            def capture(module, args, result):
                hidden = result[0] if isinstance(result, tuple) else result
                snapshots[layer] = {"layer": layer, **summarize_vector(hidden[0, -1])}
            return capture

        try:
            for layer in self.layer_ids:
                hooks.append(model.model.layers[layer].register_forward_hook(make_hook(layer)))
            with torch.inference_mode():
                for step in range(req.max_tokens):
                    if stop.is_set():
                        return
                    snapshots.clear()
                    tick = time.perf_counter()
                    outputs = model(input_ids=current, attention_mask=mask, past_key_values=past,
                                    use_cache=True, output_attentions=req.attention, return_dict=True)
                    logits = outputs.logits[0, -1].float()
                    if not torch.isfinite(logits).all():
                        raise ValueError("Logits não finitos; revise a precisão ou teste em CPU.")
                    # Probabilidades brutas antes da temperatura; identificadas assim na interface.
                    probs = torch.softmax(logits, dim=-1)
                    top_p, top_id = probs.topk(5)
                    if req.temperature == 0:
                        next_id = int(logits.argmax())
                    else:
                        sample_probs = torch.softmax(logits / req.temperature, dim=-1)
                        next_id = int(torch.multinomial(sample_probs, 1, generator=generator))
                    attention = None
                    if req.attention:
                        matrix = outputs.attentions[req.attention_layer]
                        if matrix is None:
                            raise ValueError("O backend não devolveu atenção. A implementação eager é necessária.")
                        weights = matrix[0, req.attention_head, -1].detach().float().cpu()
                        positions = weights.topk(min(12, weights.numel())).indices.tolist()
                        attention = {
                            "layer": req.attention_layer, "head": req.attention_head,
                            "query_position": len(context) - 1,
                            "query_token": self.token_info(context[-1], len(context)-1),
                            "keys_total": len(context),
                            "top": [{**self.token_info(context[p], p), "weight": float(weights[p])}
                                    for p in positions],
                            "remaining_mass": max(0.0, 1.0 - float(weights[positions].sum())),
                        }
                    output_ids.append(next_id)
                    # A captura é da posição que PREDIZ next_id, não uma ativação de next_id.
                    packet = {
                        "type": "step", "step": step, "phase": phase,
                        "input_position": len(context)-1,
                        "input_token": self.token_info(context[-1], len(context)-1),
                        "chosen": self.token_info(next_id, len(context)),
                        "chosen_probability": float(probs[next_id].cpu()),
                        "layers": [snapshots[i] for i in self.layer_ids],
                        "attention": attention,
                        "top": [{"token": tokenizer.convert_ids_to_tokens(i),
                                 "id": i, "probability": p}
                                for i, p in zip(top_id.cpu().tolist(), top_p.cpu().tolist())],
                        "text": tokenizer.decode(output_ids, skip_special_tokens=True),
                        "step_ms": round((time.perf_counter()-tick)*1000, 2),
                    }
                    yield packet
                    if stop.is_set():
                        return
                    if next_id in eos_ids:
                        finish = "eos"
                        break
                    if next_id == end_think:
                        phase = "answer"
                    elif next_id == begin_think:
                        phase = "thinking"
                    context.append(next_id)
                    past = outputs.past_key_values
                    current = torch.tensor([[next_id]], device=self.device)
                    mask = torch.cat([mask, mask.new_ones((1, 1))], dim=1)
                    del outputs, probs, logits
        finally:
            for hook in hooks:
                hook.remove()
        yield {"type": "done", "reason": finish, "generated_tokens": len(output_ids),
               "elapsed_ms": round((time.perf_counter()-start)*1000),
               "instrumented_ms": round((time.perf_counter()-inference_start)*1000),
               "peak_vram_mib": (round(torch.cuda.max_memory_allocated()/1024**2, 1)
                                 if self.device == "cuda" else None)}

    def token_info(self, token_id: int, position: int):
        return {"id": token_id, "position": position,
                "token": self.tokenizer.convert_ids_to_tokens(token_id)}
