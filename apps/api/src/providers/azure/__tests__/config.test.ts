import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	azureAnthropicHeaders,
	azureAnthropicUrl,
	azureDeployment,
	azureHeaders,
	azureOpenAIV1Url,
	azureUrl,
	resolveAzureConfig,
	resolveAzureCredential,
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
	it.each([
		"https://phaseo-resource.openai.azure.com/openai/v1/",
		"https://phaseo-resource.services.ai.azure.com",
		"https://phaseo-resource.services.ai.azure.com/anthropic/v1/",
	])("uses the Claude Messages endpoint for %s", (baseUrl) => {
		expect(azureAnthropicUrl(baseUrl)).toBe("https://phaseo-resource.services.ai.azure.com/anthropic/v1/messages");
	});

	it("preserves explicitly configured sovereign and proxy hosts", () => {
		expect(azureAnthropicUrl("https://resource.openai.azure.us/anthropic"))
			.toBe("https://resource.openai.azure.us/anthropic/v1/messages");
		expect(azureAnthropicUrl("https://proxy.example/resource/openai/v1"))
			.toBe("https://proxy.example/resource/anthropic/v1/messages");
	});

	it("uses Claude's x-api-key without changing Azure OpenAI authentication", () => {
		expect(azureAnthropicHeaders("claude-key")).toEqual({ "x-api-key": "claude-key", "Content-Type": "application/json" });
		expect(azureHeaders("openai-key")).toEqual({ "api-key": "openai-key", "Content-Type": "application/json" });
		expect(azureAnthropicHeaders("entra-token", "entra"))
			.toEqual({ Authorization: "Bearer entra-token", "Content-Type": "application/json" });
	});
	it("builds Azure OpenAI chat URL from resource endpoint + deployment", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_API_KEY: "test-azure-key",
			AZURE_OPENAI_BASE_URL:
				"https://phaseo-resource.cognitiveservices.azure.com/",
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
			"https://phaseo-resource.cognitiveservices.azure.com/openai/deployments/Kimi-K2.5/chat/completions?api-version=2024-05-01-preview",
		);
	});

	it("builds legacy Azure route URLs from a v1 base URL", () => {
		const url = azureUrl(
			"openai/deployments/gpt-4o/chat/completions",
			"2024-10-21",
			"https://phaseo-resource.openai.azure.com/openai/v1/",
		);

		expect(url).toBe(
			"https://phaseo-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21",
		);
	});

	it("defaults api_version when not configured", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_API_KEY: "test-azure-key",
			AZURE_OPENAI_BASE_URL:
				"https://phaseo-resource.cognitiveservices.azure.com",
		} as any);

		expect(resolveAzureConfig().apiVersion).toBe("v1");
	});

	it("defaults api_version when configured as a blank string", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_API_KEY: "test-azure-key",
			AZURE_OPENAI_BASE_URL:
				"https://phaseo-resource.cognitiveservices.azure.com",
			AZURE_OPENAI_API_VERSION: " ",
		} as any);

		expect(resolveAzureConfig().apiVersion).toBe("v1");
	});

	it("throws a coded error when base URL is missing", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_API_KEY: "test-azure-key",
			AZURE_OPENAI_BASE_URL: "",
		} as any);

		expect(() => resolveAzureConfig()).toThrowError("azure_base_url_missing");
		try {
			resolveAzureConfig();
		} catch (error) {
			expect((error as any)?.code).toBe("azure_base_url_missing");
		}
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

	it("builds Azure OpenAI v1 URLs from a v1 base URL", () => {
		expect(
			azureOpenAIV1Url(
				"responses",
				"https://phaseo-resource.openai.azure.com/openai/v1/",
			),
		).toBe("https://phaseo-resource.openai.azure.com/openai/v1/responses");
	});

	it("builds Azure OpenAI v1 URLs from a resource base URL", () => {
		expect(
			azureOpenAIV1Url(
				"responses",
				"https://phaseo-resource.openai.azure.com/",
			),
		).toBe("https://phaseo-resource.openai.azure.com/openai/v1/responses");
	});

	it("uses api-key header auth", () => {
		expect(azureHeaders("abc123")).toEqual({
			"api-key": "abc123",
			"Content-Type": "application/json",
		});
	});

	it("uses an Entra bearer token when no API key is configured", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AZURE_OPENAI_BASE_URL: "https://phaseo-resource.openai.azure.com",
			AZURE_OPENAI_AUTH_TOKEN: "entra-token",
		} as any);
		const credential = resolveAzureCredential({ providerId: "azure", byokMeta: [] } as any);
		expect(credential).toMatchObject({ key: "entra-token", authType: "entra", source: "gateway" });
		expect(azureHeaders(credential.key, credential.authType)).toEqual({
			Authorization: "Bearer entra-token",
			"Content-Type": "application/json",
		});
	});

	it("adds the preview selector only for the v1 preview surface", () => {
		expect(azureOpenAIV1Url("responses", "https://phaseo-resource.openai.azure.com", "preview"))
			.toBe("https://phaseo-resource.openai.azure.com/openai/v1/responses?api-version=preview");
	});
});
