// Purpose: A Chat Completions stream is billed with the last usage it reports.
// Why: The finish chunk settled billing with the last usage seen so far. When content chunks
//      carried usage (as the Google executors' do), a usage-only chunk after the finish chunk
//      (`choices: []`, as with stream_options.include_usage) was ignored, and so were later
//      choices of an n > 1 request.
// How: Stream Chat chunks through passthroughWithPricing and check what onFinalUsage gets.

import { describe, expect, it } from "vitest";
import { passthroughWithPricing } from "./streaming";

type Frame = { data: any };

function sseText(frames: Frame[]): string {
	return `${frames.map((frame) => `data: ${JSON.stringify(frame.data)}\n\n`).join("")}data: [DONE]\n\n`;
}

function chatCtx() {
	return {
		requestId: "req_chat_usage",
		workspaceId: "ws_chat_usage",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		meta: {},
	} as any;
}

async function finalUsageOf(frames: Frame[], provider = "google-ai-studio") {
	const calls: Array<{ usage: any; info: any }> = [];
	const response = await passthroughWithPricing({
		upstream: new Response(sseText(frames), { headers: { "Content-Type": "text/event-stream" } }),
		ctx: chatCtx(),
		provider,
		priceCard: null,
		onFinalUsage: (usage, info) => {
			calls.push({ usage, info });
		},
	});
	await response.text();
	return calls;
}

const chunk = (choices: unknown[], usage?: Record<string, unknown>) => ({
	data: { id: "c", object: "chat.completion.chunk", choices, ...(usage ? { usage } : {}) },
});

describe("Chat Completions stream usage", () => {
	it.each([
		["the finish chunk has no usage", undefined],
		["the finish chunk has provisional usage", { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 6 } }],
	])("settles with the trailing usage-only chunk when %s", async (_name, finishUsage) => {
		const calls = await finalUsageOf([
			chunk([{ index: 0, delta: { content: "Hi" }, finish_reason: null }], { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, prompt_tokens_details: { cached_tokens: 6 } }),
			chunk([{ index: 0, delta: { content: " there" }, finish_reason: null }], { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, prompt_tokens_details: { cached_tokens: 6 } }),
			chunk([{ index: 0, delta: {}, finish_reason: "stop" }], finishUsage),
			chunk([], { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17, prompt_tokens_details: { cached_tokens: 0 } }),
		]);

		// The last usage wins whole, so its 0 cached tokens replace the earlier 6.
		expect(calls).toEqual([{
			usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17, prompt_tokens_details: { cached_tokens: 0 } },
			info: { aborted: false, sawFinalUsage: true },
		}]);
	});

	it("settles once the last of several choices and the usage chunk have arrived", async () => {
		const calls = await finalUsageOf([
			chunk([{ index: 0, delta: { content: "A" }, finish_reason: null }, { index: 1, delta: { content: "B" }, finish_reason: null }], { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 }),
			// The first choice finishes while the second is still writing.
			chunk([{ index: 0, delta: {}, finish_reason: "stop" }], { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 }),
			chunk([{ index: 1, delta: { content: "BB" }, finish_reason: "stop" }], { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 }),
			chunk([], { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 }),
		]);

		expect(calls.map((call) => call.usage)).toEqual([{ prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 }]);
	});

	it("still reports a stream that ended without any usage", async () => {
		const calls = await finalUsageOf([
			chunk([{ index: 0, delta: { content: "Hi" }, finish_reason: null }]),
			chunk([{ index: 0, delta: {}, finish_reason: "stop" }]),
		], "openai");

		expect(calls).toEqual([{ usage: null, info: { aborted: false, sawFinalUsage: false } }]);
	});

	it("settles at the upstream's [DONE] even if the connection stays open", async () => {
		const calls: Array<any> = [];
		let settled!: () => void;
		const usageSettled = new Promise<void>((resolve) => { settled = resolve; });
		const encoder = new TextEncoder();
		let upstreamController!: ReadableStreamDefaultController<Uint8Array>;
		const upstream = new ReadableStream<Uint8Array>({
			start(controller) {
				upstreamController = controller;
				controller.enqueue(encoder.encode(sseText([
					chunk([{ index: 0, delta: { content: "Hi" }, finish_reason: null }], { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }),
					chunk([{ index: 0, delta: {}, finish_reason: "stop" }]),
					chunk([], { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }),
				])));
				// No close: the body stays open after [DONE].
			},
		});
		const response = await passthroughWithPricing({
			upstream: new Response(upstream, { headers: { "Content-Type": "text/event-stream" } }),
			ctx: chatCtx(),
			provider: "google-ai-studio",
			priceCard: null,
			onFinalUsage: (usage) => {
				calls.push(usage);
				settled();
			},
		});
		// Keep reading, as a client would; the response itself can't end while the upstream is open.
		const reader = response.body!.getReader();
		const reading = (async () => {
			try { while (!(await reader.read()).done); } catch { /* cancelled below */ }
		})();

		await usageSettled;
		expect(calls).toEqual([{ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }]);
		await reader.cancel();
		await reading;
		upstreamController.close();
	});
});
