import { queryOptions } from "@tanstack/react-query";
import type { FamilyCard } from "@/lib/fetchers/families/types";
import {
	addFamilyRecencyFallbacks,
	sortFamiliesByRecentAddition,
} from "@/lib/fetchers/families/sortFamilies";
import {
	fetchFrontendFamilies,
	fetchFrontendFamily,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const familiesQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "families", "sorted"],
		queryFn: async () =>
			sortFamiliesByRecentAddition(
				await addFamilyRecencyFallbacks(
					(await fetchFrontendFamilies()) as FamilyCard[],
					fetchFrontendFamily,
				),
			),
	});

export const familyQuery = (familyId: string) =>
	queryOptions({
		queryKey: ["public-catalog", "family", familyId],
		queryFn: () => fetchFrontendFamily(familyId),
	});
