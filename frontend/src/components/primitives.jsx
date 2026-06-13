import React from "react";
import { Icon, ICONS } from "./icons.jsx";
import { fmtGB, fmtGBval } from "../lib/format.js";

// ---- verdict chip: fit | tight | offload | no ----
export function VerdictChip({ level, label, compact }) {
  const map = {
    fit:     { c: "var(--green)",  bg: "var(--green-bg)" },
    tight:   { c: "var(--amber)",  bg: "var(--amber-bg)" },
    offload: { c: "var(--orange)", bg: "var(--orange-bg)" },
    no:      { c: "var(--red)",    bg: "var(--red-bg)" },
  };
  const m = map[level] || map.no;
  return (
    <span className="vchip" style={{ color: m.c, background: m.bg }}>
      <span className="vdot" style={{ background: m.c }} />
      {!compact && label}
    </span>
  );
}

// ---- headroom bar: segmented usage against an available-capacity line ----
// Pass `usable` (= available x (1 - safety margin)) to also draw the amber
// fits-under threshold the verdicts use.
export function HeadroomBar({ weights, kv, overhead, available, usable, height = 10, showCap = true }) {
  const total = weights + kv + overhead;
  const max = Math.max(total, available) * 1.04;
  const pct = (v) => (v / max) * 100;
  const over = total > available;
  return (
    <div className="hbar" style={{ height }}>
      <div className="hbar-seg" style={{ width: pct(weights) + "%", background: "var(--accent)" }} title={"Weights " + fmtGB(weights)} />
      <div className="hbar-seg" style={{ width: pct(kv) + "%", background: "var(--accent-2)" }} title={"KV cache " + fmtGB(kv)} />
      <div className="hbar-seg" style={{ width: pct(overhead) + "%", background: "var(--ink-faint)" }} title={"Overhead " + fmtGB(overhead)} />
      {usable != null && usable < available && usable > 0 && (
        <div className="hbar-margin" style={{ left: pct(usable) + "%" }}
          title={"Safety margin — “Fits” needs ≤ " + fmtGB(usable)} />
      )}
      {showCap && (
        <div className="hbar-cap" style={{ left: pct(available) + "%", background: over ? "var(--red)" : "var(--border-strong)" }}>
          <span className="hbar-cap-label" style={{ color: over ? "var(--red)" : "var(--text-faint)" }}>{fmtGBval(available)}</span>
        </div>
      )}
    </div>
  );
}

// ---- segmented control ----
export function Segmented({ value, options, onChange, size = "md" }) {
  return (
    <div className={"seg seg-" + size} role="tablist">
      {options.map((o) => {
        const val = typeof o === "object" ? o.id : o;
        const lab = typeof o === "object" ? o.label : o;
        return (
          <button key={val} role="tab" aria-selected={value === val}
            className={"seg-btn" + (value === val ? " on" : "")}
            onClick={() => onChange(val)}>{lab}</button>
        );
      })}
    </div>
  );
}

// ---- labeled stat ----
export function Stat({ label, value, sub, accent }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: "var(--accent-text)" } : null}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export { Icon, ICONS };
