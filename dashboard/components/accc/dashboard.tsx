"use client";

import { ArrowRight, CheckCircle2, Play, Radio, XCircle } from "lucide-react";

import { Topbar } from "@/components/app/topbar";
import { Card, Kpi } from "@/components/accc/card";
import { CcChip } from "@/components/accc/cc-chip";
import { TcpPathGraph } from "@/components/accc/tcp-path";
import { Timeline } from "@/components/accc/timeline";
import { Eyebrow } from "@/components/ui/chip";
import { Legend } from "@/components/ui/charts";
import { toast } from "@/components/ui/toast";
import { CC_BLURB, bytes, ccColor } from "@/lib/accc";
import { cn } from "@/lib/cn";
import { useAcccStream } from "@/lib/use-accc-stream";

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 0.01 || v === 0 ? v.toFixed(2) : v.toExponential(1);
}

export function Dashboard() {
  const { state, run } = useAcccStream();
  const { config, points, phases, switches, summary, flow, running, connected, error } = state;
  const last = points[points.length - 1];
  const okSwitches = switches.filter((s) => s.ok);
  const duration = Math.max(9.5, last?.t ?? 0);
  const currentPhase = phases[phases.length - 1]?.phase;

  const start = async () => {
    const ok = await run();
    if (!ok) toast.error("A run is already in progress");
  };

  return (
    <>
      <Topbar
        workspace="ACCC"
        object="Live switching"
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-pos-fg" : "bg-neg-fg")}
            />
            {connected ? "Stream connected" : "Stream offline"}
          </span>
        }
        actions={
          <button
            type="button"
            onClick={start}
            disabled={running || !connected}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2} />
            {running ? "Running…" : summary ? "Run again" : "Run demo"}
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Eyebrow>Adaptive Congestion Control Controller</Eyebrow>
              <h1 className="mt-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
                Mid-flow TCP congestion-control switching
              </h1>
              <p className="mt-1 max-w-[720px] text-[13px] leading-[1.6] text-ink-muted">
                An unmodified app runs with <code className="formula-pill px-1 text-[12px]">LD_PRELOAD=libaccc.so</code>.
                Its socket telemetry flows to the controller, which classifies the traffic and switches the
                live socket&rsquo;s algorithm with <code className="formula-pill px-1 text-[12px]">setsockopt(TCP_CONGESTION)</code>{" "}
                — without dropping the connection.
              </p>
            </div>
            {config && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-ink-muted">Kernel algorithms</span>
                {config.available.map((cc) => (
                  <CcChip key={cc} cc={cc} />
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-card border border-neg-bg bg-neg-bg/40 px-4 py-3 text-[13px] text-neg-fg">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              label="Active algorithm"
              value={flow ? <CcChip cc={flow.cc} large /> : <span className="text-ink-faint">—</span>}
              note={flow ? CC_BLURB[flow.cc] ?? "" : "Waiting for a flow"}
            />
            <Kpi label="Throughput" value={last ? fmt(last.tput) : "—"} unit="Mb/s" note="Goodput, last 500 ms window" />
            <Kpi label="Smoothed RTT" value={last ? fmt(last.rtt) : "—"} unit="ms" note={`Idle fraction ${last ? fmt(last.idle) : "—"}`} />
            <Kpi
              label="Mid-flow switches"
              value={okSwitches.length}
              note={currentPhase ? `App phase: ${currentPhase}` : "No run yet"}
            />
            <Kpi
              label="Connection"
              value={
                summary ? (
                  summary.intact ? (
                    <span className="inline-flex items-center gap-1.5 text-pos-fg">
                      <CheckCircle2 className="h-6 w-6" /> Intact
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-neg-fg">
                      <XCircle className="h-6 w-6" /> Broken
                    </span>
                  )
                ) : flow ? (
                  <span className="inline-flex items-center gap-1.5 text-[22px]">
                    <Radio className="h-5 w-5 text-blue-500" /> Live
                  </span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )
              }
              note={summary ? `${bytes(summary.bytes_received)} of ${bytes(summary.bytes_sent)} delivered` : flow ? `${flow.src} → ${flow.dst}` : "No connection"}
            />
          </div>

          <Card
            title="TCP path — live packet flow"
            note="Sender computer → bottleneck → receiver computer. Segments are coloured by the congestion-control algorithm that sent them, so you can watch the colour change mid-flow when ACCC switches."
            aside={
              config?.mode && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-chip px-1.5 py-[3px] text-[11px] font-semibold",
                    config.mode === "live" ? "bg-pos-bg text-pos-fg" : "bg-chip-sky text-ink",
                  )}
                  title={
                    config.mode === "live"
                      ? "Real socket on this Linux host, driven through the LD_PRELOAD shim"
                      : "Socket and kernel are modelled; the ACCC controller, features and guard are the real code"
                  }
                >
                  {config.mode === "live" ? "Live kernel" : "Simulated path · real controller"}
                </span>
              )
            }
          >
            <TcpPathGraph
              config={config}
              flow={flow}
              last={last}
              phase={currentPhase}
              switches={switches}
              running={running}
              summary={summary}
            />
          </Card>

          <Card
            title="Throughput — coloured by active algorithm"
            note="Shaded bands are the application's behaviour; dashed markers are ACCC's mid-flow switches."
            aside={
              <Legend
                items={[
                  ...(config?.available ?? ["cubic", "bbr", "reno"]).map((cc) => ({ label: cc.toUpperCase(), color: ccColor(cc) })),
                  { label: "Bulk phase", color: "var(--color-blue-100)" },
                  { label: "Interactive phase", color: "var(--color-violet-200)" },
                ]}
              />
            }
          >
            {points.length ? (
              <Timeline points={points} phases={phases} switches={switches} metric={(p) => p.tput} unit="Mb/s" duration={duration} />
            ) : (
              <Empty running={running} />
            )}
          </Card>

          <Card title="Pipeline" note="Figure 1 of the patent proposal, as implemented">
            <ol className="grid gap-2 sm:grid-cols-5">
              {[
                ["100", "Application", "Unmodified; bulk → interactive → bulk"],
                ["106", "libaccc.so shim", "LD_PRELOAD hooks socket/connect/close"],
                ["102/103", "Telemetry + features", "TCP_INFO @ 50 ms → 14 features"],
                ["104/105", "Classifier + guard", "Probabilities → margin & dwell check"],
                ["107", "setsockopt", "TCP_CONGESTION on the live socket"],
              ].map(([ref, name, desc], i) => (
                <li key={ref} className="relative rounded-control border border-line bg-subtle p-3">
                  <span className="tnum text-[10px] font-semibold tracking-[0.08em] text-ink-faint">REF {ref}</span>
                  <p className="mt-1 text-[13px] font-medium text-ink">{name}</p>
                  <p className="mt-0.5 text-[11px] leading-[1.5] text-ink-muted">{desc}</p>
                  {i < 4 && <ArrowRight className="absolute top-1/2 -right-2.5 hidden h-4 w-4 -translate-y-1/2 text-ink-faint sm:block" />}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Empty({ running }: { running: boolean }) {
  return (
    <div className="grid h-[180px] place-items-center rounded-control border border-dashed border-line-strong text-[13px] text-ink-faint">
      {running ? "Waiting for the first telemetry window…" : "Press Run demo to start a live TCP flow."}
    </div>
  );
}
