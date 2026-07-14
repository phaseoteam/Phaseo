import { afterAll, afterEach, describe, expect, it } from "vitest";
import { buildDiscordMessage, extractDiscoveredModels, extractProviderApiModelSnapshot, fetchProviderModels, resolveProviderModelsEndpoint } from "./helpers";
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

afterEach(() => {
	teardownTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("resolveProviderModelsEndpoint", () => {
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

describe("buildDiscordMessage", () => {
	it("does not include pricing-only changes", () => {
		setupRuntimeFromEnv({} as any);
		expect(buildDiscordMessage({
			modelChanges: [],
			pricing: { updatesDetected: 1, providerChanges: [{ providerId: "crofai", updates: 1, samples: ["glm-5.2 | price changed"] }] },
			providerApiPricing: { updatesDetected: 1, providerChanges: [{ providerId: "deepinfra", updates: 1, samples: ["model | price changed"] }] },
			configuredModelCoverage: { updatesDetected: 0, providerChanges: [] },
		} as any)).toBe("");
	});
});
