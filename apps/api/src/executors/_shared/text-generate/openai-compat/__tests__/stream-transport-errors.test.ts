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
});
