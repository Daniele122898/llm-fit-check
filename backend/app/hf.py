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

import httpx

from .archparse import estimate_arch, parse_hf_config

HF_BASE = "https://huggingface.co"
USER_AGENT = "fitcheck/0.1.0; httpx; (local LLM memory-fit calculator)"

DEFAULT_CTX_MAX = 32768

_MOE_NAME_RE = re.compile(r"(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b\b", re.I)
_PARAMS_NAME_RE = re.compile(r"(\d+(?:\.\d+)?)\s*b\b", re.I)
_QUANT_SUFFIX_RE = re.compile(r"[-_](GGUF|GPTQ|AWQ|EXL2|MLX|bnb[-_]4bit|4bit|8bit)$", re.I)


class HfError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"HF API {status}: {message}")
        self.status = status


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
    return base if isinstance(base, str) and base.count("/") == 1 else None


class HfClient:
    def __init__(self):
        headers = {"user-agent": USER_AGENT}
        token = os.environ.get("HF_TOKEN")
        if token:
            headers["authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(
            base_url=HF_BASE, headers=headers, timeout=20.0, follow_redirects=True
        )
        self._sem = asyncio.Semaphore(8)

    async def aclose(self):
        await self._client.aclose()

    async def _get(self, path: str, params=None) -> httpx.Response:
        async with self._sem:
            return await self._client.get(path, params=params)

    async def list_models(self, *, search=None, pipeline_tag="text-generation",
                          sort=None, limit=30) -> list[dict]:
        params = {"limit": limit}
        if search:
            params["search"] = search
        if pipeline_tag:
            params["pipeline_tag"] = pipeline_tag
        if sort:
            params["sort"] = sort
        r = await self._get("/api/models", params=params)
        if r.status_code != 200:
            raise HfError(r.status_code, r.text[:200])
        return r.json()

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

    async def enrich(self, repo_id: str):
        """Resolve one repo into the normalized model shape the frontend uses.

        Returns None when the model can't be sized (no parameter count from
        safetensors metadata, GGUF metadata, or the repo name).
        Raises HfError (404 etc.) when the repo doesn't exist.
        """
        info = await self.model_info(repo_id)
        canonical_id = info.get("id") or repo_id

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

        # Real architecture from config.json; for GGUF/quant repos fall back to
        # the base model's config; last resort is a size-based estimate.
        arch, arch_from, estimated = None, None, True
        cfg = await self.file_json(canonical_id, "config.json")
        if cfg:
            arch = parse_hf_config(cfg)
        if arch is None:
            base = _base_model_of(info)
            if base and base.lower() != canonical_id.lower():
                base_cfg = await self.file_json(base, "config.json")
                if base_cfg:
                    arch = parse_hf_config(base_cfg)
                    arch_from = base if arch else None
        if arch is not None:
            estimated = False
        else:
            arch = estimate_arch(params_b)

        ctx_max = arch.pop("ctxMax", None) or gguf.get("context_length") or DEFAULT_CTX_MAX
        moe = arch.pop("moe", False) or bool(_MOE_NAME_RE.search(canonical_id))
        arch.pop("modelType", None)

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
        }
        return model
