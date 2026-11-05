import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import DisplayPreferencesClient from "@/components/(gateway)/settings/preferences/DisplayPreferencesClient";
import { useSuspenseQuery } from "@tanstack/react-query";
import { preferencesInitialDataQuery } from "./preferences.functions";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";

export async function getPreferencesMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("preferencesCopy.preferences")} - ${t("headers.settings")}` };
}

export default function PreferencesPage() {
	const t = useTranslations("SettingsUI");
	const { data: initialData } = useSuspenseQuery(preferencesInitialDataQuery());

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("preferencesCopy.preferences")}
				description={t("preferencesCopy.preferencesHelp")}
			/>
			{initialData.signedIn ? (
				<DisplayPreferencesClient initialPreferences={initialData.preferences} />
			) : (
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					{t("settingsRouteCopy.notSignedIn")}
				</div>
			)}
		</div>
	);
}
