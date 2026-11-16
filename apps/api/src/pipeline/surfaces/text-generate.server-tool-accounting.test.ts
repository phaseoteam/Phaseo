import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import type { PriceCard } from "../pricing/types";

// The success path runs for real end to end, including the audit writers: text-generate,
// finalizeRequest, stream settlement, pricing, the BYOK fee, handleSuccessAudit and
// auditSuccess, and the wallet charge's retry and refusal handling. Faked: provider calls, the
// database client and wallet debit (which record what they are sent) and the spend-limit
// coordinator (which records what it is told).
const db = vi.hoisted(() => ({
	rows: [] as Array<Record<string, any>>,
	facts: [] as Array<Record<string, any>>,
	byokCount: 10,
	/** The wallet debit: succeeds, fails with an uncertain outcome (transport error), or refuses for lack of funds. */
	wallet: "ok" as "ok" | "fails" | "refuses" | "missing",
	/** The gateway_requests insert fails (a database outage during the audit write). */
	insertFails: false,
	/** Reading back what gateway_request_charges holds for a request fails too. */
	chargeReadFails: false,
	/** The V2 request fact write fails (a secondary write after the gateway_requests insert). */
	factFails: false,
	debits: [] as Array<Record<string, any>>,
	/** Provisional (non-final) totals of a streamed request charged in steps. */
	provisional: [] as Array<Record<string, any>>,
}));
const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	charge: vi.fn(async (_args: any) => undefined),
	settleEnforcedSpend: vi.fn(),
	settleChargedFailureSpend: vi.fn(),
	/** A key budget as the spend-limit coordinator keeps it: spend settled against a written row. */
	budget: { spent: 0 },
	fetchGatewayContext: vi.fn(),
	buildCandidates: vi.fn(),
	background: [] as Promise<unknown>[],
	bindings: {} as Record<string, string>,
}));

function supabase() {
	let table = "";
	const query: any = {
		insert: (row: Record<string, any>) => {
			if (db.insertFails) return { select: () => ({ single: async () => ({ data: null, error: { code: "57P01", message: "database unavailable" } }) }) };
			db.rows.push(row);
			return { select: () => ({ single: async () => ({ data: { id: `row_${db.rows.length}`, created_at: "2026-11-05T00:00:00Z", workspace_id: row.workspace_id }, error: null }) }) };
		},
		select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
		upsert: async () => ({ error: null }),
		maybeSingle: async () => (db.chargeReadFails && table === "gateway_request_charges"
			? { data: null, error: { code: "57P01", message: "database unavailable" } }
			: { data: null, error: null }),
		single: async () => ({ data: null, error: null }),
		then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
	};
	return {
		from: (name: string) => { table = name; return query; },
		rpc: async (name: string, args: Record<string, any>) => {
			if (name.startsWith("increment_workspace_byok_monthly_request_count")) {
				return { data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: db.byokCount }], error: null };
			}
			if (args?.p_event) {
				if (db.factFails) return { data: null, error: { code: "57P01", message: "database unavailable" } };
				db.facts.push(args.p_event);
			}
			return { data: "fact", error: null };
		},
	};
}

vi.mock("../execute", () => ({ doRequestWithIR: (...args: any[]) => mocks.doRequestWithIR(...args) }));
vi.mock("../after/charge", async (importOriginal) => {
	const real = await importOriginal<typeof import("../after/charge")>();
	return { ...real, recordUsageAndChargeOnce: async (args: any) => {
		await mocks.charge(args);
		return real.recordUsageAndChargeOnce(args);
	} };
});
vi.mock("../pricing/persist", async (importOriginal) => ({
	...(await importOriginal<typeof import("../pricing/persist")>()),
	recordUsageAndCharge: async (args: Record<string, any>) => {
		db.debits.push(args);
		if (db.wallet === "fails") throw new Error("fetch failed");
		if (db.wallet === "refuses") throw new Error("gateway_charge_not_applied:insufficient_balance");
		// #3547's deduct raises this before any debit; PostgREST returns it as a plain object.
		if (db.wallet === "missing") throw { code: "P0001", message: "wallet_not_found", details: null, hint: null };
		return { applied: true };
	},
	// A streamed server-tool request is charged in steps: provisional totals after its rounds, then
	// its final total. The final settlement is the request's debit; both meet the same wallet.
	recordRequestChargeTotal: async (args: Record<string, any>) => {
		(args.final ? db.debits : db.provisional).push(args);
		if (db.wallet === "fails") throw new Error("fetch failed");
		if (db.wallet === "refuses") throw new Error("gateway_charge_not_applied:insufficient_balance");
		if (db.wallet === "missing") throw { code: "P0001", message: "wallet_not_found", details: null, hint: null };
		return { applied: true };
	},
}));
// The policy read is faked (no rules); applyWorkspacePolicy is the real function.
vi.mock("../before/workspacePolicy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../before/workspacePolicy")>()),
	fetchWorkspacePolicy: async () => null,
}));
vi.mock("@core/spend-limits", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/spend-limits")>()),
	settleEnforcedSpend: (args: any) => {
		if (args.rowWritten) mocks.budget.spent += args.costNanos;
		return mocks.settleEnforcedSpend(args);
	},
	// The one failure settlement (#3633): a record with 0 successful requests, counted when kept.
	settleChargedFailureSpend: (args: any) => {
		if (args.rowWritten) mocks.budget.spent += args.costNanos;
		return mocks.settleChargedFailureSpend(args, args.costNanos);
	},
	releaseSpend: () => undefined,
}));
vi.mock("../after/apps", () => ({ ensureAppId: async () => "app_1" }));
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
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: async () => undefined }));
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => undefined }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: async () => undefined }));
vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: async () => undefined,
	reportProbeResult: async () => undefined,
	maybeOpenOnRecentErrors: async () => undefined,
}));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: async () => undefined,
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("../before/context", () => ({ fetchGatewayContext: (...args: any[]) => mocks.fetchGatewayContext(...args) }));
vi.mock("../before/utils", () => ({ buildProviderCandidatesWithDiagnostics: (...args: any[]) => mocks.buildCandidates(...args) }));
// No price card outside the request context (the database lookup finds none).
vi.mock("../pricing", async (importOriginal) => ({
	...(await importOriginal<typeof import("../pricing")>()),
	loadPriceCard: async () => null,
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getResponseCache: () => null,
	getBindings: () => mocks.bindings,
	getBindingsIfConfigured: () => mocks.bindings,
	getSupabaseAdmin: () => supabase(),
	isLocalTestingModeEnabled: () => false,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(Promise.resolve(promise).catch(() => undefined)); },
}));

import { runTextGeneratePipeline } from "./text-generate";
import { handleError } from "@core/error-handler";
import { __resetByokAllowanceCacheForTests } from "../pricing/byok-fee";

const rule = (meter: string, price: string, match: unknown[] = []) =>
	({ pricing_plan: "standard", meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match, priority: 100 }) as PriceCard["rules"][number];
const card = (provider: string, model: string, rules: PriceCard["rules"], endpoint = "text.generate"): PriceCard =>
	({ provider, model, endpoint, effective_from: null, effective_to: null, currency: "USD", version: null, rules } as PriceCard);
const LONG = [{ path: "long_context_input_tokens", op: "gt", value: 200_000, or_group: 1 }];
const ROUTES = {
	// $1/$4, cached reads $0.10.
	nano: { provider: "openai", apiModelId: "openai/gpt-5.4-nano", rules: [rule("input_text_tokens", "1"), rule("output_text_tokens", "4"), rule("cached_read_text_tokens", "0.1")] },
	// $3/$15, and $6/$22.50 above 200,000 input tokens.
	sonnet: { provider: "anthropic", apiModelId: "anthropic/claude-sonnet-5.5", rules: [
		rule("input_text_tokens", "3"), rule("input_text_tokens", "6", LONG), rule("output_text_tokens", "15"), rule("output_text_tokens", "22.5", LONG),
	] },
	// A route with no price card anywhere.
	unpriced: { provider: "novita", apiModelId: "novita/gpt-oss-120b", rules: null },
	// A route whose card loads but cannot price text usage: calculatePricing throws
	// (pricing_usage_unmatched:output_audio_tokens).
	unpriceable: { provider: "deepinfra", apiModelId: "deepinfra/gpt-oss-120b", rules: [rule("output_audio_tokens", "10")], endpoint: "audio.speech" },
	// $0.001 per request, whatever the tokens.
	perRequest: { provider: "together", apiModelId: "together/router-1", rules: [
		{ pricing_plan: "standard", meter: "requests", unit: "request", unit_size: 1, price_per_unit: "0.001", currency: "USD", match: [], priority: 100 } as PriceCard["rules"][number],
	] },
} as const;
type Route = keyof typeof ROUTES;
const ADVISOR = "anthropic/claude-opus-5.5";
const advisorCard = card("anthropic", ADVISOR, [rule("input_text_tokens", "5"), rule("output_text_tokens", "25")]);

/** `cost`: the cost the provider reports for the round (0: it charged nothing). */
type Usage = { input: number; output: number; cached?: number; reasoning?: number; cost?: number; requests?: number } | null;
/** Extra output on a round: provider usage fields, IR fields, or the IR message's own tool calls and content. */
type RoundOutput = { usage?: Record<string, unknown>; ir?: Record<string, unknown>; message?: Record<string, unknown> };
function round(route: Route, usage: Usage, toolCall: { name: string; arguments: string } | null, keySource: "gateway" | "byok" = "gateway", output: RoundOutput = {}) {
	const { provider, apiModelId } = ROUTES[route];
	return {
		result: {
			kind: "completed", provider, apiModelId, keySource,
			upstream: new Response(null, { status: 200 }), generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: usage ? {
				prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output,
				...(usage.cost !== undefined ? { cost: usage.cost } : {}),
				...(usage.requests !== undefined ? { requests: usage.requests } : {}),
				...(usage.cached ? { prompt_tokens_details: { cached_tokens: usage.cached } } : {}),
				...(usage.reasoning ? { completion_tokens_details: { reasoning_tokens: usage.reasoning } } : {}),
				...output.usage,
			} : {} },
			ir: {
				id: `resp_${route}`, model: apiModelId, provider,
				choices: [{
					index: 0,
					message: {
						...(toolCall
							? { role: "assistant", content: [], toolCalls: [{ id: `call_${route}_${Math.random()}`, ...toolCall }] }
							: { role: "assistant", content: [{ type: "text", text: "Done." }] }),
						...output.message,
					},
					finishReason: toolCall ? "tool_calls" : "stop",
				}],
				...(usage ? { usage: {
					inputTokens: usage.input, outputTokens: usage.output, totalTokens: usage.input + usage.output,
					...(usage.cached ? { cachedInputTokens: usage.cached, cachedReadTokensAreSubsetOfInput: true } : {}),
					...(usage.reasoning ? { reasoningTokens: usage.reasoning } : {}),
				} } : {}),
				...output.ir,
			},
		},
	};
}
const datetime = { name: "gateway_datetime", arguments: "{\"timezones\":[\"UTC\"]}" };
const search = { name: "phaseo_web_search", arguments: "{\"query\":\"phaseo\",\"engine\":\"exa\"}" };
const advisor = { name: "phaseo_advisor", arguments: "{\"prompt\":\"Check this.\"}" };

function args(stream: boolean, model = "openai/gpt-5.4-nano") {
	const body: Record<string, unknown> = {
		model,
		messages: [{ role: "user", content: "Help." }],
		tools: [
			{ type: "gateway:datetime", parameters: { timezones: ["UTC"] } },
			{ type: "phaseo:web_search" },
			{ type: "phaseo:advisor", model: ADVISOR, max_uses: 4, max_tokens: 4_000 },
		],
		...(stream ? { stream: true } : {}),
	};
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "chat.completions", capability: "text.generate", protocol: "openai.chat.completions",
				requestId: "req_acct", billingRequestId: "bill_acct", workspaceId: "ws_1", keyId: "00000000-0000-4000-8000-000000000001",
				meta: { apiKeyId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key" },
				rawBody: structuredClone(body), body: structuredClone(body), model, requestedModel: model,
				stream, providers: [],
				pricing: Object.fromEntries(Object.values(ROUTES).filter((route) => route.rules)
					.map((route) => [`${route.provider}:${route.apiModelId}`, card(route.provider, route.apiModelId, route.rules as PriceCard["rules"], "endpoint" in route ? route.endpoint : undefined)])),
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
				teamSettings: { billingMode: "wallet" },
				timer: new Timer(),
			} as any,
		},
		req: new Request("https://example.com/v1/chat/completions", { method: "POST" }),
		endpoint: "chat.completions" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

/** Runs one request and returns what each accounting sink received, once all have settled. */
/** Runs a request that ends in an error and returns its failure row and request fact. */
async function accountFailure(rounds: Array<ReturnType<typeof round> | Response>, stream: boolean, model?: string) {
	let next = 0;
	mocks.doRequestWithIR.mockImplementation(async () => rounds[next++]);
	const response = await runTextGeneratePipeline(args(stream, model));
	const body = await response.text();
	// The failure audit is delivered in the background; drain the queue it is on.
	while (mocks.background.length) await Promise.all(mocks.background.splice(0));
	expect(db.rows).toHaveLength(1);
	return { row: db.rows[0]!, fact: db.facts[0], body, status: response.status };
}

/** The client's usage: the final usage frame of a stream, or the response's usage. */
function clientUsage(result: { body: string }) {
	const frames = result.body.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
	return frames.length ? frames.filter((frame) => frame.usage).at(-1)?.usage : JSON.parse(result.body).usage;
}
/** The pricing the client's usage shows. */
function clientPricing(result: { body: string }) {
	return clientUsage(result)?.pricing;
}

async function account(rounds: ReturnType<typeof round>[], stream: boolean, model?: string) {
	let next = 0;
	mocks.doRequestWithIR.mockImplementation(async (ctx: any) => {
		if (String(ctx.requestId).endsWith(":advisor")) {
			return { result: { ...round("nano", { input: 2_000, output: 400 }, null).result, provider: "anthropic", apiModelId: ADVISOR } };
		}
		return rounds[next++];
	});
	const settled = new Promise<any>((resolve) => mocks.settleEnforcedSpend.mockImplementation((settleArgs: any) => resolve(settleArgs)));
	const request = args(stream, model);
	const response = await runTextGeneratePipeline(request);
	const body = await response.text();
	const spend = await settled;
	await Promise.all(mocks.background.splice(0));
	expect(mocks.charge).toHaveBeenCalledOnce();
	// One spend record per request (settleRequestSpend), at the full bill: no round settles early.
	expect(mocks.settleEnforcedSpend).toHaveBeenCalledOnce();
	expect(mocks.settleChargedFailureSpend).not.toHaveBeenCalled();
	expect(db.rows).toHaveLength(1);
	expect(db.facts).toHaveLength(1);
	return {
		wallet: mocks.charge.mock.calls[0]![0].costNanos as number,
		row: db.rows[0]!.cost_nanos as number,
		fact: db.facts[0]!.cost_nanos as number,
		spend: spend.costNanos as number,
		row_record: db.rows[0]!,
		body,
		ctx: request.pre.ctx,
	};
}

describe.each([false, true])("multi-round accounting agreement (stream: %s)", (stream) => {
	beforeEach(() => {
		db.rows.length = 0;
		db.facts.length = 0;
		db.byokCount = 10;
		db.wallet = "ok";
		db.insertFails = false;
		db.chargeReadFails = false;
		db.factFails = false;
		db.debits.length = 0;
		db.provisional.length = 0;
		mocks.charge.mockClear();
		mocks.settleEnforcedSpend.mockReset();
		mocks.settleChargedFailureSpend.mockReset();
		mocks.budget.spent = 0;
		mocks.doRequestWithIR.mockReset();
		mocks.background.length = 0;
		mocks.bindings = { EXA_API_KEY: "exa_key" };
		__resetByokAllowanceCacheForTests();
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ requestId: "exa", results: [{ title: "Phaseo", url: "https://phaseo.app" }] }), {
			status: 200, headers: { "Content-Type": "application/json" },
		})));
		mocks.fetchGatewayContext.mockResolvedValue({
			resolvedModel: ADVISOR, pricing: { [`anthropic:${ADVISOR}`]: advisorCard },
			key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true }, teamSettings: { billingMode: "wallet" },
		});
		mocks.buildCandidates.mockReturnValue({ candidates: [{ providerId: "anthropic", pricingCard: advisorCard }], diagnostics: {} });
	});

	it("agrees on cached tokens, reasoning tokens, a long-context tier, a round with no usage, tools and a sub-call", async () => {
		const result = await account([
			// Nano: 10,000 in (4,000 cached), 500 out with 300 reasoning; runs a search.
			round("nano", { input: 10_000, output: 500, cached: 4_000, reasoning: 300 }, search),
			// A round that reported no usage at all; asks the advisor.
			round("nano", null, advisor),
			// Fallback to Sonnet past its 200,000-token tier.
			round("sonnet", { input: 250_000, output: 1_000 }, datetime),
			round("sonnet", { input: 1_000, output: 200 }, null),
		], stream);

		// Nano: 6,000 x $1 + 4,000 x $0.10 + 500 x $4 per M = $0.0084.
		// Sonnet: 250,000 x $6 + 1,000 x $22.50 per M = $1.5225; 1,000 x $3 + 200 x $15 per M = $0.006.
		// Search $0.007; advisor (Opus) 2,000 x $5 + 400 x $25 per M = $0.02.
		const expected = 8_400_000 + 1_522_500_000 + 6_000_000 + 7_000_000 + 20_000_000;
		expect(result).toMatchObject({ wallet: expected, row: expected, fact: expected, spend: expected });
		// A charged success has nothing pending.
		expect(result.row_record.expected_cost_nanos).toBeUndefined();
		const lines = result.row_record.pricing_lines as Array<Record<string, any>>;
		expect(lines.filter((line) => line.round).map((line) => line.round)).toEqual([1, 1, 1, 3, 3, 4, 4]);
	});

	it("charges the priceable rounds and holds a round with no price card for reconciliation", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("unpriced", { input: 5_000, output: 500 }, datetime),
			round("sonnet", { input: 1_000, output: 200 }, null, "byok"),
		], stream);

		// Before: the unpriceable round made the request fall back to its final round's card
		// and key (BYOK, inside the free allowance), so the managed nano round was free too.
		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		const reconciliation = {
			billing_status: "pending_reconciliation",
			unpriced_rounds: [expect.objectContaining({
				round: 2, provider: "novita", api_model_id: "novita/gpt-oss-120b", billing_status: "pending_reconciliation",
				cause: expect.stringContaining("pricing_card_missing_for_executed_route"),
				raw_usage: expect.objectContaining({ input_tokens: 5_000, output_tokens: 500 }),
			})],
		};
		expect(result.ctx.serverToolRoundsBill.pricing).toMatchObject(reconciliation);
		// The request's log row records it for reconciliation, as an unpriceable request's does.
		expect(result.row_record.detail_metadata.accounting_finalization).toMatchObject({ ...reconciliation, billing_request_id: "bill_acct", charged_nanos: 1_400_000 });
		// A row pending reconciliation always records its priced bill (the unpriced round adds 0).
		expect(result.row_record.expected_cost_nanos).toBe(1_400_000);
	});

	it("does not show a stealth model's routes in the client's usage or the logs", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("sonnet", { input: 1_000, output: 200 }, null),
		], stream, "stealth/aurora");

		for (const leaked of ["openai", "anthropic"]) {
			expect(JSON.stringify(result.row_record.pricing_lines)).not.toContain(`"${leaked}"`);
			expect(JSON.stringify(result.ctx.serverToolRoundsBill.pricing)).not.toContain(`"${leaked}"`);
		}
		const clientLines = stream
			? result.body.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6))).find((frame) => frame.usage)?.usage?.pricing?.lines
			: JSON.parse(result.body).usage?.pricing?.lines;
		expect(clientLines?.length).toBeGreaterThan(0);
		expect(clientLines.every((line: any) => line.provider === "stealth")).toBe(true);
		expect(result.wallet).toBe(1_400_000 + 6_000_000);
	});

	it("finalizes from the round bill when the final round's route has no price card", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, search),
			round("unpriced", { input: 5_000, output: 500 }, null),
		], stream);

		// Before: finalization loaded the final route's card, failed, and charged nothing.
		// Nano $0.0014 + a managed search $0.007; the final round waits for reconciliation.
		expect(result).toMatchObject({ wallet: 8_400_000, row: 8_400_000, fact: 8_400_000, spend: 8_400_000 });
		expect(result.row_record.success).toBe(true);
		expect(result.row_record.detail_metadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation",
			unpriced_rounds: [expect.objectContaining({ round: 2, provider: "novita", cause_code: "pricing_card_missing" })],
		});
		expect(result.row_record.expected_cost_nanos).toBe(8_400_000);
		// The client's usage shows the same charge (the frame priced the aggregate on the missing card).
		expect(clientPricing(result)).toMatchObject({ total_nanos: 8_400_000 });
	});

	it("charges the round bill when the final round's card loads but cannot price it", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("unpriceable", { input: 5_000, output: 500 }, null),
		], stream);

		// Before: the finalizer priced the aggregate usage on the final card first, which threw, so
		// nothing was charged and the pending row recorded cost 0 and expected 0.
		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		expect(result.row_record).toMatchObject({ success: true, expected_cost_nanos: 1_400_000 });
		expect(result.row_record.detail_metadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation", charged_nanos: 1_400_000,
			unpriced_rounds: [expect.objectContaining({ round: 2, provider: "deepinfra", cause_code: "pricing_failed" })],
		});
		// Before: pricing the stream's usage frame on the final card threw and was swallowed, so the
		// client saw no pricing while settlement charged 1,400,000.
		expect(clientPricing(result)).toMatchObject({ total_nanos: 1_400_000 });
	});

	it("waives a managed round with no output the provider did not charge for, as a single response is", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("nano", { input: 1_000, output: 0, cost: 0 }, null),
		], stream);

		// Before: round 2's 1,000 input tokens were charged ($0.001): 2,400,000 in total.
		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing).toMatchObject({ waived_rounds: [2], waived_rounds_reason: "zero_output_tokens" });
		expect(result.ctx.serverToolRoundsBill.pricing.lines.every((line: any) => line.round !== 2)).toBe(true);
		expect(clientPricing(result)).toMatchObject({ total_nanos: 1_400_000 });
	});

	it("waives a BYOK round with no output the provider did not charge for, fee included", async () => {
		// The monthly allowance is used up, so a BYOK round would pay the 2.5% fee.
		db.byokCount = 300_000;
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("sonnet", { input: 1_000, output: 0, cost: 0 }, null, "byok"),
		], stream);

		// Before: 2.5% of round 2's $0.003 was added (75,000 nanos): 1,475,000 in total.
		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing).toMatchObject({
			waived_rounds: [2], byok_billing: expect.objectContaining({ fee_applied: false, fee_nanos: 0 }),
		});
	});

	it("does not waive a round whose only output is a tool call", async () => {
		const result = await account([
			// A route priced per request: a valid tool call with zero token counters.
			round("perRequest", { input: 0, output: 0, requests: 1 }, datetime),
			round("nano", { input: 1_000, output: 100 }, null),
		], stream);

		// Before: the waiver saw no output tokens and no tool calls (the round's IR-derived
		// output_tool_call_count was not attached), so round 1's $0.001 was waived: 1,400,000.
		expect(result).toMatchObject({ wallet: 2_400_000, row: 2_400_000, fact: 2_400_000, spend: 2_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing.waived_rounds).toBeUndefined();
		expect(clientPricing(result)).toMatchObject({ total_nanos: 2_400_000 });
	});

	it("reports the settled round bill as the client's cost when the final round is BYOK", async () => {
		// Inside the free BYOK allowance: the BYOK round is free, the managed round costs $0.0014.
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("sonnet", { input: 1_000, output: 200 }, null, "byok"),
		], stream);

		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		// Before (streamed): usage.cost was stripped and relabelled as upstream_inference_cost.
		const usage = clientUsage(result);
		expect(usage.pricing).toMatchObject({ total_nanos: 1_400_000 });
		expect(usage.cost).toBe(0.0014);
		expect(usage.cost_details?.upstream_inference_cost ?? null).toBeNull();
	});

	// A $0.001-per-request round with zero core token counters: its other output decides whether
	// the waiver applies, exactly as for a single response (response-output.ts).
	const perRequestRound = (output: RoundOutput) => round("perRequest", { input: 0, output: 0, requests: 1 }, null, "gateway", output);
	it.each([
		["nested image output tokens", { usage: { completion_tokens_details: { image_tokens: 50 } } }],
		["nested audio output tokens", { usage: { completion_tokens_details: { audio_tokens: 40 } } }],
		["reasoning tokens", { usage: { completion_tokens_details: { reasoning_tokens: 30 } } }],
		["web search results", { ir: { grounding: { groundingChunks: [{ web: { uri: "https://phaseo.app", title: "Phaseo" } }] } } }],
		["output_tokens_details.output_images", { usage: { output_tokens_details: { output_images: 1 } } }],
		["output_tokens_details.output_audio", { usage: { output_tokens_details: { output_audio: 20 } } }],
		["output_tokens_details.output_videos", { usage: { output_tokens_details: { output_videos: 1 } } }],
		// Delivered in the response itself, with no usage counter: buffered reads the response, a stream
		// what it emitted (round 14 #2), and both decide alike.
		["reasoning text", { message: { content: [{ type: "reasoning_text", text: "Checking the date." }, { type: "text", text: "Done." }] } }],
		["an image part", { message: { content: [{ type: "image", source: "url", data: "https://phaseo.app/i.png", mimeType: "image/png" }] } }],
		["a nameless tool call with arguments", { message: { content: [], toolCalls: [{ id: "call_x", name: "", arguments: "{}" }] } }],
	] as const)("does not waive a round whose output is %s", async (_label, output) => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			perRequestRound(output as RoundOutput),
		], stream);

		// Before: the waiver read only output_tokens, a few flat keys and the tool-call count, so
		// this round's $0.001 was waived: 1,400,000.
		expect(result).toMatchObject({ wallet: 2_400_000, row: 2_400_000, fact: 2_400_000, spend: 2_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing.waived_rounds).toBeUndefined();
	});

	it.each([
		["output_tokens_details.output_images", {
			// In the provider's usage, which a stream carries in its usage frame (encoded from the IR usage).
			usage: { output_tokens_details: { output_images: 1 } },
			ir: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, _ext: { outputImageTokens: 1 } } },
		}],
		["reasoning text", { message: { content: [{ type: "reasoning_text", text: "Checking." }, { type: "text", text: "Done." }] } }],
		["an image part", { message: { content: [{ type: "image", source: "url", data: "https://phaseo.app/i.png", mimeType: "image/png" }] } }],
		["a nameless tool call with arguments", { message: { content: [], toolCalls: [{ id: "call_x", name: "", arguments: "{}" }] } }],
	] as const)("charges a single response whose only output is %s, streamed as buffered", async (_label, output) => {
		const result = await account([perRequestRound(output as RoundOutput)], stream);
		// Before (streamed): reasoning, media parts and nameless tool calls never reached the waiver,
		// and the materialiser dropped the nameless call, so the stream was charged 0.
		expect(result).toMatchObject({ wallet: 1_000_000, row: 1_000_000, fact: 1_000_000, spend: 1_000_000 });
		// What the client is charged for, it receives (round 15): a nameless call with arguments is shown.
		if (_label === "a nameless tool call with arguments") {
			const calls = stream
				? result.body.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6))).flatMap((frame) => frame.choices?.[0]?.delta?.tool_calls ?? [])
				: JSON.parse(result.body).choices[0].message.tool_calls ?? [];
			expect(calls).toEqual([expect.objectContaining({ function: expect.objectContaining({ arguments: "{}" }) })]);
		}
	});

	it("still waives a round whose zero-token answer is plain text the provider did not charge for", async () => {
		const result = await account([round("nano", { input: 1_000, output: 100 }, datetime), perRequestRound({})], stream);
		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing.waived_rounds).toEqual([2]);
	});

	it("waives a round whose only output is an empty placeholder tool call", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("perRequest", { input: 0, output: 0, requests: 1, cost: 0 }, null, "gateway", {
				message: { content: [{ type: "text", text: "Done." }], toolCalls: [{ id: "", name: "", arguments: "" }] },
			}),
		], stream);

		// Before: tool calls were counted by array length, so the placeholder counted as output:
		// 2,400,000.
		expect(result).toMatchObject({ wallet: 1_400_000, row: 1_400_000, fact: 1_400_000, spend: 1_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing.waived_rounds).toEqual([2]);
	});

	it("charges only the completed rounds when the final round is nothing but an empty placeholder tool call", async () => {
		const failure = await accountFailure([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("perRequest", { input: 0, output: 0, requests: 1, cost: 0 }, null, "gateway", {
				message: { content: [], toolCalls: [{ id: "", name: "", arguments: "" }] },
			}),
		], stream);

		// Before: the placeholder made the round look usable and billable: 2,400,000 charged. Now the
		// empty-response check sees no output (the same isBillableToolCall test), so only round 1 is.
		expect(mocks.charge.mock.calls.map(([chargeArgs]) => chargeArgs.costNanos)).toEqual([1_400_000]);
		expect(failure.row).toMatchObject({ cost_nanos: 1_400_000 });
		// An empty response: 502 buffered; a stream already sent its 200.
		expect(failure.status).toBe(stream ? 200 : 502);
		if (stream) {
			// The completed round's usage and settled pricing reach the client before the error.
			const frames = failure.body.split("\n").filter((line: string) => line.startsWith("data: {")).map((line: string) => JSON.parse(line.slice(6)));
			const usageAt = frames.findIndex((frame: any) => frame.usage?.pricing?.total_nanos === 1_400_000);
			const errorAt = frames.findIndex((frame: any) => frame.error);
			expect(usageAt).toBeGreaterThanOrEqual(0);
			expect(errorAt).toBeGreaterThan(usageAt);
			expect(frames[usageAt].usage).toMatchObject({ cost: 0.0014 });
		}
		expect(String(failure.row.error_code)).toContain("empty_response");
	});

	it("still charges a no-output round whose input the provider charged for", async () => {
		const result = await account([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("nano", { input: 1_000, output: 0 }, null),
		], stream);

		expect(result).toMatchObject({ wallet: 2_400_000, row: 2_400_000, fact: 2_400_000, spend: 2_400_000 });
		expect(result.ctx.serverToolRoundsBill.pricing.waived_rounds).toBeUndefined();
	});

	it("keeps a stealth model's route out of the cause of an unpriced round on a success", async () => {
		const result = await account([
			round("unpriced", { input: 5_000, output: 500 }, datetime),
			round("nano", { input: 1_000, output: 100 }, null),
		], stream, "stealth/aurora");

		const unpriced = result.row_record.detail_metadata.accounting_finalization.unpriced_rounds;
		expect(unpriced).toEqual([expect.objectContaining({ provider: "stealth", cause: "pricing_card_missing", cause_code: "pricing_card_missing" })]);
		for (const record of [JSON.stringify(result.row_record), result.body, JSON.stringify(result.ctx.serverToolRoundsBill)]) {
			expect(record).not.toContain("novita");
			expect(record).not.toContain("gpt-oss");
		}
	});

	it("records an unpriced round on the failure row even when nothing was charged", async () => {
		const failure = await accountFailure([
			round("unpriced", { input: 5_000, output: 500 }, datetime),
			new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
		], stream);

		expect(mocks.charge.mock.calls.map(([chargeArgs]) => chargeArgs.costNanos)).toEqual([0]);
		expect(mocks.settleEnforcedSpend).not.toHaveBeenCalled();
		expect(mocks.settleChargedFailureSpend).not.toHaveBeenCalled();
		// Pending reconciliation with nothing priced: expected_cost_nanos is 0, never NULL (readers tell
		// pending rows by it); the raw usage stays on the row for repricing.
		expect(failure.row).toMatchObject({ success: false, cost_nanos: 0, expected_cost_nanos: 0 });
		expect(failure.row.usage).toMatchObject({ input_tokens: 5_000, output_tokens: 500 });
		expect(failure.row.detail_metadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation",
			charged_nanos: 0,
			unpriced_rounds: [expect.objectContaining({ round: 1, provider: "novita", cause_code: "pricing_card_missing" })],
		});
	});

	it("records the priced bill of a failure that held a round for reconciliation and charged the rest", async () => {
		const failure = await accountFailure([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("unpriced", { input: 5_000, output: 500 }, datetime),
			new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
		], stream);

		expect(mocks.charge.mock.calls.map(([chargeArgs]) => chargeArgs.costNanos)).toEqual([1_400_000]);
		expect(failure.row).toMatchObject({ success: false, cost_nanos: 1_400_000, expected_cost_nanos: 1_400_000 });
		expect(failure.row.detail_metadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation", charged_nanos: 1_400_000,
			unpriced_rounds: [expect.objectContaining({ round: 2, cause_code: "pricing_card_missing" })],
		});
	});

	it("keeps a stealth model's route out of a failure row's reconciliation record", async () => {
		const failure = await accountFailure([
			round("unpriced", { input: 5_000, output: 500 }, datetime),
			new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
		], stream, "stealth/aurora");

		expect(failure.row.detail_metadata.accounting_finalization.unpriced_rounds).toEqual([
			expect.objectContaining({ provider: "stealth", cause: "pricing_card_missing" }),
		]);
		for (const record of [JSON.stringify(failure.row), JSON.stringify(failure.fact ?? {}), failure.body]) {
			expect(record).not.toContain("novita");
			expect(record).not.toContain("gpt-oss");
		}
	});

	it("records a failed request's bill for reconciliation when the wallet charge fails", async () => {
		db.wallet = "fails";
		// Round 1 completes and runs datetime; the follow-up returns 502.
		const failure = await accountFailure([
			round("nano", { input: 1_000, output: 100 }, datetime),
			new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
		], stream);

		expect(mocks.charge.mock.calls.map(([chargeArgs]) => chargeArgs.costNanos)).toEqual([1_400_000]);
		// Not charged, but budgets count the expected amount.
		expect(mocks.settleEnforcedSpend).not.toHaveBeenCalled();
		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledExactlyOnceWith(expect.anything(), 1_400_000);
		expect(failure.row).toMatchObject({ success: false, cost_nanos: 0, expected_cost_nanos: 1_400_000 });
		expect(failure.row.usage).toMatchObject({ input_tokens: 1_000, output_tokens: 100 });
		expect(failure.row.pricing_lines.length).toBeGreaterThan(0);
		expect(failure.row.detail_metadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation", charged_nanos: 0, expected_nanos: 1_400_000,
		});
	});

	/**
	 * A delivered response whose charge did not go through. Buffered (#3633): it stays a success row,
	 * pending reconciliation, settled once as a success at the bill. Streamed (and any failure): a
	 * failure row pending reconciliation, settled once as a charged failure at the bill.
	 */
	const expectPendingCharge = (row: Record<string, any>, bill: { expected: number; charged: number | null; reason: string }, successRow = !stream) => {
		expect(row).toMatchObject({ success: successRow, expected_cost_nanos: bill.expected });
		if (bill.charged == null) expect(row).not.toHaveProperty("cost_nanos");
		else expect(row.cost_nanos ?? 0).toBe(bill.charged);
		expect(row.detail_metadata.accounting_finalization).toMatchObject(successRow
			? { billing_status: "pending_reconciliation", response_delivered: true, billing_request_id: "bill_acct", charged_total_nanos: bill.charged, expected_cost_nanos: bill.expected, reason: bill.reason }
			: { billing_status: "pending_reconciliation", billing_request_id: "bill_acct", charged_nanos: bill.charged, expected_nanos: bill.expected, reason: bill.reason });
		if (successRow) {
			expect(mocks.settleEnforcedSpend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ costNanos: bill.expected, rowWritten: true }));
			expect(mocks.settleChargedFailureSpend).not.toHaveBeenCalled();
		} else {
			expect(mocks.settleChargedFailureSpend).toHaveBeenCalledExactlyOnceWith(expect.anything(), bill.expected);
			expect(mocks.settleEnforcedSpend).not.toHaveBeenCalled();
		}
	};

	it.each([
		["a single-round success", () => [round("nano", { input: 1_000, output: 100 }, null)], 1_400_000],
		["a multi-round success", () => [round("nano", { input: 1_000, output: 100 }, datetime), round("nano", { input: 1_000, output: 100 }, null)], 2_800_000],
		["a failure after a completed round", () => [round("nano", { input: 1_000, output: 100 }, datetime), new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 })], 1_400_000],
	] as const)("leaves the cost unknown, not 0, for %s whose charge failed and whose stored charge cannot be read", async (_label, rounds, expectedNanos) => {
		db.wallet = "fails";
		db.chargeReadFails = true;
		const delivered = await accountFailure(rounds() as any, stream);

		// The bill, and no confirmed charge (unreadable): never 0. A streamed request with a completed
		// round was charged in steps, so it falls back to the provisional total sent after that round.
		const steppedNanos = stream && !_label.startsWith("a single-round") ? 1_400_000 : null;
		expectPendingCharge(delivered.row, { expected: expectedNanos, charged: steppedNanos, reason: "persistence_failed" },
			!stream && !_label.startsWith("a failure"));
	});

	it("never records a multi-round success as charged when its wallet charge fails", async () => {
		db.wallet = "fails";
		const failure = await accountFailure([
			round("nano", { input: 1_000, output: 100 }, datetime),
			round("nano", { input: 1_000, output: 100 }, null),
		], stream);

		expect(failure.status).toBe(200);
		// Never charged: pending reconciliation at the expected bill (cost 0, as the database confirmed).
		expectPendingCharge(failure.row, { expected: 2_800_000, charged: 0, reason: "persistence_failed" });
		// An uncertain debit is retried before it is given up.
		expect(db.debits).toHaveLength(3);
	});

	it.each([
		["single-round", () => [round("nano", { input: 1_000, output: 100 }, null)], 1_400_000, 3],
		["multi-round", () => [round("nano", { input: 1_000, output: 100 }, datetime), round("nano", { input: 1_000, output: 100 }, null)], 2_800_000, 2],
	] as const)("refuses a capped workspace once the expected amounts of %s responses its wallet did not take reach the cap", async (_label, rounds, expectedNanos, served) => {
		db.wallet = "fails";
		const cap = 3_000_000;
		let admitted = 0;
		const rows: Array<Record<string, any>> = [];
		for (let attempt = 0; attempt < 6; attempt++) {
			// The coordinator admits while settled spend is below the cap.
			if (mocks.budget.spent >= cap) break;
			admitted++;
			db.rows.length = 0;
			db.facts.length = 0;
			const delivered = await accountFailure(rounds(), stream);
			expect(delivered.status).toBe(200);
			rows.push(delivered.row);
		}

		expect(admitted).toBe(served);
		expect(mocks.budget.spent).toBe(served * expectedNanos);
		// Each response is recorded as delivered and pending reconciliation, never as charged.
		for (const row of rows) {
			expect(row).toMatchObject({ success: !stream, expected_cost_nanos: expectedNanos });
			expect(row.cost_nanos ?? 0).toBe(0);
			expect(row.detail_metadata.accounting_finalization).toMatchObject({ billing_status: "pending_reconciliation", response_delivered: true });
		}
	});

	it.each([
		["single-round", () => [round("nano", { input: 1_000, output: 100 }, null)], 1_400_000],
		["multi-round", () => [round("nano", { input: 1_000, output: 100 }, datetime), round("nano", { input: 1_000, output: 100 }, null)], 2_800_000],
	] as const)("records a wallet refusal of a delivered %s response as a known unpaid amount, without retrying", async (_label, rounds, expectedNanos) => {
		db.wallet = "refuses";
		const delivered = await accountFailure(rounds(), stream);

		expect(delivered.status).toBe(200);
		// A refusal is definite: one debit attempt.
		expect(db.debits).toHaveLength(1);
		// Budgets count it at the expected amount.
		expectPendingCharge(delivered.row, { expected: expectedNanos, charged: 0, reason: "wallet_refused" });
	});

	it.each([
		["single-round", () => [round("nano", { input: 1_000, output: 100 }, null)], 1_400_000],
		["multi-round", () => [round("nano", { input: 1_000, output: 100 }, datetime), round("nano", { input: 1_000, output: 100 }, null)], 2_800_000],
	] as const)("records a missing wallet for a delivered %s response as a definite unpaid amount", async (_label, rounds, expectedNanos) => {
		db.wallet = "missing";
		const delivered = await accountFailure(rounds(), stream);

		expect(delivered.status).toBe(200);
		expect(db.debits).toHaveLength(1);
		expectPendingCharge(delivered.row, { expected: expectedNanos, charged: 0, reason: "wallet_not_found" });
	});

	it("writes no second billed row and settles nothing when an error follows a committed success row whose secondary write failed", async () => {
		// The gateway_requests insert commits (onPrimaryRowWritten); the V2 request fact then fails.
		db.factFails = true;
		let next = 0;
		const rounds = [round("nano", { input: 1_000, output: 100 }, datetime), round("nano", { input: 1_000, output: 100 }, null)];
		mocks.doRequestWithIR.mockImplementation(async () => rounds[next++]);
		const request = args(stream);
		const response = await runTextGeneratePipeline(request);
		await response.text();
		while (mocks.background.length) await Promise.all(mocks.background.splice(0));
		expect(db.rows).toEqual([expect.objectContaining({ success: true, cost_nanos: 2_800_000 })]);
		expect(db.facts).toHaveLength(0);
		expect(mocks.settleEnforcedSpend).toHaveBeenCalledOnce();

		// Then an error reaches handleError with what a failure would owe (charged rounds, an unpaid bill).
		const ctx = request.pre.ctx as any;
		ctx.serverToolPartialCharge = { costNanos: 400, currency: "USD", usage: {}, pricingLines: [] };
		ctx.uncollectedChargeNanos = 1_400_000;
		const audited: any[] = [];
		await handleError({
			stage: "execute",
			res: new Response(JSON.stringify({ error: "server_error" }), { status: 500 }),
			endpoint: "chat.completions",
			ctx,
			auditFailure: async (auditArgs: any) => { audited.push(auditArgs); },
		});
		while (mocks.background.length) await Promise.all(mocks.background.splice(0));

		// The success row stays the request's record: the error row carries no charge or expected bill.
		expect(audited).toHaveLength(1);
		expect(audited[0]).not.toHaveProperty("costNanos");
		expect(audited[0]).not.toHaveProperty("expectedCostNanos");
		expect(mocks.settleChargedFailureSpend).not.toHaveBeenCalled();
		expect(mocks.settleEnforcedSpend).toHaveBeenCalledOnce();
		expect(mocks.budget.spent).toBe(2_800_000);
	});

	it("counts a charged, delivered response against spend limits even when its success row cannot be written", async () => {
		db.insertFails = true;
		let next = 0;
		const rounds = [round("nano", { input: 1_000, output: 100 }, datetime), round("nano", { input: 1_000, output: 100 }, null)];
		mocks.doRequestWithIR.mockImplementation(async () => rounds[next++]);
		const settled = new Promise<any>((resolve) => mocks.settleEnforcedSpend.mockImplementation((settleArgs: any) => resolve(settleArgs)));
		const response = await runTextGeneratePipeline(args(stream));
		await response.text();
		const settlement = await settled;
		while (mocks.background.length) await Promise.all(mocks.background.splice(0));

		expect(db.debits).toHaveLength(1);
		expect(db.rows).toHaveLength(0);
		// Charged and delivered: counted at the charged amount, not released.
		expect(settlement).toMatchObject({ rowWritten: true, costNanos: 2_800_000 });
		expect(mocks.budget.spent).toBe(2_800_000);
	});
});
