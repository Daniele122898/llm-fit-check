// ============================================================================
// Memory math. Formulas follow what llama.cpp / Ollama / the NyxKrage
// calculator actually compute:
//
//   total = weights + KV cache + graph buffer + fixed runtime overhead
//
//   weights = params x effective_bpw / 8
//   KV      = 2 x layers x kv_heads x head_dim x bytes x tokens   (GQA-aware)
//             MLA models (DeepSeek): layers x (kv_lora_rank + rope_dim) x ...
//             SWA models (Gemma/Mistral v0.1): windowed layers cache only
//             min(tokens, window)
//   graph   = (ctx/1024 x 2 + 0.75) x attention_heads MiB
//             (NyxKrage's empirical fit of llama.cpp's compute buffer)
//   fixed   = ~0.5 GiB (CUDA context / runtime baseline)
// ============================================================================

import { QUANT_BY_ID, KV_PRECISIONS } from "./quants.js";

export const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const FIXED_OVERHEAD_BYTES = 0.5 * GIB;

export function weightsBytes(paramsB, bpw) {
  return (paramsB * 1e9 * bpw) / 8;
}

export function kvPerTokenBytes(model, kvBytes) {
  if (model.mla) {
    return model.layers * (model.mla.kvLoraRank + model.mla.qkRopeHeadDim) * kvBytes;
  }
  return 2 * model.layers * model.kvHeads * model.headDim * kvBytes;
}

export function kvTotalBytes(model, context, kvBytes) {
  if (!model.mla && model.swa?.window && model.swa.swaLayers > 0) {
    const perLayerToken = 2 * model.kvHeads * model.headDim * kvBytes;
    const globalLayers = Math.max(0, model.layers - model.swa.swaLayers);
    return perLayerToken * (globalLayers * context + model.swa.swaLayers * Math.min(context, model.swa.window));
  }
  return kvPerTokenBytes(model, kvBytes) * context;
}

export function graphBytes(model, context) {
  const heads = model.heads || 32;
  return ((context / 1024) * 2 + 0.75) * heads * MIB;
}

function kvPrecBytes(kvPrecId) {
  return (KV_PRECISIONS.find((k) => k.id === kvPrecId) || KV_PRECISIONS[0]).bytes;
}

// The repo's published GGUF file for one of our quant presets, if any.
// FP16 maps onto whichever full-precision file the repo ships.
export function publishedQuantFile(model, quantId) {
  if (!model.ggufFiles?.length) return null;
  const want = quantId === "FP16" ? ["F16", "BF16", "F32"] : [quantId];
  return model.ggufFiles.find((f) => want.includes(f.quant)) || null;
}

// Full estimate (GiB) for a model at a quant + context. When the repo
// publishes a GGUF file for this quant, its exact size is used for the
// weights (llama.cpp mmaps the file wholesale) instead of bpw math —
// `realWeights` reports which one you got.
export function estimate(model, quantId, context, kvPrecId = "f16") {
  const kvBytes = kvPrecBytes(kvPrecId);
  const ctx = Math.max(0, context);
  const file = publishedQuantFile(model, quantId);
  const w = file ? file.sizeBytes : weightsBytes(model.params, QUANT_BY_ID[quantId].bpw);
  const kv = kvTotalBytes(model, ctx, kvBytes);
  const oh = graphBytes(model, ctx) + FIXED_OVERHEAD_BYTES;
  return {
    weights: w / GIB,
    kv: kv / GIB,
    overhead: oh / GIB,
    total: (w + kv + oh) / GIB,
    kvPerTokenKiB: kvPerTokenBytes(model, kvBytes) / 1024,
    realWeights: !!file,
  };
}

// ============================================================================
// Hardware capacity
// ============================================================================

// macOS caps GPU (wired) allocations via Metal's recommendedMaxWorkingSetSize:
// 2/3 of unified memory below 36 GB, 3/4 at 36 GB and above. Overridable with
// `sudo sysctl iogpu.wired_limit_mb`, but this is the default every runtime
// (Ollama, LM Studio) respects.
export function metalBudget(ramGB) {
  return ramGB >= 36 ? ramGB * 0.75 : ramGB * (2 / 3);
}

// What we can actually load the model into. `freeRam` is the user-declared
// "actually free right now" memory — on unified/CPU systems the OS and open
// apps already hold part of the total, so the effective budget is
// min(theoretical budget, what's really free).
export function capacity(hw) {
  const free = hw.freeRam ?? hw.ram;
  if (hw.type === "apple") return Math.min(metalBudget(hw.ram), free);
  if (hw.type === "cpu") return Math.max(1, Math.min(hw.ram - 2, free));
  return hw.vram;
}

// Spare system RAM a discrete GPU could spill layers into (CPU offload).
// Unified/CPU systems have a single pool — nothing extra to spill into.
// Users can switch offload consideration off entirely (hw.allowOffload).
export function spillCapacity(hw) {
  if (hw.type === "apple" || hw.type === "cpu" || hw.allowOffload === false) return 0;
  const free = hw.freeRam ?? hw.ram ?? 0;
  return Math.max(0, Math.min(hw.ram ?? 0, free));
}

// Verdict levels: fit | tight | offload | no.
// "offload" = too big for the GPU but the remainder fits in free system RAM —
// it runs via llama.cpp-style layer splitting, slowly.
export function verdict(totalGiB, hw, margin = 0.1) {
  const avail = capacity(hw);
  const usable = avail * (1 - margin);
  if (totalGiB <= usable) return { level: "fit", label: "Fits", avail, spill: 0, ratio: totalGiB / avail };
  if (totalGiB <= avail) return { level: "tight", label: "Tight", avail, spill: 0, ratio: totalGiB / avail };
  const spillCap = spillCapacity(hw);
  if (spillCap > 0 && totalGiB <= avail + spillCap) {
    return { level: "offload", label: "Offloads", avail, spill: totalGiB - avail, ratio: totalGiB / avail };
  }
  return { level: "no", label: "Won't fit", avail, spill: 0, ratio: totalGiB / avail };
}

// Highest-quality quant that still fits comfortably at this context.
export function bestQuantThatFits(model, context, hw, margin, kvPrecId, quants) {
  const usable = capacity(hw) * (1 - margin);
  let best = null;
  for (const q of quants) {
    if (estimate(model, q.id, context, kvPrecId).total <= usable) best = q.id;
  }
  return best;
}

// Max context (tokens) at this quant within the comfortable budget.
// Binary search because KV is piecewise-linear once SWA enters the picture.
export function maxContext(model, quantId, hw, margin, kvPrecId) {
  const usable = capacity(hw) * (1 - margin);
  const cap = model.ctxMax || 131072;
  if (estimate(model, quantId, 0, kvPrecId).total > usable) return 0;
  if (estimate(model, quantId, cap, kvPrecId).total <= usable) return cap;
  let lo = 0, hi = cap;
  while (hi - lo > 64) {
    const mid = Math.floor((lo + hi) / 2);
    if (estimate(model, quantId, mid, kvPrecId).total <= usable) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ============================================================================
// Helpers shared with the calculator / URL parsing
// ============================================================================

// Fallback architecture guesses by parameter count (mirrors backend table).
const ARCH_TABLE = [
  [0.8, 24, 14, 2],
  [1.8, 22, 32, 8],
  [4, 28, 24, 8],
  [10, 32, 32, 8],
  [20, 40, 40, 8],
  [40, 48, 40, 8],
  [80, 80, 64, 8],
];

export function estimateArch(paramsB) {
  for (const [cap, layers, heads, kvHeads] of ARCH_TABLE) {
    if (paramsB <= cap) return { layers, heads, kvHeads, headDim: 128 };
  }
  return { layers: 126, heads: 128, kvHeads: 8, headDim: 128 };
}

export function parseParams(str) {
  if (!str) return null;
  const moe = str.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b/i);
  if (moe) return parseInt(moe[1]) * parseFloat(moe[2]) * 0.85;
  const m = str.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  return m ? parseFloat(m[1]) : null;
}

export function isHfUrl(q) {
  return /huggingface\.co\//i.test(q) || /^[\w.-]+\/[\w.-]+$/.test(q.trim());
}

// "https://huggingface.co/Qwen/Qwen2.5-7B/tree/main" -> "Qwen/Qwen2.5-7B"
export function repoFromQuery(q) {
  let repo = q.trim()
    .replace(/^(https?:\/\/)?(www\.)?huggingface\.co\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  repo = repo.split("/tree/")[0].split("/blob/")[0].split("/resolve/")[0];
  const parts = repo.split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2).join("/") : null;
}

// Last step is "256K+": represents running above 256K (computed at 1M;
// per-model math still clamps to each model's real context window).
export const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 1048576];
export const CTX_PLUS_STEP = 1048576;
