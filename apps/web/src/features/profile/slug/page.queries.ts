import { queryOptions } from "@tanstack/react-query"
import { fetchFrontendPublicProfile } from "@/lib/fetchers/frontend/fetchPublicCatalog"

export const publicProfileQuery = (slug: string) =>
	queryOptions({
		queryKey: ["public-profile", slug],
		queryFn: async () => (await fetchFrontendPublicProfile(slug)) ?? null,
	})
