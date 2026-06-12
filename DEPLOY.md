# Deploying LLM Fit Check to llmfitcheck.com

The whole site is **one process**: uvicorn runs the FastAPI backend, which serves both the
`/api/*` endpoints and the built frontend (static files from `frontend/dist`). In front of it
sits **Caddy**, which terminates TLS (automatic Let's Encrypt), redirects www → apex, and
compresses responses. State is a single SQLite file.

```
internet ──► Caddy :443 (TLS, zstd/gzip, HSTS) ──► uvicorn :8400 (API + static frontend)
                                                        │
                                                  /data/fitcheck.db (SQLite cache)
```

## 0. Prerequisites

- A server (any small VPS is plenty — the app is I/O-light and the cache makes it mostly idle)
  with **Docker + the compose plugin** installed.
- DNS at your registrar:
  - `A` (and `AAAA` if you have IPv6) record: `llmfitcheck.com` → your server IP
  - `A`/`AAAA` record: `www.llmfitcheck.com` → same IP (Caddy redirects it)
- Ports **80 and 443** open. Caddy gets certificates automatically on first request —
  no certbot, no manual TLS.

## 1. First deploy

```sh
# on the server
git clone https://github.com/Daniele122898/llm-fit-check.git /opt/llm-fit-check
cd /opt/llm-fit-check

# optional but recommended: a Hugging Face token doubles the API rate budget
echo "HF_TOKEN=hf_xxx" > .env

docker compose up -d --build
```

That's it — `https://llmfitcheck.com` is live once DNS propagates. The compose file runs:
- **app**: multi-stage build (node builds `frontend/dist`, python image runs uvicorn).
  The SQLite cache lives in the bind-mounted `./data/` directory on the host.
- **caddy**: reverse proxy from `deploy/Caddyfile`.

## 2. Seeding the database (copy the warmed cache)

The repo's warm script builds a baseline (~340 models, trending blend, common searches,
GGUF mirrors) so the first visitors hit a full cache. Two options:

**Option A — copy your locally warmed DB (recommended, instant):**

```sh
# from your dev machine; checkpoint WAL first so one file holds everything
sqlite3 backend/data/fitcheck.db "PRAGMA wal_checkpoint(TRUNCATE);"
rsync -av backend/data/fitcheck.db SERVER:/opt/llm-fit-check/data/
ssh SERVER "cd /opt/llm-fit-check && docker compose restart app"
```

**Option B — warm it on the server (takes ~6 minutes, paced for rate limits):**

```sh
docker compose exec app python scripts/warm_cache.py
```

Re-run the warm script whenever you like (e.g. monthly, or after long downtime) — cached
entries cost nothing, expired ones refresh.

## 3. Updating the site

```sh
cd /opt/llm-fit-check
git pull
docker compose up -d --build     # rebuilds frontend + backend, restarts
```

The database persists across updates (it's a host bind mount). Hashed frontend assets are
cached immutable by browsers; `index.html` is `no-cache`, so deploys take effect immediately.

## 4. Operations

| Task | Command |
|---|---|
| Logs | `docker compose logs -f app` / `caddy` |
| Health check | `curl https://llmfitcheck.com/api/health` |
| Backup | copy `data/fitcheck.db` (run the WAL checkpoint above first) |
| DB stats | `sqlite3 data/fitcheck.db "SELECT kind, COUNT(*) FROM cache GROUP BY kind"` |
| Keep trending hot (optional) | cron: `7 */6 * * * curl -fsS https://llmfitcheck.com/api/trending >/dev/null` |

The trending list refreshes lazily every 6 hours on the first request that finds it stale;
the optional cron just spares that visitor the wait. Per-model/search cache entries live 30
days; entries older than 60 days are purged on startup.

## 5. What's already production-hardened

- **Read-only API**, all SQLite access parameterized; repo ids strictly validated
  (`org/name`, no traversal, no URL smuggling into upstream requests).
- **Per-IP rate limit** (120 req/min on `/api/*`) — uvicorn runs with `--proxy-headers` so
  the real client IP arrives through Caddy.
- **Security headers** app-side (CSP, nosniff, referrer policy, frame-ancestors) + HSTS at
  Caddy; gzip app-side, zstd/gzip at Caddy; immutable caching for hashed assets.
- **Rate-limit resilient**: partial Hugging Face failures are served but never cached; when
  HF is unreachable, stale cache is served instead of erroring.

## Alternative: bare-metal (no Docker)

```sh
# build frontend locally or on the server
cd frontend && npm ci && npm run build

# backend venv
cd ../backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

systemd unit `/etc/systemd/system/fitcheck.service`:

```ini
[Unit]
Description=LLM Fit Check
After=network.target

[Service]
WorkingDirectory=/opt/llm-fit-check/backend
Environment=HF_TOKEN=hf_xxx
ExecStart=/opt/llm-fit-check/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8400 --proxy-headers
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Then install Caddy from your distro and use `deploy/Caddyfile` with
`reverse_proxy localhost:8400`. The DB defaults to `backend/data/fitcheck.db`
(or set `FITCHECK_DB`).

## Post-launch checklist (SEO)

1. **Google Search Console**: add the `llmfitcheck.com` property (DNS verification),
   submit `https://llmfitcheck.com/sitemap.xml`, request indexing for `/`.
2. **Bing Webmaster Tools**: import from Search Console (one click).
3. Verify the social card with https://www.opengraph.xyz or Twitter/X card validator.
4. Links are the real ranking lever for a niche tool: the GitHub README, a Show HN post,
   and r/LocalLLaMA are worth more than any further on-page tweak.
