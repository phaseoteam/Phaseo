// Claude requests carry only what the client asked for: no adaptive thinking
// without reasoning settings, and array tool results as content blocks.
import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { decodeAnthropicMessagesRequest } from "../../../../protocols/anthropic-messages/decode";
import { decodeOpenAIChatRequest } from "../../../../protocols/openai-chat/decode";
import { irToAnthropicMessages } from "../index";

const PNG = "iVBORw0KGgo=";

function request(model: string, overrides: Partial<IRChatRequest> = {}): IRChatRequest {
	return {
		model,
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
		...overrides,
	} as IRChatRequest;
}

describe("Claude thinking", () => {
	it.each(["claude-opus-4-8", "claude-opus-5", "claude-sonnet-5", "claude-haiku-5-5"])("omits thinking on %s when the client asked for no reasoning", (model) => {
		const payload = irToAnthropicMessages(request(model));
		expect(payload).not.toHaveProperty("thinking");
		expect(payload.output_config?.effort).toBeUndefined();
	});

	it("still sends adaptive thinking with the client's effort", () => {
		const payload = irToAnthropicMessages(request("claude-opus-5", { reasoning: { effort: "high" } }));
		expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
		expect(payload.output_config).toMatchObject({ effort: "high" });
	});

	it("still disables thinking when the client turns it off", () => {
		const payload = irToAnthropicMessages(request("claude-sonnet-5", { reasoning: { enabled: false } }));
		expect(payload.thinking).toEqual({ type: "disabled" });
	});
});

describe("Claude tool results", () => {
	it("sends a Messages client's text and image tool result blocks and is_error", () => {
		const ir = decodeAnthropicMessagesRequest({
			model: "claude-opus-5",
			max_tokens: 1024,
			messages: [
				{ role: "user", content: "Search" },
				{ role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "search", input: {} }] },
				{
					role: "user",
					content: [{
						type: "tool_result",
						tool_use_id: "toolu_1",
						is_error: true,
						content: [
							{ type: "text", text: "search failed" },
							{ type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
						],
					}],
				},
			],
		} as any);
		const payload = irToAnthropicMessages(ir);
		const result = payload.messages[2].content[0];
		expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1", is_error: true });
		expect(result.content).toEqual([
			{ type: "text", text: "search failed" },
			{ type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
		]);
	});

	it("sends a Chat client's array tool result as text blocks, not a JSON string", () => {
		const ir = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-5",
			messages: [
				{ role: "user", content: "Search" },
				{ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "search", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "call_1", content: [{ type: "text", text: "hit" }] },
			],
		} as any);
		const payload = irToAnthropicMessages(ir);
		const result = payload.messages[2].content[0];
		expect(result.content).toEqual([{ type: "text", text: "hit" }]);
	});

	it("keeps a string tool result a string", () => {
		const ir = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-5",
			messages: [
				{ role: "user", content: "Search" },
				{ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "search", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "call_1", content: "hit" },
			],
		} as any);
		expect(irToAnthropicMessages(ir).messages[2].content[0].content).toBe("hit");
	});
});
