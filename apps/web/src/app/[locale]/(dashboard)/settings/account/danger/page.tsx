import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountDangerZoneClient from "@/components/(gateway)/settings/account/AccountDangerZoneClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { accountDangerInitialDataQuery } from "../account.functions";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.dangerZone")} - ${t("headers.settings")}` };
}

export default function AccountDangerPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Danger Zone"
				titleKey="headers.dangerZone"
				description="Destructive actions for your user."
				descriptionKey="headers.dangerZoneDescription"
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountDangerContent />
			</Suspense>
		</div>
	);
}

function AccountDangerContent() {
	const t = useTranslations("SettingsUI.settingsRouteCopy");
	const { data: initialData } = useSuspenseQuery(accountDangerInitialDataQuery());

	if (!initialData.signedIn) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("notSignedIn")}
			</div>
		);
	}

	return <AccountDangerZoneClient />;
}
