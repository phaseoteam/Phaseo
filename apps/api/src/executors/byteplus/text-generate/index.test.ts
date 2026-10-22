import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatRoute } from "@providers/openai-compatible/config";
import { decodeOpenAIResponsesRequest } from "../../../protocols/openai-responses/decode";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function request(): IRChatRequest {
	return {
		model: "bytedance/seed-2.0-lite",
		stream: false,
		messages: [{
			role: "user",
			content: [
				{ type: "text", text: "Describe this clip" },
				{ type: "video", source: "url", url: "https://example.com/clip.mp4" },
			],
		}],
		reasoning: { enabled: false },
		responseFormat: { type: "json_object" },
		maxTokens: 1024,
	};
}

describe("BytePlus current text contract", () => {
	it("uses the official regional Responses endpoint and bearer auth", () => {
		expect(resolveOpenAICompatRoute("byteplus", "seed-2-0-lite-260228")).toBe("responses");
		expect(openAICompatUrl("byteplus", "/responses")).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/responses");
		expect(openAICompatHeaders("byteplus", "ark-key").Authorization).toBe("Bearer ark-key");
	});

	it("uses BytePlus Responses input, thinking, structured-output, and video shapes", () => {
		const wire = irToOpenAIResponses(request(), "seed-2-0-lite-260228", "byteplus");
		expect(wire.input_items).toBeUndefined();
		expect(wire.input[0].content[1]).toEqual({
			type: "input_video",
			video_url: "https://example.com/clip.mp4",
		});
		expect(wire.thinking).toEqual({ type: "disabled" });
		expect(wire.text).toEqual({ format: { type: "json_object" } });
		expect(wire.max_output_tokens).toBe(1024);
	});

	it("sends store: false on Responses unless the client asked to store", () => {
		expect(irToOpenAIResponses(request(), "seed-2-0-lite-260228", "byteplus").store).toBe(false);
		expect(irToOpenAIResponses({ ...request(), store: false }, "seed-2-0-lite-260228", "byteplus").store).toBe(false);
		expect(irToOpenAIResponses({ ...request(), store: true }, "seed-2-0-lite-260228", "byteplus").store).toBe(true);
		expect(irToOpenAIChat(request(), "seed-2-0-lite-260228", "byteplus").store).toBeUndefined();
	});

	it("uses max_completion_tokens and thinking on the supported Chat API", () => {
		const wire = irToOpenAIChat(request(), "seed-2-0-lite-260228", "byteplus");
		expect(wire.max_completion_tokens).toBe(1024);
		expect(wire.max_tokens).toBeUndefined();
		expect(wire.thinking).toEqual({ type: "disabled" });
		expect(wire.messages[0].content[1].video_url).toBe("https://example.com/clip.mp4");
	});

	it("preserves BytePlus reasoning and cached-token usage in normalized output", () => {
		const ir = openAIChatToIR({
			id: "chatcmpl_byteplus",
			created: 1,
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
				completion_tokens_details: { reasoning_tokens: 6 },
			},
		}, "req_byteplus", "bytedance/seed-2.0-lite", "byteplus");

		expect(ir.choices[0].message.content).toEqual([
			{ type: "reasoning_text", text: "Reasoning" },
			{ type: "text", text: "Answer" },
		]);
		expect(ir.usage).toMatchObject({ cachedInputTokens: 4, reasoningTokens: 6 });
	});

	it("preserves BytePlus Responses thinking controls through the IR", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "bytedance/seed-2.0-lite",
			input: "Hello",
			thinking: { type: "disabled" },
		} as any);

		expect(ir.reasoning).toEqual({ enabled: false });
	});
});
