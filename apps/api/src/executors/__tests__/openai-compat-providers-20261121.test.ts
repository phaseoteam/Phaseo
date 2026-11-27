import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

// OpenAI-compatible providers added 2026-11-21: provider, key env, chat URL, upstream model.
const PROVIDERS = [
	["prime-intellect", "PRIME_INTELLECT_API_KEY", "https://api.pinference.ai/api/v1/chat/completions", "thinkingmachines/inkling-2-mini"],
	["tenstorrent", "TENSTORRENT_API_KEY", "https://console.tenstorrent.com/v1/chat/completions", "zai-org/GLM-5.3"],
	["kt", "KT_TOKEN_FACTORY_API_KEY", "https://api.tokenfactory.kt.com/v1/chat/completions", "midm-k-3.0-pro"],
	["dekallm", "DEKALLM_API_KEY", "https://dekallm.cloudeka.ai/v1/chat/completions", "openai/gpt-oss-120b"],
	["river", "RIVER_API_KEY", "https://api.river.ai/v1/chat/completions", "moonshotai/Kimi-K3"],
] as const;

beforeAll(() => setupRuntimeFromEnv(Object.fromEntries(PROVIDERS.map(([providerId, env]) => [env, `test-${providerId}-key`]))));
afterAll(teardownTestRuntime);

describe("OpenAI-compatible providers added 2026-11-21", () => {
	it.each(PROVIDERS)("%s reads the upstream SSE stream and its final usage event", async (providerId, _env, url, upstreamModel) => {
		const executor = resolveProviderExecutor(providerId, "text.generate");
		const chunk = (body: Record<string, unknown>) => `data: ${JSON.stringify({ id: `chat_${providerId}`, object: "chat.completion.chunk", model: upstreamModel, ...body })}\n\n`;
		const mock = installFetchMock([{
			match: (requestUrl) => requestUrl === url,
			response: new Response([
				chunk({ choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }),
				chunk({ choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }] }),
				chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
				chunk({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } }),
				"data: [DONE]\n\n",
			].join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await executor!({
				ir: { model: "test/model", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as IRChatRequest,
				requestId: `req_sse_${providerId}`,
				workspaceId: "workspace_test",
				providerId,
				providerModelSlug: upstreamModel,
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				capabilityParams: { params: ["max_tokens"] },
				byokMeta: [],
				pricingCard: { rules: [] },
				meta: {},
			} as unknown as ExecutorExecuteArgs);
			expect(mock.calls[0].bodyJson).toMatchObject({ model: upstreamModel, stream: true });
			expect(result.kind).toBe("completed");
			if (result.kind === "completed") {
				expect(result.bill.usage).toMatchObject({ input_tokens: 7, output_tokens: 2 });
				expect(result.ir?.choices[0]).toMatchObject({
					finishReason: "stop",
					message: { content: [expect.objectContaining({ type: "text", text: "ok" })] },
				});
			}
		} finally {
			mock.restore();
		}
	});

	it.each(PROVIDERS)("%s calls its chat endpoint with its own key", async (providerId, _env, url, upstreamModel) => {
		const executor = resolveProviderExecutor(providerId, "text.generate");
		expect(executor).toBeTruthy();
		const mock = installFetchMock([{
			match: (requestUrl) => requestUrl === url,
			response: jsonResponse({
				id: `chatcmpl_${providerId}`,
				object: "chat.completion",
				created: 1795206987,
				model: upstreamModel,
				choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		}]);
		try {
			const result = await executor!({
				ir: { model: "test/model", stream: false, temperature: 0.5, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as IRChatRequest,
				requestId: `req_${providerId}`,
				workspaceId: "workspace_test",
				providerId,
				providerModelSlug: upstreamModel,
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				capabilityParams: { params: ["temperature", "max_tokens"] },
				byokMeta: [],
				pricingCard: { rules: [] },
				meta: {},
			} as unknown as ExecutorExecuteArgs);
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].headers).toMatchObject({ Authorization: `Bearer test-${providerId}-key` });
			expect(mock.calls[0].bodyJson).toMatchObject({ model: upstreamModel, temperature: 0.5 });
		} finally {
			mock.restore();
		}
	});
});
