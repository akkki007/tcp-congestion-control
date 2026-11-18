import { cn } from "@/lib/cn";

/*
 * High-level architecture, drawn once as an inline SVG so it scales cleanly on a projector.
 * Numbered badges ①–⑥ match the step list next to it.
 */

const MONO = "font-mono uppercase tracking-[0.06em]";

function Box({ x, y, w, h, title, sub, tone = "plain" }: { x: number; y: number; w: number; h: number; title: string; sub?: string; tone?: "plain" | "violet" | "blue" }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        className={cn(
          "stroke-[1.25]",
          tone === "violet" ? "fill-violet-50 stroke-violet-400" : tone === "blue" ? "fill-blue-50 stroke-blue-400" : "fill-surface stroke-line-strong",
        )}
      />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 5)} textAnchor="middle" className="fill-ink text-[15px] font-semibold">
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 17} textAnchor="middle" className="fill-ink-muted text-[12px]">
          {sub}
        </text>
      )}
    </g>
  );
}

function Region({ x, y, w, h, label, dashed }: { x: number; y: number; w: number; h: number; label: string; dashed?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill="none" strokeDasharray={dashed ? "5 4" : undefined} className={cn("stroke-[1.25]", dashed ? "stroke-ink-faint" : "stroke-line-strong")} />
      <rect x={x + 14} y={y - 9} width={label.length * 7.3 + 14} height={18} className="fill-surface" />
      <text x={x + 21} y={y + 4} className={cn(MONO, "fill-ink text-[11px] font-semibold")}>
        {label}
      </text>
    </g>
  );
}

function Badge({ x, y, n, tone = "violet" }: { x: number; y: number; n: number; tone?: "violet" | "ink" }) {
  return (
    <g>
      <circle cx={x} cy={y} r={12} className={tone === "violet" ? "fill-violet-700" : "fill-ink"} />
      <text x={x} y={y + 4.5} textAnchor="middle" className="fill-white text-[12.5px] font-semibold">
        {n}
      </text>
    </g>
  );
}

const CHIPS: [string, string, boolean][] = [
  ["CUBIC", "var(--color-viz-1)", false],
  ["BBR", "var(--color-viz-2)", true],
  ["RENO", "var(--color-viz-4)", false],
  ["VEGAS", "var(--color-viz-6)", false],
];

export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 1000 590" role="img" aria-label="ACCC architecture: application with LD_PRELOAD shim, kernel TCP socket, ACCC controller and live dashboard" className="h-auto w-full">
      <defs>
        <marker id="arch-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" className="fill-ink-muted" />
        </marker>
        <marker id="arch-arrow-v" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" className="fill-violet-700" />
        </marker>
      </defs>

      {/* Sender computer */}
      <Region x={20} y={24} w={570} h={480} label="Sender computer (unmodified Linux)" />
      <text x={44} y={62} className={cn(MONO, "fill-ink-faint text-[10.5px]")}>user space</text>
      <Region x={40} y={80} w={530} h={120} label="app process" dashed />
      <Box x={62} y={104} w={210} h={74} title="Application" sub="unchanged code" />
      <Box x={338} y={104} w={210} h={74} title="libaccc.so" sub="C shim · LD_PRELOAD" tone="violet" />

      <line x1={40} x2={570} y1={262} y2={262} strokeDasharray="5 4" className="stroke-line-strong" />
      <text x={44} y={284} className={cn(MONO, "fill-ink-faint text-[10.5px]")}>kernel</text>
      <rect x={62} y={300} width={486} height={130} rx={8} className="fill-surface stroke-line-strong stroke-[1.25]" />
      <text x={305} y={328} textAnchor="middle" className="fill-ink text-[15px] font-semibold">
        TCP socket
      </text>
      {CHIPS.map(([name, color, on], i) => (
        <g key={name}>
          <rect x={86 + i * 112} y={344} width={100} height={30} rx={6} style={on ? { fill: color, stroke: color } : { stroke: color }} className={on ? "" : "fill-surface stroke-[1.25]"} />
          <text x={136 + i * 112} y={364} textAnchor="middle" className={cn("text-[12.5px] font-semibold", on ? "fill-white" : "fill-ink")}>
            {name}
          </text>
        </g>
      ))}
      <text x={305} y={406} textAnchor="middle" className="fill-ink-muted text-[12px]">
        pluggable congestion control · switched per socket, mid-flow
      </text>

      {/* network */}
      <line x1={305} x2={305} y1={430} y2={530} markerEnd="url(#arch-arrow)" className="stroke-ink-muted stroke-[1.5]" />
      <Box x={205} y={534} w={200} h={44} title="Network → receiver" />

      {/* ACCC controller */}
      <Region x={640} y={24} w={340} h={406} label="ACCC controller (daemon)" />
      <Box x={670} y={56} w={280} h={60} title="Telemetry window" sub="last 10 samples · 500 ms" tone="violet" />
      <Box x={670} y={146} w={280} h={60} title="Feature extractor" sub="14 numbers: RTT, loss, rate, idle…" tone="violet" />
      <Box x={670} y={236} w={280} h={60} title="Classifier" sub="which algorithm fits this traffic?" tone="violet" />
      <Box x={670} y={326} w={280} h={60} title="Stability guard" sub="margin 0.15 · min dwell 200 ms" tone="violet" />
      {[116, 206, 296].map((y) => (
        <line key={y} x1={810} x2={810} y1={y} y2={y + 28} markerEnd="url(#arch-arrow-v)" className="stroke-violet-400 stroke-[1.5]" />
      ))}

      {/* Dashboard */}
      <Box x={670} y={494} w={280} h={64} title="Live dashboard" sub="Next.js · Server-Sent Events" tone="blue" />
      <line x1={810} x2={810} y1={430} y2={490} strokeDasharray="4 4" markerEnd="url(#arch-arrow)" className="stroke-blue-500 stroke-[1.5]" />

      {/* ① data path */}
      <line x1={167} x2={167} y1={178} y2={296} markerEnd="url(#arch-arrow)" className="stroke-ink-muted stroke-[2]" />
      {/* ② TCP_INFO up to the shim */}
      <path d="M400,300 V182" fill="none" strokeDasharray="5 4" markerEnd="url(#arch-arrow-v)" className="stroke-violet-500 stroke-[1.75]" />
      {/* ③ shim → controller */}
      <path d="M548,126 H612 V86 H666" fill="none" strokeDasharray="5 4" markerEnd="url(#arch-arrow-v)" className="stroke-violet-500 stroke-[1.75]" />
      {/* ④ guard → shim */}
      <path d="M670,356 H626 V160 H552" fill="none" markerEnd="url(#arch-arrow-v)" className="stroke-violet-700 stroke-[1.75]" />
      {/* ⑤ setsockopt down to the socket */}
      <path d="M500,178 V296" fill="none" markerEnd="url(#arch-arrow-v)" className="stroke-violet-700 stroke-[2]" />
      {/* the decision loop, alive */}
      <path d="M400,300 V182 M548,126 H612 V86 H666 M670,356 H626 V160 H552 M500,178 V296" fill="none" strokeLinecap="round" strokeDasharray="24 96" className="animate-map-pulse stroke-violet-700 stroke-[2.5] motion-reduce:hidden" />

      <Badge x={167} y={238} n={1} tone="ink" />
      <Badge x={400} y={240} n={2} />
      <Badge x={612} y={106} n={3} />
      <Badge x={810} y={311} n={4} />
      <Badge x={500} y={238} n={5} />
      <Badge x={810} y={460} n={6} tone="ink" />

      <text x={180} y={226} className="fill-ink-muted text-[11.5px]">send / recv</text>
      <text x={414} y={226} className="fill-ink-muted text-[11.5px]">TCP_INFO</text>
      <text x={414} y={242} className="fill-ink-muted text-[11.5px]">every 50 ms</text>
      <text x={514} y={226} className="fill-ink-muted text-[11.5px]">setsockopt</text>
    </svg>
  );
}

export const STEPS: [string, string][] = [
  ["The app talks to its socket as usual", "ACCC never touches the data. The program is not recompiled or changed."],
  ["The shim watches the socket", "Every 50 ms libaccc.so reads TCP_INFO: RTT, congestion window, retransmits, bytes acknowledged."],
  ["Telemetry goes to the controller", "Samples stream over a Unix socket as JSON lines, one connection per process."],
  ["The controller decides", "The last 500 ms become 14 features; the classifier picks an algorithm; the stability guard only lets a switch through if it is confident and not too soon."],
  ["The shim switches the algorithm", "setsockopt(TCP_CONGESTION) on the live socket — the connection keeps running, no bytes lost."],
  ["Everything is shown live", "Each decision streams to the dashboard over Server-Sent Events."],
];
