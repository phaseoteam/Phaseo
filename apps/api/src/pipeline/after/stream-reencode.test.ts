import { describe, expect, it } from "vitest";
import { createStreamReencoder, toMessagesUsage } from "./stream-reencode";
import { extractUnifiedStreamEvents } from "./stream-events";
import { normalizeAnthropicUsage } from "./payload";
import { accumulateResponsesStream, itemLifecycle } from "./__tests__/responses-stream-accumulator";

type Source = { event?: string; data: any };

function reencode(target: "anthropic.messages" | "openai.responses" | "openai.chat.completions", frames: Source[], completed = true) {
	const reencoder = createStreamReencoder(target, { requestId: "req_1", model: "m" });
	const out = [];
	for (const frame of frames) {
		const events = extractUnifiedStreamEvents({ protocol: target, eventName: frame.event ?? null, frame: frame.data });
		out.push(...reencoder.encode(events, { eventName: frame.event ?? null, frame: frame.data }));
	}
	out.push(...reencoder.flush({ completed }));
	return out;
}

function chatChunk(delta: Record<string, unknown>, finishReason: string | null = null): Source {
	return { data: { object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finishReason }] } };
}

function toolFragment(index: number, args: string, start?: { id: string; name: string }): Source {
	return chatChunk({
		tool_calls: [{ index, ...(start ? { id: start.id, type: "function" } : {}), function: { ...(start ? { name: start.name } : {}), arguments: args } }],
	});
}

/** Messages grammar: one open block at a time, deltas only for the open block, each block started and stopped once. */
function expectValidMessagesGrammar(out: Array<{ frame: any }>) {
	let open: number | null = null;
	const started: number[] = [];
	const stopped: number[] = [];
	for (const { frame } of out) {
		if (frame.type === "content_block_start") {
			expect(open).toBeNull();
			expect(started).not.toContain(frame.index);
			started.push(frame.index);
			open = frame.index;
		} else if (frame.type === "content_block_delta") {
			expect(frame.index).toBe(open);
		} else if (frame.type === "content_block_stop") {
			expect(frame.index).toBe(open);
			stopped.push(frame.index);
			open = null;
		} else if (frame.type === "message_delta" || frame.type === "message_stop") {
			expect(open).toBeNull();
		}
	}
	expect(stopped).toEqual(started);
}

/** Each tool_use block's arguments, joined from its input_json_delta fragments, by tool name. */
function toolArguments(out: Array<{ frame: any }>): Record<string, string> {
	const names = new Map<number, string>();
	const args: Record<string, string> = {};
	for (const { frame } of out) {
		if (frame.type === "content_block_start" && frame.content_block?.type === "tool_use") {
			names.set(frame.index, frame.content_block.name);
			args[frame.content_block.name] = "";
		}
		if (frame.type === "content_block_delta" && frame.delta?.type === "input_json_delta") {
			args[names.get(frame.index)!] += frame.delta.partial_json;
		}
	}
	return args;
}

const responsesSource: Source[] = [
	{ event: "response.created", data: { type: "response.created", response: { id: "r", object: "response", status: "in_progress" } } },
	{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "m1", content: [{ type: "output_text", text: "Hi" }] } } },
	{ event: "response.output_text.delta", data: { type: "response.output_text.delta", output_index: 0, item_id: "m1", delta: "Hi" } },
	{ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: 1, item: { type: "reasoning", id: "rs1", content: [{ type: "output_text", text: "Because." }] } } },
	{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 2, item: { type: "function_call", id: "fc1", call_id: "call_1", name: "f", arguments: "{\"a\":1}" } } },
	{ event: "response.function_call_arguments.delta", data: { type: "response.function_call_arguments.delta", item_id: "fc1", call_id: "call_1", name: "f", delta: "{\"a\":1}" } },
	{ event: "response.function_call_arguments.done", data: { type: "response.function_call_arguments.done", item_id: "fc1", call_id: "call_1", name: "f", arguments: "{\"a\":1}" } },
	{ event: "response.completed", data: { type: "response.completed", response: { id: "r", object: "response", status: "completed", output: [{ type: "function_call", id: "fc1", call_id: "call_1", name: "f", arguments: "{\"a\":1}" }], usage: { input_tokens: 4, output_tokens: 2 } } } },
];

describe("createStreamReencoder", () => {
	it("gives Messages clients blocks, one message_delta with usage, and message_stop last", () => {
		const out = reencode("anthropic.messages", responsesSource);
		expect(out.map((frame) => frame.frame.type)).toEqual([
			"message_start",
			"content_block_start", "content_block_delta", "content_block_stop",
			"content_block_start", "content_block_delta", "content_block_stop",
			"content_block_start", "content_block_delta", "content_block_stop",
			"message_delta",
			"message_stop",
		]);
		expect(out[5].frame.delta).toEqual({ type: "thinking_delta", thinking: "Because." });
		const toolDeltas = out.filter((frame) => frame.frame.delta?.type === "input_json_delta");
		expect(toolDeltas.map((frame) => frame.frame.delta.partial_json)).toEqual(["{\"a\":1}"]);
		expect(out[10].frame).toMatchObject({ delta: { stop_reason: "tool_use" }, usage: { input_tokens: 4, output_tokens: 2 } });
		expect(out.some((frame) => String(frame.frame.type).startsWith("response."))).toBe(false);
	});

	it("gives Responses clients output_item.added before deltas and one terminal with trailing usage", () => {
		const out = reencode("openai.responses", [
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }] } },
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "length" }] } },
			{ data: { object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } } },
		]);
		expect(out.map((frame) => frame.eventName)).toEqual([
			"response.created",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.incomplete",
		]);
		expect(out.at(-1)!.frame.response).toMatchObject({
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
			usage: { prompt_tokens: 4, completion_tokens: 2 },
		});
	});

	// CodeRabbit on #2992: the message item had no content part, deltas no content_index,
	// nothing was closed and the terminal response had no output, so the OpenAI SDK's
	// responses.stream() helper threw and finalResponse().output was empty.
	it("gives Responses clients a stream the SDK helper accumulates into the final output", () => {
		const out = reencode("openai.responses", [
			chatChunk({ role: "assistant", reasoning_content: "Think" }),
			chatChunk({ reasoning_content: "ing." }),
			chatChunk({ content: "Hel" }),
			chatChunk({ content: "lo" }),
			toolFragment(0, "{\"city\":", { id: "call_a", name: "weather" }),
			toolFragment(0, "\"Paris\"}"),
			chatChunk({}, "tool_calls"),
			{ data: { object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } } },
		]);
		const frames = out.map((frame) => ({ event: String(frame.eventName), data: frame.frame }));
		const { finalResponse, streamed } = accumulateResponsesStream(frames);
		const expectedOutput = [
			{ type: "reasoning", content: [{ type: "reasoning_text", text: "Thinking." }] },
			{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Hello", annotations: [] }] },
			{ type: "function_call", call_id: "call_a", name: "weather", arguments: "{\"city\":\"Paris\"}", status: "completed" },
		];
		expect(finalResponse.output).toMatchObject(expectedOutput);
		expect(streamed.output).toMatchObject(expectedOutput);
		expect(itemLifecycle(frames)).toEqual([
			{ index: 0, type: "reasoning", added: true, done: true },
			{ index: 1, type: "message", added: true, done: true },
			{ index: 2, type: "function_call", added: true, done: true },
		]);
		expect(frames.find((frame) => frame.event === "response.function_call_arguments.done")?.data)
			.toMatchObject({ output_index: 2, name: "weather", arguments: "{\"city\":\"Paris\"}" });
		// Every item is closed before the one terminal event.
		const terminalIndex = frames.findIndex((frame) => frame.event === "response.completed");
		expect(terminalIndex).toBe(frames.length - 1);
	});

	// CodeRabbit on #2992: Chat usage reached Messages clients unconverted (prompt_tokens,
	// completion_tokens), so input_tokens and output_tokens came out as zero.
	it("gives Messages clients Chat usage in Messages terms, cache reads beside input", () => {
		const out = reencode("anthropic.messages", [
			chatChunk({ role: "assistant", content: "Hi" }),
			chatChunk({}, "stop"),
			{
				data: {
					object: "chat.completion.chunk",
					choices: [],
					usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 4 } },
				},
			},
		]);
		const usage = out.find((frame) => frame.frame.type === "message_delta")?.frame.usage;
		expect(usage).toEqual({ input_tokens: 6, output_tokens: 5, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 });
		// The after-stage Messages normaliser (stream.ts rewriteFrame) keeps these counts.
		expect(normalizeAnthropicUsage(usage)).toMatchObject({ input_tokens: 6, output_tokens: 5, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 });
	});

	it("maps Chat cache writes out of Messages input_tokens", () => {
		expect(toMessagesUsage({ prompt_tokens: 100, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 30, cache_write_tokens: 50 } }))
			.toEqual({ input_tokens: 20, output_tokens: 7, cache_read_input_tokens: 30, cache_creation_input_tokens: 50 });
		expect(toMessagesUsage({ prompt_tokens: 9, completion_tokens: 1 }))
			.toEqual({ input_tokens: 9, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
	});

	it("drops the foreign snapshot and keeps one finish_reason for Chat clients", () => {
		const out = reencode("openai.chat.completions", responsesSource);
		expect(out.every((frame) => frame.frame.object === "chat.completion.chunk")).toBe(true);
		const finishes = out.flatMap((frame) => (frame.frame.choices ?? []).map((choice: any) => choice.finish_reason)).filter(Boolean);
		expect(finishes).toEqual(["tool_calls"]);
	});

	it("gives Messages clients every fragment of parallel tool calls a Chat source interleaves", () => {
		const out = reencode("anthropic.messages", [
			chatChunk({ role: "assistant", content: "Checking." }),
			toolFragment(0, "{\"city\":", { id: "call_a", name: "weather" }),
			toolFragment(1, "{\"zone\":", { id: "call_b", name: "time" }),
			toolFragment(0, "\"Paris\"}"),
			toolFragment(1, "\"CET\"}"),
			chatChunk({}, "tool_calls"),
			{ data: { object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 5, completion_tokens: 9 } } },
		]);
		expectValidMessagesGrammar(out);
		expect(toolArguments(out)).toEqual({ weather: "{\"city\":\"Paris\"}", time: "{\"zone\":\"CET\"}" });
		const blocks = out.filter((frame) => frame.frame.type === "content_block_start").map((frame) => frame.frame.content_block.type);
		expect(blocks).toEqual(["text", "tool_use", "tool_use"]);
		expect(out.at(-2)?.frame).toMatchObject({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 5, output_tokens: 9 } });
		expect(out.at(-1)?.frame.type).toBe("message_stop");
	});

	it("keeps text that arrives while a tool call is open after that call", () => {
		const out = reencode("anthropic.messages", [
			toolFragment(0, "{\"a\":", { id: "call_a", name: "f" }),
			chatChunk({ content: "Done." }),
			toolFragment(0, "1}"),
			chatChunk({}, "tool_calls"),
		]);
		expectValidMessagesGrammar(out);
		expect(toolArguments(out)).toEqual({ f: "{\"a\":1}" });
		const blocks = out.filter((frame) => frame.frame.type === "content_block_start").map((frame) => frame.frame.content_block.type);
		expect(blocks).toEqual(["tool_use", "text"]);
		expect(out.find((frame) => frame.frame.delta?.type === "text_delta")?.frame.delta.text).toBe("Done.");
		expect(out.at(-1)?.frame.type).toBe("message_stop");
	});

	it.each(["anthropic.messages", "openai.responses"] as const)("does not finish a %s stream whose source ended without a stop", (target) => {
		const out = reencode(target, [chatChunk({ content: "Partial" })], false);
		const names = out.map((frame) => frame.eventName ?? frame.frame.type);
		expect(names).not.toContain("message_delta");
		expect(names).not.toContain("message_stop");
		expect(names).not.toContain("response.completed");
	});
});
