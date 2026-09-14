import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
	assertSafeDiscoverySnapshot,
	buildDiscordMessage,
	buildProviderApiModelSnapshotDiff,
	confirmModelRemovals,
	collapseDiscordProviderChanges,
	computeDiscordNotificationFingerprint,
	extractDiscoveredModels,
	extractProviderApiModelSnapshot,
	fetchProviderModels,
	formatPricingSample,
	getDiscordProviderFamilyId,
	resolveProviderModelsEndpoint,
} from "./helpers";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

const POOLSIDE_DISCOVERY_PROVIDER = {
	providerId: "poolside",
	providerName: "Poolside",
	modelsEndpoint: "https://inference.poolside.ai/v1/models",
	pathPrefix: "/v1",
	baseUrlEnv: ["POOLSIDE_BASE_URL"],
	apiKeyEnv: ["POOLSIDE_API_KEY"],
} as const;

const GOOGLE_VERTEX_DISCOVERY_PROVIDER = {
	providerId: "google-vertex",
	providerName: "Google Vertex",
	modelsEndpoint:
		"https://aiplatform.googleapis.com/v1beta1/publishers/google/models?listAllVersions=true&pageSize=300",
	apiKeyEnv: ["GOOGLE_VERTEX_ACCESS_TOKEN", "GOOGLE_VERTEX_API_KEY"],
	authStyle: "google_vertex",
} as const;

const MINIMAX_DISCOVERY_PROVIDER = {
	providerId: "minimax",
	providerName: "MiniMax",
	baseUrl: "https://api.minimax.io",
	pathPrefix: "/v1",
	apiKeyEnv: ["MINIMAX_API_KEY"],
	authStyle: "bearer",
} as const;

afterEach(() => {
	teardownTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("resolveProviderModelsEndpoint", () => {
	it("resolves MiniMax's OpenAI-compatible models endpoint", () => {
		expect(resolveProviderModelsEndpoint(MINIMAX_DISCOVERY_PROVIDER)).toBe(
			"https://api.minimax.io/v1/models",
		);
	});

	it("interpolates encoded endpoint parameters from Worker bindings", () => {
		setupRuntimeFromEnv({
			CLOUDFLARE_ACCOUNT_ID: "account/id",
		} as any);

		expect(resolveProviderModelsEndpoint({
			providerId: "cloudflare",
			providerName: "Cloudflare Workers AI",
			modelsEndpoint: "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/models/search?format=openrouter",
			modelsEndpointParams: { accountId: ["CLOUDFLARE_ACCOUNT_ID"] },
		})).toBe(
			"https://api.cloudflare.com/client/v4/accounts/account%2Fid/ai/models/search?format=openrouter",
		);
	});
	it("appends the poolside openai prefix when the base url override is a root domain", () => {
		setupRuntimeFromEnv({
			POOLSIDE_BASE_URL: "https://poolside.example",
		} as any);

		expect(resolveProviderModelsEndpoint(POOLSIDE_DISCOVERY_PROVIDER)).toBe(
			"https://poolside.example/v1/models",
		);
	});

	it("appends only /models when the poolside base url override already includes /v1", () => {
		setupRuntimeFromEnv({
			POOLSIDE_BASE_URL: "https://poolside.example/v1",
		} as any);

		expect(resolveProviderModelsEndpoint(POOLSIDE_DISCOVERY_PROVIDER)).toBe(
			"https://poolside.example/v1/models",
		);
	});
});

describe("fetchProviderModels", () => {
	it("fetches MiniMax's OpenAI-compatible model list with bearer auth", async () => {
		const fetchMock = installFetchMock([{
			match: (url) => url === "https://api.minimax.io/v1/models",
			response: jsonResponse({
				object: "list",
				data: [
					{ id: "MiniMax-M3", object: "model", owned_by: "minimax" },
					{ id: "MiniMax-H3-Max", object: "model", owned_by: "minimax" },
				],
			}),
		}]);
		try {
			const models = await fetchProviderModels(MINIMAX_DISCOVERY_PROVIDER, "test-minimax-key");
			expect(models.map((model) => model.id)).toEqual(["MiniMax-H3-Max", "MiniMax-M3"]);
			expect(fetchMock.calls[0]?.headers.Authorization).toBe("Bearer test-minimax-key");
		} finally {
			fetchMock.restore();
		}
	});

	it("uses Reka's X-Api-Key header for model discovery", async () => {
		const fetchMock = installFetchMock([{
			match: (url) => url === "https://api.reka.ai/v1/models",
			response: jsonResponse([{ id: "reka-flash" }, { id: "reka-edge-2603" }]),
		}]);
		try {
			const models = await fetchProviderModels({
				providerId: "reka",
				providerName: "Reka",
				modelsEndpoint: "https://api.reka.ai/v1/models",
				authStyle: "x_api_key",
			}, "test-reka-key");
			expect(models.map((model) => model.id)).toEqual(["reka-edge-2603", "reka-flash"]);
			expect(fetchMock.calls[0]?.headers["X-Api-Key"]).toBe("test-reka-key");
			expect(fetchMock.calls[0]?.headers.Authorization).toBeUndefined();
		} finally {
			fetchMock.restore();
		}
	});

	it("uses DigitalOcean model_id instead of the internal catalog UUID", async () => {
		const fetchMock = installFetchMock([{
			match: (url) => url.includes("/v2/gen-ai/models/catalog"),
			response: jsonResponse({
				data: [{ id: "00000000-0000-0000-0000-000000000029", model_id: "deepseek-v3.2" }],
			}),
		}]);

		try {
			const models = await fetchProviderModels({
				providerId: "digitalocean",
				providerName: "DigitalOcean",
				modelsEndpoint: "https://api.digitalocean.com/v2/gen-ai/models/catalog?limit=200",
				authStyle: "none",
			});
			expect(models.map((model) => model.id)).toEqual(["deepseek-v3.2"]);
		} finally {
			fetchMock.restore();
		}
	});

	it("uses the resolved poolside models endpoint and extracts standard openai model ids", async () => {
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
			POOLSIDE_BASE_URL: "https://poolside.example/v1",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://poolside.example/v1/models",
				response: jsonResponse({
					data: [
						{ id: "poolside/laguna-m.1", created: 123 },
						{ id: "poolside/laguna-xs.2", created: 456 },
					],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(POOLSIDE_DISCOVERY_PROVIDER, "test-poolside-key");

			expect(models.map((model) => model.id)).toEqual([
				"poolside/laguna-m.1",
				"poolside/laguna-xs.2",
			]);
			expect(fetchMock.calls).toHaveLength(1);
			expect(fetchMock.calls[0]?.headers.Authorization).toBe("Bearer test-poolside-key");
		} finally {
			fetchMock.restore();
		}
	});

	it("throws when the provider returns an error envelope in a successful HTTP response", async () => {
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
			POOLSIDE_BASE_URL: "https://poolside.example/v1",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://poolside.example/v1/models",
				response: jsonResponse({
					error: {
						message: "upstream provider reported a failure",
					},
				}),
			},
		]);

		try {
			await expect(fetchProviderModels(POOLSIDE_DISCOVERY_PROVIDER, "test-poolside-key")).rejects.toThrow(
				"upstream provider reported a failure",
			);
		} finally {
			fetchMock.restore();
		}
	});

	it("accepts a provider success envelope with a nested zero error code", async () => {
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
			POOLSIDE_BASE_URL: "https://poolside.example/v1",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://poolside.example/v1/models",
				response: jsonResponse({
					error: { code: 0, message: "success" },
					data: [{ id: "poolside/laguna-m.1" }],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(POOLSIDE_DISCOVERY_PROVIDER, "test-poolside-key");
			expect(models.map((model) => model.id)).toEqual(["poolside/laguna-m.1"]);
		} finally {
			fetchMock.restore();
		}
	});

	it("still rejects a provider error envelope with a non-zero nested code", async () => {
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
			POOLSIDE_BASE_URL: "https://poolside.example/v1",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://poolside.example/v1/models",
				response: jsonResponse({
					error: { code: 429, message: "rate limited" },
				}),
			},
		]);

		try {
			await expect(fetchProviderModels(POOLSIDE_DISCOVERY_PROVIDER, "test-poolside-key")).rejects.toThrow(
				"rate limited",
			);
		} finally {
			fetchMock.restore();
		}
	});

	it("merges google and anthropic publisher models for google-vertex discovery", async () => {
		setupRuntimeFromEnv({
			GOOGLE_VERTEX_ACCESS_TOKEN: "test-vertex-token",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) =>
					url ===
					"https://aiplatform.googleapis.com/v1beta1/publishers/google/models?listAllVersions=true&pageSize=300",
				response: jsonResponse({
					publisherModels: [
						{
							name: "publishers/google/models/gemini-3.5-flash",
							versionId: "default",
						},
					],
				}),
			},
			{
				match: (url) =>
					url ===
					"https://aiplatform.googleapis.com/v1beta1/publishers/anthropic/models?listAllVersions=true&pageSize=300",
				response: jsonResponse({
					publisherModels: [
						{
							name: "publishers/anthropic/models/claude-sonnet-4-6",
							versionId: "20260219",
						},
					],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(GOOGLE_VERTEX_DISCOVERY_PROVIDER, "test-vertex-token");

			expect(models.map((model) => model.id)).toEqual([
				"claude-sonnet-4-6@20260219",
				"gemini-3.5-flash",
			]);
			expect(fetchMock.calls).toHaveLength(2);
			expect(fetchMock.calls[0]?.headers.Authorization).toBe("Bearer test-vertex-token");
			expect(fetchMock.calls[1]?.headers.Authorization).toBe("Bearer test-vertex-token");
		} finally {
			fetchMock.restore();
		}
	});
});

describe("extractProviderApiModelSnapshot", () => {
	it("retains media pricing alongside normalized token rates", () => {
		const snapshot = extractProviderApiModelSnapshot(
			"deepinfra",
			{
				metadata: {
					pricing: {
						input_tokens: 0.2,
						output_tokens: 1,
						per_image_unit: 0.04,
					},
				},
			},
			{ metadata: { pricing: { input_tokens: 0.2, output_tokens: 1, per_image_unit: 0.04 } } },
		);

		expect(snapshot.pricingDetails).toEqual({
			normalized: {
				currency: "USD",
				unit: "per_1m_tokens",
				meters: { input_text_tokens: 0.2, output_text_tokens: 1 },
			},
			sourcePricing: { metadata: { pricing: { input_tokens: 0.2, output_tokens: 1, per_image_unit: 0.04 } } },
		});
	});
});

describe("extractDiscoveredModels", () => {
	it("strips latency metrics from nested provider pricing snapshots", () => {
		const [model] = extractDiscoveredModels("unknown-provider", {
			data: [{ id: "model-a", pricing: { providers: [
				{ first_token_latency_ms: 273.6, pricing: { input: 1.25, output: 2.5 } },
				{ first_token_latency_ms: 981.2, pricing: { input: 1.25, output: 2.5 } },
			] } }],
		});

		expect(JSON.stringify(model?.pricingDetails)).not.toContain("latency");
		expect(model?.pricingDetails).toEqual({ pricing: { providers: [
			{ pricing: { input: 1.25, output: 2.5 } },
			{ pricing: { input: 1.25, output: 2.5 } },
		] } });
	});

	it("extracts model pricing from top-level array responses", () => {
		const models = extractDiscoveredModels("together", [
			{
				id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
				pricing: { input: 0.88, output: 0.88 },
			},
		]);

		expect(models).toHaveLength(1);
		expect(models[0]).toMatchObject({
			id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
			pricingDetails: { pricing: { input: 0.88, output: 0.88 } },
		});
	});
});

describe("confirmModelRemovals", () => {
	it("requires the model to be missing from two consecutive successful checks", () => {
		expect(confirmModelRemovals(
			["first-miss", "second-miss"],
			new Set(["second-miss"]),
		)).toEqual({
			confirmed: ["second-miss"],
			provisional: ["first-miss"],
		});
	});
});

describe("buildDiscordMessage", () => {
	it("collapses regional and endpoint variants into provider families", () => {
		const collapsed = collapseDiscordProviderChanges([
			{ providerId: "nebius-token-factory", providerName: "Nebius", previousCount: 1, currentCount: 2, added: ["model-a"], removed: [] },
			{ providerId: "nebius-token-factory-eu-north-1", providerName: "Nebius EU", previousCount: 1, currentCount: 2, added: ["model-a"], removed: [] },
			{ providerId: "nebius-token-factory-fast", providerName: "Nebius Fast", previousCount: 1, currentCount: 2, added: ["model-b"], removed: [] },
		]);

		expect(collapsed).toHaveLength(1);
		expect(collapsed[0]).toMatchObject({ providerName: "Nebius Token Factory", added: ["model-a", "model-b"] });
		expect(getDiscordProviderFamilyId("nebius-token-factory-us-central-1")).toBe("nebius-token-factory");
	});

	it("preserves pricing update counts while deduplicating visible samples", () => {
		const message = buildDiscordMessage({
			modelChanges: [],
			pricing: {
				updatesDetected: 10,
				providerChanges: [
					{ providerId: "nebius-token-factory", updates: 6, samples: ["shared price"] },
					{ providerId: "nebius-token-factory-eu-north-1", updates: 4, samples: ["shared price"] },
				],
			},
			providerApiPricing: { updatesDetected: 0, providerChanges: [] },
			pricingTable: { updatesDetected: 0, providerChanges: [], errors: [] },
			configuredModelCoverage: { updatesDetected: 0, providerChanges: [] },
		} as any);

		expect(message).toContain("10 updated rules across 1 provider");
		expect(message.match(/shared price/g)).toHaveLength(1);
	});

	it("ignores performance and token-limit metadata changes", () => {
		expect(buildProviderApiModelSnapshotDiff(
			{ contextLength: 32_000, maxCompletionTokens: 4_096, pricingDetails: { input: 1 }, pricingFingerprint: "same" },
			{ contextLength: 128_000, maxCompletionTokens: 16_384, pricingDetails: { input: 1 }, pricingFingerprint: "same" },
		)).toEqual([]);
	});

	it("includes pricing-only changes", () => {
		setupRuntimeFromEnv({} as any);
		expect(buildDiscordMessage({
			modelChanges: [],
			pricing: { updatesDetected: 1, providerChanges: [{ providerId: "groq", updates: 1, samples: ["llama-3.3 | price changed"] }] },
			providerApiPricing: { updatesDetected: 1, providerChanges: [{ providerId: "deepinfra", updates: 1, samples: ["model | price changed"] }] },
			pricingTable: { updatesDetected: 0, providerChanges: [], errors: [] },
			configuredModelCoverage: { updatesDetected: 0, providerChanges: [] },
		} as any)).toContain("Pricing monitor detected 1 updated rule");
	});

	it("does not notify for pricing source failures without a pricing change", () => {
		setupRuntimeFromEnv({} as any);
		expect(buildDiscordMessage({
			modelChanges: [],
			pricing: { updatesDetected: 0, providerChanges: [] },
			providerApiPricing: { updatesDetected: 0, providerChanges: [] },
			pricingTable: {
				updatesDetected: 0,
				providerChanges: [],
				errors: ["Alibaba pricing source returned no prices"],
			},
			configuredModelCoverage: { updatesDetected: 0, providerChanges: [] },
		} as any)).toBe("");
	});

	it("reports pricing page changes with added and removed price lines", () => {
		setupRuntimeFromEnv({} as any);
		const message = buildDiscordMessage({
			modelChanges: [],
			pricing: { updatesDetected: 0, providerChanges: [] },
			providerApiPricing: { updatesDetected: 0, providerChanges: [] },
			pricingTable: {
				updatesDetected: 1,
				providerChanges: [{
					providerId: "cohere",
					providerName: "Cohere",
					sourceUrl: "https://cohere.com/pricing",
					fingerprint: "next",
					tableCount: 3,
					pricingSamples: [],
					contentLines: ["Command A input $2.00 / 1M tokens"],
					addedSamples: ["Command A input $2.00 / 1M tokens"],
					removedSamples: ["Command A input $2.50 / 1M tokens"],
				}],
				errors: [],
			},
			configuredModelCoverage: { updatesDetected: 0, providerChanges: [] },
		} as any);

		expect(message).toContain("Pricing page monitor detected 1 changed provider source.");
		expect(message).toContain("Cohere (https://cohere.com/pricing) — 1 added, 1 removed:");
		expect(message).toContain("+ Command A input $2.00 / 1M tokens");
		expect(message).toContain("- Command A input $2.50 / 1M tokens");
		expect(message).not.toContain("price-bearing section");
	});

	it("prefers an explicit catalog endpoint over the gateway base URL", () => {
		expect(resolveProviderModelsEndpoint({
			providerId: "catalog",
			providerName: "Catalog",
			modelsEndpoint: "https://catalog.example/models.json",
			baseUrl: "https://gateway.example/v1",
			authStyle: "none",
		})).toBe("https://catalog.example/models.json");
	});
});

describe("extractProviderApiModelSnapshot pricing comparisons", () => {
	it("ignores volatile raw metadata when canonical prices are unchanged", () => {
		const previous = extractProviderApiModelSnapshot(
			"chutes",
			{ price: { input: { usd: 0.2 }, output: { usd: 0.8 } } },
			{ price: { input: { usd: 0.2 }, output: { usd: 0.8 } }, refreshed_at: "first" },
		);
		const current = extractProviderApiModelSnapshot(
			"chutes",
			{ price: { input: { usd: 0.2 }, output: { usd: 0.8 } } },
			{ price: { input: { usd: 0.2 }, output: { usd: 0.8 } }, refreshed_at: "second" },
		);

		expect(current.pricingFingerprint).toBe(previous.pricingFingerprint);
		expect(current.pricingDetails).not.toEqual(previous.pricingDetails);
	});

	it("detects a changed canonical provider price", () => {
		const previous = extractProviderApiModelSnapshot(
			"chutes",
			{ price: { input: { usd: 0.2 }, output: { usd: 0.8 } } },
			null,
		);
		const current = extractProviderApiModelSnapshot(
			"chutes",
			{ price: { input: { usd: 0.25 }, output: { usd: 0.8 } } },
			null,
		);

		expect(current.pricingFingerprint).not.toBe(previous.pricingFingerprint);
		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([
			"input: $0.2 → $0.25 / 1M tokens",
		]);
	});

	it("detects Novita decimal pricing changes from the public models feed", () => {
		const previous = extractProviderApiModelSnapshot(
			"novita",
			{
				input_token_price_per_m: 1500,
				output_token_price_per_m: 5000,
				pricing: {
					prompt: { price_per_m_decimal: "0.15" },
					completion: { price_per_m_decimal: "0.5" },
					input_cache_read: { price_per_m: 300, price_per_m_decimal: "0.03" },
				},
			},
			null,
		);
		const current = extractProviderApiModelSnapshot(
			"novita",
			{
				input_token_price_per_m: 2000,
				output_token_price_per_m: 5000,
				pricing: {
					prompt: { price_per_m_decimal: "0.2" },
					completion: { price_per_m_decimal: "0.5" },
					input_cache_read: { price_per_m: 400, price_per_m_decimal: "0.04" },
				},
			},
			null,
		);

		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([
			"cached input: $0.03 → $0.04 / 1M tokens",
			"input: $0.15 → $0.2 / 1M tokens",
		]);
	});

	it("formats multiple canonical meter changes without raw provider payloads", () => {
		const previous = extractProviderApiModelSnapshot(
			"openrouter",
			{ pricing: { prompt: 0.0000005306, completion: 0.0000016676, input_cache_read: 0.00000009854 } },
			null,
		);
		const current = extractProviderApiModelSnapshot(
			"openrouter",
			{ pricing: { prompt: 0.0000005166, completion: 0.0000016236, input_cache_read: 0.00000009594 } },
			null,
		);

		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([
			"cached input: $0.09854 → $0.09594 / 1M tokens",
			"input: $0.5306 → $0.5166 / 1M tokens",
			"output: $1.6676 → $1.6236 / 1M tokens",
		]);
	});

	it("ignores unrelated benchmark changes in provider pricing payloads", () => {
		const previous = extractProviderApiModelSnapshot(
			"openrouter",
			{
				pricing: { prompt: 0.0000002, completion: 0.0000008 },
				benchmarks: { design_arena: [{ win_rate: 40 }] },
			},
			{
				pricing: { prompt: 0.0000002, completion: 0.0000008 },
				benchmarks: { design_arena: [{ win_rate: 40 }] },
			},
		);
		const current = extractProviderApiModelSnapshot(
			"openrouter",
			{
				pricing: { prompt: 0.0000002, completion: 0.0000008 },
				benchmarks: { design_arena: [{ win_rate: 41 }] },
			},
			{
				pricing: { prompt: 0.0000002, completion: 0.0000008 },
				benchmarks: { design_arena: [{ win_rate: 41 }] },
			},
		);

		expect(current.pricingFingerprint).toBe(previous.pricingFingerprint);
		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([]);
	});

	it("detects supplemental non-token price changes", () => {
		const previous = extractProviderApiModelSnapshot(
			"deepinfra",
			{ metadata: { pricing: { input_tokens: 0.2, output_tokens: 0.8, per_image_unit: 0.04 } } },
			{ metadata: { pricing: { input_tokens: 0.2, output_tokens: 0.8, per_image_unit: 0.04 } } },
		);
		const current = extractProviderApiModelSnapshot(
			"deepinfra",
			{ metadata: { pricing: { input_tokens: 0.2, output_tokens: 0.8, per_image_unit: 0.05 } } },
			{ metadata: { pricing: { input_tokens: 0.2, output_tokens: 0.8, per_image_unit: 0.05 } } },
		);

		expect(current.pricingFingerprint).not.toBe(previous.pricingFingerprint);
		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([
			"per image unit: $0.04 → $0.05",
		]);
	});

	it("ignores Hugging Face provider offer ordering and duplicate entries", () => {
		const previous = extractProviderApiModelSnapshot(
			"huggingface",
			{
				providers: [
					{ provider: "together", pricing: { input: 1.74, output: 3.48 } },
					{ provider: "novita", pricing: { input: 1.6, output: 3.2 } },
				],
			},
			null,
		);
		const current = extractProviderApiModelSnapshot(
			"huggingface",
			{
				providers: [
					{ provider: "novita", pricing: { input: 1.6, output: 3.2 } },
					{ provider: "together", pricing: { input: 1.74, output: 3.48 } },
					{ provider: "together", pricing: { input: 1.74, output: 3.48 } },
				],
			},
			null,
		);

		expect(current.pricingFingerprint).toBe(previous.pricingFingerprint);
		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([]);
	});

	it("silently migrates legacy anonymous Hugging Face pricing snapshots", () => {
		const current = extractProviderApiModelSnapshot(
			"huggingface",
			{
				providers: [
					{ provider: "novita", pricing: { input: 1.6, output: 3.2 } },
					{ provider: "together", pricing: { input: 1.74, output: 3.48 } },
				],
			},
			null,
		);
		const legacy = {
			contextLength: null,
			maxCompletionTokens: null,
			pricingDetails: {
				providers: [
					{ pricing: { input: 1.6, output: 3.2 } },
					{ pricing: { input: 1.74, output: 3.48 } },
				],
			},
			pricingFingerprint: "legacy-fingerprint",
		};

		expect(buildProviderApiModelSnapshotDiff(legacy, current)).toEqual([]);
	});

	it("labels Hugging Face backend additions, removals, and price changes", () => {
		const previous = extractProviderApiModelSnapshot(
			"huggingface",
			{
				providers: [
					{ provider: "deepinfra", pricing: { input: 1.3, output: 2.6 } },
					{ provider: "together", pricing: { input: 1.74, output: 3.48 } },
				],
			},
			null,
		);
		const current = extractProviderApiModelSnapshot(
			"huggingface",
			{
				providers: [
					{ provider: "novita", pricing: { input: 0.14, output: 0.4 } },
					{ provider: "together", pricing: { input: 1.74, output: 3.5 } },
				],
			},
			null,
		);

		expect(buildProviderApiModelSnapshotDiff(previous, current)).toEqual([
			"deepinfra: removed (input $1.3, output $2.6 / 1M tokens)",
			"novita: added (input $0.14, output $0.4 / 1M tokens)",
			"together output: $3.48 → $3.5 / 1M tokens",
		]);
	});
});

describe("computeDiscordNotificationFingerprint", () => {
	it("is stable for an identical notification and changes with its payload", async () => {
		setupRuntimeFromEnv({} as any);
		const input = {
			modelChanges: [],
			pricing: { updatesDetected: 0, providerChanges: [] },
			providerApiPricing: { updatesDetected: 1, providerChanges: [{ providerId: "openrouter", updates: 1, samples: ["model | price changed"] }] },
			pricingTable: { updatesDetected: 0, providerChanges: [], errors: [] },
			configuredModelCoverage: { updatesDetected: 0, providerChanges: [] },
		} as any;

		const first = await computeDiscordNotificationFingerprint(input);
		const repeated = await computeDiscordNotificationFingerprint(input);
		const changed = await computeDiscordNotificationFingerprint({
			...input,
			providerApiPricing: { updatesDetected: 2, providerChanges: [{ providerId: "openrouter", updates: 2, samples: ["two prices changed"] }] },
		});

		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(repeated).toBe(first);
		expect(changed).not.toBe(first);
	});
});

describe("W&B provider catalog extraction", () => {
	it("extracts models from the provider-owned nested catalog", () => {
		expect(extractDiscoveredModels("weights-and-biases", {
			coreweave: {
				models: {
					"openai/gpt-oss-120b": {
						id: "openai/gpt-oss-120b",
						name: "OpenAI: gpt-oss-120b",
						cost: { input: 0.03, output: 0.17, cache_read: 0.03 },
					},
				},
			},
		})).toEqual([expect.objectContaining({ id: "openai/gpt-oss-120b" })]);
	});
});

describe("pricing samples", () => {
	it("formats the model from the v2 legacy pricing projection", () => {
		expect(formatPricingSample({
			rule_id: "rule-1",
			provider_id: "openai",
			api_model_id: "openai/gpt-5.4",
			capability_id: "text.generate",
			pricing_plan: "standard",
			meter: "input_text_tokens",
			price_per_unit: 2.5,
			currency: "USD",
			effective_from: null,
			effective_to: null,
			updated_at: "2026-07-26T00:00:00Z",
		})).toContain("openai/gpt-5.4");
	});
});

describe("assertSafeDiscoverySnapshot", () => {
	it("rejects empty and catastrophic provider snapshots", () => {
		expect(() => assertSafeDiscoverySnapshot("provider", ["a"], [])).toThrow("returned zero models");
		expect(() => assertSafeDiscoverySnapshot("provider", ["a", "b", "c", "d", "e", "f", "g", "h"], ["a"])).toThrow(
			"refusing a destructive snapshot",
		);
	});

	it("accepts normal provider churn", () => {
		expect(() => assertSafeDiscoverySnapshot("provider", ["a", "b", "c", "d", "e"], ["a", "b", "c", "f"])).not.toThrow();
	});
});
