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
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .cache import Cache
from .hf import HfClient, HfError

MODEL_TTL_S = 30 * 24 * 3600   # 30 days
SEARCH_TTL_S = 30 * 24 * 3600  # 30 days
TRENDING_TTL_S = 6 * 3600      # 6 hours

UNUSABLE = {"unusable": True}  # negative-cache marker for un-sizeable repos

cache: Cache
hf: HfClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    global cache, hf
    cache = Cache()
    cache.purge_old()
    hf = HfClient()
    yield
    await hf.aclose()
    cache.close()


app = FastAPI(title="FitCheck", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


async def _get_model_or_none(repo_id: str):
    try:
        return await get_model_cached(repo_id)
    except (HfError, httpx.HTTPError):
        return None


@app.get("/api/health")
async def health():
    return {"ok": True, "time": int(time.time())}


@app.get("/api/trending")
async def trending(limit: int = Query(30, ge=1, le=50)):
    key = f"trending:text-generation:{limit}"
    payload, age = cache.get(key)
    if payload is not None and age < TRENDING_TTL_S:
        return payload
    try:
        # Over-fetch: some trending repos can't be sized and get filtered out.
        raw = await hf.list_models(sort="trendingScore", limit=min(limit * 2, 60))
    except (HfError, httpx.HTTPError):
        if payload is not None:
            return payload  # stale list beats no list
        raise HTTPException(503, "Hugging Face is unreachable and nothing is cached yet.")

    enriched = await asyncio.gather(*(_get_model_or_none(item["id"]) for item in raw))
    models = [m for m in enriched if m is not None][:limit]
    for rank, model in enumerate(models, start=1):
        model["trend"] = rank

    payload = {"models": models, "fetchedAt": int(time.time()), "source": "huggingface"}
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

    enriched = await asyncio.gather(*(_get_model_or_none(item["id"]) for item in raw))
    models = [m for m in enriched if m is not None][:limit]

    payload = {"query": qn, "models": models, "fetchedAt": int(time.time())}
    cache.put(key, "search", payload)
    return payload


@app.get("/api/model/{repo_id:path}")
async def model(repo_id: str):
    repo_id = repo_id.strip().strip("/")
    if repo_id.count("/") != 1:
        raise HTTPException(400, "Expected org/name.")
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


# Serve the built frontend when it exists (mounted last so /api wins).
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
