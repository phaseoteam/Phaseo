import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import BetaSettingsClient from "@/components/(gateway)/settings/beta/BetaSettingsClient";
import { createClient } from "@/utils/supabase/server";
import {
	EMPTY_STATSIG_PROFILE,
	WEB_BETA_FEATURES,
	normalizeBetaFeatures,
} from "@/lib/statsig/shared";

export default async function BetaSettingsPage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
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

	const { data: profileRow } = await supabase
		.from("users")
		.select("beta_opt_in, beta_features")
		.eq("user_id", user.id)
		.maybeSingle();

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Beta"
				description="Preview and experiment controls for the web UI."
				meta={<Badge variant="outline">Beta</Badge>}
			/>
			<BetaSettingsClient
				initialProfile={{
					betaOptIn: Boolean(profileRow?.beta_opt_in),
					betaFeatures: normalizeBetaFeatures(
						profileRow?.beta_features ?? EMPTY_STATSIG_PROFILE.betaFeatures
					),
				}}
				features={WEB_BETA_FEATURES}
			/>
		</div>
	);
}
