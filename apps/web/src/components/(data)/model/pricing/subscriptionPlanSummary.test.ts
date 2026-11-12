import { it, expect } from "vitest";
import { toSubscriptionPlanSummaries } from "./subscriptionPlanSummary";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";

it("keeps the fields the subscriptions section shows and drops each plan's model list", () => {
	const plan = {
		plan_id: "lab-pro",
		plan_uuid: "uuid",
		name: "Pro",
		organisation_id: "lab",
		description: "Plan description",
		link: "https://example.com",
		other_info: null,
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		organisation: { organisation_id: "lab", name: "Lab", colour: "#000000" },
		prices: [{ frequency: "monthly", currency: "USD", price: 20 }],
		model_info: { model_info: null, rate_limit: null, other_info: null },
		models: Array.from({ length: 200 }, (_, index) => ({ model_id: `lab/model-${index}` })),
	} as SubscriptionPlan;
	expect(toSubscriptionPlanSummaries([plan])).toEqual([{
		plan_id: "lab-pro",
		name: "Pro",
		organisation_id: "lab",
		organisation: { organisation_id: "lab", name: "Lab", colour: "#000000" },
		prices: [{ frequency: "monthly", currency: "USD", price: 20 }],
	}]);
});
