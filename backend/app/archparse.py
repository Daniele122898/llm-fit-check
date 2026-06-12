"""Turn a Hugging Face config.json into the architecture fields the
client-side memory math needs.

The KV-cache formula is 2 x layers x kv_heads x head_dim x bytes x tokens
(GQA-aware), with two researched exceptions:
  - MLA (DeepSeek V2/V3/R1): per token per layer the cache holds a single
    latent of (kv_lora_rank + qk_rope_head_dim) elements — ~28x smaller than
    the naive formula would claim.
  - Sliding-window attention (Gemma 2/3, Mistral v0.1): SWA layers only cache
    min(context, window) tokens.
"""


def _swa_layer_count(model_type: str, layers: int, layer_types=None) -> int:
    """How many layers use sliding-window attention."""
    if isinstance(layer_types, list) and layer_types:
        return sum(1 for t in layer_types if "sliding" in str(t))
    if model_type == "gemma2":
        return layers // 2  # 1:1 alternating
    if model_type.startswith("gemma3"):
        return round(layers * 5 / 6)  # 5:1 SWA:global
    return layers  # e.g. Mistral v0.1: every layer


def parse_hf_config(cfg: dict):
    """Return normalized arch fields, or None if the config lacks essentials."""
    if not isinstance(cfg, dict):
        return None
    # Multimodal models nest the LLM under text_config
    c = cfg.get("text_config") or cfg
    model_type = c.get("model_type") or cfg.get("model_type") or ""

    layers = c.get("num_hidden_layers") or c.get("n_layer") or c.get("num_layers")
    heads = c.get("num_attention_heads") or c.get("n_head")
    kv_heads = c.get("num_key_value_heads") or heads  # absent => MHA
    hidden = c.get("hidden_size") or c.get("n_embd")
    # Some models (Gemma family) set head_dim explicitly and it differs from
    # hidden_size / heads — always prefer the explicit key.
    head_dim = c.get("head_dim")
    if not head_dim and hidden and heads:
        head_dim = hidden // heads
    if not (layers and kv_heads and head_dim):
        return None

    out = {
        "layers": int(layers),
        "heads": int(heads) if heads else None,
        "kvHeads": int(kv_heads),
        "headDim": int(head_dim),
        "ctxMax": c.get("max_position_embeddings") or c.get("n_positions"),
        "modelType": model_type,
        "vocab": c.get("vocab_size"),
    }

    # Hybrid SSM/attention models (Qwen3.5, LFM2.5, Qwen3-Next): only the
    # full/sliding-attention layers carry a KV cache; linear-attention /
    # mamba / conv layers hold a small constant state instead.
    layer_types = c.get("layer_types")
    if isinstance(layer_types, list) and layer_types:
        kv_layers = sum(
            1 for t in layer_types
            if str(t) in ("attention", "full_attention") or "sliding" in str(t)
        )
        if 0 < kv_layers < out["layers"]:
            out["kvLayers"] = kv_layers

    if c.get("kv_lora_rank"):
        out["mla"] = {
            "kvLoraRank": int(c["kv_lora_rank"]),
            "qkRopeHeadDim": int(c.get("qk_rope_head_dim") or 64),
        }

    window = c.get("sliding_window")
    # Qwen writes sliding_window but disables it; a window >= the max context
    # is also a no-op — don't report SWA for either.
    swa_disabled = c.get("use_sliding_window") is False
    swa_noop = isinstance(window, int) and out["ctxMax"] and window >= out["ctxMax"]
    if isinstance(window, int) and window > 0 and not swa_disabled and not swa_noop:
        swa_layers = _swa_layer_count(model_type, out["layers"], c.get("layer_types"))
        if swa_layers > 0:
            out["swa"] = {"window": window, "swaLayers": int(swa_layers)}

    out["moe"] = bool(
        c.get("num_local_experts") or c.get("num_experts") or c.get("n_routed_experts")
    )
    return out


def arch_from_gguf(meta: dict):
    """Normalize GGUF header metadata (gguf.parse_gguf_meta output) into the
    same architecture shape parse_hf_config produces. Returns None when the
    essential keys are missing (e.g. the fetched prefix was too small)."""
    arch = meta.get("general.architecture")
    if not arch:
        return None

    def g(key, default=None):
        return meta.get(f"{arch}.{key}", default)

    def as_int(v):
        # per-layer arrays (variable GQA) — size for the worst layer
        if isinstance(v, list):
            v = max((x for x in v if isinstance(x, (int, float))), default=None)
        return int(v) if isinstance(v, (int, float)) and v else None

    layers = as_int(g("block_count"))
    heads = as_int(g("attention.head_count"))
    kv_heads = as_int(g("attention.head_count_kv")) or heads
    head_dim = as_int(g("attention.key_length"))
    emb = as_int(g("embedding_length"))
    if not head_dim and emb and heads:
        head_dim = emb // heads
    if not (layers and kv_heads and head_dim):
        return None

    out = {
        "layers": layers,
        "heads": heads,
        "kvHeads": kv_heads,
        "headDim": head_dim,
        "ctxMax": as_int(g("context_length")),
        "modelType": arch,
    }

    kv_lora_rank = as_int(g("attention.kv_lora_rank"))
    if kv_lora_rank:
        out["mla"] = {
            "kvLoraRank": kv_lora_rank,
            "qkRopeHeadDim": as_int(g("rope.dimension_count")) or 64,
        }

    window = as_int(g("attention.sliding_window"))
    if window and (not out["ctxMax"] or window < out["ctxMax"]):
        swa_layers = _swa_layer_count(arch, layers)
        if swa_layers > 0:
            out["swa"] = {"window": window, "swaLayers": swa_layers}

    out["moe"] = bool(as_int(g("expert_count")))
    return out


# Fallback guesses when no config.json is available (GGUF-only or gated repos):
# (max_params_b, layers, heads, kv_heads), head_dim assumed 128.
ARCH_TABLE = [
    (0.8, 24, 14, 2),
    (1.8, 22, 32, 8),
    (4, 28, 24, 8),
    (10, 32, 32, 8),
    (20, 40, 40, 8),
    (40, 48, 40, 8),
    (80, 80, 64, 8),
]


def estimate_arch(params_b: float) -> dict:
    for cap, layers, heads, kv_heads in ARCH_TABLE:
        if params_b <= cap:
            return {"layers": layers, "heads": heads, "kvHeads": kv_heads, "headDim": 128}
    return {"layers": 126, "heads": 128, "kvHeads": 8, "headDim": 128}
