import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import BetaSettingsClient from "@/components/(gateway)/settings/beta/BetaSettingsClient";
import {
	WEB_BETA_FEATURES,
	type WebBetaFeatureDefinition,
} from "@/lib/statsig/shared";
import { fetchSettingsBetaInitialData } from "@/lib/fetchers/internal/fetchSettingsBetaInitialData";

export default async function BetaSettingsPage() {
	const initialData = await fetchSettingsBetaInitialData();
	const betaFeatures: readonly WebBetaFeatureDefinition[] = WEB_BETA_FEATURES.filter(
		(feature) =>
			feature.selfService !== false &&
			(!feature.adminOnly || initialData.isAdmin),
	);

	if (!initialData.signedIn) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Beta"
					description="Preview and experiment controls for the web UI."
					meta={<Badge variant="outline">Beta</Badge>}
				/>
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					Not signed in.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Beta"
				description="Preview and experiment controls for the web UI."
				meta={<Badge variant="outline">Beta</Badge>}
			/>
			{betaFeatures.length === 0 ? (
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					There are currently no web beta features to opt into.
				</div>
			) : (
				<BetaSettingsClient
					initialProfile={initialData.profile}
					features={betaFeatures}
				/>
			)}
		</div>
	);
}
