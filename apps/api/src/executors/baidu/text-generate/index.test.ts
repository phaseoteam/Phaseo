import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { execute } from ".";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

beforeAll(() => setupRuntimeFromEnv({ BAIDU_QIANFAN_API_KEY: "baidu-test" } as any));
afterAll(teardownTestRuntime);

function args(protocol: "openai.responses" | "openai.chat.completions"): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "baidu/ernie-5.0",
		stream: true,
		messages: [{ role: "user", content: [{ type: "text", text: "Weather in Beijing?" }] }],
		maxTokens: 256,
		temperature: 0.4,
		tools: [{ type: "function", name: "get_weather", parameters: { type: "object" } }],
		toolChoice: "auto",
		rawRequest: protocol === "openai.responses" ? { input: "Weather in Beijing?" } : { messages: [] },
	};
	return {
		ir,
		requestId: "req_baidu",
		workspaceId: "ws_baidu",
		providerId: "baidu",
		endpoint: protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol,
		capability: "text.generate",
		providerModelSlug: "ernie-5.0",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
	} as ExecutorExecuteArgs;
}

describe("Baidu Qianfan text executor routing", () => {
	// /v2/responses takes flat function tools and documents no tool_choice,
	// max_output_tokens or temperature (https://cloud.baidu.com/doc/qianfan-api/s/vmhejnuy8).
	it.each(["openai.responses", "openai.chat.completions"] as const)("sends %s requests to Chat Completions", async (protocol) => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v2/chat/completions"),
			response: new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await execute(args(protocol));
			expect(result.kind).toBe("stream");
			expect(mock.calls).toHaveLength(1);
			const body = mock.calls[0]?.bodyJson;
			expect(body).toMatchObject({
				model: "ernie-5.0",
				max_tokens: 256,
				temperature: 0.4,
				tool_choice: "auto",
				tools: [{ type: "function", function: { name: "get_weather", parameters: { type: "object" } } }],
			});
			expect(body?.input).toBeUndefined();
			expect(body?.max_output_tokens).toBeUndefined();
		} finally {
			mock.restore();
		}
	});
});
