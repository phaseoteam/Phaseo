import { useTranslations } from "@/i18n/react";
import { PrivateUsageQuery, usePrivateUsageQuery } from "@/components/(gateway)/usage/PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import type { SettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/settingsTypes";

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
			<div className="min-w-0 w-full max-w-4xl space-y-8">
				<SettingsPageHeader title={t("strings.Alerts" as never)} />
				<section className="border-y py-5">
					<p className="text-sm text-muted-foreground">
						{t("strings.phraseYouNeedToBeSignedInAndHaveATeamSelectedToViewAlerts" as never)}
					</p>
				</section>
			</div>
		);
	}

	return (
		<div className="min-w-0 w-full max-w-4xl space-y-8">
			<SettingsPageHeader
				title={t("headers.lifecycleAlerts")}
				description={t("headers.lifecycleAlertsDescription")}
			/>

			{initialData.warnings.length === 0 ? (
				<section className="space-y-2 border-y py-5">
						<h2 className="text-base font-semibold">{t("strings.No lifecycle alerts" as never)}</h2>
						<p className="text-sm text-muted-foreground">
							{t("strings.phraseYouHaveNoUpcomingDeprecationsOrRecentRetirementsForModelsUsedByThisWorkspace" as never)}
						</p>
				</section>
			) : (
				<DeprecationWarnings warnings={initialData.warnings} showHeader={false} />
			)}
		</div>
	);
}
