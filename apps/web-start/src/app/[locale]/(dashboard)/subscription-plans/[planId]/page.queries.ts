import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const subscriptionPlanQuery = (planId: string) =>
	queryOptions({
		queryKey: ["public-catalog", "subscription-plan", planId],
		queryFn: () => fetchFrontendSubscriptionPlan(planId),
	});
