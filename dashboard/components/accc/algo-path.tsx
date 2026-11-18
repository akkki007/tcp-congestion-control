"use client";

import { AppWindow, Cpu, Monitor, Router } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Frame, LABEL, Node, Tile } from "@/components/accc/tcp-path";
import { Topbar } from "@/components/app/topbar";
import { ccColor } from "@/lib/accc";
import { ALGORITHMS, type Algo } from "@/lib/algorithms";
import { cn } from "@/lib/cn";

/*
 * One algorithm alone on a path: background download traffic shaped by that algorithm fills (or
 * doesn't fill) the bottleneck queue, and every keystroke you type has to wait in that queue too.
 * Everything runs in the browser; the queue model is a simplified textbook shape of each algorithm.
 */


const SLOW = 50; // animation runs 50x slower than the network
const MIN_RTT = 20; // ms
const LEG = (MIN_RTT / 4) * SLOW; // visual ms for one hop (app -> bottleneck, bottleneck -> app)
const BULK_RATE = 7; // background segments per visual second
const CYCLE = 6000; // visual ms per loss cycle (CUBIC / Reno)

/** Queueing delay at the bottleneck, in real ms, at visual time t. */
function queueDelay(cc: Algo, t: number): number {
  const u = (t % CYCLE) / CYCLE;
  if (cc === "cubic") {
    const v = u * 2 - 1; // concave rise, plateau at the old maximum, convex probe
    return 36 + 24 * ((1 + v * v * v) / 2);
  }
  if (cc === "reno") return 20 + 40 * u;
  const probe = (t % 1600) < 200 ? 4 : 0; // BBR probes for bandwidth 1/8 of the time
  return 1.5 + probe;
}

type Pkt = { id: number; kind: "data" | "key" | "ack"; born: number; arrive: number; release: number; done: number; x: number; ch?: string; drop?: boolean; counted?: boolean };
type Box = { l: number; r: number; cx: number; cy: number };

export function AlgoPlayground({ cc }: { cc: Algo }) {
  const info = ALGORITHMS[cc];
  const color = ccColor(cc);
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [geo, setGeo] = useState<Record<"app" | "tcp" | "router" | "rtcp" | "rapp", Box> | null>(null);
  const [load, setLoad] = useState(true);
  const [typed, setTyped] = useState("");
  const [screen, setScreen] = useState("");
  const [last, setLast] = useState<{ total: number; queue: number } | null>(null);
  const [queueNow, setQueueNow] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;
  const outbox = useRef<string[]>([]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const box = (id: string): Box => {
        const r = el.querySelector(`[data-tile="${id}"]`)!.getBoundingClientRect();
        const l = r.left - base.left;
        return { l, r: l + r.width, cx: l + r.width / 2, cy: r.top - base.top + r.height / 2 };
      };
      setGeo({ app: box("app"), tcp: box("tcp"), router: box("router"), rtcp: box("rtcp"), rapp: box("rapp") });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = svg.current;
    if (!host || !geo) return;
    const els = Array.from(host.querySelectorAll<SVGGElement>("[data-pkt]"));
    const pkts: Pkt[] = [];
    let id = 0;
    let acc = 0;
    let lastRelease = 0;
    let lastT = performance.now();
    let cycle = -1;
    let dropNext = false;
    let raf = 0;
    let shownQueue = -1;
    let delivered = 0;
    const t0 = performance.now();
    const queueHead = geo.router.l - 10;
    const queueRoom = geo.router.l - geo.tcp.r - 34;

    const send = (kind: Pkt["kind"], now: number, ch?: string) => {
      const arrive = now + LEG;
      const drop = kind === "data" && dropNext;
      if (drop) dropNext = false;
      const q = loadRef.current ? queueDelay(cc, arrive - t0) : 0;
      const release = drop ? arrive : Math.max(arrive + q * SLOW, lastRelease + 30);
      if (!drop) lastRelease = release;
      pkts.push({ id: id++, kind, born: now, arrive, release, done: release + LEG, x: geo.app.cx, ch, drop });
    };

    const frame = (now: number) => {
      const dt = Math.min(100, now - lastT);
      lastT = now;
      const t = now - t0;
      // A loss-based algorithm overflows the buffer once per cycle: the next arriving segment is dropped.
      const c = Math.floor(t / CYCLE);
      if (c !== cycle) {
        if (cycle >= 0 && cc !== "bbr" && loadRef.current) dropNext = true;
        cycle = c;
      }
      if (loadRef.current) {
        acc += (dt / 1000) * BULK_RATE;
        while (acc >= 1) {
          acc -= 1;
          send("data", now);
        }
      }
      while (outbox.current.length) send("key", now, outbox.current.shift());

      const q = loadRef.current ? queueDelay(cc, t) : 0;
      if (Math.round(q) !== shownQueue) setQueueNow((shownQueue = Math.round(q)));

      const waiting = pkts.filter((p) => p.kind !== "ack" && now >= p.arrive && now < p.release && !p.drop).sort((a, b) => a.release - b.release);
      const gap = Math.min(11, queueRoom / Math.max(1, waiting.length));
      const tail = queueHead - waiting.length * gap;
      const slot = new Map(waiting.map((p, i) => [p.id, queueHead - i * gap]));
      const speed1 = (geo.router.l - geo.app.cx) / LEG;

      for (let i = pkts.length - 1; i >= 0; i--) {
        const p = pkts[i];
        if (p.kind === "ack") {
          if (now >= p.done) pkts.splice(i, 1);
          continue;
        }
        if (p.drop && now >= p.arrive + 500) pkts.splice(i, 1);
        else if (now >= p.done) {
          if (p.kind === "key") {
            const ch = p.ch!;
            setScreen((s) => (ch === "\b" ? s.slice(0, -1) : s + ch));
            setLast({ total: (p.done - p.born) / SLOW, queue: (p.release - p.arrive) / SLOW });
          } else if (++delivered % 2 === 0) {
            // delayed ACK: one per two segments, straight back (the return path has no queue)
            pkts.push({ id: id++, kind: "ack", born: now, arrive: now, release: now, done: now + 2 * LEG, x: geo.rtcp.cx });
          }
          pkts.splice(i, 1);
        }
      }

      let n = 0;
      for (const p of pkts) {
        if (n >= els.length) break;
        let x: number;
        let y = geo.app.cy - 6;
        if (p.kind === "ack") {
          x = geo.rtcp.cx - ((now - p.born) / (2 * LEG)) * (geo.rtcp.cx - geo.tcp.cx);
          y = geo.app.cy + 7;
        } else if (now < p.release || p.drop) {
          // travel towards the bottleneck, then stand in line
          const target = p.drop ? tail - gap : (slot.get(p.id) ?? tail);
          p.x = Math.min(target, p.x + speed1 * dt);
          x = p.x;
        } else {
          x = geo.router.cx + ((now - p.release) / LEG) * (geo.rapp.cx - geo.router.cx);
        }
        const el = els[n++];
        el.style.display = "";
        el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        const [rect, text] = [el.children[0] as SVGRectElement, el.children[1] as SVGTextElement];
        const key = p.kind === "key";
        const size = key ? 14 : p.kind === "ack" ? 5 : 9;
        rect.setAttribute("x", String(-size / 2));
        rect.setAttribute("y", String(key ? -size / 2 - 1 : -size / 2));
        rect.setAttribute("width", String(size));
        rect.setAttribute("height", String(key ? size : p.kind === "ack" ? 5 : 6));
        rect.setAttribute("rx", key ? "3" : "1.5");
        rect.style.fill = p.drop ? "var(--color-neg-fg)" : key ? "var(--color-ink)" : p.kind === "ack" ? "var(--color-surface)" : color;
        rect.style.stroke = p.kind === "ack" ? "var(--color-ink-muted)" : "none";
        el.style.opacity = p.drop && now > p.arrive ? String(Math.max(0, 1 - (now - p.arrive) / 500)) : "1";
        text.textContent = key ? (p.ch === "\b" ? "⌫" : p.ch === " " ? "␣" : p.ch!) : "";
      }
      for (; n < els.length; n++) els[n].style.display = "none";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, cc, color]);

  const onType = (v: string) => {
    if (v.length > typed.length && v.startsWith(typed)) outbox.current.push(...v.slice(typed.length).split(""));
    else if (v.length < typed.length) outbox.current.push(...Array(typed.length - v.length).fill("\b"));
    setTyped(v);
  };

  const icon = (I: typeof Cpu) => <I size={20} strokeWidth={1.6} />;
  const propagation = MIN_RTT / 2;

  return (
    <>
      <Topbar workspace="ACCC" object={info.name} meta={info.tagline} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 sm:p-6">
          <div>
            <h1 className="flex items-center gap-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
              <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
              Feel the delay with {info.name}
            </h1>
            <p className="mt-1 max-w-[760px] text-[13px] leading-[1.6] text-ink-muted">{info.how}</p>
          </div>

          <section className="rounded-card border border-line bg-surface p-4">
            <div className="overflow-x-auto">
              <div ref={root} className="relative mx-auto w-max px-4 pt-6 pb-2">
                <svg ref={svg} aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
                  {geo && (
                    <>
                      <path d={`M${geo.app.r},${geo.app.cy - 6} H${geo.rapp.l}`} stroke="var(--color-ink-faint)" strokeOpacity={0.6} fill="none" />
                      <path d={`M${geo.rtcp.l},${geo.app.cy + 7} H${geo.tcp.r}`} stroke="var(--color-ink-faint)" strokeOpacity={0.6} strokeDasharray="3 3" fill="none" />
                    </>
                  )}
                  {Array.from({ length: 90 }, (_, i) => (
                    <g key={i} data-pkt style={{ display: "none" }}>
                      <rect />
                      <text textAnchor="middle" dy="3" className="fill-white font-mono text-[9px] font-semibold" />
                    </g>
                  ))}
                </svg>

                <div className="relative flex items-end">
                  <Frame label="Your computer" icon={<Monitor size={13} strokeWidth={1.8} />}>
                    <div className="flex items-end gap-6">
                      <Node caption="You" sub="typing">
                        <Tile id="app" label="Your app" icon={icon(AppWindow)} />
                      </Node>
                      <Node caption="TCP socket" sub={info.name}>
                        <Tile id="tcp" label={`${info.name} socket`} icon={icon(Cpu)} fill={color} />
                      </Node>
                    </div>
                  </Frame>

                  <div className="flex w-[260px] flex-col items-center self-stretch pb-3">
                    <span className={cn(LABEL, "mt-auto mb-[40px] text-ink-faint")}>queue at the bottleneck</span>
                  </div>

                  <div className="flex flex-col items-center pb-3">
                    <span className={cn(LABEL, "mb-2 text-ink-2")}>
                      wait <span className="tnum font-semibold text-ink">{queueNow} ms</span>
                    </span>
                    <Node caption="Bottleneck" sub="100 Mb/s">
                      <Tile id="router" label="Bottleneck router" icon={icon(Router)} tone={queueNow > 30 ? "amber" : undefined} />
                    </Node>
                  </div>

                  <div className="w-[120px]" />

                  <Frame label="Remote computer" icon={<Monitor size={13} strokeWidth={1.8} />}>
                    <div className="flex items-end gap-6">
                      <Node caption="TCP socket" sub="receiver">
                        <Tile id="rtcp" label="Receiver socket" icon={icon(Cpu)} />
                      </Node>
                      <Node caption="Screen" sub="shows your text">
                        <Tile id="rapp" label="Remote screen" icon={icon(Monitor)} />
                      </Node>
                    </div>
                  </Frame>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] text-ink-faint">
              Coloured blocks are {info.name}&rsquo;s download segments, black blocks are your keystrokes, hollow dots are ACKs. Animation is slowed {SLOW}×; the
              numbers are real milliseconds.
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-card border border-line bg-surface p-4">
              <p className={cn(LABEL, "text-ink-muted")}>Your computer</p>
              <input
                value={typed}
                onChange={(e) => onType(e.target.value)}
                placeholder="Type something…"
                maxLength={60}
                className="mt-2 w-full rounded-control border border-line-strong bg-surface px-3 py-2 font-mono text-[15px] text-ink outline-none focus:border-blue-500"
              />
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={load} onChange={(e) => setLoad(e.target.checked)} className="size-3.5 accent-blue-600" />
                A big download is running in the background with {info.name}
              </label>
            </section>

            <section className="rounded-card border border-line bg-surface p-4">
              <p className={cn(LABEL, "text-ink-muted")}>Remote screen</p>
              <div className="mt-2 min-h-[42px] rounded-control border border-line bg-subtle px-3 py-2 font-mono text-[15px] text-ink">
                {screen || <span className="text-ink-faint">…</span>}
                <span className="ml-px inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-ink" />
              </div>
              <p className="mt-3 text-[13px] text-ink-2">
                {last ? (
                  <>
                    Last keystroke took <b className="tnum text-ink">{last.total.toFixed(0)} ms</b>
                    <span className="text-ink-muted">
                      {" "}= {propagation} ms on the wire + <span className="tnum">{last.queue.toFixed(0)} ms</span> waiting in the queue
                    </span>
                  </>
                ) : (
                  <span className="text-ink-faint">Type on the left and watch the delay.</span>
                )}
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
