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

	it("joins tool names split across chunks", () => {
		const accumulator = createChatChunkAccumulator();
		accumulator.add(chunk([{ index: 0, delta: { tool_calls: [{ index: 0, id: "c", function: { name: "look", arguments: "{" } }] } }]));
		accumulator.add(chunk([{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "up", arguments: "}" } }] } }]));

		const call = (accumulator.toCompletion() as any).choices[0].message.tool_calls[0];
		expect(call.function).toEqual({ name: "lookup", arguments: "{}" });
	});

	it("caps text and images by UTF-8 size and marks the result", () => {
		const accumulator = createChatChunkAccumulator();
		const image = { type: "image_url", image_url: { url: `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}` } };
		accumulator.add(chunk([{ index: 0, delta: { images: [image] } }]));
		accumulator.add(chunk([{ index: 0, delta: { images: [image] } }]));
		// 3-byte characters: 1 MiB of them is 3 MiB of UTF-8, which no longer fits.
		accumulator.add(chunk([{ index: 0, delta: { content: "中".repeat(1024 * 1024) } }]));

		const completion = accumulator.toCompletion() as any;
		const message = completion.choices[0].message;
		expect(message.images).toHaveLength(1);
		expect(new TextEncoder().encode(message.content).length).toBeLessThanOrEqual(2 * 1024 * 1024);
		expect(message.content.length).toBeGreaterThan(0);
		expect(completion.gateway_log_truncated).toBe(true);
	});

	it("never splits a surrogate pair at the cap", () => {
		const accumulator = createChatChunkAccumulator();
		accumulator.add(chunk([{ index: 0, delta: { content: "a".repeat(5 * 1024 * 1024 - 2) } }]));
		accumulator.add(chunk([{ index: 0, delta: { content: "😀" } }]));

		const content = (accumulator.toCompletion() as any).choices[0].message.content as string;
		expect(content.endsWith("a")).toBe(true);
		expect(content.length).toBe(5 * 1024 * 1024 - 2);
	});
});
