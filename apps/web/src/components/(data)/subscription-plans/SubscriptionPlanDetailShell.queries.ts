import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/** Raw `fetchFrontendSubscriptionPlan(planId)` (null when missing; other errors propagate). */
export const subscriptionPlanQuery = (planId: string) =>
	queryOptions({
		queryKey: ["phaseo-web", "catalogue-subscription-plan", "detail", planId] as const,
		queryFn: () => fetchFrontendSubscriptionPlan(planId),
	});
