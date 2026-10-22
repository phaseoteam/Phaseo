import { describe, expect, it } from "vitest";
import { passthroughWithPricing } from "./streaming";
import { createAnthropicToResponsesStreamTransformer } from "@executors/anthropic/text-generate/stream-transformer";

function makeSseResponse(frames: Array<{ event?: string; data: any }>): Response {
	const text = frames
		.map((frame) => {
			const eventLine = frame.event ? `event: ${frame.event}\n` : "";
			return `${eventLine}data: ${JSON.stringify(frame.data)}\n\n`;
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
			const chunk = `${eventLine}data: ${JSON.stringify(frame?.data ?? {})}\n\n`;
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

describe("passthroughWithPricing client stream grammar", () => {
	function dataFrames(text: string): string[] {
		return text.split(/\n\n/).map((block) => block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "").filter(Boolean);
	}

	it("sends Chat clients chunks only, then one [DONE], while internal hooks still see the snapshot", async () => {
		const snapshots: any[] = [];
		const usageCalls: any[] = [];
		const frames = makeSseResponse([
			{ data: { id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }] } },
			{ data: { id: "c", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "length" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } } },
		]);
		const upstream = new Response(`${await frames.text()}data: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({ endpoint: "chat.completions", protocol: "openai.chat.completions" }),
			provider: "groq",
			priceCard: null,
			onFinalSnapshot: (snapshot) => snapshots.push(snapshot),
			onFinalUsage: (usage) => {
				usageCalls.push(usage);
			},
		});
		const out = dataFrames(await drain(response));
		expect(out[out.length - 1]).toBe("[DONE]");
		expect(out.filter((frame) => frame === "[DONE]")).toHaveLength(1);
		const chunks = out.slice(0, -1).map((frame) => JSON.parse(frame));
		expect(chunks.every((chunk) => chunk.object === "chat.completion.chunk")).toBe(true);
		expect(chunks.flatMap((chunk) => chunk.choices.map((choice: any) => choice.finish_reason)).filter(Boolean)).toEqual(["length"]);
		expect(chunks[chunks.length - 1]).toMatchObject({ choices: [], usage: { prompt_tokens: 3 } });
		expect(snapshots[0]?.object).toBe("chat.completion");
		expect(usageCalls).toEqual([{ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }]);
	});

	it("sends Responses clients one name per event, sequence numbers and the lifecycle events a source left out", async () => {
		// A Claude stream as the Anthropic transformer delivers it to the client boundary.
		const claude = makeSseResponse([
			{ event: "message_start", data: { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 3, output_tokens: 1 } } } },
			{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Plan." } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } } },
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
			{ event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hi" } } },
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 1 } },
			{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } } },
			{ event: "message_stop", data: { type: "message_stop" } },
		]);
		const upstream = new Response(claude.body!.pipeThrough(createAnthropicToResponsesStreamTransformer("req_claude", "claude-sonnet-5", { providerId: "anthropic" })));
		const response = await passthroughWithPricing({ upstream, ctx: baseCtx(), provider: "anthropic", priceCard: null });
		const events = (await drain(response)).split(/\n\n/).filter(Boolean).map((block) => ({
			event: block.split("\n").find((line) => line.startsWith("event: "))?.slice(7),
			data: JSON.parse(block.split("\n").find((line) => line.startsWith("data: "))!.slice(6)),
		}));

		for (const [index, { event, data }] of events.entries()) {
			expect(data.type).toBe(event);
			expect(data.sequence_number).toBe(index);
		}
		const names = events.map(({ event }) => event);
		expect(names.slice(0, 2)).toEqual(["response.created", "response.in_progress"]);
		const reasoningDone = names.indexOf("response.reasoning_text.done");
		expect(reasoningDone).toBeGreaterThan(names.indexOf("response.reasoning_text.delta"));
		expect(names[reasoningDone + 1]).toBe("response.content_part.done");
		expect(events[reasoningDone].data).toMatchObject({ text: "Plan.", content_index: 0 });
		expect(names.at(-1)).toBe("response.completed");
	});

	it("does not forward frames of another protocol that map to no client event", async () => {
		const upstream = makeSseResponse([
			{ event: "response.created", data: { type: "response.created", response: { id: "r", object: "response", status: "in_progress" } } },
			{ event: "response.output_text.delta", data: { type: "response.output_text.delta", output_index: 0, item_id: "m", delta: "Hi" } },
			{ event: "response.output_text.done", data: { type: "response.output_text.done", output_index: 0, item_id: "m", text: "Hi" } },
			{ event: "response.completed", data: { type: "response.completed", response: { id: "r", object: "response", status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } } } },
		]);
		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({ endpoint: "messages", protocol: "anthropic.messages" }),
			provider: "google-ai-studio",
			priceCard: null,
		});
		const types = dataFrames(await drain(response)).map((frame) => JSON.parse(frame).type);
		expect(types).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"]);
	});
});

describe("passthroughWithPricing", () => {
	// A native Messages stream (Claude Opus 5.5 on Bedrock and Vertex) reports input and cache
	// counts on message_start; message_delta carries the output and may repeat the rest as 0.
	it.each([
		["omits them", { output_tokens: 9 }],
		["repeats them as 0", { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 9 }],
	])("settles a native Messages stream with message_start's input and cache counts when message_delta %s", async (_name, deltaUsage) => {
		const usageCalls: Array<any> = [];
		const upstream = makeSseResponse([
			{ event: "message_start", data: { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 30, cache_read_input_tokens: 4, cache_creation_input_tokens: 2, output_tokens: 1 } } } },
			{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } } },
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
			{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: deltaUsage } },
			{ event: "message_stop", data: { type: "message_stop" } },
		]);
		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx({ endpoint: "messages", protocol: "anthropic.messages" }),
			provider: "amazon-bedrock",
			priceCard: null,
			onFinalUsage: (usage) => {
				usageCalls.push(usage);
			},
		});
		await drain(response);
		expect(usageCalls).toEqual([{ input_tokens: 30, cache_read_input_tokens: 4, cache_creation_input_tokens: 2, output_tokens: 9 }]);
	});

	it("finalizes usage from response.incomplete and strips the internal stop carrier", async () => {
		const usageCalls: Array<any> = [];
		const snapshots: Array<any> = [];
		const upstream = makeSseResponse([
			{ event: "response.created", data: { response: { id: "resp_1", object: "response", status: "in_progress" } } },
			{
				event: "response.incomplete",
				data: {
					type: "response.incomplete",
					response: {
						id: "resp_1",
						object: "response",
						status: "incomplete",
						incomplete_details: { reason: "content_filter" },
						_phaseo_stop: { reason: "refusal" },
						usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
					},
				},
			},
		]);

		const response = await passthroughWithPricing({
			upstream,
			ctx: baseCtx(),
			provider: "anthropic",
			priceCard: null,
			onFinalSnapshot: (snapshot) => snapshots.push(snapshot),
			onFinalUsage: (usage) => {
				usageCalls.push(usage);
			},
		});

		const text = await drain(response);
		expect(text).not.toContain("_phaseo_stop");
		expect(text).toContain("\"incomplete_details\":{\"reason\":\"content_filter\"}");
		expect(snapshots).toHaveLength(1);
		expect(usageCalls).toEqual([{ input_tokens: 3, output_tokens: 2, total_tokens: 5 }]);
	});

	it("finalizes usage once from response.completed events", async () => {
		const usageCalls: Array<any> = [];
		const upstream = makeSseResponse([
			{
				event: "response.created",
				data: { response: { id: "resp_1", object: "response", status: "in_progress" } },
			},
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_1",
						object: "response",
						status: "completed",
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
			onFinalUsage: (usage) => {
				usageCalls.push(usage);
			},
		});

		await drain(response);

		expect(usageCalls).toHaveLength(1);
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

	it("stops rewriting delta frames after the client disconnects but keeps accounting frames", async () => {
		const usageCalls: Array<{ usage: any; info: any }> = [];
		let resolveUsage: (() => void) | null = null;
		const usageSettled = new Promise<void>((resolve) => {
			resolveUsage = resolve;
		});
		const rewritten: any[] = [];
		const events: string[] = [];
		const delta = (content: string) => ({
			data: {
				id: "chatcmpl_fast_path",
				object: "chat.completion.chunk",
				choices: [{ index: 0, delta: { content }, finish_reason: null }],
			},
		});
		const upstream = makeDelayedSseResponse([
			delta("first"),
			delta("second"),
			delta("third"),
			{
				data: {
					id: "chatcmpl_fast_path",
					object: "chat.completion.chunk",
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				},
			},
			{
				data: {
					id: "chatcmpl_fast_path",
					object: "chat.completion.chunk",
					choices: [],
					usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
				},
			},
		], 10);
		const ctx = baseCtx({ endpoint: "chat.completions", protocol: "openai.chat.completions" });

		const response = await passthroughWithPricing({
			upstream: upstream.response,
			ctx,
			provider: "openai",
			priceCard: null,
			rewriteFrame: (frame) => {
				rewritten.push(frame);
				return frame;
			},
			onStreamEvent: (event) => {
				events.push(event.type === "delta_text" ? `text:${event.text}` : event.type);
			},
			onFinalUsage: (usage, info) => {
				usageCalls.push({ usage, info });
				resolveUsage?.();
			},
		});

		const reader = response.body!.getReader();
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toContain("first");
		await reader.cancel();
		await usageSettled;

		expect(ctx.meta.downstreamDisconnected).toBe(true);
		// Content deltas after the disconnect are not rewritten, but the terminal
		// and usage frames still are (their rewrite prices usage / runs plugins).
		const rewrittenContents = rewritten.map((frame) =>
			frame.usage ? "usage" : frame.choices?.[0]?.finish_reason ?? frame.choices?.[0]?.delta?.content,
		);
		expect(rewrittenContents[0]).toBe("first");
		expect(rewrittenContents).not.toContain("third");
		expect(rewrittenContents.slice(-2)).toEqual(["stop", "usage"]);
		// Stream events (tool/finish tracking for billing) are still observed.
		expect(events).toEqual(expect.arrayContaining(["text:first", "text:second", "text:third", "stop", "usage"]));
		expect(usageCalls).toEqual([{
			usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
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

		await drain(response);

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
