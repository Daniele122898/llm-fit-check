# CLAUDE.md — working notes for this repo

**LLM Fit Check** (llmfitcheck.com) — a tool that answers "will this LLM fit in my (V)RAM?".
See `README.md` for the feature tour and the memory math, `DEPLOY.md` for the server,
`docs/SEO-REPORT.md` for SEO decisions.

## Layout
- `frontend/` — Vite + React SPA. **All memory math is client-side** (`src/lib/calc.js`).
- `backend/` — FastAPI proxy over the Hugging Face Hub API with a SQLite cache.

## Run / build / deploy
- **Backend runs on port 8400, never 8000** (8000 is taken on the author's machine).
  `cd backend && .venv/bin/uvicorn app.main:app --port 8400`
- Frontend dev: `cd frontend && npm run dev` (proxies `/api` → :8400; trending falls back
  to the curated list if no backend). Prod build: `npm run build` → `frontend/dist`, served
  statically by the backend.
- **Deploy** (home server, existing nginx): `ssh daniele@81.207.76.242`, then
  `cd ~/llm-fit-check && git pull && docker compose -f docker-compose.nginx.yml --profile analytics up -d --build`.
  Sudo steps (nginx/certbot) must be run by the user in their own terminal — the `!` runner
  has no TTY for the password.

## Conventions & gotchas
- **Hardware is a `rig`** (`src/lib/rig.js`): `{mode, gpus:[{id,qty}], apple, vram, systemRam,
  allowOffload, margin}`. `rigToHw(rig)` derives the legacy `hw` shape the math consumes —
  keep that bridge intact rather than threading rigs through calc code. Catalog lives in
  `src/lib/hwCatalog.js`.
- **Memory math is flash-attention-default** (llama.cpp/LM Studio default since late 2025):
  compute buffer is near-flat in context. KV is GQA/MLA/SWA-aware and bills only attention
  layers for hybrid SSM models. Weights use the real published GGUF file size when available.
- **Safety margin** also absorbs the OS/free-RAM headroom concept — there is no separate
  "free RAM" input anymore.
- **Apple usable memory**: `metalBudget()` — ⅔ of unified below 36 GB, ¾ at/above. Use this
  everywhere (don't reintroduce a second rule).
- **Trending** (`backend/app/main.py`): live trendingScore (download-gated + junk-filtered)
  + self-updating `FAMILIES` (resolved live, no pinned versions) + downloads/likes. Top 100.
- **Caching**: model/search/GGUF-header entries 30 days; trending list 6 hours; partial
  (rate-limited) refreshes are served but never cached. `HF_TOKEN` in the server `.env`
  (gitignored — **never commit it**) doubles the anonymous rate limit.
- Analytics: self-hosted Umami, proxied same-origin via nginx (`/u.js`, `/api/send`) so it's
  CSP-clean and ad-block resistant. Track events with `data-umami-event="…"`.
- SEO-critical copy (explainer + FAQ) is **static HTML in `frontend/index.html`**, not React —
  AI/Bing crawlers don't run JS. It's hidden until React mounts (avoids a flash); keep it static.

## Verifying frontend changes
There's no test suite. Verify by: `npm run build` (catches most errors), an SSR smoke render
(`npx vite build --ssr <component> …` then `renderToString`), and for UI/mobile, drive the
built `dist` (via `vite preview`) with `playwright-core` + system Chrome at 1280px and 390px,
checking `scrollWidth <= clientWidth` (no horizontal overflow) and `pageerror` events. Install
`playwright-core` only locally and uninstall before committing — it's not a project dependency.
