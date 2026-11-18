import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AlgoPlayground } from "@/components/accc/algo-path";
import { ALGORITHMS, type Algo } from "@/lib/algorithms";
import { AppShell } from "@/components/app/shell";

export function generateStaticParams() {
  return Object.keys(ALGORITHMS).map((cc) => ({ cc }));
}

export async function generateMetadata({ params }: { params: Promise<{ cc: string }> }): Promise<Metadata> {
  const { cc } = await params;
  return { title: ALGORITHMS[cc as Algo]?.name ?? "Algorithm" };
}

export default async function Page({ params }: { params: Promise<{ cc: string }> }) {
  const { cc } = await params;
  if (!(cc in ALGORITHMS)) notFound();
  const algo = cc as Algo;
  return (
    <AppShell active={ALGORITHMS[algo].name}>
      <AlgoPlayground key={algo} cc={algo} />
    </AppShell>
  );
}
