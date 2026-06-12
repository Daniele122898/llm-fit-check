import React, { useEffect, useState } from "react";
import { Icon, ICONS, VerdictChip, HeadroomBar, Segmented, Stat } from "./primitives.jsx";
import { QUANTS, QUANT_BY_ID, KV_PRECISIONS } from "../lib/quants.js";
import { estimate, verdict, maxContext, capacity, estimateArch, CTX_STEPS } from "../lib/calc.js";
import { fmtGB, fmtGBval, fmtTokens, fmtCtxStep } from "../lib/format.js";

function MiniNum({ label, value, onChange, disabled, min = 1, max = 512 }) {
  return (
    <div className={"mininum" + (disabled ? " off" : "")}>
      <label>{label}</label>
      <input type="number" value={value} disabled={disabled} min={min} max={max}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))} />
    </div>
  );
}

export function CalcView({ hw, defaultQuant, margin }) {
  const [params, setParams] = useState(8);
  const [quantId, setQuantId] = useState(defaultQuant || "Q4_K_M");
  const [ctxIdx, setCtxIdx] = useState(2); // 8192
  const [kvPrec, setKvPrec] = useState("f16");
  const [advanced, setAdvanced] = useState(false);
  const initialArch = estimateArch(8);
  const [layers, setLayers] = useState(initialArch.layers);
  const [heads, setHeads] = useState(initialArch.heads);
  const [kvHeads, setKvHeads] = useState(initialArch.kvHeads);
  const [headDim, setHeadDim] = useState(initialArch.headDim);
  const [autoArch, setAutoArch] = useState(true);
  const [activeParams, setActiveParams] = useState(0); // 0 = dense

  // keep arch synced to params unless the user overrode it
  useEffect(() => {
    if (autoArch) {
      const a = estimateArch(params);
      setLayers(a.layers); setHeads(a.heads); setKvHeads(a.kvHeads); setHeadDim(a.headDim);
    }
  }, [params, autoArch]);

  const context = CTX_STEPS[ctxIdx];
  // Custom model: no known window, so allow the full slider range.
  const model = { params, layers, heads, kvHeads, headDim, ctxMax: CTX_STEPS[CTX_STEPS.length - 1], name: "custom" };
  const est = estimate(model, quantId, context, kvPrec);
  const v = verdict(est.total, hw, margin);
  const mctx = maxContext(model, quantId, hw, margin, kvPrec);
  const avail = capacity(hw);

  return (
    <div className="calc">
      <div className="calc-grid">
        {/* inputs */}
        <div className="calc-inputs">
          <div className="ci-block">
            <div className="ci-top">
              <label>Parameters</label>
              <div className="ci-num"><input type="number" value={params} min={0.1} max={1000} step={0.1}
                onChange={(e) => setParams(Math.max(0.1, Number(e.target.value) || 0.1))} /><span>B</span></div>
            </div>
            <input type="range" className="slider" min={0.5} max={180} step={0.5} value={Math.min(params, 180)}
              onChange={(e) => setParams(Number(e.target.value))} />
            <div className="ci-presets">
              {[1, 3, 7, 8, 14, 32, 70, 405].map((p) => (
                <button key={p} className={"pchip" + (params === p ? " on" : "")} onClick={() => setParams(p)}>{p}B</button>
              ))}
            </div>
          </div>

          <div className="ci-block">
            <label className="ci-lab">Quantization</label>
            <Segmented size="sm" value={quantId} onChange={setQuantId} options={QUANTS.map((q) => ({ id: q.id, label: q.label }))} />
            <div className="ci-quant-note">
              <b>{QUANT_BY_ID[quantId].quality}.</b> {QUANT_BY_ID[quantId].note}
            </div>
          </div>

          <div className="ci-block">
            <div className="ci-top">
              <label>Context length</label>
              <span className="mono ci-ctx">{fmtCtxStep(context)}{context >= 1048576 ? "" : " tokens"}</span>
            </div>
            <input type="range" className="slider" min={0} max={CTX_STEPS.length - 1} step={1} value={ctxIdx}
              onChange={(e) => setCtxIdx(Number(e.target.value))} />
            <div className="ci-scale">{CTX_STEPS.map((c, i) => <span key={c} className={i === ctxIdx ? "on" : ""}>{fmtCtxStep(c)}</span>)}</div>
          </div>

          <button className="adv-toggle" onClick={() => setAdvanced(!advanced)}>
            <Icon d={ICONS.chevron} size={15} style={{ transform: advanced ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            Advanced — KV cache, architecture & MoE
          </button>
          {advanced && (
            <div className="adv-block">
              <div className="adv-row">
                <label>KV cache precision</label>
                <Segmented size="sm" value={kvPrec} onChange={setKvPrec} options={KV_PRECISIONS.map((k) => ({ id: k.id, label: k.label }))} />
              </div>
              <div className="adv-row">
                <label>Active params (MoE)</label>
                <div className="ci-num sm"><input type="number" value={activeParams} min={0} max={params} step={0.1}
                  onChange={(e) => setActiveParams(Math.max(0, Math.min(params, Number(e.target.value) || 0)))} /><span>B</span></div>
              </div>
              <label className="chk adv-auto">
                <input type="checkbox" checked={autoArch} onChange={(e) => setAutoArch(e.target.checked)} />
                <span>Estimate architecture from parameter count</span>
              </label>
              <div className="adv-arch" data-locked={autoArch}>
                <MiniNum label="Layers" value={layers} onChange={(v2) => { setAutoArch(false); setLayers(v2); }} disabled={autoArch} />
                <MiniNum label="Heads" value={heads} onChange={(v2) => { setAutoArch(false); setHeads(v2); }} disabled={autoArch} />
                <MiniNum label="KV heads" value={kvHeads} onChange={(v2) => { setAutoArch(false); setKvHeads(v2); }} disabled={autoArch} />
                <MiniNum label="Head dim" value={headDim} onChange={(v2) => { setAutoArch(false); setHeadDim(v2); }} disabled={autoArch} />
              </div>
            </div>
          )}
        </div>

        {/* output */}
        <div className="calc-output">
          <div className="co-verdict" data-level={v.level}>
            <VerdictChip level={v.level} label={v.label} />
            <div className="co-total">
              <span className="co-total-num mono">{fmtGBval(est.total)}</span>
              <span className="co-total-unit">GB needed</span>
            </div>
            <div className="co-against">on your <b>{hw.name}</b> · {fmtGBval(avail)} GB {hw.type === "apple" ? "usable unified" : hw.type === "cpu" ? "usable RAM" : "VRAM"}</div>
          </div>

          <div className="co-bar">
            <HeadroomBar weights={est.weights} kv={est.kv} overhead={est.overhead} available={avail} usable={avail * (1 - margin)} height={18} />
            <div className="bd-legend">
              <span><i style={{ background: "var(--accent)" }} />Weights {fmtGB(est.weights)}</span>
              <span><i style={{ background: "var(--accent-2)" }} />KV cache {fmtGB(est.kv)}</span>
              <span><i style={{ background: "var(--ink-faint)" }} />Overhead {fmtGB(est.overhead)}</span>
            </div>
          </div>

          <div className="co-stats">
            <Stat label="Weights" value={fmtGB(est.weights)} sub={QUANT_BY_ID[quantId].label} />
            <Stat label="KV cache" value={fmtGB(est.kv)} sub={est.kvPerTokenKiB.toFixed(0) + " KiB/tok"} />
            <Stat label="Overhead" value={fmtGB(est.overhead)} sub="compute buffers" />
            <Stat label="Headroom" value={fmtGB(Math.max(0, avail - est.total))} sub={v.level === "no" || v.level === "offload" ? "over budget" : "free"} accent={v.level === "fit" || v.level === "tight"} />
          </div>

          <div className="co-foot">
            <div className="co-foot-item">
              <Icon d={ICONS.bolt} size={15} style={{ color: "var(--accent-text)" }} />
              <span>Max context at {QUANT_BY_ID[quantId].label}: <b>{mctx > 0 ? fmtTokens(mctx) + " tokens" : "won't load"}</b></span>
            </div>
            {activeParams > 0 && activeParams < params && (
              <div className="co-foot-item">
                <Icon d={ICONS.spark} size={15} />
                <span>MoE: all <b>{params}B</b> must be in memory — ~<b>{activeParams}B</b> active per token only makes it <i>faster</i>, not smaller.</span>
              </div>
            )}
            {v.level === "offload" && (
              <div className="co-foot-item">
                <Icon d={ICONS.cpu} size={15} />
                <span>~{fmtGB(v.spill)} would spill into system RAM — it runs, but expect a steep slowdown.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
