import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

/** Top bar shared by the landing page and the docs page. Anchors resolve against the landing page. */
export function SiteHeader({ current }: { current?: "docs" }) {
  const anchors: [string, string][] = [
    ["/#problem", "Problem"],
    ["/#how", "How it works"],
    ["/#architecture", "Architecture"],
    ["/#algorithms", "Algorithms"],
    ["/#status", "Status"],
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="ACCC home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-5 text-[13.5px] text-ink-muted md:flex">
          {anchors.map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-ink">
              {label}
            </Link>
          ))}
          <Link href="/docs" aria-current={current === "docs" ? "page" : undefined} className={cn("hover:text-ink", current === "docs" && "font-medium text-ink")}>
            Docs
          </Link>
        </nav>
        <Link href="/live" className="btn-primary ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium">
          Open live demo <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
