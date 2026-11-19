"use client";

import {
  Activity,
  AppWindow,
  BrainCircuit,
  Cpu,
  HardDriveDownload,
  Laptop,
  ListOrdered,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Router,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CcChip } from "@/components/accc/cc-chip";
import { At, ExplainPanel, FrameAt, Key, LABEL, NodeAt, Tag, type Explanation } from "@/components/accc/graph-kit";
import { ccColor, type Config, type Flow, type Point, type SwitchEvent } from "@/lib/accc";
import { cn } from "@/lib/cn";

/*
 * ACCC's core architecture as a kaizen-style map: the controller's decision loop on top, the sender
 * computer, the bottleneck and the receiver underneath. Packets move along every edge:
 *   data segments   app → socket → bottleneck → receiver (coloured by the active algorithm)
 *   ACKs            receiver → sender
 *   telemetry       socket → shim → controller (violet dots, TCP_INFO every 50 ms)
 *   switch command  guard → shim → socket (violet square, then the socket changes colour)
 *
 * With no backend it plays a scripted demo of the real workload (bulk → interactive → bulk). When
 * the Python backend is running a flow, the same picture is driven by the live event stream.
 */

const W = 1080;
const H = 552;

type NodeId = "app" | "shim" | "tcp" | "router" | "rtcp" | "rapp" | "telemetry" | "features" | "classifier" | "guard";

const P = {
  telemetry: [420, 128],
  features: [570, 128],
  classifier: [720, 128],
  guard: [870, 128],
  shim: [150, 352],
  app: [150, 452],
  tcp: [420, 452],
  router: [680, 452],
  rtcp: [860, 452],
  rapp: [990, 452],
} as const satisfies Record<NodeId, readonly [number, number]>;

const T = 26; // half a tile
const DY = 446; // data lane
const AY = 458; // ack lane

/** Static connectors. */
const LINES: { d: string; kind: "data" | "ack" | "ctl" }[] = [
  { d: `M${P.app[0] + T},${DY} H${P.tcp[0] - T - 3}`, kind: "data" },
  { d: `M${P.tcp[0] + T},${DY} H${P.router[0] - T - 3}`, kind: "data" },
  { d: `M${P.router[0] + T},${DY} H${P.rtcp[0] - T - 3}`, kind: "data" },
  { d: `M${P.rtcp[0] + T},${DY} H${P.rapp[0] - T - 3}`, kind: "data" },
  { d: `M${P.rtcp[0] - T},${AY} H${P.router[0] + T + 3}`, kind: "ack" },
  { d: `M${P.router[0] - T},${AY} H${P.tcp[0] + T + 3}`, kind: "ack" },
  // kernel → shim (TCP_INFO) and shim → kernel (setsockopt)
  { d: `M${P.tcp[0] - 6},${P.tcp[1] - T} V346 H${P.shim[0] + T + 3}`, kind: "ctl" },
  { d: `M${P.shim[0] + T},358 H${P.tcp[0] + 6} V${P.tcp[1] - T - 3}`, kind: "ctl" },
  // shim → controller, through the pipeline, and the command back
  { d: `M144,${P.shim[1] - T} V128 H${P.telemetry[0] - T - 3}`, kind: "ctl" },
  { d: `M${P.telemetry[0] + T},128 H${P.features[0] - T - 3}`, kind: "ctl" },
  { d: `M${P.features[0] + T},128 H${P.classifier[0] - T - 3}`, kind: "ctl" },
  { d: `M${P.classifier[0] + T},128 H${P.guard[0] - T - 3}`, kind: "ctl" },
  { d: `M${P.guard[0] + T},128 H990 V246 H156 V${P.shim[1] - T - 3}`, kind: "ctl" },
];

/** Invisible paths the packets ride on. */
const LANES = {
  data: `M${P.app[0]},${DY} H${P.rapp[0]}`,
  ack: `M${P.rtcp[0]},${AY} H${P.tcp[0]}`,
  tel: `M${P.tcp[0] - 6},${P.tcp[1]} V346 H144 V128 H${P.guard[0]}`,
  cmd: `M${P.guard[0]},128 H990 V246 H156 V358 H${P.tcp[0] + 6} V${P.tcp[1]}`,
};
type Lane = keyof typeof LANES;
const ROUTER_AT = (P.router[0] - P.app[0]) / (P.rapp[0] - P.app[0]);

/* ── The scripted demo: the real workload's three phases, on a 30 s loop ──────────────────────── */

type Phase = "bulk" | "interactive";
const CYCLE = 30;
const PHASES: [number, Phase][] = [
  [0, "bulk"],
  [10, "interactive"],
  [20, "bulk"],
];
const BEST: Record<Phase, string> = { bulk: "bbr", interactive: "reno" };
/** How each algorithm behaves at the bottleneck, per phase: queue fill, loss probability, RTT inflation. */
const PATH: Record<string, Record<Phase, { queue: number; loss: number; infl: number; rate: number }>> = {
  cubic: { bulk: { queue: 0.9, loss: 0.07, infl: 2.4, rate: 9 }, interactive: { queue: 0.55, loss: 0.02, infl: 1.7, rate: 2 } },
  bbr: { bulk: { queue: 0.15, loss: 0.01, infl: 1.12, rate: 9 }, interactive: { queue: 0.1, loss: 0, infl: 1.08, rate: 2 } },
  reno: { bulk: { queue: 0.7, loss: 0.05, infl: 2.0, rate: 7 }, interactive: { queue: 0.12, loss: 0, infl: 1.05, rate: 2 } },
};

function phaseAt(s: number): Phase {
  let p: Phase = "bulk";
  for (const [at, name] of PHASES) if (s >= at) p = name;
  return p;
}

type View = {
  cc: string;
  phase: Phase;
  target: string;
  proba: Record<string, number>;
  verdict: string;
  switching: string | null;
  queue: number;
  infl: number;
  loss: number;
  tput: number;
  switches: number;
  live: boolean;
};

/** Classifier output for the scripted demo: drifts towards the best algorithm for the phase. */
function scriptedProba(phase: Phase, sincePhase: number): Record<string, number> {
  const best = BEST[phase];
  const conf = Math.min(1, Math.max(0, (sincePhase - 0.8) / 1.6)); // the 500 ms window has to fill first
  const base: Record<string, number> = { cubic: 0.4, bbr: 0.35, reno: 0.25 };
  const out: Record<string, number> = {};
  for (const k of Object.keys(base)) out[k] = base[k] * (1 - conf) + (k === best ? 0.74 : 0.13) * conf;
  return out;
}

/* ── Explanations ─────────────────────────────────────────────────────────────────────────────── */

function explain(id: NodeId, v: View, cfg: Config | null): Explanation {
  const code = (s: string) => <code className="formula-pill px-1 font-mono text-[12px]">{s}</code>;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  switch (id) {
    case "app":
      return {
        kind: "Sender · user space",
        title: "Application",
        text: (
          <>
            An ordinary program that writes to a TCP socket with {code("send()")}. It is <b>not modified or recompiled</b>: ACCC is injected with {code("LD_PRELOAD")}. The demo app
            alternates a <b>bulk download</b> with <b>sparse interactive messages</b>; that change in behaviour is what ACCC has to notice.
          </>
        ),
        facts: [
          ["Current phase", v.phase === "bulk" ? "Bulk transfer" : "Interactive messages"],
          ["Data path", "send() → kernel socket"],
          ["Code", code("demo/workload.py")],
          ["Changed for ACCC?", "No"],
        ],
      };
    case "shim":
      return {
        kind: "Sender · inside the app process",
        title: "libaccc.so — the LD_PRELOAD shim",
        tone: "violet",
        text: (
          <>
            A small C library loaded into the app. It hooks {code("socket()")}/{code("connect()")}/{code("close()")} to find the app&rsquo;s TCP sockets, then every 50 ms reads{" "}
            {code("getsockopt(TCP_INFO)")} — RTT, congestion window, retransmits, bytes acked — and streams it to the controller over a unix socket. When the controller says
            &ldquo;switch&rdquo;, it calls {code("setsockopt(TCP_CONGESTION)")} on the live socket. It never reads or changes the app&rsquo;s data.
          </>
        ),
        facts: [
          ["Reads", "TCP_INFO every 50 ms"],
          ["Writes", "TCP_CONGESTION"],
          ["Talks to", "accc daemon · /run/accc.sock"],
          ["Code", code("shim/libaccc.c")],
        ],
      };
    case "tcp":
      return {
        kind: "Sender · kernel",
        title: "TCP socket",
        text: (
          <>
            The kernel&rsquo;s state for this connection. Its <b>congestion-control algorithm</b> (the tile&rsquo;s colour) decides how many segments may be in flight and how fast to
            send. Linux lets you change it per socket at any moment — ACCC uses that to switch <b>mid-flow</b>, without closing the connection or losing a byte.
          </>
        ),
        facts: [
          ["Active algorithm", <CcChip key="cc" cc={v.cc} />],
          ["Available", (cfg?.available ?? ["cubic", "bbr", "reno"]).map((c) => c.toUpperCase()).join(" · ")],
          ["Switches so far", String(v.switches)],
          ["Throughput", `${v.tput.toFixed(0)} Mb/s`],
        ],
      };
    case "router":
      return {
        kind: "Network path",
        title: "Bottleneck link",
        text: (
          <>
            The narrowest link between the two computers. If the sender pushes faster than it drains, packets wait in its <b>queue</b> (RTT goes up) and once the queue is full they are{" "}
            <b className="text-neg-fg">dropped</b> (red). Loss-based algorithms like CUBIC and Reno fill this queue on purpose until something drops; BBR aims to keep it nearly empty.
          </>
        ),
        facts: [
          ["Queue", pct(v.queue)],
          ["RTT inflation", `${v.infl.toFixed(2)}×`],
          ["Loss", `${(v.loss * 100).toFixed(1)} %`],
          ["Link", "100 Mb/s · 20 ms"],
        ],
      };
    case "rtcp":
      return {
        kind: "Receiver · kernel",
        title: "Receiver TCP socket",
        text: <>Puts segments back in order and sends ACKs to the sender (one per two segments — delayed ACK). Those ACKs are what clock out new data at the sender.</>,
        facts: [["Sends", "cumulative ACKs"], ["Algorithm", "doesn't matter here — congestion control runs at the sender"]],
      };
    case "rapp":
      return {
        kind: "Receiver · user space",
        title: "Receiving application",
        text: <>Reads every byte with {code("recv()")}. At the end of a run the demo checks bytes received = bytes sent, which proves the mid-flow switches never broke the connection.</>,
        facts: [["Check", "bytes in = bytes out"], ["Code", code("demo/runner.py")]],
      };
    case "telemetry":
      return {
        kind: "Controller · step 1",
        title: "Telemetry window",
        tone: "violet",
        text: <>Collects the shim&rsquo;s TCP_INFO samples per flow and keeps a sliding window of the last 10 — half a second of history. Older samples fall off.</>,
        facts: [
          ["Window", `${cfg?.window ?? 10} samples`],
          ["Interval", `${cfg?.interval_ms ?? 50} ms`],
          ["Transport", "JSON lines over a unix socket"],
          ["Code", code("accc/daemon.py")],
        ],
      };
    case "features":
      return {
        kind: "Controller · step 2",
        title: "Feature extractor",
        tone: "violet",
        text: (
          <>
            Turns the window into <b>14 numbers</b> that describe the traffic: mean and spread of RTT, RTT inflation over the minimum, loss ratio, congestion-window trend, throughput and
            its trend, burstiness, idle fraction, how often the app (not the network) was the limit, and flow size.
          </>
        ),
        facts: [
          ["RTT inflation", `${v.infl.toFixed(2)}×`],
          ["Loss", `${(v.loss * 100).toFixed(1)} %`],
          ["Looks like", v.phase === "bulk" ? "bulk transfer" : "interactive"],
          ["Code", code("accc/features.py")],
        ],
      };
    case "classifier":
      return {
        kind: "Controller · step 3",
        title: "Classifier",
        tone: "violet",
        text: (
          <>
            Maps the 14 features to a probability for each available algorithm: <i>which one fits this traffic best right now?</i> Today it is a transparent rule-based policy; a trained
            model can replace it behind the same {code("predict_proba()")} interface.
          </>
        ),
        facts: [
          ...Object.entries(v.proba)
            .sort((a, b) => b[1] - a[1])
            .map(([k, p]) => [k.toUpperCase(), pct(p)] as [string, ReactNode]),
          ["Code", code("accc/policy.py")],
        ],
      };
    case "guard":
      return {
        kind: "Controller · step 4",
        title: "Stability guard",
        tone: "violet",
        text: (
          <>
            Stops the controller from flapping. A switch only goes through if the winner beats the active algorithm by a <b>confidence margin</b> <i>and</i> the current algorithm has been
            in place for a <b>minimum dwell time</b>. Approved switches go back to the shim as a command.
          </>
        ),
        facts: [
          ["Margin", String(cfg?.margin ?? 0.15)],
          ["Min dwell", `${cfg?.dwell_ms ?? 200} ms`],
          ["Verdict", v.switching ? `switch → ${v.switching.toUpperCase()}` : v.verdict],
          ["Code", code("accc/guard.py")],
        ],
      };
  }
}

/* ── Packets ──────────────────────────────────────────────────────────────────────────────────── */

type Packet = { lane: Lane; born: number; dur: number; color: string; drop?: number; ack?: boolean };
const POOL = 160;
const SHAPES: Record<string, [number, number, number]> = { data: [10, 6, 1.5], drop: [10, 6, 1.5], ack: [6, 6, 3], tel: [6, 6, 3], cmd: [11, 11, 2] };

/* ── The component ────────────────────────────────────────────────────────────────────────────── */

export function CoreArchitecture({
  config,
  flow,
  last,
  phase: livePhase,
  switches: liveSwitches,
  running,
}: {
  config: Config | null;
  flow: Flow | null;
  last: Point | undefined;
  phase: string | undefined;
  switches: SwitchEvent[];
  running: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<NodeId | null>("shim");
  const [playing, setPlaying] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const live = running && !!flow;

  // Scripted state, advanced by the animation loop and mirrored into React a few times a second.
  const script = useRef({ clock: 0, cc: "cubic", switches: 0, pendingTo: null as string | null, lastSwitchAt: -10, lastPhase: "bulk" as Phase, phaseAt: 0 });
  const [scripted, setScripted] = useState<View>(() => ({
    cc: "cubic",
    phase: "bulk",
    target: "cubic",
    proba: scriptedProba("bulk", 0),
    verdict: "keep",
    switching: null,
    queue: PATH.cubic.bulk.queue,
    infl: PATH.cubic.bulk.infl,
    loss: PATH.cubic.bulk.loss,
    tput: 80,
    switches: 0,
    live: false,
  }));

  // Live view from the backend stream, when there is one.
  const liveView: View | null =
    live && last
      ? {
          cc: flow!.cc,
          phase: livePhase === "interactive" ? "interactive" : "bulk",
          target: last.target,
          proba: last.proba,
          verdict: last.switch ? `switch → ${last.target}` : last.reason || "keep",
          switching: flash,
          queue: Math.max(0, Math.min(1, (last.features.rtt_inflation - 1) / 1.2)),
          infl: last.features.rtt_inflation,
          loss: last.features.loss_ratio,
          tput: last.tput,
          switches: liveSwitches.filter((s) => s.ok).length,
          live: true,
        }
      : null;
  const v = liveView ?? scripted;
  const color = ccColor(v.cc);

  const playingRef = useRef(playing);
  playingRef.current = playing;
  const liveRef = useRef({ live, color, view: v });
  liveRef.current = { live, color, view: v };
  const kick = useRef({ tel: 0, cmd: 0 });

  // Live stream: a telemetry dot every few samples, a command square on each switch.
  const seen = useRef({ t: -1, n: 0, sw: 0 });
  useEffect(() => {
    if (!live || !last || last.t === seen.current.t) return;
    seen.current.t = last.t;
    if (++seen.current.n % 3 === 0) kick.current.tel++;
  }, [live, last]);
  useEffect(() => {
    if (liveSwitches.length < seen.current.sw) seen.current.sw = 0;
    if (liveSwitches.length > seen.current.sw) {
      seen.current.sw = liveSwitches.length;
      const sw = liveSwitches[liveSwitches.length - 1];
      kick.current.cmd++;
      setFlash(sw.to);
      const id = setTimeout(() => setFlash(null), 1600);
      return () => clearTimeout(id);
    }
  }, [liveSwitches]);

  // One animation loop for the script and every packet.
  useEffect(() => {
    const host = svg.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = Object.fromEntries((Object.keys(LANES) as Lane[]).map((k) => [k, host.querySelector<SVGPathElement>(`[data-lane="${k}"]`)!])) as Record<Lane, SVGPathElement>;
    const len = Object.fromEntries((Object.keys(paths) as Lane[]).map((k) => [k, paths[k].getTotalLength()])) as Record<Lane, number>;
    const els = Array.from(host.querySelectorAll<SVGGElement>("[data-pkt]"));
    const packets: (Packet | null)[] = Array(els.length).fill(null);
    let acc = 0;
    let telAcc = 0;
    let ackEvery = 0;
    let last = performance.now();
    let lastPush = 0;
    let raf = 0;
    const spawn = (p: Packet) => {
      const i = packets.indexOf(null);
      if (i >= 0) packets[i] = p;
    };
    const s = script.current;

    const tickScript = (dt: number, now: number) => {
      s.clock += dt;
      if (s.clock >= CYCLE) {
        // the connection closes; a new one starts on the system default
        s.clock = 0;
        s.cc = "cubic";
        s.switches = 0;
        s.pendingTo = null;
        s.lastSwitchAt = -10;
      }
      const phase = phaseAt(s.clock);
      if (phase !== s.lastPhase || s.clock < dt) {
        s.lastPhase = phase;
        s.phaseAt = s.clock;
      }
      const proba = scriptedProba(phase, s.clock - s.phaseAt);
      const target = Object.entries(proba).sort((a, b) => b[1] - a[1])[0][0];
      const margin = proba[target] - (proba[s.cc] ?? 0);
      let verdict = "keep";
      if (target !== s.cc && !s.pendingTo) {
        if (margin < 0.15) verdict = `margin ${margin.toFixed(2)} < 0.15`;
        else if (s.clock - s.lastSwitchAt < 1.2) verdict = "waiting for dwell time";
        else {
          s.pendingTo = target;
          s.lastSwitchAt = s.clock;
          kick.current.cmd++;
          setFlash(target);
          setTimeout(() => setFlash(null), 1700);
        }
      }
      const path = PATH[s.cc][phase];
      if (now - lastPush > 200) {
        lastPush = now;
        setScripted({
          cc: s.cc,
          phase,
          target,
          proba,
          verdict: s.pendingTo ? `switch → ${s.pendingTo}` : verdict,
          switching: s.pendingTo,
          queue: path.queue,
          infl: path.infl * (1 + 0.04 * Math.sin(now / 400)),
          loss: path.loss,
          tput: phase === "bulk" ? (s.cc === "bbr" ? 94 : s.cc === "cubic" ? 88 : 80) : 3,
          switches: s.switches,
          live: false,
        });
      }
      return phase;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = liveRef.current;
      const active = !L.live && playingRef.current;
      let phase: Phase = L.view.phase;
      if (active) phase = tickScript(dt, now);

      if (active || L.live) {
        const path = PATH[L.live ? (PATH[L.view.cc] ? L.view.cc : "cubic") : s.cc][phase];
        const rate = L.live ? 1.5 + 14 * Math.min(1, Math.log10(L.view.tput + 1) / 2.3) : path.rate;
        acc += dt * rate;
        const ccNow = L.live ? L.view.cc : s.cc;
        while (acc >= 1) {
          acc -= 1;
          spawn({ lane: "data", born: now, dur: 2600 * Math.min(1.6, Math.sqrt(path.infl)), color: ccColor(ccNow), drop: Math.random() < (L.live ? Math.min(0.3, L.view.loss * 25) : path.loss) ? ROUTER_AT : undefined });
        }
        if (!L.live) {
          telAcc += dt;
          if (telAcc >= 0.6) {
            telAcc = 0;
            kick.current.tel++;
          }
        }
      }
      const k = kick.current;
      while (k.tel > 0) {
        k.tel--;
        spawn({ lane: "tel", born: now, dur: 1500, color: "var(--color-violet-500)" });
      }
      while (k.cmd > 0) {
        k.cmd--;
        spawn({ lane: "cmd", born: now, dur: 1500, color: "var(--color-violet-700)" });
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
        if (f >= end + (p.drop !== undefined ? 0.15 : 0)) {
          if (p.lane === "data" && p.drop === undefined && ++ackEvery % 2 === 0) spawn({ lane: "ack", born: now, dur: 1500, color: "", ack: true });
          if (p.lane === "cmd" && !liveRef.current.live && s.pendingTo) {
            // the command reached the shim and setsockopt ran: the socket now uses the new algorithm
            s.cc = s.pendingTo;
            s.pendingTo = null;
            s.switches++;
          }
          packets[i] = null;
          el.style.display = "none";
          continue;
        }
        const dropping = p.drop !== undefined && f > p.drop;
        f = Math.min(f, end);
        const pt = paths[p.lane].getPointAtLength(f * len[p.lane]);
        el.style.display = reduce ? "none" : "";
        const y = dropping ? pt.y + ((now - p.born) / p.dur - p.drop!) * 120 : pt.y;
        el.setAttribute("transform", `translate(${pt.x.toFixed(1)},${y.toFixed(1)})`);
        const shape = el.firstElementChild as SVGElement;
        const kind = dropping ? "drop" : p.lane;
        if (el.dataset.kind !== kind) {
          el.dataset.kind = kind;
          const [w, h, r] = SHAPES[kind];
          for (const [a, val] of [["x", -w / 2], ["y", -h / 2], ["width", w], ["height", h], ["rx", r]] as const) shape.setAttribute(a, String(val));
        }
        shape.style.fill = dropping ? "var(--color-neg-fg)" : p.ack ? "var(--color-surface)" : p.color;
        shape.style.stroke = p.ack ? "var(--color-ink-muted)" : "none";
        el.style.opacity = dropping ? String(Math.max(0, 1 - ((now - p.born) / p.dur - p.drop!) / 0.15)) : "1";
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggle = (id: NodeId) => setSelected((cur) => (cur === id ? null : id));
  const tile = (id: NodeId, caption: string, label: string, Icon: typeof Cpu, sub?: ReactNode, extra?: { fill?: string; tone?: "amber" | "green" | "red" }) => (
    <NodeAt key={id} x={P[id][0]} y={P[id][1]} caption={caption} sub={sub} id={id} label={label} icon={<Icon size={20} strokeWidth={1.6} />} selected={selected === id} onClick={toggle} {...extra} />
  );
  const restart = () => {
    script.current.clock = CYCLE; // wraps to a fresh connection on the next frame
    setPlaying(true);
  };
  const queueSlots = Math.round(v.queue * 8);
  const top = Object.entries(v.proba).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-chip px-1.5 py-[3px] text-[11px] font-semibold", v.live ? "bg-pos-bg text-pos-fg" : "bg-chip-sky text-ink")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", v.live ? "bg-pos-fg" : "bg-blue-500", (v.live || playing) && "animate-pulse")} />
          {v.live ? "Live — driven by the real controller" : "Demo loop — bulk → interactive → bulk"}
        </span>
        <span className="text-[12px] text-ink-muted">
          App phase <b className="text-ink">{v.phase === "bulk" ? "bulk download" : "interactive typing"}</b> · socket on <CcChip cc={v.cc} />
        </span>
        {!v.live && (
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setPlaying((p) => !p)} className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium">
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={restart} className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium">
              <RotateCcw className="h-3.5 w-3.5" />
              Restart
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-control border border-line bg-surface" data-testid="core-architecture">
        <div className="relative mx-auto" style={{ width: W, height: H }}>
          {/* Regions */}
          <FrameAt x={330} y={24} w={630} h={200} label="ACCC controller" note="accc daemon" />
          <div aria-hidden className="pointer-events-none absolute border border-b-0 border-dashed border-ink-faint" style={{ left: 350, top: 46, width: 590, height: 56 }} />
          <p className={cn(LABEL, "pointer-events-none absolute text-center text-violet-500")} style={{ left: 350, top: 58, width: 590 }}>
            Decision loop · every 50 ms
          </p>
          <FrameAt x={24} y={270} w={520} h={262} label="Sender computer" icon={<Laptop size={13} strokeWidth={1.8} />} note={flow?.src} />
          <FrameAt x={70} y={302} w={160} h={214} label="app process" dashed />
          <div aria-hidden className="pointer-events-none absolute border-l border-dashed border-line-strong" style={{ left: 300, top: 290, height: 228 }} />
          <Tag x={244} y={282} align="c">user</Tag>
          <Tag x={322} y={282} align="l">kernel</Tag>
          <FrameAt x={790} y={366} w={266} h={166} label="Receiver computer" icon={<Server size={13} strokeWidth={1.8} />} note={flow?.dst} />

          <svg ref={svg} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={W} height={H}>
            <defs>
              <marker id="core-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L6,3 L0,6 z" fill="var(--color-ink-faint)" />
              </marker>
              <marker id="core-arrow-v" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L6,3 L0,6 z" fill="var(--color-violet-400)" />
              </marker>
            </defs>
            {LINES.map((l, i) => (
              <path
                key={i}
                d={l.d}
                fill="none"
                markerEnd={l.kind === "ctl" ? "url(#core-arrow-v)" : "url(#core-arrow)"}
                stroke={l.kind === "ctl" ? "var(--color-violet-400)" : "var(--color-ink-faint)"}
                strokeOpacity={l.kind === "ctl" ? 0.65 : 0.85}
                strokeDasharray={l.kind === "data" ? undefined : "3 3"}
              />
            ))}
            {/* the edge the story is about: the decision loop, pulsing (kaizen's map-pulse) */}
            <path d={LANES.tel} fill="none" stroke="var(--color-violet-500)" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="24 96" className="animate-map-pulse opacity-50 motion-reduce:hidden" />
            {v.switching && <path d={LANES.cmd} fill="none" stroke="var(--color-violet-700)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="24 96" className="animate-map-pulse motion-reduce:hidden" />}
            {(Object.keys(LANES) as Lane[]).map((k) => (
              <path key={k} data-lane={k} d={LANES[k]} fill="none" stroke="none" />
            ))}
            {Array.from({ length: POOL }, (_, i) => (
              <g key={i} data-pkt style={{ display: "none" }}>
                <rect />
              </g>
            ))}
          </svg>

          {/* Connector labels */}
          <Tag x={160} y={108} align="l" tone="violet">telemetry · json over unix socket</Tag>
          <Tag x={600} y={252} align="c" tone="violet">switch command</Tag>
          <Tag x={384} y={331} align="r" tone="violet">getsockopt(TCP_INFO)</Tag>
          <Tag x={384} y={364} align="r" tone="violet">setsockopt(TCP_CONGESTION)</Tag>
          <Tag x={348} y={428} align="c">send()</Tag>
          <Tag x={550} y={428} align="c">segments →</Tag>
          <Tag x={550} y={464} align="c">← acks</Tag>
          <Tag x={752} y={428} align="c">segments →</Tag>
          <Tag x={925} y={428} align="c">recv()</Tag>

          {/* Bottleneck queue */}
          <At x={P.router[0]} y={396}>
            <div className="flex flex-col items-center gap-1" title={`Queue ≈ ${Math.round(v.queue * 100)} %`}>
              <span className={cn(LABEL, "text-[9.5px] text-ink-faint")}>queue</span>
              <div className="flex gap-[3px]">
                {Array.from({ length: 8 }, (_, i) => (
                  <i key={i} className={cn("h-3 w-[7px] border transition-colors duration-500", i < queueSlots ? (queueSlots >= 6 ? "border-[#d9a400] bg-chip-amber" : "border-blue-300 bg-blue-100") : "border-line-strong bg-surface")} />
                ))}
              </div>
            </div>
          </At>

          {/* Nodes */}
          {tile("telemetry", "Telemetry", "Telemetry window", ListOrdered, "last 10 samples")}
          {tile("features", "Features", "Feature extractor", Activity, `${v.infl.toFixed(2)}× rtt`)}
          {tile("classifier", "Classifier", "Classifier", BrainCircuit, top ? `${top[0].toUpperCase()} ${Math.round(top[1] * 100)} %` : "—")}
          {tile("guard", "Guard", "Stability guard", ShieldCheck, <span className={cn(v.switching && "font-semibold text-violet-700")}>{v.switching ? `switch → ${v.switching.toUpperCase()}` : "keep"}</span>, v.switching ? { fill: "var(--color-violet-700)" } : undefined)}
          {tile("shim", "libaccc.so", "libaccc.so shim", Plug, "LD_PRELOAD")}
          {tile("app", "App", "Application", AppWindow, v.phase === "bulk" ? "bulk download" : "interactive")}
          {tile("tcp", "TCP socket", "Sender TCP socket", Cpu, <CcChip cc={v.cc} />, { fill: color })}
          {tile("router", "Bottleneck", "Bottleneck link", Router, `${(20 * v.infl).toFixed(0)} ms rtt`, v.queue > 0.6 ? { tone: "amber" } : undefined)}
          {tile("rtcp", "TCP socket", "Receiver TCP socket", Cpu, "sends acks")}
          {tile("rapp", "Receiver", "Receiving application", HardDriveDownload, "recv()")}

          {flash && (
            <div className="absolute z-20 rounded-control border border-violet-200 bg-violet-50 px-3 py-1.5 font-mono text-[11.5px] text-violet-700 shadow-e2" style={{ left: 330, top: 290 }}>
              setsockopt(TCP_CONGESTION, &quot;{flash}&quot;)
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-muted">
        <Key swatch={<i className="inline-block h-[6px] w-[10px] rounded-[1.5px]" style={{ background: color }} />}>Data segment (colour = algorithm)</Key>
        <Key swatch={<i className="inline-block size-[6px] rounded-full border border-ink-muted bg-surface" />}>ACK</Key>
        <Key swatch={<i className="inline-block size-[6px] rounded-full bg-violet-500" />}>TCP_INFO telemetry</Key>
        <Key swatch={<i className="inline-block size-[9px] rounded-[2px] bg-violet-700" />}>Switch command</Key>
        <Key swatch={<i className="inline-block h-[6px] w-[10px] rounded-[1.5px] bg-neg-fg" />}>Dropped at the bottleneck</Key>
        <span className="ml-auto font-medium text-ink-2">Click any component to see what it does.</span>
      </div>

      {selected ? (
        <ExplainPanel info={explain(selected, v, config)} onClose={() => setSelected(null)} />
      ) : (
        <p className="rounded-control border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-faint">Click a component in the map to see what it does and how it fits in.</p>
      )}
    </div>
  );
}
