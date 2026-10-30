"use client";
import { Suspense } from "react";
import { useLocale } from "next-intl";
import { getSettingsMessages } from "@/i18n/settings";
import type { PublicLocale } from "@/i18n/routing";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountSettingsClient from "@/components/(gateway)/settings/account/AccountSettingsClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsAccountDetailsInitialData } from "@/lib/fetchers/internal/settingsTypes";


export default function AccountDetailsPage() {
	const messages = getSettingsMessages(useLocale() as PublicLocale);
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={messages.pages.account}
				description={messages.pages.accountDescription}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountDetailsContent />
			</Suspense>
		</div>
	);
}

const AccountDetailsContent = withSettingsResource("account-details", function AccountDetailsContent({ initialData }: { initialData: SettingsAccountDetailsInitialData }) {
	const messages = getSettingsMessages(useLocale() as PublicLocale);

	if (!initialData.user) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{messages.pages.notSignedIn}
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
}, false);
