import { describe, expect, it } from "vitest";
import { encodeUnifiedStreamEvent } from "./encode";

describe("encodeUnifiedStreamEvent", () => {
	it("encodes output text delta for openai chat completions", () => {
		const encoded = encodeUnifiedStreamEvent(
			"openai.chat.completions",
			{
				type: "delta_text",
				channel: "output_text",
				text: "hello",
				choiceIndex: 1,
			},
			{ requestId: "req_1", model: "gpt-test" },
		);

		expect(encoded?.eventName).toBeUndefined();
		expect(encoded?.frame.object).toBe("chat.completion.chunk");
		expect(encoded?.frame.choices?.[0]?.index).toBe(1);
		expect(encoded?.frame.choices?.[0]?.delta?.content).toBe("hello");
	});

	it("encodes tool argument delta for openai responses", () => {
		const encoded = encodeUnifiedStreamEvent(
			"openai.responses",
			{
				type: "delta_tool",
				toolCallId: "call_1",
				toolName: "lookup",
				argumentsDelta: "{\"q\":\"x\"",
				choiceIndex: 0,
			},
			{ requestId: "resp_1", model: "gpt-test" },
		);

		expect(encoded?.eventName).toBe("response.function_call_arguments.delta");
		expect(encoded?.frame.item_id).toBe("call_1");
		expect(encoded?.frame.name).toBe("lookup");
		expect(encoded?.frame.delta).toBe("{\"q\":\"x\"");
	});

	it("maps stop reason to anthropic message delta format", () => {
		const encoded = encodeUnifiedStreamEvent(
			"anthropic.messages",
			{
				type: "stop",
				finishReason: "tool_calls",
			},
			{ requestId: "msg_1", model: "claude-test" },
		);

		expect(encoded?.eventName).toBe("message_delta");
		expect(encoded?.frame.type).toBe("message_delta");
		expect(encoded?.frame.delta?.stop_reason).toBe("tool_use");
	});

	it("encodes usage as response.completed for openai responses", () => {
		const encoded = encodeUnifiedStreamEvent(
			"openai.responses",
			{
				type: "usage",
				usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 },
			},
			{ requestId: "resp_2", model: "gpt-test" },
		);

		expect(encoded?.eventName).toBe("response.completed");
		expect(encoded?.frame.response?.status).toBe("completed");
		expect(encoded?.frame.response?.usage?.total_tokens).toBe(5);
	});
});

