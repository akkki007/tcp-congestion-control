import type { SectionLabel } from "@/components/app/nav";
import { Rail } from "@/components/app/rail";

/**
 * The shell (from magpie): rail on the left, a white document floating on the
 * desk on the right. Full-bleed on a phone, hairline-bordered card from `sm` up.
 */
export function AppShell({
  active,
  children,
}: {
  active?: SectionLabel;
  children: React.ReactNode;
}) {
  return (
    <div data-surface="app" className="flex h-dvh flex-col overflow-hidden bg-app sm:flex-row">
      <Rail active={active} />
      <main className="mr-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-line bg-surface sm:my-2 sm:mr-2 sm:rounded-card sm:border">
        {children}
      </main>
    </div>
  );
}
