import { renderToStaticMarkup } from "react-dom/server";
import SubscriptionPlanAllowances from "./SubscriptionPlanAllowances";
import type { SubscriptionAllowance } from "@/lib/fetchers/subscription-plans/types";

jest.mock("next-intl/server", () => ({
	getLocale: async () => "en-GB",
	getTranslations: async () => (key: string) => ({
		"Common.ui.subscriptionCatalog.up_to": "Up to",
		"Common.ui.subscriptionCatalog.approximate": "Approximate",
		"Common.ui.subscriptionCatalog.estimated": "Estimated",
		"Product.tools.pricing.unlimited": "Unlimited",
		"Common.status.unknown": "Unknown",
	}[key] ?? key),
}));

test.each([['up_to', 'Up to 100 requests'], ['approximate', 'Approximate 100 requests'], ['estimated', 'Estimated 100 requests'], ['unlimited', 'Unlimited']])("renders %s allowance qualifiers", async (kind, expected) => {
	const allowance = { allowance_uuid: "test", allowance_key: "Requests", quantity_kind: kind, quantity: 100, unit: "requests", allocation_basis: "unknown", pool_scope: "unknown" } as SubscriptionAllowance;
	expect(renderToStaticMarkup(await SubscriptionPlanAllowances({ allowances: [allowance] }))).toContain(expected);
});

test("preserves source wording and numeric ranges", async () => {
	const allowance = { allowance_uuid: "test", allowance_key: "Agents", quantity_kind: "estimated", quantity: 6, quantity_max: 7, unit: "agents", allocation_basis: "unknown", pool_scope: "unknown" } as SubscriptionAllowance;
	expect(renderToStaticMarkup(await SubscriptionPlanAllowances({ allowances: [allowance] }))).toContain("Estimated 6–7 agents");
	expect(renderToStaticMarkup(await SubscriptionPlanAllowances({ allowances: [{ ...allowance, display_text: "Up to approximately 80 prompts" }] }))).toContain("Up to approximately 80 prompts");
});
