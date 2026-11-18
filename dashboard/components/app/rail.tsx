import Link from "next/link";

import { SECTIONS, type SectionLabel } from "@/components/app/nav";
import { Mark } from "@/components/ui/logo";
import { ccColor } from "@/lib/accc";
import { cn } from "@/lib/cn";

/**
 * The 68px icon rail (from magpie): the live dashboard, then one entry per
 * congestion-control algorithm, each marked with that algorithm's colour.
 */
export function Rail({ active = "Live" }: { active?: SectionLabel }) {
  return (
    <nav aria-label="Sections" className="hidden w-[68px] shrink-0 flex-col items-center gap-1 py-4 sm:flex">
      <Link href="/" aria-label="ACCC home" className="mb-4">
        <Mark className="h-6 w-6" />
      </Link>

      {SECTIONS.map((section, i) => {
        const { icon: Icon, label, href } = section;
        const cc = "cc" in section ? section.cc : undefined;
        const isActive = label === active;
        return (
          <div key={label} className="flex flex-col items-center">
            {(i === 1 || label === "Docs") && <span className="my-2 h-px w-6 bg-line-strong" aria-hidden />}
            <Link
              href={href}
              aria-label={label}
              title={cc ? `${label} — try it` : label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative grid h-9 w-9 place-items-center rounded-control transition-colors",
                isActive ? "bg-surface text-ink shadow-e1" : "text-ink-faint hover:bg-hover hover:text-ink-muted",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {cc && (
                <span aria-hidden className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-[2px]" style={{ background: ccColor(cc) }} />
              )}
            </Link>
            {cc && <span className={cn("mt-0.5 mb-1 text-[9px] font-semibold tracking-[0.04em]", isActive ? "text-ink" : "text-ink-faint")}>{label}</span>}
          </div>
        );
      })}
    </nav>
  );
}
