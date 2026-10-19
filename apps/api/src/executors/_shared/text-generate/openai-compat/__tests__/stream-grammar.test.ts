// Responses stream grammar for executor-built streams (AUDIT N26).
import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../../../../anthropic/text-generate/stream-transformer";
import { accumulateResponsesStream, itemLifecycle } from "../../../../../pipeline/after/__tests__/responses-stream-accumulator";

type Frame = { event?: string; data: any };

function sseResponse(frames: Frame[]): Response {
	return new Response(
		frames.map((frame) => `${frame.event ? `event: ${frame.event}\n` : ""}data: ${JSON.stringify(frame.data)}\n\n`).join(""),
		{ headers: { "Content-Type": "text/event-stream" } },
	);
}

function parse(text: string): Array<{ event: string; data: any }> {
	return text.split(/\n\n/).filter((block) => block.trim()).map((block) => {
		const lines = block.split("\n");
		return {
			event: lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "",
			data: JSON.parse(lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("")),
		};
	});
}

/** The documented Responses stream order (see the simulator's stream-order check). */
function expectResponsesGrammar(frames: Array<{ event: string; data: any }>) {
	expect(frames[0].event).toBe("response.created");
	const terminals = frames.filter((frame) => /^response\.(completed|incomplete|failed)$/.test(frame.event));
	expect(terminals).toHaveLength(1);
	expect(frames[frames.length - 1]).toBe(terminals[0]);
	const added = new Set<number>();
	for (const frame of frames) {
		if (frame.event === "response.output_item.added") added.add(frame.data.output_index);
		if (frame.event.endsWith(".delta")) expect(added.has(frame.data.output_index)).toBe(true);
	}
}

function args(providerId: string): any {
	return {
		ir: { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], model: "m", stream: true },
		requestId: "req_grammar",
		workspaceId: "team_test",
		providerId,
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	};
}

const anthropic = (stopReason: string): Frame[] => [
	{ event: "message_start", data: { type: "message_start", message: { id: "msg_up", role: "assistant", content: [], usage: { input_tokens: 5, output_tokens: 1 } } } },
	{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
	{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Hmm" } } },
	{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
	{ event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
	{ event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello" } } },
	{ event: "content_block_stop", data: { type: "content_block_stop", index: 1 } },
	{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: 4 } } },
	{ event: "message_stop", data: { type: "message_stop" } },
];

describe("Responses stream grammar", () => {
	it.each(["end_turn", "max_tokens"])("Claude upstream (%s) announces each item before its deltas", async (stopReason) => {
		const stream = sseResponse(anthropic(stopReason)).body!.pipeThrough(createAnthropicToResponsesStreamTransformer("req_grammar", "claude"));
		const frames = parse(await new Response(resolveStreamForProtocol(new Response(stream), args("anthropic"), "responses", { canonicalResponsesEvents: true })).text());
		expectResponsesGrammar(frames);
		expect(frames[frames.length - 1].event).toBe(stopReason === "max_tokens" ? "response.incomplete" : "response.completed");
		const textDone = frames.find((frame) => frame.event === "response.output_item.done" && frame.data.item.type === "message");
		expect(textDone?.data.item.content).toEqual([{ type: "output_text", text: "Hello", annotations: [] }]);
	});

	it.each(["stop", "length"])("Chat upstream (%s) announces each item before its deltas", async (finish) => {
		const upstream = sseResponse([
			{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "Hmm" }, finish_reason: null }] } },
			{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }] } },
			{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } } },
		]);
		const frames = parse(await new Response(resolveStreamForProtocol(upstream, args("mistral"), "chat")).text());
		expectResponsesGrammar(frames);
		const terminal = frames[frames.length - 1];
		expect(terminal.event).toBe(finish === "length" ? "response.incomplete" : "response.completed");
		expect(terminal.data.response.status).toBe(finish === "length" ? "incomplete" : "completed");
	});

	const chatWithEveryItem = () => sseResponse([
		{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "Hm" }, finish_reason: null }] } },
		{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { reasoning_content: "m" }, finish_reason: null }] } },
		{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { content: "Hel" }, finish_reason: null }] } },
		{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { content: "lo" }, finish_reason: null }] } },
		{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "f", arguments: "{\"a\":1}" } }] }, finish_reason: null }] } },
		{ data: { id: "c", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } } },
	]);
	const chatToResponsesFrames = async () =>
		parse(await new Response(resolveStreamForProtocol(chatWithEveryItem(), args("mistral"), "chat")).text());

	// CodeRabbit on #2992: the OpenAI SDK helper builds its snapshot from
	// response.created.response and pushes each output_item.added item into its output.
	it("Chat upstream response.created carries the snapshot the SDK helper starts from", async () => {
		const frames = await chatToResponsesFrames();
		expect(frames[0].event).toBe("response.created");
		// The id matches the terminal response's: the helper rejects a changed id.
		expect(frames[0].data.response).toMatchObject({ id: "req_grammar", object: "response", status: "in_progress", output: [] });
		expect(frames.at(-1)?.data.response.id).toBe("req_grammar");
	});

	// CodeRabbit on #2992: message and reasoning items were announced but never closed.
	it("Chat upstream closes every announced item before tool calls and the terminal", async () => {
		const frames = await chatToResponsesFrames();
		expectResponsesGrammar(frames);
		expect(itemLifecycle(frames)).toEqual([
			{ index: 0, type: "reasoning", added: true, done: true },
			{ index: 1, type: "message", added: true, done: true },
			{ index: 2, type: "function_call", added: true, done: true },
		]);
		const names = frames.map((frame) => frame.event);
		const doneAt = (type: string) => frames.findIndex((frame) => frame.event === "response.output_item.done" && frame.data.item.type === type);
		expect(doneAt("reasoning")).toBeLessThan(names.indexOf("response.function_call_arguments.done"));
		expect(doneAt("message")).toBeLessThan(names.indexOf("response.function_call_arguments.done"));
		expect(frames.find((frame) => frame.event === "response.output_text.done")?.data).toMatchObject({ item_id: "msg_req_grammar_0", content_index: 0, text: "Hello" });
		expect(frames.find((frame) => frame.event === "response.reasoning_text.done")?.data).toMatchObject({ item_id: "reasoning_req_grammar_0", content_index: 0, text: "Hmm" });
		expect(frames.find((frame) => frame.event === "response.content_part.done" && frame.data.part.type === "output_text")?.data.part.text).toBe("Hello");
	});

	it("Chat upstream gives a stream the SDK helper accumulates into the final output", async () => {
		const frames = await chatToResponsesFrames();
		const { finalResponse, streamed } = accumulateResponsesStream(frames);
		expect(streamed.output).toMatchObject([
			{ type: "reasoning", id: "reasoning_req_grammar_0", status: "completed", content: [{ type: "reasoning_text", text: "Hmm" }] },
			{ type: "message", id: "msg_req_grammar_0", status: "completed", content: [{ type: "output_text", text: "Hello" }] },
			{ type: "function_call", call_id: "call_1", name: "f", arguments: "{\"a\":1}", status: "completed" },
		]);
		expect(finalResponse.output.map((item: any) => item.type)).toEqual(["reasoning", "message", "function_call"]);
		expect(itemLifecycle(frames).every((item) => item.added && item.done)).toBe(true);
	});
});
