// Next: src/app/[locale]/(dashboard)/settings/trusted-workloads/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/trusted-workloads/layout";
import { notFound } from "@/lib/navigation";
import { settingsFlagQuery } from "@/app/[locale]/(dashboard)/settings/settings.functions";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/trusted-workloads")({
	beforeLoad: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(settingsFlagQuery("workloadIdentity", { safe: true })))) notFound();
	},
	component: nextLayoutComponent(Layout),
});
