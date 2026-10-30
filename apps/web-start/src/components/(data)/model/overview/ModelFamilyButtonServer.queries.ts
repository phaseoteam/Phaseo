import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendFamily } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/** `fetchFrontendFamily(familyId)`; fetch errors resolve to null (the button then renders nothing). */
export const modelFamilyButtonQuery = (familyId: string) =>
	queryOptions({
		queryKey: ["phaseo-web", "catalogue-model", "family-button", familyId] as const,
		queryFn: () => fetchFrontendFamily(familyId).catch(() => null),
	});
