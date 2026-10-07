import type { MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { mapRawToModelCard, summarizeMonitorRowsForModel } from "./getAllModels";

describe("mapRawToModelCard", () => {
    it("preserves V2 gateway monitor rows for page-level status aggregation", () => {
        const gatewayMonitorRows = [
            {
                id: "openai:gpt-5.6-sol:text.generate",
                model: "GPT-5.6 Sol",
                modelId: "openai/gpt-5.6-sol",
                apiModelId: "openai/gpt-5.6-sol",
                provider: { id: "openai", name: "OpenAI" },
                endpoint: "text.generate",
                gatewayStatus: "active",
            },
        ] as MonitorModelData[];

        const model = mapRawToModelCard({
            model_id: "openai/gpt-5.6-sol",
            name: "GPT-5.6 Sol",
            organisation_id: "openai",
            gateway_monitor_rows: gatewayMonitorRows,
        });

        expect(model.gateway_monitor_rows).toBe(gatewayMonitorRows);
        expect(
            summarizeMonitorRowsForModel(model.gateway_monitor_rows ?? [])
                .gateway_status,
        ).toBe("active");
    });

    it("rejects malformed gateway monitor rows", () => {
        const model = mapRawToModelCard({
            model_id: "openai/gpt-5.6-sol",
            name: "GPT-5.6 Sol",
            organisation_id: "openai",
            gateway_monitor_rows: null,
        });

        expect(model.gateway_monitor_rows).toBeUndefined();
    });

    it("preserves lifecycle dates for end-of-life card markers", () => {
        const model = mapRawToModelCard({
            model_id: "stealth/ox-alpha",
            name: "Ox Alpha",
            organisation_id: "stealth",
            status: "Retired",
            deprecation_date: "2026-08-26T00:00:00",
            retirement_date: "2026-08-26T00:00:00",
            removal_date: "2026-08-26T00:00:00",
        });

        expect(model.deprecation_date).toBe("2026-08-26T00:00:00");
        expect(model.retirement_date).toBe("2026-08-26T00:00:00");
        expect(model.removal_date).toBe("2026-08-26T00:00:00");
    });
});

describe("summarizeMonitorRowsForModel", () => {
	it("uses chat prices for a dual-capability model's general price filters", () => {
		const rows = [
			{ endpoint: "text.generate", provider: { id: "openai", name: "OpenAI", inputPrice: 1, outputPrice: 2 } },
			{ endpoint: "decisions.make", provider: { id: "openai", name: "OpenAI", inputPrice: 0.1, outputPrice: 0 } },
		] as MonitorModelData[];
		const summary = summarizeMonitorRowsForModel(rows);
		expect(summary.gateway_provider_count).toBe(1);
		expect(summary.gateway_endpoints).toEqual(["decisions.make", "text.generate"]);
		expect(summary.lowest_input_price).toBe(1);
		expect(summary.lowest_output_price).toBe(2);
	});
	it("builds card-ready provider, pricing, capability, and usage metadata", () => {
		const rows = [
			{
				id: "provider-a:model-a:text.generate",
				model: "Model A",
				modelId: "model-a",
				apiModelId: "provider-a/model-a",
				provider: {
					id: "provider-a",
					name: "Provider A",
					inputPrice: 1,
					outputPrice: 3,
					standardInputPrice: 2,
					standardInputPriceLabel: "Standard input",
					standardInputPriceUnit: "tokens",
					features: ["tools"],
					executionRegions: ["us"],
				},
				endpoint: "text.generate",
				gatewayStatus: "deranked_lvl1",
				inputModalities: ["text"],
				outputModalities: ["text"],
				context: 128_000,
				maxOutput: 8_192,
				supportedParameters: ["temperature"],
				tier: "standard",
				weeklyTokensModel: 100,
				weeklyThroughputModel: 40,
				weeklyLatencyModel: 800,
			},
			{
				id: "provider-b:model-a:text.generate",
				model: "Model A",
				modelId: "model-a",
				apiModelId: "provider-b/model-a",
				provider: {
					id: "provider-b",
					name: "Provider B",
					inputPrice: 0,
					outputPrice: 2,
					standardInputPrice: 1,
					standardInputPriceLabel: "Cached input",
					standardInputPriceUnit: "tokens",
					features: ["reasoning"],
					executionRegions: ["eu"],
				},
				endpoint: "text.generate",
				gatewayStatus: "coming_soon",
				inputModalities: ["text"],
				outputModalities: ["text"],
				context: 64_000,
				maxOutput: 4_096,
				supportedParameters: ["top_p"],
				tier: "free",
				weeklyTokensModel: 250,
				weeklyThroughputModel: 55,
				weeklyLatencyModel: 900,
			},
		] as MonitorModelData[];

		const summary = summarizeMonitorRowsForModel(rows);

		expect(summary.gateway_provider_count).toBe(2);
		expect(summary.gateway_active_provider_count).toBe(1);
		expect(summary.gateway_status).toBe("active");
		expect(summary.gateway_provider_names).toEqual(["Provider A", "Provider B"]);
		expect(summary.gateway_tiers).toEqual(["free", "standard"]);
		expect(summary.gateway_features).toEqual(["reasoning", "tools"]);
		expect(summary.lowest_input_price).toBe(0);
		expect(summary.lowest_output_price).toBe(2);
		expect(summary.lowest_standard_input_price).toBe(1);
		expect(summary.lowest_standard_input_price_label).toBe("Cached input");
		expect(summary.popularity_tokens_week).toBe(250);
		expect(summary.throughput_week).toBe(55);
		expect(summary.latency_week).toBe(900);
	});
});
