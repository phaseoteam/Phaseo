// The SSE frames a streaming client receives when one request runs a gateway server
// tool and the model's next turn calls one of the client's own function tools. The
// pipeline runs for real: the live wrapper, the server tool, the synthetic final stream
// and the client-boundary stream writer; only the provider calls are stubbed.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";

const doRequestWithIRMock = vi.fn();
const finalizeRequestMock = vi.fn();

vi.mock("../execute", () => ({
	doRequestWithIR: (...args: any[]) => doRequestWithIRMock(...args),
}));

vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => finalizeRequestMock(...args),
	settleNonBillableFailure: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getResponseCache: vi.fn(() => null),
	ensureRuntimeForBackground: vi.fn(() => () => {}),
	getBindings: vi.fn(() => ({})),
	dispatchBackground: vi.fn(),
}));

import { runTextGeneratePipeline } from "./text-generate";
import { passthroughWithPricing } from "../after/streaming";
import { withServedModel } from "../after/served-model";

type Surface = "responses" | "chat.completions" | "messages";

const WEATHER_ARGUMENTS = "{\"city\":\"London\"}";
const DATETIME_ARGUMENTS = "{\"timezones\":[\"UTC\"]}";

function sse(event: string | null, data: unknown): string {
	return `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

function streamOf(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame));
			controller.close();
		},
	});
}

function streamResult(frames: string[]) {
	return {
		ok: true,
		result: {
			kind: "stream" as const,
			stream: streamOf(frames),
			upstream: new Response(null, { status: 200 }),
			provider: "openai",
			generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: {} },
			rawResponse: null,
		},
	};
}

/** One provider turn: some reasoning, then one call. */
function providerTurn(surface: Surface, turn: { n: number; reasoning: string; callId: string; name: string; argumentChunks: string[] }): string[] {
	const fullArguments = turn.argumentChunks.join("");
	if (surface === "responses") {
		const rs = `rs_${turn.n}`;
		const fc = `fc_${turn.n}`;
		const call = { id: fc, type: "function_call", call_id: turn.callId, name: turn.name };
		return [
			sse("response.created", { response: { id: `resp_${turn.n}`, object: "response", model: "gpt-5.4-nano", status: "in_progress" } }),
			sse("response.output_item.added", { output_index: 0, item: { id: rs, type: "reasoning", summary: [], content: [] } }),
			sse("response.reasoning_text.delta", { item_id: rs, output_index: 0, content_index: 0, delta: turn.reasoning }),
			sse("response.output_item.done", { output_index: 0, item: { id: rs, type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: turn.reasoning }] } }),
			sse("response.output_item.added", { output_index: 1, item: { ...call, arguments: "", status: "in_progress" } }),
			...turn.argumentChunks.map((delta) => sse("response.function_call_arguments.delta", { item_id: fc, output_index: 1, delta })),
			sse("response.function_call_arguments.done", { item_id: fc, output_index: 1, arguments: fullArguments }),
			sse("response.output_item.done", { output_index: 1, item: { ...call, arguments: fullArguments, status: "completed" } }),
			sse("response.completed", {
				response: {
					id: `resp_${turn.n}`,
					object: "response",
					model: "gpt-5.4-nano",
					status: "completed",
					output: [{ ...call, arguments: fullArguments, status: "completed" }],
					usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
				},
			}),
			"data: [DONE]\n\n",
		];
	}
	if (surface === "chat.completions") {
		const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
			sse(null, { id: `chatcmpl_${turn.n}`, object: "chat.completion.chunk", created: 1, model: "gpt-5.4-nano", choices, ...extra });
		return [
			chunk([{ index: 0, delta: { role: "assistant", reasoning_content: turn.reasoning }, finish_reason: null }]),
			chunk([{ index: 0, delta: { tool_calls: [{ index: 0, id: turn.callId, type: "function", function: { name: turn.name, arguments: "" } }] }, finish_reason: null }]),
			...turn.argumentChunks.map((piece) => chunk([{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: piece } }] }, finish_reason: null }])),
			chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }]),
			chunk([], { usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }),
			"data: [DONE]\n\n",
		];
	}
	return [
		sse("message_start", { type: "message_start", message: { id: `msg_${turn.n}`, type: "message", role: "assistant", model: "claude", content: [], usage: { input_tokens: 20, output_tokens: 0 } } }),
		sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
		sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: turn.reasoning } }),
		sse("content_block_stop", { type: "content_block_stop", index: 0 }),
		sse("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: turn.callId, name: turn.name, input: {} } }),
		...turn.argumentChunks.map((partial_json) => sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json } })),
		sse("content_block_stop", { type: "content_block_stop", index: 1 }),
		sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } }),
		sse("message_stop", { type: "message_stop" }),
	];
}

const WEATHER_SCHEMA = { type: "object", properties: { city: { type: "string" } }, required: ["city"] };

function pipelineArgs(surface: Surface) {
	const datetime = { type: "gateway:datetime", parameters: { timezones: ["UTC"] } };
	const prompt = "What time is it, and what is the weather in London?";
	const body =
		surface === "responses"
			? { model: "openai/gpt-5.4-nano", input: [{ role: "user", content: prompt }], stream: true, tools: [datetime, { type: "function", name: "get_weather", parameters: WEATHER_SCHEMA }] }
			: surface === "chat.completions"
				? { model: "openai/gpt-5.4-nano", messages: [{ role: "user", content: prompt }], stream: true, tools: [datetime, { type: "function", function: { name: "get_weather", parameters: WEATHER_SCHEMA } }] }
				: { model: "openai/gpt-5.4-nano", max_tokens: 1024, messages: [{ role: "user", content: prompt }], stream: true, tools: [datetime, { name: "get_weather", input_schema: WEATHER_SCHEMA }] };
	const path = surface === "responses" ? "/v1/responses" : surface === "chat.completions" ? "/v1/chat/completions" : "/v1/messages";
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: surface,
				capability: "text.generate",
				requestId: "req_live_frames",
				protocol: surface === "responses" ? "openai.responses" : surface === "chat.completions" ? "openai.chat.completions" : "anthropic.messages",
				meta: { debug: undefined, returnMeta: false, before_ms: 8 },
				rawBody: JSON.parse(JSON.stringify(body)),
				body: JSON.parse(JSON.stringify(body)),
				model: "openai/gpt-5.4-nano",
				workspaceId: "ws_123",
				stream: true,
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
				},
				preset: null,
				internal: false,
				teamSettings: { routingMode: "balanced", byokFallbackEnabled: true, betaChannelEnabled: false, billingMode: "wallet" },
				routingMode: "balanced",
			} as any,
		},
		req: new Request(`https://example.com${path}`, { method: "POST" }),
		endpoint: surface,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

/** Run the two-turn request and return the client's frames (event name and parsed data). */
async function clientFrames(
	surface: Surface,
	secondTurn = providerTurn(surface, { n: 2, reasoning: "Now the weather.", callId: "call_weather", name: "get_weather", argumentChunks: ["{\"city\":", "\"London\"}"] }),
) {
	doRequestWithIRMock
		.mockResolvedValueOnce(streamResult(providerTurn(surface, { n: 1, reasoning: "Need the time first.", callId: "call_dt", name: "gateway_datetime", argumentChunks: [DATETIME_ARGUMENTS] })))
		.mockResolvedValueOnce(streamResult(secondTurn));
	const response = await runTextGeneratePipeline(pipelineArgs(surface) as any);
	expect(response.status).toBe(200);
	const text = await response.text();
	expect(doRequestWithIRMock).toHaveBeenCalledTimes(2);
	return text.split("\n\n").filter(Boolean).map((block) => {
		const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? null;
		const data = block.split("\n").find((line) => line.startsWith("data: "))!.slice(6);
		return { event, data: data === "[DONE]" ? data : JSON.parse(data) };
	});
}

describe("streaming client frames after a gateway server tool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// The real client-boundary writer (event names, Responses normalisation, Chat terminal).
		finalizeRequestMock.mockImplementation(async ({ pre, exec }: any) => passthroughWithPricing({
			upstream: new Response(exec.result.stream, { status: 200 }),
			ctx: pre.ctx,
			provider: "openai",
			priceCard: null,
		}));
	});

	it("Responses: the client's function call arrives as a whole item and in the final output", async () => {
		const frames = await clientFrames("responses");
		const events = frames.filter((frame) => frame.data !== "[DONE]");

		// Every data object names its event, numbered from 0.
		for (const frame of events) expect(frame.data.type).toBe(frame.event);
		expect(events.map((frame) => frame.data.sequence_number)).toEqual(events.map((_, index) => index));
		expect(events.filter((frame) => frame.event === "response.created")).toHaveLength(1);
		expect(events.filter((frame) => frame.event === "response.completed")).toHaveLength(1);
		expect(events.at(-1)!.event).toBe("response.completed");

		// The client's call: added, its argument deltas, arguments done and item done, under one item id.
		const added = events.find((frame) => frame.event === "response.output_item.added" && frame.data.item?.name === "get_weather")?.data;
		expect(added).toMatchObject({ item: { type: "function_call", call_id: "call_weather", arguments: "", status: "in_progress" } });
		const itemId = added.item.id;
		const forItem = events.filter((frame) => frame.data.item_id === itemId || frame.data.item?.id === itemId).map((frame) => frame.event);
		expect(forItem).toEqual([
			"response.output_item.added",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.done",
			"response.output_item.done",
		]);
		const done = events.find((frame) => frame.event === "response.output_item.done" && frame.data.item?.id === itemId)!.data;
		expect(done.item).toMatchObject({ type: "function_call", call_id: "call_weather", name: "get_weather", arguments: WEATHER_ARGUMENTS });
		expect(done.item.output).toBeUndefined();

		// The server tool's call is done with its result.
		const serverDone = events.find((frame) => frame.event === "response.output_item.done" && frame.data.item?.name === "gateway_datetime")!.data;
		expect(serverDone.item).toMatchObject({ type: "function_call", call_id: "call_dt", status: "completed" });
		expect(serverDone.item.output).toEqual(expect.any(String));

		// The final output lists everything that streamed; only the client's call is left to run.
		const completed = events.at(-1)!.data.response;
		expect(completed.output.map((item: any) => [item.type, item.name ?? null])).toEqual([
			["reasoning", null],
			["function_call", "gateway_datetime"],
			["reasoning", null],
			["function_call", "get_weather"],
		]);
		const leftToRun = completed.output.filter((item: any) => item.type === "function_call" && item.output == null && item.error == null);
		expect(leftToRun).toEqual([expect.objectContaining({ id: itemId, call_id: "call_weather", name: "get_weather", arguments: WEATHER_ARGUMENTS })]);

		// Reasoning arrives as reasoning, never as output text.
		const reasoning = events.filter((frame) => frame.event === "response.reasoning_text.delta").map((frame) => frame.data.delta).join("");
		expect(reasoning).toBe("Need the time first.Now the weather.");
		const outputText = events.filter((frame) => String(frame.event).startsWith("response.output_text.")).map((frame) => frame.data.delta ?? frame.data.text).join("");
		expect(outputText).toBe("");
		expect(completed.output_text ?? "").toBe("");
	});

	it("Chat Completions: the client gets its own call once, under its own index", async () => {
		const frames = await clientFrames("chat.completions");
		expect(frames.at(-1)!.data).toBe("[DONE]");
		const chunks = frames.slice(0, -1).map((frame) => frame.data);
		// What an OpenAI client accumulates from the deltas, per tool call index.
		const calls = new Map<number, { ids: string[]; name: string; arguments: string }>();
		let reasoning = "";
		let content = "";
		let finishReason: string | null = null;
		for (const chunk of chunks) {
			for (const choice of chunk.choices ?? []) {
				reasoning += choice.delta?.reasoning_content ?? "";
				content += choice.delta?.content ?? "";
				finishReason = choice.finish_reason ?? finishReason;
				for (const call of choice.delta?.tool_calls ?? []) {
					const entry = calls.get(call.index) ?? { ids: [], name: "", arguments: "" };
					if (call.id) entry.ids.push(call.id);
					entry.name += call.function?.name ?? "";
					entry.arguments += call.function?.arguments ?? "";
					calls.set(call.index, entry);
				}
			}
		}
		expect([...calls.values()]).toEqual([{ ids: ["call_weather"], name: "get_weather", arguments: WEATHER_ARGUMENTS }]);
		expect(finishReason).toBe("tool_calls");
		expect(reasoning).toBe("Need the time first.Now the weather.");
		expect(content).toBe("");
	});

	it("Messages: blocks start, stream and stop in order, and only the client's call is a tool_use", async () => {
		const frames = await clientFrames("messages");
		for (const frame of frames) expect(frame.data.type).toBe(frame.event);
		expect(frames[0]!.event).toBe("message_start");
		expect(frames[0]!.data.message).toMatchObject({ role: "assistant", content: [], usage: expect.any(Object) });
		expect(frames.at(-1)!.event).toBe("message_stop");

		// What an Anthropic client accumulates: each block starts at the next index, its
		// deltas reach an open block, and it stops before the next one starts.
		const blocks: any[] = [];
		let open: number | null = null;
		let stopReason: string | null = null;
		for (const { event, data } of frames) {
			if (event === "content_block_start") {
				expect(open).toBeNull();
				expect(data.index).toBe(blocks.length);
				blocks.push({ ...data.content_block, partial: "" });
				open = data.index;
			} else if (event === "content_block_delta") {
				expect(data.index).toBe(open);
				const block = blocks[data.index];
				if (data.delta.type === "thinking_delta") block.thinking += data.delta.thinking;
				else if (data.delta.type === "text_delta") block.text += data.delta.text;
				else if (data.delta.type === "input_json_delta") block.partial += data.delta.partial_json;
			} else if (event === "content_block_stop") {
				expect(data.index).toBe(open);
				open = null;
			} else if (event === "message_delta") {
				// Clients read both on every message_delta.
				expect(data.delta).toEqual(expect.any(Object));
				expect(data.usage).toEqual(expect.any(Object));
				stopReason = data.delta.stop_reason;
			}
		}
		expect(open).toBeNull();
		expect(blocks.map((block) => block.type)).toEqual(["thinking", "thinking", "tool_use"]);
		expect(blocks.filter((block) => block.type === "thinking").map((block) => block.thinking).join("")).toBe("Need the time first.Now the weather.");
		expect(blocks[2]).toMatchObject({ id: "call_weather", name: "get_weather", partial: WEATHER_ARGUMENTS });
		expect(stopReason).toBe("tool_use");
	});

	it("Messages: text the model writes after the client's call stays after its tool_use block", async () => {
		const secondTurn = providerTurn("messages", { n: 2, reasoning: "Now the weather.", callId: "call_weather", name: "get_weather", argumentChunks: [WEATHER_ARGUMENTS] });
		secondTurn.splice(-2, 0,
			sse("content_block_start", { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } }),
			sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "I'll report back." } }),
			sse("content_block_stop", { type: "content_block_stop", index: 2 }),
		);
		const frames = await clientFrames("messages", secondTurn);
		expect(frames.filter((frame) => String(frame.event).startsWith("content_block_")).map((frame) => frame.data)).toEqual([
			{ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
			{ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Need the time first." } },
			{ type: "content_block_stop", index: 0 },
			{ type: "content_block_start", index: 1, content_block: { type: "thinking", thinking: "" } },
			{ type: "content_block_delta", index: 1, delta: { type: "thinking_delta", thinking: "Now the weather." } },
			{ type: "content_block_stop", index: 1 },
			{ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "call_weather", name: "get_weather", input: {} } },
			{ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: WEATHER_ARGUMENTS } },
			{ type: "content_block_stop", index: 2 },
			{ type: "content_block_start", index: 3, content_block: { type: "text", text: "" } },
			{ type: "content_block_delta", index: 3, delta: { type: "text_delta", text: "I'll report back." } },
			{ type: "content_block_stop", index: 3 },
		]);
		expect(frames.at(-1)!.event).toBe("message_stop");
	});

	// The providers above echo `gpt-5.4-nano` and `claude`; the request resolved to openai/gpt-5.4-nano.
	it.each(["responses", "chat.completions", "messages"] as const)("%s: every event names the Phaseo model, not the provider's echo", async (surface) => {
		// As handleStreamResponse does: each outbound frame gets the served model.
		finalizeRequestMock.mockImplementation(async ({ pre, exec }: any) => passthroughWithPricing({
			upstream: new Response(exec.result.stream, { status: 200 }),
			ctx: pre.ctx,
			provider: "openai",
			priceCard: null,
			rewriteFrame: (frame: any) => withServedModel({ ...frame }, pre.ctx),
		}));
		const frames = (await clientFrames(surface)).filter((frame) => frame.data !== "[DONE]");
		const models = frames.flatMap(({ data }) => [data?.model, data?.response?.model, data?.message?.model].filter((value) => typeof value === "string"));
		expect(models.length).toBeGreaterThan(0);
		expect(new Set(models)).toEqual(new Set(["openai/gpt-5.4-nano"]));
		if (surface === "responses") {
			expect(frames.find((frame) => frame.event === "response.created")!.data.response.model).toBe("openai/gpt-5.4-nano");
			expect(frames.find((frame) => frame.event === "response.completed")!.data.response.model).toBe("openai/gpt-5.4-nano");
		}
		if (surface === "messages") expect(frames[0]!.data.message.model).toBe("openai/gpt-5.4-nano");
	});
});
