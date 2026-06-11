// Hardware presets + best-effort browser auto-detection.
import { metalBudget } from "./calc.js";

export const HARDWARE = {
  nvidia: [
    { id: "rtx-3060",   name: "RTX 3060",        vram: 12 },
    { id: "rtx-4060ti", name: "RTX 4060 Ti 16G", vram: 16 },
    { id: "rtx-4070",   name: "RTX 4070",        vram: 12 },
    { id: "rtx-4080",   name: "RTX 4080",        vram: 16 },
    { id: "rtx-3090",   name: "RTX 3090",        vram: 24 },
    { id: "rtx-4090",   name: "RTX 4090",        vram: 24 },
    { id: "rtx-5090",   name: "RTX 5090",        vram: 32 },
    { id: "a100-40",    name: "A100 40GB",       vram: 40 },
    { id: "a100-80",    name: "A100 80GB",       vram: 80 },
    { id: "h100",       name: "H100 80GB",       vram: 80 },
  ],
  // Apple unified memory: usable GPU budget derives from the macOS wired
  // limit (2/3 below 36 GB, 3/4 from 36 GB up) — computed, not hardcoded.
  apple: [
    { id: "m2-8",      name: "M2 · 8GB",         unified: 8 },
    { id: "m2-16",     name: "M2 · 16GB",        unified: 16 },
    { id: "m3pro-18",  name: "M3 Pro · 18GB",    unified: 18 },
    { id: "m3max-36",  name: "M3 Max · 36GB",    unified: 36 },
    { id: "m4max-48",  name: "M4 Max · 48GB",    unified: 48 },
    { id: "m4max-128", name: "M4 Max · 128GB",   unified: 128 },
    { id: "ultra-192", name: "M2 Ultra · 192GB", unified: 192 },
  ].map((p) => ({ ...p, vram: metalBudget(p.unified) })),
  amd: [
    { id: "rx-7800", name: "RX 7800 XT",        vram: 16 },
    { id: "rx-7900", name: "RX 7900 XTX",       vram: 24 },
    { id: "w7900",   name: "Radeon Pro W7900",  vram: 48 },
  ],
};

export function defaultHw() {
  return { type: "gpu", name: "RTX 4090", vram: 24, ram: 32, freeRam: null };
}

export function matchGpu(renderer) {
  if (!renderer) return null;
  const r = renderer.toLowerCase();
  const all = [
    ...HARDWARE.nvidia.map((g) => ({ ...g, vendor: "nvidia" })),
    ...HARDWARE.amd.map((g) => ({ ...g, vendor: "amd" })),
  ];
  const frags = [
    ["5090", "rtx-5090"], ["4090", "rtx-4090"], ["4080", "rtx-4080"],
    ["4070", "rtx-4070"], ["4060", "rtx-4060ti"], ["3090", "rtx-3090"],
    ["3060", "rtx-3060"], ["a100", "a100-80"], ["h100", "h100"],
    ["7900 xtx", "rx-7900"], ["7800", "rx-7800"],
  ];
  for (const [frag, id] of frags) {
    if (r.includes(frag)) return all.find((g) => g.id === id) || null;
  }
  return null;
}

// Best-effort detection — honest about what browsers can't see.
export async function autoDetect() {
  const out = {
    ramGB: null, cores: null, gpuName: null, gpuMatch: null,
    isApple: false, appleChip: null, notes: [],
  };
  if (typeof navigator !== "undefined" && navigator.deviceMemory) {
    out.ramGB = navigator.deviceMemory;
    if (navigator.deviceMemory >= 8) out.notes.push("Browser caps RAM reporting at 8GB — you likely have more.");
  } else {
    out.notes.push("This browser doesn't expose RAM size.");
  }
  out.cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || null;

  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const plat = (typeof navigator !== "undefined" && (navigator.userAgentData?.platform || navigator.platform)) || "";
  const isMac = /mac/i.test(plat) || /mac os/i.test(ua);

  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const rend = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      if (rend) {
        out.gpuName = rend;
        if (/apple/i.test(rend) && isMac) {
          out.isApple = true;
          const m = rend.match(/apple\s*(m\d[\w\s]*)/i);
          out.appleChip = m ? m[1].trim() : "Apple Silicon";
        } else {
          out.gpuMatch = matchGpu(rend);
        }
      } else {
        out.notes.push("GPU name is masked by this browser.");
      }
    }
  } catch {
    out.notes.push("WebGL is unavailable — can't read the GPU.");
  }

  if (isMac && !out.isApple) { out.isApple = true; out.appleChip = "Apple Silicon"; }
  out.notes.push("Browsers can't read GPU VRAM directly — confirm the numbers below.");
  return out;
}
