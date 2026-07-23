import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeProtocol } from "@/protocols";
import { passthroughWithPricing } from "@/pipeline/after/streaming";
import type { PipelineContext } from "@/pipeline/before/types";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import { emitGatewayRequestEvent } from "@/observability/events";

vi.mock("@/observability/axiom", () => ({
	sendAxiomWideEvent: vi.fn(async () => true),
}));

vi.mock("@/runtime/env", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/runtime/env")>();
	return {
		...original,
		dispatchBackground: (promise: Promise<unknown>) => void promise,
	};
});

const encoder = new TextEncoder();

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((left, right) => left - right);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

function streamFromFrames(frames: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame));
			controller.close();
		},
	});
}

function context(protocol: "openai.chat.completions" | "openai.responses"): PipelineContext {
	return {
		requestId: `perf-${protocol}`,
		workspaceId: "00000000-0000-0000-0000-000000000001",
		endpoint: protocol === "openai.responses" ? "responses" : "chat.completions",
		capability: "text.generate",
		protocol,
		model: "openai/gpt-5-mini",
		stream: true,
		meta: {},
		providers: [],
	} as unknown as PipelineContext;
}

async function consume(response: Response): Promise<number> {
	const reader = response.body!.getReader();
	let bytes = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		bytes += value?.byteLength ?? 0;
	}
	return bytes;
}

describe.skipIf(process.env.RUN_STREAM_PERF !== "1")("IR and stream conversion latency", () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => clearRuntime());

	it("measures request protocol decoding into IR", () => {
		const body = {
			model: "openai/gpt-5-mini",
			stream: true,
			messages: Array.from({ length: 40 }, (_, index) => ({
				role: index % 2 === 0 ? "user" : "assistant",
				content: `Message ${index}: ${"representative text ".repeat(8)}`,
			})),
			tools: Array.from({ length: 8 }, (_, index) => ({
				type: "function",
				function: {
					name: `tool_${index}`,
					description: "Representative tool",
					parameters: {
						type: "object",
						properties: { query: { type: "string" } },
					},
				},
			})),
		};
		for (let index = 0; index < 100; index += 1) {
			decodeProtocol("openai.chat.completions", body);
		}
		const samples: number[] = [];
		for (let index = 0; index < 2_000; index += 1) {
			const started = performance.now();
			decodeProtocol("openai.chat.completions", body);
			samples.push(performance.now() - started);
		}
		console.log(
			`[perf][ir-decode] messages=40 tools=8 p50=${percentile(samples, 50).toFixed(4)}ms p95=${percentile(samples, 95).toFixed(4)}ms p99=${percentile(samples, 99).toFixed(4)}ms`,
		);
		expect(percentile(samples, 95)).toBeLessThan(1);
	});

	it.each([
		["same-protocol chat", "openai.chat.completions" as const, "chat" as const],
		["responses to chat", "openai.chat.completions" as const, "responses" as const],
	])("measures %s SSE processing", async (_name, targetProtocol, source) => {
		const frameCount = 256;
		const frames = Array.from({ length: frameCount }, (_, index) => {
			if (source === "responses") {
				return `event: response.output_text.delta\ndata: ${JSON.stringify({
					type: "response.output_text.delta",
					delta: `token-${index}`,
				})}\n\n`;
			}
			return `data: ${JSON.stringify({
				id: "chatcmpl_perf",
				object: "chat.completion.chunk",
				choices: [{ index: 0, delta: { content: `token-${index}` }, finish_reason: null }],
			})}\n\n`;
		});

		const samples: number[] = [];
		for (let iteration = 0; iteration < 60; iteration += 1) {
			const upstream = new Response(streamFromFrames(frames), {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
			const started = performance.now();
			const response = await passthroughWithPricing({
				upstream,
				ctx: context(targetProtocol),
				provider: "benchmark",
				priceCard: null,
			});
			expect(await consume(response)).toBeGreaterThan(0);
			samples.push(performance.now() - started);
		}
		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		console.log(
			`[perf][sse-conversion] case=${source}-to-${targetProtocol} frames=${frameCount} total_p50=${p50.toFixed(3)}ms total_p95=${p95.toFixed(3)}ms per_frame_p50=${(p50 / frameCount).toFixed(4)}ms per_frame_p95=${(p95 / frameCount).toFixed(4)}ms`,
		);
		expect(p95 / frameCount).toBeLessThan(0.5);
	});

	it("measures compact request-wide-event assembly without network I/O", async () => {
		configureRuntime({
			NODE_ENV: "test",
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "benchmark-service-role",
			AXIOM_API_KEY: "benchmark",
			AXIOM_DATASET: "benchmark",
			AXIOM_SUCCESS_SAMPLE_RATE: "1",
			AXIOM_DETAIL_SAMPLE_RATE: "0",
			AXIOM_SLOW_REQUEST_MS: "999999",
			GATEWAY_CACHE: {} as KVNamespace,
		} as any);

		const samples: number[] = [];
		for (let iteration = 0; iteration < 1_000; iteration += 1) {
			const ctx = {
				...context("openai.chat.completions"),
				requestId: `perf-log-${iteration}`,
				providers: [{
					providerId: "openai",
					providerFamilyId: "openai",
					providerStatus: "active",
					providerRoutingStatus: "active",
					modelRoutingStatus: "active",
					capabilityStatus: "active",
					providerModelSlug: "gpt-5-mini",
					byokMeta: [],
					pricingCard: { id: "price" },
				}],
				providerAttempts: [{
					attempt_number: 1,
					provider: "openai",
					endpoint: "chat.completions",
					model: "openai/gpt-5-mini",
					provider_model_slug: "gpt-5-mini",
					outcome: "success",
					duration_ms: 100,
					status: 200,
					key_source: "gateway",
					credential_phase: "gateway",
					response_kind: "stream",
				}],
				meta: {
					latency_ms: 100,
					generation_ms: 500,
					throughput_tps: 50,
				},
			} as unknown as PipelineContext;
			const started = performance.now();
			await emitGatewayRequestEvent({
				ctx,
				provider: "openai",
				statusCode: 200,
				success: true,
				usage: { input_tokens: 100, output_tokens: 25 },
				pricing: { total_nanos: 1_000_000, currency: "USD" },
			});
			samples.push(performance.now() - started);
		}
		console.log(
			`[perf][axiom-event-build] p50=${percentile(samples, 50).toFixed(4)}ms p95=${percentile(samples, 95).toFixed(4)}ms p99=${percentile(samples, 99).toFixed(4)}ms`,
		);
		// This work runs after streamed delivery completes. Keep the guard broad
		// enough for shared CI hosts while still catching accidental heavy work.
		expect(percentile(samples, 95)).toBeLessThan(5);
	});
});
