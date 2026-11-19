/** The algorithms that get their own page in the rail. Plain module so server and client can both read it. */
export const ALGORITHMS = {
  cubic: {
    name: "CUBIC",
    tagline: "Loss-based · Linux default",
    how: "Grows its window along a cubic curve until the bottleneck buffer overflows, backs off by 30 %, and climbs again. The buffer stays mostly full, so everything behind it waits.",
    rules: [
      "Slow start: the window doubles every round trip until the first loss.",
      "On loss it remembers the window as Wmax and cuts to 70 %.",
      "It then grows fast back towards Wmax, flattens out near it, and probes above it — a cubic curve in time, independent of RTT.",
    ],
    watch: "the queue at the bottleneck stays full and losses come in regular waves; the window chart is a series of curves, not straight lines.",
  },
  bbr: {
    name: "BBR",
    tagline: "Model-based · Google",
    how: "Measures the bottleneck bandwidth and the minimum RTT and sends at exactly that rate. It does not need loss as a signal, so the queue stays almost empty.",
    rules: [
      "Startup: double the sending rate every round trip until the measured bandwidth stops growing (or the queue overflows).",
      "Drain: pause briefly to empty the queue that startup built.",
      "Probe bandwidth: pace segments at the measured bottleneck rate, keeping about one bandwidth × RTT in flight; briefly send 25 % faster, then 25 % slower, to re-check.",
    ],
    watch: "after startup, segments leave evenly spaced, the bottleneck queue is nearly empty and the window line goes flat.",
  },
  reno: {
    name: "RENO",
    tagline: "Classic AIMD",
    how: "Adds one segment per round trip and halves its window on loss. The queue follows a sawtooth: slowly fills to overflow, then drops by half.",
    rules: [
      "Slow start: the window doubles every round trip until the first loss.",
      "Congestion avoidance: +1 segment per round trip (additive increase).",
      "On 3 duplicate ACKs the lost segment is resent and the window is halved (multiplicative decrease); on a timeout it restarts from 1.",
    ],
    watch: "the window chart is a sawtooth — a slow straight climb, then a cliff to half.",
  },
} as const;
export type Algo = keyof typeof ALGORITHMS;
