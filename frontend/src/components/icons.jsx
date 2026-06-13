import React from "react";

export function Icon({ d, size = 16, fill = "none", sw = 1.75, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}

export const ICONS = {
  chip: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9H1M3 15H1M23 9h-2M23 15h-2 M5 5h14v14H5z M9 9h6v6H9z",
  search: ["M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0", "M21 21l-4.3-4.3"],
  chevron: "M6 9l6 6 6-6",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
  calc: ["M5 3h14v18H5z", "M9 7h6M8 11h.01M12 11h.01M16 11v6M8 15h.01M12 15h.01M8 19h4"],
  fit: "M5 13l4 4L19 7",
  tight: "M12 8v5M12 16v.01",
  no: "M18 6L6 18M6 6l12 12",
  bolt: "M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z",
  cpu: ["M9 3v2M15 3v2M9 19v2M15 19v2M3 9H1M3 15H1M23 9h-2M23 15h-2", "M5 5h14v14H5z", "M9 9h6v6H9z"],
  refresh: ["M21 12a9 9 0 1 1-2.6-6.4", "M21 3v6h-6"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"],
  apple: "M16 3c-1 0-2.5.8-3 1.8M12 8c-2.2 0-4 1.9-4 4.5 0 3 2.2 6.5 4 6.5.8 0 1.2-.4 2-.4s1.2.4 2 .4c1.8 0 4-3.5 4-6.5C20 9.9 18.2 8 16 8c-1 0-1.4.4-2 .4S13 8 12 8z",
  download: ["M12 3v12", "M7 11l5 5 5-5", "M5 21h14"],
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  stack: ["M12 2l9 5-9 5-9-5 9-5z", "M3 12l9 5 9-5", "M3 17l9 5 9-5"],
  info: ["M12 12v5", "M12 8h.01", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
};
