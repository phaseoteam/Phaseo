import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountSettingsClient from "@/components/(gateway)/settings/account/AccountSettingsClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsAccountDetailsInitialData } from "@/lib/fetchers/internal/fetchSettingsAccountDetailsInitialData";

export const metadata = {
	title: "Account Details - Settings",
};

export default function AccountDetailsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Account"
				description="Profile and login settings."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountDetailsContent />
			</Suspense>
		</div>
	);
}

async function AccountDetailsContent() {
	const initialData = await fetchSettingsAccountDetailsInitialData();

	if (!initialData.user) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	return (
		<div
			data-obfuscate-pii={initialData.user.obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<AccountSettingsClient
				user={initialData.user}
				teams={initialData.teams}
				hasPassword={initialData.hasPassword}
			/>
		</div>
	);
}

