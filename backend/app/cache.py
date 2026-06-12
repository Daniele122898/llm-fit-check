"""SQLite-backed cache for Hugging Face API results.

One table, key-value with a fetched_at timestamp. TTL policy lives in the
caller (search/model entries are valid 30 days, the trending list 6 hours);
stale entries are kept so they can be served when Hugging Face is unreachable.
"""

import json
import os
import sqlite3
import threading
import time
from pathlib import Path

# Overridable for deployments (e.g. a mounted volume in Docker).
DEFAULT_DB_PATH = Path(
    os.environ.get("FITCHECK_DB")
    or Path(__file__).resolve().parent.parent / "data" / "fitcheck.db"
)

TTL_30D_S = 30 * 24 * 3600

# Negative-cache marker shared by every kind, so un-resolvable repos /
# unparseable GGUF headers aren't retried for the full TTL either.
UNUSABLE = {"unusable": True}

# Anything older than this is deleted on startup — stale-on-error fallback
# has diminishing value once the data is months old.
PURGE_AFTER_S = 60 * 24 * 3600


class Cache:
    def __init__(self, path: Path = DEFAULT_DB_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        # Tolerate a second writer (multi-worker deployments, warm script).
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS cache (
                key        TEXT PRIMARY KEY,
                kind       TEXT NOT NULL,
                payload    TEXT NOT NULL,
                fetched_at INTEGER NOT NULL
            )"""
        )
        self._conn.commit()
        self._lock = threading.Lock()

    def get(self, key: str):
        """Return (payload, age_seconds) or (None, None) when absent."""
        with self._lock:
            row = self._conn.execute(
                "SELECT payload, fetched_at FROM cache WHERE key = ?", (key,)
            ).fetchone()
        if row is None:
            return None, None
        return json.loads(row[0]), time.time() - row[1]

    def put(self, key: str, kind: str, payload) -> None:
        with self._lock:
            self._conn.execute(
                """INSERT INTO cache(key, kind, payload, fetched_at)
                   VALUES(?, ?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET
                     kind = excluded.kind,
                     payload = excluded.payload,
                     fetched_at = excluded.fetched_at""",
                (key, kind, json.dumps(payload), int(time.time())),
            )
            self._conn.commit()

    def purge_old(self, older_than_s: int = PURGE_AFTER_S) -> int:
        cutoff = int(time.time()) - older_than_s
        with self._lock:
            cur = self._conn.execute("DELETE FROM cache WHERE fetched_at < ?", (cutoff,))
            self._conn.commit()
        return cur.rowcount

    def close(self) -> None:
        with self._lock:
            self._conn.close()
