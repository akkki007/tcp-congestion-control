import type { Phase, Point, SwitchEvent } from "@/lib/accc";
import { ccColor } from "@/lib/accc";

const PHASE_FILL: Record<string, string> = {
  bulk: "var(--color-blue-50)",
  interactive: "var(--color-violet-50)",
};

function niceTicks(max: number, n = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => +(i * step).toFixed(6));
}

/**
 * A metric over time, in the style of magpie's `LineChart`: dashed hairline grid,
 * faint axis labels. The line is split into segments coloured by the active
 * algorithm, application phases are shaded bands, and each mid-flow switch is a
 * marker — so the chart itself shows *what changed, and what ACCC did about it*.
 */
export function Timeline({
  points,
  phases,
  switches,
  metric,
  unit,
  duration,
  height = 220,
  showPhaseLabels = true,
}: {
  points: Point[];
  phases: Phase[];
  switches: SwitchEvent[];
  metric: (p: Point) => number;
  unit: string;
  duration: number;
  height?: number;
  showPhaseLabels?: boolean;
}) {
  const w = 760;
  const h = height;
  const pad = { l: 44, r: 12, t: showPhaseLabels ? 22 : 8, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const values = points.map(metric);
  const ticks = niceTicks(Math.max(1e-9, ...values) * 1.1);
  const ymax = ticks[ticks.length - 1];
  const x = (t: number) => pad.l + (Math.min(t, duration) / duration) * plotW;
  const y = (v: number) => pad.t + plotH - (v / ymax) * plotH;

  // Split into runs of equal CC so each run gets its algorithm's colour.
  const runs: { cc: string; pts: Point[] }[] = [];
  for (const p of points) {
    const last = runs[runs.length - 1];
    if (last && last.cc === p.cc) last.pts.push(p);
    else runs.push({ cc: p.cc, pts: last ? [last.pts[last.pts.length - 1], p] : [p] });
  }
  const path = (pts: Point[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(metric(p)).toFixed(1)}`).join(" ");
  const xticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${unit} over time`}>
      {phases.map((ph, i) => {
        const end = phases[i + 1]?.t ?? duration;
        return (
          <g key={`${ph.phase}-${ph.t}`}>
            <rect
              x={x(ph.t)}
              y={pad.t}
              width={Math.max(0, x(end) - x(ph.t))}
              height={plotH}
              fill={PHASE_FILL[ph.phase] ?? "var(--color-subtle)"}
            />
            {showPhaseLabels && (
              <text x={x(ph.t) + 6} y={pad.t - 8} fontSize={10} fontWeight={600} fill="var(--color-ink-muted)" letterSpacing="0.06em">
                {ph.phase.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}

      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-line)"
            strokeDasharray={v === 0 ? undefined : "2 3"}
          />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--color-ink-faint)" className="tnum">
            {v >= 1000 ? `${v / 1000}k` : v}
          </text>
        </g>
      ))}
      {xticks.map((s) => (
        <text key={s} x={x(s)} y={h - 6} textAnchor="middle" fontSize={9} fill="var(--color-ink-faint)" className="tnum">
          {s}s
        </text>
      ))}

      {switches
        .filter((s) => s.ok)
        .map((s) => (
          <g key={`${s.t}-${s.to}`}>
            <line x1={x(s.t)} x2={x(s.t)} y1={pad.t} y2={pad.t + plotH} stroke={ccColor(s.to)} strokeDasharray="3 3" strokeWidth={1.25} />
            <circle cx={x(s.t)} cy={pad.t + 4} r={3.5} fill={ccColor(s.to)} stroke="var(--color-surface)" strokeWidth={1.5} />
          </g>
        ))}

      {runs.map((r, i) => (
        <path
          key={i}
          d={path(r.pts)}
          fill="none"
          stroke={ccColor(r.cc)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      <text x={pad.l} y={pad.t + plotH + 0} dy={-4} dx={4} fontSize={9} fill="var(--color-ink-faint)">
        {unit}
      </text>
    </svg>
  );
}
