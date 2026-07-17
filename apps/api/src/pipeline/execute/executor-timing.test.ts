import { describe, expect, it } from "vitest";
import type { ExecutorResult } from "@executors/types";
import { instrumentTextExecutorTiming } from "./executor-timing";

function streamingResult(stream: ReadableStream<Uint8Array>): ExecutorResult {
	return {
		kind: "stream",
		stream,
		upstream: new Response(null, { status: 200 }),
		provider: "openai",
		bill: { cost_cents: 0, currency: "USD" },
	} as ExecutorResult;
}

describe("instrumentTextExecutorTiming", () => {
	it("measures latency and generation for every uninstrumented executor stream", async () => {
		const encoder = new TextEncoder();
		let index = 0;
		const stream = new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (index >= 2) {
					controller.close();
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 8));
				controller.enqueue(encoder.encode(index++ === 0 ? "first" : "second"));
			},
		});
		const result = instrumentTextExecutorTiming(streamingResult(stream), Date.now());
		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") throw new Error("Expected stream result");
		await new Response(result.stream).text();

		expect(result.timing?.streamTimingSource).toBe("executor");
		expect(result.timing?.latencyMs).toBeGreaterThan(0);
		expect(result.timing?.generationMs).toBeGreaterThan(0);
		expect(result.timing?.totalMs).toBeGreaterThanOrEqual(result.timing?.latencyMs ?? 0);
	});

	it("attributes effectively buffered streams to generation consistently", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode("first"));
				controller.enqueue(encoder.encode("second"));
				controller.close();
			},
		});
		const result = instrumentTextExecutorTiming(streamingResult(stream), Date.now() - 20);
		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") throw new Error("Expected stream result");
		await new Response(result.stream).text();

		expect(result.timing?.latencyMs).toBe(0);
		expect(result.timing?.generationMs).toBeGreaterThanOrEqual(20);
		expect(result.timing?.totalMs).toBe(result.timing?.generationMs);
	});

	it("does not wrap streams already measured by a provider executor", () => {
		const stream = new ReadableStream<Uint8Array>();
		const result = streamingResult(stream);
		result.timing = { streamTimingSource: "provider" };
		const instrumented = instrumentTextExecutorTiming(result, Date.now());

		expect(instrumented.kind).toBe("stream");
		if (instrumented.kind !== "stream") throw new Error("Expected stream result");
		expect(instrumented.stream).toBe(stream);
	});

	it("normalizes buffered completed responses with output tokens", () => {
		const result = {
			kind: "completed",
			ir: { usage: { outputTokens: 12 } },
			upstream: new Response(null, { status: 200 }),
			provider: "google-ai-studio",
			bill: { cost_cents: 0, currency: "USD" },
			timing: { latencyMs: 40, generationMs: 0, totalMs: 40 },
		} as ExecutorResult;

		instrumentTextExecutorTiming(result, Date.now() - 40);

		expect(result.timing).toMatchObject({
			latencyMs: 0,
			generationMs: 40,
			totalMs: 40,
		});
	});
});
