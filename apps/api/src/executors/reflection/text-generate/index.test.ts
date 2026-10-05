import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";
import { resolveProviderExecutor } from "@executors/index";

beforeEach(() => setupRuntimeFromEnv({ REFLECTION_API_KEY: "reflection-test-key" }));
afterEach(teardownTestRuntime);

function args(overrides: Record<string, any> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "reflection/beam-501b-a23b", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }], ...overrides },
		providerModelSlug: "Beam-501B-A23B", providerId: "reflection", requestId: "req_reflection", workspaceId: "workspace_test",
		endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate", byokMeta: [], pricingCard: { rules: [] }, meta: {},
	} as ExecutorExecuteArgs;
}

describe("Reflection text executor", () => {
	it("registers only text generation", () => {
		expect(resolveProviderExecutor("reflection", "text.generate")).toBe(executor);
		expect(resolveProviderExecutor("reflection", "embeddings")).toBeNull();
	});
	it.each(["openai.chat.completions", "openai.responses"])("uses upstream Chat for %s and accounts for reasoning", async protocol => {
		const mock = installFetchMock([{
			match: url => url === "https://api.reflection.ai/openai/v1/chat/completions",
			response: jsonResponse({ id: "reflection_reply", model: "Beam-501B-A23B", choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}', reasoning_content: "Check the result" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, completion_tokens_details: { reasoning_tokens: 5 } } }),
		}]);
		try {
			const requestArgs = args({ maxTokens: 200, reasoning: { effort: "max" }, tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }], toolChoice: "auto", responseFormat: { type: "json_schema", name: "answer", schema: { type: "object", properties: { ok: { type: "boolean" } } }, strict: true } });
			requestArgs.protocol = protocol as ExecutorExecuteArgs["protocol"];
			const result = await executor(requestArgs);
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].headers).toMatchObject({ Authorization: "Bearer reflection-test-key" });
			const body = mock.calls[0].bodyJson;
			expect(body).toMatchObject({ model: "Beam-501B-A23B", reasoning_effort: "max", max_completion_tokens: 200, response_format: { type: "json_schema" }, tools: [{ type: "function", function: { name: "lookup" } }] });
			expect(body.max_tokens).toBeUndefined();
			if (result.kind === "completed") {
				expect((result.ir as any)?.usage?.reasoningTokens).toBe(5);
				expect((result.ir as any)?.choices[0].message.content).toContainEqual({ type: "reasoning_text", text: "Check the result" });
			}
		} finally { mock.restore(); }
	});
	it("preserves provider errors without retrying a client failure", async () => {
		const mock = installFetchMock([{ match: url => url.endsWith("/chat/completions"), response: jsonResponse({ error: { code: "model_not_found", message: "Unavailable model", type: "invalid_request_error" } }, { status: 404 }) }]);
		try {
			const result = await executor(args());
			expect(result.upstream.status).toBe(404);
			expect(mock.calls).toHaveLength(1);
		} finally { mock.restore(); }
	});
	it.each([{ reasoning: { enabled: false } }, { reasoning: { effort: "none" } }, { reasoning: { effort: "minimal" } }, { stop: ["END"] }])("rejects unsupported controls before fetching: %j", async controls => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(args(controls));
			expect(result.upstream.status).toBe(400);
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it("passes fragmented reasoning and usage frames through streaming", async () => {
		const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
		const wire = frame({ id: "reflection_stream", model: "Beam-501B-A23B", choices: [{ index: 0, delta: { reasoning_content: "Think" } }] }) + frame({ id: "reflection_stream", choices: [{ index: 0, delta: { content: "Done" }, finish_reason: "stop" }] }) + frame({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, completion_tokens_details: { reasoning_tokens: 1 } } }) + "data: [DONE]\n\n";
		const bytes = new TextEncoder().encode(wire);
		const mock = installFetchMock([{ match: url => url.endsWith("/chat/completions"), response: new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 13) controller.enqueue(bytes.slice(i, i + 13)); controller.close(); } }), { headers: { "Content-Type": "text/event-stream" } }) }]);
		try {
			const result = await executor(args({ stream: true }));
			expect(result.kind).toBe("stream");
			if (result.kind === "stream") {
				const output = await new Response(result.stream).text();
				expect(output).toContain('"reasoning_content":"Think"');
				expect(output).toContain('"content":"Done"');
				expect(output).toContain('"reasoning_tokens":1');
			}
		} finally { mock.restore(); }
	});
});
