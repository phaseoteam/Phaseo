"use client";
import { useTranslations } from "@/i18n/react";
import { PrivateUsageQuery, usePrivateUsageQuery } from "@/components/(gateway)/usage/PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import type { SettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import DeprecationWarnings from "@/components/(gateway)/usage/DeprecationWarnings/DeprecationWarnings";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

// Alerts use fixed lifecycle and usage windows on the server, so the page has
// no time range or live mode.
export default function UsageAlertsClient({ scope }: { scope: AccountQueryScope }) {
	const query = usePrivateUsageQuery(scope, "alerts", {}, false, (signal) => fetchPrivateUsage<SettingsUsageAlertsInitialData>(`/api/account/settings/usage/alerts?workspaceId=${encodeURIComponent(scope.workspaceId ?? "")}`, scope, signal));
	return <PrivateUsageQuery query={query} scope={scope} live={false}>{(initialData) => <UsageAlertsContent initialData={initialData} />}</PrivateUsageQuery>;
}

function UsageAlertsContent({ initialData }: { initialData: SettingsUsageAlertsInitialData }) {
	const t = useTranslations("SettingsUI");

	if (!initialData.workspaceId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("strings.Alerts" as never)}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						{t("strings.phraseYouNeedToBeSignedInAndHaveATeamSelectedToViewAlerts" as never)}
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("headers.lifecycleAlerts")}
				description={t("headers.lifecycleAlertsDescription")}
			/>

			{initialData.warnings.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>{t("strings.No lifecycle alerts" as never)}</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							{t("strings.phraseYouHaveNoUpcomingDeprecationsOrRecentRetirementsForModelsUsedByThisWorkspace" as never)}
						</p>
					</CardContent>
				</Card>
			) : (
				<DeprecationWarnings warnings={initialData.warnings} showHeader={false} />
			)}
		</div>
	);
}
