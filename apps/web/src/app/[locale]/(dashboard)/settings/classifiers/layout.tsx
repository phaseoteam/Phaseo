import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requestClassifiersFlag } from "@/lib/flags";

// Classifiers are in beta behind a Statsig gate; the gateway checks the same gate.
export default async function ClassifiersLayout({ children }: { children: ReactNode }) {
	if (!(await requestClassifiersFlag().catch(() => false))) notFound();
	return children;
}
