// GGUF quantization presets. bpw values are *effective* file-level
// bits-per-weight (NyxKrage's table, derived from real GGUF file sizes —
// higher than the theoretical block sizes because _M mixes upgrade
// attn_v/ffn_down/output tensors to Q6_K).
export const QUANTS = [
  { id: "Q2_K",   label: "Q2_K",   bpw: 3.35, quality: "Aggressive",    note: "Smallest. Noticeable quality loss — emergencies only." },
  { id: "Q4_K_M", label: "Q4_K_M", bpw: 4.85, quality: "Balanced",      note: "The default. Best size-to-quality trade for most people." },
  { id: "Q5_K_M", label: "Q5_K_M", bpw: 5.69, quality: "High",          note: "Sharper than Q4 at a modest size bump." },
  { id: "Q6_K",   label: "Q6_K",   bpw: 6.59, quality: "Near-lossless", note: "Almost indistinguishable from full precision." },
  { id: "Q8_0",   label: "Q8_0",   bpw: 8.50, quality: "Lossless-ish",  note: "Effectively full quality at half the FP16 size." },
  { id: "FP16",   label: "FP16",   bpw: 16.0, quality: "Full",          note: "Unquantized weights. What you train / serve at scale." },
];

export const QUANT_BY_ID = Object.fromEntries(QUANTS.map((q) => [q.id, q]));

export const KV_PRECISIONS = [
  { id: "f16", label: "FP16", bytes: 2 },
  { id: "q8",  label: "Q8",   bytes: 1 },
];
