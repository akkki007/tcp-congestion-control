import { ccColor } from "@/lib/accc";
import { cn } from "@/lib/cn";

/** An algorithm name with its series colour swatch, in magpie's chip shape. */
export function CcChip({ cc, className, large }: { cc: string; className?: string; large?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border border-line bg-surface font-semibold text-ink",
        large ? "px-2 py-1 text-[13px]" : "px-1.5 py-[3px] text-[11px] leading-none",
        className,
      )}
    >
      <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: ccColor(cc) }} />
      {cc.toUpperCase()}
    </span>
  );
}
