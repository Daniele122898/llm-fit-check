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
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .cache import Cache, TTL_30D_S, UNUSABLE
from .hf import HfClient, HfError

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


# Famous models pinned into the trending tab regardless of today's
# trendingScore (it decays fast). Mix of flagship open-weight families and
# the GGUF mirrors people actually run locally; curated from HF's all-time
# likes / 30-day downloads on 2026-06-11. Unknown ids are skipped gracefully.
STAPLE_REPOS = [
    "meta-llama/Llama-3.3-70B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
    "meta-llama/Llama-3.2-3B-Instruct",
    "meta-llama/Llama-3.2-1B-Instruct",
    "Qwen/Qwen3-32B",
    "Qwen/Qwen3-14B",
    "Qwen/Qwen3-8B",
    "Qwen/Qwen3-4B-Instruct-2507",
    "Qwen/Qwen3-30B-A3B",
    "Qwen/Qwen3-235B-A22B",
    "Qwen/Qwen3-Coder-Next",
    "Qwen/QwQ-32B",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "deepseek-ai/DeepSeek-R1",
    "deepseek-ai/DeepSeek-R1-0528",
    "deepseek-ai/DeepSeek-V3.2",
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Flash",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    "google/gemma-3-27b-it",
    "google/gemma-3-12b-it",
    "google/gemma-3-4b-it",
    "google/gemma-2-9b-it",
    "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
    "mistralai/Mistral-Small-24B-Instruct-2501",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "mistralai/Ministral-8B-Instruct-2410",
    "mistralai/Devstral-Small-2505",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "microsoft/phi-4",
    "microsoft/Phi-4-mini-instruct",
    "zai-org/GLM-5.1",
    "zai-org/GLM-4.6",
    "zai-org/GLM-4.5-Air",
    "moonshotai/Kimi-K2-Instruct",
    "moonshotai/Kimi-K2-Thinking",
    "MiniMaxAI/MiniMax-M2.7",
    "MiniMaxAI/MiniMax-M2",
    "HuggingFaceTB/SmolLM3-3B",
    # GGUF mirrors — exact arch via header parse + exact quant file sizes
    "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    "unsloth/DeepSeek-R1-GGUF",
    "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
    "unsloth/Qwen3-30B-A3B-GGUF",
    "unsloth/gemma-3-27b-it-GGUF",
    "unsloth/gpt-oss-20b-GGUF",
    "unsloth/Llama-3.3-70B-Instruct-GGUF",
    "bartowski/phi-4-GGUF",
]

# Test fixtures that chart on raw download counts but mean nothing to users.
_JUNK_ID_RE = re.compile(r"tiny-random|internal-testing|dummy", re.I)


@app.get("/api/health")
async def health():
    return {"ok": True, "time": int(time.time())}


@app.get("/api/trending")
async def trending(limit: int = Query(60, ge=1, le=100)):
    """Front-page list: live trending first, then the famous staples and the
    most-downloaded / most-liked models — deduped, enriched, ranked."""
    key = f"trending:v2:text-generation:{limit}"
    payload, age = cache.get(key)
    if payload is not None and age < TRENDING_TTL_S:
        return payload

    hot, popular, liked = await asyncio.gather(
        hf.list_models(sort="trendingScore", limit=45),
        hf.list_models(sort="downloads", limit=30),
        hf.list_models(sort="likes", limit=30),
        return_exceptions=True,
    )
    hot, popular, liked = (x if isinstance(x, list) else [] for x in (hot, popular, liked))
    if not (hot or popular or liked):
        if payload is not None:
            return payload  # stale list beats no list
        raise HTTPException(503, "Hugging Face is unreachable and nothing is cached yet.")

    ids, seen = [], set()

    def add(repo_id):
        if _JUNK_ID_RE.search(repo_id):
            return
        k = repo_id.lower()
        if k not in seen:
            seen.add(k)
            ids.append(repo_id)

    for item in hot:
        add(item["id"])
    for repo_id in STAPLE_REPOS:
        add(repo_id)
    for item in popular:
        add(item["id"])
    for item in liked:
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
