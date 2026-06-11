import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ICONS, VerdictChip, HeadroomBar, Segmented } from "./primitives.jsx";
import { Breakdown, computeRow } from "./Breakdown.jsx";
import { QUANTS, QUANT_BY_ID } from "../lib/quants.js";
import { capacity, estimate, estimateArch, parseParams, isHfUrl, repoFromQuery, CTX_STEPS } from "../lib/calc.js";
import { fmtGB, fmtGBval, fmtParams, fmtCount, fmtCtx, fmtAgo } from "../lib/format.js";
import { fetchTrending, searchModels, resolveRepo } from "../lib/api.js";
import { CURATED_MODELS } from "../lib/curated.js";

function offloadLabel(v) {
  return v.level === "offload" ? "Offloads" : v.label;
}

function ModelTags({ model }) {
  return (
    <>
      {model.estimated && <span className="est-tag">est</span>}
      {model.moe && <span className="moe-tag">MoE</span>}
      {model.gated && <span className="gated-tag">gated</span>}
    </>
  );
}

// ---- one model, list layout (bar-forward) ----
function ModelRow({ model, s, hw, expanded, onToggle, setQuant }) {
  const { est, v } = computeRow(model, s, hw);
  return (
    <div className={"row" + (expanded ? " open" : "")}>
      <button className="row-main" onClick={onToggle}>
        <div className="row-id">
          <div className="row-name">{model.name}<ModelTags model={model} /></div>
          <div className="row-meta">
            <span className="row-org">{model.org}</span>
            <span className="dot-sep">·</span>
            <span className="mono">{fmtParams(model.params)}</span>
            {model.downloads > 0 && <><span className="dot-sep">·</span><span className="mono dl">↓ {fmtCount(model.downloads)}</span></>}
            {model.likes > 0 && <><span className="dot-sep">·</span><span className="mono dl">♥ {fmtCount(model.likes)}</span></>}
          </div>
        </div>
        <div className="row-bar">
          <HeadroomBar weights={est.weights} kv={est.kv} overhead={est.overhead} available={capacity(hw)} height={10} />
        </div>
        <div className="row-gb mono">{fmtGB(est.total)}</div>
        <div className="row-verdict"><VerdictChip level={v.level} label={offloadLabel(v)} /></div>
        <Icon d={ICONS.chevron} size={16} style={{ color: "var(--text-faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {expanded && <Breakdown model={model} s={s} hw={hw} setQuant={setQuant} />}
    </div>
  );
}

// ---- table layout (dense) ----
function ModelTable({ models, s, hw, expandedId, setExpandedId, setQuant }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Model</th><th className="r">Params</th><th>Quant</th>
            <th className="r">Total</th><th style={{ width: "30%" }}>Headroom</th><th className="r">Verdict</th><th></th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const { est, v } = computeRow(m, s, hw);
            const open = expandedId === m.id;
            return (
              <React.Fragment key={m.id}>
                <tr className={"trow" + (open ? " open" : "")} onClick={() => setExpandedId(open ? null : m.id)}>
                  <td><div className="td-name">{m.name}<ModelTags model={m} /></div><div className="td-org">{m.org}</div></td>
                  <td className="r mono">{fmtParams(m.params)}</td>
                  <td className="mono dim">{QUANT_BY_ID[s.quantId].label}</td>
                  <td className="r mono strong">{fmtGB(est.total)}</td>
                  <td><HeadroomBar weights={est.weights} kv={est.kv} overhead={est.overhead} available={capacity(hw)} height={8} /></td>
                  <td className="r"><VerdictChip level={v.level} label={offloadLabel(v)} compact /></td>
                  <td className="r"><Icon d={ICONS.chevron} size={15} style={{ color: "var(--text-faint)", transform: open ? "rotate(180deg)" : "none" }} /></td>
                </tr>
                {open && <tr className="trow-bd"><td colSpan={7}><Breakdown model={m} s={s} hw={hw} setQuant={setQuant} /></td></tr>}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- card layout ----
function ModelCard({ model, s, hw, expanded, onToggle, setQuant }) {
  const { est, v, ctx } = computeRow(model, s, hw);
  const best = QUANTS.filter((q) => estimateTotal(model, q.id, ctx, s) <= capacity(hw) * (1 - s.margin)).pop();
  return (
    <div className={"card" + (expanded ? " open" : "")} data-level={v.level}>
      <button className="card-main" onClick={onToggle}>
        <div className="card-top">
          <VerdictChip level={v.level} label={offloadLabel(v)} />
          <span className="card-params mono">{fmtParams(model.params)}</span>
        </div>
        <div className="card-name">{model.name}<ModelTags model={model} /></div>
        <div className="card-org">{model.org}</div>
        <div className="card-gb"><span className="mono">{fmtGB(est.total)}</span><i>/ {fmtGBval(capacity(hw))} GB</i></div>
        <HeadroomBar weights={est.weights} kv={est.kv} overhead={est.overhead} available={capacity(hw)} height={9} />
        <div className="card-best">{best ? "Best fit: " + best.label : "Doesn't fit at any quant"}</div>
      </button>
      {expanded && <Breakdown model={model} s={s} hw={hw} setQuant={setQuant} />}
    </div>
  );
}

function estimateTotal(model, quantId, ctx, s) {
  return estimate(model, quantId, ctx, s.kvPrec).total;
}

// Synthesize a generic entry when the user types a bare size like "13b".
function synthFromQuery(query) {
  const wanted = parseParams(query);
  if (!wanted) return null;
  const arch = estimateArch(wanted);
  return {
    id: "synth:" + wanted, name: `Generic ${wanted}B model`, org: "estimate",
    params: wanted, ...arch, ctxMax: 32768, estimated: true, synthetic: true,
  };
}

function searchCurated(q) {
  const qn = q.toLowerCase();
  return CURATED_MODELS.filter((m) =>
    m.name.toLowerCase().includes(qn) || m.org.toLowerCase().includes(qn) || m.id.toLowerCase().includes(qn)
  );
}

// ---- the whole view ----
export function FitsView({ s, setS, hw, layout, setLayout }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);     // null = not searching
  const [searchState, setSearchState] = useState("idle"); // idle | busy | done | error
  const [searchNote, setSearchNote] = useState("");
  const [trendingData, setTrendingData] = useState(null);
  const [trendingState, setTrendingState] = useState("loading"); // loading | live | offline
  const [sort, setSort] = useState("trend");
  const [onlyFit, setOnlyFit] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const timer = useRef(null);
  const seq = useRef(0);

  // trending front page
  useEffect(() => {
    let cancelled = false;
    fetchTrending(60)
      .then((d) => { if (!cancelled) { setTrendingData(d); setTrendingState("live"); } })
      .catch(() => { if (!cancelled) setTrendingState("offline"); });
    return () => { cancelled = true; };
  }, []);

  // debounced search — name search or HF URL resolve
  useEffect(() => {
    if (!query.trim()) {
      setResults(null); setSearchState("idle"); setSearchNote("");
      return;
    }
    setSearchState("busy");
    clearTimeout(timer.current);
    const mySeq = ++seq.current;
    timer.current = setTimeout(async () => {
      const q = query.trim();
      try {
        let models, note;
        if (isHfUrl(q) && repoFromQuery(q)) {
          const repo = repoFromQuery(q);
          const d = await resolveRepo(repo);
          models = d.models;
          note = "from URL";
        } else {
          const d = await searchModels(q);
          models = d.models;
          note = `for “${q}”`;
          if (models.length === 0) {
            const synth = synthFromQuery(q);
            if (synth) models = [synth];
          }
        }
        if (seq.current !== mySeq) return;
        setResults(models);
        setSearchNote(`${models.length} result${models.length !== 1 ? "s" : ""} ${note}`);
        setSearchState("done");
      } catch (e) {
        if (seq.current !== mySeq) return;
        // offline / backend error: fall back to the curated list
        const local = searchCurated(q);
        const synth = local.length === 0 ? synthFromQuery(q) : null;
        setResults(synth ? [synth] : local);
        setSearchNote(e.status === 404 || e.status === 422
          ? (e.message || "Model not found.")
          : "Search unavailable — showing curated matches.");
        setSearchState("error");
      }
    }, 380);
    return () => clearTimeout(timer.current);
  }, [query]);

  const trendingModels = trendingState === "live" && trendingData?.models?.length
    ? trendingData.models
    : CURATED_MODELS;
  const base = results != null ? results : trendingModels;

  const list = useMemo(() => {
    let arr = base.slice();
    if (onlyFit) arr = arr.filter((m) => computeRow(m, s, hw).v.level !== "no");
    arr.sort((a, b) => {
      if (sort === "trend") return (a.trend || 99) - (b.trend || 99);
      if (sort === "size") return computeRow(a, s, hw).est.total - computeRow(b, s, hw).est.total;
      if (sort === "params") return a.params - b.params;
      if (sort === "popular") return (b.downloads || 0) - (a.downloads || 0);
      if (sort === "fit") {
        const order = { fit: 0, tight: 1, offload: 2, no: 3 };
        return order[computeRow(a, s, hw).v.level] - order[computeRow(b, s, hw).v.level] || a.params - b.params;
      }
      return 0;
    });
    return arr;
  }, [base, sort, onlyFit, s, hw]);

  const setQuant = (id) => setS((p) => ({ ...p, quantId: id }));
  const fitCount = useMemo(() => base.filter((m) => computeRow(m, s, hw).v.level !== "no").length, [base, s, hw]);

  return (
    <div className="fits">
      {/* search */}
      <div className="search-wrap">
        <div className="search">
          <Icon d={ICONS.search} size={18} style={{ color: "var(--text-faint)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Hugging Face, or paste a model URL…" spellCheck={false} />
          {query && <button className="search-clear" onClick={() => setQuery("")}><Icon d={ICONS.no} size={15} /></button>}
        </div>
        {searchState === "busy" && <div className="search-status">Searching Hugging Face…</div>}
        {searchState === "done" && <div className="search-status">{searchNote}</div>}
        {searchState === "error" && <div className="search-status warn">{searchNote}</div>}
      </div>

      {/* global controls */}
      <div className="controls">
        <div className="ctrl">
          <label>Quantization</label>
          <Segmented size="sm" value={s.quantId} onChange={setQuant} options={QUANTS.map((q) => ({ id: q.id, label: q.label }))} />
        </div>
        <div className="ctrl ctrl-ctx">
          <label>Context <span className="mono ctx-val">{fmtCtx(s.context)} tokens</span></label>
          <input type="range" className="slider" min={0} max={CTX_STEPS.length - 1} step={1}
            value={Math.max(0, CTX_STEPS.indexOf(s.context))}
            onChange={(e) => setS((p) => ({ ...p, context: CTX_STEPS[Number(e.target.value)] }))} />
        </div>
      </div>

      {/* list header */}
      <div className="list-head">
        <div className="list-title">
          {results != null ? "Results" : "Trending on Hugging Face"}
          <span className="list-count">{fitCount} of {base.length} fit</span>
          {results == null && trendingState === "live" && trendingData?.fetchedAt && (
            <span className="list-updated">updated {fmtAgo(trendingData.fetchedAt)}</span>
          )}
          {results == null && trendingState === "offline" && (
            <span className="list-updated warn">offline — curated list</span>
          )}
        </div>
        <div className="list-tools">
          <label className="chk">
            <input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} />
            <span>Only show what fits</span>
          </label>
          <div className="sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="trend">Trending</option>
              <option value="fit">Fit first</option>
              <option value="size">Memory ↑</option>
              <option value="params">Params ↑</option>
              <option value="popular">Most downloaded</option>
            </select>
          </div>
          <Segmented size="sm" value={layout} onChange={setLayout} options={["list", "table", "cards"]} />
        </div>
      </div>

      {/* list */}
      {results == null && trendingState === "loading" ? (
        <div className="empty">Loading trending models from Hugging Face…</div>
      ) : list.length === 0 ? (
        <div className="empty">No models match. Try a different search or loosen your hardware.</div>
      ) : layout === "table" ? (
        <ModelTable models={list} s={s} hw={hw} expandedId={expandedId} setExpandedId={setExpandedId} setQuant={setQuant} />
      ) : layout === "cards" ? (
        <div className="card-grid">
          {list.map((m) => <ModelCard key={m.id} model={m} s={s} hw={hw} expanded={expandedId === m.id} onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)} setQuant={setQuant} />)}
        </div>
      ) : (
        <div className="rows">
          {list.map((m) => <ModelRow key={m.id} model={m} s={s} hw={hw} expanded={expandedId === m.id} onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)} setQuant={setQuant} />)}
        </div>
      )}
    </div>
  );
}
