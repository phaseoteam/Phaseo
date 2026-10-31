import { createFileRoute } from "@tanstack/react-router";
import { notFound } from "@/lib/navigation";
import { settingsFlagQuery } from "@/features/settings/settings.functions";

// Trusted workloads are in beta behind a Statsig gate; the gateway checks the same gate.
export const Route = createFileRoute("/{-$locale}/_dashboard/settings/trusted-workloads")({
	beforeLoad: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(settingsFlagQuery("workloadIdentity", { safe: true })))) notFound();
	},
});
