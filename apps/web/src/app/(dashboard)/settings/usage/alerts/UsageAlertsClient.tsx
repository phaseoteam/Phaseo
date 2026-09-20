"use client";
import { useSearchParams } from "next/navigation";
import { PrivateUsageQuery, usePrivateUsageQuery } from "@/components/(gateway)/usage/PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import { readUsageSearchParams } from "@/lib/query/privateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import type { SettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import DeprecationWarnings from "@/components/(gateway)/usage/DeprecationWarnings/DeprecationWarnings";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
} from "@/lib/gateway/usage/timeRange";

export default function UsageAlertsClient({ scope }: { scope: AccountQueryScope }) {
	const params = useSearchParams();
	const live = parseUsageRangePreset(params.get(getUsageRangeParamKeys().preset)) === "live";
	const query = usePrivateUsageQuery(scope, "alerts", readUsageSearchParams(params), live, (signal) => fetchPrivateUsage<SettingsUsageAlertsInitialData>(`/api/account/settings/usage/alerts?workspaceId=${encodeURIComponent(scope.workspaceId ?? "")}`, scope, signal));
	return <PrivateUsageQuery query={query} scope={scope} live={live}>{(initialData) => <UsageAlertsContent initialData={initialData} />}</PrivateUsageQuery>;
}

function UsageAlertsContent({ initialData }: { initialData: SettingsUsageAlertsInitialData }) {
	const sp = useSearchParams();
	const rangeKeys = getUsageRangeParamKeys();
	const preset = parseUsageRangePreset(sp.get(rangeKeys.preset));
	const customFrom = parseUsageDateInput(sp.get(rangeKeys.from));
	const customTo = parseUsageDateInput(sp.get(rangeKeys.to));

	if (!initialData.workspaceId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Alerts</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						You need to be signed in and have a team selected to view alerts.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
				<SettingsPageHeader
					title="Lifecycle Alerts"
					description="Models you used recently that are deprecated or retired, and what to swap to."
				/>
				<UsageLogsToolbar
					view="logs"
					preset={preset}
					customFrom={customFrom}
					customTo={customTo}
				/>
			</div>

			{initialData.warnings.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>No lifecycle alerts</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							You have no upcoming deprecations or recent retirements for models used by this workspace.
						</p>
					</CardContent>
				</Card>
			) : (
				<DeprecationWarnings warnings={initialData.warnings} showHeader={false} />
			)}
		</div>
	);
}
