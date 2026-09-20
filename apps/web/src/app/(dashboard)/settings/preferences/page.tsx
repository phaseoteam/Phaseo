import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import DisplayPreferencesClient from "@/components/(gateway)/settings/preferences/DisplayPreferencesClient";
import { fetchSettingsPreferencesInitialData } from "@/lib/fetchers/internal/fetchSettingsPreferencesInitialData";

export const metadata = {
	title: "Preferences - Settings",
};

export default async function PreferencesPage() {
	const initialData = await fetchSettingsPreferencesInitialData();

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Preferences"
				description="Choose how dates, times, numbers, and themes appear across Phaseo."
			/>
			{initialData.signedIn ? (
				<DisplayPreferencesClient initialPreferences={initialData.preferences} />
			) : (
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					Not signed in.
				</div>
			)}
		</div>
	);
}
