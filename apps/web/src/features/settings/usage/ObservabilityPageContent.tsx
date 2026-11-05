import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import type { ObservabilityTab } from "@/components/(gateway)/usage/observability/types";
import { privateUsageScopeQuery } from "./usage.functions";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import ObservabilityClient from "./ObservabilityClient";
export { usageRedirectHref } from "./usageRedirects";


export function ObservabilityPageContent({ initialTab }: { initialTab: ObservabilityTab }) {
	return <Suspense fallback={<SettingsSectionFallback />}><ObservabilityContent initialTab={initialTab} /></Suspense>;
}

function ObservabilityContent({ initialTab }: { initialTab: ObservabilityTab }) {
	const { data: scope } = useSuspenseQuery(privateUsageScopeQuery());
	return <ObservabilityClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} initialTab={initialTab} />;
}
