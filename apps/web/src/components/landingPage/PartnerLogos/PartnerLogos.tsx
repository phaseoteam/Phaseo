import PartnerLogosClient from "./PartnerLogosClient";
import { getProviderLogos } from "./providerLogos";
import { useSuspenseQuery } from "@tanstack/react-query";
import { landingApiProvidersQuery } from "@/components/landingPage/landing.queries";

export default function PartnerLogos() {
	const { data: providers } = useSuspenseQuery(landingApiProvidersQuery());
	const providerLogos = getProviderLogos(
		providers.map((provider) => provider.api_provider_id)
	);

	if (providerLogos.length === 0) return null;

	return <PartnerLogosClient logos={providerLogos} />;
}
