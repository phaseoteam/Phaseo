// Citations, refusals and reasoning text reach every client surface, streamed and buffered.
import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { openAIChatToIR } from "../transform-chat";
import { createAnthropicToResponsesStreamTransformer } from "../../../../anthropic/text-generate/stream-transformer";
import { consumeTextProtocolStreamToIR } from "@pipeline/surfaces/server-tools.stream";
import { encodeProtocol } from "@protocols/index";
import { ANTHROPIC_REASONING_FORMAT, sealReasoningState } from "@core/reasoning-state";

type Frame = { event?: string; data: any } | "[DONE]";
type ClientProtocol = "openai.chat.completions" | "openai.responses" | "anthropic.messages";

const URL_1 = "https://example.com/cite-1";
const REFUSAL = "I can't help with that.";

function sse(frames: Frame[]): Response {
	const body = frames
		.map((frame) => (frame === "[DONE]" ? "data: [DONE]\n\n" : `${frame.event ? `event: ${frame.event}\n` : ""}data: ${JSON.stringify(frame.data)}\n\n`))
		.join("");
	return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

function parseFrames(text: string): Array<{ event: string | null; data: any }> {
	return text.split(/\n\n/).flatMap((block) => {
		const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? null;
		const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
		if (!data || data === "[DONE]") return [];
		return [{ event, data: JSON.parse(data) }];
	});
}

function args(protocol: ClientProtocol, providerId = "deepseek"): any {
	return {
		ir: { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }], model: "test-model", stream: true },
		requestId: "req_cite",
		workspaceId: "team_test",
		providerId,
		endpoint: protocol === "openai.responses" ? "responses" : protocol === "anthropic.messages" ? "messages" : "chat.completions",
		protocol,
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	};
}

const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
	data: { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1700000000, model: "test-model", choices: [{ index: 0, delta, finish_reason: null, ...extra }] },
});

function chatUpstream(options: { refusal?: boolean; lateCitation?: boolean } = {}): Frame[] {
	const annotation = { type: "url_citation", url_citation: { url: URL_1, title: "Cite one", start_index: 0, end_index: 5 } };
	const frames: Frame[] = [chunk({ role: "assistant", content: "" })];
	if (options.refusal) {
		frames.push(chunk({ refusal: REFUSAL }));
	} else {
		frames.push(chunk({ reasoning_content: "Thinking first." }), chunk({ content: "Hello world" }));
		if (!options.lateCitation) frames.push(chunk({ annotations: [annotation] }));
		frames.push(chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":1}" } }] }));
		// Gemini sends grounding with the last frame, after the tool calls.
		if (options.lateCitation) frames.push(chunk({ annotations: [annotation] }));
	}
	frames.push(chunk({}, { finish_reason: options.refusal ? "stop" : "tool_calls" }));
	frames.push({ data: { id: "chatcmpl-1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } } });
	frames.push("[DONE]");
	return frames;
}

function responsesUpstream(options: { refusal?: boolean } = {}): Frame[] {
	const annotation = { type: "url_citation", url: URL_1, title: "Cite one", start_index: 0, end_index: 5 };
	const content = options.refusal
		? [{ type: "refusal", refusal: REFUSAL }]
		: [{ type: "output_text", text: "Hello world", annotations: [annotation] }];
	const response = {
		id: "resp_1", object: "response", created_at: 1700000000, status: "completed", model: "test-model",
		output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content }],
		usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
	};
	const frames: Frame[] = [
		{ event: "response.created", data: { type: "response.created", response: { ...response, status: "in_progress", output: [] } } },
		{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1", role: "assistant", content: [] } } },
	];
	if (options.refusal) {
		frames.push({ event: "response.refusal.delta", data: { type: "response.refusal.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: REFUSAL } });
	} else {
		frames.push(
			{ event: "response.output_text.delta", data: { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: "Hello world" } },
			{ event: "response.output_text.annotation.added", data: { type: "response.output_text.annotation.added", item_id: "msg_1", output_index: 0, content_index: 0, annotation_index: 0, annotation } },
			{ event: "response.output_text.done", data: { type: "response.output_text.done", item_id: "msg_1", output_index: 0, content_index: 0, text: "Hello world" } },
		);
	}
	frames.push(
		{ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: 0, item: response.output[0] } },
		{ event: "response.completed", data: { type: "response.completed", response } },
	);
	return frames;
}

function claudeUpstream(): Frame[] {
	const citation = { type: "web_search_result_location", url: URL_1, title: "Cite one", cited_text: "source quote", encrypted_index: "enc_1" };
	const frames: Array<[string, any]> = [
		["message_start", { message: { id: "msg_claude", type: "message", role: "assistant", model: "claude", content: [], usage: { input_tokens: 3, output_tokens: 1 } } }],
		["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
		["content_block_delta", { index: 0, delta: { type: "citations_delta", citation } }],
		["content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hello world" } }],
		["content_block_stop", { index: 0 }],
		["message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }],
		["message_stop", {}],
	];
	return frames.map(([event, data]) => ({ event, data: { type: event, ...data } }));
}

async function clientStream(upstream: Frame[], protocol: ClientProtocol, route: "chat" | "responses", providerId?: string): Promise<string> {
	return await new Response(resolveStreamForProtocol(sse(upstream), args(protocol, providerId), route)).text();
}

async function claudeClientStream(protocol: ClientProtocol): Promise<string> {
	const responses = sse(claudeUpstream()).body!.pipeThrough(createAnthropicToResponsesStreamTransformer("req_cite", "claude", { providerId: "anthropic" }));
	return await new Response(resolveStreamForProtocol(new Response(responses), args(protocol, "anthropic"), "responses", { canonicalResponsesEvents: true })).text();
}

async function buffered(text: string, protocol: ClientProtocol): Promise<any> {
	const consumed = await consumeTextProtocolStreamToIR({
		protocol,
		stream: new Response(text).body!,
		requestId: "req_cite",
		model: "test-model",
		provider: "test",
	});
	return { ir: consumed.ir, raw: consumed.rawResponse, encoded: encodeProtocol(protocol, consumed.ir, "req_cite") as any };
}

function messagesGrammarHolds(frames: Array<{ data: any }>) {
	let open: number | null = null;
	for (const { data } of frames) {
		if (data.type === "content_block_start") {
			expect(open).toBeNull();
			open = data.index;
		} else if (data.type === "content_block_delta") {
			expect(data.index).toBe(open);
		} else if (data.type === "content_block_stop") {
			expect(data.index).toBe(open);
			open = null;
		}
	}
	expect(open).toBeNull();
}

describe("citations and refusals from a Chat upstream", () => {
	it("streams Responses annotation and refusal events and completes with them, reasoning and tool calls", async () => {
		const frames = parseFrames(await clientStream(chatUpstream(), "openai.responses", "chat"));
		const added = frames.find((frame) => frame.event === "response.output_text.annotation.added")?.data;
		expect(added).toMatchObject({ content_index: 0, annotation_index: 0, annotation: { type: "url_citation", url: URL_1, title: "Cite one", start_index: 0, end_index: 5 } });
		const completed = frames.find((frame) => frame.event === "response.completed")?.data.response;
		const message = completed.output.find((item: any) => item.type === "message");
		expect(message.content[0].annotations).toEqual([{ type: "url_citation", url: URL_1, title: "Cite one", start_index: 0, end_index: 5 }]);
		expect(completed.output.find((item: any) => item.type === "reasoning")?.content?.[0]?.text).toBe("Thinking first.");
		expect(completed.output.find((item: any) => item.type === "function_call")).toMatchObject({ call_id: "call_1", arguments: "{\"q\":1}" });

		const refusalFrames = parseFrames(await clientStream(chatUpstream({ refusal: true }), "openai.responses", "chat"));
		const refusalEvents = refusalFrames.map((frame) => frame.event);
		expect(refusalEvents.indexOf("response.output_item.added")).toBeLessThan(refusalEvents.indexOf("response.refusal.delta"));
		expect(refusalFrames.find((frame) => frame.event === "response.refusal.delta")?.data.delta).toBe(REFUSAL);
		const refusalMessage = refusalFrames.find((frame) => frame.event === "response.completed")?.data.response.output[0];
		expect(refusalMessage.content).toEqual([{ type: "refusal", refusal: REFUSAL }]);
	});

	it("streams Messages citations on the text block and refusal text as text", async () => {
		const text = await clientStream(chatUpstream(), "anthropic.messages", "chat");
		const frames = parseFrames(text);
		messagesGrammarHolds(frames);
		const textBlock = frames.find((frame) => frame.data.type === "content_block_start" && frame.data.content_block.type === "text")!.data.index;
		const citation = frames.find((frame) => frame.data.delta?.type === "citations_delta");
		expect(citation?.data).toMatchObject({ index: textBlock, delta: { citation: { type: "web_search_result_location", url: URL_1, title: "Cite one", cited_text: "Hello" } } });

		const refusal = parseFrames(await clientStream(chatUpstream({ refusal: true }), "anthropic.messages", "chat"));
		expect(refusal.some((frame) => frame.data.delta?.type === "text_delta" && frame.data.delta.text === REFUSAL)).toBe(true);
	});

	it("puts citations that arrive after the text block closed on their own block at the end", async () => {
		const frames = parseFrames(await clientStream(chatUpstream({ lateCitation: true }), "anthropic.messages", "chat"));
		messagesGrammarHolds(frames);
		const citation = frames.find((frame) => frame.data.delta?.type === "citations_delta")!;
		const toolBlock = frames.find((frame) => frame.data.content_block?.type === "tool_use")!.data.index;
		expect(citation.data.index).toBeGreaterThan(toolBlock);
		expect(frames.findIndex((frame) => frame.data === citation.data)).toBeLessThan(frames.findIndex((frame) => frame.data.type === "message_delta"));
	});

	it("materialises buffered Chat and Messages responses with the citations and refusal", async () => {
		const chat = await buffered(await clientStream(chatUpstream(), "openai.chat.completions", "chat"), "openai.chat.completions");
		expect(chat.encoded.choices[0].message.annotations).toEqual([
			{ type: "url_citation", url_citation: { url: URL_1, title: "Cite one", start_index: 0, end_index: 5 } },
		]);
		const chatRefusal = await buffered(await clientStream(chatUpstream({ refusal: true }), "openai.chat.completions", "chat"), "openai.chat.completions");
		expect(chatRefusal.encoded.choices[0].message.refusal).toBe(REFUSAL);

		const messages = await buffered(await clientStream(chatUpstream(), "anthropic.messages", "chat"), "anthropic.messages");
		const textBlock = messages.encoded.content.find((block: any) => block.type === "text");
		expect(textBlock.citations).toEqual([{ type: "web_search_result_location", url: URL_1, title: "Cite one", cited_text: "Hello" }]);
	});
});

describe("citations and refusals from a Responses upstream", () => {
	it("streams Chat annotation and refusal deltas and a final message with both", async () => {
		const frames = parseFrames(await clientStream(responsesUpstream(), "openai.chat.completions", "responses"));
		const deltas = frames.flatMap((frame) => frame.data.choices ?? []).map((choice: any) => choice.delta ?? {});
		expect(deltas.find((delta) => delta.annotations)?.annotations).toEqual([
			{ type: "url_citation", url_citation: { url: URL_1, title: "Cite one", start_index: 0, end_index: 5 } },
		]);
		const refusalDeltas = parseFrames(await clientStream(responsesUpstream({ refusal: true }), "openai.chat.completions", "responses"))
			.flatMap((frame) => frame.data.choices ?? [])
			.map((choice: any) => choice.delta?.refusal)
			.filter(Boolean);
		expect(refusalDeltas.join("")).toBe(REFUSAL);
	});

	it("streams Messages citations and keeps them when buffered", async () => {
		const text = await clientStream(responsesUpstream(), "anthropic.messages", "responses");
		messagesGrammarHolds(parseFrames(text));
		expect(text).toContain("\"citations_delta\"");
		const messages = await buffered(text, "anthropic.messages");
		expect(messages.encoded.content[0].citations?.[0]).toMatchObject({ type: "web_search_result_location", url: URL_1 });

		const chat = await buffered(await clientStream(responsesUpstream(), "openai.chat.completions", "responses"), "openai.chat.completions");
		expect(chat.encoded.choices[0].message.annotations).toHaveLength(1);
		const chatRefusal = await buffered(await clientStream(responsesUpstream({ refusal: true }), "openai.chat.completions", "responses"), "openai.chat.completions");
		expect(chatRefusal.encoded.choices[0].message.refusal).toBe(REFUSAL);
	});
});

describe("citations from Claude", () => {
	it("turns citations_delta into Responses annotations, streamed and in the completed response", async () => {
		const frames = parseFrames(await claudeClientStream("openai.responses"));
		expect(frames.find((frame) => frame.event === "response.output_text.annotation.added")?.data.annotation)
			.toEqual({ type: "url_citation", url: URL_1, title: "Cite one" });
		const completed = frames.find((frame) => frame.event === "response.completed")!.data.response;
		expect(completed.output[0].content[0].annotations).toEqual([
			{ type: "url_citation", url: URL_1, title: "Cite one", start_index: 0, end_index: "Hello world".length },
		]);
	});

	it("reaches Chat clients streamed and buffered", async () => {
		const text = await claudeClientStream("openai.chat.completions");
		expect(text).toContain(URL_1);
		const chat = await buffered(text, "openai.chat.completions");
		expect(chat.encoded.choices[0].message.annotations[0]).toMatchObject({ type: "url_citation", url_citation: { url: URL_1 } });
	});
});

describe("openAIChatToIR", () => {
	it("keeps plain reasoning_content, annotations and refusal", () => {
		const ir = openAIChatToIR({
			id: "chatcmpl-1",
			choices: [{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: "Hello world",
					reasoning_content: "Thinking first.",
					refusal: "Partly refused.",
					annotations: [{ type: "url_citation", url_citation: { url: URL_1, start_index: 0, end_index: 5 } }],
				},
			}],
		}, "req_cite", "test-model", "deepseek");
		expect(ir.choices[0].message.content).toEqual([
			{ type: "reasoning_text", text: "Thinking first." },
			{ type: "text", text: "Hello world", annotations: [{ type: "url_citation", url: URL_1, start_index: 0, end_index: 5 }] },
		]);
		expect(ir.choices[0].message.refusal).toBe("Partly refused.");
	});

	it("does not repeat reasoning that a signed detail also carries", () => {
		const signature = sealReasoningState({ format: ANTHROPIC_REASONING_FORMAT, kind: "signature", value: "sig_1", model: "claude", provider: "anthropic" });
		const ir = openAIChatToIR({
			id: "chatcmpl-1",
			choices: [{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: "Hi",
					reasoning_content: "Same text.",
					reasoning_details: [{ type: "reasoning.text", text: "Same text.", signature, format: ANTHROPIC_REASONING_FORMAT }],
				},
			}],
		}, "req_cite", "test-model", "deepseek");
		const reasoning = ir.choices[0].message.content.filter((part) => part.type === "reasoning_text");
		expect(reasoning).toHaveLength(1);
		expect(reasoning[0]).toMatchObject({ text: "Same text.", reasoningFormat: ANTHROPIC_REASONING_FORMAT });
	});
});

describe("tool calls in the Responses snapshot", () => {
	it("keeps streamed tool calls when a provider quirk adds a partial message to the last chunk", async () => {
		// Z.ai's stream quirk attaches message.reasoning_content to the finishing chunk.
		const frames = parseFrames(await clientStream(chatUpstream(), "openai.responses", "chat", "z-ai"));
		const completed = frames.find((frame) => frame.event === "response.completed")!.data.response;
		expect(completed.output.find((item: any) => item.type === "function_call")).toMatchObject({ call_id: "call_1", name: "lookup" });
	});
});
