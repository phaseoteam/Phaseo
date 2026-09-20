import type { Metadata } from "next";
import { Suspense } from "react";
import { permanentRedirect } from "next/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import type { ObservabilityTab } from "@/components/(gateway)/usage/observability/types";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import ObservabilityClient from "./ObservabilityClient";

export const metadata: Metadata = { title: "Observability - Settings" };

export default async function Page({ searchParams }: { searchParams: Promise<UsageSearchParams> }) {
	const params = usageSearchParams(await searchParams);
	const tab = (params.get("tab") ?? "").toLowerCase();
	const target = `/settings/usage/${["trends", "explore", "guardrails"].includes(tab) ? tab : "overview"}`;
	params.delete("tab");
	permanentRedirect(params.size ? `${target}?${params}` : target);
}

export function ObservabilityPageContent({ initialTab }: { searchParams: Promise<UsageSearchParams>; initialTab: ObservabilityTab }) {
	return <Suspense fallback={<SettingsSectionFallback />}><ObservabilityContent initialTab={initialTab} /></Suspense>;
}

async function ObservabilityContent({ initialTab }: { initialTab: ObservabilityTab }) {
	const scope = await getPrivateUsageScope();
	return <ObservabilityClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} initialTab={initialTab} />;
}
