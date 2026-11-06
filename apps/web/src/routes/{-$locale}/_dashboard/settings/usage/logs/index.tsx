import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@/i18n/navigation";
import { usageLogsRedirectHref } from "@/features/settings/usage/logs/UsageLogsContent";
import type { UsageSearchParams } from "@/lib/query/privateUsage";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/")({
	beforeLoad: ({ params, search }) => {
		redirect({ href: usageLogsRedirectHref(search as UsageSearchParams), locale: params.locale ?? "en-GB" });
	},
});
