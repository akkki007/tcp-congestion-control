import Link from "next/link";

import { SECTIONS, type SectionLabel } from "@/components/app/nav";
import { Mark, Orb } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

/**
 * The 68px icon rail (from magpie).
 *
 * It sits on the page background rather than inside the white canvas — that is
 * what makes the canvas read as a document floating on a desk. The active item
 * is a white tile, not a coloured one: elevation carries state and colour
 * carries information.
 */
export function Rail({ active = "Live" }: { active?: SectionLabel }) {
  return (
    <nav
      aria-label="Sections"
      className="hidden w-[68px] shrink-0 flex-col items-center gap-1 py-4 sm:flex"
    >
      <Link href="/" aria-label="ACCC home" className="mb-4">
        <Mark className="h-6 w-6" />
      </Link>

      {SECTIONS.map((section) => {
        const { icon: Icon, label } = section;
        const href = "href" in section ? section.href : undefined;
        const isActive = label === active;
        const className = cn(
          "grid h-9 w-9 place-items-center rounded-control transition-colors",
          isActive
            ? "bg-surface text-ink shadow-e1"
            : "text-ink-faint hover:bg-hover hover:text-ink-muted",
        );
        const icon = <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />;

        return href ? (
          <Link
            key={label}
            href={href}
            aria-label={label}
            title={label}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {icon}
          </Link>
        ) : (
          <button key={label} type="button" aria-label={label} title={`${label} (planned)`} className={className}>
            {icon}
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-3">
        <span title="ML controller" className="grid h-8 w-8 place-items-center rounded-full">
          <Orb className="h-7 w-7" />
        </span>
      </div>
    </nav>
  );
}
