"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invalidateAccountQueries } from "@/lib/query/invalidation";
import { fetchProviderCatalogAction, updateProviderCatalogAction } from "@/app/(dashboard)/settings/account/providers/actions";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import ProviderWebhookSettings from "./ProviderWebhookSettings";

export default function ProviderIntegrationSummary({ source, canManage }: { source: SettingsProviderOnboardingInitialData["syncSources"][number]; canManage: boolean }) {
	const t = useTranslations("SettingsUI.providerDashboard");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);
	const date = (value: string | null) => value ? new Date(value).toLocaleString(locale) : t("never");
	let endpoint = t("manual");
	try { if (source.catalog_url) { const url = new URL(source.catalog_url); endpoint = `${url.origin}${url.pathname}`; } } catch { endpoint = t("invalidUrl"); }
	async function refresh() {
		setRefreshing(true);
		try {
			const catalog = await fetchProviderCatalogAction(source.provider_slug);
			const result = await updateProviderCatalogAction(source.provider_slug, { refresh: true }, catalog.source.catalog_version);
			if (!result.ok) throw new Error(t("refreshFailed"));
			await invalidateAccountQueries(queryClient);
			toast.success(t("refreshed"));
		} catch { toast.error(t("refreshFailed")); }
		finally { setRefreshing(false); }
	}
	return <section className="space-y-5 rounded-xl border p-5">
		<div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{source.provider_slug}</h2><Button variant="outline" size="sm" disabled={!canManage || refreshing} onClick={() => void refresh()}>{t("refreshNow")}</Button></div>
		<dl className="grid gap-4 text-sm sm:grid-cols-2">
			<div><dt className="text-muted-foreground">{t("feedUrl")}</dt><dd className="mt-1 break-all font-mono text-xs">{endpoint}</dd></div>
			<div><dt className="text-muted-foreground">{t("syncStatus")}</dt><dd className="mt-1">{t(source.last_error ? "needsAttention" : "healthy")}</dd></div>
			<div><dt className="text-muted-foreground">{t("lastSuccess")}</dt><dd className="mt-1">{date(source.last_success_at)}</dd></div>
			<div><dt className="text-muted-foreground">{t("nextSync")}</dt><dd className="mt-1">{date(source.next_poll_at)}</dd></div>
		</dl>
		{source.last_error ? <p role="alert" className="text-sm text-destructive">{t("syncFailed")}</p> : null}
		<details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">{t("webhook")}</summary><div className="pt-4">{canManage ? <ProviderWebhookSettings providerSlug={source.provider_slug} webhookUrl={source.webhookUrl} configured={source.webhookConfigured} /> : <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>}</div></details>
	</section>;
}
