"use client";

import { useSearchParams } from "next/navigation";
import { PrivateUsageQuery, usePrivateUsageQuery } from "@/components/(gateway)/usage/PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import { WebApiError } from "@/lib/web-api/client";

import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { GeographyUsage } from "@/components/(gateway)/usage/GeographyUsage";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import type { SettingsGeographyData } from "@/lib/fetchers/internal/fetchSettingsGeography";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolveUsageTimeRange,
} from "@/lib/gateway/usage/timeRange";

export default function GeographyClient({ scope }: { scope: AccountQueryScope }) {
	const params = useSearchParams();
	const rangeKeys = getUsageRangeParamKeys();
	const preset = parseUsageRangePreset(params.get(rangeKeys.preset));
	const customFrom = parseUsageDateInput(params.get(rangeKeys.from));
	const customTo = parseUsageDateInput(params.get(rangeKeys.to));
	const query = usePrivateUsageQuery(scope, "geography", { preset, from: customFrom ?? "", to: customTo ?? "" }, preset === "live", async (signal) => {
		const timeRange = resolveUsageTimeRange({ preset, customFrom, customTo });
		const search = new URLSearchParams({ workspaceId: scope.workspaceId!, usage_preset: "custom", usage_from: timeRange.from, usage_to: timeRange.to });
		const path = `/api/account/settings/usage/geography?${search}` as const;
		const result = await fetchPrivateUsage<SettingsGeographyData>(path, scope, signal);
		if (!result.signedIn) throw new WebApiError(path, 401);
		if (result.workspaceId !== scope.workspaceId) throw new WebApiError(path, 403);
		return result;
	});
	return <PrivateUsageQuery query={query} scope={scope} live={preset === "live"}>{(result) => {
	const rows = result.data.map((row) => ({
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
					description="See where workspace requests originate without storing raw IP addresses."
				/>
				<UsageLogsToolbar
					view="logs"
					preset={preset}
					customFrom={customFrom}
					customTo={customTo}
				/>
			</div>
			<GeographyUsage rows={rows} />
		</section>
	);
	}}</PrivateUsageQuery>;
}
