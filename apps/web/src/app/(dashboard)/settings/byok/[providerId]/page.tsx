import ByokProviderContent from "./ByokProviderContent";
import { fetchFrontendAPIProviderHeader, fetchFrontendAPIProviderModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
export const metadata = { title: "Provider Keys - BYOK Settings" };
export default async function Page({ params, searchParams }: { params: Promise<{ providerId: string }>; searchParams: Promise<{ sampleKeys?: string }> }) {
	const [{ providerId: encodedId }, { sampleKeys }] = await Promise.all([params, searchParams]);
	const providerId = decodeURIComponent(encodedId);
	const [catalogProvider, providerModels] = await Promise.all([fetchFrontendAPIProviderHeader(providerId), fetchFrontendAPIProviderModels(providerId)]);
	return <ByokProviderContent providerId={providerId} sampleKeys={sampleKeys} catalogProvider={catalogProvider} providerModels={providerModels} />;
}
