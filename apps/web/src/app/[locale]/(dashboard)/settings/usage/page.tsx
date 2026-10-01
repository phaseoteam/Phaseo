import type { Metadata } from "next";
import { Suspense } from "react";
import { permanentRedirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import type { ObservabilityTab } from "@/components/(gateway)/usage/observability/types";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import ObservabilityClient from "./ObservabilityClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observability") };
}

export default async function Page({ searchParams }: { searchParams: Promise<UsageSearchParams> }) {
	const params = usageSearchParams(await searchParams);
	const tab = (params.get("tab") ?? "").toLowerCase();
	const target = `/settings/usage/${["trends", "explore", "guardrails"].includes(tab) ? tab : "overview"}`;
	params.delete("tab");
	permanentRedirect({ href: params.size ? `${target}?${params}` : target, locale: await getLocale() });
}

export function ObservabilityPageContent({ initialTab }: { searchParams: Promise<UsageSearchParams>; initialTab: ObservabilityTab }) {
	return <Suspense fallback={<SettingsSectionFallback />}><ObservabilityContent initialTab={initialTab} /></Suspense>;
}

async function ObservabilityContent({ initialTab }: { initialTab: ObservabilityTab }) {
	const scope = await getPrivateUsageScope();
	return <ObservabilityClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} initialTab={initialTab} />;
}
