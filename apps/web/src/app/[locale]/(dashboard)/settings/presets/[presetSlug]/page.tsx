import { use } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import PresetEditorContent from "../PresetEditorContent";
import { settingsApiProvidersQuery, settingsPresetModelsQuery } from "../../catalog.queries";
import { getTranslations } from "@/i18n/server";
export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("headers.editPreset") + " - " + t("headers.settings") }; }
export default function Page({ params }: { params: Promise<{ presetSlug: string }> }) {
	const { presetSlug } = use(params);
	const [{ data: models }, { data: providers }] = useSuspenseQueries({ queries: [settingsPresetModelsQuery(), settingsApiProvidersQuery()] });
	return <PresetEditorContent presetSlug={presetSlug} models={models} providers={providers} />;
}
