import type { Metadata } from "next";

import { AppShell } from "@/components/app/shell";
import { Dashboard } from "@/components/accc/dashboard";

export const metadata: Metadata = { title: "Live switching" };

export default function Page() {
  return (
    <AppShell active="Live">
      <Dashboard />
    </AppShell>
  );
}
