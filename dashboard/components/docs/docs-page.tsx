import { ArrowRight, Check, Mic } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ArchitectureDiagram, STEPS } from "@/components/landing/architecture";
import { SiteHeader } from "@/components/landing/site-header";
import { ccColor } from "@/lib/accc";
import { cn } from "@/lib/cn";

/*
 * Everything about the project on one page, in presentation order. Content follows
 * docs/EXPLAINED.md and the code; keep the two in step when either changes.
 */

const TOC: [string, string][] = [
  ["script", "Talking points"],
  ["overview", "1. Overview"],
  ["problem", "2. The problem"],
  ["architecture", "3. Architecture"],
  ["journey", "4. A connection’s journey"],
  ["shim", "5. The shim"],
  ["protocol", "6. Message protocol"],
  ["telemetry", "7. Telemetry"],
  ["features", "8. Features"],
  ["classifier", "9. Classifier"],
  ["guard", "10. Stability guard"],
  ["daemon", "11. Controller daemon"],
  ["demo", "12. The demo"],
  ["simulated", "13. Simulated mode"],
  ["webapp", "14. The web app"],
  ["run", "15. How to run"],
  ["claims", "16. Patent claim mapping"],
  ["status", "17. Status & limitations"],
  ["glossary", "18. Glossary"],
];

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 border-t border-line pt-10 font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] text-ink first:border-0 first:pt-0">
      {children}
    </h2>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-[16px] font-semibold text-ink">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.7] text-ink-2">{children}</p>;
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded-chip bg-muted px-1 py-px font-mono text-[13px] text-ink">{children}</code>;
}

function Pre({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-control border border-line bg-subtle p-4 font-mono text-[12.5px] leading-[1.6] text-ink-2">{children}</pre>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-[1.65] text-ink-2">
          <span aria-hidden className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-control border border-line">
      <table className="w-full min-w-[560px] text-left text-[13.5px]">
        <thead className="border-b border-line bg-subtle text-[12px] text-ink-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("px-3 py-2 leading-[1.55]", j === 0 ? "text-ink" : "text-ink-2")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cc({ cc }: { cc: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
      <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: ccColor(cc) }} />
      {cc.toUpperCase()}
    </span>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="mt-4 rounded-control border border-blue-200 bg-blue-50 px-4 py-3 text-[14px] leading-[1.6] text-ink-2">{children}</div>;
}

const SCRIPT: [string, string][] = [
  ["Problem", "TCP picks one congestion-control algorithm per connection and never changes it — but apps switch between bulk transfer and interactive traffic on the same connection."],
  ["Idea", "Watch each live socket, recognise the traffic it carries right now, and switch its algorithm mid-flow."],
  ["How", "An LD_PRELOAD shim reads TCP_INFO every 50 ms; a controller turns 500 ms of samples into 14 features, classifies, and a stability guard approves; the shim calls setsockopt(TCP_CONGESTION)."],
  ["Constraints met", "No kernel patch, no application change, the connection never drops."],
  ["Proof", "Demo: one connection, bulk → interactive → bulk, 5 switches, bytes sent = bytes received."],
  ["Why it matters", "Show /algorithm/cubic vs /algorithm/bbr: same link, keystrokes wait ≈ 58 ms vs ≈ 12 ms."],
  ["Next", "Random Forest classifier (P5), eBPF telemetry (P6), benchmarks under tc-netem (P7)."],
];

export function DocsPage() {
  return (
    <div className="min-h-dvh bg-surface text-ink-2">
      <SiteHeader current="docs" />
      <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-0.5 overflow-y-auto pr-2">
            <p className="mb-2 font-mono text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">On this page</p>
            {TOC.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-button px-2 py-1 text-[13px] text-ink-muted hover:bg-hover hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-[780px]">
          <p className="font-mono text-[11.5px] font-semibold tracking-[0.1em] text-blue-600 uppercase">Documentation</p>
          <h1 className="mt-3 font-display text-[38px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink">ACCC — everything on one page</h1>
          <p className="mt-3 text-[16px] leading-[1.65] text-ink-muted">
            Adaptive Congestion Control Controller: application-aware, mid-flow switching of TCP congestion-control algorithms per
            socket, using socket telemetry, a classifier and a stability guard. No kernel patch, no application changes.
          </p>

          {/* Talking points */}
          <section id="script" className="mt-8 scroll-mt-20 rounded-card border border-violet-200 bg-violet-50 p-5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-violet-700">
              <Mic className="h-4 w-4" /> Two-minute talking points
            </p>
            <ol className="mt-3 flex flex-col gap-2.5">
              {SCRIPT.map(([k, v], i) => (
                <li key={k} className="flex gap-3 text-[14px] leading-[1.6]">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-700 text-[11px] font-semibold text-white">{i + 1}</span>
                  <span>
                    <b className="text-ink">{k}.</b> {v}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-12 flex flex-col gap-4">
            <H2 id="overview">1. Overview</H2>
            <P>
              When a computer sends data with TCP, a <b>congestion-control (CC) algorithm</b> decides how fast to send — the
              connection’s “driving style”. ACCC watches every connection while it runs, recognises what kind of traffic it
              carries, and <b>switches its algorithm on the fly</b>, without breaking the connection.
            </P>
            <Table
              head={["Fact", "Value"]}
              rows={[
                ["Kernel patches", "0 — uses standard Linux APIs"],
                ["Application changes", "0 — injected with LD_PRELOAD"],
                ["Telemetry interval", "50 ms (TCP_INFO)"],
                ["Decision window", "10 samples = 500 ms → 14 features"],
                ["Stability guard", "confidence margin 0.15 · minimum dwell 200 ms"],
                ["Demo result", "5 mid-flow switches, bytes sent = bytes received"],
              ]}
            />

            <H2 id="problem">2. The problem</H2>
            <P>Linux ships several congestion-control algorithms, each best for different traffic:</P>
            <Table
              head={["Algorithm", "Driving style", "Best for"]}
              rows={[
                [<Cc key="c" cc="cubic" />, "Speeds up aggressively, backs off on loss. Linux default.", "Fast, wired links"],
                [<Cc key="b" cc="bbr" />, "Measures bandwidth and delay, sends at that rate.", "Big downloads, video, lossy links"],
                [<Cc key="r" cc="reno" />, "Classic AIMD: +1 segment per RTT, halve on loss.", "Light traffic"],
                [<Cc key="v" cc="vegas" />, "Watches delay, slows down before queues build.", "Short interactive request/response"],
              ]}
            />
            <P>
              <b>The catch:</b> the algorithm is chosen <b>once</b> — system-wide (<C>net.ipv4.tcp_congestion_control</C>) or when the
              socket opens — and never changes. Real applications change behaviour while running: a video-call app uploads a file,
              then goes back to small chat messages on the same connection. One fixed style cannot be best for both: either
              throughput is wasted, or a full queue makes every small message wait.
            </P>

            <H2 id="architecture">3. Architecture</H2>
            <P>Four pieces, one loop: the shim watches the socket, the controller decides, the shim applies the decision, the dashboard shows it live.</P>
            <div className="mt-4 rounded-card border border-line p-3 sm:p-5">
              <ArchitectureDiagram />
            </div>
            <ol className="mt-4 flex flex-col gap-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white", i === 0 || i === 5 ? "bg-ink" : "bg-violet-700")}>{i + 1}</span>
                  <p className="text-[14.5px] leading-[1.6]">
                    <b className="text-ink">{t}.</b> {d}
                  </p>
                </li>
              ))}
            </ol>

            <H2 id="journey">4. A connection’s journey</H2>
            <Pre>{`App   → shim  : connect(server)
shim  → kernel: real connect()
shim  → ctl   : "reg"   new TCP socket fd=3, cc=cubic
loop every 50 ms
  shim → kernel: getsockopt(TCP_INFO)
  kernel → shim: RTT, cwnd, bytes acked, retransmits…
  shim → ctl   : "tel"   telemetry sample
  ctl          : window full? → features → classifier → guard
(app is doing a bulk upload → classifier says BBR 80 %, guard: margin OK, dwell OK)
ctl   → shim  : "set"   fd=3 → bbr
shim  → kernel: setsockopt(fd 3, TCP_CONGESTION, "bbr")
shim  → ctl   : "ack"   ok
              … the connection keeps running — no reconnect, no data lost …
App   → shim  : close(fd 3)
shim  → ctl   : "unreg" fd=3`}</Pre>

            <H2 id="shim">5. The shim — shim/libaccc.c (ref. 106, 107)</H2>
            <P>
              A small C library loaded <i>into</i> the application with <C>LD_PRELOAD=./shim/libaccc.so ./my_app</C>. Our versions of{" "}
              <C>socket()</C>, <C>connect()</C>, <C>accept()</C> and <C>close()</C> call the real functions and additionally take note of
              TCP connections.
            </P>
            <List
              items={[
                <>Tracks IPv4/IPv6 TCP sockets only; everything else is ignored.</>,
                <>Registers each connected socket with the controller (<C>reg</C>).</>,
                <>Samples <C>getsockopt(TCP_INFO)</C> every 50 ms and sends it (<C>tel</C>).</>,
                <>Executes switches: <C>setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION, &quot;bbr&quot;)</C> — Linux allows this on a live socket.</>,
              ]}
            />
            <H3>Safety rules</H3>
            <List
              items={[
                <><b>Fail-open:</b> if the controller is down the app works normally; the shim retries once per second.</>,
                <><b>No races on closed sockets:</b> a lock prevents touching a just-closed (possibly reused) fd.</>,
                <><b>Fork-safe:</b> a forked child starts with clean state.</>,
                <><b>Why C:</b> it lives inside someone else’s program — tiny, no runtime, survives <C>fork()</C>.</>,
              ]}
            />

            <H2 id="protocol">6. Message protocol (shim ⇄ controller)</H2>
            <P>A Unix domain socket, one JSON message per line.</P>
            <Table
              head={["Direction", "Message", "Meaning"]}
              rows={[
                ["shim → ctl", <C key="1">{`{"t":"reg", pid, fd, src, dst, cc}`}</C>, "New TCP connection"],
                ["shim → ctl", <C key="2">{`{"t":"tel", pid, fd, ts, srtt_us, snd_cwnd, …}`}</C>, "One telemetry sample"],
                ["shim → ctl", <C key="3">{`{"t":"unreg", pid, fd}`}</C>, "Connection closed"],
                ["ctl → shim", <C key="4">{`{"t":"set", fd, cc}`}</C>, "Switch this socket"],
                ["shim → ctl", <C key="5">{`{"t":"ack", fd, cc, ok, err}`}</C>, "Switch done (or failed, with reason)"],
              ]}
            />

            <H2 id="telemetry">7. Telemetry — accc/telemetry/sample.py (ref. 102)</H2>
            <Table
              head={["Field", "Meaning"]}
              rows={[
                [<C key="a">srtt_us</C>, "Smoothed round-trip time"],
                [<C key="b">rttvar_us</C>, "How much the RTT jumps around"],
                [<C key="c">min_rtt_us</C>, "Fastest round trip seen — the “empty road” delay"],
                [<C key="d">snd_cwnd</C>, "Congestion window: packets allowed in flight"],
                [<C key="e">total_retrans</C>, "Re-sent packets (a sign of loss)"],
                [<C key="f">segs_out</C>, "Packets sent so far"],
                [<C key="g">bytes_acked</C>, "Bytes the receiver confirmed"],
                [<C key="h">app_limited</C>, "The app, not the network, is the bottleneck"],
              ]}
            />
            <Note>The patent’s preferred source is an in-kernel eBPF program (phase P6). Today the shim reads the same fields with getsockopt(TCP_INFO), which works on any Linux.</Note>

            <H2 id="features">8. Features — accc/features.py (ref. 103)</H2>
            <P>One sample is noisy, so each socket keeps a sliding window of the last 10 samples (500 ms) summarised into 14 numbers.</P>
            <Table
              head={["Feature", "What it tells us"]}
              rows={[
                ["rtt_mean, rtt_std, min_rtt, rttvar_mean", "How slow and jittery the path is"],
                ["rtt_inflation", "RTT ÷ min RTT; above 1 = packets are queueing"],
                ["loss_ratio", "Fraction of packets re-sent"],
                ["cwnd_mean, cwnd_slope", "Window size and whether it’s growing"],
                ["tput_mbps, tput_trend", "Throughput and its direction"],
                ["burst_cv", "Steady stream vs. on/off bursts"],
                ["idle_frac", "Fraction of intervals with nothing sent — high for chatty apps"],
                ["app_limited_frac", "How often the app was the bottleneck"],
                ["log_flow_bytes", "Total bytes so far (log) — flow-size hint"],
              ]}
            />

            <H2 id="classifier">9. Classifier — accc/policy.py (ref. 104)</H2>
            <P>Answers “how well does each algorithm suit this traffic right now?” as probabilities, e.g. {"{bbr: 0.8, cubic: 0.1, reno: 0.1}"}.</P>
            <List
              items={[
                <><b>Today</b> — transparent rules: steady high throughput, never idle → <Cc cc="bbr" />; mostly idle / small messages → <Cc cc="vegas" /> (or <Cc cc="reno" /> without the Vegas module); otherwise → <Cc cc="cubic" />.</>,
                <><b>Next (P5)</b> — a Random Forest trained with scikit-learn, behind the same <C>predict_proba(features)</C> interface.</>,
              ]}
            />

            <H2 id="guard">10. Stability guard — accc/guard.py (ref. 105)</H2>
            <P>A classifier can flip on borderline traffic; switching that often hurts. A switch happens only if every check passes:</P>
            <ol className="mt-4 grid gap-2 sm:grid-cols-4">
              {[
                ["Different?", "Best algorithm ≠ active one"],
                ["Confident?", "p(best) − p(active) ≥ 0.15"],
                ["Settled?", "Active for ≥ 200 ms"],
                ["Available?", "Kernel has the algorithm"],
              ].map(([t, d], i) => (
                <li key={t} className="relative rounded-control border border-line bg-subtle p-3">
                  <p className="text-[13.5px] font-semibold text-ink">{t}</p>
                  <p className="mt-1 text-[12.5px] text-ink-muted">{d}</p>
                  {i < 3 && <ArrowRight className="absolute top-1/2 -right-2.5 hidden h-4 w-4 -translate-y-1/2 text-ink-faint sm:block" />}
                </li>
              ))}
            </ol>
            <P>Otherwise: KEEP. Unit tests show alternating near-ties cause zero switches and even adversarial input can’t switch more than once per dwell period.</P>

            <H2 id="daemon">11. Controller daemon — accc/daemon.py</H2>
            <List
              items={[
                "Listens on the Unix socket for shims (Python asyncio — one process, many apps).",
                "Registry of live flows: (pid, fd) → window, current algorithm, last switch time.",
                "Each sample: window → features → policy → guard.",
                "On a switch: sends set and marks the flow pending until the ack arrives.",
                "Reports every event (register, decision, ack, unregister) to a callback used by the terminal demo and the dashboard.",
              ]}
            />

            <H2 id="demo">12. The demo</H2>
            <P>
              <C>demo/workload.py</C> is a plain Python TCP client with <b>no ACCC code</b>. On one connection it runs three phases:
            </P>
            <Table
              head={["Time", "Phase", "Behaviour"]}
              rows={[
                ["0–3 s", "Bulk", "64 KB chunks as fast as possible (file upload)"],
                ["3–6 s", "Interactive", "200-byte message every 150 ms (chat)"],
                ["6–9 s", "Bulk", "Back to the upload"],
              ]}
            />
            <P>
              <C>demo/runner.py</C> starts the controller, a byte-counting receiver and the workload with <C>LD_PRELOAD</C>, then checks{" "}
              <b>bytes sent = bytes received</b>.
            </P>
            <Pre>{`[ 0.03s] REGISTER  fd=3 127.0.0.1:53230 -> 127.0.0.1:39019 cc=cubic
[ 0.48s] cc=cubic  tput= 815.6 Mb/s idle=0.00  SWITCH -> bbr
[ 3.03s] ===== application phase: INTERACTIVE =====
[ 3.38s] cc=cubic  tput= 184.1 Mb/s idle=0.56  SWITCH -> reno
[ 6.03s] ===== application phase: BULK =====
[ 6.53s] cc=cubic  tput= 836.5 Mb/s idle=0.00  SWITCH -> bbr

switches performed mid-flow : 5 (cubic -> bbr -> cubic -> reno -> cubic -> bbr)
connection survived intact  : True`}</Pre>

            <H2 id="simulated">13. Simulated mode (Windows / macOS)</H2>
            <P>
              The live path needs Linux. Elsewhere — or with <C>--sim</C> / <C>ACCC_MODE=simulated</C> — <C>demo/simulate.py</C> models the
              socket and kernel (100 Mb/s bottleneck, 20 ms RTT, per-algorithm throughput, queueing and loss) but feeds samples into
              the <b>real</b> controller, features, policy and guard. It produces the same switch sequence as the Linux demo. The
              dashboard shows a “Simulated path · real controller” badge.
            </P>

            <H2 id="webapp">14. The web app</H2>
            <Table
              head={["Route", "What it shows"]}
              rows={[
                [<Link key="1" href="/" className="text-blue-600 hover:underline">/</Link>, "Landing page: pitch, architecture, result, status"],
                [<Link key="2" href="/live" className="text-blue-600 hover:underline">/live</Link>, "Live run: TCP path graph with packets, ACKs, telemetry and switch commands; KPIs; throughput timeline"],
                [<Link key="3" href="/algorithm/cubic" className="text-blue-600 hover:underline">/algorithm/cubic · bbr · reno</Link>, "Feel the delay: type while a background download runs; see how long each keystroke waits in the queue"],
                [<Link key="4" href="/docs" className="text-blue-600 hover:underline">/docs</Link>, "This page"],
              ]}
            />
            <P>
              Data flow: <C>demo/server.py</C> (stdlib asyncio) runs the scenario and streams events as Server-Sent Events; Next.js
              proxies <C>/api/*</C> to it so the browser talks to one origin. The per-algorithm pages run entirely in the browser with a
              simplified queue model.
            </P>

            <H2 id="run">15. How to run</H2>
            <H3>Linux (live kernel)</H3>
            <Pre>{`pip install -e ".[dev]"
make shim                    # builds shim/libaccc.so
make test                    # unit tests
make demo                    # terminal demo
python3 -m demo.server       # terminal 1: backend on :8765
cd dashboard && bun install && bun run dev   # terminal 2: http://localhost:3000`}</Pre>
            <H3>Windows / macOS (simulated)</H3>
            <Pre>{`python -m pip install -e ".[dev]"
python -m pytest -q
python -m demo.live_switch
python -m demo.server                        # terminal 1
cd dashboard; bun install; bun run dev:bun   # terminal 2 (no Node.js needed)`}</Pre>

            <H2 id="claims">16. Patent claim mapping</H2>
            <Table
              head={["Claim", "Requirement", "Where it is"]}
              rows={[
                ["1", "Telemetry collector + ML classifier + stability guard + mid-flow actuator", "shim + features.py + policy.py + guard.py + setsockopt"],
                ["2", "Telemetry includes smoothed RTT, RTT variance, retransmissions, cwnd", "TelemetrySample fields (eBPF planned)"],
                ["3", "Random Forest / gradient-boosted trees trained offline", "Next phase (P5); rule-based placeholder today"],
                ["4", "Switch only with confidence margin and minimum dwell", "accc/guard.py + unit tests"],
                ["5", "Actuator = LD_PRELOAD shim calling setsockopt(TCP_CONGESTION)", "shim/libaccc.c"],
                ["6–7", "Switching without terminating or restarting the connection", "Demo: bytes sent = received after 5 switches"],
                ["8", "Kernel and application unmodified", "Stock kernel; workload.py has no ACCC code"],
              ]}
            />

            <H2 id="status">17. Status &amp; limitations</H2>
            <Table
              head={["Phase", "Item", "Status"]}
              rows={(
                [
                  ["P0", "Plan, repository structure", true],
                  ["P1", "Stability guard", true],
                  ["P2", "Telemetry + feature extractor", true],
                  ["P3", "LD_PRELOAD shim", true],
                  ["P4", "Controller daemon (rule-based policy)", true],
                  ["UI", "Landing, live dashboard, algorithm playground, docs", true],
                  ["P5", "Training data + Random Forest classifier", false],
                  ["P6", "eBPF telemetry collector", false],
                  ["P7", "Benchmarks: fixed CC vs. ACCC under tc-netem", false],
                ] as [string, string, boolean][]
              ).map(([p, t, done]) => [
                p,
                t,
                done ? (
                  <span key={p} className="inline-flex items-center gap-1 font-semibold text-pos-fg">
                    <Check className="h-3.5 w-3.5" /> Done
                  </span>
                ) : (
                  <span key={p} className="text-ink-muted">Planned</span>
                ),
              ])}
            />
            <H3>Known limitations</H3>
            <List
              items={[
                "Decisions come from rules, not yet a trained model.",
                "The live demo runs over localhost; realistic delay/loss experiments need Linux with tc-netem.",
                "LD_PRELOAD doesn’t reach statically linked or Go programs; eBPF telemetry and a pidfd_getfd actuator are the planned answers.",
                "Vegas is used only if the kernel has the tcp_vegas module.",
                "The per-algorithm pages use a simplified, textbook queue model — illustrative, not measured.",
              ]}
            />

            <H2 id="glossary">18. Glossary</H2>
            <Table
              head={["Term", "Meaning"]}
              rows={[
                ["TCP", "Protocol delivering data reliably and in order"],
                ["Congestion control", "The algorithm deciding how fast a TCP connection sends"],
                ["RTT", "Round-trip time: packet out, acknowledgement back"],
                ["cwnd", "Congestion window — unacknowledged data allowed in flight"],
                ["Throughput / goodput", "Useful data delivered per second"],
                ["Socket / fd", "The program’s handle for a connection (e.g. 3)"],
                ["LD_PRELOAD", "Loads a library into a program first, overriding functions"],
                ["setsockopt / getsockopt", "Change / read a socket’s settings"],
                ["TCP_INFO", "getsockopt option returning live TCP statistics"],
                ["eBPF", "Safe small programs running inside the Linux kernel"],
                ["Unix domain socket", "Local-only channel between processes"],
                ["SSE", "Server-Sent Events: a server pushes a live stream to the browser"],
                ["Random Forest", "ML model of many voting decision trees"],
              ]}
            />
          </div>
        </article>
      </div>
    </div>
  );
}
