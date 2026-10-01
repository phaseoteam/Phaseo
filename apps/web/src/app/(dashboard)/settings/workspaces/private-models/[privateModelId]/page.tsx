import CachedPrivateModelEditor from "@/components/(gateway)/settings/private-models/CachedPrivateModelEditor";
import { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
export const metadata = { title: "Private Model - Settings" };
export default async function PrivateModelPage({ params }: { params: Promise<{ privateModelId: string }> }) {
	const { privateModelId } = await params;
	const [models, providers] = await Promise.all([fetchFrontendModels().catch(() => []), fetchFrontendAPIProviders().catch(() => [])]);
	return <CachedPrivateModelEditor privateModelId={privateModelId} catalogModels={models.map((item) => ({ id: item.model_id, name: item.name }))} providers={providers.map((item) => ({ id: item.api_provider_id, name: item.api_provider_name }))} />;
}
