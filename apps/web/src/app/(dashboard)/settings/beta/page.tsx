import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import BetaSettingsClient from "@/components/(gateway)/settings/beta/BetaSettingsClient";
import { fetchSettingsBetaInitialData } from "@/lib/fetchers/internal/fetchSettingsBetaInitialData";

export default async function BetaSettingsPage() {
	const initialData = await fetchSettingsBetaInitialData();
	const features = initialData.features ?? [];

	if (!initialData.signedIn) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Beta"
					description="Current rollout-stage features available to your account."
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
				description="Current rollout-stage features available to your account."
				meta={<Badge variant="outline">Beta</Badge>}
			/>
			{features.length === 0 ? (
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					There are currently no rollout-stage features available to your account.
				</div>
			) : (
				<BetaSettingsClient features={features} />
			)}
		</div>
	);
}
