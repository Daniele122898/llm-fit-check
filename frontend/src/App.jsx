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
            <span className="brand-name"><span className="brand-llm">LLM</span> Fit Check</span>
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

      <footer className="foot-note">
        Estimates use llama.cpp-style quant sizes, GQA/MLA/sliding-window-aware KV-cache math and a compute-buffer
        model fitted to real runs. Real usage still varies by engine, batch size and KV settings — treat the line as
        guidance, not gospel.
        <div className="foot-credit">Built by ArgonautDev with ❤️</div>
        <a className="foot-gh" href="https://github.com/Daniele122898/llm-fit-check" target="_blank"
          rel="noopener noreferrer" aria-label="GitHub repository">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </footer>

      {panel && (
        <HardwarePanel hw={hw} onChange={setHw} onClose={() => setPanel(false)}
          margin={margin} onMargin={setMargin} />
      )}
    </div>
  );
}
