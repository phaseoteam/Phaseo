// Text-to-speech results arrive as kind: "stream" while ctx.stream is false. They must reach
// the client byte for byte and still be priced, charged once and audited.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	charge: vi.fn(),
	auditSuccess: vi.fn(),
	auditFailure: vi.fn(),
	background: [] as Promise<unknown>[],
}));

vi.mock("./audit", () => ({ handleSuccessAudit: mocks.auditSuccess, handleFailureAudit: mocks.auditFailure }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: mocks.charge }));
vi.mock("./guards", () => ({ guardUpstreamStatus: async () => ({ ok: true }) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn() }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn() }));
vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: Math.ceil(baseCostNanos / 1e7),
		totalNanos: baseCostNanos,
		currency: currencyHint,
		pricedUsage,
	}),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return {
		...actual,
		ensureRuntimeForBackground: () => () => {},
		dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
		getResponseCache: () => null,
	};
});

import { finalizeRequest } from "./index";
import { meterSpeechStream } from "./speech-stream";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import type { PriceCard, PriceRule } from "../pricing/types";

const rule = (meter: string, price: string): PriceRule => ({
	id: `${meter}_rule`,
	pricing_plan: "standard",
	meter: meter as PriceRule["meter"],
	unit: "token",
	unit_size: 1_000_000,
	price_per_unit: price,
	currency: "USD",
	match: [],
	priority: 100,
});

// gpt-4o-mini-tts: $0.60 per 1M text input tokens, $12 per 1M audio output tokens.
const card = {
	provider: "openai",
	model: "openai/gpt-4o-mini-tts",
	endpoint: "audio.speech",
	version: "test",
	currency: "USD",
	effective_from: null,
	effective_to: null,
	rules: [rule("input_text_tokens", "0.6"), rule("output_audio_tokens", "12")],
} as unknown as PriceCard;
const speechUsage = { input_tokens: 31, output_tokens: 1_337, total_tokens: 1_368, input_text_tokens: 31, output_audio_tokens: 1_337, requests: 1 };
const expectedNanos = Math.round(31 * 0.6 * 1000) + Math.round(1_337 * 12 * 1000);

async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await Promise.all(mocks.background.splice(0));
	}
}

function ctxFor(body: Record<string, unknown> = {}): any {
	return {
		requestId: "req_speech",
		billingRequestId: "bill_speech",
		workspaceId: "ws_speech",
		endpoint: "audio.speech",
		capability: "audio.speech",
		model: "openai/gpt-4o-mini-tts",
		requestedModel: "openai/gpt-4o-mini-tts",
		stream: false,
		body: { model: "openai/gpt-4o-mini-tts", input: "Hello there", voice: "alloy", ...body },
		rawBody: {},
		meta: { requestId: "req_speech", startedAtMs: Date.now() - 50 },
		providers: [],
		pricing: { openai: card },
		timer: { span: (_name: string, fn: () => unknown) => fn(), mark: () => {}, end: () => {} },
	};
}

function byteStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	let index = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index < chunks.length) controller.enqueue(chunks[index++]);
			else controller.close();
		},
	});
}

function speechResult(args: { stream: ReadableStream<Uint8Array>; usageFinalizer?: () => Promise<any>; billUsage?: any; headers?: Record<string, string> }): any {
	const bill = { cost_cents: 0, currency: "USD", usage: args.billUsage, upstream_id: "upstream_req_1", finish_reason: null };
	return {
		kind: "stream",
		provider: "openai",
		pricingKey: "openai",
		generationTimeMs: 1,
		upstream: new Response(null, {
			status: 200,
			headers: { "content-type": "audio/mpeg", "x-request-id": "upstream_req_1", "set-cookie": "session=secret", "x-ratelimit-remaining-requests": "9", ...args.headers },
		}),
		stream: args.stream,
		usageFinalizer: args.usageFinalizer ?? (async () => bill),
		bill,
	};
}

async function finalize(result: any, body?: Record<string, unknown>) {
	return finalizeRequest({ pre: { ok: true, ctx: ctxFor(body) }, exec: { ok: true, result }, endpoint: "audio.speech" as any });
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

beforeEach(() => {
	mocks.charge.mockReset().mockResolvedValue(undefined);
	mocks.auditSuccess.mockReset().mockResolvedValue(undefined);
	mocks.auditFailure.mockReset().mockResolvedValue(undefined);
	mocks.background.length = 0;
});

describe("text-to-speech stream finalisation", () => {
	it("forwards the audio and charges the provider-reported usage once", async () => {
		const audio = [new Uint8Array([0x49, 0x44, 0x33]), new Uint8Array([0x55, 0x55])];
		const response = await finalize(speechResult({ stream: byteStream(audio), billUsage: speechUsage }));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("audio/mpeg");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(response.headers.get("x-ratelimit-remaining-requests")).toBeNull();
		expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0x49, 0x44, 0x33, 0x55, 0x55]);
		await settle();

		expect(mocks.charge).toHaveBeenCalledTimes(1);
		expect(mocks.charge.mock.calls[0][0].costNanos).toBe(expectedNanos);
		expect(mocks.auditSuccess).toHaveBeenCalledTimes(1);
		expect(mocks.auditFailure).not.toHaveBeenCalled();
	});

	it("does not settle before the client has read the body", async () => {
		const response = await finalize(speechResult({ stream: byteStream([new Uint8Array([1, 2])]), billUsage: speechUsage }));
		await settle();
		expect(mocks.charge).not.toHaveBeenCalled();

		await response.arrayBuffer();
		await settle();
		expect(mocks.charge).toHaveBeenCalledTimes(1);
	});

	it("bills a cancelled SSE stream from the usage the provider reports at the end", async () => {
		let resolveUsage!: (usage: any) => void;
		const reported = new Promise((resolve) => { resolveUsage = resolve; });
		const sseFrames = [
			new TextEncoder().encode("data: {\"type\":\"speech.audio.delta\",\"audio\":\"SUQz\"}\n\n"),
			new TextEncoder().encode("data: {\"type\":\"speech.audio.delta\",\"audio\":\"VVVV\"}\n\n"),
		];
		const response = await finalize(
			speechResult({
				stream: byteStream(sseFrames),
				usageFinalizer: async () => ({ cost_cents: 0, currency: "USD", usage: await reported }),
				headers: { "content-type": "text/event-stream" },
			}),
			{ stream_format: "sse" },
		);
		expect(response.headers.get("content-type")).toBe("text/event-stream");

		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel("client went away");
		resolveUsage(speechUsage);
		await settle();

		expect(mocks.charge).toHaveBeenCalledTimes(1);
		expect(mocks.charge.mock.calls[0][0].costNanos).toBe(expectedNanos);
		expect(mocks.auditSuccess).toHaveBeenCalledTimes(1);
		// handleSuccessAudit(ctx, result, isStream, usage, cents, nanos, currency, finishReason, ...)
		expect(mocks.auditSuccess.mock.calls[0][5]).toBe(expectedNanos);
		expect(mocks.auditSuccess.mock.calls[0][7]).toBe("cancel");
	});

	it("records a failure for reconciliation instead of a $0 success when no usage was reported", async () => {
		const response = await finalize(speechResult({ stream: byteStream([new Uint8Array([1])]), usageFinalizer: async () => null }));
		await response.arrayBuffer();
		await settle();

		expect(mocks.charge).not.toHaveBeenCalled();
		expect(mocks.auditSuccess).not.toHaveBeenCalled();
		expect(mocks.auditFailure).toHaveBeenCalledTimes(1);
		// handleFailureAudit(ctx, result, status, attribution, errorCode, ...)
		expect(mocks.auditFailure.mock.calls[0][4]).toBe("speech_usage_missing");
	});

	it("does not charge when the upstream audio stream fails part-way", async () => {
		let sent = false;
		const failing = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (!sent) {
					sent = true;
					controller.enqueue(new Uint8Array([0x49, 0x44, 0x33]));
					return;
				}
				controller.error(new Error("upstream reset"));
			},
		});
		const result = speechResult({ stream: failing, billUsage: speechUsage });
		const response = await finalize(result);
		await response.arrayBuffer().catch(() => undefined);
		await settle();

		expect(mocks.charge).not.toHaveBeenCalled();
		expect(mocks.auditSuccess).not.toHaveBeenCalled();
		expect(mocks.auditFailure).toHaveBeenCalledTimes(1);
		expect(mocks.auditFailure.mock.calls[0][2]).toBe(502);
		expect(mocks.auditFailure.mock.calls[0][4]).toBe("upstream_stream_failure");
		expect(result.bill.cost_cents).toBe(0);
		expect(result.bill.usage.pricing).toMatchObject({ total_nanos: 0, billing_suppressed: true, billing_suppression_reason: "upstream_failure" });
	});
});

describe("meterSpeechStream", () => {
	it("passes chunks through and settles once with the delivered byte count", async () => {
		const onSettle = vi.fn();
		const metered = meterSpeechStream(byteStream([new Uint8Array(3), new Uint8Array(4)]), onSettle);
		const reader = metered.getReader();
		while (!(await reader.read()).done) { /* drain */ }
		await reader.cancel().catch(() => undefined);

		expect(onSettle).toHaveBeenCalledTimes(1);
		expect(onSettle).toHaveBeenCalledWith("completed", 7);
	});

	it("settles as errored when the upstream body fails mid-stream", async () => {
		const onSettle = vi.fn();
		let sent = false;
		const failing = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (!sent) { sent = true; controller.enqueue(new Uint8Array(5)); return; }
				controller.error(new Error("upstream reset"));
			},
		});
		const reader = meterSpeechStream(failing, onSettle).getReader();
		await reader.read();
		await expect(reader.read()).rejects.toThrow("upstream reset");

		expect(onSettle).toHaveBeenCalledWith("errored", 5);
	});
});
