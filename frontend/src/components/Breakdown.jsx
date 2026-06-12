import React from "react";
import { Icon, ICONS, HeadroomBar, Stat } from "./primitives.jsx";
import { QUANTS, QUANT_BY_ID } from "../lib/quants.js";
import { estimate, verdict, bestQuantThatFits, maxContext, capacity, GIB } from "../lib/calc.js";
import { fmtGB, fmtGBval, fmtTokens, fmtCtx } from "../lib/format.js";

// Everything a row needs, in one place. Context is clamped to the model's
// max window so we never bill KV cache the model can't use.
export function computeRow(model, s, hw) {
  const ctx = Math.min(s.context, model.ctxMax || s.context);
  const est = estimate(model, s.quantId, ctx, s.kvPrec);
  const v = verdict(est.total, hw, s.margin);
  return { est, v, ctx, ctxClamped: ctx < s.context };
}

export function Breakdown({ model, s, hw, setQuant }) {
  const { est, v, ctx, ctxClamped } = computeRow(model, s, hw);
  const best = bestQuantThatFits(model, ctx, hw, s.margin, s.kvPrec, QUANTS);
  const mctx = maxContext(model, s.quantId, hw, s.margin, s.kvPrec);
  const avail = capacity(hw);
  const quantLabel = QUANT_BY_ID[s.quantId].label;

  return (
    <div className="bd">
      <div className="bd-bar">
        <div className="bd-bar-head">
          <span>
            Memory at {quantLabel} · {fmtCtx(ctx)} ctx{ctxClamped ? " (model max)" : ""}
            {est.realWeights && <span className="real-tag" title="Weights use the exact published file size, not an estimate">real file</span>}
          </span>
          <span className="bd-bar-tot">{fmtGB(est.total)} <i>/ {fmtGBval(avail)} GB</i></span>
        </div>
        <HeadroomBar weights={est.weights} kv={est.kv} overhead={est.overhead} available={avail} usable={avail * (1 - s.margin)} height={16} />
        <div className="bd-legend">
          <span><i style={{ background: "var(--accent)" }} />Weights {fmtGB(est.weights)}</span>
          <span><i style={{ background: "var(--accent-2)" }} />KV cache {fmtGB(est.kv)}</span>
          <span><i style={{ background: "var(--ink-faint)" }} />Overhead {fmtGB(est.overhead)}</span>
        </div>
      </div>

      <div className="bd-stats">
        <Stat label="Max context here" value={mctx > 0 ? fmtTokens(mctx) + " tok" : "won't load"}
          sub={mctx >= (model.ctxMax || Infinity) ? "full window" : mctx > 0 ? "at " + quantLabel : null} accent={mctx > 0} />
        <Stat label="Best quant that fits" value={best ? QUANT_BY_ID[best].label : "none"}
          sub={best ? QUANT_BY_ID[best].quality : "needs more memory"} />
        <Stat label="KV / token" value={est.kvPerTokenKiB.toFixed(0) + " KiB"}
          sub={model.mla ? "MLA — compressed" : model.swa?.window ? `SWA ${fmtCtx(model.swa.window)} window` : model.layers + " layers"} />
        <Stat label="Spills to RAM" value={v.level === "offload" ? "~" + fmtGB(v.spill) : v.level === "no" ? "won't help" : "not needed"}
          sub={v.level === "offload" ? "slow CPU offload" : null} />
      </div>

      <div className="bd-quants">
        <div className="bd-quants-label">Try another quant</div>
        <div className="bd-quants-row">
          {QUANTS.map((q) => {
            const e = estimate(model, q.id, ctx, s.kvPrec);
            const fits = e.total <= avail * (1 - s.margin);
            const tight = !fits && e.total <= avail;
            return (
              <button key={q.id} className={"qbtn" + (s.quantId === q.id ? " on" : "")}
                onClick={() => setQuant(q.id)} title={q.note + (e.realWeights ? " (real file size)" : "")}
                data-umami-event="quant-try" data-umami-event-quant={q.id}>
                <span className="qbtn-lab">{q.label}{e.realWeights ? "*" : ""}</span>
                <span className="qbtn-gb">{fmtGBval(e.total)}</span>
                <span className="qbtn-dot" style={{ background: fits ? "var(--green)" : tight ? "var(--amber)" : "var(--red)" }} />
              </button>
            );
          })}
        </div>
      </div>

      {model.ggufFiles?.length > 0 && (
        <div className="bd-quants">
          <div className="bd-quants-label">Published in this repo — exact file sizes, with KV + overhead at {fmtCtx(ctx)} ctx</div>
          <div className="bd-quants-row">
            {model.ggufFiles.map((f) => {
              const total = f.sizeBytes / GIB + est.kv + est.overhead;
              const fits = total <= avail * (1 - s.margin);
              const tight = !fits && total <= avail;
              return (
                <div key={f.quant} className="qbtn qbtn-static" title={f.path + (f.parts > 1 ? ` (${f.parts} parts)` : "")}>
                  <span className="qbtn-lab">{f.quant}</span>
                  <span className="qbtn-gb">{fmtGBval(total)}</span>
                  <span className="qbtn-dot" style={{ background: fits ? "var(--green)" : tight ? "var(--amber)" : "var(--red)" }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {model.estimated && (
        <div className="bd-est-note"><Icon d={ICONS.tight} size={14} /> Architecture estimated from parameter count — real model may differ.</div>
      )}
      {model.archSource === "gguf" && (
        <div className="bd-arch-note">Architecture read from the GGUF file header{model.archFrom ? ` (${model.archFrom.split("/").pop()})` : ""}.</div>
      )}
      {model.archSource === "base" && model.archFrom && (
        <div className="bd-arch-note">Architecture read from base model {model.archFrom}.</div>
      )}
      {model.moe && (
        <div className="bd-arch-note">Mixture-of-Experts: all {fmtGBval(model.params)}B parameters must be in memory — active experts only affect speed.</div>
      )}

      {model.repo && !model.synthetic ? (
        <a className="bd-link" href={"https://huggingface.co/" + model.repo} target="_blank" rel="noopener noreferrer">
          <Icon d={ICONS.external} size={14} /> View on Hugging Face
        </a>
      ) : null}
    </div>
  );
}
