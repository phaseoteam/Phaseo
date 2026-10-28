import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { workloadIdentityFlag } from "@/lib/flags";

// Trusted workloads are in beta behind a Statsig gate; the gateway checks the same gate.
export default async function TrustedWorkloadsLayout({ children }: { children: ReactNode }) {
	if (!(await workloadIdentityFlag().catch(() => false))) notFound();
	return children;
}
