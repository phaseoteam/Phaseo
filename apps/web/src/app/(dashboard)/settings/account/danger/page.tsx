import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountDangerZoneClient from "@/components/(gateway)/settings/account/AccountDangerZoneClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsAccountDangerInitialData } from "@/lib/fetchers/internal/fetchSettingsAccountDangerInitialData";

export const metadata = {
	title: "Danger Zone - Settings",
};

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
	const initialData = await fetchSettingsAccountDangerInitialData();

	if (!initialData.signedIn) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	return <AccountDangerZoneClient />;
}

