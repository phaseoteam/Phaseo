import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import DeprecationWarnings from "@/components/(gateway)/usage/DeprecationWarnings/DeprecationWarnings";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import { fetchSettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/fetchSettingsUsageAlertsInitialData";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
} from "@/lib/gateway/usage/timeRange";

export const metadata: Metadata = {
	title: "Lifecycle Alerts - Settings",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value[0];
	return undefined;
}

export default function Page(props: {
	searchParams: Promise<SearchParams>;
}) {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<UsageAlertsContent searchParams={props.searchParams} />
		</Suspense>
	);
}

async function UsageAlertsContent({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const sp = await searchParams;
	const rangeKeys = getUsageRangeParamKeys();
	const preset = parseUsageRangePreset(firstParam(sp[rangeKeys.preset]));
	const customFrom = parseUsageDateInput(firstParam(sp[rangeKeys.from]));
	const customTo = parseUsageDateInput(firstParam(sp[rangeKeys.to]));
	const initialData = await fetchSettingsUsageAlertsInitialData();

	if (!initialData.signedIn) redirect("/sign-in");

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
