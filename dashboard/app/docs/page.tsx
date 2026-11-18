import type { Metadata } from "next";

import { DocsPage } from "@/components/docs/docs-page";

export const metadata: Metadata = { title: "Docs" };

export default function Page() {
  return <DocsPage />;
}
