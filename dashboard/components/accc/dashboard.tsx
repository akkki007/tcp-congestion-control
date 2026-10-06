"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Play, Radio, ShieldCheck, XCircle } from "lucide-react";

import { Topbar } from "@/components/app/topbar";
import { Card, Kpi } from "@/components/accc/card";
import { CcChip } from "@/components/accc/cc-chip";
import { ProbaBars } from "@/components/accc/proba";
import { Timeline } from "@/components/accc/timeline";
import { Eyebrow } from "@/components/ui/chip";
import { Legend } from "@/components/ui/charts";
import { toast } from "@/components/ui/toast";
import { CC_BLURB, FEATURE_NAMES, bytes, ccColor } from "@/lib/accc";
import { cn } from "@/lib/cn";
import { useAcccStream } from "@/lib/use-accc-stream";

const FEATURE_LABEL: Record<string, [string, string]> = {
  rtt_mean_ms: ["RTT mean", "ms"],
  rtt_std_ms: ["RTT std-dev", "ms"],
  min_rtt_ms: ["Min RTT", "ms"],
  rttvar_mean_ms: ["RTT variance", "ms"],
  rtt_inflation: ["RTT inflation", "×"],
  loss_ratio: ["Loss ratio", ""],
  cwnd_mean: ["cwnd", "seg"],
  cwnd_slope: ["cwnd slope", "/s"],
  tput_mbps: ["Throughput", "Mb/s"],
  tput_trend: ["Throughput trend", "/s"],
  burst_cv: ["Burstiness (CV)", ""],
  idle_frac: ["Idle fraction", ""],
  app_limited_frac: ["App-limited", ""],
  log_flow_bytes: ["log₁₀ flow bytes", ""],
};

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
  const lastSwitchT = okSwitches[okSwitches.length - 1]?.t ?? flow?.t ?? 0;
  const [now, setNow] = useState(0);
  useEffect(() => setNow(last?.t ?? 0), [last?.t]);
  const dwellMs = config?.dwell_ms ?? 200;
  const dwellProgress = Math.min(1, ((now - lastSwitchT) * 1000) / dwellMs);
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

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Classifier output" note="Probability per algorithm for the latest window">
              {last ? (
                <ProbaBars proba={last.proba} active={last.cc} margin={config?.margin ?? 0.15} />
              ) : (
                <p className="text-[13px] text-ink-faint">No decisions yet.</p>
              )}
            </Card>

            <Card
              title="Stability guard"
              note="Switch only if confident AND the current algorithm has dwelt long enough"
              aside={<ShieldCheck className="h-4 w-4 text-violet-500" strokeWidth={1.75} />}
            >
              <dl className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-control bg-subtle p-3">
                  <dt className="text-ink-muted">Confidence margin</dt>
                  <dd className="tnum mt-1 text-[18px] font-semibold text-ink">{config?.margin ?? 0.15}</dd>
                </div>
                <div className="rounded-control bg-subtle p-3">
                  <dt className="text-ink-muted">Minimum dwell</dt>
                  <dd className="tnum mt-1 text-[18px] font-semibold text-ink">{dwellMs} ms</dd>
                </div>
              </dl>
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>Dwell since last switch</span>
                  <span className="tnum">{flow ? `${Math.round((now - lastSwitchT) * 1000)} ms` : "—"}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", dwellProgress >= 1 ? "bg-pos-fg" : "bg-blue-400")}
                    style={{ width: `${(flow ? dwellProgress : 0) * 100}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 rounded-control border border-line px-3 py-2 text-[12px]">
                <span className="text-ink-muted">Last verdict: </span>
                {last ? (
                  <span className={cn("font-medium", last.switch ? "text-violet-700" : "text-ink-2")}>
                    {last.switch ? `switch → ${last.target}` : "keep"}{" "}
                    <span className="font-normal text-ink-muted">({last.reason})</span>
                  </span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </div>
            </Card>

            <Card title="Switch log" note="Every setsockopt(TCP_CONGESTION) executed by the shim">
              {switches.length ? (
                <ol className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                  {switches.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-control px-2 py-1.5 text-[12px] hover:bg-hover">
                      <span className="tnum w-12 text-ink-faint">{s.t.toFixed(2)}s</span>
                      <CcChip cc={s.from} />
                      <ArrowRight className="h-3 w-3 text-ink-faint" />
                      <CcChip cc={s.to} />
                      <span className={cn("ml-auto text-[11px] font-medium", s.ok ? "text-pos-fg" : "text-neg-fg")}>
                        {s.ok ? "applied" : "failed"}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-ink-faint">No switches yet.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Smoothed RTT" note="ms, from TCP_INFO every 50 ms" className="lg:col-span-2">
              {points.length ? (
                <Timeline
                  points={points}
                  phases={phases}
                  switches={switches}
                  metric={(p) => p.rtt}
                  unit="ms"
                  duration={duration}
                  height={160}
                  showPhaseLabels={false}
                />
              ) : (
                <Empty running={running} />
              )}
            </Card>
            <Card title="Feature vector" note={`Sliding window of ${config?.window ?? 10} samples → classifier input`}>
              <table className="w-full text-[12px]">
                <tbody>
                  {FEATURE_NAMES.map((n) => (
                    <tr key={n} className="border-b border-line last:border-0">
                      <td className="py-1 text-ink-muted">{FEATURE_LABEL[n][0]}</td>
                      <td className="py-1 text-right font-medium text-ink">
                        {last ? fmt(last.features[n]) : "—"}
                        <span className="ml-1 text-ink-faint">{FEATURE_LABEL[n][1]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

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
