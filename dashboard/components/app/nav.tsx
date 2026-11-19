import { Gauge, Network, Spline, TrendingUpDown } from "lucide-react";

/** The sections, once, for both navigations: the core architecture, then one page per algorithm. */
export const SECTIONS = [
  { icon: Network, label: "Core", href: "/live" },
  { icon: Spline, label: "CUBIC", href: "/algorithm/cubic", cc: "cubic" },
  { icon: Gauge, label: "BBR", href: "/algorithm/bbr", cc: "bbr" },
  { icon: TrendingUpDown, label: "RENO", href: "/algorithm/reno", cc: "reno" },
] as const satisfies readonly { icon: typeof Network; label: string; href: string; cc?: string }[];

export type SectionLabel = (typeof SECTIONS)[number]["label"];
