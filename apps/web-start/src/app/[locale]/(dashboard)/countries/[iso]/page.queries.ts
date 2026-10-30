import { queryOptions } from "@tanstack/react-query";
import { normaliseIso } from "@/components/(data)/countries/utils";
import { fetchFrontendCountry } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const countryQuery = (isoInput: string) => {
	const iso = normaliseIso(isoInput);
	return queryOptions({
		queryKey: ["public-catalog", "country", iso],
		queryFn: () => fetchFrontendCountry(iso).catch(() => null),
	});
};
