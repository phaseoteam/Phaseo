import { matchesProviderCoverage, matchesProviderDatacenter, matchesProviderPolicy, toggleProviderCoverage } from "./providerFilters";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";

function makeProvider(overrides: Partial<APIProviderCard> = {}): APIProviderCard {
	return {
		api_provider_id: "test-provider",
		api_provider_name: "Test Provider",
		country_code: "US",
		default_execution_regions: [],
		default_data_regions: [],
		is_gateway_provider: false,
		byok_available: false,
		prompt_training_policy: null,
		data_policy_tier: null,
		zero_data_retention: false,
		data_retention_days: null,
		privacy_policy_url: null,
		terms_of_service_url: null,
		total_models: 1,
		active_models: 0,
		free_models: 0,
		total_daily_tokens: 0,
		total_monthly_tokens: 0,
		daily_share_pct: 0,
		modality_support: {
			text: { input: 0, output: 0 },
			image: { input: 0, output: 0 },
			video: { input: 0, output: 0 },
			audio: { input: 0, output: 0 },
			moderation: { input: 0, output: 0 },
			embedding: { input: 0, output: 0 },
		},
		...overrides,
	};
}

describe("matchesProviderCoverage", () => {
	it("matches inactive providers without routable models", () => {
		expect(matchesProviderCoverage(makeProvider(), "inactive")).toBe(true);
		expect(matchesProviderCoverage(makeProvider({ is_gateway_provider: true }), "inactive")).toBe(false);
		expect(matchesProviderCoverage(makeProvider({ active_models: 1 }), "inactive")).toBe(false);
	});

	it("preserves the existing active and free coverage filters", () => {
		expect(matchesProviderCoverage(makeProvider({ is_gateway_provider: true }), "active")).toBe(true);
		expect(matchesProviderCoverage(makeProvider({ free_models: 1 }), "free")).toBe(true);
		expect(matchesProviderCoverage(makeProvider(), "active")).toBe(false);
		expect(matchesProviderCoverage(makeProvider(), "free")).toBe(false);
	});
});

describe("toggleProviderCoverage", () => {
	it("replaces the default active filter when inactive is selected", () => {
		expect(toggleProviderCoverage(["active"], "inactive")).toEqual(["inactive"]);
		expect(toggleProviderCoverage(["inactive"], "active")).toEqual(["active"]);
	});

	it("preserves other coverage filters", () => {
		expect(toggleProviderCoverage(["active", "free"], "inactive")).toEqual(["free", "inactive"]);
		expect(toggleProviderCoverage(["inactive", "free"], "free")).toEqual(["inactive"]);
	});
});

describe("matchesProviderPolicy", () => {
	it("matches legal and BYOK availability", () => {
		const provider = makeProvider({
			byok_available: true,
			privacy_policy_url: "https://example.com/privacy",
			terms_of_service_url: "https://example.com/terms",
		});
		expect(matchesProviderPolicy(provider, "byok")).toBe(true);
		expect(matchesProviderPolicy(provider, "privacy")).toBe(true);
		expect(matchesProviderPolicy(provider, "terms")).toBe(true);
	});

	it("matches training and retention categories", () => {
		const provider = makeProvider({ prompt_training_policy: "may_train", data_retention_days: 30 });
		expect(matchesProviderPolicy(provider, "training:may_train")).toBe(true);
		expect(matchesProviderPolicy(provider, "retention:published")).toBe(true);
		expect(matchesProviderPolicy(makeProvider({ data_retention_days: 0 }), "retention:none")).toBe(true);
		expect(matchesProviderPolicy(makeProvider({ zero_data_retention: true }), "retention:zdr")).toBe(true);
		expect(matchesProviderPolicy(makeProvider(), "training:unknown")).toBe(true);
		expect(matchesProviderPolicy(makeProvider(), "retention:unknown")).toBe(true);
	});

	it("matches the public data policy and ZDR categories", () => {
		const provider = makeProvider({
			data_policy_tier: "logs",
			zero_data_retention: false,
		});

		expect(matchesProviderPolicy(provider, "data_policy:logs")).toBe(true);
		expect(matchesProviderPolicy(provider, "data_policy:private")).toBe(false);
		expect(matchesProviderPolicy(provider, "zdr:false")).toBe(true);
		expect(matchesProviderPolicy(provider, "zdr:true")).toBe(false);
		expect(matchesProviderPolicy(makeProvider(), "data_policy:unknown")).toBe(true);
	});

	it("treats the legacy opt_out training value as opt-out available", () => {
		const provider = makeProvider({ prompt_training_policy: "opt_out" });

		expect(matchesProviderPolicy(provider, "training:opt_out_available")).toBe(true);
	});
});

describe("matchesProviderDatacenter", () => {
	it("matches known execution regions and unknown metadata", () => {
		expect(matchesProviderDatacenter(makeProvider({ default_execution_regions: ["US", "EU"] }), "us")).toBe(true);
		expect(matchesProviderDatacenter(makeProvider({ default_execution_regions: ["US", "EU"] }), "apac")).toBe(false);
		expect(matchesProviderDatacenter(makeProvider(), "unknown")).toBe(true);
	});
});
