// ============================================================================
// Rig model — the new hardware source of truth — and the bridge that derives
// the legacy `hw` shape so all existing memory math keeps working unchanged.
//
//   rig = {
//     mode: "discrete" | "apple" | "cpu" | "manual",
//     gpus: [{ id, qty }],     // discrete
//     apple: { genId, variantId, variantName, gpu, ram },  // apple
//     vram,                    // manual
//     systemRam,               // discrete/cpu/manual
//     allowOffload,            // discrete/manual — spill into systemRam
//     margin,                  // safety-margin % (also reserves OS/app headroom)
//   }
// ============================================================================

import { GPU_BY_ID, APPLE } from "./hwCatalog.js";
import { capacity, metalBudget } from "./calc.js";

export function defaultRig() {
  return {
    mode: "discrete",
    gpus: [{ id: "nvidia:rtx-4090", qty: 1 }],
    apple: null,
    vram: 24,
    systemRam: 32,
    allowOffload: true,
    margin: 10,
  };
}

// Total raw VRAM across a discrete rig (summed; multi-GPU overhead noted in UI).
export function rigVram(rig) {
  return rig.gpus.reduce((s, it) => s + (GPU_BY_ID[it.id]?.vram || 0) * it.qty, 0);
}

export function gpuCount(rig) {
  return rig.gpus.reduce((s, it) => s + it.qty, 0);
}

// Derive the legacy hw object the calc/verdict/breakdown code expects.
export function rigToHw(rig) {
  const offload = rig.allowOffload !== false;
  if (rig.mode === "apple") {
    return { type: "apple", name: rig.apple?.variantName || "Apple Silicon",
             vram: metalBudget(rig.apple?.ram || 0), ram: rig.apple?.ram || 0, allowOffload: false };
  }
  if (rig.mode === "cpu") {
    return { type: "cpu", name: "CPU only", vram: 0, ram: rig.systemRam, allowOffload: false };
  }
  if (rig.mode === "manual") {
    return { type: "gpu", name: "Custom hardware", vram: rig.vram, ram: rig.systemRam, allowOffload: offload };
  }
  return { type: "gpu", name: rigName(rig), vram: rigVram(rig), ram: rig.systemRam, allowOffload: offload };
}

// Usable-memory headline for display (before the safety margin).
export function rigAvail(rig) {
  return capacity(rigToHw(rig));
}

export function rigName(rig) {
  if (rig.mode === "apple") return rig.apple?.variantName || "Apple Silicon";
  if (rig.mode === "cpu") return "CPU only";
  if (rig.mode === "manual") return "Custom hardware";
  const n = gpuCount(rig);
  if (n === 0) return "No hardware";
  const first = GPU_BY_ID[rig.gpus[0].id];
  if (!first) return `${n} GPU${n !== 1 ? "s" : ""}`;
  return rig.gpus.length === 1
    ? `${rig.gpus[0].qty > 1 ? rig.gpus[0].qty + "× " : ""}${first.name}`
    : `${n} GPUs`;
}

// ---- WebGL-based auto-detect (best effort; honest about masking) ----
export function detectRenderer() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return r || null;
  } catch {
    return null;
  }
}

export function matchRenderer(rend) {
  if (!rend) return null;
  const r = rend.toLowerCase();
  if (/apple/.test(r)) {
    const m = r.match(/apple\s*(m\d)\s*(pro|max|ultra)?/);
    if (m) {
      const genId = m[1];
      const variantId = m[2] ? `${m[1]}-${m[2]}` : m[1];
      const gen = APPLE.generations.find((g) => g.id === genId);
      const variant = gen && gen.variants.find((v) => v.id === variantId);
      if (gen && variant) return { type: "apple", gen, variant };
    }
    return { type: "apple", gen: null, variant: null };
  }
  const hit = Object.values(GPU_BY_ID).find((g) => {
    const num = g.name.toLowerCase().replace(/\s+\d+gb/, "").match(/\d{3,4}/);
    return num && r.includes(num[0]) && (r.includes("rtx") === g.name.toLowerCase().includes("rtx"));
  });
  return hit ? { type: "discrete", gpu: hit } : null;
}
