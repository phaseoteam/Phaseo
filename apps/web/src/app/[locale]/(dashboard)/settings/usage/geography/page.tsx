import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { GeographyUsage } from "@/components/(gateway)/usage/GeographyUsage";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import { fetchSettingsGeography } from "@/lib/fetchers/internal/fetchSettingsGeography";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolveUsageTimeRange,
} from "@/lib/gateway/usage/timeRange";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("geography") };
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value[0];
	return undefined;
}

export default async function UsageGeographyPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const params = await searchParams;
	const rangeKeys = getUsageRangeParamKeys();
	const preset = parseUsageRangePreset(firstParam(params[rangeKeys.preset]));
	const customFrom = parseUsageDateInput(firstParam(params[rangeKeys.from]));
	const customTo = parseUsageDateInput(firstParam(params[rangeKeys.to]));
	const timeRange = resolveUsageTimeRange({ preset, customFrom, customTo });
	const result = await fetchSettingsGeography({
		...params,
		[rangeKeys.preset]: "custom",
		[rangeKeys.from]: timeRange.from,
		[rangeKeys.to]: timeRange.to,
	});
	if (!result?.signedIn) redirect("/sign-in");

	const rows = (result.data ?? []).map((row) => ({
		countryCode: row.country_code,
		requests: Number(row.requests ?? 0),
		tokens: Number(row.tokens ?? 0),
		spendNanos: Number(row.spend_nanos ?? 0),
		successes: Number(row.successes ?? 0),
		averageLatencyMs: row.average_latency_ms == null ? null : Number(row.average_latency_ms),
	}));

	return (
		<section className="space-y-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<SettingsPageHeader
						title="Geography"
						titleKey="headers.geography"
					description="See where workspace requests originate without storing raw IP addresses."
					descriptionKey="headers.geographyDescription"
				/>
				<UsageLogsToolbar
					view="logs"
					preset={preset}
					customFrom={customFrom}
					customTo={customTo}
					showRefresh={false}
					showLivePreset={false}
				/>
			</div>
			<GeographyUsage rows={rows} />
		</section>
	);
}
