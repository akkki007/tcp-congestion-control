"use client";

import { AppWindow, Cpu, Keyboard, Monitor, RotateCcw, Router, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { At, ExplainPanel, FrameAt, Key, LABEL, NodeAt, Tag, type Explanation } from "@/components/accc/graph-kit";
import { Topbar } from "@/components/app/topbar";
import { ccColor } from "@/lib/accc";
import { ALGORITHMS, type Algo } from "@/lib/algorithms";
import { cn } from "@/lib/cn";
import { ACK_LEG, BASE_RTT, BDP, BUF, LEG, SERVICE, TcpSim, show, type LogLine, type Mode } from "@/lib/tcp-sim";

/*
 * One algorithm, alone on a path. You type a message; every character becomes one TCP segment and
 * is sent by this algorithm's congestion control through a bottleneck with a small buffer. You can
 * watch the window grow, the queue fill, segments get dropped and resent, and the text arrive.
 */

const W = 1000;
const H = 250;
const N = { app: [80, 122], tcp: [200, 122], router: [640, 122], rtcp: [800, 122], rapp: [920, 122] } as const;
type NodeId = keyof typeof N;
const DY = 112; // data lane
const AY = 136; // ack lane
const SEG = 16; // segment block width
const SLOT = SEG + 4;
const slotX = (i: number) => N.router[0] - 26 - 12 - i * SLOT; // waiting slot i at the bottleneck (0 = next out)
const DROP_X = slotX(BUF);

const SHORT = "Hello! Can you read this?";
const LONG = "Hi! Every letter you type here becomes its own TCP segment. Watch how the window grows, how the bottleneck queue fills, and what happens on loss.";

type Stats = {
  t: number;
  cwnd: number;
  mode: Mode;
  inflight: number;
  sent: number;
  retx: number;
  drops: number;
  queue: number;
  prefix: number;
  got: boolean[];
  log: LogLine[];
  history: { t: number; cwnd: number }[];
  losses: number[];
  done: number | null;
  rate: number;
};

export function AlgoPlayground({ cc }: { cc: Algo }) {
  const info = ALGORITHMS[cc];
  const color = ccColor(cc);
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState(LONG);
  const [sim, setSim] = useState<TcpSim | null>(null);
  const [speed, setSpeed] = useState(2);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const send = useCallback(() => {
    const text = draft.replace(/\s+/g, " ").trim().slice(0, 280);
    if (!text) return;
    setSim(new TcpSim(cc, text));
  }, [cc, draft]);
  const reset = () => {
    setSim(null);
    setStats(null);
  };

  // Drive the simulation and draw every segment and ACK, once per frame.
  useEffect(() => {
    const host = svg.current;
    if (!host || !sim) return;
    const segEls = Array.from(host.querySelectorAll<SVGGElement>("[data-seg]"));
    const ackEls = Array.from(host.querySelectorAll<SVGCircleElement>("[data-ack]"));
    let last = performance.now();
    let lastPush = 0;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(100, now - last) * speedRef.current;
      last = now;
      if (!sim.done || sim.t < (sim.finishedAt ?? 0) + 1500) sim.advance(sim.t + dt);
      const t = sim.t;

      // Who is waiting at the bottleneck, in service order
      const waiting = sim.segments.filter((s) => s.routed && !s.dropped && t >= s.arriveRouter && t < s.serviceStart).sort((a, b) => a.serviceStart - b.serviceStart);
      const slot = new Map(waiting.map((s, i) => [s, slotX(i)]));
      const tail = slotX(waiting.length);
      const flying = sim.segments.filter((s) => t < s.arriveRouter).sort((a, b) => a.sentAt - b.sentAt);
      const ahead = new Map(flying.map((s, i) => [s, i]));

      let n = 0;
      for (const s of sim.segments) {
        let x: number | null = null;
        let y = DY;
        let opacity = 1;
        let red = false;
        if (t < s.sentAt) continue;
        if (t < s.arriveRouter) {
          const lin = N.tcp[0] + 26 + ((t - s.sentAt) / LEG) * (N.router[0] - 26 - N.tcp[0] - 26);
          x = Math.min(lin, tail - ahead.get(s)! * SLOT);
          s.x = x;
        } else if (s.dropped) {
          const k = (t - s.arriveRouter) / 900;
          if (k > 1) continue;
          x = Math.min(s.x ?? DROP_X, DROP_X);
          y = DY + k * 70;
          opacity = 1 - k;
          red = true;
        } else if (t < s.serviceStart) {
          const target = slot.get(s) ?? tail;
          s.x = (s.x ?? target) + (target - (s.x ?? target)) * Math.min(1, dt * 0.01);
          x = s.x;
        } else if (t < s.serviceEnd) {
          x = slotX(0) + ((t - s.serviceStart) / SERVICE) * (N.router[0] + 26 - slotX(0));
        } else if (t < s.arriveRecv) {
          x = N.router[0] + 26 + ((t - s.serviceEnd) / LEG) * (N.rtcp[0] - N.router[0] - 26);
        } else if (t < s.arriveRecv + 500) {
          const k = (t - s.arriveRecv) / 500;
          x = N.rtcp[0] + k * (N.rapp[0] - N.rtcp[0]);
          opacity = 1 - k * k;
        } else continue;
        if (n >= segEls.length) break;
        const el = segEls[n++];
        el.style.display = "";
        el.style.opacity = String(opacity);
        el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        const rect = el.children[0] as SVGRectElement;
        const label = el.children[1] as SVGTextElement;
        rect.style.fill = red ? "var(--color-neg-fg)" : color;
        rect.style.stroke = s.retx && !red ? "var(--color-ink)" : "none";
        if (label.textContent !== show(s.ch)) label.textContent = show(s.ch);
      }
      for (; n < segEls.length; n++) if (segEls[n].style.display !== "none") segEls[n].style.display = "none";

      let a = 0;
      for (const ack of sim.acks) {
        if (ack.done || t < ack.sentAt) continue;
        if (a >= ackEls.length) break;
        const el = ackEls[a++];
        const x = N.rtcp[0] - 26 - ((t - ack.sentAt) / ACK_LEG) * (N.rtcp[0] - 26 - N.tcp[0] - 26);
        el.style.display = "";
        el.setAttribute("cx", x.toFixed(1));
      }
      for (; a < ackEls.length; a++) if (ackEls[a].style.display !== "none") ackEls[a].style.display = "none";

      if (now - lastPush > 120) {
        lastPush = now;
        setStats({
          t,
          cwnd: sim.effectiveWindow(),
          mode: sim.mode,
          inflight: sim.inflight,
          sent: sim.sent,
          retx: sim.retransmits,
          drops: sim.drops,
          queue: waiting.length,
          prefix: sim.deliveredPrefix,
          got: [...sim.got],
          log: sim.log.slice(-6),
          history: sim.history,
          losses: sim.losses,
          done: sim.finishedAt,
          rate: sim.bottleneckRate,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sim, color]);

  const toggle = (id: NodeId) => setSelected((s) => (s === id ? null : id));
  const icon = (I: typeof Cpu) => <I size={20} strokeWidth={1.6} />;
  const queue = stats?.queue ?? 0;
  const text = sim?.text ?? "";

  return (
    <>
      <Topbar workspace="ACCC" object={info.name} meta={info.tagline} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-4 sm:p-6">
          <div>
            <h1 className="flex items-center gap-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
              <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
              Send a message with {info.name}
            </h1>
            <p className="mt-1 max-w-[780px] text-[13px] leading-[1.6] text-ink-muted">{info.how}</p>
          </div>

          {/* Compose */}
          <section className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="msg" className={cn(LABEL, "text-ink-muted")}>
                Your message <span className="normal-case tracking-normal text-ink-faint">— one character = one TCP segment</span>
              </label>
              <span className="tnum text-[11px] text-ink-faint">{draft.length}/280</span>
            </div>
            <textarea
              id="msg"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 280))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Type something and press Enter…"
              className="mt-2 w-full resize-none rounded-control border border-line-strong bg-surface px-3 py-2 font-mono text-[14px] text-ink outline-none focus:border-blue-500"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={send} disabled={!draft.trim()} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium disabled:opacity-50">
                <Send className="h-3.5 w-3.5" />
                {sim ? "Send again" : "Send"}
              </button>
              <button type="button" onClick={reset} disabled={!sim} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
              <span className="mx-1 h-5 w-px bg-line" />
              <span className="text-[12px] text-ink-muted">Try</span>
              <button type="button" onClick={() => setDraft(SHORT)} className="rounded-chip border border-line px-2 py-0.5 text-[12px] text-ink-2 hover:bg-hover">
                a short hello
              </button>
              <button type="button" onClick={() => setDraft(LONG)} className="rounded-chip border border-line px-2 py-0.5 text-[12px] text-ink-2 hover:bg-hover">
                a long paragraph
              </button>
              <div className="ml-auto flex items-center gap-1 text-[12px] text-ink-muted" role="group" aria-label="Animation speed">
                Speed
                {[1, 2, 4].map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                    className={cn("tnum rounded-chip border px-1.5 py-0.5", speed === s ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:bg-hover")}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* The path */}
          <section className="rounded-card border border-line bg-surface p-4">
            <div className="overflow-x-auto">
              <div className="relative mx-auto" style={{ width: W, height: H }}>
                <FrameAt x={16} y={52} w={250} h={176} label="Your computer" icon={<Monitor size={13} strokeWidth={1.8} />} />
                <FrameAt x={734} y={52} w={250} h={176} label="Friend's computer" icon={<Monitor size={13} strokeWidth={1.8} />} />

                {/* the bottleneck buffer */}
                <div aria-hidden className="absolute border border-dashed border-line-strong" style={{ left: slotX(BUF - 1) - SLOT / 2, top: DY - 15, width: BUF * SLOT, height: 30 }} />
                <Tag x={slotX((BUF - 1) / 2)} y={DY - 32} align="c">
                  buffer · {queue}/{BUF}
                </Tag>
                <Tag x={(N.tcp[0] + slotX(BUF)) / 2} y={DY - 32} align="c">
                  segments →
                </Tag>
                <Tag x={(N.tcp[0] + slotX(BUF)) / 2} y={AY + 10} align="c">
                  ← acks
                </Tag>
                <Tag x={(N.router[0] + N.rtcp[0]) / 2} y={DY - 32} align="c">
                  {(1000 / SERVICE).toFixed(1)} seg/s →
                </Tag>

                <svg ref={svg} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={W} height={H}>
                  <path d={`M${N.app[0] + 26},${DY} H${N.tcp[0] - 26}`} stroke="var(--color-ink-faint)" fill="none" />
                  <path d={`M${N.tcp[0] + 26},${DY} H${N.router[0] - 26}`} stroke="var(--color-ink-faint)" strokeOpacity={0.7} fill="none" />
                  <path d={`M${N.router[0] + 26},${DY} H${N.rtcp[0] - 26}`} stroke="var(--color-ink-faint)" strokeOpacity={0.7} fill="none" />
                  <path d={`M${N.rtcp[0] + 26},${DY} H${N.rapp[0] - 26}`} stroke="var(--color-ink-faint)" fill="none" />
                  <path d={`M${N.rtcp[0] - 26},${AY} H${N.tcp[0] + 26}`} stroke="var(--color-ink-faint)" strokeOpacity={0.7} strokeDasharray="3 3" fill="none" />
                  {Array.from({ length: 120 }, (_, i) => (
                    <g key={i} data-seg style={{ display: "none" }}>
                      <rect x={-SEG / 2} y={-9} width={SEG} height={18} rx={3} strokeWidth={1.5} />
                      <text textAnchor="middle" dy="3.5" className="fill-white font-mono text-[10.5px] font-semibold" />
                    </g>
                  ))}
                  {Array.from({ length: 80 }, (_, i) => (
                    <circle key={i} data-ack cy={AY} r={3} fill="var(--color-surface)" stroke="var(--color-ink-muted)" style={{ display: "none" }} />
                  ))}
                </svg>

                <NodeAt x={N.app[0]} y={N.app[1]} caption="You" sub="typing" id="app" label="You" icon={icon(Keyboard)} selected={selected === "app"} onClick={toggle} />
                <NodeAt
                  x={N.tcp[0]}
                  y={N.tcp[1]}
                  caption="TCP socket"
                  sub={stats ? `window ${stats.cwnd.toFixed(1)}` : info.name}
                  id="tcp"
                  label={`${info.name} sender`}
                  icon={icon(Cpu)}
                  fill={color}
                  selected={selected === "tcp"}
                  onClick={toggle}
                />
                <NodeAt
                  x={N.router[0]}
                  y={N.router[1]}
                  caption="Bottleneck"
                  sub={`${queue} waiting`}
                  id="router"
                  label="Bottleneck router"
                  icon={icon(Router)}
                  tone={queue >= BUF ? "red" : queue >= BUF - 2 ? "amber" : undefined}
                  selected={selected === "router"}
                  onClick={toggle}
                />
                <NodeAt x={N.rtcp[0]} y={N.rtcp[1]} caption="TCP socket" sub="receiver" id="rtcp" label="Receiver socket" icon={icon(Cpu)} selected={selected === "rtcp"} onClick={toggle} />
                <NodeAt x={N.rapp[0]} y={N.rapp[1]} caption="Screen" sub="shows the text" id="rapp" label="Friend's screen" icon={icon(AppWindow)} selected={selected === "rapp"} onClick={toggle} />

                {stats && (
                  <At x={N.tcp[0]} y={34}>
                    <span className={cn(LABEL, "rounded-chip bg-muted px-1.5 py-0.5 text-ink-2")}>{stats.mode}</span>
                  </At>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-muted">
              <Key swatch={<i className="inline-block h-[10px] w-[9px] rounded-[2px]" style={{ background: color }} />}>Segment carrying one character</Key>
              <Key swatch={<i className="inline-block h-[10px] w-[9px] rounded-[2px] ring-[1.5px] ring-ink" style={{ background: color }} />}>Retransmitted</Key>
              <Key swatch={<i className="inline-block h-[10px] w-[9px] rounded-[2px] bg-neg-fg" />}>Dropped — buffer full</Key>
              <Key swatch={<i className="inline-block size-[7px] rounded-full border border-ink-muted bg-surface" />}>ACK</Key>
              <span className="ml-auto text-ink-faint">Slowed down so you can follow each segment. Click any component to see what it does.</span>
            </div>
          </section>

          {selected && <ExplainPanel info={explain(selected, cc, stats)} onClose={() => setSelected(null)} />}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Friend's screen */}
            <section className="rounded-card border border-line bg-surface p-4">
              <p className={cn(LABEL, "text-ink-muted")}>Friend&rsquo;s screen</p>
              <div className="mt-2 min-h-[64px] rounded-control border border-line bg-subtle px-3 py-2 font-mono text-[14px] leading-[1.6] break-words text-ink">
                {!sim && <span className="text-ink-faint">Press Send to deliver your message.</span>}
                {sim && <Screen text={text} got={stats?.got ?? []} prefix={stats?.prefix ?? 0} />}
              </div>
              <p className="mt-2 text-[12px] leading-[1.55] text-ink-muted">
                TCP hands text to the app strictly in order. <span className="text-ink-faint">Grey</span> characters have arrived but wait behind a missing one until it is resent.
              </p>
            </section>

            {/* What just happened */}
            <section className="rounded-card border border-line bg-surface p-4">
              <p className={cn(LABEL, "text-ink-muted")}>What {info.name} is doing</p>
              <ol className="mt-2 flex min-h-[64px] flex-col gap-1.5 text-[12.5px] leading-[1.5]">
                {!stats && <li className="text-ink-faint">Events appear here as the message is sent.</li>}
                {stats?.log.map((l, i) => (
                  <li key={`${l.t}-${i}`} className="flex gap-2">
                    <span className="tnum w-11 shrink-0 text-right text-ink-faint">{(l.t / 1000).toFixed(1)} s</span>
                    <span className={cn(l.tone === "loss" ? "text-neg-fg" : l.tone === "good" ? "text-pos-fg" : "text-ink-2")}>{l.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Window over time */}
          <section className="rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className={cn(LABEL, "text-ink-muted")}>Congestion window over time</p>
              <Stat label="window" value={stats ? stats.cwnd.toFixed(1) : "—"} />
              <Stat label="in flight" value={stats ? String(stats.inflight) : "—"} />
              <Stat label="sent" value={stats ? String(stats.sent) : "—"} />
              <Stat label="resent" value={stats ? String(stats.retx) : "—"} />
              <Stat label="dropped" value={stats ? String(stats.drops) : "—"} tone={stats && stats.drops > 0 ? "neg" : undefined} />
              <Stat label="time" value={stats ? `${((stats.done ?? stats.t) / 1000).toFixed(1)} s` : "—"} tone={stats?.done ? "pos" : undefined} />
            </div>
            <WindowChart history={stats?.history ?? []} losses={stats?.losses ?? []} color={color} />
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-muted">
              <Key swatch={<i className="inline-block h-[2px] w-4" style={{ background: color }} />}>{info.name} window</Key>
              <Key swatch={<i className="inline-block w-4 border-t border-dashed border-blue-400" />}>Pipe full: bandwidth × RTT ≈ {BDP.toFixed(1)} segments</Key>
              <Key swatch={<i className="inline-block w-4 border-t border-dashed border-neg-fg" />}>Pipe + buffer full — beyond this, segments are dropped</Key>
              <Key swatch={<i className="inline-block h-2 w-[2px] bg-neg-fg" />}>A drop</Key>
            </div>
            <p className="mt-2 text-[12px] leading-[1.55] text-ink-muted">
              <b className="text-ink-2">What to look for:</b> {info.watch}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "neg" | "pos" }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[12px] text-ink-muted">
      {label}
      <b className={cn("tnum text-[14px]", tone === "neg" ? "text-neg-fg" : tone === "pos" ? "text-pos-fg" : "text-ink")}>{value}</b>
    </span>
  );
}

function Screen({ text, got, prefix }: { text: string; got: boolean[]; prefix: number }) {
  const waiting: ReactNode[] = [];
  for (let i = prefix; i < text.length; i++) {
    waiting.push(
      got[i] ? (
        <span key={i} className="text-ink-faint">
          {text[i]}
        </span>
      ) : (
        <span key={i} className="text-transparent">
          {text[i] === " " ? " " : "·"}
        </span>
      ),
    );
  }
  const lastGot = got.lastIndexOf(true);
  return (
    <>
      <span>{text.slice(0, prefix)}</span>
      {prefix < text.length && <span className="ml-px inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-ink" />}
      {lastGot >= prefix && waiting.slice(0, lastGot - prefix + 1)}
    </>
  );
}

const CW = 1000;
const CH = 190;

function WindowChart({ history, losses, color }: { history: { t: number; cwnd: number }[]; losses: number[]; color: string }) {
  const tMax = Math.max(20000, history[history.length - 1]?.t ?? 0);
  const yMax = Math.max(20, ...history.map((h) => h.cwnd)) * 1.1;
  const x = (t: number) => 36 + (t / tMax) * (CW - 44);
  const y = (w: number) => CH - 22 - (w / yMax) * (CH - 34);
  const pts = history.map((h) => `${x(h.t).toFixed(1)},${y(h.cwnd).toFixed(1)}`).join(" ");
  const ticks = [0, 5, 10, 15, 20, 25, 30, 40, 50].filter((v) => v <= yMax);
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="mt-3 h-auto w-full max-w-[1000px]" role="img" aria-label="Congestion window over time">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={36} x2={CW - 8} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
          <text x={30} y={y(v) + 3} textAnchor="end" className="tnum fill-ink-faint text-[9px]">
            {v}
          </text>
        </g>
      ))}
      <line x1={36} x2={CW - 8} y1={y(BDP)} y2={y(BDP)} stroke="var(--color-blue-400)" strokeDasharray="4 3" />
      <line x1={36} x2={CW - 8} y1={y(BDP + BUF)} y2={y(BDP + BUF)} stroke="var(--color-neg-fg)" strokeOpacity={0.6} strokeDasharray="4 3" />
      {losses.map((t, i) => (
        <line key={i} x1={x(t)} x2={x(t)} y1={CH - 22} y2={CH - 14} stroke="var(--color-neg-fg)" strokeWidth={1.5} />
      ))}
      {pts && <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
      <text x={36} y={CH - 2} className="fill-ink-faint text-[9px]">
        0 s
      </text>
      <text x={CW - 8} y={CH - 2} textAnchor="end" className="tnum fill-ink-faint text-[9px]">
        {(tMax / 1000).toFixed(0)} s
      </text>
      <text x={8} y={12} className="fill-ink-faint text-[9px]">
        segments
      </text>
    </svg>
  );
}

function explain(id: NodeId, cc: Algo, s: Stats | null): Explanation {
  const info = ALGORITHMS[cc];
  switch (id) {
    case "app":
      return {
        kind: "Your computer · app",
        title: "You, typing",
        text: <>Whatever you type is handed to the TCP socket in one go. The app does not decide when each byte leaves — the socket&rsquo;s congestion control does.</>,
        facts: [
          ["Segment size", "1 character (to make it visible)"],
          ["Message", s ? `${s.got.length} characters` : "—"],
        ],
      };
    case "tcp":
      return {
        kind: `Your computer · ${info.tagline}`,
        title: `${info.name} congestion control`,
        text: (
          <>
            <p>The sender keeps a <b>congestion window</b>: how many segments may be unacknowledged at once. Each returning ACK lets a new segment out. {info.name}&rsquo;s rules:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {info.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        ),
        tone: "ink",
        facts: [
          ["Phase", s?.mode ?? "—"],
          ["Window", s ? `${s.cwnd.toFixed(1)} segments` : "—"],
          ["In flight", s ? String(s.inflight) : "—"],
          ...(cc === "bbr" ? ([["Measured bottleneck", s && s.rate ? `${s.rate.toFixed(1)} seg/s` : "—"]] as [string, ReactNode][]) : ([["Resent", s ? String(s.retx) : "—"]] as [string, ReactNode][])),
        ],
      };
    case "router":
      return {
        kind: "Network path",
        title: "Bottleneck router",
        text: (
          <>
            The slowest link on the path: it forwards one segment every {SERVICE} ms. Segments that arrive faster wait in a buffer of <b>{BUF}</b>. When the buffer is full the next
            segment is <b className="text-neg-fg">dropped</b>, and the sender only finds out when later segments are acknowledged without it (3 duplicate ACKs) or a timer runs out.
          </>
        ),
        facts: [
          ["Forwarding rate", `${(1000 / SERVICE).toFixed(1)} seg/s`],
          ["Buffer", `${BUF} segments`],
          ["Waiting now", s ? String(s.queue) : "—"],
          ["Dropped so far", s ? String(s.drops) : "—"],
        ],
      };
    case "rtcp":
      return {
        kind: "Friend's computer · kernel",
        title: "Receiver TCP socket",
        text: <>Acknowledges every segment it receives and puts them back in order. If one is missing, later ones are held until the resent copy arrives.</>,
        facts: [
          ["Round trip with empty queue", `${(BASE_RTT / 1000).toFixed(1)} s (slowed)`],
          ["ACK travel time", `${(ACK_LEG / 1000).toFixed(1)} s`],
        ],
      };
    case "rapp":
      return {
        kind: "Friend's computer · app",
        title: "Friend's screen",
        text: <>Shows the text as TCP delivers it: only in order, never with gaps. A single lost segment stalls everything behind it — that pause is visible as grey characters.</>,
        facts: [
          ["Delivered", s ? `${s.prefix} / ${s.got.length}` : "—"],
          ["Done in", s?.done ? `${(s.done / 1000).toFixed(1)} s` : "—"],
        ],
      };
  }
}
