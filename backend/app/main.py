"""FitCheck backend — Hugging Face search/trending proxy with a SQLite cache.

Routes:
  GET /api/trending?limit=30    trending text-generation models, enriched
  GET /api/search?q=...         model search by name
  GET /api/model/{org}/{name}   resolve one repo (pasted HF URL)
  GET /api/health

Cache policy: per-model metadata and search results are valid for 30 days;
the trending *list* refreshes every 6 hours (its per-model metadata still
comes from the 30-day cache). When Hugging Face is unreachable or rate-limits
us, stale cache entries are served instead of failing.
"""

import asyncio
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from collections import deque
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .cache import Cache, TTL_30D_S, UNUSABLE
from .hf import HfClient, HfError, is_valid_repo_id

MODEL_TTL_S = TTL_30D_S        # 30 days
SEARCH_TTL_S = TTL_30D_S       # 30 days
TRENDING_TTL_S = 6 * 3600      # 6 hours

cache: Cache
hf: HfClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    global cache, hf
    cache = Cache()
    cache.purge_old()
    hf = HfClient(cache=cache)
    yield
    await hf.aclose()
    cache.close()


app = FastAPI(title="FitCheck", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],  # the API is read-only
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

# --- abuse guard: per-IP sliding window on /api/ ------------------------------
# Each uncached /api/model hit costs us Hugging Face quota and a cache row, so
# cap clients well above any legitimate browsing rate. Run uvicorn with
# --proxy-headers behind the reverse proxy so request.client is the real IP.
RATE_LIMIT = 120
RATE_WINDOW_S = 60.0
_rate: dict[str, deque] = {}

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = _rate.setdefault(ip, deque())
        while window and now - window[0] > RATE_WINDOW_S:
            window.popleft()
        if len(window) >= RATE_LIMIT:
            return JSONResponse({"detail": "Rate limit exceeded — slow down."}, status_code=429,
                                headers={"retry-after": "60"})
        window.append(now)
        if len(_rate) > 20000:  # bound memory under address churn
            for key in [k for k, dq in _rate.items() if not dq][:10000]:
                _rate.pop(key, None)

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Content-Security-Policy", CSP)
    return response


async def get_model_cached(repo_id: str):
    """Enriched model via 30-day cache. Returns None for un-sizeable repos.

    Raises HfError/httpx errors only when there is no cache entry to fall
    back on.
    """
    key = f"model:{repo_id.lower()}"
    payload, age = cache.get(key)
    if payload is not None and age < MODEL_TTL_S:
        return None if payload == UNUSABLE else payload
    try:
        model = await hf.enrich(repo_id)
    except (HfError, httpx.HTTPError):
        if payload is not None:  # stale-on-error
            return None if payload == UNUSABLE else payload
        raise
    cache.put(key, "model", model if model is not None else UNUSABLE)
    return model


# Distinguishes "couldn't be sized" (None, negative-cached) from a transient
# fetch failure — partial results must not be cached as if they were complete.
FAILED = object()


async def _get_model_or_failed(repo_id: str):
    try:
        return await get_model_cached(repo_id)
    except (HfError, httpx.HTTPError):
        return FAILED


def _usable(results):
    return [r for r in results if r is not None and r is not FAILED]


# Flagship open-weight families. Each resolves at request time to its current
# most-downloaded text-gen repos via the HF API, so a new generation surfaces
# automatically (Qwen3 -> Qwen3.6) with no code change. `match` filters orgs
# that publish more than LLMs. This replaces the old hand-pinned staples list,
# which rotted to specific versions.
FAMILIES = [
    {"author": "meta-llama", "match": "llama"},
    {"author": "Qwen"},
    {"author": "deepseek-ai", "match": "deepseek"},
    {"author": "google", "match": "gemma"},
    {"author": "mistralai"},
    {"author": "microsoft", "match": "phi"},
    {"author": "openai", "match": "gpt-oss"},
    {"author": "zai-org", "match": "glm"},
    {"author": "ibm-granite", "match": "granite"},
    {"author": "allenai", "match": "olmo"},
    {"author": "HuggingFaceTB", "match": "smollm"},
    {"author": "moonshotai", "match": "kimi"},
    {"author": "MiniMaxAI", "match": "minimax"},
    {"author": "nvidia", "match": "nemotron"},
    {"author": "LiquidAI", "match": "lfm"},
]

_JUNK_ID_RE = re.compile(r"tiny-random|internal-testing|dummy", re.I)
_LEGACY_RE = re.compile(
    r"(^|/)(gpt2|distilgpt2|opt-\d|bloom|bloomz|pythia|gpt-neo|gpt-j|"
    r"stablelm|santacoder|starcoder(?!2)|llama-2|llama2|t5|bert)", re.I,
)
# Merge/finetune spam, adult roleplay, and image/diffusion models that chart on
# text-generation trending but aren't general chat LLMs.
_JUNK_NAME_RE = re.compile(
    r"obliterat|ablitera|uncensor|heretic|nsfw|erotic|porn|waifu|hentai|"
    r"roleplay|-rp-|image|diffusion|flux|text-to-|fp4-dflash", re.I,
)
# A live-trending repo must clear this download floor to appear — it separates
# genuinely hot releases from obscure launch hype (few downloads, many likes).
# Official families bypass it.
TREND_MIN_DOWNLOADS = 20000


@app.get("/api/health")
async def health():
    return {"ok": True, "time": int(time.time())}


@app.get("/api/trending")
async def trending(limit: int = Query(100, ge=1, le=100)):
    """Front-page list: live trending, then self-updating flagship families,
    then the most-downloaded / most-liked models — deduped, enriched, ranked.
    Downloads/likes are filtered of legacy base/research models."""
    key = f"trending:v3:text-generation:{limit}"
    payload, age = cache.get(key)
    if payload is not None and age < TRENDING_TTL_S:
        return payload

    hot, popular, liked, *family_lists = await asyncio.gather(
        hf.list_models(sort="trendingScore", limit=50),
        hf.list_models(sort="downloads", limit=40),
        hf.list_models(sort="likes", limit=40),
        *(hf.family_flagships(f["author"], f.get("match")) for f in FAMILIES),
        return_exceptions=True,
    )
    hot, popular, liked = (x if isinstance(x, list) else [] for x in (hot, popular, liked))
    family_ids = [r for lst in family_lists if isinstance(lst, list) for r in lst]
    if not (hot or popular or liked or family_ids):
        if payload is not None:
            return payload  # stale list beats no list
        raise HTTPException(503, "Hugging Face is unreachable and nothing is cached yet.")

    ids, seen = [], set()

    def add(repo_id):
        k = repo_id.lower()
        if k not in seen:
            seen.add(k)
            ids.append(repo_id)

    def reputable(item):
        rid = item.get("id", "")
        return not (_JUNK_ID_RE.search(rid) or _JUNK_NAME_RE.search(rid) or _LEGACY_RE.search(rid))

    # Live trending, gated on a real download floor so merge/image spam and
    # obscure launch hype don't lead the page.
    for item in hot:
        if reputable(item) and (item.get("downloads") or 0) >= TREND_MIN_DOWNLOADS:
            add(item["id"])
    # Self-updating official flagships — trusted, no gate.
    for repo_id in family_ids:
        add(repo_id)
    # Most-downloaded / most-liked, junk- and legacy-filtered.
    for item in popular:
        if reputable(item):
            add(item["id"])
    for item in liked:
        if reputable(item):
            add(item["id"])

    results = await asyncio.gather(*(_get_model_or_failed(r) for r in ids))
    failures = sum(1 for r in results if r is FAILED)
    models = _usable(results)[:limit]
    for rank, model in enumerate(models, start=1):
        model["trend"] = rank

    payload = {"models": models, "fetchedAt": int(time.time()), "source": "huggingface",
               "partial": failures > 0}
    # A partially-failed (rate-limited) blend must not masquerade as the real
    # list for the next 6 hours.
    if failures <= len(ids) * 0.3:
        cache.put(key, "trending", payload)
    return payload


@app.get("/api/search")
async def search(q: str = Query(min_length=1, max_length=200),
                 limit: int = Query(12, ge=1, le=30)):
    qn = " ".join(q.lower().split())
    key = f"search:{qn}"
    payload, age = cache.get(key)
    if payload is not None and age < SEARCH_TTL_S:
        return payload
    try:
        raw = await hf.list_models(search=qn, limit=24)
    except (HfError, httpx.HTTPError):
        if payload is not None:
            return payload
        raise HTTPException(503, "Hugging Face is unreachable and this search isn't cached.")

    results = await asyncio.gather(*(_get_model_or_failed(item["id"]) for item in raw))
    failures = sum(1 for r in results if r is FAILED)
    models = _usable(results)[:limit]

    payload = {"query": qn, "models": models, "fetchedAt": int(time.time()),
               "partial": failures > 0}
    if failures <= len(raw) * 0.3:
        cache.put(key, "search", payload)
    return payload


@app.get("/api/model/{repo_id:path}")
async def model(repo_id: str):
    repo_id = repo_id.strip().strip("/")
    if not is_valid_repo_id(repo_id):
        raise HTTPException(400, "Expected a Hugging Face org/name repo id.")
    try:
        m = await get_model_cached(repo_id)
    except HfError as e:
        if e.status == 404:
            raise HTTPException(404, f"No model named {repo_id} on Hugging Face.")
        raise HTTPException(502, "Hugging Face returned an error.")
    except httpx.HTTPError:
        raise HTTPException(503, "Hugging Face is unreachable.")
    if m is None:
        raise HTTPException(422, "Couldn't determine this model's parameter count.")
    return {"models": [m], "fetchedAt": int(time.time())}


class CachedStaticFiles(StaticFiles):
    """Vite assets are content-hashed — cache them forever. Everything else
    (index.html, robots.txt, ...) must revalidate so deploys take effect."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if path.startswith("assets/") or path.startswith("fonts/"):
            response.headers["cache-control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["cache-control"] = "no-cache"
        return response


# Serve the built frontend when it exists (mounted last so /api wins).
_DIST = Path(
    os.environ.get("FITCHECK_DIST")
    or Path(__file__).resolve().parents[2] / "frontend" / "dist"
)
if _DIST.is_dir():
    app.mount("/", CachedStaticFiles(directory=_DIST, html=True), name="frontend")
