// Delivered speech audio whose wallet charge fails: its failure row carries the standard
// pending-accounting fields. Runs the real speech finalizer, wallet charge (retries and refusal
// handling), handleFailureAudit and auditFailure; the database client and wallet debit are faked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
	rows: [] as Array<Record<string, any>>,
	debits: [] as Array<Record<string, any>>,
	wallet: "fails" as "fails" | "refuses",
	onRow: null as ((row: Record<string, any>) => void) | null,
}));
const mocks = vi.hoisted(() => ({ settleChargedFailureSpend: vi.fn(), releaseSpend: vi.fn(), background: [] as Promise<unknown>[] }));

function supabase() {
	const query: any = {
		insert: (row: Record<string, any>) => {
			db.rows.push(row);
			db.onRow?.(row);
			return { select: () => ({ single: async () => ({ data: { id: "row_1", created_at: "2026-11-06T00:00:00Z", workspace_id: row.workspace_id }, error: null }) }) };
		},
		select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
		upsert: async () => ({ error: null }),
		maybeSingle: async () => ({ data: null, error: null }),
		single: async () => ({ data: null, error: null }),
		then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
	};
	return { from: () => query, rpc: async () => ({ data: "fact", error: null }) };
}

vi.mock("./guards", () => ({ guardUpstreamStatus: async () => ({ ok: true }) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: async () => undefined }));
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => undefined }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: async () => undefined }));
vi.mock("./apps", () => ({ ensureAppId: async () => "app_1" }));
vi.mock("@core/workspace-usage-rollups", () => ({ syncWorkspaceUsageRollupForRequest: async () => undefined }));
vi.mock("../audit/io-logging", () => ({
	resolveGatewayIoLoggingPolicy: async () => ({ captureEnabled: false }),
	persistGatewayIoLog: async () => undefined,
	recordGatewayIoLogZeroDataRetentionSkip: async () => undefined,
	requestZeroDataRetention: () => false,
	keyKeepsContentOutOfTelemetry: async () => false,
}));
vi.mock("../audit/upstream-requests", () => ({ persistGatewayUpstreamRequests: async () => undefined }));
vi.mock("../audit/routing-archive", () => ({ archiveRoutingMetadata: async () => ({}) }));
vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: Math.ceil(baseCostNanos / 1e7), totalNanos: baseCostNanos, currency: currencyHint, pricedUsage,
	}),
}));
vi.mock("../pricing/persist", async (importOriginal) => ({
	...(await importOriginal<typeof import("../pricing/persist")>()),
	recordUsageAndCharge: async (args: Record<string, any>) => {
		db.debits.push(args);
		throw new Error(db.wallet === "refuses" ? "insufficient_unreserved_balance" : "fetch failed");
	},
}));
vi.mock("@core/spend-limits", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/spend-limits")>()),
	settleChargedFailureSpend: (...args: unknown[]) => mocks.settleChargedFailureSpend(...args),
	releaseSpend: (...args: unknown[]) => mocks.releaseSpend(...args),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getSupabaseAdmin: () => supabase(),
	isLocalTestingModeEnabled: () => false,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(Promise.resolve(promise).catch(() => undefined)); },
	getResponseCache: () => null,
}));

import { finalizeRequest } from "./index";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import type { PriceCard, PriceRule } from "../pricing/types";

const rule = (meter: string, price: string): PriceRule => ({
	id: `${meter}_rule`, pricing_plan: "standard", meter: meter as PriceRule["meter"], unit: "token",
	unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100,
});
// gpt-4o-mini-tts: $0.60 per 1M text input tokens, $12 per 1M audio output tokens.
const card = {
	provider: "openai", model: "openai/gpt-4o-mini-tts", endpoint: "audio.speech", version: "test", currency: "USD",
	effective_from: null, effective_to: null, rules: [rule("input_text_tokens", "0.6"), rule("output_audio_tokens", "12")],
} as unknown as PriceCard;
const speechUsage = { input_tokens: 31, output_tokens: 1_337, total_tokens: 1_368, input_text_tokens: 31, output_audio_tokens: 1_337, requests: 1 };
const expectedNanos = Math.round(31 * 0.6 * 1000) + Math.round(1_337 * 12 * 1000);

async function deliverAudio() {
	const row = new Promise<Record<string, any>>((resolve) => { db.onRow = resolve; });
	const bill = { cost_cents: 0, currency: "USD", usage: speechUsage, upstream_id: "upstream_req_1", finish_reason: null };
	const ctx: any = {
		requestId: "req_speech", billingRequestId: "bill_speech", workspaceId: "ws_speech", endpoint: "audio.speech", capability: "audio.speech",
		model: "openai/gpt-4o-mini-tts", requestedModel: "openai/gpt-4o-mini-tts", stream: false,
		body: { model: "openai/gpt-4o-mini-tts", input: "Hello there", voice: "alloy" }, rawBody: {},
		meta: { requestId: "req_speech", startedAtMs: Date.now() - 50, apiKeyId: "key_1" }, providers: [], pricing: { openai: card },
		timer: { span: (_name: string, fn: () => unknown) => fn(), mark: () => {}, end: () => {} },
	};
	const response = await finalizeRequest({
		pre: { ok: true, ctx },
		exec: { ok: true, result: {
			kind: "stream", provider: "openai", pricingKey: "openai", generationTimeMs: 1,
			upstream: new Response(null, { status: 200, headers: { "content-type": "audio/mpeg" } }),
			stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0x49, 0x44, 0x33])); controller.close(); } }),
			usageFinalizer: async () => bill, bill,
		} as any },
		endpoint: "audio.speech" as any,
	});
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
	const written = await row;
	// Spend is settled once the failure row's write is done.
	while (mocks.background.length) await Promise.all(mocks.background.splice(0));
	return { row: written, ctx };
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());
beforeEach(() => {
	db.rows.length = 0;
	db.debits.length = 0;
	mocks.settleChargedFailureSpend.mockReset();
	mocks.releaseSpend.mockReset();
});

describe("delivered speech audio whose wallet charge fails", () => {
	it.each([
		["fails", "persistence_failed", 3],
		["refuses", "wallet_refused", 1],
	] as const)("records the standard pending-accounting fields when the wallet %s", async (wallet, reason, attempts) => {
		db.wallet = wallet;
		const { row, ctx } = await deliverAudio();

		expect(db.debits).toHaveLength(attempts);
		expect(row).toMatchObject({ success: false, expected_cost_nanos: expectedNanos });
		expect(row.detail_metadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation",
			billing_request_id: "bill_speech",
			charged_nanos: 0,
			expected_nanos: expectedNanos,
			reason,
		});
		// Budgets count the expected amount; the admission is not released.
		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
			billingRequestId: ctx.billingRequestId, costNanos: expectedNanos, rowWritten: true,
		}));
		expect(mocks.releaseSpend).not.toHaveBeenCalled();
	});
});
