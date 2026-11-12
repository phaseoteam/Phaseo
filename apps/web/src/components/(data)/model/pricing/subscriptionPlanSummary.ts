import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";

/** The plan fields the model page shows; the API also sends each plan's full model list. */
export type SubscriptionPlanSummary = Pick<SubscriptionPlan, "plan_id" | "name" | "organisation_id" | "organisation" | "prices">;

export function toSubscriptionPlanSummaries(plans: SubscriptionPlan[]): SubscriptionPlanSummary[] {
	return plans.map(({ plan_id, name, organisation_id, organisation, prices }) => ({ plan_id, name, organisation_id, organisation, prices }));
}
