/** The algorithms that get their own page in the rail. Plain module so server and client can both read it. */
export const ALGORITHMS = {
  cubic: {
    name: "CUBIC",
    tagline: "Loss-based · Linux default",
    how: "Grows its window along a cubic curve until the bottleneck buffer overflows, backs off by 30 %, and climbs again. The buffer stays mostly full, so everything behind it waits.",
  },
  bbr: {
    name: "BBR",
    tagline: "Model-based · Google",
    how: "Measures the bottleneck bandwidth and the minimum RTT and sends at exactly that rate. It does not need loss as a signal, so the queue stays almost empty.",
  },
  reno: {
    name: "RENO",
    tagline: "Classic AIMD",
    how: "Adds one segment per round trip and halves its window on loss. The queue follows a sawtooth: slowly fills to overflow, then drops by half.",
  },
} as const;
export type Algo = keyof typeof ALGORITHMS;
