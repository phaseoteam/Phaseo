import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import {
	providerConfig,
} from "./providers.js";
import {
	fetchProviderModels,
	hasRequiredEnvVars,
	buildUrl,
	resolveEnvVars,
	checkModelExists,
	normalizeModelKey,
} from "./client.js";
import type { Provider } from "./types.js";

describe("Model Discovery Client", () => {
	describe("normalizeModelKey", () => {
		it("should lowercase and remove special characters except hyphens, underscores, and periods", () => {
			expect(normalizeModelKey("GPT-4o")).toBe("gpt-4o");
			expect(normalizeModelKey("claude-3.5-sonnet")).toBe("claude-3.5-sonnet");
			expect(normalizeModelKey("deepseek-chat")).toBe("deepseek-chat");
		});

		it("should preserve alphanumeric, hyphens, underscores, and periods", () => {
			expect(normalizeModelKey("gpt-4.5-preview")).toBe("gpt-4.5-preview");
			expect(normalizeModelKey("model_v2.1")).toBe("model_v2.1");
		});
	});

	describe("resolveEnvVars", () => {
		beforeEach(() => {
			vi.resetModules();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return single env var value", () => {
			vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
			const provider: Provider = {
				id: "test",
				name: "Test",
				baseUrl: "https://api.test.com/models",
				envVar: "OPENAI_API_KEY",
				transformResponse: (data) => [],
			};
			expect(resolveEnvVars(provider)).toEqual(["sk-test-key"]);
		});

		it("should return array of env var values", () => {
			vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIA_TEST");
			vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret_test");
			const provider: Provider = {
				id: "bedrock",
				name: "Bedrock",
				baseUrl: "aws-bedrock",
				envVar: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
				transformResponse: (data) => [],
			};
			expect(resolveEnvVars(provider)).toEqual(["AKIA_TEST", "secret_test"]);
		});
	});

	describe("hasRequiredEnvVars", () => {
		beforeEach(() => {
			vi.resetModules();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return true when all env vars are set", () => {
			vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
			const provider: Provider = {
				id: "test",
				name: "Test",
				baseUrl: "https://api.test.com/models",
				envVar: "OPENAI_API_KEY",
				transformResponse: (data) => [],
			};
			expect(hasRequiredEnvVars(provider)).toBe(true);
		});

		it("should return false when env var is missing", () => {
			vi.stubEnv("OPENAI_API_KEY", "");
			const provider: Provider = {
				id: "test",
				name: "Test",
				baseUrl: "https://api.test.com/models",
				envVar: "OPENAI_API_KEY",
				transformResponse: (data) => [],
			};
			expect(hasRequiredEnvVars(provider)).toBe(false);
		});

		it("should return false when any array env var is missing", () => {
			vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIA_TEST");
			vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
			const provider: Provider = {
				id: "bedrock",
				name: "Bedrock",
				baseUrl: "aws-bedrock",
				envVar: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
				transformResponse: (data) => [],
			};
			expect(hasRequiredEnvVars(provider)).toBe(false);
		});
	});

	describe("buildUrl", () => {
		beforeEach(() => {
			vi.resetModules();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should build basic URL without params", () => {
			const provider: Provider = {
				id: "test",
				name: "Test",
				baseUrl: "https://api.test.com/models",
				envVar: "TEST_API_KEY",
				transformResponse: (data) => [],
			};
			expect(buildUrl(provider)).toBe("https://api.test.com/models");
		});

		it("should add query params", () => {
			vi.stubEnv("GOOGLE_API_KEY", "sk-test");
			const provider: Provider = {
				id: "google",
				name: "Google",
				baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
				envVar: "GOOGLE_API_KEY",
				queryParams: { key: true },
				transformResponse: (data) => [],
			};
			const url = buildUrl(provider);
			expect(url).toContain("key=sk-test");
		});

		it("should replace account_id placeholder for Fireworks", () => {
			vi.stubEnv("FIREWORKS_API_KEY", "fw-test");
			vi.stubEnv("FIREWORKS_ACCOUNT_ID", "acct_12345");
			const provider: Provider = {
				id: "fireworks",
				name: "Fireworks",
				baseUrl: "https://api.fireworks.ai/v1/accounts/{account_id}/models",
				envVar: ["FIREWORKS_API_KEY", "FIREWORKS_ACCOUNT_ID"],
				transformResponse: (data) => [],
			};
			expect(buildUrl(provider)).toBe(
				"https://api.fireworks.ai/v1/accounts/acct_12345/models"
			);
		});

		it("should replace endpoint placeholder for Azure", () => {
			vi.stubEnv("AZURE_API_KEY", "azure-test");
			vi.stubEnv("AZURE_ENDPOINT", "https://my-resource.openai.azure.com");
			const provider: Provider = {
				id: "azure",
				name: "Azure",
				baseUrl: "{endpoint}/openai/models",
				envVar: ["AZURE_API_KEY", "AZURE_ENDPOINT"],
				queryParams: { "api-version": "2024-10-21" },
				transformResponse: (data) => [],
			};
			const url = buildUrl(provider);
			expect(url).toBe(
				"https://my-resource.openai.azure.com/openai/models?api-version=2024-10-21"
			);
		});
	});

	describe("checkModelExists", () => {
		it("should find exact match", () => {
			const existing = new Set(["openai/gpt-4o", "anthropic/claude-3-5-sonnet"]);
			expect(checkModelExists(existing, "openai", "gpt-4o")).toBe(true);
			expect(checkModelExists(existing, "anthropic", "claude-3-5-sonnet")).toBe(true);
		});

		it("should not find non-existent model", () => {
			const existing = new Set(["openai/gpt-4o"]);
			expect(checkModelExists(existing, "openai", "gpt-5")).toBe(false);
		});

		it("should handle case-insensitive matching", () => {
			const existing = new Set(["openai/gpt-4o"]);
			expect(checkModelExists(existing, "OPENAI", "GPT-4O")).toBe(true);
		});

		it("should handle partial matches for variants", () => {
			const existing = new Set(["openai/gpt-4-turbo", "openai/gpt-4o"]);
			expect(checkModelExists(existing, "openai", "gpt-4")).toBe(true);
			expect(checkModelExists(existing, "openai", "gpt-4-turbo")).toBe(true);
		});
	});

	describe("Provider Config", () => {
		it("should have all required fields for each provider", () => {
			for (const provider of providerConfig) {
				expect(provider.id).toBeDefined();
				expect(provider.name).toBeDefined();
				expect(provider.baseUrl).toBeDefined();
				expect(provider.envVar).toBeDefined();
				expect(typeof provider.transformResponse).toBe("function");
			}
		});

		it("should have unique provider IDs", () => {
			const ids = providerConfig.map((p) => p.id);
			const uniqueIds = new Set(ids);
			expect(ids.length).toBe(uniqueIds.size);
		});

		it("should include major providers", () => {
			const ids = providerConfig.map((p) => p.id);
			expect(ids).toContain("openai");
			expect(ids).toContain("anthropic");
			expect(ids).toContain("mistral");
			expect(ids).toContain("google-ai-studio");
			expect(ids).toContain("bedrock");
		});
	});

	describe("fetchProviderModels", () => {
		beforeEach(() => {
			vi.resetModules();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return empty array when API key is missing", async () => {
			vi.stubEnv("OPENAI_API_KEY", "");
			const provider: Provider = {
				id: "test",
				name: "Test",
				baseUrl: "https://api.test.com/models",
				envVar: "OPENAI_API_KEY",
				transformResponse: (data) => [],
			};
			const result = await fetchProviderModels(provider);
			expect(result).toEqual([]);
		});

		it("should handle fetch errors gracefully", async () => {
			vi.stubEnv("OPENAI_API_KEY", "sk-test");
			vi.mock("node-fetch", () => {
				throw new Error("Network error");
			});

			const provider: Provider = {
				id: "test",
				name: "Test",
				baseUrl: "https://api.test.com/models",
				envVar: "OPENAI_API_KEY",
				transformResponse: (data) => [],
			};

			const result = await fetchProviderModels(provider);
			expect(result).toEqual([]);
		});

		it("should transform response correctly", async () => {
			vi.stubEnv("OPENAI_API_KEY", "sk-test");

			const mockData = {
				data: [
					{ id: "gpt-4o", object: "model" },
					{ id: "gpt-4o-mini", object: "model" },
				],
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			vi.stubGlobal("fetch", mockFetch);

			const provider: Provider = {
				id: "openai",
				name: "OpenAI",
				baseUrl: "https://api.openai.com/v1/models",
				envVar: "OPENAI_API_KEY",
				transformResponse: (data: any) =>
					data.data.map((m: any) => `openai/${m.id}`),
			};

			const result = await fetchProviderModels(provider);
			expect(result).toEqual(["openai/gpt-4o", "openai/gpt-4o-mini"]);
		});
	});
});
