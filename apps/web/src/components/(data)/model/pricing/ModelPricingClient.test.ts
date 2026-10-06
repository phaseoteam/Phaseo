import {
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
