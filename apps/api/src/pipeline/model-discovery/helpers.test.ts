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
});
