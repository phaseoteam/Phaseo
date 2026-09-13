import { afterEach, describe, expect, it, vi } from "vitest";
import {
	attachModelsPageVariants,
	fetchModelsPageCatalogue,
	buildModelsPageFacets,
	mergeModelWeeklyMetrics,
	normalizeModelsPagePricing,
} from "@/models/page-catalogue";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchModelsPageCatalogue", () => {
	it("loads more than 1,000 models with one catalogue RPC", async () => {
		const rows = Array.from({ length: 2001 }, (_, index) => ({
			model_id: `test/model-${index}`, name: `Model ${index}`,
		}));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(
			JSON.stringify(String(input).includes("get_public_models_page_payload") ? rows : []),
		));
		vi.stubGlobal("fetch", fetchMock);
		const result = await fetchModelsPageCatalogue(env);
		expect(result.models).toHaveLength(2001);
		const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("get_public_models_page_payload"));
		expect(calls).toHaveLength(1);
		expect(String(calls[0][0])).not.toContain("offset=");
	});

	it("rejects malformed catalogue payloads rather than caching an empty success", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(
			String(input).includes("get_public_models_page_payload") ? "null" : "[]",
		)));
		await expect(fetchModelsPageCatalogue(env)).rejects.toThrow("Invalid models catalogue payload");
	});

	it("starts weekly metrics before the unfiltered catalogue finishes", async () => {
		let releaseRows!: () => void;
		const rowsReady = new Promise<void>((resolve) => { releaseRows = resolve; });
		let metricsStarted!: () => void;
		const metricsReady = new Promise<void>((resolve) => { metricsStarted = resolve; });
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes("get_public_models_page_payload")) await rowsReady;
			if (String(input).includes("get_v2_public_model_weekly_metrics")) metricsStarted();
			return new Response("[]", { status: 200 });
		}));
		const catalogue = fetchModelsPageCatalogue(env);
		try {
			await metricsReady;
		} finally {
			releaseRows();
		}
		await expect(catalogue).resolves.toMatchObject({ models: [], pricingComplete: true });
	});

	it("filters organisation rows after the JSON catalogue RPC returns", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("get_public_models_page_payload")) {
				return new Response(JSON.stringify([
					{ model_id: "adept/fuyu-8b", organisation_id: "adept", name: "Fuyu 8b" },
					{ model_id: "openai/gpt-test", organisation_id: "openai", name: "GPT Test" },
				]), { status: 200 });
			}
			if (url.includes("get_v2_public_model_weekly_metrics")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
	});
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchModelsPageCatalogue(env, { organisationId: "adept" }, "v2");

		expect(result.models.map((model) => model.model_id)).toEqual(["adept/fuyu-8b"]);
		expect(fetchMock.mock.calls.some(([input]) => String(input).includes("organisation_id=eq"))).toBe(false);
	});

	it("keeps a standalone free model as its own family", () => {
		const rows = attachModelsPageVariants([{
			model_id: "mistral/leanstral-1.5:free",
			name: "Leanstral 1.5 (Free)",
			variant_kind: "free",
			base_model_id: null,
			gateway_provider_details: [],
		}]);

		expect(rows).toEqual([
			expect.objectContaining({
				model_id: "mistral/leanstral-1.5:free",
				base_model_id: "mistral/leanstral-1.5:free",
				variant_kind: "free",
				variants: {
					free: {
						model_id: "mistral/leanstral-1.5:free",
						name: "Leanstral 1.5 (Free)",
					},
				},
			}),
		]);
	});
});

describe("buildModelsPageFacets", () => {
	it("groups transcription aliases under the canonical audio_stt modality", () => {
		const facets = buildModelsPageFacets([
			{
				gateway_status: "active",
				gateway_input_modalities: ["audio"],
				gateway_output_modalities: ["transcription"],
			},
		]);

		expect(facets.outputModalityOptions).toEqual([
			{ value: "audio_stt", count: 1 },
		]);
	});
});

describe("attachModelsPageVariants", () => {
	it("uses a title-cased display label without changing the stealth provider ID", () => {
		const [model] = attachModelsPageVariants([{
			model_id: "stealth/test-model",
			name: "Test Model",
			gateway_provider_details: [{ id: "stealth", name: "stealth", is_active: true }],
		}]);

		expect(model).toMatchObject({
			gateway_provider_details: [{ id: "stealth", name: "Stealth", is_active: true }],
			gateway_provider_names: ["Stealth"],
			gateway_active_provider_names: ["Stealth"],
		});
	});

	it("keeps callable variants separate and links them to one model family", () => {
		const rows = attachModelsPageVariants([
			{
				model_id: "poolside/laguna-s-2.1",
				name: "Laguna S 2.1",
				gateway_provider_details: [],
			},
			{
				model_id: "poolside/laguna-s-2.1:free",
				name: "Laguna S 2.1 (Free)",
				variant_kind: "free",
				base_model_id: "poolside/laguna-s-2.1",
				gateway_provider_details: [],
			},
		]);

		expect(rows).toHaveLength(2);
		expect(rows).toEqual([
			expect.objectContaining({
				model_id: "poolside/laguna-s-2.1",
				base_model_id: "poolside/laguna-s-2.1",
				variant_kind: "standard",
				variants: {
					standard: { model_id: "poolside/laguna-s-2.1", name: "Laguna S 2.1" },
					free: { model_id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Free)" },
				},
			}),
			expect.objectContaining({
				model_id: "poolside/laguna-s-2.1:free",
				base_model_id: "poolside/laguna-s-2.1",
				variant_kind: "free",
				variants: {
					standard: { model_id: "poolside/laguna-s-2.1", name: "Laguna S 2.1" },
					free: { model_id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Free)" },
				},
			}),
		]);
	});
});

describe("mergeModelWeeklyMetrics", () => {
	it("replaces catalogue placeholders with v2 rollup metrics", () => {
		const rows = mergeModelWeeklyMetrics([
			{
				model_id: "poolside/laguna-s-2.1",
				popularity_tokens_week: null,
				throughput_week: null,
				latency_week: null,
			},
			{ model_id: "catalogue/only", popularity_tokens_week: null },
		], [
			{
				model_slug: "poolside/laguna-s-2.1",
				popularity_tokens_week: 12_345,
				weekly_usage_metric: "tokens",
				weekly_usage_quantity: 12_345,
				weekly_usage_unit: "tokens",
				throughput_week: 8.75,
				latency_week: 245.5,
			},
		]);

		expect(rows[0]).toMatchObject({
			model_id: "poolside/laguna-s-2.1",
			popularity_tokens_week: 12_345,
			weekly_usage_metric: "tokens",
			weekly_usage_quantity: 12_345,
			weekly_usage_unit: "tokens",
			throughput_week: 8.75,
			latency_week: 245.5,
		});
		expect(rows[1]).toEqual({
			model_id: "catalogue/only",
			popularity_tokens_week: null,
		});
	});
});

describe("normalizeModelsPagePricing", () => {
	it("converts V2 meter rows into the existing model-card pricing contract", () => {
		const row = normalizeModelsPagePricing({
			lowest_input_price: 0.3,
			lowest_output_price: 1.5,
			lowest_standard_input_price: 0.3,
			lowest_standard_output_price: 1.5,
			lowest_standard_input_price_label: "Input",
			lowest_standard_input_price_unit: "billing unit",
			lowest_standard_output_price_label: "Output",
			lowest_standard_output_price_unit: "billing unit",
			lowest_from_price: 0.3,
			lowest_from_price_unit: "billing unit",
			pricing_detail_rows: [
				{ label: "input_text_tokens", meter_key: "input_text_tokens", price: 0.3, unit: "token", unit_quantity: 1_000_000, display_unit: "1000000 token", service_tier: "standard" },
				{ label: "output_text_tokens", meter_key: "output_text_tokens", price: 1.5, unit: "token", unit_quantity: 1_000_000, display_unit: "1M tokens", service_tier: "standard" },
				{ label: "input_text_tokens", meter_key: "input_text_tokens", price: 0.3, unit: "token", unit_quantity: 1_000_000, display_unit: "1000000 token", service_tier: "standard" },
			],
		});

		expect(row).toMatchObject({
			lowest_standard_input_price_label: "Input",
			lowest_standard_input_price_unit: "1M tokens",
			lowest_standard_output_price_label: "Output",
			lowest_standard_output_price_unit: "1M tokens",
			lowest_from_price_unit: "1M tokens",
			pricing_detail_rows: [
				{ label: "Input Text Tokens", value: "$0.3 / 1M tokens" },
				{ label: "Output Text Tokens", value: "$1.5 / 1M tokens" },
			],
		});
	});
});
