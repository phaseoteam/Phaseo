import PresetEditorContent from "../PresetEditorContent";
import { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
export const metadata = { title: "Edit Preset - Settings" };
export default async function Page({ params }: { params: Promise<{ presetSlug: string }> }) {
	const [{ presetSlug }, models, providers] = await Promise.all([params, fetchFrontendModels(), fetchFrontendAPIProviders()]);
	return <PresetEditorContent presetSlug={presetSlug} models={models} providers={providers} />;
}
