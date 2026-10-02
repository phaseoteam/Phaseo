import CachedPrivateModelEditor from "@/components/(gateway)/settings/private-models/CachedPrivateModelEditor";
import { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("privateModelsCopy.privateModel")} - ${t("headers.settings")}` };
}
export default async function PrivateModelPage({ params }: { params: Promise<{ privateModelId: string }> }) {
	const { privateModelId } = await params;
	const [models, providers] = await Promise.all([fetchFrontendModels().catch(() => []), fetchFrontendAPIProviders().catch(() => [])]);
	return <CachedPrivateModelEditor privateModelId={privateModelId} catalogModels={models.map((item) => ({ id: item.model_id, name: item.name }))} providers={providers.map((item) => ({ id: item.api_provider_id, name: item.api_provider_name }))} />;
}
