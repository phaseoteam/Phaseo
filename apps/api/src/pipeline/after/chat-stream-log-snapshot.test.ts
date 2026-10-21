import { describe, expect, it } from "vitest";
import { createChatChunkAccumulator, resolveChatStreamAuditResponse } from "./chat-stream-log-snapshot";

const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) => ({
	id: "chatcmpl_1",
	object: "chat.completion.chunk",
	created: 1,
	model: "openai/gpt-5-mini",
	choices,
	...extra,
});

describe("chat stream audit snapshot", () => {
	it("assembles text, reasoning, tool calls and usage from chunks", () => {
		const accumulator = createChatChunkAccumulator();
		accumulator.add(chunk([{ index: 0, delta: { role: "assistant", reasoning_content: "Think" } }]));
		accumulator.add(chunk([{ index: 0, delta: { reasoning_content: "ing." } }]));
		accumulator.add(chunk([{ index: 0, delta: { content: "Hello" } }]));
		accumulator.add(chunk([{ index: 0, delta: { content: " world" } }]));
		accumulator.add(chunk([{
			index: 0,
			delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":" } }] },
		}]));
		accumulator.add(chunk([{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "\"x\"}" } }] } }]));
		accumulator.add(chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }]));
		accumulator.add(chunk([], { usage: { prompt_tokens: 3, completion_tokens: 5 } }));

		expect(accumulator.toCompletion()).toEqual({
			id: "chatcmpl_1",
			created: 1,
			model: "openai/gpt-5-mini",
			object: "chat.completion",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: "Hello world",
					reasoning_content: "Thinking.",
					tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":\"x\"}" } }],
				},
				finish_reason: "tool_calls",
			}],
			usage: { prompt_tokens: 3, completion_tokens: 5 },
		});
	});

	it("keeps a full final snapshot over the assembled chunks", () => {
		const accumulator = createChatChunkAccumulator();
		accumulator.add(chunk([{ index: 0, delta: { content: "partial" } }]));
		const snapshot = { object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "full" } }] };

		expect(resolveChatStreamAuditResponse(snapshot, accumulator)).toBe(snapshot);
	});

	it("replaces a terminal chunk standing in for the snapshot", () => {
		const accumulator = createChatChunkAccumulator();
		const terminal = chunk([{ index: 0, delta: {}, finish_reason: "stop" }]);
		accumulator.add(chunk([{ index: 0, delta: { content: "Hi" } }]));
		accumulator.add(terminal);

		const resolved = resolveChatStreamAuditResponse(terminal, accumulator) as any;
		expect(resolved.object).toBe("chat.completion");
		expect(resolved.choices[0].message.content).toBe("Hi");
		expect(resolved.choices[0].finish_reason).toBe("stop");
	});

	it("leaves the snapshot alone when no chunks were seen", () => {
		const accumulator = createChatChunkAccumulator();
		accumulator.add({ type: "response.completed" });

		expect(resolveChatStreamAuditResponse(null, accumulator)).toBeNull();
	});

	it("uses null content for a tool-call-only message", () => {
		const accumulator = createChatChunkAccumulator();
		accumulator.add(chunk([{ index: 0, delta: { tool_calls: [{ index: 0, id: "c", function: { name: "f", arguments: "{}" } }] } }]));

		const message = (accumulator.toCompletion() as any).choices[0].message;
		expect(message.content).toBeNull();
		expect(message.tool_calls).toHaveLength(1);
	});
});
