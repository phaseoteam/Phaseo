import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountDangerZoneClient from "@/components/(gateway)/settings/account/AccountDangerZoneClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export default function AccountDangerPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Danger Zone"
				description="Destructive actions for your user."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountDangerContent />
			</Suspense>
		</div>
	);
}

async function AccountDangerContent() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	if (!authUser) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	return <AccountDangerZoneClient />;
}

