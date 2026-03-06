import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executeOpenAICompat } from "../index";
import { installFetchMock, jsonResponse } from "../../../../../../tests/helpers/mock-fetch";
import { sseResponse } from "../../../../../../tests/helpers/sse";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

function buildArgs(): ExecutorExecuteArgs {
	return {
		ir: {
			model: "deepinfra/meta-llama/Meta-Llama-3.1-8B-Instruct",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
			tools: [{
				name: "lookup_weather",
				parameters: { type: "object" },
			}],
		},
		requestId: "req_shared_openai_compat_stream_tools",
		teamId: "team_test",
		providerId: "deepinfra",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {
			returnUpstreamRequest: true,
		},
	} as ExecutorExecuteArgs;
}

describe("executeOpenAICompat", () => {
	it("keeps upstream stream=true when tools are present", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.deepinfra.example/v1/openai/chat/completions",
			response: sseResponse([
				{
					id: "chatcmpl_1",
					object: "chat.completion.chunk",
					model: "deepinfra/meta-llama/Meta-Llama-3.1-8B-Instruct",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
				},
				"[DONE]",
			]),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await executeOpenAICompat(buildArgs());
		mock.restore();

		expect(result.kind).toBe("stream");
		expect(capturedBody?.stream).toBe(true);
		expect(capturedBody?.stream_options?.include_usage).toBe(true);
		expect(Array.isArray(capturedBody?.tools)).toBe(true);
	});

	it("routes alibaba-cloud to responses for text models", async () => {
		const args = buildArgs();
		args.providerId = "alibaba-cloud";
		args.endpoint = "chat.completions";
		args.protocol = "openai.chat.completions";
		args.ir = {
			...args.ir,
			model: "qwen2.5-72b-instruct",
			stream: false,
		};

		const mock = installFetchMock([{
			match: (url) => url === "https://api.alibaba.example/api/v2/apps/protocols/compatible-mode/v1/responses",
			response: jsonResponse({
				id: "resp_1",
				object: "response",
				created_at: 1735689600,
				model: "qwen2.5-72b-instruct",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		}]);

		const result = await executeOpenAICompat(args);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(200);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toBe(
			"https://api.alibaba.example/api/v2/apps/protocols/compatible-mode/v1/responses",
		);
	});
});

