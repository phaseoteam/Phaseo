import { describe, expect, it, vi } from "vitest";
import { StreamSession, observeStreamOutcome } from "./stream-session";
import { createPricedStreamSession } from "./streaming";
import { RequestOperations, withRequestOperations } from "@/runtime/request-operations";

const complete = { aborted: false, sawFinalUsage: true };
const opts = (upstream: Response) => ({
	upstream, ctx: { requestId: "session-test", workspaceId: "test", endpoint: "chat.completions",
		protocol: "openai.chat.completions", meta: {} } as any, provider: "poolside", priceCard: null,
});
const chunk = 'data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"hello"}}]}\n\n';
const terminal = 'data: {"object":"chat.completion.chunk","choices":[],"usage":{"total_tokens":7}}\n\ndata: [DONE]\n\n';

describe("StreamSession", () => {
	it("separates observed output from successful client writes and freezes relative timings", () => {
		let now = 100;
		const session = new StreamSession(() => now);
		now = 110; session.observeOutput(); session.observeStop("max_tokens");
		now = 130; session.delivered(12); session.observeOutput();
		now = 140; session.observeStop("end_turn");
		const outcome = session.finish(null, complete);
		expect(outcome).toMatchObject({ finishReason: "length", timing: { firstFrameMs: 30, firstOutputObservedMs: 10, durationMs: 40 } });
		expect(Object.isFrozen(outcome.timing)).toBe(true);
		now = 999; session.delivered(12); session.observeStop("error");
		expect(session.finish(null, complete)).toBe(outcome);
	});
	it("does not turn absent delivery or output into zero-latency observations", () => {
		const session = new StreamSession(() => 100);
		session.disconnect();
		expect(session.finish(null, complete).timing).toEqual({ firstFrameMs: null, firstOutputObservedMs: null, durationMs: 0 });
	});
	it("redacts unknown stop reasons and usage payloads from diagnostics", () => {
		const session = new StreamSession();
		session.observeStop("private-output-".repeat(100_000));
		const summary = observeStreamOutcome(session.finish({ secret: "private-usage" }, complete));
		expect(summary.finishReason).toBe("other");
		expect(JSON.stringify(summary)).not.toContain("private");
		expect(JSON.stringify(summary).length).toBeLessThan(1024);
	});
	it("shares exactly one terminal outcome, ignoring duplicate/late transitions", async () => {
		const session = new StreamSession();
		const consumers = [session.completion, session.completion];
		expect(session.state).toBe("PRE_COMMIT");
		session.delivered(10);
		expect(session.state).toBe("STREAMING");
		const outcome = session.finish({ total_tokens: 7 }, complete);
		session.disconnect(); session.delivered(20);
		expect(session.finish(null, { aborted: true, sawFinalUsage: false })).toBe(outcome);
		expect(await Promise.all(consumers)).toEqual([outcome, outcome]);
		expect(outcome).toMatchObject({ state: "COMPLETED", committed: true, deliveredFrames: 1,
			deliveredBytes: 10, downstreamDisconnected: false, usage: { total_tokens: 7 } });
		expect(Object.isFrozen(outcome)).toBe(true);
		expect(Object.isFrozen(outcome.finalInfo)).toBe(true);
	});
	it("does not settle on disconnect before recovered usage is available", async () => {
		const session = new StreamSession(); const observer = vi.fn();
		void session.completion.then(observer);
		session.disconnect(); session.delivered(10);
		await Promise.resolve(); expect(observer).not.toHaveBeenCalled();
		expect(session.state).toBe("PRE_COMMIT");
		session.finish({ total_tokens: 7 }, complete);
		expect(await session.completion).toMatchObject({ state: "CANCELLED", committed: false,
			usage: { total_tokens: 7 }, finalInfo: complete });
	});
	it("upstream failure wins over disconnect, but never discards observed usage", async () => {
		const session = new StreamSession(); session.disconnect();
		session.finish({ total_tokens: 3 }, { aborted: true, sawFinalUsage: false, failureOrigin: "provider" });
		expect(await session.completion).toMatchObject({ state: "FAILED", usage: { total_tokens: 3 }, downstreamDisconnected: true });
	});
	it.each([0, -1, NaN, Infinity, 1.5])("rejects invalid delivery size %s", value => {
		const session = new StreamSession();
		expect(() => session.delivered(value)).toThrow(RangeError);
		expect(session.committed).toBe(false);
	});
});

describe("priced stream session integration", () => {
	it("records redacted stream outcomes in the existing sampled operation scope", async () => {
		const metrics = new RequestOperations();
		await withRequestOperations(metrics, async () => {
			const { response, session } = await createPricedStreamSession(opts(new Response(chunk + terminal)));
			await response.text(); await session.completion;
		});
		expect(metrics.snapshot()).toMatchObject({ total: {}, stream: {
			state: "COMPLETED", committed: true, deliveredFrames: 3, sawFinalUsage: true,
			firstFrameMs: expect.any(Number), firstOutputObservedMs: expect.any(Number), durationMs: expect.any(Number),
		} });
		expect(JSON.stringify(metrics.snapshot())).not.toContain("hello");
		expect(JSON.stringify(metrics.snapshot())).not.toContain("total_tokens");
	});
	it("commits only after the downstream accepts a frame, not when headers return", async () => {
		const { response, session } = await createPricedStreamSession(opts(new Response(chunk + terminal)));
		expect(session.state).toBe("PRE_COMMIT"); expect(session.committed).toBe(false);
		const text = await response.text();
		expect(await session.completion).toMatchObject({ state: "COMPLETED", committed: true,
			deliveredFrames: 3, deliveredBytes: new TextEncoder().encode(text).length, usage: { total_tokens: 7 } });
	});
	it("retains usage and completes once after client cancellation", async () => {
		const { response, session } = await createPricedStreamSession(opts(new Response(chunk + terminal)));
		const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
		expect(await session.completion).toMatchObject({ state: "CANCELLED", downstreamDisconnected: true,
			usage: { total_tokens: 7 }, finalInfo: complete });
	});
	it("marks native errors failed even when their wire terminal arrived intact", async () => {
		const { response, session } = await createPricedStreamSession(opts(new Response('data: {"error":{"code":"rate_limit_exceeded"}}\n\n')));
		await response.text();
		expect(await session.completion).toMatchObject({ state: "FAILED", committed: true,
			finalInfo: { aborted: false, sawFinalUsage: false } });
	});
	it("marks failed full response snapshots failed", async () => {
		const options = opts(new Response('data: {"object":"response","status":"failed","usage":{"total_tokens":2}}\n\n'));
		options.ctx.protocol = "openai.responses";
		const { response, session } = await createPricedStreamSession(options);
		await response.text(); expect((await session.completion).state).toBe("FAILED");
	});
	it("marks mapping faults failed before commitment without falsely reporting a disconnect", async () => {
		const { response, session } = await createPricedStreamSession({ ...opts(new Response(chunk)),
			rewriteFrame: () => { throw new Error("mapping failed"); },
		});
		await expect(response.text()).rejects.toThrow("mapping failed");
		expect(await session.completion).toMatchObject({ state: "FAILED", committed: false, downstreamDisconnected: false,
			finalInfo: { aborted: true, sawFinalUsage: false, failureOrigin: "gateway" } });
	});
	it("settles missing bodies without commitment", async () => {
		const { response, session } = await createPricedStreamSession(opts(new Response(null)));
		await response.text(); expect(await session.completion).toMatchObject({ state: "FAILED", committed: false });
	});
	it("isolates finalization consumer faults from the shared outcome and other consumers", async () => {
		const observer = vi.fn(); const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { response, session } = await createPricedStreamSession({ ...opts(new Response(chunk + terminal)),
				onFinalUsage: () => { throw new Error("consumer failed"); }, onCompletion: observer,
			});
			await response.text(); const outcome = await session.completion;
			await vi.waitFor(() => expect(observer).toHaveBeenCalledExactlyOnceWith(outcome));
			expect(outcome.state).toBe("COMPLETED");
		} finally { errorLog.mockRestore(); }
	});
});
