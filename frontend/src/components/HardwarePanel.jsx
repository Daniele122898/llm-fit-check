import React, { useEffect, useState } from "react";
import { Icon, ICONS, Segmented, ManualRow } from "./primitives.jsx";
import { HARDWARE, autoDetect } from "../lib/hardware.js";
import { capacity, metalBudget } from "../lib/calc.js";
import { fmtGBval } from "../lib/format.js";

function hwIcon(type) {
  return type === "apple" ? ICONS.apple : type === "cpu" ? ICONS.cpu : ICONS.chip;
}

function memLabel(type) {
  return type === "apple" ? "usable" : type === "cpu" ? "RAM" : "VRAM";
}

export function HardwareChip({ hw, onClick }) {
  return (
    <button className="hw-chip" onClick={onClick}>
      <span className="hw-chip-ic"><Icon d={hwIcon(hw.type)} size={17} /></span>
      <span className="hw-chip-body">
        <span className="hw-chip-name">{hw.name}</span>
        <span className="hw-chip-mem">{fmtGBval(capacity(hw))} GB {memLabel(hw.type)}</span>
      </span>
      <Icon d={ICONS.chevron} size={15} style={{ color: "var(--text-faint)" }} />
    </button>
  );
}

function DetectBlock({ onApply }) {
  const [state, setState] = useState("idle"); // idle | running | done
  const [res, setRes] = useState(null);

  const run = async () => {
    setState("running");
    await new Promise((r) => setTimeout(r, 650)); // let the scan feel real
    const d = await autoDetect();
    setRes(d);
    setState("done");
  };

  const apply = () => {
    if (!res) return;
    if (res.isApple) {
      const guess = HARDWARE.apple.find((a) => a.unified >= (res.ramGB && res.ramGB > 8 ? res.ramGB : 16)) || HARDWARE.apple[3];
      onApply({ type: "apple", name: res.appleChip || "Apple Silicon", vram: guess.vram, ram: guess.unified, freeRam: null, detected: true });
    } else if (res.gpuMatch) {
      onApply({ type: res.gpuMatch.vendor === "amd" ? "amd" : "gpu", name: res.gpuMatch.name, vram: res.gpuMatch.vram, ram: res.ramGB && res.ramGB >= 8 ? 32 : res.ramGB || 16, freeRam: null, detected: true });
    } else {
      onApply({ type: "cpu", name: "Detected system", vram: 0, ram: res.ramGB || 8, freeRam: null, detected: true });
    }
  };

  return (
    <div className="detect">
      <div className="detect-head">
        <div>
          <div className="detect-title">Auto-detect this machine</div>
          <div className="detect-desc">Reads what your browser will share — GPU name, RAM, platform.</div>
        </div>
        <button className={"btn btn-accent" + (state === "running" ? " busy" : "")} onClick={run} disabled={state === "running"}>
          <Icon d={state === "done" ? ICONS.refresh : ICONS.spark} size={15} />
          {state === "running" ? "Scanning…" : state === "done" ? "Re-scan" : "Scan"}
        </button>
      </div>

      {state === "done" && res && (
        <div className="detect-result">
          <div className="detect-grid">
            <div className="dr-row"><span>GPU</span><b>{res.gpuName || (res.isApple ? (res.appleChip || "Apple GPU") : "Unknown")}</b></div>
            <div className="dr-row"><span>Match</span><b>{res.isApple ? "Apple Silicon" : res.gpuMatch ? res.gpuMatch.name : "no preset match"}</b></div>
            <div className="dr-row"><span>RAM</span><b>{res.ramGB ? res.ramGB + " GB+" : "unknown"}</b></div>
            <div className="dr-row"><span>CPU</span><b>{res.cores ? res.cores + " cores" : "unknown"}</b></div>
          </div>
          {res.notes.length > 0 && (
            <ul className="detect-notes">{res.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
          <button className="btn btn-accent full" onClick={apply}>Use these results →</button>
        </div>
      )}
    </div>
  );
}

function PresetGrid({ vendor, current, onPick }) {
  const list = HARDWARE[vendor === "gpu" ? "nvidia" : vendor] || HARDWARE.nvidia;
  return (
    <div className="preset-grid">
      {list.map((p) => (
        <button key={p.id} className={"preset" + (current.name === p.name || current.name === p.name.split(" · ")[0] ? " on" : "")}
          onClick={() => onPick(vendor, p)}>
          <span className="preset-name">{p.name}</span>
          <span className="preset-mem">{fmtGBval(p.vram)} GB {vendor === "apple" ? "usable" : "VRAM"}</span>
        </button>
      ))}
    </div>
  );
}

export function HardwarePanel({ hw, onChange, onClose, margin, onMargin }) {
  const [mode, setMode] = useState("preset"); // detect | preset | manual
  const [vendor, setVendor] = useState(
    hw.type === "apple" ? "apple" : hw.type === "amd" ? "amd" : hw.type === "cpu" ? "cpu" : "gpu"
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickPreset = (v, p) => {
    if (v === "apple") onChange({ type: "apple", name: p.name.split(" · ")[0], vram: p.vram, ram: p.unified, freeRam: null });
    else onChange({ type: v === "amd" ? "amd" : "gpu", name: p.name, vram: p.vram, ram: hw.ram || 32, freeRam: hw.freeRam ?? null });
  };

  const free = hw.freeRam ?? hw.ram;
  const setFree = (v) => onChange({ ...hw, freeRam: v >= hw.ram ? null : v });

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Your hardware</div>
            <div className="modal-sub">What we check models against.</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon d={ICONS.no} size={18} /></button>
        </div>

        <div className="modal-tabs">
          <Segmented value={mode} onChange={setMode} options={[
            { id: "detect", label: "Auto-detect" }, { id: "preset", label: "Pick a device" }, { id: "manual", label: "Manual" },
          ]} />
        </div>

        <div className="modal-body">
          {mode === "detect" && <DetectBlock onApply={onChange} />}

          {mode === "preset" && (
            <div>
              <div className="vendor-tabs">
                {[["gpu", "NVIDIA"], ["apple", "Apple"], ["amd", "AMD"], ["cpu", "CPU only"]].map(([v, l]) => (
                  <button key={v} className={"vtab" + (vendor === v ? " on" : "")} onClick={() => setVendor(v)}>{l}</button>
                ))}
              </div>
              {vendor === "cpu" ? (
                <div className="cpu-block">
                  <p className="muted-note">No GPU — models run in system RAM on the CPU. Slower, but big models fit if you have the memory.</p>
                  <ManualRow label="System RAM" value={hw.type === "cpu" ? hw.ram : 32} min={4} max={512} step={4} unit="GB"
                    onChange={(v) => onChange({ type: "cpu", name: "CPU · " + v + "GB RAM", vram: 0, ram: v, freeRam: null })} />
                </div>
              ) : (
                <PresetGrid vendor={vendor} current={hw} onPick={pickPreset} />
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="manual-block">
              {(hw.type === "gpu" || hw.type === "amd") && (
                <>
                  <ManualRow label="GPU VRAM" value={hw.vram} min={2} max={200} step={1} unit="GB"
                    onChange={(v) => onChange({ ...hw, name: hw.detected ? hw.name : "Custom GPU", vram: v })} />
                  <ManualRow label="System RAM" value={hw.ram} min={4} max={512} step={4} unit="GB"
                    onChange={(v) => onChange({ ...hw, ram: v, freeRam: hw.freeRam != null ? Math.min(hw.freeRam, v) : null })} />
                  <ManualRow label="Free system RAM right now" value={free} min={2} max={hw.ram} step={1} unit="GB"
                    onChange={setFree}
                    hint="The OS and your open apps already hold part of your RAM. This caps how much a too-big model could spill into (CPU offload)." />
                </>
              )}
              {hw.type === "apple" && (
                <>
                  <ManualRow label="Total unified memory" value={hw.ram} min={8} max={512} step={4} unit="GB"
                    onChange={(v) => onChange({ ...hw, ram: v, vram: metalBudget(v), freeRam: hw.freeRam != null ? Math.min(hw.freeRam, v) : null })} />
                  <ManualRow label="Actually free memory right now" value={free} min={2} max={hw.ram} step={1} unit="GB"
                    onChange={setFree}
                    hint="macOS and your open apps use part of the total by default — set what's realistically free for a model." />
                  <p className="muted-note">
                    macOS lets the GPU wire ~{hw.ram >= 36 ? "3/4" : "2/3"} of unified memory ({fmtGBval(metalBudget(hw.ram))} GB here).
                    Models are checked against the smaller of that and your free memory: <b>{fmtGBval(capacity(hw))} GB</b>.
                  </p>
                </>
              )}
              {hw.type === "cpu" && (
                <>
                  <ManualRow label="System RAM" value={hw.ram} min={4} max={512} step={4} unit="GB"
                    onChange={(v) => onChange({ ...hw, name: "CPU · " + v + "GB RAM", ram: v, freeRam: hw.freeRam != null ? Math.min(hw.freeRam, v) : null })} />
                  <ManualRow label="Actually free RAM right now" value={free} min={2} max={hw.ram} step={1} unit="GB"
                    onChange={setFree}
                    hint="Set what's realistically free once the OS and your usual apps are running." />
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-margin">
          <div className="man-row-top">
            <label>Safety margin</label>
            <span className="mono margin-val">{margin}%</span>
          </div>
          <input type="range" className="slider" min={0} max={25} step={1} value={margin}
            onChange={(e) => onMargin(Number(e.target.value))} />
          <p className="muted-note tiny">Headroom kept free — “Fits” means the total stays under {100 - margin}% of available memory.</p>
        </div>

        <div className="modal-foot">
          <div className="foot-current">
            <Icon d={hwIcon(hw.type)} size={16} />
            <b>{hw.name}</b> · {fmtGBval(capacity(hw))} GB {memLabel(hw.type)}
          </div>
          <button className="btn btn-accent" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
