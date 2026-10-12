import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	store: { kind: "upstash", get: vi.fn(), set: vi.fn(), delete: vi.fn() } as any,
	background: [] as Promise<unknown>[],
	getResponseCache: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getResponseCache: mocks.getResponseCache,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
}));

import { createStreamCacheCapture } from "./response-cache-stream";

function ctx(overrides: Record<string, unknown> = {}): any {
	return {
		requestId: "req_source",
		endpoint: "chat.completions",
		model: "openai/gpt-5.4-nano",
		routingMode: "balanced",
		preset: null,
		responseCache: {
			enabled: true,
			status: "miss",
			reason: null,
			key: "gateway:response-cache:v2:key_123:abc",
			fingerprint: "abc",
			ttlSeconds: 120,
			ttlSource: "request",
		},
		...overrides,
	};
}

function result(status = 200): any {
	return {
		provider: "openai",
		upstream: new Response(null, { status }),
		bill: { usage: { prompt_tokens: 3 }, currency: "USD", upstream_id: "chatcmpl_native" },
	};
}

function capture(args: { ctx?: any; result?: any; failed?: boolean; finishReason?: string | null; maxBytes?: number } = {}) {
	return createStreamCacheCapture({
		ctx: args.ctx ?? ctx(),
		result: args.result ?? result(),
		failed: () => args.failed ?? false,
		finishReason: () => args.finishReason === undefined ? "stop" : args.finishReason,
		maxBytes: args.maxBytes,
	});
}

const chunk = { eventName: null, data: { id: "req_source", object: "chat.completion.chunk", choices: [] } };

beforeEach(() => {
	mocks.background.length = 0;
	mocks.store.set.mockReset().mockResolvedValue(true);
	mocks.getResponseCache.mockReset().mockReturnValue(mocks.store);
});

describe("stream cache capture", () => {
	it("stores the frames of a stream that finished cleanly", async () => {
		const cap = capture()!;
		cap.onOutboundFrame(chunk);
		cap.onOutboundFrame({ raw: "data: [DONE]" });
		cap.onStreamEnd({ aborted: false, downstreamClosed: false });
		await Promise.all(mocks.background);

		expect(mocks.store.set).toHaveBeenCalledTimes(1);
		const [key, record, ttl] = mocks.store.set.mock.calls[0];
		expect(key).toBe("gateway:response-cache:v2:key_123:abc");
		expect(ttl).toBe(120);
		expect(record).toMatchObject({
			statusCode: 200,
			responseBody: null,
			sourceRequestId: "req_source",
			finishReason: "stop",
			streamFrames: [chunk, { raw: "data: [DONE]" }],
		});
	});

	it("does not store aborted, disconnected, failed or cancelled streams", async () => {
		const cases = [
			{ end: { aborted: true, downstreamClosed: false } },
			{ end: { aborted: false, downstreamClosed: true } },
			{ end: { aborted: false, downstreamClosed: false }, failed: true },
			{ end: { aborted: false, downstreamClosed: false }, finishReason: "cancel" },
			{ end: { aborted: false, downstreamClosed: false }, finishReason: "error" },
		];
		for (const entry of cases) {
			const cap = capture({ failed: entry.failed, finishReason: entry.finishReason })!;
			cap.onOutboundFrame(chunk);
			cap.onStreamEnd(entry.end);
		}
		await Promise.all(mocks.background);
		expect(mocks.store.set).not.toHaveBeenCalled();
	});

	it("drops streams larger than the cap", async () => {
		const cap = capture({ maxBytes: 20 })!;
		cap.onOutboundFrame(chunk);
		cap.onStreamEnd({ aborted: false, downstreamClosed: false });
		await Promise.all(mocks.background);
		expect(mocks.store.set).not.toHaveBeenCalled();
	});

	it("snapshots frames so later mutation does not change the stored stream", async () => {
		const frame = { eventName: null, data: { value: "first" } };
		const cap = capture()!;
		cap.onOutboundFrame(frame);
		frame.data.value = "changed";
		cap.onStreamEnd({ aborted: false, downstreamClosed: false });
		await Promise.all(mocks.background);
		expect(mocks.store.set.mock.calls[0][1].streamFrames[0].data.value).toBe("first");
	});

	it("captures nothing for hits, bypasses, non-200 responses or without a store", () => {
		expect(capture({ ctx: ctx({ responseCache: { enabled: true, status: "hit" } }) })).toBeNull();
		expect(capture({ ctx: ctx({ responseCache: { enabled: false, status: "bypass" } }) })).toBeNull();
		expect(capture({ result: result(500) })).toBeNull();
		mocks.getResponseCache.mockReturnValue(null);
		expect(capture()).toBeNull();
	});
});
