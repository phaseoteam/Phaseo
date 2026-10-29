import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { slackAgentSettingsEnabled } from "@/lib/flags";

// The Slack agent is behind a Statsig gate until the hosted Slack app exists.
export default async function SlackSettingsLayout({ children }: { children: ReactNode }) {
	if (!(await slackAgentSettingsEnabled())) notFound();
	return children;
}
