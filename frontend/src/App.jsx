import React, { useEffect, useState } from "react";
import { Icon, ICONS } from "./components/icons.jsx";
import { HardwareChip, HardwarePanel } from "./components/HardwarePanel.jsx";
import { FitsView } from "./components/FitsView.jsx";
import { CalcView } from "./components/CalcView.jsx";
import { defaultHw } from "./lib/hardware.js";

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
  const [hw, setHw] = useState(() => ({ ...defaultHw(), ...load("fitcheck_hw", {}) }));
  const [panel, setPanel] = useState(false);
  const [layout, setLayout] = useState(() => load("fitcheck_layout", "list"));
  const [margin, setMargin] = useState(() => load("fitcheck_margin", 10));
  const [settings, setSettings] = useState(() => ({
    quantId: "Q4_K_M", context: 8192, kvPrec: "f16",
    ...load("fitcheck_settings", {}),
  }));

  useEffect(() => persist("fitcheck_hw", hw), [hw]);
  useEffect(() => persist("fitcheck_layout", layout), [layout]);
  useEffect(() => persist("fitcheck_margin", margin), [margin]);
  useEffect(() => persist("fitcheck_settings", settings), [settings]);

  const s = { ...settings, margin: margin / 100 };

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
        <div className="topbar-right">
          <HardwareChip hw={hw} onClick={() => setPanel(true)} />
        </div>
      </header>

      <div className="tabbar">
        <div className="tabs">
          <button className={"tab" + (tab === "fits" ? " on" : "")} onClick={() => setTab("fits")}>
            <Icon d={ICONS.search} size={15} /> What fits
          </button>
          <button className={"tab" + (tab === "calc" ? " on" : "")} onClick={() => setTab("calc")}>
            <Icon d={ICONS.calc} size={15} /> Calculator
          </button>
        </div>
        <div className="tabbar-hint">
          {tab === "fits" ? "Models checked against your hardware in real time" : "Punch in any model's numbers"}
        </div>
      </div>

      <main className="main">
        {tab === "fits"
          ? <FitsView s={s} setS={setSettings} hw={hw} layout={layout} setLayout={setLayout} />
          : <CalcView hw={hw} defaultQuant={settings.quantId} margin={margin / 100} />}
      </main>

      {/* The about/FAQ section and footer live as static HTML in index.html so
          non-JS crawlers (Bing, AI search bots) can read them. */}

      {panel && (
        <HardwarePanel hw={hw} onChange={setHw} onClose={() => setPanel(false)}
          margin={margin} onMargin={setMargin} />
      )}
    </div>
  );
}
