export function fmtGB(x) {
  if (x == null || isNaN(x)) return "—";
  if (x >= 100) return Math.round(x) + " GB";
  if (x >= 10) return x.toFixed(1) + " GB";
  return x.toFixed(2) + " GB";
}

export function fmtGBval(x) {
  if (x == null || isNaN(x)) return "—";
  if (x >= 100) return Math.round(x).toString();
  if (x >= 10) return x.toFixed(1);
  return x.toFixed(2);
}

export function fmtTokens(t) {
  if (t == null || isNaN(t)) return "—";
  if (t <= 0) return "0";
  if (t >= 1000000) return (t / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (t >= 1000) return Math.round(t / 1000) + "K";
  return Math.round(t / 256) * 256 + "";
}

export function fmtCtx(t) {
  if (t >= 1048576) return Math.round(t / 1048576) + "M";
  if (t >= 1024) return Math.round(t / 1024) + "K";
  return t + "";
}

// Context-slider step label: the last step means "anything above 256K".
export function fmtCtxStep(t) {
  return t >= 1048576 ? "256K+" : fmtCtx(t);
}

export function fmtParams(p) {
  if (p == null || isNaN(p)) return "—";
  if (p < 1) return (p * 1000).toFixed(0) + "M";
  if (p >= 100) return Math.round(p) + "B";
  return (p % 1 === 0 ? p : p.toFixed(1).replace(/\.0$/, "")) + "B";
}

export function fmtCount(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return "" + n;
}

export function fmtAgo(unixSeconds) {
  if (!unixSeconds) return "";
  const s = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}
