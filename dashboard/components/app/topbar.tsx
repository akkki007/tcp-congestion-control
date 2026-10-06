import { Activity } from "lucide-react";

/**
 * The 52px breadcrumb bar (from magpie): where you are on the left, what you
 * can do on the right. The right cluster is a slot so a client control (the run
 * button) can live in a server-rendered bar.
 */
export function Topbar({
  workspace,
  object,
  meta,
  actions,
}: {
  workspace: string;
  object: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
        <Activity className="hidden h-4 w-4 shrink-0 text-ink-muted sm:block" strokeWidth={1.75} aria-hidden />
        <span className="hidden truncate text-[14px] text-ink-2 sm:block">{workspace}</span>
        <span className="hidden text-ink-faint sm:block">/</span>
        <span
          aria-hidden
          className="grid h-5 w-5 shrink-0 place-items-center rounded-chip bg-chip-sky text-[10px] font-semibold text-ink"
        >
          {object.slice(0, 1)}
        </span>
        <span aria-current="page" className="truncate text-[14px] font-medium text-ink">
          {object}
        </span>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {meta && <span className="mr-1 hidden text-[12px] text-ink-faint md:block">{meta}</span>}
        {actions}
      </div>
    </header>
  );
}
