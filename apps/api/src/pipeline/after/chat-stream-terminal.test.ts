import { describe, expect, it } from "vitest";
import { createChatStreamTerminal } from "./chat-stream-terminal";

const snapshot = (extra: Record<string, unknown> = {}) => ({
	id: "req_1",
	object: "chat.completion",
	created: 1,
	model: "m",
	nativeResponseId: "resp_up",
	choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "length" }],
	usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
	...extra,
});

describe("createChatStreamTerminal", () => {
	it("replaces the snapshot with a finish chunk and a usage chunk after streamed deltas", () => {
		const terminal = createChatStreamTerminal();
		const delta = { id: "req_1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }] };
		expect(terminal.expand(delta)).toEqual([delta]);
		const out = terminal.expand(snapshot());
		expect(out).toEqual([
			{ object: "chat.completion.chunk", id: "req_1", created: 1, model: "m", nativeResponseId: "resp_up", choices: [{ index: 0, delta: {}, finish_reason: "length" }] },
			{ object: "chat.completion.chunk", id: "req_1", created: 1, model: "m", nativeResponseId: "resp_up", choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
		]);
	});

	it("streams the snapshot content when no delta carried it", () => {
		const out = createChatStreamTerminal().expand(snapshot({
			choices: [{
				index: 0,
				message: { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "f", arguments: "{}" } }] },
				finish_reason: "tool_calls",
			}],
		}));
		expect(out.map((chunk) => chunk.object)).toEqual(["chat.completion.chunk", "chat.completion.chunk", "chat.completion.chunk"]);
		expect(out[0].choices[0].delta).toEqual({
			role: "assistant",
			tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "f", arguments: "{}" } }],
		});
		expect(out[1].choices[0].finish_reason).toBe("tool_calls");
	});

	it("does not repeat a finish_reason or usage the stream already sent, and keeps gateway fields", () => {
		const terminal = createChatStreamTerminal();
		terminal.expand({ object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: "stop" }] });
		terminal.expand({ object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 3 } });
		const out = terminal.expand(snapshot({ meta: { routing: {} } }));
		expect(out).toEqual([
			{ object: "chat.completion.chunk", id: "req_1", created: 1, model: "m", nativeResponseId: "resp_up", choices: [], meta: { routing: {} } },
		]);
		expect(createChatStreamTerminal().expand(snapshot()).flatMap((chunk) => chunk.choices.map((choice: any) => choice.finish_reason)).filter(Boolean)).toEqual(["length"]);
	});
});
