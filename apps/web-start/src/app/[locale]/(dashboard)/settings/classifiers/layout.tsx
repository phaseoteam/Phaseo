import type { ReactNode } from "react";

// Classifiers are in beta behind a Statsig gate; the gateway checks the same gate.
// The gate runs in the route's beforeLoad (notFound when the flag is off).
export default function ClassifiersLayout({ children }: { children: ReactNode }) {
	return children;
}
