import type { ReactNode } from "react";

// The Slack agent is behind a Statsig gate until the hosted Slack app exists.
// The gate runs in the route's beforeLoad (notFound when the flag is off).
export default function SlackSettingsLayout({ children }: { children: ReactNode }) {
	return children;
}
