import { cn } from "@/lib/cn";

/** Tile surface from magpie's board: hairline border, white, no shadow. */
export function Card({
  title,
  note,
  aside,
  className,
  children,
}: {
  title?: string;
  note?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-4", className)}>
      {(title || aside) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-medium text-ink">{title}</h3>}
            {note && <p className="mt-1 text-[12px] leading-[1.6] text-ink-muted">{note}</p>}
          </div>
          {aside && <div className="sm:ml-auto sm:shrink-0">{aside}</div>}
        </div>
      )}
      <div className={cn(title && "mt-3")}>{children}</div>
    </section>
  );
}

/** KPI tile, after magpie's `Tile` kpi variant. */
export function Kpi({
  label,
  value,
  unit,
  badge,
  note,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  badge?: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-[12px] text-ink-muted">
        {label}
        {badge}
      </p>
      <p className="tnum mt-1.5 text-[28px] leading-none font-semibold text-ink">
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-ink-muted">{unit}</span>}
      </p>
      {note && <p className="mt-2 text-[12px] leading-[1.6] text-ink-muted">{note}</p>}
    </section>
  );
}
