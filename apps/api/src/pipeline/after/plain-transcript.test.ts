// Transcriptions and translations requested as text, srt or vtt come back as the
// bare body (as OpenAI returns them), and are still priced and charged once.
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
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import type { PriceCard } from "../pricing/types";

// whisper-large-v3: $0.111 per hour of input audio.
const card = {
	provider: "groq",
	model: "groq/whisper-large-v3",
	endpoint: "audio.transcription",
	version: "test",
	currency: "USD",
	effective_from: null,
	effective_to: null,
	rules: [{
		id: "input_audio_seconds_rule",
		pricing_plan: "standard",
		meter: "input_audio_seconds",
		unit: "second",
		unit_size: 3600,
		price_per_unit: "0.111",
		currency: "USD",
		match: [],
		priority: 100,
	}],
} as unknown as PriceCard;
// 120 s of audio: 120 / 3600 x $0.111 = $0.0037.
const usage = { input_audio_seconds: 120, requests: 1 };
const expectedNanos = 3_700_000;

const SRT = "1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n";

async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await Promise.all(mocks.background.splice(0));
	}
}

function ctxFor(endpoint: "audio.transcription" | "audio.translations", responseFormat: string): any {
	return {
		requestId: "req_stt",
		billingRequestId: "bill_stt",
		workspaceId: "ws_stt",
		endpoint,
		capability: endpoint,
		model: "groq/whisper-large-v3",
		requestedModel: "groq/whisper-large-v3",
		stream: false,
		body: { model: "groq/whisper-large-v3", response_format: responseFormat },
		rawBody: {},
		meta: { requestId: "req_stt", startedAtMs: Date.now() - 50 },
		providers: [],
		pricing: { groq: card },
		timer: { span: (_name: string, fn: () => unknown) => fn(), mark: () => {}, end: () => {} },
	};
}

function completedResult(text: string, upstreamContentType: string): any {
	return {
		kind: "completed",
		provider: "groq",
		pricingKey: "groq",
		generationTimeMs: 1,
		upstream: new Response(text, { status: 200, headers: { "content-type": upstreamContentType } }),
		normalized: { id: "req_stt", object: "transcription", model: "groq/whisper-large-v3", text, usage },
		bill: { cost_cents: 0, currency: "USD", usage, upstream_id: "upstream_stt", finish_reason: null },
	};
}

async function finalize(endpoint: "audio.transcription" | "audio.translations", responseFormat: string, result: any) {
	return finalizeRequest({ pre: { ok: true, ctx: ctxFor(endpoint, responseFormat) }, exec: { ok: true, result }, endpoint: endpoint as any });
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

beforeEach(() => {
	mocks.charge.mockReset().mockResolvedValue(undefined);
	mocks.auditSuccess.mockReset().mockResolvedValue(undefined);
	mocks.auditFailure.mockReset().mockResolvedValue(undefined);
	mocks.background.length = 0;
});

describe("plain transcript formats", () => {
	it("returns an srt transcription body as sent by the provider and charges its audio seconds", async () => {
		const response = await finalize("audio.transcription", "srt", completedResult(SRT, "text/plain; charset=utf-8"));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(await response.text()).toBe(SRT);
		await settle();
		expect(mocks.charge).toHaveBeenCalledTimes(1);
		expect(mocks.charge.mock.calls[0][0].costNanos).toBe(expectedNanos);
	});

	it("returns a text translation as plain text", async () => {
		const response = await finalize("audio.translations", "text", completedResult("Hello there.\n", "text/plain; charset=utf-8"));

		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(await response.text()).toBe("Hello there.\n");
		await settle();
		expect(mocks.charge.mock.calls[0][0].costNanos).toBe(expectedNanos);
	});

	it("keeps the provider's subtitle content type for vtt", async () => {
		const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHello there.\n";
		const response = await finalize("audio.transcription", "vtt", completedResult(vtt, "text/vtt; charset=utf-8"));

		expect(response.headers.get("content-type")).toBe("text/vtt; charset=utf-8");
		expect(await response.text()).toBe(vtt);
	});

	it("returns text from a provider that answered in JSON", async () => {
		const response = await finalize("audio.transcription", "text", completedResult("Hello there.", "application/json"));

		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(await response.text()).toBe("Hello there.");
	});

	it("keeps JSON for json formats and for subtitles a provider returned as JSON", async () => {
		const json = await finalize("audio.transcription", "json", completedResult("Hello there.", "application/json"));
		expect(json.headers.get("content-type")).toContain("application/json");
		expect(await json.json()).toMatchObject({ text: "Hello there." });

		const jsonSubtitle = await finalize("audio.transcription", "srt", completedResult("Hello there.", "application/json"));
		expect(jsonSubtitle.headers.get("content-type")).toContain("application/json");
		await settle();
		expect(mocks.charge.mock.calls[0][0].costNanos).toBe(expectedNanos);
	});
});
