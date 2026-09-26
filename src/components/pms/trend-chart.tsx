import { useState } from "react";
import { formatINR } from "@/lib/plix";
import type { DayPoint } from "@/lib/pms-analytics";

const W = 560;
const H = 220;
const PAD = { top: 12, right: 40, bottom: 26, left: 52 };

// Revenue as bars (left axis), occupancy % as a line (right axis). Plain SVG,
// scaled to the container width.
export function TrendChart({ points }: { points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue));
  const niceMax = Math.pow(10, Math.floor(Math.log10(maxRevenue))) * Math.ceil(maxRevenue / Math.pow(10, Math.floor(Math.log10(maxRevenue))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(1, points.length);
  const barW = Math.max(1, step * 0.7);
  const x = (i: number) => PAD.left + i * step + step / 2;
  const yRev = (v: number) => PAD.top + innerH - (v / niceMax) * innerH;
  const yOcc = (v: number) => PAD.top + innerH - (v / 100) * innerH;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yOcc(p.occupancy).toFixed(1)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const active = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="min-h-5 text-xs text-slate-500">
        {active ? (
          <span>
            <span className="font-semibold text-slate-800">{new Date(`${active.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> · Revenue{" "}
            <span className="font-semibold text-emerald-700">{formatINR(active.revenue)}</span> · Occupancy <span className="font-semibold text-amber-600">{active.occupancy}%</span> ({active.occupied}/{active.units})
          </span>
        ) : (
          "Hover or tap a day for details"
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Revenue and occupancy trend" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * (1 - t)} y2={PAD.top + innerH * (1 - t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={PAD.top + innerH * (1 - t) + 3} textAnchor="end" fontSize="11" fill="#94a3b8">
              {niceMax * t >= 1000 ? `${Math.round((niceMax * t) / 1000)}k` : Math.round(niceMax * t)}
            </text>
            <text x={W - PAD.right + 6} y={PAD.top + innerH * (1 - t) + 3} fontSize="11" fill="#d97706">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <rect x={x(i) - step / 2} y={PAD.top} width={step} height={innerH} fill="transparent" />
            <rect x={x(i) - barW / 2} y={yRev(p.revenue)} width={barW} height={PAD.top + innerH - yRev(p.revenue)} rx="1.5" fill={hover === i ? "#059669" : "#34d399"} />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">
                {new Date(`${p.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </text>
            )}
          </g>
        ))}
        <path d={line} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && points[hover] && <circle cx={x(hover)} cy={yOcc(points[hover]!.occupancy)} r="4" fill="#f59e0b" />}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-emerald-400" /> Revenue per night
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-amber-500" /> Occupancy %
        </span>
      </div>
    </div>
  );
}
