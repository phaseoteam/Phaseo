import PresetEditorContent from "../PresetEditorContent";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getTranslations } from "next-intl/server";
import { fetchPresetModels } from "../presetModels";
export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("headers.editPreset") + " - " + t("headers.settings") }; }
export default async function Page({ params }: { params: Promise<{ presetSlug: string }> }) {
	const [{ presetSlug }, models, providers] = await Promise.all([params, fetchPresetModels(), fetchFrontendAPIProviders()]);
	return <PresetEditorContent presetSlug={presetSlug} models={models} providers={providers} />;
}
