import {
	getPlanZdrEligibility,
	getProviderPromptTrainingPolicy,
	matchesPrivacyFilter,
	getPriceColumnForSort,
	getProviderServiceTierDisplayName,
	isTerminalRuntimeStatsRetry,
	resolveRuntimeStatsPercentileAfterError,
} from "./ModelPricingClient";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { getProviderTableDiscountBadge } from "./ProviderCard";
import { buildProviderSections, buildProviderTablePriceSummaryForColumn, type ProviderSections } from "./pricingHelpers";

describe("combined input column sorting", () => {
	it("restores the modalities from the URL sort key and resolves their rate", () => {
		const column = getPriceColumnForSort("price:input:text+image+video:Per 1M tokens");
		expect(column).toMatchObject({ direction: "input", modality: "multimodal", groupedModalities: ["text", "image", "video"] });
		const tier = { per1M: 1.5, price: 1.5, label: "All usage", isCurrent: true };
		const triple = { in: [tier], out: [], cached: [], write: [] };
		const sections: ProviderSections = { providerName: "Google", providerId: "google-ai-studio", logoProviderId: "google", textTokens: triple, imageTokens: triple, videoTokens: triple, otherRules: [] };
		expect(buildProviderTablePriceSummaryForColumn(sections, column!).sortValue).toBe(1.5);
	});
});

const discountLabels = {
	discount: "Discount",
	off: "Off",
	upToDiscount: (percent: number) => `Up to ${percent}% off`,
};

// These Node tests exercise exported helpers, not nuqs's ESM browser hooks.
jest.mock("nuqs", () => ({
	parseAsString: {},
	useQueryStates: jest.fn(),
}));

jest.mock("@number-flow/react", () => ({
	__esModule: true,
	default: ({ value }: { value: number }) => String(value),
}));

describe("runtime pricing percentile retries", () => {
	it("keeps the attempted percentile selected through transient failures", () => {
		expect(isTerminalRuntimeStatsRetry(1)).toBe(false);
		expect(isTerminalRuntimeStatsRetry(2)).toBe(false);
		expect(resolveRuntimeStatsPercentileAfterError(90, 50, 1)).toBe(90);
		expect(resolveRuntimeStatsPercentileAfterError(90, 50, 2)).toBe(90);
	});

	it("restores the last successful percentile after retries are exhausted", () => {
		expect(isTerminalRuntimeStatsRetry(3)).toBe(true);
		expect(resolveRuntimeStatsPercentileAfterError(90, 50, 3)).toBe(50);
	});
});

describe("provider service tier display names", () => {
	it("keeps regional offer labels on every generated service tier row", () => {
		const provider = {
			provider: {
				api_provider_id: "openai-eu",
				api_provider_name: "OpenAI",
				offer_label: "EU",
				offer_scope: "regional",
			},
			provider_models: [],
			pricing_rules: [],
		} as ProviderPricing;

		expect(getProviderServiceTierDisplayName(provider)).toBe("OpenAI (EU)");
	});

	it("shows active discounts on generated service tier rows", () => {
		const sections = {
			textTokens: {
				in: [
					{
						basePer1M: 6,
						per1M: 4,
						price: 4,
						discountEndsAt: null,
					},
				],
			},
		} as unknown as ReturnType<typeof buildProviderSections>;

		expect(getProviderTableDiscountBadge(sections, discountLabels)).toBe("33% Off");
	});

	it("shows introductory character SKU discounts in provider rows", () => {
		const sections = {
			mediaInputs: [{ mod: "text", price: 0.022, basePrice: 0.08, discountEndsAt: "2026-10-12T00:00:00.000Z" }],
		} as unknown as ReturnType<typeof buildProviderSections>;

		expect(getProviderTableDiscountBadge(sections, discountLabels)).toBe("73% Off");
	});
});

describe("route retention in pricing table scopes", () => {
	const offer = (policies: ProviderPricing["provider_models"][number]["data_policy"][]): ProviderPricing => ({
		provider: { api_provider_id: "empiriolabs", api_provider_name: "EmpirioLabs AI", zero_data_retention: false },
		provider_models: policies.map((data_policy, index) => ({ id: String(index), api_provider_id: "empiriolabs", model_id: "qwen/qwen3.8-27b", endpoint: "text.generate", is_active_gateway: true, input_modalities: "text", output_modalities: "text", data_policy })),
		pricing_rules: [],
	});
	const native = { tier: "private", confidence: "confirmed", zdrEligibility: "eligible", zeroDataRetention: true };
	it("rejects an expired tier guarantee even with a positive model and provider default", () => {
		const provider = offer([native]); provider.provider.zero_data_retention = true;
		provider.provider.service_tier_data_policies = { standard: { ...native, catalogManaged: true, validUntil: "2000-01-01T00:00:00Z" } };
		expect(getPlanZdrEligibility(provider, "standard")).toBe(false);
	});
	it("uses current scoped training facts before provider defaults and manual fallbacks", () => {
		const provider = offer([{ trainingPolicy: "may_train" }]);
		provider.provider.prompt_training_policy = "no_train";
		expect(getProviderPromptTrainingPolicy(provider, "standard")).toBe("may_train");
		expect(matchesPrivacyFilter(provider, "no_training", null, "standard")).toBe(false);
		expect(matchesPrivacyFilter(provider, "workspace", {
			isAuthenticated: true, privacyEnablePaidMayTrain: false, privacyEnableFreeMayTrain: false,
			privacyZdrOnly: false, providerRestrictionMode: "none", providerRestrictionProviderIds: [],
		}, "standard")).toBe(false);
		provider.provider_models[0].data_policy = { trainingPolicy: "no_train", catalogManaged: true, validUntil: "2000-01-01T00:00:00Z" };
		expect(getProviderPromptTrainingPolicy(provider, "standard")).toBe("unknown");
		provider.provider_models[0].data_policy = { trainingPolicy: "no_train" };
		expect(getProviderPromptTrainingPolicy(provider, "standard")).toBe("no_train");
		provider.provider.service_tier_data_policies = { standard: { trainingPolicy: "may_train" } };
		expect(getProviderPromptTrainingPolicy(provider, "standard")).toBe("may_train");
	});
	it("does not hide a retained or undeclared member of a mixed training scope", () => {
		const provider = offer([{ trainingPolicy: "no_train" }, {}]);
		provider.provider.prompt_training_policy = "may_train";
		expect(getProviderPromptTrainingPolicy(provider, "standard")).toBe("may_train");
	});
	it("uses verified route guarantees for table filters and retention hover", () => {
		expect(getPlanZdrEligibility(offer([native]), "standard")).toBe(true);
		expect(getPlanZdrEligibility(offer([{}]), "standard")).toBe(false);
		expect(getPlanZdrEligibility(offer([{ zdrEligibility: "eligible" }]), "standard")).toBe(false);
	});
	it("retains route guarantees under an eligibility-only tier policy", () => {
        const provider = offer([native]);
        provider.provider.service_tier_data_policies = { standard: { zdrEligibility: "eligible" } };
        expect(getPlanZdrEligibility(provider, "standard")).toBe(true);
        provider.provider.service_tier_data_policies.standard = { zdrEligibility: "ineligible" };
        expect(getPlanZdrEligibility(provider, "standard")).toBe(false);
    });
	it("does not turn a mixed scope into a blanket guarantee", () => {
		expect(getPlanZdrEligibility(offer([native, {}]), "standard")).toBeNull();
	});
});
