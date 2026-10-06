import { AppShell } from "@/components/app/shell";
import { Dashboard } from "@/components/accc/dashboard";

export default function Page() {
  return (
    <AppShell active="Live">
      <Dashboard />
    </AppShell>
  );
}
