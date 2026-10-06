import { ccColor } from "@/lib/accc";
import { CcChip } from "@/components/accc/cc-chip";

/**
 * Classifier output for the latest window, one bar per algorithm. The margin the
 * stability guard requires is drawn as a bracket above the active algorithm's
 * probability, so you can see exactly why a switch did or did not happen.
 */
export function ProbaBars({
  proba,
  active,
  margin,
}: {
  proba: Record<string, number>;
  active: string;
  margin: number;
}) {
  const entries = Object.entries(proba).sort((a, b) => b[1] - a[1]);
  const pActive = proba[active] ?? 0;
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([cc, p]) => (
        <div key={cc} className="grid grid-cols-[72px_1fr_44px] items-center gap-3">
          <CcChip cc={cc} />
          <div className="relative h-2.5 rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
              style={{ width: `${p * 100}%`, background: ccColor(cc) }}
            />
            {cc !== active && (
              <div
                title={`switch threshold: active + margin (${margin})`}
                className="absolute -top-1 -bottom-1 w-px bg-ink"
                style={{ left: `${Math.min(1, pActive + margin) * 100}%` }}
              />
            )}
          </div>
          <span className="tnum text-right text-[12px] font-medium text-ink-2">{(p * 100).toFixed(0)}%</span>
        </div>
      ))}
      <p className="text-[11px] leading-[1.5] text-ink-faint">
        Black tick = active algorithm’s probability + margin. A challenger must cross it to trigger a switch.
      </p>
    </div>
  );
}
