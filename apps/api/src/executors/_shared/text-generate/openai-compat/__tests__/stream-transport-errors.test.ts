import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { passthroughWithPricing } from "@pipeline/after/streaming";

// A connection reset after the stream started must reach billing as a broken stream, through
// every protocol adapter. Before, the adapters caught the read error and closed normally, so a
// reset looked like an early end: a stream the client had left kept its drain-checkpoint estimate
// as a cancellation instead of being refunded as an upstream failure.

const CHAT_CHUNK = `data: ${JSON.stringify({ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta: { content: "partial" } }] })}\n\n`;
const RESPONSES_CHUNK = `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", item_id: "msg_1", output_index: 0, delta: "partial" })}\n\n`;

/** An upstream that sends one frame, then has its connection reset. */
function resetUpstream(first: string): { response: Response; reset: () => void; cancelled: () => boolean } {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	let cancelled = false;
	const body = new ReadableStream<Uint8Array>({
		start(c) { controller = c; c.enqueue(new TextEncoder().encode(first)); },
		cancel() { cancelled = true; },
	});
	return {
		response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
		reset: () => controller.error(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })),
		cancelled: () => cancelled,
	};
}

function args(protocol: "openai.chat.completions" | "openai.responses" | "anthropic.messages"): any {
	return {
		ir: { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }], model: "test-model", stream: true },
		requestId: "req_reset",
		workspaceId: "team_test",
		providerId: "deepinfra",
		endpoint: protocol === "anthropic.messages" ? "messages" : protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol,
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	};
}

const CASES = [
	["Chat upstream to a Chat client", "chat", "openai.chat.completions", CHAT_CHUNK],
	["Chat upstream to a Responses client", "chat", "openai.responses", CHAT_CHUNK],
	["Chat upstream to a Messages client", "chat", "anthropic.messages", CHAT_CHUNK],
	["Responses upstream to a Chat client", "responses", "openai.chat.completions", RESPONSES_CHUNK],
	["Responses upstream to a Messages client", "responses", "anthropic.messages", RESPONSES_CHUNK],
] as const;

describe("upstream connection resets through the protocol adapters", () => {
	it.each(CASES)("%s: the adapter stream errors instead of ending normally", async (_label, route, protocol, first) => {
		const upstream = resetUpstream(first);
		const adapted = resolveStreamForProtocol(upstream.response, args(protocol), route);
		const reader = adapted.getReader();
		const firstRead = reader.read();
		upstream.reset();
		await firstRead.catch(() => undefined);
		await expect((async () => { while (!(await reader.read()).done) { /* drain */ } })()).rejects.toThrow("ECONNRESET");
	});

	it.each(CASES)("%s: billing sees a broken upstream after the client left", async (_label, route, protocol, first) => {
		const upstream = resetUpstream(first);
		const adapted = resolveStreamForProtocol(upstream.response, args(protocol), route);
		const ctx: any = { requestId: "req_reset", workspaceId: "team_test", endpoint: args(protocol).endpoint, protocol, meta: {} };
		let finalUsage!: () => void;
		const finalized = new Promise<void>((resolve) => { finalUsage = resolve; });
		const response = await passthroughWithPricing({
			upstream: new Response(adapted, { headers: { "Content-Type": "text/event-stream" } }),
			ctx,
			provider: "deepinfra",
			priceCard: null,
			onFinalUsage: () => finalUsage(),
		});
		const client = response.body!.getReader();
		await client.read();
		await client.cancel();
		upstream.reset();
		await finalized;
		expect(ctx.meta.downstreamDisconnected).toBe(true);
		expect(ctx.meta.upstreamStreamBroken).toBe(true);
	});

	it("our own cancel of the adapter stream stops the upstream and is not a failure", async () => {
		const upstream = resetUpstream(CHAT_CHUNK);
		const adapted = resolveStreamForProtocol(upstream.response, args("openai.chat.completions"), "chat");
		const reader = adapted.getReader();
		await reader.read();
		await reader.cancel("client left");
		expect(upstream.cancelled()).toBe(true);
		await expect(reader.closed).resolves.toBeUndefined();
	});

	// A complete upstream stream, then a reset while the connection is torn down.
	const chatFrame = (data: unknown) => `data: ${JSON.stringify(data)}

`;
	const CHAT_COMPLETE = [
		chatFrame({ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta: { content: "done" } }] }),
		chatFrame({ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
		chatFrame({ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } }),
		"data: [DONE]\n\n",
	].join("");
	// Finish and usage but no [DONE]: some providers end there.
	const CHAT_COMPLETE_NO_DONE = CHAT_COMPLETE.replace("data: [DONE]\n\n", "");
	const completedResponse = { id: "resp_1", object: "response", status: "completed", model: "test-model",
		output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "done", annotations: [] }] }],
		usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } };
	const RESPONSES_COMPLETE = [
		`event: response.created
data: ${JSON.stringify({ type: "response.created", response: { ...completedResponse, status: "in_progress", output: [], usage: null } })}

`,
		`event: response.output_text.delta
data: ${JSON.stringify({ type: "response.output_text.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: "done" })}

`,
		`event: response.completed
data: ${JSON.stringify({ type: "response.completed", response: completedResponse })}

`,
	].join("");

	const COMPLETE_CASES = [
		["Chat upstream ([DONE]) to a Chat client", "chat", "openai.chat.completions", CHAT_COMPLETE, '"finish_reason":"stop"'],
		["Chat upstream (finish and usage) to a Chat client", "chat", "openai.chat.completions", CHAT_COMPLETE_NO_DONE, '"finish_reason":"stop"'],
		["Chat upstream to a Responses client", "chat", "openai.responses", CHAT_COMPLETE, "response.completed"],
		["Chat upstream to a Messages client", "chat", "anthropic.messages", CHAT_COMPLETE, "message_stop"],
		["Responses upstream (response.completed) to a Chat client", "responses", "openai.chat.completions", RESPONSES_COMPLETE, '"finish_reason":"stop"'],
		["Responses upstream to a Responses client", "responses", "openai.responses", RESPONSES_COMPLETE, "response.completed"],
		["Responses upstream to a Messages client", "responses", "anthropic.messages", RESPONSES_COMPLETE, "message_stop"],
	] as const;

	it.each(COMPLETE_CASES)("%s: a reset after completion is teardown, the stream ends normally", async (_label, route, protocol, complete, terminal) => {
		const upstream = resetUpstream(complete);
		const adapted = resolveStreamForProtocol(upstream.response, args(protocol), route);
		const reader = adapted.getReader();
		const chunks: string[] = [];
		const decoder = new TextDecoder();
		const first = await reader.read();
		if (first.value) chunks.push(decoder.decode(first.value));
		upstream.reset();
		await expect((async () => {
			while (true) {
				const { value, done } = await reader.read();
				if (done) return;
				chunks.push(decoder.decode(value));
			}
		})()).resolves.toBeUndefined();
		expect(chunks.join("")).toContain("done");
		// The terminal frame was still queued when the connection reset; it must reach the client.
		expect(chunks.join("")).toContain(terminal);
	});

	it.each(COMPLETE_CASES)("%s: billing keeps the completed output after a late reset", async (_label, route, protocol, complete) => {
		const upstream = resetUpstream(complete);
		const adapted = resolveStreamForProtocol(upstream.response, args(protocol), route);
		const ctx: any = { requestId: "req_reset", workspaceId: "team_test", endpoint: args(protocol).endpoint, protocol, meta: {} };
		let info!: { aborted: boolean };
		let onFinal: (value: { aborted: boolean }) => void = () => undefined;
		const finalized = new Promise<void>((resolve) => { onFinal = (value) => { info = value; resolve(); }; });
		const response = await passthroughWithPricing({
			upstream: new Response(adapted, { headers: { "Content-Type": "text/event-stream" } }),
			ctx, provider: "deepinfra", priceCard: null,
			onFinalUsage: (_usage, value) => onFinal(value),
		});
		const client = response.body!.getReader();
		await client.read();
		await client.cancel();
		upstream.reset();
		await finalized;
		expect(ctx.meta.upstreamStreamBroken).toBeUndefined();
		expect(info.aborted).toBe(false);
	});

	// A stop reason is not completion: a reset before the protocol's end is a failure.
	const anthropicFrame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	const chatChunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
		chatFrame({ id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model: "test-model", choices, ...extra });
	const EARLY_CASES = [
		["Chat: finish_reason without usage or [DONE]", "openai.chat.completions",
			chatChunk([{ index: 0, delta: { content: "done" } }]) + chatChunk([{ index: 0, delta: {}, finish_reason: "stop" }])],
		["Chat: one of two choices finished, with usage", "openai.chat.completions",
			chatChunk([{ index: 0, delta: { content: "a" } }, { index: 1, delta: { content: "b" } }]) +
			chatChunk([{ index: 0, delta: {}, finish_reason: "stop" }], { usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })],
		["Messages: message_delta before message_stop", "anthropic.messages",
			anthropicFrame("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", content: [], model: "m", usage: { input_tokens: 3, output_tokens: 1 } } }) +
			anthropicFrame("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
			anthropicFrame("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "done" } }) +
			anthropicFrame("content_block_stop", { type: "content_block_stop", index: 0 }) +
			anthropicFrame("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })],
	] as const;

	it.each(EARLY_CASES)("native stream, %s: a reset is a broken upstream for billing", async (_label, protocol, frames) => {
		const upstream = resetUpstream(frames);
		const ctx: any = { requestId: "req_early", workspaceId: "team_test", endpoint: args(protocol).endpoint, protocol, meta: {} };
		let finalUsage!: () => void;
		const finalized = new Promise<void>((resolve) => { finalUsage = resolve; });
		const response = await passthroughWithPricing({ upstream: upstream.response, ctx, provider: "deepinfra", priceCard: null, onFinalUsage: () => finalUsage() });
		const client = response.body!.getReader();
		await client.read();
		await client.cancel();
		upstream.reset();
		await finalized;
		expect(ctx.meta.upstreamStreamBroken).toBe(true);
	});

	it("adapter stream, Chat with one of two choices finished: a reset is a broken upstream for billing", async () => {
		const upstream = resetUpstream(EARLY_CASES[1][2]);
		const adapted = resolveStreamForProtocol(upstream.response, args("openai.chat.completions"), "chat");
		const ctx: any = { requestId: "req_early", workspaceId: "team_test", endpoint: "chat.completions", protocol: "openai.chat.completions", meta: {} };
		let finalUsage!: () => void;
		const finalized = new Promise<void>((resolve) => { finalUsage = resolve; });
		const response = await passthroughWithPricing({
			upstream: new Response(adapted, { headers: { "Content-Type": "text/event-stream" } }),
			ctx, provider: "deepinfra", priceCard: null, onFinalUsage: () => finalUsage(),
		});
		const client = response.body!.getReader();
		await client.read();
		await client.cancel();
		upstream.reset();
		await finalized;
		expect(ctx.meta.upstreamStreamBroken).toBe(true);
	});
});
