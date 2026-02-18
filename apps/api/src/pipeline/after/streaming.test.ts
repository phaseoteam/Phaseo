import { describe, expect, it } from "vitest";
import { passthroughWithPricing } from "./streaming";

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

async function drain(response: Response): Promise<string> {
	return await response.text();
}

function baseCtx(overrides?: Record<string, unknown>): any {
	return {
		requestId: "req_streaming_test",
		teamId: "team_test",
		endpoint: "responses",
		protocol: "openai.responses",
		meta: {},
		...overrides,
	};
}

describe("passthroughWithPricing", () => {
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
});
