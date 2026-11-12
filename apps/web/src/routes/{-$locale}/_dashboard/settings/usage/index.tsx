import { createFileRoute } from "@tanstack/react-router";
import { permanentRedirect } from "@/i18n/navigation";
import { usageRedirectHref } from "@/features/settings/usage/ObservabilityPageContent";
import type { UsageSearchParams } from "@/lib/query/privateUsage";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/")({
	beforeLoad: ({ params, search }) => {
		permanentRedirect({ href: usageRedirectHref(search as UsageSearchParams), locale: params.locale ?? "en-GB" });
	},
});
