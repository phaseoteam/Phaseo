import { createFileRoute } from "@tanstack/react-router";
import { notFound } from "@/lib/navigation";
import { settingsFlagQuery } from "@/features/settings/settings.functions";

// The Slack agent is behind a Statsig gate until the hosted Slack app exists.
export const Route = createFileRoute("/{-$locale}/_dashboard/settings/slack")({
	beforeLoad: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(settingsFlagQuery("slackAgent")))) notFound();
	},
});
