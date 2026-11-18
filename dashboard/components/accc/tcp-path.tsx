"use client";

import {
  Activity,
  AppWindow,
  BrainCircuit,
  Cpu,
  HardDriveDownload,
  Laptop,
  Network,
  Plug,
  Router,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { CcChip } from "@/components/accc/cc-chip";
import { ccColor, type Config, type Flow, type Point, type Summary, type SwitchEvent } from "@/lib/accc";
import { cn } from "@/lib/cn";

/*
 * The TCP path as a graph, after kaizen's GraphMap (github.com/akkki007/kaizen, ui/components/graph-map.tsx):
 * square icon tiles laid out with plain flexbox, orthogonal connectors measured from the rendered
 * tiles, and a pulse running along the edge the story is about. On top of that this view animates
 * the traffic itself: data segments sender → receiver, ACKs back, TCP_INFO telemetry up to the
 * controller and the setsockopt(TCP_CONGESTION) command back down.
 */

export const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.06em]";
const TILE = 52;

type NodeId = "app" | "shim" | "tcp" | "nic" | "router" | "rnic" | "rtcp" | "sink" | "features" | "classifier" | "guard";

type Box = { l: number; r: number; t: number; b: number; cx: number; cy: number };
type Lanes = { data: string; ack: string; tel: string; cmd: string };
type Geometry = { lines: { d: string; kind: "data" | "ack" | "ctl" }[]; tags: { x: number; y: number; text: string; align?: "l" | "r" | "c" }[]; lanes: Lanes; routerX: number };

export function Tile<T extends string>({ id, icon, label, fill, tone, selected = false, onClick }: { id: T; icon: ReactNode; label: string; fill?: string; tone?: "amber" | "green"; selected?: boolean; onClick?: (id: T) => void }) {
  return (
    <button
      type="button"
      data-tile={id}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onClick?.(id)}
      style={{ width: TILE, height: TILE, ...(fill ? { background: fill, borderColor: "transparent" } : {}) }}
      className={cn(
        "relative z-10 grid shrink-0 place-items-center border transition-[box-shadow,transform,background-color] duration-300 hover:-translate-y-px",
        fill ? "text-white" : "border-line-strong bg-surface text-ink",
        !fill && tone === "amber" && "border-[#d9a400] text-[#a87f00]",
        !fill && tone === "green" && "border-pos-fg text-pos-fg",
        selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-surface",
      )}
    >
      {icon}
    </button>
  );
}

export function Node({ children, caption, sub }: { children: ReactNode; caption: string; sub?: ReactNode }) {
  return (
    <div className="flex w-[84px] flex-col items-center gap-1.5">
      {children}
      <span className={cn(LABEL, "h-4 whitespace-nowrap text-ink-2")}>{caption}</span>
      <span className="h-5 text-[11px] text-ink-muted">{sub}</span>
    </div>
  );
}

export function Frame({ label, icon, note, dashed, className, children }: { label: string; icon?: ReactNode; note?: string; dashed?: boolean; className?: string; children: ReactNode }) {
  return (
    <div data-frame={label} className={cn("relative border px-5 pt-7 pb-3", dashed ? "border-dashed border-ink-faint" : "border-line-strong", className)}>
      <p className={cn(LABEL, "absolute -top-2 left-3 inline-flex items-center gap-1.5 bg-surface px-1.5 font-semibold text-ink")}>
        {icon}
        {label}
        {note && <span className="font-normal normal-case tracking-normal text-ink-faint">{note}</span>}
      </p>
      {children}
    </div>
  );
}

/** Orthogonal polyline through points: horizontal first, a vertical step half-way between columns. */
function orth(pts: [number, number][]) {
  let d = "";
  pts.forEach(([x, y], i) => {
    if (!i) return void (d = `M${x},${y}`);
    const [px, py] = pts[i - 1];
    if (Math.abs(py - y) < 0.5) d += ` H${x}`;
    else if (Math.abs(px - x) < 0.5) d += ` V${y}`;
    else d += ` H${(px + x) / 2} V${y} H${x}`;
  });
  return d;
}

function useGeometry(root: RefObject<HTMLDivElement | null>) {
  const [geo, setGeo] = useState<Geometry | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const box = (q: string): Box | null => {
        const t = el.querySelector(q);
        if (!t) return null;
        const r = t.getBoundingClientRect();
        const l = r.left - base.left;
        const top = r.top - base.top;
        return { l, r: l + r.width, t: top, b: top + r.height, cx: l + r.width / 2, cy: top + r.height / 2 };
      };
      const n = (id: NodeId) => box(`[data-tile="${id}"]`)!;
      const ids: NodeId[] = ["app", "shim", "tcp", "nic", "router", "rnic", "rtcp", "sink", "features", "classifier", "guard"];
      if (ids.some((id) => !box(`[data-tile="${id}"]`))) return;
      const [app, shim, tcp, nic, router, rnic, rtcp, sink, feat, cls, guard] = ids.map(n);
      const daemon = box('[data-frame="ACCC controller"]')!;
      const host = box('[data-frame="Sender computer"]')!;

      const D = -6; // data lane above the centre line, ACKs below
      const A = 6;
      const path = [app, tcp, nic, router, rnic, rtcp, sink];
      const lines: Geometry["lines"] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        lines.push({ d: orth([[a.r, a.cy + D], [b.l - 3, b.cy + D]]), kind: "data" });
        if (i >= 1 && i <= 4) lines.push({ d: orth([[b.l, b.cy + A], [a.r + 3, a.cy + A]]), kind: "ack" });
      }

      // Control loop: kernel -> shim (getsockopt TCP_INFO) -> controller, and back (setsockopt).
      // Both horizontal runs live in the gap between the controller and the sender computer.
      const y1 = daemon.b + (host.t - daemon.b) * 0.4;
      const y2 = daemon.b + (host.t - daemon.b) * 0.75;
      lines.push({ d: `M${tcp.cx + 6},${tcp.t} V${shim.cy - 6} H${shim.r + 3}`, kind: "ctl" });
      lines.push({ d: `M${shim.cx - 6},${shim.t} V${y1} H${feat.cx} V${daemon.b + 3}`, kind: "ctl" });
      lines.push({ d: `M${feat.r},${feat.cy} H${cls.l - 3}`, kind: "ctl" });
      lines.push({ d: `M${cls.r},${cls.cy} H${guard.l - 3}`, kind: "ctl" });
      lines.push({ d: `M${guard.cx},${daemon.b} V${y2} H${shim.cx + 6} V${shim.t - 3}`, kind: "ctl" });
      lines.push({ d: `M${shim.r},${shim.cy + 6} H${tcp.cx - 6} V${tcp.t - 3}`, kind: "ctl" });

      const lanes: Lanes = {
        data: orth(path.map((p) => [p.cx, p.cy + D])),
        ack: orth([rtcp, rnic, router, nic, tcp].map((p) => [p.cx, p.cy + A])),
        tel: `M${tcp.cx + 6},${tcp.cy} V${shim.cy - 6} H${shim.cx - 6} V${y1} H${feat.cx} V${feat.cy} H${guard.cx}`,
        cmd: `M${guard.cx},${guard.cy} V${y2} H${shim.cx + 6} V${shim.cy + 6} H${tcp.cx - 6} V${tcp.cy}`,
      };
      const tags: Geometry["tags"] = [
        { x: (app.r + tcp.l) / 2, y: app.cy - 22, text: "send()", align: "c" },
        { x: (nic.r + router.l) / 2, y: nic.cy - 22, text: "segments →", align: "c" },
        { x: (router.r + rnic.l) / 2, y: router.cy - 22, text: "segments →", align: "c" },
        { x: (nic.r + router.l) / 2, y: nic.cy + 14, text: "← acks", align: "c" },
        { x: (router.r + rnic.l) / 2, y: router.cy + 14, text: "← acks", align: "c" },
        { x: (rtcp.r + sink.l) / 2, y: rtcp.cy - 22, text: "recv()", align: "c" },
        { x: tcp.cx + 12, y: (shim.cy + tcp.t) / 2 - 2, text: "TCP_INFO · 50 ms", align: "l" },
        { x: feat.cx - 8, y: daemon.b + 4, text: "telemetry ↑", align: "r" },
        { x: guard.cx + 8, y: daemon.b + 4, text: "↓ switch command", align: "l" },
        { x: tcp.cx - 12, y: shim.cy + 10, text: "setsockopt", align: "r" },
      ];
      setGeo({ lines, tags, lanes, routerX: router.cx });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return geo;
}

/* ── Packet animation ─────────────────────────────────────────────────────── */

type Lane = keyof Lanes;
type Packet = { lane: Lane; born: number; dur: number; color: string; drop?: number; ack?: boolean };
const POOL = 220;
/** width, height, corner radius per packet kind */
const SHAPES: Record<string, [number, number, number]> = { data: [10, 6, 1.5], drop: [10, 6, 1.5], ack: [5, 5, 2.5], tel: [5, 5, 2.5], cmd: [10, 10, 2] };

type Live = { running: boolean; rate: number; color: string; loss: number; dur: number };

function usePackets(svg: RefObject<SVGSVGElement | null>, geo: Geometry | null, live: RefObject<Live>, kick: RefObject<{ tel: number; cmd: number }>) {
  useEffect(() => {
    const host = svg.current;
    if (!host || !geo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const paths = Object.fromEntries((Object.keys(geo.lanes) as Lane[]).map((k) => [k, host.querySelector<SVGPathElement>(`[data-lane="${k}"]`)!])) as Record<Lane, SVGPathElement>;
    const len = Object.fromEntries((Object.keys(paths) as Lane[]).map((k) => [k, paths[k].getTotalLength()])) as Record<Lane, number>;
    const els = Array.from(host.querySelectorAll<SVGGElement>("[data-pkt]"));
    // The router sits at a fixed fraction of the data lane; a dropped segment stops there.
    const routerAt = (() => {
      const p = paths.data;
      let best = 0.5;
      let bestD = Infinity;
      const rx = geo.routerX;
      for (let i = 0; i <= 100; i++) {
        const pt = p.getPointAtLength((len.data * i) / 100);
        const d = Math.abs(pt.x - rx);
        if (d < bestD) [bestD, best] = [d, i / 100];
      }
      return best;
    })();
    const packets: (Packet | null)[] = Array(els.length).fill(null);
    let acc = 0;
    let delayedAck = 0;
    let last = performance.now();
    let raf = 0;
    const spawn = (p: Packet) => {
      const i = packets.indexOf(null);
      if (i >= 0) packets[i] = p;
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      if (L.running) {
        acc += dt * L.rate;
        while (acc >= 1) {
          acc -= 1;
          spawn({ lane: "data", born: now, dur: L.dur, color: L.color, drop: Math.random() < L.loss ? routerAt : undefined });
        }
      }
      const k = kick.current;
      while (k.tel > 0) {
        k.tel--;
        spawn({ lane: "tel", born: now, dur: 1300, color: "var(--color-violet-500)" });
      }
      while (k.cmd > 0) {
        k.cmd--;
        spawn({ lane: "cmd", born: now, dur: 1100, color: "var(--color-violet-700)" });
      }
      for (let i = 0; i < els.length; i++) {
        const p = packets[i];
        const el = els[i];
        if (!p) {
          if (el.style.display !== "none") el.style.display = "none";
          continue;
        }
        let f = (now - p.born) / p.dur;
        const end = p.drop ?? 1;
        if (f >= end + (p.drop !== undefined ? 0.12 : 0)) {
          if (p.lane === "data" && p.drop === undefined && ++delayedAck % 2 === 0) {
            spawn({ lane: "ack", born: now, dur: p.dur * 0.62, color: "var(--color-ink-muted)", ack: true });
          }
          packets[i] = null;
          el.style.display = "none";
          continue;
        }
        const dropping = p.drop !== undefined && f > p.drop;
        f = Math.min(f, end);
        const pt = paths[p.lane].getPointAtLength(f * len[p.lane]);
        el.style.display = "";
        el.setAttribute("transform", `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
        const shape = el.firstElementChild as SVGElement;
        const kind = dropping ? "drop" : p.lane === "data" ? "data" : p.lane === "ack" ? "ack" : p.lane;
        if (el.dataset.kind !== kind) {
          el.dataset.kind = kind;
          const [w, h, r] = SHAPES[kind];
          for (const [a, v] of [["x", -w / 2], ["y", -h / 2], ["width", w], ["height", h], ["rx", r]] as const) shape.setAttribute(a, String(v));
        }
        shape.style.fill = dropping ? "var(--color-neg-fg)" : p.ack ? "var(--color-surface)" : p.color;
        shape.style.stroke = p.ack ? "var(--color-ink-muted)" : "none";
        el.style.opacity = dropping ? String(Math.max(0, 1 - ((now - p.born) / p.dur - p.drop!) / 0.12)) : "1";
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [svg, geo, live, kick]);
}

/* ── Explanations ─────────────────────────────────────────────────────────── */

const INFO: Record<NodeId, { kind: string; title: string; text: string }> = {
  app: { kind: "Sender · user space", title: "Application", text: "An ordinary, unmodified program that writes to a TCP socket with send(). It alternates bulk transfer and sparse interactive messages, which is what ACCC has to detect." },
  shim: { kind: "Sender · inside the app process", title: "libaccc.so (LD_PRELOAD shim)", text: "Loaded into the app with LD_PRELOAD. It never touches the data: it samples getsockopt(TCP_INFO) every 50 ms, forwards it to the controller, and applies switch commands with setsockopt(TCP_CONGESTION)." },
  tcp: { kind: "Sender · kernel", title: "TCP socket", text: "The kernel's TCP state for this connection. The congestion-control algorithm (the colour) decides how many segments may be in flight — the congestion window. ACCC changes it while the connection stays open." },
  nic: { kind: "Sender · kernel", title: "Network interface", text: "Segments leave the host here; returning ACKs arrive here and clock out new data." },
  router: { kind: "Network path", title: "Bottleneck link", text: "The narrowest point on the path. When a sender pushes faster than it drains, a queue builds (RTT inflation) and eventually segments are dropped and retransmitted. Loss-based algorithms like CUBIC fill this queue; BBR tries to keep it short." },
  rnic: { kind: "Receiver · kernel", title: "Network interface", text: "Segments arrive at the receiving computer." },
  rtcp: { kind: "Receiver · kernel", title: "TCP socket", text: "Reassembles segments in order and sends cumulative ACKs back (one per two segments: delayed ACK)." },
  sink: { kind: "Receiver · user space", title: "Sink application", text: "Reads every byte with recv(). At the end the demo checks that bytes received equals bytes sent, proving the switches never broke the connection." },
  features: { kind: "Controller", title: "Feature extractor", text: "Keeps a sliding window of the last 10 TCP_INFO samples (500 ms) and turns it into 14 features: RTT, RTT inflation, loss, cwnd, throughput, burstiness, idle fraction, …" },
  classifier: { kind: "Controller", title: "Classifier", text: "Maps the feature vector to a probability for each algorithm. Currently a transparent rule-based policy; a trained Random Forest replaces it behind the same interface." },
  guard: { kind: "Controller", title: "Stability guard", text: "Only lets a switch through if the winner beats the active algorithm by a confidence margin AND the current algorithm has been in place for the minimum dwell time — no flapping." },
};

/* ── The view ─────────────────────────────────────────────────────────────── */

export function TcpPathGraph({ config, flow, last, phase, switches, running, summary }: { config: Config | null; flow: Flow | null; last: Point | undefined; phase: string | undefined; switches: SwitchEvent[]; running: boolean; summary: Summary | null }) {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const geo = useGeometry(root);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const toggle = (id: NodeId) => setSelected((s) => (s === id ? null : id));

  const cc = flow?.cc ?? last?.cc;
  const color = cc ? ccColor(cc) : "var(--color-ink-faint)";
  const tput = last?.tput ?? 0;
  const inflation = last?.features.rtt_inflation ?? 1;
  const loss = last?.features.loss_ratio ?? 0;
  const queue = Math.max(0, Math.min(1, (inflation - 1) / 1.2));
  const sim = config?.mode === "simulated";

  // Everything the animation loop needs, read through a ref so the loop never restarts.
  const live = useRef<Live>({ running: false, rate: 0, color, loss: 0, dur: 2200 });
  live.current = {
    running: running && !!flow && !summary,
    rate: 1.5 + 14 * Math.min(1, Math.log10(tput + 1) / 2.3),
    color,
    loss: Math.min(0.35, loss * 25),
    dur: 2000 * Math.min(1.8, Math.pow(Math.max(1, inflation), 0.5)),
  };
  const kick = useRef({ tel: 0, cmd: 0 });
  const seen = useRef({ points: 0, switches: 0, t: -1 });
  useEffect(() => {
    const s = seen.current;
    if (last && last.t !== s.t) {
      if (s.t > last.t) s.points = 0; // a new run started
      s.t = last.t;
      if (++s.points % 3 === 0) kick.current.tel++;
    }
  }, [last]);
  const [flash, setFlash] = useState<SwitchEvent | null>(null);
  useEffect(() => {
    const s = seen.current;
    if (switches.length < s.switches) s.switches = 0;
    if (switches.length > s.switches) {
      const sw = switches[switches.length - 1];
      kick.current.cmd++;
      setFlash(sw);
      const id = setTimeout(() => setFlash(null), 1600);
      s.switches = switches.length;
      return () => clearTimeout(id);
    }
  }, [switches]);

  usePackets(svg, geo, live, kick);

  const sender = flow?.src ?? "—";
  const receiver = flow?.dst ?? "—";
  const icon = (I: typeof Cpu) => <I size={20} strokeWidth={1.6} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-control border border-line bg-surface">
        <div ref={root} className="relative mx-auto w-max px-6 pt-8 pb-6">
          <svg ref={svg} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <defs>
              <marker id="tcp-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L6,3 L0,6 z" fill="var(--color-ink-faint)" />
              </marker>
            </defs>
            {geo?.lines.map((l, i) => (
              <path
                key={i}
                d={l.d}
                fill="none"
                markerEnd="url(#tcp-arrow)"
                stroke={l.kind === "ctl" ? "var(--color-violet-400)" : "var(--color-ink-faint)"}
                strokeOpacity={l.kind === "ctl" ? 0.6 : 0.8}
                strokeWidth={1}
                strokeDasharray={l.kind === "data" ? undefined : "3 3"}
              />
            ))}
            {geo && (
              <>
                {(Object.keys(geo.lanes) as Lane[]).map((k) => (
                  <path key={k} data-lane={k} d={geo.lanes[k]} fill="none" stroke="none" />
                ))}
                {flash && <path d={geo.lanes.cmd} fill="none" stroke="var(--color-violet-700)" strokeWidth={2} strokeLinecap="round" strokeDasharray="24 96" className="animate-map-pulse motion-reduce:hidden" />}
              </>
            )}
            {Array.from({ length: POOL }, (_, i) => (
              <g key={i} data-pkt style={{ display: "none" }}>
                <rect />
              </g>
            ))}
          </svg>
          {geo?.tags.map((t, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(LABEL, "pointer-events-none absolute whitespace-nowrap text-[9.5px] text-ink-faint", t.align === "c" && "-translate-x-1/2", t.align === "r" && "-translate-x-full")}
              style={{ left: t.x, top: t.y }}
            >
              {t.text}
            </span>
          ))}

          <div className="relative flex items-end gap-11">
            {/* Sender computer, with the controller above it */}
            <div className="flex flex-col gap-16">
              <Frame label="ACCC controller" note="accc daemon · unix socket" className="ml-[150px] self-start">
                <div className="flex items-start gap-6">
                  <Node caption="Features" sub={last ? `${(last.features.rtt_inflation ?? 1).toFixed(2)}× rtt` : "14 inputs"}>
                    <Tile id="features" label="Feature extractor" icon={icon(Activity)} selected={selected === "features"} onClick={toggle} />
                  </Node>
                  <Node caption="Classifier" sub={last ? `→ ${last.target.toUpperCase()}` : "—"}>
                    <Tile id="classifier" label="Classifier" icon={icon(BrainCircuit)} selected={selected === "classifier"} onClick={toggle} />
                  </Node>
                  <Node caption="Guard" sub={last ? (last.switch ? "switch" : "keep") : "—"}>
                    <Tile id="guard" label="Stability guard" icon={icon(ShieldCheck)} fill={flash ? "var(--color-violet-700)" : undefined} selected={selected === "guard"} onClick={toggle} />
                  </Node>
                </div>
              </Frame>

              <Frame label="Sender computer" icon={<Laptop size={13} strokeWidth={1.8} />} note={sender}>
                <div className="flex items-end gap-7">
                  <div data-frame="app process" className="relative flex flex-col items-center gap-6 border border-dashed border-ink-faint px-2 pt-6 pb-1">
                    <span className={cn(LABEL, "absolute -top-2 left-2 bg-surface px-1 text-[9.5px] text-ink-faint")}>app process</span>
                    <Node caption="libaccc.so" sub="LD_PRELOAD">
                      <Tile id="shim" label="libaccc.so shim" icon={icon(Plug)} selected={selected === "shim"} onClick={toggle} />
                    </Node>
                    <Node caption="App" sub={phase ? phase : "idle"}>
                      <Tile id="app" label="Application" icon={icon(AppWindow)} selected={selected === "app"} onClick={toggle} />
                    </Node>
                  </div>
                  <Node caption="TCP socket" sub={cc ? <CcChip cc={cc} /> : "no flow"}>
                    <Tile id="tcp" label="Sender TCP socket" icon={icon(Cpu)} fill={cc ? color : undefined} selected={selected === "tcp"} onClick={toggle} />
                  </Node>
                  <Node caption="NIC" sub={last ? `cwnd ${Math.round(last.cwnd)}` : "—"}>
                    <Tile id="nic" label="Sender network interface" icon={icon(Network)} selected={selected === "nic"} onClick={toggle} />
                  </Node>
                </div>
              </Frame>
            </div>

            {/* The network path */}
            <div className="flex flex-col items-center pb-3">
              <span className={cn(LABEL, "mb-2 text-ink-faint")}>{sim ? "100 Mb/s · 20 ms" : "loopback"}</span>
              <QueueMeter fill={queue} loss={loss} />
              <Node caption={sim ? "Bottleneck" : "lo"} sub={last ? `${last.rtt.toFixed(last.rtt < 1 ? 3 : 1)} ms rtt` : "—"}>
                <Tile id="router" label="Bottleneck link" icon={icon(Router)} tone={queue > 0.45 ? "amber" : undefined} selected={selected === "router"} onClick={toggle} />
              </Node>
            </div>

            {/* Receiver computer */}
            <Frame label="Receiver computer" icon={<Server size={13} strokeWidth={1.8} />} note={receiver}>
              <div className="flex items-end gap-7">
                <Node caption="NIC" sub="">
                  <Tile id="rnic" label="Receiver network interface" icon={icon(Network)} selected={selected === "rnic"} onClick={toggle} />
                </Node>
                <Node caption="TCP socket" sub="delayed ack">
                  <Tile id="rtcp" label="Receiver TCP socket" icon={icon(Cpu)} selected={selected === "rtcp"} onClick={toggle} />
                </Node>
                <Node caption="Sink" sub={summary ? (summary.intact ? "all bytes ✓" : "bytes missing") : running ? "receiving" : "—"}>
                  <Tile id="sink" label="Sink application" icon={icon(HardDriveDownload)} tone={summary?.intact ? "green" : undefined} selected={selected === "sink"} onClick={toggle} />
                </Node>
              </div>
            </Frame>
          </div>

          {flash && (
            <div className="absolute top-3 right-4 z-20 rounded-control border border-violet-200 bg-violet-50 px-3 py-1.5 font-mono text-[11.5px] text-violet-700 shadow-e2">
              setsockopt(TCP_CONGESTION, &quot;{flash.to}&quot;) {flash.ok ? "✓" : "✗"}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-muted">
        <Key swatch={<i className="inline-block h-[6px] w-[10px] rounded-[1.5px]" style={{ background: color }} />}>Data segment (colour = algorithm that sent it)</Key>
        <Key swatch={<i className="inline-block size-[6px] rounded-full border border-ink-muted bg-surface" />}>ACK</Key>
        <Key swatch={<i className="inline-block size-[6px] rounded-full bg-violet-500" />}>TCP_INFO telemetry</Key>
        <Key swatch={<i className="inline-block size-[9px] rounded-[2px] bg-violet-700" />}>Switch command</Key>
        <Key swatch={<i className="inline-block h-[6px] w-[10px] rounded-[1.5px] bg-neg-fg" />}>Dropped at the bottleneck</Key>
        <span className="ml-auto text-ink-faint">Click any node to see what it does.</span>
      </div>

      {selected && <Explain id={selected} onClose={() => setSelected(null)} last={last} cc={cc} config={config} />}
    </div>
  );
}

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

/** Eight queue slots above the bottleneck: how much standing queue the active algorithm builds. */
function QueueMeter({ fill, loss }: { fill: number; loss: number }) {
  const n = Math.round(fill * 8);
  return (
    <div className="mb-3 flex flex-col items-center gap-1" title={`Queue ≈ ${Math.round(fill * 100)}% · loss ${(loss * 100).toFixed(2)}%`}>
      <div className="flex gap-[3px]">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} className={cn("h-3 w-[7px] border transition-colors duration-300", i < n ? (n >= 6 ? "border-[#d9a400] bg-chip-amber" : "border-blue-300 bg-blue-100") : "border-line-strong bg-surface")} />
        ))}
      </div>
      <span className={cn(LABEL, "text-[9.5px] text-ink-faint")}>queue</span>
    </div>
  );
}

function Explain({ id, onClose, last, cc, config }: { id: NodeId; onClose: () => void; last: Point | undefined; cc: string | undefined; config: Config | null }) {
  const info = INFO[id];
  const f = last?.features;
  const facts: [string, ReactNode][] = [];
  if (id === "tcp" || id === "nic") {
    facts.push(["Algorithm", cc ? <CcChip cc={cc} /> : "—"], ["cwnd", f ? `${Math.round(f.cwnd_mean)} segments` : "—"], ["Throughput", f ? `${f.tput_mbps.toFixed(1)} Mb/s` : "—"], ["Retransmits", f ? `${(f.loss_ratio * 100).toFixed(2)} %` : "—"]);
  } else if (id === "router") {
    facts.push(["Smoothed RTT", f ? `${f.rtt_mean_ms.toFixed(2)} ms` : "—"], ["Min RTT", f ? `${f.min_rtt_ms.toFixed(2)} ms` : "—"], ["RTT inflation", f ? `${f.rtt_inflation.toFixed(2)}×` : "—"], ["Loss", f ? `${(f.loss_ratio * 100).toFixed(2)} %` : "—"]);
  } else if (id === "classifier" && last) {
    for (const [k, v] of Object.entries(last.proba)) facts.push([k.toUpperCase(), `${Math.round(v * 100)} %`]);
  } else if (id === "guard") {
    facts.push(["Margin", `${config?.margin ?? 0.15}`], ["Min dwell", `${config?.dwell_ms ?? 200} ms`], ["Verdict", last ? (last.switch ? `switch → ${last.target}` : "keep") : "—"], ["Reason", last?.reason ?? "—"]);
  } else if (id === "features" && f) {
    facts.push(["Idle fraction", f.idle_frac.toFixed(2)], ["Burstiness", f.burst_cv.toFixed(2)], ["App-limited", f.app_limited_frac.toFixed(2)], ["Throughput", `${f.tput_mbps.toFixed(1)} Mb/s`]);
  }
  return (
    <section aria-label={info.title} className="rounded-control border border-line bg-subtle">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={cn(LABEL, "text-ink-muted")}>{info.kind}</p>
          <h4 className="mt-0.5 text-[14px] font-semibold text-ink">{info.title}</h4>
        </div>
        <button type="button" aria-label="Close explanation" onClick={onClose} className="grid size-7 place-items-center rounded-button text-ink-muted hover:bg-hover hover:text-ink">
          <X size={14} />
        </button>
      </header>
      <p className="px-4 pt-3 text-[13px] leading-[1.6] text-ink-2">{info.text}</p>
      {facts.length > 0 && (
        <dl className="grid gap-3 px-4 py-3 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className={cn(LABEL, "text-ink-muted")}>{k}</dt>
              <dd className="mt-0.5 text-[13px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {facts.length === 0 && <div className="h-3" />}
    </section>
  );
}
