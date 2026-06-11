// Thin client for the FitCheck backend (FastAPI + Hugging Face + SQLite cache).

async function getJSON(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch { /* not json */ }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function fetchTrending(limit = 30) {
  return getJSON(`/api/trending?limit=${limit}`, 45000);
}

export function searchModels(q) {
  return getJSON(`/api/search?q=${encodeURIComponent(q)}`, 45000);
}

export function resolveRepo(repo) {
  return getJSON(`/api/model/${repo}`);
}
