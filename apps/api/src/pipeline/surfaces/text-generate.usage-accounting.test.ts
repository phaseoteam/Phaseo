import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import type { PriceCard } from "../pricing/types";

// What a text request is charged when it ends without visible output, when its server tools
// call other models, and while a streamed server-tool request is still running. Runs
// text-generate and the after stage for real; faked: provider calls, the context lookup, the
// workspace policy read, the database client and the wallet debits (which record what they are sent).
const db = vi.hoisted(() => ({
	rows: [] as Array<Record<string, any>>,
	/** One-off wallet debits. */
	debits: [] as Array<Record<string, any>>,
	/** Stepped charges: the request's total so far (final: false) or its final total. */
	totals: [] as Array<Record<string, any>>,
}));
const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	fetchGatewayContext: vi.fn(),
	buildCandidates: vi.fn(),
	background: [] as Promise<unknown>[],
	bindings: {} as Record<string, string>,
}));

function supabase() {
	const query: any = {
		insert: (row: Record<string, any>) => {
			db.rows.push(row);
			return { select: () => ({ single: async () => ({ data: { id: `row_${db.rows.length}`, created_at: "2026-11-05T00:00:00Z", workspace_id: row.workspace_id }, error: null }) }) };
		},
		select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
		upsert: async () => ({ error: null }),
		maybeSingle: async () => ({ data: null, error: null }),
		single: async () => ({ data: null, error: null }),
		then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
	};
	return {
		from: () => query,
		rpc: async (name: string) => {
			if (name.startsWith("increment_workspace_byok_monthly_request_count")) {
				return { data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: 10 }], error: null };
			}
			return { data: "fact", error: null };
		},
	};
}

vi.mock("../execute", () => ({ doRequestWithIR: (...args: any[]) => mocks.doRequestWithIR(...args) }));
vi.mock("../pricing/persist", async (importOriginal) => ({
	...(await importOriginal<typeof import("../pricing/persist")>()),
	recordUsageAndCharge: async (args: Record<string, any>) => { db.debits.push(args); return { applied: true }; },
	recordRequestChargeTotal: async (args: Record<string, any>) => { db.totals.push(args); return { applied: true }; },
	readRequestChargeTotal: async () => 0,
}));
vi.mock("@core/spend-limits", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/spend-limits")>()),
	settleEnforcedSpend: () => undefined,
	settleChargedFailureSpend: () => undefined,
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
vi.mock("../before/workspacePolicy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../before/workspacePolicy")>()),
	fetchWorkspacePolicy: async () => null,
}));
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

const rule = (meter: string, price: string) =>
	({ pricing_plan: "standard", meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100 }) as PriceCard["rules"][number];
const card = (provider: string, model: string, rules: PriceCard["rules"]): PriceCard =>
	({ provider, model, endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null, rules } as PriceCard);

// $1 / $4 per million tokens.
const MAIN = "openai/gpt-5.4-nano";
const mainCard = card("openai", MAIN, [rule("input_text_tokens", "1"), rule("output_text_tokens", "4")]);
// $5 / $25 per million tokens.
const ADVISOR = "anthropic/claude-opus-5.5";
const advisorCard = card("anthropic", ADVISOR, [rule("input_text_tokens", "5"), rule("output_text_tokens", "25")]);

type Usage = { input: number; output: number; reasoning?: number };
type ToolCall = { name: string; arguments: string };
/** A completed round. `text: ""` is an answer with no visible output. */
function round(usage: Usage, options: { toolCalls?: ToolCall[]; text?: string; keySource?: "gateway" | "byok" } = {}) {
	const { toolCalls, text = "Done.", keySource = "gateway" } = options;
	return {
		result: {
			kind: "completed", provider: "openai", apiModelId: MAIN, keySource,
			upstream: new Response(null, { status: 200 }), generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: {
				prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output,
				...(usage.reasoning ? { completion_tokens_details: { reasoning_tokens: usage.reasoning } } : {}),
			} },
			ir: {
				id: "resp_main", model: MAIN, provider: "openai",
				choices: [{
					index: 0,
					message: toolCalls
						? { role: "assistant", content: [], toolCalls: toolCalls.map((call, index) => ({ id: `call_${index}_${Math.random()}`, ...call })) }
						: { role: "assistant", content: text ? [{ type: "text", text }] : [] },
					finishReason: toolCalls ? "tool_calls" : "stop",
				}],
				usage: {
					inputTokens: usage.input, outputTokens: usage.output, totalTokens: usage.input + usage.output,
					...(usage.reasoning ? { reasoningTokens: usage.reasoning } : {}),
				},
			},
		},
	};
}
const datetime: ToolCall = { name: "gateway_datetime", arguments: "{\"timezones\":[\"UTC\"]}" };
const advisor: ToolCall = { name: "phaseo_advisor", arguments: "{\"prompt\":\"Check this.\"}" };
const search: ToolCall = { name: "phaseo_web_search", arguments: "{\"query\":\"phaseo\",\"engine\":\"exa\"}" };

function request(options: { tools?: unknown[]; stream?: boolean; ctx?: Record<string, unknown> } = {}) {
	const body: Record<string, unknown> = {
		model: MAIN,
		messages: [{ role: "user", content: "Help." }],
		...(options.tools ? { tools: options.tools } : {}),
		...(options.stream ? { stream: true } : {}),
	};
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "chat.completions", capability: "text.generate", protocol: "openai.chat.completions",
				requestId: "req_1", billingRequestId: "bill_1", workspaceId: "ws_1", keyId: "00000000-0000-4000-8000-000000000001",
				meta: { apiKeyId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key" },
				rawBody: structuredClone(body), body: structuredClone(body), model: MAIN, requestedModel: MAIN,
				stream: options.stream === true, providers: [],
				pricing: { [`openai:${MAIN}`]: mainCard },
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
				teamSettings: { billingMode: "wallet" },
				timer: new Timer(),
				...options.ctx,
			} as any,
		},
		req: new Request("https://example.com/v1/chat/completions", { method: "POST" }),
		endpoint: "chat.completions" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

async function drainBackground() {
	for (let i = 0; i < 5; i += 1) {
		while (mocks.background.length) await Promise.all(mocks.background.splice(0));
		await new Promise((resolve) => setImmediate(resolve));
	}
}

/** Runs one request to its end. `advisorUsage` is what each advisor call reports. */
async function run(
	mainRounds: Array<ReturnType<typeof round> | Promise<never>>,
	options: Parameters<typeof request>[0] & { advisorUsage?: Usage } = {},
) {
	const subCalls: string[] = [];
	const toolResults: any[] = [];
	let next = 0;
	mocks.doRequestWithIR.mockImplementation(async (ctx: any, ir: any) => {
		if (String(ctx.requestId).endsWith(":advisor")) {
			subCalls.push(ctx.model);
			const sub = round(options.advisorUsage ?? { input: 2_000, output: 400 });
			return { result: { ...sub.result, provider: "anthropic", apiModelId: ADVISOR } };
		}
		toolResults.length = 0;
		for (const message of ir.messages) if (message.role === "tool") toolResults.push(...message.toolResults);
		return mainRounds[next++];
	});
	const args = request(options);
	const response = await runTextGeneratePipeline(args);
	return { args, response, subCalls, toolResults };
}

async function runToEnd(mainRounds: Array<ReturnType<typeof round>>, options: Parameters<typeof run>[1] = {}) {
	const result = await run(mainRounds, options);
	const body = await result.response.text();
	await drainBackground();
	return { ...result, status: result.response.status, body };
}

beforeEach(() => {
	db.rows.length = 0;
	db.debits.length = 0;
	db.totals.length = 0;
	mocks.doRequestWithIR.mockReset();
	mocks.fetchGatewayContext.mockReset();
	mocks.buildCandidates.mockReset();
	mocks.background.length = 0;
	mocks.bindings = {};
	vi.unstubAllGlobals();
});

describe("a completed response with no visible output", () => {
	it("returns 502 and charges the input the provider reported", async () => {
		const result = await runToEnd([round({ input: 800_000, output: 0 }, { text: "" })]);
		expect(result.status).toBe(502);
		expect(JSON.parse(result.body).error.code).toBe("google_empty_response");
		expect(db.debits.map((debit) => debit.cost_nanos)).toEqual([800_000_000]);
		expect(db.rows).toHaveLength(1);
		expect(db.rows[0]!.cost_nanos).toBe(800_000_000);
		expect(db.rows[0]!.success).toBe(false);
		expect(JSON.stringify(db.rows[0])).not.toContain("billing_suppressed");
	});

	it("charges reasoning tokens the provider reported without returning their text", async () => {
		const result = await runToEnd([round({ input: 800_000, output: 30_000, reasoning: 30_000 }, { text: "" })]);
		expect(result.status).toBe(502);
		// 800,000 x $1 + 30,000 x $4 per million.
		expect(db.debits.map((debit) => debit.cost_nanos)).toEqual([920_000_000]);
		expect(db.rows[0]!.cost_nanos).toBe(920_000_000);
	});

	it("charges nothing when the provider reported no billable usage", async () => {
		const result = await runToEnd([round({ input: 0, output: 0 }, { text: "" })]);
		expect(result.status).toBe(502);
		expect(db.debits).toEqual([]);
		expect(db.totals).toEqual([]);
		expect(db.rows).toHaveLength(1);
		expect(db.rows[0]!.cost_nanos ?? 0).toBe(0);
		expect(db.rows[0]!.usage?.pricing).toMatchObject({ total_nanos: 0, billing_suppressed: true, billing_suppression_reason: "empty_response" });
	});

	it("charges an empty server-tool follow-up round together with the rounds before it", async () => {
		const result = await runToEnd([
			round({ input: 1_000, output: 100 }, { toolCalls: [datetime] }),
			round({ input: 2_000, output: 0 }, { text: "" }),
		], { tools: [{ type: "phaseo:datetime" }] });
		expect(result.status).toBe(502);
		// Round 1: 1,000 x $1 + 100 x $4; the empty round: 2,000 x $1 (per million).
		expect(db.debits.map((debit) => debit.cost_nanos)).toEqual([1_400_000 + 2_000_000]);
		expect(db.rows[0]!.cost_nanos).toBe(3_400_000);
	});
});

describe("paid server-tool work stops once the request has used up the wallet balance", () => {
	const TEN_CENTS = 100_000_000;
	// 12,000 input tokens at $5 per million: $0.06 for each advisor call.
	const advisorUsage = { input: 12_000, output: 0 };
	const tools = [{ type: "phaseo:advisor", model: ADVISOR, max_uses: 4 }];

	function setAdvisorContext(credit: Record<string, unknown>, teamSettings: Record<string, unknown> = { billingMode: "wallet" }) {
		mocks.fetchGatewayContext.mockImplementation(async () => ({
			resolvedModel: ADVISOR, pricing: { [`anthropic:${ADVISOR}`]: advisorCard },
			key: { ok: true }, keyLimit: { ok: true }, credit, teamSettings,
		}));
		mocks.buildCandidates.mockReturnValue({ candidates: [{ providerId: "anthropic", apiModelId: ADVISOR, pricingCard: advisorCard }], diagnostics: {} });
	}
	const threeAdvisorCalls = () => [
		round({ input: 1_000, output: 100 }, { toolCalls: [advisor, advisor, advisor] }),
		round({ input: 1_500, output: 100 }),
	];

	it("refuses the next sub-model call once earlier calls have reached the balance", async () => {
		const credit = { ok: true, reason: null, balanceNanos: TEN_CENTS };
		setAdvisorContext(credit);
		const result = await runToEnd(threeAdvisorCalls(), { tools, advisorUsage, ctx: { gating: { key: { ok: true }, keyLimit: { ok: true }, credit } } });
		expect(result.status).toBe(200);
		// $0.06, then $0.12 spent: the third call is not made.
		expect(result.subCalls).toHaveLength(2);
		expect(result.toolResults.map((toolResult) => toolResult.isError === true)).toEqual([false, false, true]);
		expect(String(result.toolResults[2].content)).toContain("Insufficient credits");
		expect(result.args.pre.ctx.serverToolSubCallCharges).toHaveLength(2);
		// Two main rounds ($0.0033) and two advisor calls.
		expect(db.debits.map((debit) => debit.cost_nanos)).toEqual([3_300_000 + 2 * 60_000_000]);
	});

	it("keeps a later wallet read that fails when the request has charged nothing itself", async () => {
		setAdvisorContext({ ok: false, reason: "insufficient_funds", balanceNanos: 0 });
		const admitted = { ok: true, reason: null, balanceNanos: 3 * TEN_CENTS };
		const result = await runToEnd(threeAdvisorCalls(), { tools, advisorUsage, ctx: { gating: { key: { ok: true }, keyLimit: { ok: true }, credit: admitted } } });
		expect(result.subCalls).toHaveLength(0);
		expect(result.toolResults.map((toolResult) => toolResult.isError === true)).toEqual([true, true, true]);
	});

	it("measures tool spend against the balance the request was admitted on", async () => {
		// A later wallet read already includes this request's provisional charges.
		setAdvisorContext({ ok: true, reason: null, balanceNanos: 110_000_000 });
		const admitted = { ok: true, reason: null, balanceNanos: 3 * TEN_CENTS };
		const result = await runToEnd(threeAdvisorCalls(), { tools, advisorUsage, ctx: { gating: { key: { ok: true }, keyLimit: { ok: true }, credit: admitted } } });
		expect(result.subCalls).toHaveLength(3);
		expect(result.toolResults.map((toolResult) => toolResult.isError === true)).toEqual([false, false, false]);
	});

	it.each([
		["a balance that covers every call", { credit: { ok: true, reason: null, balanceNanos: 10 * TEN_CENTS } }],
		["a credit snapshot without a balance", { credit: { ok: true, reason: null } }],
		["invoice billing", { credit: { ok: true, reason: null, balanceNanos: TEN_CENTS }, teamSettings: { billingMode: "invoice" } }],
		["an internal caller", { credit: { ok: true, reason: null, balanceNanos: TEN_CENTS }, internal: true }],
	])("runs every sub-model call with %s", async (_label, setup: { credit: Record<string, unknown>; teamSettings?: Record<string, unknown>; internal?: boolean }) => {
		setAdvisorContext(setup.credit, setup.teamSettings);
		const result = await runToEnd(threeAdvisorCalls(), {
			tools, advisorUsage,
			ctx: {
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: setup.credit },
				...(setup.teamSettings ? { teamSettings: setup.teamSettings } : {}),
				...(setup.internal ? { internal: true } : {}),
			},
		});
		expect(result.subCalls).toHaveLength(3);
	});

	it("refuses a paid managed search in a later round once sub-model calls have reached the balance", async () => {
		const fetchMock = vi.fn(async () => { throw new TypeError("no network in tests"); });
		vi.stubGlobal("fetch", fetchMock);
		mocks.bindings = { EXA_API_KEY: "exa-test-key" };
		const credit = { ok: true, reason: null, balanceNanos: TEN_CENTS };
		setAdvisorContext(credit);
		const result = await runToEnd([
			round({ input: 1_000, output: 100 }, { toolCalls: [advisor, advisor] }),
			round({ input: 1_000, output: 100 }, { toolCalls: [search] }),
			round({ input: 1_500, output: 100 }),
		], {
			tools: [...tools, { type: "phaseo:web_search" }],
			advisorUsage,
			ctx: { gating: { key: { ok: true }, keyLimit: { ok: true }, credit } },
		});
		expect(result.status).toBe(200);
		expect(result.subCalls).toHaveLength(2);
		const searchResult = result.toolResults.at(-1);
		expect(searchResult.isError).toBe(true);
		expect(String(searchResult.content)).toContain("insufficient_credits");
		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("exa"))).toEqual([]);
	});
});

describe("a streamed server-tool request is charged for completed rounds as it goes", () => {
	const tools = [{ type: "phaseo:datetime" }];
	const firstRound = () => round({ input: 1_000, output: 100 }, { toolCalls: [datetime] });
	const stepped = () => db.totals.map((total) => [total.final ? "final" : "provisional", total.requestId, total.total_nanos]);

	it("records the completed round as a provisional charge before the next round returns", async () => {
		// The second round never completes (the request is still running, or was stopped).
		const result = await run([firstRound(), new Promise<never>(() => {})], { tools, stream: true });
		expect(result.response.status).toBe(200);
		await drainBackgroundWhilePending();
		expect(stepped()).toEqual([["provisional", "bill_1", 1_400_000]]);
		expect(db.debits).toEqual([]);
	});

	it("settles the final total once, on top of the provisional charge", async () => {
		const result = await runToEnd([firstRound(), round({ input: 1_500, output: 100 })], { tools, stream: true });
		expect(result.status).toBe(200);
		expect(result.body).toContain("Done.");
		// Round 2: 1,500 x $1 + 100 x $4 per million.
		expect(stepped()).toEqual([["provisional", "bill_1", 1_400_000], ["final", "bill_1", 1_400_000 + 1_900_000]]);
		expect(db.debits).toEqual([]);
		expect(db.rows).toHaveLength(1);
		expect(db.rows[0]!.cost_nanos).toBe(3_300_000);
	});

	it("includes the model calls its tools made in the provisional charge", async () => {
		mocks.fetchGatewayContext.mockImplementation(async () => ({
			resolvedModel: ADVISOR, pricing: { [`anthropic:${ADVISOR}`]: advisorCard },
			key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true }, teamSettings: { billingMode: "wallet" },
		}));
		mocks.buildCandidates.mockReturnValue({ candidates: [{ providerId: "anthropic", apiModelId: ADVISOR, pricingCard: advisorCard }], diagnostics: {} });
		await run([round({ input: 1_000, output: 100 }, { toolCalls: [advisor] }), new Promise<never>(() => {})], {
			tools: [{ type: "phaseo:advisor", model: ADVISOR }], stream: true,
		});
		await drainBackgroundWhilePending();
		// The advisor call: 2,000 x $5 + 400 x $25 per million.
		expect(stepped()).toEqual([["provisional", "bill_1", 1_400_000 + 20_000_000]]);
	});

	it("settles the completed round when the follow-up request then fails", async () => {
		const failed = new Response(JSON.stringify({ error: "upstream_error", message: "failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
		const result = await runToEnd([firstRound(), failed as any], { tools, stream: true });
		expect(result.status).toBe(200);
		expect(stepped()).toEqual([["provisional", "bill_1", 1_400_000], ["final", "bill_1", 1_400_000]]);
		expect(db.debits).toEqual([]);
	});

	it("records no provisional charge for a round on the workspace's own provider key within its fee allowance", async () => {
		const byokRound = round({ input: 1_000, output: 100 }, { toolCalls: [datetime], keySource: "byok" });
		await run([byokRound, new Promise<never>(() => {})], { tools, stream: true });
		await drainBackgroundWhilePending();
		expect(db.totals).toEqual([]);
		expect(db.debits).toEqual([]);
	});

	it("charges a buffered server-tool request once, with no provisional charge", async () => {
		const result = await runToEnd([firstRound(), round({ input: 1_500, output: 100 })], { tools });
		expect(result.status).toBe(200);
		expect(db.totals).toEqual([]);
		expect(db.debits.map((debit) => debit.cost_nanos)).toEqual([3_300_000]);
	});
});

/** Lets background work that can finish do so while one round is still pending. */
async function drainBackgroundWhilePending() {
	for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
