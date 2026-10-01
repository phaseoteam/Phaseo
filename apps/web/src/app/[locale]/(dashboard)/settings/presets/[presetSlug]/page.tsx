import PresetEditorContent from "../PresetEditorContent";
import { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("headers.editPreset") + " - " + t("headers.settings") }; }
export default async function Page({ params }: { params: Promise<{ presetSlug: string }> }) {
	const [{ presetSlug }, models, providers] = await Promise.all([params, fetchFrontendModels(), fetchFrontendAPIProviders()]);
	return <PresetEditorContent presetSlug={presetSlug} models={models} providers={providers} />;
}
