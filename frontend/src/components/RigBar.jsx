import React, { useEffect } from "react";
import { Icon, ICONS } from "./icons.jsx";
import { GPU_BY_ID, VENDOR_BADGE } from "../lib/hwCatalog.js";
import { rigAvail, gpuCount } from "../lib/rig.js";
import { RigBuilder } from "./RigBuilder.jsx";

function RigPills({ rig }) {
  if (rig.mode === "apple")
    return <span className="rpill"><span className="rpill-badge" style={{ background: "#6e6e73" }} />{rig.apple?.variantName || "Apple"}</span>;
  if (rig.mode === "cpu")
    return <span className="rpill"><span className="rpill-badge" style={{ background: "#8a8f9c", fontSize: 7 }}>CPU</span>CPU only</span>;
  if (rig.mode === "manual")
    return <span className="rpill"><span className="rpill-badge" style={{ background: "#a07cff", fontSize: 7 }}>SET</span>Custom</span>;
  if (gpuCount(rig) === 0)
    return <span className="rpill-empty">Nothing selected</span>;
  return rig.gpus.map((it) => {
    const g = GPU_BY_ID[it.id];
    if (!g) return null;
    const b = VENDOR_BADGE[g.vendor];
    return (
      <span className="rpill" key={it.id}>
        <span className="rpill-badge" style={{ background: b.bg }}>{b.label}</span>{g.name}
        {it.qty > 1 && <span className="rpill-x">×{it.qty}</span>}
      </span>
    );
  });
}

export function RigBar({ rig, onEdit }) {
  const avail = rigAvail(rig);
  const memLabel = rig.mode === "apple" || rig.mode === "cpu" ? "GB usable" : "GB VRAM";
  const showRam = rig.mode !== "apple" && !(rig.mode === "discrete" && rig.allowOffload === false);
  return (
    <div className="rigbar">
      <div className="rigbar-l">
        <span className="rigbar-label"><Icon d={ICONS.stack} size={14} style={{ color: "var(--accent-text)" }} /> Your hardware</span>
        <div className="rigbar-pills"><RigPills rig={rig} /></div>
      </div>
      <div className="rigbar-r">
        <div className="rigbar-total">
          <b className="mono">{avail >= 100 ? Math.round(avail) : avail}</b>
          <span>{memLabel}{showRam ? ` · ${rig.systemRam}GB RAM` : ""}</span>
        </div>
        <button className="rigbar-edit" onClick={onEdit} data-umami-event="hardware-open">
          <Icon d={ICONS.chip} size={15} /> Edit rig
        </button>
      </div>
    </div>
  );
}

export function RigOverlay({ rig, onApply, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="hw-scrim" onMouseDown={onClose}>
      <div className="hw-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="hw-modal-head">
          <div>
            <div className="hw-modal-title">Your hardware</div>
            <div className="hw-modal-sub">Build the rig we check every model against.</div>
          </div>
          <button className="hw-close" onClick={onClose} aria-label="Close"><Icon d={ICONS.no} size={18} /></button>
        </div>
        <RigBuilder initialRig={rig} ctaLabel="Use this rig" onUse={onApply} />
      </div>
    </div>
  );
}
