// Responses stream grammar for executor-built streams (AUDIT N26).
import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../../../../anthropic/text-generate/stream-transformer";

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
});
