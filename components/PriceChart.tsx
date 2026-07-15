"use client";

import { useMemo, useRef, useState } from "react";
import type { OhlcvPoint } from "@/lib/types";
import { formatPrice, formatUsd } from "@/lib/format";

const W = 600;
const H = 260;
const PAD = 8;
const VOL_FRAC = 0.22; // bottom portion used for volume bars

export function PriceChart({ data }: { data: OhlcvPoint[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const pts = data.filter((d) => d.c != null);
    if (pts.length < 2) return null;

    const closes = pts.map((p) => p.c as number);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const priceH = H * (1 - VOL_FRAC) - PAD * 2;

    const volMax = Math.max(...pts.map((p) => p.v ?? 0), 1);
    const n = pts.length;
    const x = (i: number) => PAD + (i * (W - PAD * 2)) / (n - 1);
    const y = (p: number) => PAD + (1 - (p - min) / range) * priceH;
    const volH = (v: number) => ((v ?? 0) / volMax) * (H * VOL_FRAC - PAD);

    const linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.c as number).toFixed(2)}`)
      .join(" ");
    const areaPath =
      `M${x(0).toFixed(2)},${(H * (1 - VOL_FRAC)).toFixed(2)} ` +
      pts.map((p, i) => `L${x(i).toFixed(2)},${y(p.c as number).toFixed(2)}`).join(" ") +
      ` L${x(n - 1).toFixed(2)},${(H * (1 - VOL_FRAC)).toFixed(2)} Z`;

    const up = closes[closes.length - 1] >= closes[0];
    const color = up ? "#16c784" : "#ea3943";

    return { pts, x, y, volH, linePath, areaPath, color, n, min, max };
  }, [data]);

  if (!model) {
    return (
      <div className="chart-fallback muted">
        Not enough price history to draw a chart.
      </div>
    );
  }

  const { pts, x, y, volH, linePath, areaPath, color, n } = model;
  const hi = hover != null ? pts[hover] : null;
  const hiX = hover != null ? x(hover) : 0;
  const hiY = hover != null ? y(hi?.c as number) : 0;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="chart-svg"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Price chart"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {pts.map((p, i) => (
          <rect
            key={i}
            x={x(i) - (W - PAD * 2) / n / 2}
            y={H - PAD - volH(p.v ?? 0)}
            width={(W - PAD * 2) / n}
            height={volH(p.v ?? 0)}
            fill={color}
            opacity={0.18}
          />
        ))}

        <path d={areaPath} fill="url(#chartFill)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.6} />

        {hi && (
          <g>
            <line
              x1={hiX}
              y1={PAD}
              x2={hiX}
              y2={H - PAD}
              stroke={color}
              strokeWidth={0.8}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <circle cx={hiX} cy={hiY} r={3} fill={color} />
          </g>
        )}
      </svg>

      {hi && (
        <div className="chart-tip">
          <span className="mono">{formatPrice(hi.c)}</span>
          {hi.v != null && <span className="muted">Vol {formatUsd(hi.v)}</span>}
        </div>
      )}
    </div>
  );
}
