import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import DisplayPreferencesClient from "@/components/(gateway)/settings/preferences/DisplayPreferencesClient";
import { fetchSettingsPreferencesInitialData } from "@/lib/fetchers/internal/fetchSettingsPreferencesInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("preferencesCopy.preferences")} - ${t("headers.settings")}` };
}

export default async function PreferencesPage() {
	const t = await getTranslations("SettingsUI");
	const initialData = await fetchSettingsPreferencesInitialData();

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
