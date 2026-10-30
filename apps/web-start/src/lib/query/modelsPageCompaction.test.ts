import type { ModelsPageData, ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";
import {
	compactModelsPageData,
	compactModelsPageModel,
	expandModelsPageData,
	expandModelsPageModel,
} from "./modelsPageCompaction";

function catalogueModel(overrides: Partial<ModelsPageModel> = {}): ModelsPageModel {
	return {
		model_id: "google/gemini-nano-banana-2.1",
		base_model_id: "google/gemini-nano-banana-2.1",
		variant_kind: "standard",
		variants: { standard: { model_id: "google/gemini-nano-banana-2.1", name: "Nano Banana 2.1" } },
		name: "Nano Banana 2.1",
		organisation_id: "google",
		organisation_name: "Google",
		organisation_colour: null,
		description: "Image generation model.",
		status: "Available",
		deprecation_date: null,
		retirement_date: null,
		removal_date: null,
		primary_date: "2026-10-06T00:00:00+00:00",
		primary_timestamp: 1791244800000,
		primary_group_key: "2026-10",
		gateway_status: "active",
		gateway_provider_count: 2,
		gateway_active_provider_count: 1,
		gateway_endpoints: ["image.generate", "text.generate"],
		gateway_input_modalities: ["image", "text"],
		gateway_output_modalities: ["image", "text"],
		gateway_features: [],
		gateway_tiers: ["standard"],
		gateway_provider_names: ["Google AI Studio", "Google Vertex"],
		gateway_active_provider_names: ["Google AI Studio"],
		gateway_execution_regions: [],
		gateway_provider_details: [
			{ id: "google-ai-studio", name: "Google AI Studio", status: "active", is_active: true, data_region: null, service_tier: "standard", execution_region: null, provider_model_slug: "gemini-nano-banana-2.1" },
			{ id: "google-vertex", name: "Google Vertex", status: "inactive", is_active: false, data_region: "eu", service_tier: "standard", execution_region: null, provider_model_slug: "gemini-nano-banana-2.1-vertex" },
		] as unknown as ModelsPageModel["gateway_provider_details"],
		gateway_api_model_ids: ["gemini-nano-banana-2.1", "gemini-nano-banana-2.1-vertex"],
		context_lengths: [65536],
		supported_parameters: [],
		lowest_input_price: 0.75,
		lowest_output_price: 3.75,
		lowest_standard_input_price: 0.75,
		lowest_standard_output_price: 3.75,
		lowest_standard_input_price_label: "Input",
		lowest_standard_input_price_unit: "1M tokens",
		lowest_standard_output_price_label: "Output",
		lowest_standard_output_price_unit: "1M tokens",
		lowest_from_price: 0.75,
		lowest_from_price_unit: "1M tokens",
		pricing_detail_rows: [{ label: "Input Text Tokens", value: "$1.5 / 1M tokens" }],
		popularity_tokens_week: null,
		weekly_usage_metric: null,
		weekly_usage_quantity: null,
		weekly_usage_unit: null,
		throughput_week: null,
		latency_week: null,
		// Present in API responses, though not part of the page model type.
		gateway_monitor_rows: [],
		...overrides,
	} as ModelsPageModel;
}

describe("models page compaction", () => {
	it("drops empty and repeated values from a catalogue model", () => {
		const compact = compactModelsPageModel(catalogueModel());

		for (const key of [
			"deprecation_date", "gateway_features", "gateway_monitor_rows",
			"latency_week", "primary_timestamp", "primary_group_key", "base_model_id", "variant_kind",
			"variants", "gateway_provider_count", "gateway_active_provider_count",
			"gateway_provider_names", "gateway_active_provider_names", "gateway_api_model_ids",
		]) {
			expect(compact).not.toHaveProperty(key);
		}
		expect(compact.gateway_provider_details).toEqual([
			{ id: "google-ai-studio", name: "Google AI Studio", status: "active", is_active: true, provider_model_slug: "gemini-nano-banana-2.1" },
			{ id: "google-vertex", name: "Google Vertex", status: "inactive", is_active: false, data_region: "eu", provider_model_slug: "gemini-nano-banana-2.1-vertex" },
		]);
		expect(compact).not.toHaveProperty("__absent");
		expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(catalogueModel()).length * 0.6);
	});

	it("restores the original model exactly", () => {
		const model = catalogueModel();
		expect(expandModelsPageModel(compactModelsPageModel(model))).toEqual(model);
	});

	it("keeps values that differ from what expansion would derive", () => {
		const model = catalogueModel({
			base_model_id: "google/gemini-nano-banana-2",
			variant_kind: "fast",
			gateway_provider_names: ["Google Vertex", "Google AI Studio"],
			gateway_active_provider_count: 2,
			gateway_api_model_ids: ["gemini-nano-banana-2.1"],
			primary_group_key: "2026-09",
			gateway_features: ["tools"],
		});
		const compact = compactModelsPageModel(model);

		expect(compact).toMatchObject({
			base_model_id: "google/gemini-nano-banana-2",
			variant_kind: "fast",
			gateway_provider_names: ["Google Vertex", "Google AI Studio"],
			gateway_active_provider_count: 2,
			gateway_api_model_ids: ["gemini-nano-banana-2.1"],
			primary_group_key: "2026-09",
			gateway_features: ["tools"],
		});
		expect(expandModelsPageModel(compact)).toEqual(model);
	});

	it("does not add fields a provider preview never had", () => {
		const preview: ModelsPageModel = {
			model_id: "acme/preview",
			name: "Preview",
			organisation_id: "acme",
			organisation_name: "acme",
			organisation_colour: null,
			primary_date: null,
			primary_timestamp: null,
			primary_group_key: null,
			gateway_status: "coming_soon",
			gateway_provider_count: 1,
			gateway_active_provider_count: 0,
			gateway_provider_names: ["Acme"],
			gateway_provider_details: [{ id: "acme", name: "Acme", is_active: false, status: "coming_soon" }],
			pricing_detail_rows: [],
		};
		const expanded = expandModelsPageModel(compactModelsPageModel(preview));

		expect(expanded).toEqual(preview);
		expect(Object.keys(expanded).sort()).toEqual(Object.keys(preview).sort());
		expect(Object.keys(expanded.gateway_provider_details![0]!).sort()).toEqual(["id", "is_active", "name", "status"]);
	});

	it("derives the release month in UTC", () => {
		const model = catalogueModel({
			primary_date: "2026-10-31T23:30:00-02:00",
			primary_timestamp: Date.parse("2026-10-31T23:30:00-02:00"),
			primary_group_key: "2026-11",
		});
		const compact = compactModelsPageModel(model);

		expect(compact).not.toHaveProperty("primary_group_key");
		expect(expandModelsPageModel(compact).primary_group_key).toBe("2026-11");
	});

	it("stores repeated absence lists once for the whole catalogue", () => {
		const catalogueOnly = (modelId: string) => {
			const { lowest_input_price: _input, lowest_output_price: _output, ...model } = catalogueModel({ model_id: modelId, base_model_id: modelId, variants: { standard: { model_id: modelId, name: "Nano Banana 2.1" } } });
			return model as ModelsPageModel;
		};
		const data = { models: [catalogueOnly("a/one"), catalogueModel(), catalogueOnly("a/two")], facets: {} } as unknown as ModelsPageData;
		const compact = compactModelsPageData(data);

		expect(compact.absentKeySets).toEqual([["lowest_input_price", "lowest_output_price"]]);
		expect(compact.models.map((model) => model.__absent)).toEqual([0, undefined, 0]);
		const expanded = expandModelsPageData(compact);
		expect(expanded).toEqual(data);
		expect(expanded).not.toHaveProperty("absentKeySets");
		expect(expanded.models[0]).not.toHaveProperty("lowest_input_price");
	});

	it("round-trips page data and leaves facets untouched", () => {
		const data = {
			models: [catalogueModel(), catalogueModel({ model_id: "openai/gpt-5", name: "GPT-5", base_model_id: "openai/gpt-5", variants: { standard: { model_id: "openai/gpt-5", name: "GPT-5" } } })],
			facets: { statusCounts: { active: 2, coming_soon: 0, not_active: 0, deprecated: 0, retired: 0 } },
		} as unknown as ModelsPageData;
		const compact = compactModelsPageData(data);

		expect(compact.facets).toBe(data.facets);
		expect(expandModelsPageData(compact)).toEqual(data);
	});
});
