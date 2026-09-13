import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatRoute } from "@providers/openai-compatible/config";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function request(): IRChatRequest {
	return {
		model: "crofai/greg-2-super",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
		maxTokens: 1024,
		serviceTier: "priority",
	};
}

describe("CrofAI current public text contract", () => {
	it("uses the currently published Chat endpoint and Bearer authentication", () => {
		expect(resolveOpenAICompatRoute("crofai", "greg-2-super")).toBe("chat");
		expect(openAICompatUrl("crofai", "/chat/completions")).toBe("https://ai.nahcrof.com/v1/chat/completions");
		expect(openAICompatHeaders("crofai", "secret").Authorization).toBe("Bearer secret");
	});

	it("does not leak gateway routing tiers into the upstream request", () => {
		const wire = irToOpenAIChat(request(), "greg-2-super", "crofai");
		expect(wire.model).toBe("greg-2-super");
		expect(wire.max_tokens).toBe(1024);
		expect(wire.service_tier).toBeUndefined();
	});

	it("forwards reasoning effort to CrofAI's OpenAI-compatible request", () => {
		const ir = request();
		ir.reasoning = { effort: "high" };
		const wire = irToOpenAIChat(ir, "greg-2-super", "crofai");

		expect(wire.reasoning_effort).toBe("high");
	});

	it("preserves CrofAI reasoning and usage in normalized output", () => {
		const ir = openAIChatToIR({
			id: "chatcmpl_crofai",
			choices: [{
				index: 0,
				message: { content: "Answer", reasoning_content: "Reasoning" },
				finish_reason: "stop",
			}],
			usage: {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
				prompt_tokens_details: { cached_tokens: 4 },
			},
		}, "req_crofai", request().model, "crofai");

		expect(ir.choices[0].message.content).toEqual([
			{ type: "reasoning_text", text: "Reasoning" },
			{ type: "text", text: "Answer" },
		]);
		expect(ir.usage).toMatchObject({ inputTokens: 20, outputTokens: 10, cachedInputTokens: 4 });
	});
});
