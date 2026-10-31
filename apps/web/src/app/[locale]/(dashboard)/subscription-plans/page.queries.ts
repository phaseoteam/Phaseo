import { queryOptions } from "@tanstack/react-query";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { fetchFrontendSubscriptionPlans } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const subscriptionPlansQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "subscription-plans"],
		queryFn: async () => (await fetchFrontendSubscriptionPlans()) as SubscriptionPlanSummary[],
	});
