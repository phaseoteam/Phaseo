import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	azureDeployment,
	azureHeaders,
	azureUrl,
	resolveAzureConfig,
} from "../config";
import {
	setupRuntimeFromEnv,
	setupTestRuntime,
	teardownTestRuntime,
} from "../../../../tests/helpers/runtime";

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("azure config", () => {
	it("builds Azure OpenAI chat URL from resource endpoint + deployment", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_API_KEY: "test-azure-key",
			AZURE_OPENAI_BASE_URL:
				"https://ai-stats-resource.cognitiveservices.azure.com/",
			AZURE_OPENAI_API_VERSION: "2024-05-01-preview",
		} as any);

		const config = resolveAzureConfig();
		const deployment = azureDeployment({
			providerModelSlug: "Kimi-K2.5",
			model: "moonshot-ai/kimi-k2.5",
		} as any);
		const url = azureUrl(
			`openai/deployments/${deployment}/chat/completions`,
			config.apiVersion,
			config.baseUrl,
		);

		expect(url).toBe(
			"https://ai-stats-resource.cognitiveservices.azure.com/openai/deployments/Kimi-K2.5/chat/completions?api-version=2024-05-01-preview",
		);
	});

	it("defaults api_version when not configured", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_API_KEY: "test-azure-key",
			AZURE_OPENAI_BASE_URL:
				"https://ai-stats-resource.cognitiveservices.azure.com",
		} as any);

		expect(resolveAzureConfig().apiVersion).toBe("2024-02-15-preview");
	});

	it("uses provider_model_slug before model id for deployment name", () => {
		const deployment = azureDeployment({
			providerModelSlug: "my-deployment",
			model: "openai/gpt-4o",
		} as any);
		expect(deployment).toBe("my-deployment");
	});

	it("encodes deployment names safely for path usage", () => {
		const deployment = azureDeployment({
			providerModelSlug: "My Deploy/1",
			model: "openai/gpt-4o",
		} as any);
		expect(deployment).toBe("My%20Deploy%2F1");
	});

	it("uses api-key header auth", () => {
		expect(azureHeaders("abc123")).toEqual({
			"api-key": "abc123",
			"Content-Type": "application/json",
		});
	});
});
