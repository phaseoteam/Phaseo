import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountMFAClient from "@/components/(gateway)/settings/account/AccountMFAClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsAccountMfaInitialData } from "@/lib/fetchers/internal/fetchSettingsAccountMfaInitialData";

export const metadata = {
	title: "MFA - Settings",
};

export default function AccountMFAPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="MFA"
				description="Manage two-factor authentication for your user."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountMFAContent />
			</Suspense>
		</div>
	);
}

async function AccountMFAContent() {
	const initialData = await fetchSettingsAccountMfaInitialData();

	if (!initialData.signedIn) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	return (
		<AccountMFAClient
			mfaEnabled={initialData.mfaEnabled}
			mfaFactorId={initialData.mfaFactorId}
		/>
	);
}

