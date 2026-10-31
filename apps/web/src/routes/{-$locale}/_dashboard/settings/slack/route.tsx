// Next: src/app/[locale]/(dashboard)/settings/slack/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/slack/layout";
import { notFound } from "@/lib/navigation";
import { settingsFlagQuery } from "@/app/[locale]/(dashboard)/settings/settings.functions";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/slack")({
	beforeLoad: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(settingsFlagQuery("slackAgent")))) notFound();
	},
	component: nextLayoutComponent(Layout),
});
