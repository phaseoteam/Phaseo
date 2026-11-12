import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { runCloudflareModel } from "@executors/cloudflare/shared";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { sseResponse } from "../../../../tests/helpers/sse";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

const CUSTOMER_KEY = JSON.stringify({ apiToken: "customer-token", accountId: "0123456789abcdef0123456789abcdef" });

function buildArgs(byokKey?: string): ExecutorExecuteArgs {
	return {
		ir: {
			model: "cloudflare/@cf/zai-org/glm-5.3-flash",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		},
		requestId: "req_cloudflare_byok",
		workspaceId: "team_test",
		providerId: "cloudflare",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: "@cf/zai-org/glm-5.3-flash",
		capabilityParams: null,
		byokMeta: byokKey ? [{
			id: "byok-cf",
			providerId: "cloudflare",
			fingerprintSha256: "fingerprint",
			keyVersion: "1",
			alwaysUse: true,
			key: byokKey,
		}] : [],
		pricingCard: { rules: [] } as any,
		meta: { returnUpstreamRequest: true },
	} as ExecutorExecuteArgs;
}

const chatStream = () => sseResponse([
	{ id: "chatcmpl_cf", object: "chat.completion.chunk", model: "@cf/zai-org/glm-5.3-flash", choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }] },
	"[DONE]",
]);

beforeEach(() => setupRuntimeFromEnv({ CLOUDFLARE_ACCOUNT_ID: "phaseo-account", CLOUDFLARE_API_TOKEN: "phaseo-token" } as any));
afterEach(teardownTestRuntime);

describe("Cloudflare BYOK credentials", () => {
	it("sends text requests to the customer's account with their token", async () => {
		const mock = installFetchMock([{ match: () => true, response: chatStream }]);
		try {
			const result = await executeOpenAIWire(buildArgs(CUSTOMER_KEY));
			expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok-cf" });
			expect(mock.calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1/chat/completions");
			expect(mock.calls[0].headers.Authorization).toBe("Bearer customer-token");
			expect(mock.calls[0].headers["cf-aig-gateway-id"]).toBeUndefined();
		} finally { mock.restore(); }
	});

	it("keeps the gateway account, token and AI Gateway id for the managed key", async () => {
		const mock = installFetchMock([{ match: () => true, response: chatStream }]);
		try {
			await executeOpenAIWire(buildArgs());
			expect(mock.calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/phaseo-account/ai/v1/chat/completions");
			expect(mock.calls[0].headers.Authorization).toBe("Bearer phaseo-token");
			expect(mock.calls[0].headers["cf-aig-gateway-id"]).toBe("default");
		} finally { mock.restore(); }
	});

	it("runs native models on the customer's account with their token", async () => {
		const mock = installFetchMock([{ match: () => true, response: () => jsonResponse({ success: true, result: {} }) }]);
		try {
			const result = await runCloudflareModel(
				{ ...buildArgs(CUSTOMER_KEY), providerModelSlug: "@cf/cloudflare/clef" },
				JSON.stringify({ state: "x" }),
				"application/json",
			);
			expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok-cf" });
			expect(mock.calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/cloudflare/clef");
			expect(mock.calls[0].headers.Authorization).toBe("Bearer customer-token");
			expect(mock.calls[0].headers["cf-aig-gateway-id"]).toBeUndefined();
		} finally { mock.restore(); }
	});

	it("refuses a saved key whose account id is not a Cloudflare account id", async () => {
		const mock = installFetchMock([{ match: () => true, response: chatStream }]);
		try {
			const injected = JSON.stringify({ apiToken: "customer-token", accountId: "../../../../internal" });
			await expect(executeOpenAIWire(buildArgs(injected))).rejects.toThrow("cloudflare_byok_account_id_invalid");
			await expect(runCloudflareModel(buildArgs(injected), "{}", "application/json")).rejects.toThrow("cloudflare_byok_account_id_invalid");
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
});
