import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute as executeAzureText } from "@executors/azure/text-generate";
import { resolveAzureConfig, resolveAzureCredential } from "../config";
import { resolveOpenAITransport } from "../../shared/openai-transport";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { sseResponse } from "../../../../tests/helpers/sse";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

// The shape the BYOK form saves (apps/web BYOKInputDialog) and the validator accepts.
const CUSTOMER_KEY = JSON.stringify({
	deployments: [
		{ modelSlug: "openai/gpt-4o-mini", endpointUrl: "https://customer.services.ai.azure.com", apiKey: "customer-mini-key", modelId: "customer-mini" },
		{ modelSlug: "openai/gpt-4.1", endpointUrl: "https://customer-eu.openai.azure.com/openai/v1/", apiKey: "customer-41-key", modelId: "customer-41" },
	],
});

function byok(key: string) {
	return [{ id: "byok-azure", providerId: "azure", fingerprintSha256: "fingerprint", keyVersion: "1", alwaysUse: true, key }];
}

beforeEach(() => setupRuntimeFromEnv({
	AZURE_OPENAI_BASE_URL: "https://phaseo.openai.azure.com",
	AZURE_OPENAI_API_KEY: "phaseo-key",
} as any));
afterEach(teardownTestRuntime);

describe("Azure BYOK credentials", () => {
	it("uses the customer's endpoint, key and deployment for the requested model", () => {
		const args = { providerId: "azure", model: "openai/gpt-4.1", providerModelSlug: "gpt-4.1", byokMeta: byok(CUSTOMER_KEY) } as any;
		expect(resolveAzureCredential(args)).toEqual({ key: "customer-41-key", source: "byok", byokId: "byok-azure", authType: "api-key" });
		expect(resolveAzureConfig(args)).toMatchObject({
			baseUrl: "https://customer-eu.openai.azure.com/openai/v1/",
			deployment: "customer-41",
			apiVersion: "v1",
		});
	});

	it("never sends the JSON as a key and falls back to the gateway when no deployment matches", () => {
		const args = { providerId: "azure", model: "openai/gpt-5.6-sol", providerModelSlug: "gpt-5.6-sol", byokMeta: byok(CUSTOMER_KEY) } as any;
		expect(resolveAzureCredential(args)).toEqual({ key: "phaseo-key", source: "gateway", byokId: null, authType: "api-key" });
		expect(resolveAzureConfig(args).baseUrl).toBe("https://phaseo.openai.azure.com");
	});

	it("keeps a plain BYOK key on the gateway's resource and honours a forced gateway key", () => {
		const plain = { providerId: "azure", model: "openai/gpt-4.1", byokMeta: byok("plain-customer-key-0123456789") } as any;
		expect(resolveAzureCredential(plain)).toMatchObject({ key: "plain-customer-key-0123456789", source: "byok" });
		const forced = { providerId: "azure", model: "openai/gpt-4.1", byokMeta: byok(CUSTOMER_KEY), forceGatewayKey: true } as any;
		expect(resolveAzureCredential(forced)).toMatchObject({ key: "phaseo-key", source: "gateway" });
	});

	it("routes OpenAI-shaped endpoints to the customer's resource", () => {
		const result = resolveOpenAITransport({ providerId: "azure", model: "openai/gpt-4o-mini", providerModelSlug: "gpt-4o-mini", byokMeta: byok(CUSTOMER_KEY) } as any, "/embeddings");
		expect(result.url).toBe("https://customer.services.ai.azure.com/openai/v1/embeddings");
		expect(result.headers["api-key"]).toBe("customer-mini-key");
		expect(result.deployment).toBe("customer-mini");
	});

	it("sends text requests to the customer's resource with their deployment name", async () => {
		const mock = installFetchMock([{
			match: () => true,
			response: () => sseResponse([
				{ id: "chatcmpl_azure", object: "chat.completion.chunk", model: "customer-mini", choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }] },
				"[DONE]",
			]),
		}]);
		try {
			const result = await executeAzureText({
				ir: { model: "openai/gpt-4o-mini", stream: true, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] },
				requestId: "req_azure_byok",
				workspaceId: "team_test",
				providerId: "azure",
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				providerModelSlug: "gpt-4o-mini",
				capabilityParams: null,
				byokMeta: byok(CUSTOMER_KEY),
				pricingCard: { rules: [] } as any,
				meta: { returnUpstreamRequest: true },
			} as unknown as ExecutorExecuteArgs);
			expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok-azure" });
			expect(mock.calls[0].url).toBe("https://customer.services.ai.azure.com/openai/v1/chat/completions");
			expect(mock.calls[0].headers["api-key"]).toBe("customer-mini-key");
			expect(mock.calls[0].bodyJson?.model).toBe("customer-mini");
		} finally { mock.restore(); }
	});
});
