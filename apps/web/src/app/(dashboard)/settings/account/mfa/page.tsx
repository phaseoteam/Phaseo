import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountMFAClient from "@/components/(gateway)/settings/account/AccountMFAClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { canManagePasskeys } from "@/lib/auth/passkeyAuthorization";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { fetchSettingsAccountMfaInitialData } from "@/lib/fetchers/internal/fetchSettingsAccountMfaInitialData";
import { passkeysAdminBetaFlag } from "@/lib/flags";

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

	const [isAdmin, rolloutEnabled] = await Promise.all([
		isAdminViewer(),
		passkeysAdminBetaFlag(),
	]);

	return (
		<AccountMFAClient
			mfaEnabled={initialData.mfaEnabled}
			mfaFactorId={initialData.mfaFactorId}
			showPasskeyManagement={canManagePasskeys({ isAdmin, rolloutEnabled })}
		/>
	);
}

