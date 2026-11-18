import { Activity, BookOpen, Gauge, Spline, TrendingUpDown } from "lucide-react";

/** The sections, once, for both navigations: the live dashboard, then one page per algorithm. */
export const SECTIONS = [
  { icon: Activity, label: "Live", href: "/live" },
  { icon: Spline, label: "CUBIC", href: "/algorithm/cubic", cc: "cubic" },
  { icon: Gauge, label: "BBR", href: "/algorithm/bbr", cc: "bbr" },
  { icon: TrendingUpDown, label: "RENO", href: "/algorithm/reno", cc: "reno" },
  { icon: BookOpen, label: "Docs", href: "/docs" },
] as const satisfies readonly { icon: typeof Activity; label: string; href: string; cc?: string }[];

export type SectionLabel = (typeof SECTIONS)[number]["label"];
