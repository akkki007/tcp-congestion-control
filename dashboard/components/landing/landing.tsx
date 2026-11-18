import { ArrowRight, Check, Clock, Cpu, Eye, Gauge, PlugZap, ShieldCheck, Sparkles, Spline, TrendingUpDown, Zap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ArchitectureDiagram, STEPS } from "@/components/landing/architecture";
import { SiteHeader } from "@/components/landing/site-header";
import { Logo } from "@/components/ui/logo";
import { ccColor } from "@/lib/accc";
import { cn } from "@/lib/cn";

const EYEBROW = "font-mono text-[11.5px] font-semibold uppercase tracking-[0.1em] text-blue-600";

function Section({ id, eyebrow, title, lead, children, className }: { id?: string; eyebrow: string; title: string; lead?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-16 border-t border-line px-4 py-16 sm:px-6 sm:py-20", className)}>
      <div className="mx-auto max-w-[1120px]">
        <p className={EYEBROW}>{eyebrow}</p>
        <h2 className="mt-3 max-w-[760px] font-display text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink sm:text-[36px]">{title}</h2>
        {lead && <p className="mt-4 max-w-[720px] text-[16px] leading-[1.65] text-ink-muted">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Chip({ cc, className }: { cc: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-chip border border-line bg-surface px-2 py-1 text-[12px] font-semibold text-ink", className)}>
      <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: ccColor(cc) }} />
      {cc.toUpperCase()}
    </span>
  );
}

/** One connection, three behaviours: what a fixed algorithm does vs. what ACCC does. */
function PhaseStrip() {
  const phases: { name: string; detail: string; best: string; w: string }[] = [
    { name: "Bulk upload", detail: "steady, high throughput", best: "bbr", w: "flex-[3]" },
    { name: "Interactive", detail: "small, sparse messages", best: "reno", w: "flex-[3]" },
    { name: "Bulk upload", detail: "steady, high throughput", best: "bbr", w: "flex-[3]" },
  ];
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-e2">
      <div className="flex items-center justify-between text-[12px] text-ink-muted">
        <span className="font-mono uppercase tracking-[0.08em]">one TCP connection</span>
        <span>time →</span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {phases.map((p, i) => (
          <div key={i} className={cn(p.w, "rounded-control px-3 py-2", p.best === "bbr" ? "bg-blue-50" : "bg-violet-50")}>
            <p className="text-[13px] font-semibold text-ink">{p.name}</p>
            <p className="text-[11.5px] text-ink-muted">{p.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-2.5">
        <span className="text-[12px] font-medium text-ink-muted">Today</span>
        <div className="flex h-7 items-center rounded-control px-3 text-[12px] font-semibold text-white" style={{ background: ccColor("cubic") }}>
          CUBIC — chosen once, never changes
        </div>
        <span className="text-[12px] font-medium text-ink">With ACCC</span>
        <div className="flex gap-1.5">
          {phases.map((p, i) => (
            <div key={i} className={cn(p.w, "flex h-7 items-center rounded-control px-3 text-[12px] font-semibold text-white")} style={{ background: ccColor(p.best) }}>
              {p.best.toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FACTS: [string, string][] = [
  ["0", "kernel patches"],
  ["0", "app code changes"],
  ["50 ms", "telemetry interval"],
  ["5", "live switches in the demo, 0 bytes lost"],
];

const PILLARS: { icon: typeof Eye; title: string; text: string }[] = [
  { icon: Eye, title: "Observe", text: "A tiny C library, injected with LD_PRELOAD, samples each socket’s TCP_INFO every 50 ms." },
  { icon: Sparkles, title: "Decide", text: "The controller turns 500 ms of samples into 14 features and classifies the traffic. A stability guard stops flapping." },
  { icon: Zap, title: "Act", text: "The shim calls setsockopt(TCP_CONGESTION) on the live socket. The connection never drops." },
];

const COMPONENTS: { icon: typeof Eye; name: string; file: string; ref: string; text: string }[] = [
  { icon: PlugZap, name: "LD_PRELOAD shim", file: "shim/libaccc.c", ref: "106 · 107", text: "Hooks socket(), connect(), close(); reads TCP_INFO; applies switch commands." },
  { icon: Cpu, name: "Telemetry sample", file: "accc/telemetry/", ref: "102", text: "One snapshot of the kernel’s view: RTT, cwnd, retransmits, bytes acked, app-limited." },
  { icon: Gauge, name: "Feature extractor", file: "accc/features.py", ref: "103", text: "Sliding window of 10 samples → 14 features (RTT inflation, loss, throughput, idle…)." },
  { icon: Sparkles, name: "Classifier", file: "accc/policy.py", ref: "104", text: "Feature vector → probability per algorithm. Rule-based today, Random Forest next." },
  { icon: ShieldCheck, name: "Stability guard", file: "accc/guard.py", ref: "105", text: "Switch only if the winner leads by 0.15 and the current one has lasted 200 ms." },
  { icon: Clock, name: "Controller daemon", file: "accc/daemon.py", ref: "—", text: "Registry of live sockets, the decision loop, and the command channel back to the shim." },
];

const ALGOS: { cc: string; icon: typeof Eye; style: string; best: string; delay: string }[] = [
  { cc: "cubic", icon: Spline, style: "Loss-based. Speeds up until packets drop, then backs off.", best: "Fast wired links · Linux default", delay: "≈ 58 ms" },
  { cc: "bbr", icon: Gauge, style: "Model-based. Measures bandwidth and delay, sends at that rate.", best: "Bulk transfer, video, lossy links", delay: "≈ 12 ms" },
  { cc: "reno", icon: TrendingUpDown, style: "Classic AIMD. +1 segment per round trip, halve on loss.", best: "Light, interactive traffic", delay: "≈ 52 ms" },
];

const ROADMAP: [string, string, boolean][] = [
  ["P1–P2", "Stability guard, telemetry and 14-feature extractor (unit-tested)", true],
  ["P3–P4", "LD_PRELOAD shim and controller daemon — live mid-flow switching", true],
  ["UI", "Live dashboard, TCP path graph, per-algorithm playground", true],
  ["P5", "Training data and Random Forest classifier", false],
  ["P6", "eBPF telemetry collector (covers static / Go binaries)", false],
  ["P7", "Benchmarks: fixed CC vs. ACCC under tc-netem (goodput, tail latency)", false],
];

export function Landing() {
  return (
    <div className="min-h-dvh bg-surface text-ink-2">
      <SiteHeader />

      {/* Hero */}
      <section className="grid-lines px-4 pt-16 pb-16 sm:px-6 sm:pt-24">
        <div className="mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className={EYEBROW}>ACCC · Adaptive Congestion Control Controller</p>
            <h1 className="mt-4 font-display text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[54px]">
              The right TCP algorithm, for every moment of a connection.
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-[1.65] text-ink-muted">
              ACCC watches each live TCP connection, recognises what kind of traffic it is carrying right now, and switches its
              congestion-control algorithm <b className="font-semibold text-ink">mid-flow</b> — no kernel patch, no application changes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/live" className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium">
                Watch it switch live <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#architecture" className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium">
                See the architecture
              </a>
            </div>
          </div>
          <PhaseStrip />
        </div>
        <dl className="mx-auto mt-14 grid max-w-[1120px] grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
          {FACTS.map(([v, k]) => (
            <div key={k} className="bg-surface px-5 py-4">
              <dt className="tnum font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">{v}</dt>
              <dd className="mt-0.5 text-[13px] text-ink-muted">{k}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Section
        id="problem"
        eyebrow="01 · The problem"
        title="TCP picks one driving style per connection — and never changes it."
        lead={
          <>
            Linux ships several congestion-control algorithms, each best at different traffic. Today the choice is made once, for
            the whole machine or when the socket opens. But real applications change behaviour while they run: a video-call app
            uploads a file, then goes back to small chat messages on the same connection.
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Fixed choice", "net.ipv4.tcp_congestion_control is system-wide; per-socket choice happens once, at open."],
            ["Changing traffic", "Bulk transfer wants bandwidth; interactive traffic wants low delay. One algorithm can’t be best at both."],
            ["The cost", "Either wasted throughput or a full queue that makes every keystroke and API call wait."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-card border border-line bg-subtle p-5">
              <p className="text-[15px] font-semibold text-ink">{t}</p>
              <p className="mt-2 text-[14px] leading-[1.6] text-ink-muted">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="how"
        eyebrow="02 · Our idea"
        title="Observe → Decide → Act, every 50 milliseconds."
        lead="A closed control loop that sits beside the application and the kernel, never in the data path."
      >
        <ol className="grid gap-4 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative rounded-card border border-line bg-surface p-6">
              <span className="font-mono text-[12px] text-ink-faint">0{i + 1}</span>
              <Icon className="mt-3 h-7 w-7 text-violet-700" strokeWidth={1.6} />
              <p className="mt-4 text-[18px] font-semibold text-ink">{title}</p>
              <p className="mt-2 text-[14px] leading-[1.6] text-ink-muted">{text}</p>
              {i < 2 && <ArrowRight className="absolute top-1/2 -right-3.5 hidden h-5 w-5 -translate-y-1/2 text-ink-faint md:block" />}
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="architecture"
        eyebrow="03 · Architecture"
        title="Four pieces, one loop."
        lead="The shim watches the socket, the controller decides, the shim applies the decision, and the dashboard shows it all live."
        className="bg-subtle"
      >
        <div className="flex flex-col gap-8">
          <div className="rounded-card border border-line bg-surface p-4 sm:p-8">
            <div className="mx-auto max-w-[940px]">
              <ArchitectureDiagram />
            </div>
          </div>
          <ol className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white", i === 0 || i === 5 ? "bg-ink" : "bg-violet-700")}>{i + 1}</span>
                <div>
                  <p className="text-[14.5px] font-semibold text-ink">{t}</p>
                  <p className="mt-0.5 text-[13.5px] leading-[1.55] text-ink-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {COMPONENTS.map(({ icon: Icon, name, file, ref, text }) => (
            <div key={name} className="bg-surface p-5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                <p className="text-[14.5px] font-semibold text-ink">{name}</p>
                <span className="ml-auto font-mono text-[10.5px] text-ink-faint">REF {ref}</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-muted">{text}</p>
              <code className="mt-3 inline-block rounded-chip bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{file}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="demo"
        eyebrow="04 · Result"
        title="One connection, five switches, zero bytes lost."
        lead="The demo app runs bulk → interactive → bulk on a single socket. ACCC follows it:"
      >
        <div className="rounded-card border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center gap-2">
            {["cubic", "bbr", "cubic", "reno", "cubic", "bbr"].map((cc, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-4 w-4 text-ink-faint" />}
                <Chip cc={cc} className="px-2.5 py-1.5 text-[13px]" />
              </span>
            ))}
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Switches performed mid-flow", "5"],
              ["Bytes sent = bytes received", "✓ every byte"],
              ["Connection survived", "✓ intact"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-control bg-subtle p-4">
                <dt className="text-[12.5px] text-ink-muted">{k}</dt>
                <dd className="mt-1 text-[20px] font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/live" className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-blue-600 hover:underline">
            Run it yourself on the live dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Section>

      <Section
        id="algorithms"
        eyebrow="05 · The algorithms"
        title="Why it matters: feel the delay."
        lead="Same 100 Mb/s link, a big download in the background, and you typing. The time each keystroke waits depends on the algorithm."
        className="bg-subtle"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {ALGOS.map(({ cc, icon: Icon, style, best, delay }) => (
            <Link key={cc} href={`/algorithm/${cc}`} className="group rounded-card border border-line bg-surface p-6 transition-colors hover:border-line-strong">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5" style={{ color: ccColor(cc) }} strokeWidth={1.75} />
                <Chip cc={cc} />
              </div>
              <p className="mt-4 text-[14px] leading-[1.6] text-ink-2">{style}</p>
              <p className="mt-2 text-[13px] text-ink-muted">Best for: {best}</p>
              <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
                <div>
                  <p className="text-[12px] text-ink-muted">Keystroke delay</p>
                  <p className="tnum text-[24px] font-semibold text-ink">{delay}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 group-hover:underline">
                  Try it <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="status" eyebrow="06 · Status" title="Working end to end today. The model is next.">
        <ol className="divide-y divide-line rounded-card border border-line">
          {ROADMAP.map(([phase, text, done]) => (
            <li key={phase} className="flex items-center gap-4 px-5 py-3.5">
              <span className="w-14 font-mono text-[12px] text-ink-faint">{phase}</span>
              <span className={cn("flex-1 text-[14px]", done ? "text-ink" : "text-ink-muted")}>{text}</span>
              {done ? (
                <span className="inline-flex items-center gap-1 rounded-chip bg-pos-bg px-2 py-0.5 text-[11.5px] font-semibold text-pos-fg">
                  <Check className="h-3 w-3" /> Done
                </span>
              ) : (
                <span className="rounded-chip bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-ink-muted">Next</span>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <footer className="border-t border-line px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-4 text-[13px] text-ink-muted">
          <Logo />
          <span>Adaptive Congestion Control Controller</span>
          <div className="ml-auto flex gap-5">
            <Link href="/live" className="hover:text-ink">Live demo</Link>
            <Link href="/algorithm/bbr" className="hover:text-ink">Algorithms</Link>
            <Link href="/docs" className="hover:text-ink">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
