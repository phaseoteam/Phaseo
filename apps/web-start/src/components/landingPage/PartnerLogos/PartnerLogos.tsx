import PartnerLogosClient from "./PartnerLogosClient";
import { getProviderLogos } from "./providerLogos";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default async function PartnerLogos() {
	const providers = await fetchFrontendAPIProviders().catch(() => []);
	const providerLogos = getProviderLogos(
		providers.map((provider) => provider.api_provider_id)
	);

	if (providerLogos.length === 0) return null;

	return <PartnerLogosClient logos={providerLogos} />;
}
