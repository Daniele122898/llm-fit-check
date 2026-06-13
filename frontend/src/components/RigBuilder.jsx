import React, { useEffect, useMemo, useState } from "react";
import { Icon, ICONS } from "./icons.jsx";
import { GPUS, ALL_GPUS, GPU_BY_ID, APPLE, VENDOR_BADGE, PLATFORMS } from "../lib/hwCatalog.js";
import { metalBudget } from "../lib/calc.js";
import { rigVram, gpuCount, rigAvail, detectRenderer, matchRenderer } from "../lib/rig.js";

const fmtGB = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
const usable = (ram) => Math.round(metalBudget(ram));

// ============================================================================
// Rig rail — the running config + global knobs (offload, system RAM, margin)
// ============================================================================
function RigRail({ rig, set, totalVram, onScan, onUse, scanning, ctaLabel }) {
  const { mode } = rig;
  const isApple = mode === "apple", isCpu = mode === "cpu", isManual = mode === "manual";
  const count = gpuCount(rig);
  const offload = rig.allowOffload !== false;

  const headline = isApple ? usable(rig.apple?.ram || 0) : isCpu ? rig.systemRam : isManual ? rig.vram : totalVram;
  const headlineLabel = isApple || isCpu ? "GB usable" : "GB VRAM";

  const avail = rigAvail(rig);
  const fitsUnder = fmtGB(avail * (1 - rig.margin / 100));

  return (
    <aside className="rig">
      <div className="rig-card">
        <div className="rig-top">
          <div className="rig-top-l">
            <Icon d={ICONS.stack} size={17} style={{ color: "var(--accent-text)" }} />
            <span className="rig-label">Your rig</span>
          </div>
          <button className="scan-btn" onClick={onScan} disabled={scanning}>
            <Icon d={ICONS.spark} size={13} />{scanning ? "Scanning…" : "Scan my machine"}
          </button>
        </div>

        <div className="rig-total">
          <div className="rig-total-num mono">{fmtGB(headline)}<small>{headlineLabel}</small></div>
          <div className="rig-total-cap">
            {isApple ? (
              <><b>{rig.apple.variantName}</b><span className="cap-dot" /><span>{rig.apple.ram}GB unified</span></>
            ) : isCpu ? (
              <><b>CPU only</b><span className="cap-dot" /><span>{rig.systemRam}GB system RAM</span></>
            ) : isManual ? (
              <><b>Custom hardware</b><span className="cap-dot" /><span>{rig.systemRam}GB RAM</span></>
            ) : count === 0 ? (
              <span>Nothing added yet</span>
            ) : (
              <><b>{count} GPU{count !== 1 ? "s" : ""}</b>{rig.gpus.length > 1 && <><span className="cap-dot" /><span>{rig.gpus.length} types</span></>}</>
            )}
          </div>
        </div>

        {/* body */}
        {isApple || isManual ? (
          <div className="rig-apple">
            <div className="rig-apple-name">{isApple ? rig.apple.variantName : "Custom hardware"}</div>
            <div className="rig-apple-mem">
              {isApple
                ? `${rig.apple.ram}GB unified · ~${usable(rig.apple.ram)}GB for models`
                : `${rig.vram}GB VRAM · ${rig.systemRam}GB system RAM`}
            </div>
          </div>
        ) : isCpu ? null : count === 0 ? (
          <div className="rig-empty">
            <Icon d={ICONS.chip} size={30} sw={1.4} /><br />
            Add a GPU from the catalog, or pick a Mac / CPU on the right.
          </div>
        ) : (
          <div className="rig-items">
            {rig.gpus.map((item) => {
              const g = GPU_BY_ID[item.id];
              if (!g) return null;
              const vb = VENDOR_BADGE[g.vendor];
              return (
                <div className="rig-item" key={item.id}>
                  <div className="rig-item-ic" style={{ background: vb.bg }}>{vb.label}</div>
                  <div className="rig-item-body">
                    <div className="rig-item-name">{g.name}</div>
                    <div className="rig-item-mem">{g.vram}GB{item.qty > 1 ? ` × ${item.qty} = ${g.vram * item.qty}GB` : ""}</div>
                  </div>
                  <div className="qty">
                    <button onClick={() => set.qty(item.id, -1)} aria-label="Remove one"><Icon d={ICONS.minus} size={14} /></button>
                    <span className="qty-n mono">{item.qty}</span>
                    <button onClick={() => set.qty(item.id, 1)} aria-label="Add one"><Icon d={ICONS.plus} size={14} /></button>
                  </div>
                  <button className="rig-x" onClick={() => set.remove(item.id)} aria-label="Remove"><Icon d={ICONS.no} size={15} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* CPU: system RAM is the capacity */}
        {isCpu && (
          <div className="rig-ram">
            <div className="rig-ram-top"><label>System RAM</label><span className="rig-ram-val">{rig.systemRam} GB</span></div>
            <input type="range" className="slider" min={8} max={1024} step={8} value={rig.systemRam}
              onChange={(e) => set.ram(Number(e.target.value))} />
          </div>
        )}

        {/* discrete + manual: CPU-offload toggle, RAM slider only when enabled */}
        {(mode === "discrete" || isManual) && (
          <div className="rig-offload">
            <label className="rig-toggle">
              <span>
                <span className="rig-toggle-t">Allow CPU offload</span>
                <span className="rig-toggle-d">Spill layers too big for VRAM into system RAM — runs, but slowly.</span>
              </span>
              <input type="checkbox" checked={offload} onChange={(e) => set.offload(e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
            {offload && (
              <div className="rig-ram bare">
                <div className="rig-ram-top"><label>System RAM</label><span className="rig-ram-val">{rig.systemRam} GB</span></div>
                <input type="range" className="slider" min={8} max={1024} step={8} value={rig.systemRam}
                  onChange={(e) => set.ram(Number(e.target.value))} />
              </div>
            )}
          </div>
        )}

        {/* safety margin — also reserves OS / app / free-RAM headroom */}
        <div className="rig-margin">
          <div className="rig-ram-top">
            <label>Safety margin</label>
            <span className="rig-ram-val mono">{rig.margin}%</span>
          </div>
          <input type="range" className="slider" min={0} max={100} step={1} value={rig.margin}
            onChange={(e) => set.margin(Number(e.target.value))} />
          <p className="rig-margin-note">
            Headroom kept free for your OS, background apps and a safety buffer — also how much
            {isApple ? " unified memory" : isCpu ? " RAM" : " memory"} the rest of your system holds onto.
            <b> “Fits” ≤ {fitsUnder} GB</b> of {fmtGB(avail)} GB; the rest is “Tight”.
          </p>
        </div>
      </div>

      {mode === "discrete" && count > 1 && (
        <div className="rig-note">
          <Icon d={ICONS.info} size={15} />
          <span>Combined VRAM is summed. Real multi-GPU loses ~5–10% to overhead and needs an engine that shards layers across cards (llama.cpp, vLLM, exllama).</span>
        </div>
      )}

      <button className="rig-cta" onClick={onUse} disabled={mode === "discrete" && count === 0}>
        <Icon d={ICONS.fit} size={16} sw={2.4} /> {ctaLabel || "Use this rig"}
      </button>
    </aside>
  );
}

// ============================================================================
// GPU catalog
// ============================================================================
function GpuRow({ g, qty, onAdd }) {
  const vb = VENDOR_BADGE[g.vendor];
  return (
    <div className="gpu">
      <div className="gpu-badge" style={{ background: vb.bg }}>{vb.label}</div>
      <div className="gpu-body">
        <div className="gpu-name">
          {g.name}
          {g.category === "workstation" && <span className="pro-tag">Pro</span>}
          {g.category === "datacenter" && <span className="dc-tag">DC</span>}
          {g.unified && <span className="uni-tag">Unified</span>}
        </div>
        <div className="gpu-tags"><span>{g.series}</span><span className="cap-dot" /><span className="mono">{g.year}</span></div>
      </div>
      <div className="gpu-vram mono">{g.vram}GB</div>
      <button className={"gpu-add" + (qty > 0 ? " added" : "")} onClick={() => onAdd(g.id)}>
        {qty > 0 ? <><Icon d={ICONS.fit} size={13} sw={2.4} />{qty} added</> : <><Icon d={ICONS.plus} size={13} sw={2.4} />Add</>}
      </button>
    </div>
  );
}

function GpuCatalog({ vendor, query, category, setCategory, qtyById, onAdd }) {
  const source = query.trim() ? ALL_GPUS : GPUS[vendor];

  const filtered = useMemo(() => {
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      const qNum = q.match(/^(\d+)\s*gb?$/) || q.match(/^(\d+)$/);
      const qCompact = q.replace(/\s+/g, "");
      return source.filter((g) =>
        g.name.toLowerCase().includes(q) ||
        g.series.toLowerCase().includes(q) ||
        g.vendor.includes(q) ||
        (qNum && g.vram === +qNum[1]) ||
        (g.vram + "gb").includes(qCompact));
    }
    return category === "all" ? source : source.filter((g) => g.category === category);
  }, [source, query, category]);

  const counts = useMemo(() => {
    const base = GPUS[vendor];
    return {
      all: base.length,
      consumer: base.filter((g) => g.category === "consumer").length,
      workstation: base.filter((g) => g.category === "workstation").length,
      datacenter: base.filter((g) => g.category === "datacenter").length,
    };
  }, [vendor]);

  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach((g) => { if (!m.has(g.series)) m.set(g.series, []); m.get(g.series).push(g); });
    return [...m.entries()];
  }, [filtered]);

  return (
    <div>
      {!query.trim() && (
        <div className="cat-filters">
          {[["all", "All"], ["consumer", "Consumer"], ["workstation", "Workstation"], ["datacenter", "Datacenter"]]
            .filter(([id]) => id === "all" || counts[id] > 0)
            .map(([id, lab]) => (
              <button key={id} className={"fchip" + (category === id ? " on" : "")} onClick={() => setCategory(id)}>
                {lab}<span className="fchip-count">{counts[id]}</span>
              </button>
            ))}
        </div>
      )}
      <div className="cat-list">
        {groups.length === 0 ? (
          <div className="cat-empty">No GPUs match “{query}”.</div>
        ) : groups.map(([series, items]) => (
          <div key={series}>
            <div className="cat-group-h">
              {query.trim() && <span className="gpu-badge sm" style={{ background: VENDOR_BADGE[items[0].vendor].bg }}>{VENDOR_BADGE[items[0].vendor].label}</span>}
              {series}<span className="line" />
            </div>
            {items.map((g) => <GpuRow key={g.id} g={g} qty={qtyById[g.id] || 0} onAdd={onAdd} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Apple two-step (gen → variant → unified RAM)
// ============================================================================
function ApplePicker({ rig, onPick }) {
  const cur = rig.mode === "apple" ? rig.apple : null;
  const [genId, setGenId] = useState(cur ? cur.genId : "m4");
  const [varId, setVarId] = useState(cur ? cur.variantId : null);
  const gen = APPLE.generations.find((g) => g.id === genId);
  const variant = gen.variants.find((v) => v.id === varId) || null;

  const commit = (v, ram) => onPick({ genId: gen.id, genName: gen.name, variantId: v.id, variantName: v.name, gpu: v.gpu, ram });

  return (
    <div className="apple-pick">
      <div className="info-note">
        <Icon d={ICONS.info} size={15} />
        <span>A Mac is a complete unified-memory system, so selecting one <b>replaces</b> your rig — you can’t pair it with discrete GPUs.</span>
      </div>
      <div>
        <div className="ap-step"><span className="ap-num">1</span> Chip generation</div>
        <div className="gen-row">
          {APPLE.generations.map((g) => (
            <button key={g.id} className={"gen" + (genId === g.id ? " on" : "")} onClick={() => { setGenId(g.id); setVarId(null); }}>
              <div className="gen-name">{g.name}</div><div className="gen-year mono">{g.year}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="ap-step"><span className="ap-num">2</span> Variant</div>
        <div className="var-row">
          {gen.variants.map((v) => (
            <button key={v.id} className={"varc" + (varId === v.id ? " on" : "")}
              onClick={() => { setVarId(v.id); commit(v, v.ram[v.ram.length - 1]); }}>
              <div className="varc-name">{v.name}</div><div className="varc-gpu mono">{v.gpu}-core GPU</div>
            </button>
          ))}
        </div>
      </div>
      {variant && (
        <div>
          <div className="ap-step"><span className="ap-num">3</span> Unified memory</div>
          <div className="ram-row">
            {variant.ram.map((r) => (
              <button key={r} className={"ramc" + (cur && cur.ram === r && cur.variantId === variant.id ? " on" : "")} onClick={() => commit(variant, r)}>
                <span className="ramc-gb">{r}GB</span><span className="ramc-use">~{usable(r)}GB usable</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CpuPicker() {
  return (
    <div className="side-pick">
      <div className="info-note">
        <Icon d={ICONS.info} size={15} />
        <span>No GPU — the model runs entirely in system RAM on the CPU. Big models fit if you have the memory, but expect single-digit tokens/sec. Set your RAM in the panel on the left.</span>
      </div>
    </div>
  );
}

function ManualPicker({ rig, onPick }) {
  const vram = rig.mode === "manual" ? rig.vram : 24;
  return (
    <div className="side-pick">
      <div className="info-note">
        <Icon d={ICONS.info} size={15} />
        <span>Can’t find your card, or on something custom (eGPU, cloud instance, unreleased GPU)? Enter the VRAM directly — set system RAM and offload on the left.</span>
      </div>
      <div className="man-field">
        <div className="man-field-top">
          <label>GPU VRAM</label>
          <div className="man-input">
            <input type="number" min={1} max={1024} value={vram}
              onChange={(e) => onPick(Math.max(1, Number(e.target.value) || 1))} /><span>GB</span>
          </div>
        </div>
        <input type="range" className="slider" min={2} max={256} step={1} value={Math.min(vram, 256)}
          onChange={(e) => onPick(Number(e.target.value))} />
      </div>
    </div>
  );
}

// ============================================================================
// RigBuilder — rail + catalog. Edits a draft; commits via onUse(draft).
// ============================================================================
export function RigBuilder({ initialRig, onUse, ctaLabel }) {
  const [rig, setRig] = useState(initialRig);
  const [platform, setPlatform] = useState(() =>
    initialRig.mode === "apple" ? "apple"
      : initialRig.mode === "cpu" ? "cpu"
      : initialRig.mode === "manual" ? "manual"
      : (GPU_BY_ID[initialRig.gpus?.[0]?.id]?.vendor || "nvidia"));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState(null);

  const qtyById = useMemo(() => {
    const m = {};
    if (rig.mode === "discrete") rig.gpus.forEach((g) => { m[g.id] = g.qty; });
    return m;
  }, [rig]);
  const totalVram = useMemo(() => (rig.mode === "discrete" ? rigVram(rig) : 0), [rig]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const set = {
    qty: (id, d) => setRig((p) => ({ ...p, gpus: p.gpus.map((g) => g.id === id ? { ...g, qty: g.qty + d } : g).filter((g) => g.qty > 0) })),
    remove: (id) => setRig((p) => ({ ...p, gpus: p.gpus.filter((g) => g.id !== id) })),
    ram: (v) => setRig((p) => ({ ...p, systemRam: v })),
    offload: (v) => setRig((p) => ({ ...p, allowOffload: v })),
    margin: (v) => setRig((p) => ({ ...p, margin: v })),
  };

  const addGpu = (id) => setRig((p) => {
    const base = p.mode === "discrete" ? p : { ...p, mode: "discrete", gpus: [] };
    const existing = base.gpus.find((g) => g.id === id);
    const gpus = existing
      ? base.gpus.map((g) => g.id === id ? { ...g, qty: g.qty + 1 } : g)
      : [...base.gpus, { id, qty: 1 }];
    return { ...base, mode: "discrete", gpus };
  });
  const pickApple = (apple) => setRig((p) => ({ ...p, mode: "apple", apple }));
  const pickManual = (vram) => setRig((p) => ({ ...p, mode: "manual", vram }));
  const goCpu = () => setRig((p) => (p.mode === "cpu" ? p : { ...p, mode: "cpu" }));

  const switchPlatform = (id) => {
    setQuery("");
    setPlatform(id);
    if (id === "cpu") goCpu();
  };

  const scan = () => {
    setScanning(true);
    setTimeout(() => {
      const match = matchRenderer(detectRenderer());
      if (match?.type === "apple" && match.variant) {
        // The browser can't read unified-memory size — default to the smallest
        // option (never over-promise capacity) and ask the user to confirm.
        const v = match.variant, gen = match.gen;
        pickApple({ genId: gen.id, genName: gen.name, variantId: v.id, variantName: v.name, gpu: v.gpu, ram: v.ram[0] });
        setPlatform("apple"); flash(`Detected ${v.name} — set your memory`);
      } else if (match?.type === "apple") { setPlatform("apple"); flash("Apple Silicon — pick your chip");
      } else if (match?.type === "discrete") { addGpu(match.gpu.id); setPlatform(match.gpu.vendor); flash(`Detected ${match.gpu.name}`);
      } else { setPlatform("manual"); flash("GPU masked — enter it manually"); }
      setScanning(false);
    }, 700);
  };

  return (
    <div className="hb-grid">
      <RigRail rig={rig} set={set} totalVram={totalVram} onScan={scan} scanning={scanning}
        onUse={() => onUse(rig)} ctaLabel={ctaLabel} />

      <div className="cat">
        <div className="plat-tabs">
          {PLATFORMS.map((p) => (
            <button key={p.id} className={"plat" + (platform === p.id ? " on" : "")} onClick={() => switchPlatform(p.id)}>
              <span className="plat-dot" style={{ background: p.color }} />{p.name}
            </button>
          ))}
        </div>

        {(platform === "nvidia" || platform === "amd" || platform === "intel") && (
          <>
            <div className="cat-search-wrap">
              <div className="cat-search">
                <Icon d={ICONS.search} size={18} style={{ color: "var(--text-faint)" }} />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search any GPU — name or capacity (4090, A6000, 24gb)…" spellCheck={false} />
                {query && <button className="cat-search-clear" onClick={() => setQuery("")}><Icon d={ICONS.no} size={15} /></button>}
              </div>
            </div>
            <GpuCatalog vendor={platform} query={query} category={category} setCategory={setCategory} qtyById={qtyById} onAdd={addGpu} />
          </>
        )}
        {platform === "apple" && <ApplePicker rig={rig} onPick={pickApple} />}
        {platform === "cpu" && <CpuPicker />}
        {platform === "manual" && <ManualPicker rig={rig} onPick={pickManual} />}
      </div>

      {toast && <div className="rig-toast"><Icon d={ICONS.fit} size={16} sw={2.4} />{toast}</div>}
    </div>
  );
}
