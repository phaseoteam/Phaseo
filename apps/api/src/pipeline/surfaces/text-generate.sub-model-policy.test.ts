import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import type { PriceCard } from "../pricing/types";

// Sub-model calls (advisor, subagent, fusion) follow the same workspace policy, key gates and
// data limits as the main model. Runs text-generate and the after stage for real; faked: provider
// calls, the context lookup, the workspace policy read, the database client and the wallet debit.
const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>>, debits: [] as Array<Record<string, any>> }));
const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	fetchGatewayContext: vi.fn(),
	buildCandidates: vi.fn(),
	fetchWorkspacePolicy: vi.fn(),
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
// The policy read is faked; applyWorkspacePolicy is the real function.
vi.mock("../before/workspacePolicy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../before/workspacePolicy")>()),
	fetchWorkspacePolicy: (...args: any[]) => mocks.fetchWorkspacePolicy(...args),
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
import { getEffectiveRoutingHints } from "../requestRouting";
import { buildWorkspacePolicy } from "../before/workspacePolicy";

const rule = (meter: string, price: string) =>
	({ pricing_plan: "standard", meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100 }) as PriceCard["rules"][number];
const card = (provider: string, model: string, rules: PriceCard["rules"]): PriceCard =>
	({ provider, model, endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null, rules } as PriceCard);

const MAIN = "openai/gpt-5.4-nano";
const OTHER = "anthropic/claude-opus-5.5";
const mainCard = card("openai", MAIN, [rule("input_text_tokens", "1"), rule("output_text_tokens", "4")]);
const subCard = (model: string) => card(model.split("/")[0]!, model, [rule("input_text_tokens", "5"), rule("output_text_tokens", "25")]);

function completed(provider: string, apiModelId: string, usage: { input: number; output: number }, toolCalls: Array<{ name: string; arguments: string }> | null) {
	return {
		result: {
			kind: "completed", provider, apiModelId, keySource: "gateway",
			upstream: new Response(null, { status: 200 }), generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output } },
			ir: {
				id: `resp_${apiModelId}`, model: apiModelId, provider,
				choices: [{
					index: 0,
					message: toolCalls
						? { role: "assistant", content: [], toolCalls: toolCalls.map((call, index) => ({ id: `call_${index}`, ...call })) }
						: { role: "assistant", content: [{ type: "text", text: "Done." }] },
					finishReason: toolCalls ? "tool_calls" : "stop",
				}],
				usage: { inputTokens: usage.input, outputTokens: usage.output, totalTokens: usage.input + usage.output },
			},
		},
	};
}

function request(tools: unknown[], routing?: Record<string, unknown>, extraCtx: Record<string, unknown> = {}) {
	const body = { model: MAIN, messages: [{ role: "user", content: "Help." }], tools, ...(routing ? { routing } : {}) };
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "chat.completions", capability: "text.generate", protocol: "openai.chat.completions",
				requestId: "req_1", billingRequestId: "bill_1", workspaceId: "ws_1", keyId: "00000000-0000-4000-8000-000000000001",
				meta: { apiKeyId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key" },
				rawBody: structuredClone(body), body: structuredClone(body), model: MAIN, requestedModel: MAIN,
				stream: false, providers: [],
				pricing: { [`openai:${MAIN}`]: mainCard },
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
				teamSettings: { billingMode: "wallet" },
				timer: new Timer(),
				...extraCtx,
			} as any,
		},
		req: new Request("https://example.com/v1/chat/completions", { method: "POST" }),
		endpoint: "chat.completions" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

/** Runs one request whose first round makes `toolCall`; returns the sub-calls that reached a provider and the tool results the model was sent. */
async function run(tools: unknown[], toolCall: { name: string; arguments: string }, options: { routing?: Record<string, unknown>; ctx?: Record<string, unknown> } = {}) {
	const subCalls: Array<{ model: string; body: any; providers: any[] }> = [];
	const toolResults: any[] = [];
	const rounds = [completed("openai", MAIN, { input: 1_000, output: 100 }, [toolCall]), completed("openai", MAIN, { input: 1_500, output: 100 }, null)];
	let next = 0;
	mocks.doRequestWithIR.mockImplementation(async (ctx: any, ir: any) => {
		if (String(ctx.requestId).endsWith(":advisor")) {
			subCalls.push({ model: ctx.model, body: ctx.body, providers: ctx.providers });
			return completed(String(ctx.model).split("/")[0]!, ctx.model, { input: 2_000, output: 400 }, null);
		}
		for (const message of ir.messages) if (message.role === "tool") toolResults.push(...message.toolResults);
		return rounds[next++];
	});
	const args = request(tools, options.routing, options.ctx);
	const response = await runTextGeneratePipeline(args);
	await response.text();
	while (mocks.background.length) await Promise.all(mocks.background.splice(0));
	return { status: response.status, subCalls, toolResults, ctx: args.pre.ctx };
}

const advisorCall = { name: "phaseo_advisor", arguments: JSON.stringify({ prompt: "Check this." }) };

describe("server-tool sub-model calls follow the workspace policy", () => {
	/** The candidates the context returns for a sub-model: by default one route that is not zero-data-retention. */
	let candidatesFor: (model: string) => any[];
	let contextGates: Record<string, unknown>;

	beforeEach(() => {
		db.rows.length = 0;
		db.debits.length = 0;
		mocks.doRequestWithIR.mockReset();
		mocks.fetchGatewayContext.mockReset();
		mocks.buildCandidates.mockReset();
		mocks.fetchWorkspacePolicy.mockReset();
		mocks.background.length = 0;
		mocks.bindings = {};
		contextGates = { key: { ok: true }, keyLimit: { ok: true } };
		candidatesFor = (model) => [{
			providerId: model.split("/")[0]!, apiModelId: model, zeroDataRetention: false,
			dataPolicyTier: "logs", dataPolicyConfidence: "confirmed", pricingCard: subCard(model),
		}];
		mocks.fetchWorkspacePolicy.mockResolvedValue(buildWorkspacePolicy({ globalSettings: {} as any }));
		mocks.fetchGatewayContext.mockImplementation(async (args: any) => ({
			resolvedModel: args.model, pricing: { [`${String(args.model).split("/")[0]}:${args.model}`]: subCard(args.model) },
			...contextGates, credit: { ok: true }, teamSettings: { billingMode: "wallet" }, __model: args.model,
		}));
		mocks.buildCandidates.mockImplementation((context: any) => ({ candidates: candidatesFor(context.__model), diagnostics: {} }));
	});

	it("runs an advisor model the policy allows and bills it", async () => {
		const result = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall);
		expect(result.status).toBe(200);
		expect(result.subCalls).toHaveLength(1);
		expect(mocks.fetchWorkspacePolicy).toHaveBeenCalledWith({ workspaceId: "ws_1", apiKeyId: "00000000-0000-4000-8000-000000000001" });
		expect(result.subCalls[0]!.body.provider).toBeUndefined();
		expect(result.ctx.serverToolSubCallCharges).toEqual([expect.objectContaining({ model: OTHER, totalNanos: 20_000_000 })]);
	});

	it("returns a tool error for an advisor model outside the model allow-list", async () => {
		mocks.fetchWorkspacePolicy.mockResolvedValue(buildWorkspacePolicy({
			globalSettings: { model_restriction_mode: "allowlist", model_restriction_model_ids: [MAIN] } as any,
		}));
		const result = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall);
		expect(result.status).toBe(200);
		expect(result.subCalls).toHaveLength(0);
		expect(result.toolResults).toEqual([expect.objectContaining({ isError: true })]);
		expect(JSON.parse(result.toolResults[0].content).message).toBe(`Advisor model "${OTHER}" is blocked by a workspace policy or guardrail.`);
		expect(result.ctx.serverToolSubCallCharges).toEqual([]);
		// Only the main model's two rounds are charged.
		expect(db.rows[0]!.cost_nanos).toBe(3_300_000);
	});

	it("applies the policy to a model named in the tool call's arguments", async () => {
		mocks.fetchWorkspacePolicy.mockResolvedValue(buildWorkspacePolicy({
			globalSettings: { model_restriction_mode: "allowlist", model_restriction_model_ids: [MAIN] } as any,
		}));
		const result = await run([{ type: "phaseo:advisor" }], { name: "phaseo_advisor", arguments: JSON.stringify({ prompt: "Check this.", model: OTHER }) });
		expect(result.subCalls).toHaveLength(0);
		expect(result.toolResults).toEqual([expect.objectContaining({ isError: true })]);
	});

	it("applies the provider block-list to subagent and fusion models", async () => {
		mocks.fetchWorkspacePolicy.mockResolvedValue(buildWorkspacePolicy({
			globalSettings: { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["anthropic"] } as any,
		}));
		const subagent = await run([{ type: "phaseo:subagent", model: OTHER }], { name: "phaseo_subagent", arguments: JSON.stringify({ task_description: "Do this." }) });
		expect(subagent.subCalls).toHaveLength(0);

		const fusion = await run(
			[{ type: "phaseo:fusion", parameters: { analysis_models: [OTHER, "google/gemini-4-carbon"], model: "google/gemini-4-carbon" } }],
			{ name: "phaseo_fusion", arguments: JSON.stringify({ prompt: "Compare." }) },
		);
		// The Google panel model and analyst run; the Anthropic panel model does not.
		expect(fusion.subCalls.map((call) => call.model)).toEqual(["google/gemini-4-carbon", "google/gemini-4-carbon"]);
	});

	it("keeps only zero-data-retention routes and requires it of the sub-call in a ZDR-only workspace", async () => {
		mocks.fetchWorkspacePolicy.mockResolvedValue(buildWorkspacePolicy({ globalSettings: { privacy_zdr_only: true } as any }));
		const blocked = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall);
		expect(blocked.subCalls).toHaveLength(0);

		candidatesFor = (model) => [
			{ providerId: "anthropic", apiModelId: model, zeroDataRetention: true, dataPolicyTier: "private", dataPolicyConfidence: "confirmed", pricingCard: subCard(model) },
			{ providerId: "amazon-bedrock", apiModelId: model, zeroDataRetention: false, dataPolicyTier: "logs", dataPolicyConfidence: "confirmed", pricingCard: subCard(model) },
		];
		const allowed = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall);
		expect(allowed.subCalls).toHaveLength(1);
		expect(allowed.subCalls[0]!.providers.map((provider: any) => provider.providerId)).toEqual(["anthropic"]);
		expect(getEffectiveRoutingHints(allowed.subCalls[0]!.body).requireZeroDataRetention).toBe(true);
	});

	it("carries the request's zero-data-retention and region requirements into the sub-call, not its provider lists", async () => {
		const result = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall, {
			routing: { require_zero_data_retention: true, zdr: true, required_data_region: "eu", only: ["openai"] },
		});
		expect(result.subCalls).toHaveLength(1);
		const hints = getEffectiveRoutingHints(result.subCalls[0]!.body);
		expect(hints.requireZeroDataRetention).toBe(true);
		expect(hints.requiredDataRegion).toBe("eu");
		expect(result.subCalls[0]!.body.provider.only).toBeUndefined();
	});

	it("returns a tool error when the key is not valid for the sub-model or has reached its limit", async () => {
		contextGates = { key: { ok: false, reason: "key_disabled" }, keyLimit: { ok: true } };
		const keyDenied = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall);
		expect(keyDenied.subCalls).toHaveLength(0);
		expect(keyDenied.toolResults).toEqual([expect.objectContaining({ isError: true })]);

		contextGates = { key: { ok: true }, keyLimit: { ok: false, reason: "daily_cost_limit_exceeded" } };
		const limitDenied = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall);
		expect(limitDenied.subCalls).toHaveLength(0);
		expect(JSON.stringify(limitDenied.toolResults[0])).toContain("reached its limit");

		// Internal callers skip key limits, as they do for a request of their own.
		const internal = await run([{ type: "phaseo:advisor", model: OTHER }], advisorCall, { ctx: { internal: true } });
		expect(internal.subCalls).toHaveLength(1);
	});
});
