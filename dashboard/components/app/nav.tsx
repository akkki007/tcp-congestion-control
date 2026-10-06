import { Activity, BookOpen, Brain, Network, Settings2 } from "lucide-react";

/**
 * The sections, once, for both navigations.
 *
 * `href` marks a section that actually exists. The rest are planned phases and are inert on
 * purpose — a nav item that looks live and does nothing is worse than one that is visibly
 * not built yet.
 */
export const SECTIONS = [
  { icon: Activity, label: "Live", href: "/" },
  { icon: Network, label: "Flows" },
  { icon: Brain, label: "Model" },
  { icon: Settings2, label: "Guard" },
  { icon: BookOpen, label: "Docs" },
] as const satisfies readonly { icon: typeof Activity; label: string; href?: string }[];

export type SectionLabel = (typeof SECTIONS)[number]["label"];
