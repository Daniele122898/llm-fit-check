# FitCheck — will the model run on your box?

A clean, technical tool that answers one question: **does this LLM fit in your (V)RAM?**
Set your hardware once, then browse trending Hugging Face models with live green/yellow/red
fit verdicts, search any model by name or pasted HF URL, or punch raw numbers into the calculator.

## Architecture

```
frontend/   Vite + React SPA — all memory math runs client-side, instant interactivity
backend/    FastAPI — proxies/normalizes the Hugging Face Hub API, caches in SQLite
```

- `GET /api/trending` — the front-page blend: live HF `trendingScore` first, then a
  curated list of famous staples (flagship open-weight families + the GGUF mirrors people
  actually run) and HF's most-downloaded / most-liked text-generation models, deduped and
  enriched with param counts (`safetensors.total` / `gguf.total`) and real architecture
  from `config.json`. The list refreshes every 6 hours; a rate-limited (partial) refresh
  is served but never cached.
- `GET /api/search?q=…` — HF model search, enriched the same way. Cached **30 days**.
- `GET /api/model/{org}/{name}` — resolve one repo (pasted URL). Cached **30 days**.

For **GGUF repos**, two extras come along (both also cached 30 days, never re-fetched):
the repo file tree gives the **exact byte size of every published quant** (llama.cpp
mmaps the file wholesale, so file size = weights footprint; multi-part shards are
summed), and a **~128 KB HTTP-range read of one file's GGUF header** yields the true
architecture (layers / heads / KV heads / head_dim / context, MLA and sliding-window
keys) — which works even when the base model's `config.json` is gated. The whole file is
never downloaded.

Per-model metadata and searches sit in `backend/data/fitcheck.db` (SQLite, WAL). When
Hugging Face is unreachable or rate-limits, stale entries are served instead of failing;
if the backend itself is down, the frontend falls back to a curated offline list.

Set `HF_TOKEN` in the environment to lift anonymous rate limits (500 req / 5 min).

Before going live, build a cache baseline (trending blend + family searches + common
GGUF mirrors, paced to respect rate limits — takes a few minutes, safe to re-run):

```sh
cd backend && .venv/bin/python scripts/warm_cache.py
```

## Running it

Backend:

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8400
```

Frontend (dev, hot reload — proxies `/api` to :8400):

```sh
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Frontend (production — served by the backend):

```sh
cd frontend && npm run build
# restart uvicorn, then open http://localhost:8400
```

## The memory math

`total = weights + KV cache + compute buffer + fixed runtime overhead`, following what
llama.cpp / Ollama / the NyxKrage calculator actually compute:

- **Weights** = the repo's real GGUF file size when the selected quant is published
  (marked "real file" in the UI), otherwise params × effective bits-per-weight ÷ 8.
  Bpw values are file-level effective sizes (Q4_K_M ≈ 4.85, Q6_K ≈ 6.59 …), not
  theoretical block sizes.
- **KV cache** = 2 × layers × **kv_heads** × head_dim × bytes × tokens — GQA-aware, with
  real `config.json` values per model. Two researched exceptions are handled:
  **MLA** (DeepSeek V2/V3/R1: a single compressed latent per layer, ~28× smaller) and
  **sliding-window attention** (Gemma 2/3, Mistral v0.1: windowed layers cache only
  `min(ctx, window)` tokens).
- **Compute buffer** = `(ctx/1024 × 2 + 0.75) × attention_heads` MiB (empirical fit of
  llama.cpp's graph buffer), plus ~0.5 GiB fixed (CUDA context / runtime baseline).
- **MoE**: all parameters must be resident — active params only affect speed. The
  calculator has an "active params" field that says exactly that.

### Hardware capacity

- **Discrete GPUs** check against VRAM. Models that don't fit but whose remainder fits in
  *free* system RAM get an explicit orange **"Offloads"** verdict (llama.cpp-style layer
  split — runs, but slowly) showing how many GB would spill.
- **Apple Silicon** uses the macOS GPU wired limit: **2/3 of unified memory below 36 GB,
  3/4 from 36 GB up** (Metal's `recommendedMaxWorkingSetSize`, the cap Ollama/LM Studio
  respect). On top of that, the hardware panel lets you set how much memory is *actually
  free right now* — macOS plus your usual apps already hold part of the total — and models
  are checked against the smaller of the two.
- **CPU-only** boxes check against free system RAM minus a small OS reserve.

A configurable safety margin (default 10%) separates "Fits" from "Tight".
