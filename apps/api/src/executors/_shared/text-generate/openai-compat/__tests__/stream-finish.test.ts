// Finish reasons and terminal events across stream dialects (AUDIT N5, N6).
import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../../../../anthropic/text-generate/stream-transformer";
import { consumeTextProtocolStreamToIR } from "@pipeline/surfaces/server-tools.stream";
import { encodeProtocol } from "@protocols/index";
import { GATEWAY_STOP_KEY } from "@core/finish-reason";

type Frame = { event?: string; data: any };
type ClientProtocol = "openai.chat.completions" | "openai.responses" | "anthropic.messages";

function sse(frames: Frame[]): string {
	return frames.map((frame) => `${frame.event ? `event: ${frame.event}\n` : ""}data: ${JSON.stringify(frame.data)}\n\n`).join("");
}

function sseResponse(frames: Frame[]): Response {
	return new Response(sse(frames), { headers: { "Content-Type": "text/event-stream" } });
}

function parseFrames(text: string): Array<{ event?: string; data: any }> {
	const out: Array<{ event?: string; data: any }> = [];
	for (const block of text.split(/\n\n/)) {
		if (!block.trim()) continue;
		const lines = block.split(/\r?\n/);
		const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
		const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
		if (!data || data === "[DONE]") continue;
		out.push({ event, data: JSON.parse(data) });
	}
	return out;
}

function args(protocol: ClientProtocol, providerId = "groq"): any {
	return {
		ir: { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], model: "test-model", stream: true },
		requestId: "req_finish",
		workspaceId: "team_test",
		providerId,
		endpoint: protocol === "openai.chat.completions" ? "chat.completions" : protocol === "openai.responses" ? "responses" : "messages",
		protocol,
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	};
}

const RESPONSES_USAGE = { input_tokens: 120, output_tokens: 16, total_tokens: 136 };

/** A Responses-dialect upstream (Groq, DeepSeek, ...) that stops early. */
function responsesIncomplete(reason: "max_output_tokens" | "content_filter"): Frame[] {
	const item = { id: "msg_1", type: "message", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: "Partial", annotations: [] }] };
	return [
		{ event: "response.created", data: { type: "response.created", response: { id: "resp_1", object: "response", status: "in_progress", model: "gpt-oss", output: [] } } },
		{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } } },
		{ event: "response.output_text.delta", data: { type: "response.output_text.delta", output_index: 0, item_id: "msg_1", delta: "Partial" } },
		{ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: 0, item } },
		{
			event: "response.incomplete",
			data: {
				type: "response.incomplete",
				response: { id: "resp_1", object: "response", status: "incomplete", incomplete_details: { reason }, model: "gpt-oss", output: [item], usage: RESPONSES_USAGE },
			},
		},
	];
}

/** A native Anthropic Messages stream ending with the given stop reason. */
function anthropicFrames(stopReason: string, stopSequence: string | null = null): Frame[] {
	return [
		{ event: "message_start", data: { type: "message_start", message: { id: "msg_up", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } } } },
		{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } } },
		{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
		{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: stopSequence }, usage: { output_tokens: 9 } } },
		{ event: "message_stop", data: { type: "message_stop" } },
	];
}

/** The Anthropic executor's path: native Messages -> canonical Responses -> client protocol. */
function anthropicClientStream(stopReason: string, protocol: ClientProtocol, stopSequence: string | null = null): ReadableStream<Uint8Array> {
	const responses = sseResponse(anthropicFrames(stopReason, stopSequence)).body!.pipeThrough(
		createAnthropicToResponsesStreamTransformer("req_finish", "claude", { providerId: "anthropic" }),
	);
	return resolveStreamForProtocol(new Response(responses), args(protocol, "anthropic"), "responses", { canonicalResponsesEvents: true });
}

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
	return await new Response(stream).text();
}

async function buffered(stream: ReadableStream<Uint8Array>, protocol: ClientProtocol): Promise<any> {
	const { ir } = await consumeTextProtocolStreamToIR({ protocol, stream, requestId: "req_finish", model: "m", provider: "p" });
	return encodeProtocol(protocol, ir, "req_finish");
}

describe("Responses upstream ending with response.incomplete (N6)", () => {
	it.each([
		["max_output_tokens", "length"],
		["content_filter", "content_filter"],
	] as const)("gives Chat stream clients a final %s chunk with usage", async (reason, finish) => {
		const upstream = sseResponse(responsesIncomplete(reason));
		const out = parseFrames(await text(resolveStreamForProtocol(upstream, args("openai.chat.completions"), "responses")));
		const finishes = out.flatMap((frame) => (frame.data.choices ?? []).map((choice: any) => choice.finish_reason)).filter(Boolean);
		expect(finishes).toEqual([finish]);
		const final = out[out.length - 1].data;
		expect(final.usage).toMatchObject({ prompt_tokens: 120, completion_tokens: 16 });
	});

	it("gives Chat buffered clients the finish reason and usage", async () => {
		const upstream = sseResponse(responsesIncomplete("max_output_tokens"));
		const stream = resolveStreamForProtocol(upstream, args("openai.chat.completions"), "responses");
		const { ir, usageRaw } = await consumeTextProtocolStreamToIR({ protocol: "openai.chat.completions", stream, requestId: "r", model: "m", provider: "groq" });
		expect(ir.choices[0].finishReason).toBe("length");
		expect(usageRaw).toMatchObject({ prompt_tokens: 120, completion_tokens: 16 });
	});

	it.each([
		["max_output_tokens", "max_tokens"],
		["content_filter", "refusal"],
	] as const)("gives Messages stream clients %s as stop_reason with usage", async (reason, stopReason) => {
		const upstream = sseResponse(responsesIncomplete(reason));
		const out = parseFrames(await text(resolveStreamForProtocol(upstream, args("anthropic.messages"), "responses")));
		const delta = out.find((frame) => frame.data.type === "message_delta")!.data;
		expect(delta.delta.stop_reason).toBe(stopReason);
		expect(delta.usage).toMatchObject({ input_tokens: 120, output_tokens: 16 });
		expect(out[out.length - 1].data.type).toBe("message_stop");
	});

	/** A function call whose arguments were cut off by max_output_tokens. */
	function responsesIncompleteToolCall(): Frame[] {
		const call = { id: "fc_1", type: "function_call", call_id: "call_1", name: "weather", arguments: "{\"city\":\"Ly", status: "incomplete" };
		return [
			{ event: "response.created", data: { type: "response.created", response: { id: "resp_2", object: "response", status: "in_progress", model: "gpt-oss", output: [] } } },
			{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 0, item: { ...call, arguments: "" } } },
			{ event: "response.function_call_arguments.delta", data: { type: "response.function_call_arguments.delta", output_index: 0, item_id: "fc_1", delta: "{\"city\":\"Ly" } },
			{ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: 0, item: call } },
			{
				event: "response.incomplete",
				data: {
					type: "response.incomplete",
					response: { id: "resp_2", object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, model: "gpt-oss", output: [call], usage: RESPONSES_USAGE },
				},
			},
		];
	}

	it("reports a truncated tool call as max_tokens, not tool_use, to Messages clients", async () => {
		const out = parseFrames(await text(resolveStreamForProtocol(sseResponse(responsesIncompleteToolCall()), args("anthropic.messages"), "responses")));
		expect(out.find((frame) => frame.data.type === "message_delta")!.data.delta.stop_reason).toBe("max_tokens");
	});

	it("reports a truncated tool call as length, not tool_calls, to buffered Chat clients", async () => {
		const stream = resolveStreamForProtocol(sseResponse(responsesIncompleteToolCall()), args("openai.chat.completions"), "responses");
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.chat.completions", stream, requestId: "r", model: "m", provider: "groq" });
		expect(ir.choices[0].finishReason).toBe("length");
	});
});

describe("Claude stop reasons on every surface (N5)", () => {
	it.each([
		["max_tokens", "max_tokens"],
		["stop_sequence", "stop_sequence"],
		["pause_turn", "pause_turn"],
		["refusal", "refusal"],
		["end_turn", "end_turn"],
	])("keeps %s for streaming and buffered Messages clients", async (upstream, expected) => {
		const streamed = parseFrames(await text(anthropicClientStream(upstream, "anthropic.messages", upstream === "stop_sequence" ? "###" : null)));
		const delta = streamed.find((frame) => frame.data.type === "message_delta")!.data;
		expect(delta.delta.stop_reason).toBe(expected);
		if (upstream === "stop_sequence") expect(delta.delta.stop_sequence).toBe("###");

		const body = await buffered(anthropicClientStream(upstream, "anthropic.messages", upstream === "stop_sequence" ? "###" : null), "anthropic.messages");
		expect(body.stop_reason).toBe(expected);
		expect(body.stop_sequence).toBe(upstream === "stop_sequence" ? "###" : null);
	});

	it.each([
		["max_tokens", "length", { status: "incomplete", reason: "max_output_tokens" }],
		["refusal", "content_filter", { status: "incomplete", reason: "content_filter" }],
		["stop_sequence", "stop", { status: "completed" }],
		["pause_turn", "stop", { status: "completed" }],
	] as const)("maps %s to the closest Chat and Responses values", async (upstream, chatFinish, responses) => {
		const chat = parseFrames(await text(anthropicClientStream(upstream, "openai.chat.completions")));
		const chatFinishes = chat.flatMap((frame) => (frame.data.choices ?? []).map((choice: any) => choice.finish_reason)).filter(Boolean);
		expect(chatFinishes[chatFinishes.length - 1]).toBe(chatFinish);
		expect((await buffered(anthropicClientStream(upstream, "openai.chat.completions"), "openai.chat.completions")).choices[0].finish_reason).toBe(chatFinish);

		const streamed = parseFrames(await text(anthropicClientStream(upstream, "openai.responses")));
		const terminal = streamed[streamed.length - 1].data.response;
		expect(terminal.status).toBe(responses.status);
		const body = await buffered(anthropicClientStream(upstream, "openai.responses"), "openai.responses");
		expect(body.status).toBe(responses.status);
		if ("reason" in responses) {
			expect(terminal.incomplete_details).toEqual({ reason: responses.reason });
			expect(body.incomplete_details).toEqual({ reason: responses.reason });
		}
	});

	it("carries the Anthropic-only stop internally on the canonical Responses stream", async () => {
		const responses = sseResponse(anthropicFrames("pause_turn")).body!.pipeThrough(
			createAnthropicToResponsesStreamTransformer("req_finish", "claude"),
		);
		const frames = parseFrames(await text(responses));
		const completed = frames.find((frame) => frame.event === "response.completed")!.data.response;
		expect(completed.status).toBe("completed");
		expect(completed[GATEWAY_STOP_KEY]).toEqual({ reason: "pause_turn" });
	});
});

describe("OpenAI-style refusals (N5)", () => {
	it("reaches Messages clients as stop_reason refusal from a Chat-dialect upstream", async () => {
		const upstream = sseResponse([
			{ data: { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", refusal: "I can't help with that." }, finish_reason: null }] } },
			{ data: { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
		]);
		const out = parseFrames(await text(resolveStreamForProtocol(upstream, args("anthropic.messages", "mistral"), "chat")));
		const delta = out.find((frame) => frame.data.type === "message_delta")!.data;
		expect(delta.delta.stop_reason).toBe("refusal");
	});

	it("reaches Messages clients as stop_reason refusal from a Responses refusal part", async () => {
		const item = { id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No." }] };
		const upstream = sseResponse([
			{ event: "response.created", data: { type: "response.created", response: { id: "resp_1", object: "response", status: "in_progress", output: [] } } },
			{ event: "response.completed", data: { type: "response.completed", response: { id: "resp_1", object: "response", status: "completed", output: [item], usage: RESPONSES_USAGE } } },
		]);
		const out = parseFrames(await text(resolveStreamForProtocol(upstream, args("anthropic.messages"), "responses")));
		expect(out.find((frame) => frame.data.type === "message_delta")!.data.delta.stop_reason).toBe("refusal");
	});
});
