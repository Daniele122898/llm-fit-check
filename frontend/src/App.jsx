import React, { useEffect, useMemo, useState } from "react";
import { Icon, ICONS } from "./components/icons.jsx";
import { RigBar, RigOverlay } from "./components/RigBar.jsx";
import { FitsView } from "./components/FitsView.jsx";
import { CalcView } from "./components/CalcView.jsx";
import { defaultRig, rigToHw } from "./lib/rig.js";

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw);
  } catch { /* corrupted/blocked storage */ }
  return fallback;
}

function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export default function App() {
  const [tab, setTab] = useState("fits");
  const [rig, setRig] = useState(() => ({ ...defaultRig(), ...load("fitcheck_rig", {}) }));
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(() => load("fitcheck_layout", "list"));
  const [settings, setSettings] = useState(() => ({
    quantId: "Q4_K_M", context: 8192, kvPrec: "f16",
    ...load("fitcheck_settings", {}),
  }));

  // Reveal the static SEO/footer HTML (hidden for first paint — see index.html)
  useEffect(() => { document.documentElement.classList.add("app-ready"); }, []);

  useEffect(() => persist("fitcheck_rig", rig), [rig]);
  useEffect(() => persist("fitcheck_layout", layout), [layout]);
  useEffect(() => persist("fitcheck_settings", settings), [settings]);

  const hw = useMemo(() => rigToHw(rig), [rig]);
  const margin = (rig.margin ?? 10) / 100;
  const s = { ...settings, margin };

  const applyRig = (next) => { setRig(next); setEditing(false); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon d={ICONS.fit} size={18} sw={2.4} /></span>
          <div className="brand-text">
            <h1 className="brand-name"><span className="brand-llm">LLM</span> Fit Check</h1>
            <span className="brand-tag">will the model run on your box?</span>
          </div>
        </div>
      </header>

      <div className="tabbar">
        <div className="tabs">
          <button className={"tab" + (tab === "fits" ? " on" : "")} onClick={() => setTab("fits")} data-umami-event="tab-whatfits">
            <Icon d={ICONS.search} size={15} /> What fits
          </button>
          <button className={"tab" + (tab === "calc" ? " on" : "")} onClick={() => setTab("calc")} data-umami-event="tab-calculator">
            <Icon d={ICONS.calc} size={15} /> Calculator
          </button>
        </div>
        <div className="tabbar-hint">
          {tab === "fits" ? "Models checked against your hardware in real time" : "Punch in any model's numbers"}
        </div>
      </div>

      <main className="main">
        {tab === "fits"
          ? <FitsView s={s} setS={setSettings} hw={hw} rig={rig} onEditRig={() => setEditing(true)} layout={layout} setLayout={setLayout} />
          : <CalcView hw={hw} rig={rig} onEditRig={() => setEditing(true)} defaultQuant={settings.quantId} margin={margin} />}
      </main>

      {/* The about/FAQ section and footer live as static HTML in index.html so
          non-JS crawlers (Bing, AI search bots) can read them. */}

      {editing && <RigOverlay rig={rig} onApply={applyRig} onClose={() => setEditing(false)} />}
    </div>
  );
}
