import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountMFAClient from "@/components/(gateway)/settings/account/AccountMFAClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsAccountMfaInitialData } from "@/lib/fetchers/internal/fetchSettingsAccountMfaInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.mfa")} - ${t("headers.settings")}` };
}

export default function AccountMFAPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="MFA"
				titleKey="headers.mfa"
				description="Manage two-factor authentication for your user."
				descriptionKey="headers.mfaDescription"
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountMFAContent />
			</Suspense>
		</div>
	);
}

async function AccountMFAContent() {
	const t = await getTranslations("SettingsUI.settingsRouteCopy");
	const initialData = await fetchSettingsAccountMfaInitialData();

	if (!initialData.signedIn) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("notSignedIn")}
			</div>
		);
	}

	return (
		<AccountMFAClient
			hasPassword={initialData.hasPassword}
			mfaEnabled={initialData.mfaEnabled}
			mfaFactorId={initialData.mfaFactorId}
		/>
	);
}
