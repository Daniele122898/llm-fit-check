#!/usr/bin/env python3
"""Pre-warm the FitCheck cache so the app goes live with a solid baseline.

Hits a running backend (default http://localhost:8400):
  1. the trending blend (live trending + famous staples + most downloaded/liked)
  2. searches for the big model families (warms the 30-day search cache AND
     every candidate model each search enriches)
  3. the GGUF mirrors people paste most often (exact quant sizes + header arch)

Paced to stay inside Hugging Face's anonymous budget (500 API req / 5 min);
run the backend with HF_TOKEN set to double it. Safe to re-run any time —
everything already cached costs nothing.

Usage: python scripts/warm_cache.py [base_url]
"""

import os
import sqlite3
import sys
import time
from pathlib import Path

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8400"
DB = Path(os.environ.get("FITCHECK_DB")
          or Path(__file__).resolve().parent.parent / "data" / "fitcheck.db")

SEARCHES = [
    "llama", "qwen", "deepseek", "gemma", "mistral",
    "phi", "gpt-oss", "glm", "kimi", "coder",
]

# Mostly GGUF mirrors (exact sizes via tree + header parse) plus a few
# originals that don't surface through trending/search warming.
REPOS = [
    "unsloth/gpt-oss-20b-GGUF",
    "unsloth/gpt-oss-120b-GGUF",
    "unsloth/gemma-3-27b-it-GGUF",
    "unsloth/gemma-3-12b-it-GGUF",
    "unsloth/Llama-3.3-70B-Instruct-GGUF",
    "unsloth/Llama-3.2-3B-Instruct-GGUF",
    "unsloth/Qwen3-32B-GGUF",
    "unsloth/Qwen3-8B-GGUF",
    "unsloth/Qwen3-30B-A3B-GGUF",
    "unsloth/DeepSeek-R1-0528-GGUF",
    "unsloth/GLM-4.6-GGUF",
    "unsloth/Kimi-K2-Instruct-GGUF",
    "unsloth/MiniMax-M2-GGUF",
    "unsloth/Mistral-Small-24B-Instruct-2501-GGUF",
    "bartowski/Qwen2.5-Coder-32B-Instruct-GGUF",
    "bartowski/Mistral-Small-24B-Instruct-2501-GGUF",
    "bartowski/google_gemma-3-27b-it-GGUF",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-Coder-7B-Instruct",
    "microsoft/Phi-3.5-mini-instruct",
]


def get(client, path, label, tries=3, backoff=90):
    for attempt in range(1, tries + 1):
        try:
            r = client.get(BASE + path, timeout=300)
        except httpx.HTTPError as e:
            print(f"  {label}: {type(e).__name__} — retrying in 30s")
            time.sleep(30)
            continue
        if r.status_code == 200:
            data = r.json()
            if data.get("partial") and attempt < tries:
                print(f"  {label}: partial (rate limited?) — backing off {backoff}s")
                time.sleep(backoff)
                continue
            return data
        if r.status_code in (429, 502, 503) and attempt < tries:
            print(f"  {label}: HTTP {r.status_code} — backing off {backoff}s")
            time.sleep(backoff)
            continue
        print(f"  {label}: HTTP {r.status_code} — skipped")
        return None
    return None


def main():
    t0 = time.time()
    with httpx.Client() as client:
        print(f"Warming {BASE} …\n")

        print("1/3 trending blend")
        data = get(client, "/api/trending?limit=100", "trending")
        print(f"  -> {len(data['models']) if data else 0} models\n")

        print("2/3 family searches")
        for q in SEARCHES:
            data = get(client, f"/api/search?q={q}", f"'{q}'")
            print(f"  '{q}': {len(data['models']) if data else 0} results")
            time.sleep(25)  # pacing: each cold search costs ~50 HF requests
        print()

        print("3/3 GGUF mirrors & extras")
        misses = []
        for repo in REPOS:
            data = get(client, f"/api/model/{repo}", repo, tries=2)
            if data is None:
                misses.append(repo)
            time.sleep(2)
        if misses:
            print("  not found / failed: " + ", ".join(misses))

    if DB.exists():
        conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        rows = conn.execute("SELECT kind, COUNT(*) FROM cache GROUP BY kind").fetchall()
        conn.close()
        stats = ", ".join(f"{kind}={n}" for kind, n in rows)
        print(f"\nDone in {int(time.time() - t0)}s. Cache: {stats}")


if __name__ == "__main__":
    main()
