/** Types and helpers for the ACCC event stream (demo/server.py). Mirrors accc/features.py. */

export const FEATURE_NAMES = [
  "rtt_mean_ms",
  "rtt_std_ms",
  "min_rtt_ms",
  "rttvar_mean_ms",
  "rtt_inflation",
  "loss_ratio",
  "cwnd_mean",
  "cwnd_slope",
  "tput_mbps",
  "tput_trend",
  "burst_cv",
  "idle_frac",
  "app_limited_frac",
  "log_flow_bytes",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export type Config = {
  available: string[];
  interactive_cc: string;
  margin: number;
  dwell_ms: number;
  interval_ms: number;
  window: number;
};

export type Point = {
  t: number;
  cc: string;
  tput: number;
  rtt: number;
  idle: number;
  cwnd: number;
  proba: Record<string, number>;
  switch: boolean;
  target: string;
  reason: string;
  features: Record<FeatureName, number>;
};

export type SwitchEvent = { t: number; from: string; to: string; ok: boolean };
export type Phase = { t: number; phase: string };
export type Summary = {
  bytes_sent: number;
  bytes_received: number;
  intact: boolean;
  final_cc: string;
  switches: number;
  duration_s: number;
};
export type Flow = { fd: number; src: string; dst: string; cc: string; t: number };

/** One colour per algorithm, from the magpie viz ramp, stable across the page. */
export const CC_COLORS: Record<string, string> = {
  cubic: "var(--color-viz-1)",
  bbr: "var(--color-viz-2)",
  reno: "var(--color-viz-4)",
  vegas: "var(--color-viz-6)",
};
export const ccColor = (cc: string) => CC_COLORS[cc] ?? "var(--color-ink-faint)";

export const CC_BLURB: Record<string, string> = {
  cubic: "Linux default · high-bandwidth wired links",
  bbr: "Model-based · bulk transfer, lossy paths",
  reno: "Classic AIMD · light, interactive flows",
  vegas: "Delay-based · short interactive flows",
};

export function bytes(n: number) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
