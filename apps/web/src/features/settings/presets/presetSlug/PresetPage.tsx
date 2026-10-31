import { useParams } from "@tanstack/react-router";
import { useSuspenseQueries } from "@tanstack/react-query";
import PresetEditorContent from "../PresetEditorContent";
import { settingsApiProvidersQuery, settingsPresetModelsQuery } from "../../catalog.queries";
import { getTranslations } from "@/i18n/server";
export async function getPresetMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("headers.editPreset") + " - " + t("headers.settings") }; }
export default function PresetPage() {
	const { presetSlug } = useParams({ from: "/{-$locale}/_dashboard/settings/presets/$presetSlug/" });
	const [{ data: models }, { data: providers }] = useSuspenseQueries({ queries: [settingsPresetModelsQuery(), settingsApiProvidersQuery()] });
	return <PresetEditorContent presetSlug={presetSlug} models={models} providers={providers} />;
}
