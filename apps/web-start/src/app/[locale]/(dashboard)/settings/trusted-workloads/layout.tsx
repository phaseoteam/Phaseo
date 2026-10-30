import type { ReactNode } from "react";

// Trusted workloads are in beta behind a Statsig gate; the gateway checks the same gate.
// The gate runs in the route's beforeLoad (notFound when the flag is off).
export default function TrustedWorkloadsLayout({ children }: { children: ReactNode }) {
	return children;
}
