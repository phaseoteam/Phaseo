// The workspace's spend summary for the tier cards (Supabase session + web API).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { CreditsTierSummary } from "@/lib/fetchers/internal/fetchCreditsTierSummary";

/** null when the summary could not be loaded (the cards then show empty spend values). */
const loadCreditsTierSummary = createServerFn({ method: "GET" })
	.validator((workspaceId: string) => String(workspaceId))
	.handler(async ({ data: workspaceId }): Promise<CreditsTierSummary | null> => {
		const { fetchCreditsTierSummary } = await import("@/lib/fetchers/internal/fetchCreditsTierSummary");
		try {
			return await fetchCreditsTierSummary(workspaceId);
		} catch {
			return null;
		}
	});

/** Without a workspace there is nothing to fetch (null). */
export const creditsTierSummaryQuery = (workspaceId?: string) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "credits-tier-summary", workspaceId ?? null],
		queryFn: () => (workspaceId ? loadCreditsTierSummary({ data: workspaceId }) : Promise.resolve(null)),
	});
