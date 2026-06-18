import { afterAll, afterEach, describe, expect, it } from "vitest";
import { fetchProviderModels, resolveProviderModelsEndpoint } from "./helpers";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

const POOLSIDE_DISCOVERY_PROVIDER = {
	providerId: "poolside",
	providerName: "Poolside",
	modelsEndpoint: "https://inference.poolside.ai/openai/v1/models",
	pathPrefix: "/openai/v1",
	baseUrlEnv: ["POOLSIDE_BASE_URL"],
	apiKeyEnv: ["POOLSIDE_API_KEY"],
} as const;

const TOGETHER_DISCOVERY_PROVIDER = {
	providerId: "together",
	providerName: "Together",
	modelsEndpoint: "https://api.together.ai/v1/models",
	apiKeyEnv: ["TOGETHER_API_KEY"],
} as const;

const FIREWORKS_DISCOVERY_PROVIDER = {
	providerId: "fireworks",
	providerName: "Fireworks",
	modelsEndpoint:
		"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200",
	apiKeyEnv: ["FIREWORKS_API_KEY"],
	pagination: {
		nextPageTokenFields: ["nextPageToken"],
		pageTokenQueryParam: "pageToken",
		maxPages: 50,
	},
} as const;

const SNAKE_PAGINATION_PROVIDER = {
	providerId: "snake-provider",
	providerName: "Snake Provider",
	modelsEndpoint: "https://snake-provider.example/v1/models?page_size=200",
	apiKeyEnv: ["SNAKE_PROVIDER_API_KEY"],
	pagination: {
		nextPageTokenFields: ["next_page_token"],
		pageTokenQueryParam: "page_token",
		maxPages: 5,
	},
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
			"https://poolside.example/openai/v1/models",
		);
	});

	it("appends only /models when the poolside base url override already includes /openai/v1", () => {
		setupRuntimeFromEnv({
			POOLSIDE_BASE_URL: "https://poolside.example/openai/v1",
		} as any);

		expect(resolveProviderModelsEndpoint(POOLSIDE_DISCOVERY_PROVIDER)).toBe(
			"https://poolside.example/openai/v1/models",
		);
	});
});

describe("fetchProviderModels", () => {
	it("uses the resolved poolside models endpoint and extracts standard openai model ids", async () => {
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
			POOLSIDE_BASE_URL: "https://poolside.example/openai/v1",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://poolside.example/openai/v1/models",
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

	it("extracts Together models from the documented top-level array response", async () => {
		setupRuntimeFromEnv({
			TOGETHER_API_KEY: "test-together-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://api.together.ai/v1/models",
				response: jsonResponse([
					{
						id: "zai-org/GLM-5.2",
						object: "model",
						created: 1718582400,
						type: "chat",
						context_length: 262144,
						pricing: {
							input: 1.4,
							output: 4.4,
							cached_input: 0.26,
						},
					},
					{
						id: "moonshotai/Kimi-K2.7-Code",
						object: "model",
						created: 1718236800,
						type: "code",
						context_length: 262144,
					},
				]),
			},
		]);

		try {
			const models = await fetchProviderModels(TOGETHER_DISCOVERY_PROVIDER, "test-together-key");

			expect(models.map((model) => model.id)).toEqual([
				"moonshotai/Kimi-K2.7-Code",
				"zai-org/GLM-5.2",
			]);
			expect(models[1]?.modelDetails.context_length).toBe(262144);
			expect(models[1]?.pricingDetails).toEqual({
				pricing: {
					cached_input: 0.26,
					input: 1.4,
					output: 4.4,
				},
			});
			expect(fetchMock.calls).toHaveLength(1);
			expect(fetchMock.calls[0]?.headers.Authorization).toBe("Bearer test-together-key");
		} finally {
			fetchMock.restore();
		}
	});

	it("paginates Fireworks serverless model listings via nextPageToken", async () => {
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) =>
					url ===
					"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200",
				response: jsonResponse({
					models: [
						{
							name: "accounts/fireworks/models/deepseek-v4-pro",
							contextLength: 1048576,
							supportsServerless: true,
						},
					],
					nextPageToken: "page-2",
				}),
			},
			{
				match: (url) =>
					url ===
					"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200&pageToken=page-2",
				response: jsonResponse({
					models: [
						{
							name: "accounts/fireworks/models/glm-5p2",
							contextLength: 1048576,
							supportsServerless: true,
						},
					],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(FIREWORKS_DISCOVERY_PROVIDER, "test-fireworks-key");

			expect(models.map((model) => model.id)).toEqual([
				"accounts/fireworks/models/deepseek-v4-pro",
				"accounts/fireworks/models/glm-5p2",
			]);
			expect(models[0]?.modelDetails.supportsServerless).toBe(true);
			expect(fetchMock.calls).toHaveLength(2);
			expect(fetchMock.calls[0]?.headers.Authorization).toBe("Bearer test-fireworks-key");
			expect(fetchMock.calls[1]?.headers.Authorization).toBe("Bearer test-fireworks-key");
		} finally {
			fetchMock.restore();
		}
	});

	it("ignores pagination tokens for providers without pagination config", async () => {
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://inference.poolside.ai/openai/v1/models",
				response: jsonResponse({
					data: [{ id: "poolside/laguna-m.1", created: 123 }],
					nextPageToken: "ignored-token",
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(POOLSIDE_DISCOVERY_PROVIDER, "test-poolside-key");

			expect(models.map((model) => model.id)).toEqual(["poolside/laguna-m.1"]);
			expect(fetchMock.calls).toHaveLength(1);
		} finally {
			fetchMock.restore();
		}
	});

	it("uses configured snake_case pagination tokens and query params when enabled", async () => {
		setupRuntimeFromEnv({
			SNAKE_PROVIDER_API_KEY: "test-snake-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) => url === "https://snake-provider.example/v1/models?page_size=200",
				response: jsonResponse({
					data: [{ id: "snake/model-1" }],
					next_page_token: "page-2",
				}),
			},
			{
				match: (url) =>
					url === "https://snake-provider.example/v1/models?page_size=200&page_token=page-2",
				response: jsonResponse({
					data: [{ id: "snake/model-2" }],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(SNAKE_PAGINATION_PROVIDER, "test-snake-key");

			expect(models.map((model) => model.id)).toEqual(["snake/model-1", "snake/model-2"]);
			expect(fetchMock.calls).toHaveLength(2);
			expect(fetchMock.calls[1]?.headers.Authorization).toBe("Bearer test-snake-key");
		} finally {
			fetchMock.restore();
		}
	});

	it("drops Fireworks models that are not marked serverless even if the upstream route returns them", async () => {
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) =>
					url ===
					"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200",
				response: jsonResponse({
					models: [
						{
							name: "accounts/fireworks/models/glm-5p2",
							contextLength: 1048576,
							supportsServerless: true,
						},
						{
							name: "accounts/fireworks/models/non-serverless-leak",
							contextLength: 32768,
							supportsServerless: false,
						},
					],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(FIREWORKS_DISCOVERY_PROVIDER, "test-fireworks-key");

			expect(models.map((model) => model.id)).toEqual([
				"accounts/fireworks/models/glm-5p2",
			]);
		} finally {
			fetchMock.restore();
		}
	});

	it("accepts Fireworks serverless flags in camelCase and snake_case truthy formats", async () => {
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) =>
					url ===
					"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200",
				response: jsonResponse({
					models: [
						{
							name: "accounts/fireworks/models/serverless-bool",
							supportsServerless: true,
						},
						{
							name: "accounts/fireworks/models/serverless-number",
							supportsServerless: 1,
						},
						{
							name: "accounts/fireworks/models/serverless-snake",
							supports_serverless: "true",
						},
						{
							name: "accounts/fireworks/models/non-serverless",
							supports_serverless: "false",
						},
					],
				}),
			},
		]);

		try {
			const models = await fetchProviderModels(FIREWORKS_DISCOVERY_PROVIDER, "test-fireworks-key");

			expect(models.map((model) => model.id)).toEqual([
				"accounts/fireworks/models/serverless-bool",
				"accounts/fireworks/models/serverless-number",
				"accounts/fireworks/models/serverless-snake",
			]);
		} finally {
			fetchMock.restore();
		}
	});

	it("fails Fireworks discovery when the upstream repeats a page token", async () => {
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		const fetchMock = installFetchMock([
			{
				match: (url) =>
					url ===
					"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200",
				response: jsonResponse({
					models: [{ name: "accounts/fireworks/models/page-1", supportsServerless: true }],
					nextPageToken: "page-2",
				}),
			},
			{
				match: (url) =>
					url ===
					"https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200&pageToken=page-2",
				response: jsonResponse({
					models: [{ name: "accounts/fireworks/models/page-2", supportsServerless: true }],
					nextPageToken: "page-2",
				}),
			},
		]);

		try {
			await expect(
				fetchProviderModels(FIREWORKS_DISCOVERY_PROVIDER, "test-fireworks-key"),
			).rejects.toThrow("repeated page token: page-2");
			expect(fetchMock.calls).toHaveLength(2);
		} finally {
			fetchMock.restore();
		}
	});
});
