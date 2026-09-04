import { createPhaseoWebMCPTools } from "./tools";
import type { WebMCPDataSource } from "./tool-data";

function sourceFor(payloads: Record<string, unknown>) {
	const navigations: string[] = [];
	const source: WebMCPDataSource = {
		fetchJson: async <T>(path: string) => {
			const key = Object.keys(payloads).find((candidate) => path.startsWith(candidate));
			if (!key) throw new Error(`Unexpected path: ${path}`);
			return payloads[key] as T;
		},
		navigate: (href) => navigations.push(href),
	};
	return { source, navigations };
}

function tool(name: string, source: WebMCPDataSource) {
	const result = createPhaseoWebMCPTools(source).find((entry) => entry.name === name);
	if (!result) throw new Error(`Missing tool: ${name}`);
	return result;
}

describe("Phaseo WebMCP tools", () => {
	test("searches compact catalogue data and ranks matching terms", async () => {
		const { source } = sourceFor({
			"/api/_web/search": {
				m: [
					["openai/gpt-5", "GPT-5", "OpenAI reasoning model", "/models/openai/gpt-5", "openai", "2026"],
					["anthropic/claude", "Claude", "Anthropic", "/models/anthropic/claude", "anthropic", null],
				],
				o: [], b: [], p: [], s: [], c: [],
			},
		});
		const result = JSON.parse(await tool("search_phaseo_models", source).execute({ query: "OpenAI reasoning" }) as string);
		expect(result.models).toEqual([expect.objectContaining({ modelId: "openai/gpt-5" })]);
	});

	test("filters available gateway routes", async () => {
		const { source } = sourceFor({
			"/api/_web/gateway/models": { models: [
				{ modelId: "openai/gpt-5", providerId: "openai", providerName: "OpenAI", modelName: "GPT-5", organisationName: "OpenAI", capabilities: ["tools", "reasoning"], inputModalities: ["text", "image"], outputModalities: ["text"], isAvailable: true },
				{ modelId: "example/text", providerId: "example", providerName: "Example", modelName: "Text", organisationName: "Example", capabilities: ["tools"], inputModalities: ["text"], outputModalities: ["text"], isAvailable: true },
			] },
			"/api/_web/api-providers": { providers: [
				{ api_provider_id: "openai", api_provider_name: "OpenAI", default_execution_regions: ["EU", "US"], default_data_regions: ["EU", "US"], zero_data_retention: true },
			] },
		});
		const result = JSON.parse(await tool("find_phaseo_gateway_routes", source).execute({ capabilities: ["reasoning"], modalities: ["image"] }) as string);
		expect(result.routes).toEqual([expect.objectContaining({ modelId: "openai/gpt-5" })]);
		expect(result.rejected[0]).toEqual(expect.objectContaining({ modelId: "example/text", reasons: expect.arrayContaining(["Missing capability: reasoning", "Missing modality: image"]) }));
	});

	test("applies policy, region, provider, and price constraints with reasons", async () => {
		const { source } = sourceFor({
			"/api/_web/gateway/models": { models: [
				{ modelId: "safe/model", providerId: "safe", providerName: "Safe", modelName: "Safe Model", organisationName: "Safe", capabilities: ["tools"], inputModalities: ["text"], outputModalities: ["text"], inputPricePerMillion: 1, outputPricePerMillion: 4, providerPromptTrainingPolicy: "no_train", isAvailable: true },
				{ modelId: "risky/model", providerId: "risky", providerName: "Risky", modelName: "Risky Model", organisationName: "Risky", capabilities: ["tools"], inputModalities: ["text"], outputModalities: ["text"], inputPricePerMillion: 3, outputPricePerMillion: 12, providerPromptTrainingPolicy: "may_train", isAvailable: true },
			] },
			"/api/_web/api-providers": { providers: [
				{ api_provider_id: "safe", api_provider_name: "Safe", default_execution_regions: ["EU"], default_data_regions: ["EU"], zero_data_retention: true },
				{ api_provider_id: "risky", api_provider_name: "Risky", default_execution_regions: ["US"], default_data_regions: ["US"], zero_data_retention: false },
			] },
		});
		const result = JSON.parse(await tool("find_phaseo_gateway_routes", source).execute({ requireNoPromptTraining: true, requireZeroDataRetention: true, executionRegion: "EU", maxOutputPricePerMillion: 5 }) as string);
		expect(result.routes).toEqual([expect.objectContaining({ modelId: "safe/model" })]);
		expect(result.rejected[0].reasons).toEqual(expect.arrayContaining(["Output price exceeds 5/1M", "Provider does not publish an unconditional no-training policy", "Provider does not publish zero data retention", "Execution region EU is not published"]));
	});

	test("calculates token cost per provider route", async () => {
		const { source } = sourceFor({
			"/api/_web/pricing/models": { models: [{
				provider: "openai", model: "openai/gpt-5", endpoint: "responses", pricing_plan: "standard",
				meters: [
					{ meter: "input_tokens", unit: "tokens", unit_size: 1_000_000, price_per_unit: "2", currency: "USD" },
					{ meter: "output_tokens", unit: "tokens", unit_size: 1_000_000, price_per_unit: "8", currency: "USD" },
				],
			}] },
		});
		const result = JSON.parse(await tool("estimate_phaseo_text_cost", source).execute({ modelId: "openai/gpt-5", inputTokens: 100_000, outputTokens: 20_000 }) as string);
		expect(result.routes[0].estimatedCost).toBeCloseTo(0.36);
	});

	test("opens comparison and request builder workflows", async () => {
		const { source, navigations } = sourceFor({});
		await tool("open_phaseo_model_comparison", source).execute({ modelIds: ["openai/gpt-5", "anthropic/claude"] });
		await tool("open_phaseo_request_builder", source).execute({ modelId: "openai/gpt-5" });
		expect(navigations).toEqual([
			"/compare?models=openai_gpt-5&models=anthropic_claude",
			"/tools/request-builder?model=openai%2Fgpt-5",
		]);
	});

	test("inspects model evidence in parallel", async () => {
		const { source } = sourceFor({
			"/api/_web/models/openai%2Fgpt-5?": { model: { model_id: "openai/gpt-5", name: "GPT-5" } },
			"/api/_web/models/openai%2Fgpt-5/availability": { availability: { isGatewayActive: true } },
			"/api/_web/models/openai%2Fgpt-5/benchmarks": { highlights: [{ name: "Reasoning", score: 90 }] },
			"/api/_web/models/openai%2Fgpt-5/performance": { metrics: { latency: 120 } },
		});
		const result = JSON.parse(await tool("inspect_phaseo_model", source).execute({ modelId: "openai/gpt-5" }) as string);
		expect(result).toEqual(expect.objectContaining({ modelId: "openai/gpt-5", availability: { isGatewayActive: true } }));
	});

	test("rejects invalid limits and comparison selections", async () => {
		const { source } = sourceFor({ "/api/_web/search": { m: [], o: [], b: [], p: [], s: [], c: [] } });
		await expect(tool("search_phaseo_models", source).execute({ query: "gpt", limit: 100 })).rejects.toThrow("limit");
		expect(() => tool("open_phaseo_model_comparison", source).execute({ modelIds: ["one"] })).toThrow("two to five");
	});
});
