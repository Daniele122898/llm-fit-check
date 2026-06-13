"""Async Hugging Face Hub client + model normalization.

Talks to the documented REST API directly with httpx (huggingface_hub is
sync-only). Endpoints used:
  - GET /api/models?search=&pipeline_tag=&sort=trendingScore&limit=   (list)
  - GET /api/models/{repo}    (includes safetensors/gguf param counts, config
                               summary, downloads, likes, gated — even for
                               gated repos, verified)
  - GET /{repo}/resolve/main/config.json   (full config; resolve URLs sit in a
                               much higher rate-limit bucket than /api)

Set HF_TOKEN in the environment to lift anonymous rate limits (500 req/5min).
"""

import asyncio
import os
import re
from urllib.parse import quote

import httpx

from .archparse import arch_from_gguf, estimate_arch, parse_hf_config
from .cache import TTL_30D_S, UNUSABLE
from .gguf import parse_gguf_meta

HF_BASE = "https://huggingface.co"
USER_AGENT = "fitcheck/0.1.0; httpx; (local LLM memory-fit calculator)"

DEFAULT_CTX_MAX = 32768

# Progressive prefix sizes for GGUF header reads. The architecture keys sit
# before the tokenizer arrays, so the first step almost always suffices.
GGUF_RANGE_STEPS = [128 * 1024, 1024 * 1024, 8 * 1024 * 1024]

_MOE_NAME_RE = re.compile(r"(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b\b", re.I)
_PARAMS_NAME_RE = re.compile(r"(\d+(?:\.\d+)?)\s*b\b", re.I)
_QUANT_SUFFIX_RE = re.compile(r"[-_](GGUF|GPTQ|AWQ|EXL2|MLX|bnb[-_]4bit|4bit|8bit)$", re.I)
_GGUF_SHARD_RE = re.compile(r"-(\d{5})-of-(\d{5})\.gguf$", re.I)
_GGUF_QUANT_RE = re.compile(
    r"(IQ[1-4]_[A-Z0-9]+(?:_[A-Z0-9]+)?|Q[2-8]_K_[SML]|Q[2-8]_K|Q[2-8]_[01]|BF16|FP16|F16|F32)(?=[.\-_ ]|$)",
    re.I,
)


class HfError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"HF API {status}: {message}")
        self.status = status


# Hugging Face repo ids: org/name, each segment alphanumeric plus . _ -
# Everything we interpolate into request paths must satisfy this — it rules
# out traversal dots-segments, query/fragment characters and absolute URLs.
REPO_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def is_valid_repo_id(repo_id: str) -> bool:
    return bool(REPO_ID_RE.match(repo_id)) and ".." not in repo_id


def params_from_name(s: str):
    """Parse a parameter count in billions out of a repo name, e.g. '8x7B'."""
    moe = _MOE_NAME_RE.search(s)
    if moe:
        # Rough MoE total: experts share attention, so total < n * expert_size
        return int(moe.group(1)) * float(moe.group(2)) * 0.85
    m = _PARAMS_NAME_RE.search(s)
    return float(m.group(1)) if m else None


def pretty_name(repo_id: str) -> str:
    name = repo_id.split("/")[-1]
    name = _QUANT_SUFFIX_RE.sub("", name)
    return name.replace("-", " ").replace("_", " ").strip()


def _base_model_of(info: dict):
    base = (info.get("cardData") or {}).get("base_model")
    if isinstance(base, list):
        base = base[0] if base else None
    return base if isinstance(base, str) and is_valid_repo_id(base) else None


def group_gguf_files(tree: list[dict]) -> list[dict]:
    """Collapse a repo file listing into one entry per published quant.

    Multi-part shards (-00001-of-00003.gguf) are summed into their group;
    vision projectors (mmproj-*) are skipped. The header parse later reads
    from `path`, which for shards points at part 00001 (headers live there).
    Returns entries sorted by size: {quant, sizeBytes, parts, path}.
    """
    groups: dict[str, dict] = {}
    for item in tree:
        if item.get("type") != "file":
            continue
        path = item.get("path", "")
        fname = path.rsplit("/", 1)[-1]
        if not fname.lower().endswith(".gguf") or fname.lower().startswith("mmproj"):
            continue
        size = (item.get("lfs") or {}).get("size") or item.get("size") or 0
        shard = _GGUF_SHARD_RE.search(fname)
        key = path[: shard.start()] if shard else path[:-len(".gguf")]
        g = groups.setdefault(key, {"sizeBytes": 0, "parts": 0, "path": path})
        g["sizeBytes"] += size
        g["parts"] += 1
        if shard and shard.group(1) == "00001":
            g["path"] = path

    out = []
    for key, g in groups.items():
        qm = _GGUF_QUANT_RE.search(key.rsplit("/", 1)[-1])
        if not qm or g["sizeBytes"] <= 0:
            continue
        quant = qm.group(1).upper()
        if quant == "FP16":
            quant = "F16"
        out.append({"quant": quant, "sizeBytes": g["sizeBytes"], "parts": g["parts"], "path": g["path"]})
    out.sort(key=lambda f: f["sizeBytes"])

    # Same quant published twice (root + subfolder): keep the first (smallest).
    seen: dict[str, dict] = {}
    for f in out:
        seen.setdefault(f["quant"], f)
    return list(seen.values())


class HfClient:
    def __init__(self, cache=None):
        headers = {"user-agent": USER_AGENT}
        token = os.environ.get("HF_TOKEN")
        if token:
            headers["authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(
            base_url=HF_BASE, headers=headers, timeout=20.0, follow_redirects=True
        )
        self._sem = asyncio.Semaphore(8)
        self._cache = cache  # used for gguf-header:{repo} entries (30-day)

    async def aclose(self):
        await self._client.aclose()

    async def _get(self, path: str, params=None) -> httpx.Response:
        async with self._sem:
            return await self._client.get(path, params=params)

    async def list_models(self, *, search=None, author=None, pipeline_tag="text-generation",
                          sort=None, limit=30) -> list[dict]:
        params = {"limit": limit}
        if search:
            params["search"] = search
        if author:
            params["author"] = author
        if pipeline_tag:
            params["pipeline_tag"] = pipeline_tag
        if sort:
            params["sort"] = sort
        r = await self._get("/api/models", params=params)
        if r.status_code != 200:
            raise HfError(r.status_code, r.text[:200])
        return r.json()

    async def family_flagships(self, author: str, match=None, take=4, scan=14) -> list[str]:
        """Current top text-gen repos for an org, by trendingScore — self-
        updating, so a new generation (Qwen3 -> Qwen3.6) surfaces without code
        changes, and canonical repos outrank their FP8/GGUF mirrors. `match` is
        a case-insensitive name substring for orgs that publish more than LLMs
        (google->gemma, microsoft->phi). Returns [] on any error so one bad
        family never sinks the trending blend."""
        try:
            raw = await self.list_models(author=author, sort="trendingScore", limit=scan)
        except (HfError, httpx.HTTPError):
            return []
        m = match.lower() if match else None
        out = []
        for item in raw:
            rid = item.get("id", "")
            name = rid.split("/")[-1].lower()
            if m and m not in name:
                continue
            # skip non-chat byproducts that still tag as text-generation
            if any(t in name for t in (
                "gguf", "-vl", "-vision", "audio", "-omni", "litert",
                "safeguard", "guard", "embed", "rerank", "-rm", "reward",
            )):
                continue
            out.append(rid)
            if len(out) >= take:
                break
        return out

    async def model_info(self, repo_id: str) -> dict:
        r = await self._get(f"/api/models/{repo_id}")
        if r.status_code != 200:
            raise HfError(r.status_code, r.text[:200])
        return r.json()

    async def file_json(self, repo_id: str, filename: str):
        """Fetch a repo file as JSON; None when missing/gated (401/403/404)."""
        r = await self._get(f"/{repo_id}/resolve/main/{filename}")
        if r.status_code != 200:
            return None
        try:
            return r.json()
        except ValueError:
            return None

    async def repo_tree(self, repo_id: str) -> list[dict]:
        """File listing with sizes. Follows pagination a couple of pages —
        GGUF repos rarely exceed one."""
        items: list[dict] = []
        url = f"/api/models/{repo_id}/tree/main"
        params = {"recursive": "true"}
        for _ in range(3):
            r = await self._get(url, params=params)
            if r.status_code != 200:
                break
            items.extend(r.json())
            nxt = r.links.get("next", {}).get("url")
            if not nxt:
                break
            url, params = nxt, None
        return items

    async def read_file_prefix(self, repo_id: str, path: str, size: int):
        """First `size` bytes of a repo file via a Range request (resolver
        URLs sit in HF's high rate-limit bucket). None on 4xx. Reads at most
        `size` bytes even if a server ignores Range and answers 200."""
        headers = {"range": f"bytes=0-{size - 1}"}
        safe_path = quote(path, safe="/")  # tree paths may hold spaces etc.
        async with self._sem:
            async with self._client.stream(
                "GET", f"/{repo_id}/resolve/main/{safe_path}", headers=headers
            ) as r:
                if r.status_code not in (200, 206):
                    return None
                chunks, got = [], 0
                async for chunk in r.aiter_bytes():
                    chunks.append(chunk)
                    got += len(chunk)
                    if got >= size:
                        break
        return b"".join(chunks)[:size]

    async def gguf_header_arch(self, repo_id: str, files: list[dict]):
        """Architecture from the GGUF file header (cached 30 days per repo).

        Range-fetches a progressively larger prefix of the smallest quant
        file until the architecture keys parse out. Network errors propagate
        (so transient failures aren't negative-cached); a genuinely
        unparseable file is cached as unusable.
        """
        if not is_valid_repo_id(repo_id):
            return None
        key = f"gguf-header:{repo_id.lower()}"
        if self._cache is not None:
            payload, age = self._cache.get(key)
            if payload is not None and age < TTL_30D_S:
                return None if payload == UNUSABLE else payload

        arch = None
        target = files[0]["path"]
        for step in GGUF_RANGE_STEPS:
            buf = await self.read_file_prefix(repo_id, target, step)
            if buf is None:
                break
            try:
                meta, complete = parse_gguf_meta(buf)
            except ValueError:
                break
            arch = arch_from_gguf(meta)
            if arch is not None or complete or len(buf) < step:
                break

        if arch is not None:
            arch["fromFile"] = target
        if self._cache is not None:
            self._cache.put(key, "gguf-header", arch if arch is not None else UNUSABLE)
        return arch

    async def enrich(self, repo_id: str):
        """Resolve one repo into the normalized model shape the frontend uses.

        Returns None when the model can't be sized (no parameter count from
        safetensors metadata, GGUF metadata, or the repo name).
        Raises HfError (404 etc.) when the repo doesn't exist.
        """
        if not is_valid_repo_id(repo_id):
            raise HfError(404, f"invalid repo id {repo_id!r}")
        info = await self.model_info(repo_id)
        canonical_id = info.get("id") or repo_id
        if not is_valid_repo_id(canonical_id):
            canonical_id = repo_id

        safetensors = info.get("safetensors") or {}
        gguf = info.get("gguf") or {}
        total_params = safetensors.get("total") or gguf.get("total")
        params_b = total_params / 1e9 if total_params else None
        name_params = params_from_name(canonical_id)
        if params_b is None:
            params_b = name_params
        elif not gguf.get("total") and name_params and params_b < name_params * 0.65:
            # 4-bit-packed safetensors (NVFP4/GPTQ/AWQ) underreport param
            # counts; trust the size in the repo name instead.
            params_b = name_params
        if not params_b:
            return None

        # GGUF repos: real per-quant file sizes from the (cheap) tree listing.
        gguf_files: list[dict] = []
        if gguf:
            try:
                gguf_files = group_gguf_files(await self.repo_tree(canonical_id))
            except (HfError, httpx.HTTPError):
                pass  # sizes are a bonus — never fail enrichment over them

        # Architecture, most authoritative source first: the repo's own
        # config.json, the GGUF file header (works even when the base model
        # is gated), the base model's config, then a size-based estimate.
        arch, arch_from, arch_source = None, None, "estimate"
        cfg = await self.file_json(canonical_id, "config.json")
        if cfg:
            arch = parse_hf_config(cfg)
            arch_source = "config" if arch else arch_source
        if arch is None and gguf_files:
            try:
                arch = await self.gguf_header_arch(canonical_id, gguf_files)
            except httpx.HTTPError:
                arch = None
            if arch is not None:
                arch_from = arch.pop("fromFile", None)
                arch_source = "gguf"
        if arch is None:
            base = _base_model_of(info)
            if base and base.lower() != canonical_id.lower():
                base_cfg = await self.file_json(base, "config.json")
                if base_cfg:
                    arch = parse_hf_config(base_cfg)
                    if arch is not None:
                        arch_from = base
                        arch_source = "base"
        estimated = arch is None
        if arch is None:
            arch = estimate_arch(params_b)

        ctx_max = arch.pop("ctxMax", None) or gguf.get("context_length") or DEFAULT_CTX_MAX
        moe = arch.pop("moe", False) or bool(_MOE_NAME_RE.search(canonical_id))
        arch.pop("modelType", None)
        arch.pop("fromFile", None)
        kv_layers = arch.pop("kvLayers", None)
        vocab = arch.pop("vocab", None)

        model = {
            "id": canonical_id,
            "repo": canonical_id,
            "name": pretty_name(canonical_id),
            "org": canonical_id.split("/")[0] if "/" in canonical_id else "",
            "params": round(params_b, 3),
            "layers": arch["layers"],
            "heads": arch.get("heads"),
            "kvHeads": arch["kvHeads"],
            "headDim": arch["headDim"],
            "kvLayers": kv_layers,
            "vocab": vocab,
            "ctxMax": int(ctx_max),
            "mla": arch.get("mla"),
            "swa": arch.get("swa"),
            "moe": moe,
            "gguf": bool(info.get("gguf")),
            "gated": info.get("gated", False),
            "downloads": info.get("downloads"),
            "likes": info.get("likes"),
            "estimated": estimated,
            "archFrom": arch_from,
            "archSource": arch_source,
            "ggufFiles": gguf_files or None,
        }
        return model
