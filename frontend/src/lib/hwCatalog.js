// ============================================================================
// Hardware catalog — recent GPUs (NVIDIA / AMD / Intel) + Apple Silicon matrix.
// vram in GB. category: consumer | workstation | datacenter.
// Unified-memory systems (DGX Spark, Strix Halo APU) are listed as single
// big-memory entries — their shared memory acts as the model budget.
// ============================================================================

const nvidia = [
  // GeForce RTX 50 (Blackwell)
  { name: "RTX 5090", vram: 32, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  { name: "RTX 5080", vram: 16, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  { name: "RTX 5070 Ti", vram: 16, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  { name: "RTX 5070", vram: 12, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  { name: "RTX 5060 Ti 16GB", vram: 16, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  { name: "RTX 5060 Ti 8GB", vram: 8, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  { name: "RTX 5060", vram: 8, series: "GeForce RTX 50", category: "consumer", year: 2025 },
  // GeForce RTX 40 (Ada)
  { name: "RTX 4090", vram: 24, series: "GeForce RTX 40", category: "consumer", year: 2022 },
  { name: "RTX 4080 Super", vram: 16, series: "GeForce RTX 40", category: "consumer", year: 2024 },
  { name: "RTX 4080", vram: 16, series: "GeForce RTX 40", category: "consumer", year: 2022 },
  { name: "RTX 4070 Ti Super", vram: 16, series: "GeForce RTX 40", category: "consumer", year: 2024 },
  { name: "RTX 4070 Ti", vram: 12, series: "GeForce RTX 40", category: "consumer", year: 2023 },
  { name: "RTX 4070 Super", vram: 12, series: "GeForce RTX 40", category: "consumer", year: 2024 },
  { name: "RTX 4070", vram: 12, series: "GeForce RTX 40", category: "consumer", year: 2023 },
  { name: "RTX 4060 Ti 16GB", vram: 16, series: "GeForce RTX 40", category: "consumer", year: 2023 },
  { name: "RTX 4060 Ti 8GB", vram: 8, series: "GeForce RTX 40", category: "consumer", year: 2023 },
  { name: "RTX 4060", vram: 8, series: "GeForce RTX 40", category: "consumer", year: 2023 },
  // GeForce RTX 30 (Ampere)
  { name: "RTX 3090 Ti", vram: 24, series: "GeForce RTX 30", category: "consumer", year: 2022 },
  { name: "RTX 3090", vram: 24, series: "GeForce RTX 30", category: "consumer", year: 2020 },
  { name: "RTX 3080 Ti", vram: 12, series: "GeForce RTX 30", category: "consumer", year: 2021 },
  { name: "RTX 3080 12GB", vram: 12, series: "GeForce RTX 30", category: "consumer", year: 2022 },
  { name: "RTX 3080", vram: 10, series: "GeForce RTX 30", category: "consumer", year: 2020 },
  { name: "RTX 3070 Ti", vram: 8, series: "GeForce RTX 30", category: "consumer", year: 2021 },
  { name: "RTX 3070", vram: 8, series: "GeForce RTX 30", category: "consumer", year: 2020 },
  { name: "RTX 3060 Ti", vram: 8, series: "GeForce RTX 30", category: "consumer", year: 2020 },
  { name: "RTX 3060 12GB", vram: 12, series: "GeForce RTX 30", category: "consumer", year: 2021 },
  // RTX PRO Blackwell + Ada + Ampere (workstation)
  { name: "RTX PRO 6000 Blackwell", vram: 96, series: "RTX PRO / Workstation", category: "workstation", year: 2025 },
  { name: "RTX PRO 5000 Blackwell", vram: 48, series: "RTX PRO / Workstation", category: "workstation", year: 2025 },
  { name: "RTX PRO 4500 Blackwell", vram: 32, series: "RTX PRO / Workstation", category: "workstation", year: 2025 },
  { name: "RTX PRO 4000 Blackwell", vram: 24, series: "RTX PRO / Workstation", category: "workstation", year: 2025 },
  { name: "RTX 6000 Ada", vram: 48, series: "RTX PRO / Workstation", category: "workstation", year: 2022 },
  { name: "RTX 5000 Ada", vram: 32, series: "RTX PRO / Workstation", category: "workstation", year: 2023 },
  { name: "RTX 4500 Ada", vram: 24, series: "RTX PRO / Workstation", category: "workstation", year: 2023 },
  { name: "RTX 4000 Ada", vram: 20, series: "RTX PRO / Workstation", category: "workstation", year: 2023 },
  { name: "RTX 2000 Ada", vram: 16, series: "RTX PRO / Workstation", category: "workstation", year: 2024 },
  { name: "RTX A6000", vram: 48, series: "RTX PRO / Workstation", category: "workstation", year: 2020 },
  { name: "RTX A5000", vram: 24, series: "RTX PRO / Workstation", category: "workstation", year: 2021 },
  { name: "RTX A4500", vram: 20, series: "RTX PRO / Workstation", category: "workstation", year: 2021 },
  { name: "RTX A4000", vram: 16, series: "RTX PRO / Workstation", category: "workstation", year: 2021 },
  // Datacenter
  { name: "B200", vram: 192, series: "Datacenter", category: "datacenter", year: 2025 },
  { name: "GB200 (per GPU)", vram: 192, series: "Datacenter", category: "datacenter", year: 2025 },
  { name: "H200", vram: 141, series: "Datacenter", category: "datacenter", year: 2024 },
  { name: "GH200 144GB", vram: 144, series: "Datacenter", category: "datacenter", year: 2023 },
  { name: "H100 80GB", vram: 80, series: "Datacenter", category: "datacenter", year: 2022 },
  { name: "H100 NVL 94GB", vram: 94, series: "Datacenter", category: "datacenter", year: 2023 },
  { name: "A100 80GB", vram: 80, series: "Datacenter", category: "datacenter", year: 2020 },
  { name: "A100 40GB", vram: 40, series: "Datacenter", category: "datacenter", year: 2020 },
  { name: "L40S", vram: 48, series: "Datacenter", category: "datacenter", year: 2023 },
  { name: "L40", vram: 48, series: "Datacenter", category: "datacenter", year: 2022 },
  { name: "L4", vram: 24, series: "Datacenter", category: "datacenter", year: 2023 },
  { name: "A40", vram: 48, series: "Datacenter", category: "datacenter", year: 2020 },
  { name: "A30", vram: 24, series: "Datacenter", category: "datacenter", year: 2021 },
  { name: "A10", vram: 24, series: "Datacenter", category: "datacenter", year: 2021 },
  { name: "V100 32GB", vram: 32, series: "Datacenter", category: "datacenter", year: 2018 },
  // Grace-Blackwell desktop (unified memory — a whole system, not a card)
  { name: "DGX Spark", vram: 128, series: "DGX / Unified", category: "workstation", year: 2025, unified: true },
  { name: "DGX Station (GB300)", vram: 288, series: "DGX / Unified", category: "datacenter", year: 2025, unified: true },
].map((g) => ({ ...g, vendor: "nvidia" }));

const amd = [
  // RX 9000 (RDNA4)
  { name: "RX 9070 XT", vram: 16, series: "Radeon RX 9000", category: "consumer", year: 2025 },
  { name: "RX 9070", vram: 16, series: "Radeon RX 9000", category: "consumer", year: 2025 },
  { name: "RX 9060 XT 16GB", vram: 16, series: "Radeon RX 9000", category: "consumer", year: 2025 },
  { name: "RX 9060 XT 8GB", vram: 8, series: "Radeon RX 9000", category: "consumer", year: 2025 },
  // RX 7000 (RDNA3)
  { name: "RX 7900 XTX", vram: 24, series: "Radeon RX 7000", category: "consumer", year: 2022 },
  { name: "RX 7900 XT", vram: 20, series: "Radeon RX 7000", category: "consumer", year: 2022 },
  { name: "RX 7900 GRE", vram: 16, series: "Radeon RX 7000", category: "consumer", year: 2024 },
  { name: "RX 7800 XT", vram: 16, series: "Radeon RX 7000", category: "consumer", year: 2023 },
  { name: "RX 7700 XT", vram: 12, series: "Radeon RX 7000", category: "consumer", year: 2023 },
  { name: "RX 7600 XT", vram: 16, series: "Radeon RX 7000", category: "consumer", year: 2024 },
  { name: "RX 7600", vram: 8, series: "Radeon RX 7000", category: "consumer", year: 2023 },
  // RX 6000 (RDNA2)
  { name: "RX 6950 XT", vram: 16, series: "Radeon RX 6000", category: "consumer", year: 2022 },
  { name: "RX 6900 XT", vram: 16, series: "Radeon RX 6000", category: "consumer", year: 2020 },
  { name: "RX 6800 XT", vram: 16, series: "Radeon RX 6000", category: "consumer", year: 2020 },
  { name: "RX 6800", vram: 16, series: "Radeon RX 6000", category: "consumer", year: 2020 },
  { name: "RX 6750 XT", vram: 12, series: "Radeon RX 6000", category: "consumer", year: 2022 },
  { name: "RX 6700 XT", vram: 12, series: "Radeon RX 6000", category: "consumer", year: 2021 },
  // Ryzen AI Max APU (Strix Halo) — shared memory, configurable GPU allocation
  { name: "Ryzen AI Max+ 395 (128GB)", vram: 96, series: "Ryzen AI Max (APU)", category: "consumer", year: 2025, unified: true },
  { name: "Ryzen AI Max+ 395 (64GB)", vram: 48, series: "Ryzen AI Max (APU)", category: "consumer", year: 2025, unified: true },
  // Workstation
  { name: "Radeon Pro W7900", vram: 48, series: "Radeon Pro", category: "workstation", year: 2023 },
  { name: "Radeon Pro W7800", vram: 32, series: "Radeon Pro", category: "workstation", year: 2023 },
  { name: "Radeon Pro W7700", vram: 16, series: "Radeon Pro", category: "workstation", year: 2023 },
  { name: "Radeon Pro W6800", vram: 32, series: "Radeon Pro", category: "workstation", year: 2021 },
  // Datacenter (Instinct)
  { name: "Instinct MI325X", vram: 256, series: "Instinct", category: "datacenter", year: 2024 },
  { name: "Instinct MI300X", vram: 192, series: "Instinct", category: "datacenter", year: 2023 },
  { name: "Instinct MI250X", vram: 128, series: "Instinct", category: "datacenter", year: 2021 },
  { name: "Instinct MI210", vram: 64, series: "Instinct", category: "datacenter", year: 2022 },
  { name: "Instinct MI100", vram: 32, series: "Instinct", category: "datacenter", year: 2020 },
].map((g) => ({ ...g, vendor: "amd" }));

const intel = [
  // Arc B (Battlemage)
  { name: "Arc B580", vram: 12, series: "Arc B-Series", category: "consumer", year: 2024 },
  { name: "Arc B570", vram: 10, series: "Arc B-Series", category: "consumer", year: 2025 },
  // Arc A (Alchemist)
  { name: "Arc A770 16GB", vram: 16, series: "Arc A-Series", category: "consumer", year: 2022 },
  { name: "Arc A770 8GB", vram: 8, series: "Arc A-Series", category: "consumer", year: 2022 },
  { name: "Arc A750", vram: 8, series: "Arc A-Series", category: "consumer", year: 2022 },
  { name: "Arc A580", vram: 8, series: "Arc A-Series", category: "consumer", year: 2023 },
  { name: "Arc A380", vram: 6, series: "Arc A-Series", category: "consumer", year: 2022 },
  // Workstation
  { name: "Arc Pro B60", vram: 24, series: "Arc Pro", category: "workstation", year: 2025 },
  { name: "Arc Pro A60", vram: 12, series: "Arc Pro", category: "workstation", year: 2023 },
  { name: "Arc Pro A50", vram: 6, series: "Arc Pro", category: "workstation", year: 2023 },
].map((g) => ({ ...g, vendor: "intel" }));

export const GPUS = { nvidia, amd, intel };
export const ALL_GPUS = [...nvidia, ...amd, ...intel];
ALL_GPUS.forEach((g) => { g.id = g.vendor + ":" + g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); });
export const GPU_BY_ID = Object.fromEntries(ALL_GPUS.map((g) => [g.id, g]));

// Apple Silicon: generation -> variants -> the unified-memory options offered.
export const APPLE = {
  generations: [
    { id: "m1", name: "M1", year: 2020, variants: [
      { id: "m1",       name: "M1",       gpu: 8,  ram: [8, 16] },
      { id: "m1-pro",   name: "M1 Pro",   gpu: 16, ram: [16, 32] },
      { id: "m1-max",   name: "M1 Max",   gpu: 32, ram: [32, 64] },
      { id: "m1-ultra", name: "M1 Ultra", gpu: 64, ram: [64, 128] },
    ]},
    { id: "m2", name: "M2", year: 2022, variants: [
      { id: "m2",       name: "M2",       gpu: 10, ram: [8, 16, 24] },
      { id: "m2-pro",   name: "M2 Pro",   gpu: 19, ram: [16, 32] },
      { id: "m2-max",   name: "M2 Max",   gpu: 38, ram: [32, 64, 96] },
      { id: "m2-ultra", name: "M2 Ultra", gpu: 76, ram: [64, 128, 192] },
    ]},
    { id: "m3", name: "M3", year: 2023, variants: [
      { id: "m3",       name: "M3",       gpu: 10, ram: [8, 16, 24] },
      { id: "m3-pro",   name: "M3 Pro",   gpu: 18, ram: [18, 36] },
      { id: "m3-max",   name: "M3 Max",   gpu: 40, ram: [36, 48, 64, 96, 128] },
      { id: "m3-ultra", name: "M3 Ultra", gpu: 80, ram: [96, 256, 512] },
    ]},
    { id: "m4", name: "M4", year: 2024, variants: [
      { id: "m4",       name: "M4",       gpu: 10, ram: [16, 24, 32] },
      { id: "m4-pro",   name: "M4 Pro",   gpu: 20, ram: [24, 48, 64] },
      { id: "m4-max",   name: "M4 Max",   gpu: 40, ram: [36, 48, 64, 128] },
    ]},
    { id: "m5", name: "M5", year: 2025, variants: [
      { id: "m5",       name: "M5",       gpu: 10, ram: [16, 24, 32] },
      { id: "m5-pro",   name: "M5 Pro",   gpu: 20, ram: [24, 48, 64] },
      { id: "m5-max",   name: "M5 Max",   gpu: 40, ram: [48, 64, 128] },
    ]},
  ],
};

export const VENDOR_BADGE = {
  nvidia: { bg: "#76b900", label: "NV" },
  amd:    { bg: "#d11f27", label: "AMD" },
  intel:  { bg: "#0068b5", label: "INT" },
  apple:  { bg: "#6e6e73", label: "" },
};

export const PLATFORMS = [
  { id: "nvidia", name: "NVIDIA", color: "#76b900" },
  { id: "amd",    name: "AMD",    color: "#d11f27" },
  { id: "intel",  name: "Intel",  color: "#0068b5" },
  { id: "apple",  name: "Apple",  color: "#6e6e73" },
  { id: "cpu",    name: "CPU only", color: "#8a8f9c" },
  { id: "manual", name: "Manual",  color: "#a07cff" },
];
