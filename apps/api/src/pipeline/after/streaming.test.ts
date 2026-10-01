import { describe, expect, it } from "vitest";
import { passthroughWithPricing } from "./streaming";

function makeSseResponse(frames: Array<{ event?: string; data: any }>): Response {
	const text = frames
		.map((frame) => {
			const eventLine = frame.event ? `event: ${frame.event}\n` : "";
			return `${eventLine}data: ${frame.data === "[DONE]" ? frame.data : JSON.stringify(frame.data)}\n\n`;
		})
		.join("");
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

function makeDelayedSseResponse(
	frames: Array<{ event?: string; data: any }>,
	delayMs = 8,
): { response: Response; wasCancelled: () => boolean } {
	let cancelled = false;
	let index = 0;
	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (index >= frames.length) {
				controller.close();
				return;
			}
			const frame = frames[index++];
			const eventLine = frame?.event ? `event: ${frame.event}\n` : "";
			const chunk = `${eventLine}data: ${frame?.data === "[DONE]" ? frame.data : JSON.stringify(frame?.data ?? {})}\n\n`;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			controller.enqueue(new TextEncoder().encode(chunk));
		},
		cancel() {
			cancelled = true;
		},
	});
	return {
		response: new Response(stream, {
			status: 200,
			headers: { "Content-Type": "text/event-stream" },
		}),
		wasCancelled: () => cancelled,
	};
}

async function drain(response: Response): Promise<string> {
	return await response.text();
}

function baseCtx(overrides?: Record<string, unknown>): any {
	return {
		requestId: "req_streaming_test",
		workspaceId: "team_test",
		endpoint: "responses",
		protocol: "openai.responses",
		meta: {},
		...overrides,
	};
}

describe("passthroughWithPricing", () => {
	it("finishes compatibility Chat snapshots with exactly one DONE", async () => {
		const outcomes: unknown[] = [];
		const response = await passthroughWithPricing({
			upstream: makeSseResponse([
				{ data: { object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }], usage: { total_tokens: 5 } } },
				{ data: "[DONE]" },
				{ data: { object: "chat.completion", choices: [], usage: { total_tokens: 99 } } },
			]),
			ctx: baseCtx({ protocol: "openai.chat.completions" }), provider: "openai", priceCard: null,
			onFinalUsage: (usage, info) => { outcomes.push({ usage, info }); },
		});
		const text = await response.text();
		expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
		expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
		expect(text).not.toContain("99");
		expect(outcomes).toEqual([{ usage: { total_tokens: 5 }, info: { aborted: false, sawFinalUsage: true } }]);
	});

	it("does not settle successfully when transport fails after finish_reason and usage but before DONE", async () => {
		const outcomes: unknown[] = [];
		let index = 0;
		const stream = new ReadableStream<Uint8Array>({ pull(controller) {
			if (index++ === 0) controller.enqueue(new TextEncoder().encode('data: {"object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n\n'));
			else controller.error(new Error("transport ended"));
		} });
		const ctx = baseCtx({ protocol: "openai.chat.completions" });
		const response = await passthroughWithPricing({ upstream: new Response(stream), ctx, provider: "openai", priceCard: null,
			onFinalUsage: (usage, info) => { outcomes.push({ usage, info }); },
		});
		await expect(response.text()).rejects.toThrow("transport ended");
		expect(outcomes).toEqual([{ usage: { total_tokens: 5 }, info: { aborted: true, sawFinalUsage: false, failureOrigin: "provider" } }]);
		expect(ctx.meta.downstreamDisconnected).not.toBe(true);
		expect(stream.locked).toBe(false);
	});

	it.each(["rewrite", "snapshot", "observer"])("classifies %s callback errors as gateway failures", async (stage) => {
		const outcomes: unknown[] = [];
		const throwing = () => { throw new Error("gateway callback failed"); };
		const upstream = makeSseResponse([{ event: "response.completed", data: { type: "response.completed", response: { status: "completed", usage: { total_tokens: 5 } } } }]);
		const response = await passthroughWithPricing({ upstream, ctx: baseCtx(), provider: "openai", priceCard: null,
			rewriteFrame: stage === "rewrite" ? throwing : undefined,
			onFinalSnapshot: stage === "snapshot" ? throwing : undefined,
			onStreamEvent: stage === "observer" ? throwing : undefined,
			onFinalUsage: (_usage, info) => { outcomes.push(info); },
		});
		await expect(response.text()).rejects.toThrow("gateway callback failed");
		expect(outcomes).toEqual([{ aborted: true, sawFinalUsage: false, failureOrigin: "gateway" }]);
	});

	it("does not forward stray frames or bill twice after a native terminal", async () => {
		const outcomes: unknown[] = [];
		const response = await passthroughWithPricing({
			upstream: makeSseResponse([
				{ event: "response.completed", data: { type: "response.completed", response: { status: "completed", usage: { total_tokens: 5 } } } },
				{ event: "response.output_text.delta", data: { delta: "late" } },
				{ event: "response.completed", data: { type: "response.completed", response: { status: "completed", usage: { total_tokens: 99 } } } },
			]),
			ctx: baseCtx(), provider: "openai", priceCard: null, onFinalUsage: (usage, info) => { outcomes.push({ usage, info }); },
		});
		const text = await response.text();
		expect(text).not.toContain("late"); expect(text).not.toContain("99");
		expect(outcomes).toEqual([{ usage: { total_tokens: 5 }, info: { aborted: false, sawFinalUsage: true } }]);
	});

	it("uses shared CRLF and multiline framing through the after-stage", async () => {
		const outcomes: unknown[] = [];
		const response = await passthroughWithPricing({
			upstream: new Response('event: response.completed\r\ndata: {"type":"response.completed",\r\ndata: "response":{"status":"completed","usage":{"total_tokens":5}}}\r\n\r\n'),
			ctx: baseCtx(), provider: "openai", priceCard: null, onFinalUsage: (usage) => { outcomes.push(usage); },
		});
		expect(await response.text()).toContain('"total_tokens":5');
		expect(outcomes).toEqual([{ total_tokens: 5 }]);
	});
	it.each(["completed", "incomplete"])("finalizes usage once without aborting response.%s events", async (status) => {
		const usageCalls: Array<any> = [];
		const outcomes: Array<unknown> = [];
		const upstream = makeSseResponse([
			{
				event: "response.created",
				data: { response: { id: "resp_1", object: "response", status: "in_progress" } },
			},
			{
				event: `response.${status}`,
				data: {
					response: {
						id: "resp_1",
						object: "response",
						status,
						...(status === "incomplete" ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
						usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
					},
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx(),
			provider: "openai",
			priceCard: null,
			onFinalUsage: (usage, info) => {
				usageCalls.push(usage);
				outcomes.push(info);
			},
		});

		await drain(response);

		expect(usageCalls).toHaveLength(1);
		expect(outcomes).toEqual([{ aborted: false, sawFinalUsage: true }]);
		expect(usageCalls[0]).toEqual({
			input_tokens: 3,
			output_tokens: 2,
			total_tokens: 5,
		});
	});

	it("reuses last seen usage when terminal frame lacks explicit usage", async () => {
		const usageCalls: Array<any> = [];
		const upstream = makeSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
					usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
				},
			},
			{
				data: {
					object: "chat.completion",
					choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			}),
			provider: "openai",
			priceCard: null,
			onFinalUsage: (usage) => {
				usageCalls.push(usage);
			},
		});

		await drain(response);

		expect(usageCalls).toHaveLength(1);
		expect(usageCalls[0]).toEqual({
			prompt_tokens: 4,
			completion_tokens: 1,
			total_tokens: 5,
		});
	});

	it("waits for OpenAI's trailing usage-only frame after finish_reason", async () => {
		const usageCalls: Array<{ usage: any; info: any }> = [];
		const completionTimings: Array<{ generationMs: number; endToEndMs: number }> = [];
		const upstream = makeDelayedSseResponse([
			{
				data: {
					id: "chatcmpl_usage_after_stop",
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
					usage: null,
				},
			},
			{
				data: {
					id: "chatcmpl_usage_after_stop",
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: null,
				},
			},
			{
				data: {
					id: "chatcmpl_usage_after_stop",
					object: "chat.completion.chunk",
					choices: [],
					usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
				},
			},
			{ data: "[DONE]" },
		], 10).response;
		const ctx = baseCtx({
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			meta: {
				startedAtMs: Date.now() - 50,
				selectedUpstreamFetchStartMs: Date.now() - 40,
			},
		});

		const response = await passthroughWithPricing({
			upstream,
			ctx,
			provider: "openai",
			priceCard: null,
			onFinalSnapshot: () => {
				completionTimings.push({
					generationMs: ctx.meta.generation_ms,
					endToEndMs: ctx.meta.end_to_end_ms,
				});
			},
			onFinalUsage: (usage, info) => {
				usageCalls.push({ usage, info });
				completionTimings.push({
					generationMs: ctx.meta.generation_ms,
					endToEndMs: ctx.meta.end_to_end_ms,
				});
			},
		});

		await drain(response);

		expect(usageCalls).toEqual([{
			usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
			info: { aborted: false, sawFinalUsage: true },
		}]);
		expect(completionTimings).toHaveLength(2);
		expect(completionTimings[1]).toEqual(completionTimings[0]);
	});

	it("keeps draining for trailing OpenAI usage after the client disconnects", async () => {
		const usageCalls: Array<{ usage: any; info: any }> = [];
		let resolveUsage: (() => void) | null = null;
		const usageSettled = new Promise<void>((resolve) => {
			resolveUsage = resolve;
		});
		const upstream = makeDelayedSseResponse([
			{
				data: {
					id: "chatcmpl_disconnected_usage",
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
				},
			},
			{
				data: {
					id: "chatcmpl_disconnected_usage",
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				},
			},
			{
				data: {
					id: "chatcmpl_disconnected_usage",
					object: "chat.completion.chunk",
					choices: [],
					usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
				},
			},
			{ data: "[DONE]" },
		], 10);

		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx: baseCtx({
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			}),
			provider: "openai",
			priceCard: null,
			onFinalUsage: (usage, info) => {
				usageCalls.push({ usage, info });
				resolveUsage?.();
			},
		});

		const reader = response.body?.getReader();
		expect(reader).toBeTruthy();
		await reader?.read();
		await reader?.cancel();
		await usageSettled;

		expect(upstream.wasCancelled()).toBe(false);
		expect(usageCalls).toEqual([{
			usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
			info: { aborted: false, sawFinalUsage: true },
		}]);
	});

	it("emits canonical stream events while forwarding SSE", async () => {
		const seenEvents: string[] = [];
		const upstream = makeSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [
						{
							index: 0,
							delta: {
								content: "hi",
								tool_calls: [
									{
										index: 0,
										id: "call_1",
										function: { name: "lookup", arguments: "{\"q\":\"a\"}" },
									},
								],
							},
							finish_reason: null,
						},
					],
				},
			},
			{
				data: {
					object: "chat.completion",
					choices: [{ index: 0, finish_reason: "tool_calls" }],
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			}),
			provider: "openai",
			priceCard: null,
			onStreamEvent: (event) => {
				seenEvents.push(event.type);
			},
		});

		await drain(response);

		expect(seenEvents).toContain("start");
		expect(seenEvents).toContain("delta_text");
		expect(seenEvents).toContain("delta_tool");
		expect(seenEvents).toContain("stop");
	});

	it("finalizes with aborted=true using last seen usage on truncated streams", async () => {
		const usageCalls: Array<{ usage: any; info: any }> = [];
		const upstream = makeSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "partial" }, finish_reason: null }],
					usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			}),
			provider: "openai",
			priceCard: null,
			onFinalUsage: (usage, info) => {
				usageCalls.push({ usage, info });
			},
		});

		await expect(drain(response)).rejects.toThrow("sse_missing_terminal");

		expect(usageCalls).toHaveLength(1);
		expect(usageCalls[0]?.usage).toEqual({
			prompt_tokens: 8,
			completion_tokens: 2,
			total_tokens: 10,
		});
		expect(usageCalls[0]?.info?.aborted).toBe(true);
		expect(usageCalls[0]?.info?.sawFinalUsage).toBe(false);
	});

	it("settles final usage once when terminal snapshot arrives before later stray frames", async () => {
		const usageCalls: Array<any> = [];
		const upstream = makeSseResponse([
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_oop",
						object: "response",
						status: "completed",
						usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 },
					},
				},
			},
			{
				event: "response.output_text.delta",
				data: { delta: "late", output_index: 0 },
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx(),
			provider: "openai",
			priceCard: null,
			onFinalUsage: (usage) => {
				usageCalls.push(usage);
			},
		});

		await drain(response);
		expect(usageCalls).toHaveLength(1);
		expect(usageCalls[0]).toEqual({
			input_tokens: 4,
			output_tokens: 1,
			total_tokens: 5,
		});
	});

	it("re-encodes canonical events to requested protocol when upstream wire shape differs", async () => {
		const upstream = makeSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }],
				},
			},
			{
				data: {
					object: "chat.completion",
					usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
					choices: [{ index: 0, finish_reason: "stop" }],
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({
				endpoint: "responses",
				protocol: "openai.responses",
			}),
			provider: "openai",
			priceCard: null,
		});

		const text = await drain(response);
		expect(text).toContain("event: response.output_text.delta");
		expect(text).toContain("event: response.completed");
	});

	it("does not block stream completion on async final usage work", async () => {
		const usageCalls: Array<any> = [];
		let resolveFinalUsage: (() => void) | null = null;
		const finalUsageDone = new Promise<void>((resolve) => {
			resolveFinalUsage = resolve;
		});
		const upstream = makeSseResponse([
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_async",
						object: "response",
						status: "completed",
						usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
					},
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx(),
			provider: "openai",
			priceCard: null,
			onFinalUsage: async (usage) => {
				usageCalls.push(usage);
				await finalUsageDone;
			},
		});

		const drained = await Promise.race([
			drain(response).then(() => "drained"),
			new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 25)),
		]);
		expect(drained).toBe("drained");
		expect(usageCalls).toHaveLength(1);

		resolveFinalUsage?.();
		await finalUsageDone;
	});

	it("does not start final usage persistence before preparing the terminal frame", async () => {
		const order: string[] = [];
		const upstream = makeSseResponse([{
			event: "response.completed",
			data: {
				response: {
					id: "resp_order",
					object: "response",
					status: "completed",
					usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
				},
			},
		}]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx(),
			provider: "openai",
			priceCard: null,
			rewriteFrame: (frame) => {
				order.push("terminal_frame_prepared");
				return frame;
			},
			onFinalUsage: () => {
				order.push("final_usage_started");
			},
		});

		await drain(response);
		expect(order).toEqual(["terminal_frame_prepared", "final_usage_started"]);
	});

	it("keeps draining cancellable upstreams after downstream disconnect for authoritative billing", async () => {
		const usageCalls: Array<{ usage: any; info: any }> = [];
		let resolveUsage: (() => void) | null = null;
		const usageSettled = new Promise<void>((resolve) => {
			resolveUsage = resolve;
		});
		const upstream = makeDelayedSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "partial" }, finish_reason: null }],
					usage: { prompt_tokens: 6, completion_tokens: 1, total_tokens: 7 },
				},
			},
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "more" }, finish_reason: null }],
				},
			},
		], 15);

		const ctx = baseCtx({
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
		});
		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx,
			provider: "openai",
			priceCard: null,
			onFinalUsage: (usage, info) => {
				usageCalls.push({ usage, info });
				resolveUsage?.();
			},
		});

		const reader = response.body?.getReader();
		expect(reader).toBeTruthy();
		await reader?.read();
		await reader?.cancel();

		await usageSettled;
		expect(upstream.wasCancelled()).toBe(false);
		expect(ctx.meta.downstreamDisconnected).toBe(true);
		expect(ctx.meta.streamCancellationSupport).toBe("supported");
		expect(ctx.meta.streamProviderBillingOnCancel).toBe("stops");
		expect(ctx.meta.streamDisconnectAction).toBe("drain_upstream");
		expect(usageCalls).toHaveLength(1);
		expect(usageCalls[0]?.info?.aborted).toBe(true);
		expect(usageCalls[0]?.info?.sawFinalUsage).toBe(false);
	});

	it("keeps draining upstream when downstream disconnects and provider cancellation is unsupported", async () => {
		const usageCalls: Array<{ usage: any; info: any }> = [];
		let resolveUsage: (() => void) | null = null;
		const usageSettled = new Promise<void>((resolve) => {
			resolveUsage = resolve;
		});
		const upstream = makeDelayedSseResponse([
			{
				event: "response.created",
				data: { response: { id: "resp_keep", object: "response", status: "in_progress" } },
			},
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_keep",
						object: "response",
						status: "completed",
						usage: { input_tokens: 9, output_tokens: 3, total_tokens: 12 },
					},
				},
			},
		], 15);

		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx: baseCtx(),
			provider: "groq",
			priceCard: null,
			onFinalUsage: (usage, info) => {
				usageCalls.push({ usage, info });
				resolveUsage?.();
			},
		});

		const reader = response.body?.getReader();
		expect(reader).toBeTruthy();
		await reader?.read();
		await reader?.cancel();

		await usageSettled;
		expect(upstream.wasCancelled()).toBe(false);
		expect(usageCalls).toHaveLength(1);
		expect(usageCalls[0]?.info?.aborted).toBe(false);
		expect(usageCalls[0]?.info?.sawFinalUsage).toBe(true);
		expect(usageCalls[0]?.usage).toEqual({
			input_tokens: 9,
			output_tokens: 3,
			total_tokens: 12,
		});
	});

	it("records first-token latency, dispatch-to-terminal generation, and gateway end-to-end separately", async () => {
		const ctx = baseCtx({
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			meta: {
				startedAtMs: Date.now() - 80,
				upstreamStartMs: Date.now() - 40,
			},
		});
		const upstream = makeDelayedSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
					usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
				},
			},
			{
				data: {
					object: "chat.completion",
					choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
				},
			},
		], 20);

		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx,
			provider: "openai",
			priceCard: null,
		});

		await drain(response);

		expect(typeof ctx.meta.latency_ms).toBe("number");
		expect(ctx.meta.provider_ttft_ms).toBe(ctx.meta.latency_ms);
		expect(typeof ctx.meta.gateway_ttft_ms).toBe("number");
		expect(typeof ctx.meta.generation_ms).toBe("number");
		expect(typeof ctx.meta.end_to_end_ms).toBe("number");
		expect(typeof ctx.meta.phaseo_overhead_ms).toBe("number");
		expect((ctx.meta.latency_ms as number)!).toBeGreaterThan(0);
		expect((ctx.meta.generation_ms as number)!).toBeGreaterThanOrEqual(0);
		expect((ctx.meta.end_to_end_ms as number)!).toBeGreaterThanOrEqual((ctx.meta.latency_ms as number)!);
		expect((ctx.meta.generation_ms as number)!).toBeGreaterThanOrEqual((ctx.meta.latency_ms as number)!);
		expect(ctx.meta.itl_ms).toBeUndefined();
	});

	it("records ITL from successive content-bearing stream frames", async () => {
		const ctx = baseCtx({
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			meta: {
				startedAtMs: Date.now() - 80,
				upstreamStartMs: Date.now() - 40,
			},
		});
		const upstream = makeDelayedSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
				},
			},
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
				},
			},
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }],
				},
			},
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
				},
			},
			{ data: "[DONE]" },
		], 15);

		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx,
			provider: "openai",
			priceCard: null,
		});

		await drain(response);

		expect(typeof ctx.meta.itl_ms).toBe("number");
		expect(ctx.meta.itl_ms).toBeGreaterThan(5);
	});

	it("does not infer ITL between content frames from the same upstream chunk", async () => {
		const ctx = baseCtx({
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			meta: { startedAtMs: Date.now() - 80, upstreamStartMs: Date.now() - 40 },
		});
		const upstream = makeSseResponse([
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }] } },
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }] } },
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } } },
			{ data: "[DONE]" },
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx,
			provider: "openai",
			priceCard: null,
		});

		await drain(response);
		expect(ctx.meta.itl_ms).toBeUndefined();
	});

	it("ignores metadata-only frames and overwrites adapter latency at first generated output", async () => {
		const ctx = baseCtx({
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			meta: {
				startedAtMs: Date.now() - 90,
				upstreamStartMs: Date.now() - 50,
				latency_ms: 1,
			},
		});
		const upstream = makeDelayedSseResponse([
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
				},
			},
			{
				data: {
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
				},
			},
			{
				data: {
					object: "chat.completion",
					choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
				},
			},
		], 20);

		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx,
			provider: "openai",
			priceCard: null,
		});

		await drain(response);

		expect(typeof ctx.meta.latency_ms).toBe("number");
		expect(ctx.meta.provider_ttft_ms).toBe(ctx.meta.latency_ms);
		expect((ctx.meta.gateway_ttft_ms as number)!).toBeGreaterThan(
			ctx.meta.provider_ttft_ms as number,
		);
		expect(typeof ctx.meta.generation_ms).toBe("number");
		expect(typeof ctx.meta.end_to_end_ms).toBe("number");
		expect((ctx.meta.latency_ms as number)!).toBeGreaterThan(1);
		expect((ctx.meta.end_to_end_ms as number)!).toBeGreaterThanOrEqual((ctx.meta.latency_ms as number)!);
		expect((ctx.meta.generation_ms as number)!).toBeGreaterThanOrEqual((ctx.meta.latency_ms as number)!);
	});

});
