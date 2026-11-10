import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Charged requests run end to end against the spend-limit coordinator this branch ships (main's,
// unchanged): the real stream, buffered and speech handlers, charge helpers, failure/success audit,
// telemetry runner and spend-limit isolate, with only the wallet RPCs, the audit row writers and the
// seed read replaced. The coordinator gets one record per request, at its final settlement, with its
// final total (0 successful requests for a charged failure), whether or not the audit row landed.
//
// The fake seed follows main's gateway_spend_limit_seed: it counts successful request rows only
// (`success is true`) and returns excluded rows with their real success flag. Under main's SQL a
// charged failure stops counting once its row is seen; keeping it counted after a reseed is #3547's
// seed SQL ("money movements win"), which #3633 ships inside, and #3547's real-SQL test covers it.
// So this file asserts no counts after a reseed for failure rows.
const runtime = vi.hoisted(() => ({ bindings: null as Record<string, unknown> | null, background: [] as Promise<unknown>[] }));
const chargeRpcMock = vi.hoisted(() => vi.fn(async (_kind: string, _args: any) => ({ applied: true })));
const auditRows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
// How the gateway_requests row write ends: written, rejected, or the sink reporting failure (false).
const auditWrite = vi.hoisted(() => ({ mode: "ok" as "ok" | "reject" | "false" }));
const telemetry = vi.hoisted(() => ({ real: null as null | ((args: any) => Promise<unknown>) }));
const telemetryMock = vi.hoisted(() => vi.fn((args: any) => telemetry.real!(args)));
const dataContributionMock = vi.hoisted(() => vi.fn(async (_args: any) => ({ status: "skipped" })));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => runtime.bindings,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
	getResponseCache: () => null,
}));
vi.mock("../pricing/persist", () => ({
	recordUsageAndCharge: (args: any) => chargeRpcMock("one_off", args),
	recordRequestChargeTotal: (args: any) => chargeRpcMock("total", args),
	readRequestChargeTotal: async () => 0,
}));
// The real telemetry runner, which turns a rejected row write, or a sink returning false, into an
// undelivered row rather than an error.
vi.mock("@observability/gateway-telemetry", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@observability/gateway-telemetry")>();
	telemetry.real = actual.runGatewayTelemetryPipelines;
	return { ...actual, runGatewayTelemetryPipelines: (args: any) => telemetryMock(args) };
});
vi.mock("@observability/axiom", () => ({
	emitGatewayTelemetryDeliveryFailure: vi.fn(async () => undefined),
	emitGatewayOperationalFailure: vi.fn(async () => undefined),
}));
// The rows the audit writes (the request row write itself is covered elsewhere).
vi.mock("../audit", async (importOriginal) => ({
	...(await importOriginal<typeof import("../audit")>()),
	auditFailure: async (args: Record<string, unknown>) => { auditRows.push({ kind: "failure", ...args }); },
	auditSuccess: async (args: Record<string, unknown>) => {
		if (auditWrite.mode === "reject") throw new Error("gateway_requests insert failed");
		if (auditWrite.mode === "false") return false;
		auditRows.push({ kind: "success", ...args });
	},
}));
vi.mock("../classification/data-contribution", async (importOriginal) => ({
	...(await importOriginal<typeof import("../classification/data-contribution")>()),
	persistDataContribution: (args: any) => dataContributionMock(args),
}));
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn(async () => undefined) }));
vi.mock("../classification/request-classifiers", () => ({ applyRequestClassifiers: vi.fn(async () => undefined) }));
vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: vi.fn(async () => undefined),
	reportProbeResult: vi.fn(async () => undefined),
	maybeOpenOnRecentErrors: vi.fn(async () => undefined),
}));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(async () => undefined),
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: baseCostNanos / 1e7, totalNanos: baseCostNanos, currency: currencyHint, pricedUsage,
	}),
}));
// $1 per million input tokens, $10 per million output tokens.
vi.mock("./pricing", () => ({
	loadProviderPricing: async () => ({ rules: [], currency: "USD" }),
	calculatePricing: (usage: any) => {
		const input = Number(usage?.input_tokens ?? usage?.prompt_tokens ?? 0);
		const output = Number(usage?.output_tokens ?? usage?.completion_tokens ?? 0);
		const totalNanos = input * 1_000 + output * 10_000;
		return { pricedUsage: { ...usage, pricing: { total_nanos: totalNanos } }, totalCents: totalNanos / 1e7, totalNanos, currency: "USD" };
	},
}));

const { SpendLimitDurableObject } = await import("@core/spend-limit-durable-object");
const { __resetSpendLimitsForTests, checkSpendLimit, flushSpendRecordsForTests } = await import("@core/spend-limits");
const { handleStreamResponse } = await import("./stream");
const { finalizeRequest } = await import("./index");

const WORKSPACE = "10000000-0000-4000-8000-000000000051";
const KEY = "30000000-0000-4000-8000-000000000051";
const FINAL_TOTAL = 120 * 1_000 + 250 * 10_000;

/** gateway_requests rows the seed reads; like main's SQL it counts only successful ones, minus excluded ids. */
const rows: Array<{ requestId: string; cost: number; success: boolean }> = [];
const day = () => { const date = new Date(); date.setUTCHours(0, 0, 0, 0); return date.getTime(); };

class SeededCoordinator extends SpendLimitDurableObject {
	protected override async loadSeed(_workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		const start = day();
		const counted = rows.filter((row) => row.success && !exclude.includes(row.requestId));
		const used = counted.reduce((sum, row) => sum + row.cost, 0);
		const count = counted.length;
		const iso = (ms: number) => new Date(ms).toISOString();
		const week = start - ((new Date(start).getUTCDay() + 6) % 7) * 86_400_000;
		const month = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), 1);
		return {
			now: iso(Date.now()), day_start: iso(start), week_start: iso(week), month_start: iso(month),
			keys: keyIds.map((keyId) => ({
				key_id: keyId, active: true, soft_blocked: false, limited: true,
				limits: { daily: { requests: null, cost_nanos: 10_000_000 }, weekly: { requests: null, cost_nanos: null }, monthly: { requests: null, cost_nanos: null } },
				used: {
					daily: { requests: count, cost_nanos: used }, weekly: { requests: count, cost_nanos: used }, monthly: { requests: count, cost_nanos: used },
				},
			})),
			budget_status: { ok: true, budgets: [] },
			department_budgets: [],
			excluded_rows: rows.filter((row) => exclude.includes(row.requestId)).map((row) => ({
				request_id: row.requestId, key_id: KEY, success: row.success, cost_nanos: row.cost, created_at: iso(Date.now()),
			})),
		};
	}

	reseedNow(): Promise<void> {
		return (this as unknown as { reseed(key: string | null): Promise<void> }).reseed(null);
	}
}

let coordinator: SeededCoordinator;
let recorded: unknown[];

function start(c: any) {
	const enc = new TextEncoder();
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start(next) { controller = next; } });
	const chunk = (payload: Record<string, unknown>) => controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
	const upstream = {
		text: (content: string) => chunk({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] }),
		// The upstream closes with no terminal event and no usage.
		cut: () => controller.close(),
		finish: (usage: Record<string, number>) => {
			chunk({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
			chunk({ id: "c", object: "chat.completion.chunk", choices: [], usage });
			controller.enqueue(enc.encode("data: [DONE]\n\n"));
			controller.close();
		},
	};
	const response = new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
	return handleStreamResponse(c, {
		kind: "stream", stream: response.body, upstream: response, provider: "openai", keySource: "gateway",
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		mappedRequest: null, rawResponse: null,
	} as any, { rules: [], currency: "USD" } as any).then((resp) => ({ upstream, reader: resp.body!.getReader() }));
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
// Background work includes the stream pump and the 20 ms record batch timer (fake timers here).
async function settle() {
	for (let round = 0; round < 5; round += 1) {
		for (let i = 0; i < 10; i += 1) await tick();
		await vi.advanceTimersByTimeAsync(25);
		const pending = runtime.background.splice(0);
		if (pending.length) await Promise.race([Promise.all(pending), new Promise((resolve) => setImmediate(resolve))]);
	}
}

/** The coordinator's daily bucket for the key, read through an admission it then releases. */
async function daily() {
	const id = `probe-${Math.random()}`;
	const admitted = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], id);
	if (!("lease" in admitted)) return admitted.denial?.gate.buckets?.daily;
	if (admitted.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: admitted.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, admitted.lease.id, id);
	return admitted.lease.meta.buckets?.daily;
}

async function dailyCost(): Promise<number> {
	const result = await coordinator.acquire(WORKSPACE, KEY, { requests: 0, units: 0 }, { requests: 0, units: 0 }, [], `peek-${Math.random()}`);
	if ("lease" in result) return Number(result.lease.meta.buckets?.daily.costUsedNanos);
	// A background top-up that grants nothing returns no buckets: read them through an admission.
	const admitted = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], `probe-${Math.random()}`);
	const buckets = "lease" in admitted ? admitted.lease.meta.buckets : admitted.denial?.gate.buckets;
	if ("lease" in admitted) await coordinator.release(WORKSPACE, admitted.lease.id, `probe-${Math.random()}`);
	return Number(buckets?.daily.costUsedNanos);
}

describe("charged requests, with main's spend-limit coordinator", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		rows.length = 0;
		chargeRpcMock.mockReset().mockResolvedValue({ applied: true });
		telemetryMock.mockReset().mockImplementation((args: any) => telemetry.real!(args));
		auditRows.length = 0;
		auditWrite.mode = "ok";
		dataContributionMock.mockReset().mockResolvedValue({ status: "skipped" });
		const sqlite = new DatabaseSync(":memory:");
		coordinator = new SeededCoordinator({
			blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
			storage: { sql: { exec: (query: string, ...args: Array<string | number | null>) => {
				const statement = sqlite.prepare(query);
				const result = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
				return { toArray: () => result, one: () => result[0] };
			} } },
		} as unknown as DurableObjectState, {} as never);
		recorded = [];
		const record = coordinator.record.bind(coordinator);
		coordinator.record = async (...args: Parameters<typeof record>) => {
			recorded.push(args[1]);
			return record(...args);
		};
		runtime.bindings = { SPEND_LIMITS: { getByName: () => coordinator }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		runtime.background.length = 0;
		__resetSpendLimitsForTests();
	});
	afterEach(() => { vi.useRealTimers(); });

	it("counts the checkpoint and the final once, at the final total", async () => {
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req_settle" });
		if (decision.outcome !== "allowed") throw new Error("expected admission");
		const c: any = {
			requestId: "req_settle", billingRequestId: "bill_settle", workspaceId: WORKSPACE, keyId: KEY,
			endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate",
			model: "openai/gpt-5-mini", requestedModel: "openai/gpt-5-mini", stream: true,
			body: { model: "openai/gpt-5-mini", stream: true, messages: [{ role: "user", content: "x".repeat(500) }] }, rawBody: {},
			meta: { requestId: "req_settle", apiKeyId: KEY, authMethod: "api_key" }, providers: [], pricing: {},
			gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
			spendAdmission: decision.admission,
		};
		const { upstream, reader } = await start(c);
		upstream.text("y".repeat(500));
		await reader.read();
		await reader.cancel();
		// 15 s after the client left: a checkpoint debits the wallet ($0.01) ...
		await vi.advanceTimersByTimeAsync(15_000);
		await settle();
		expect(chargeRpcMock.mock.calls.map(([kind, args]) => [kind, args.final, args.total_nanos])).toEqual([["total", false, 1_000_000]]);
		// ... and sends the coordinator nothing.
		await flushSpendRecordsForTests();
		expect(recorded).toEqual([]);
		// The drain finishes: the final settles the request's total.
		upstream.finish({ prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 });
		await settle();
		expect(chargeRpcMock.mock.calls.at(-1)?.[1]).toMatchObject({ final: true, total_nanos: FINAL_TOTAL });
		await flushSpendRecordsForTests();
		await settle();
		// One record, at the final total.
		const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number }>;
		expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos])).toEqual([["bill_settle", FINAL_TOTAL]]);
		expect(await dailyCost()).toBe(FINAL_TOTAL);
		// The request row lands and the seed takes it over: still counted once.
		rows.push({ requestId: "req_settle", cost: FINAL_TOTAL, success: true });
		await coordinator.reseedNow();
		await coordinator.reseedNow();
		expect(await dailyCost()).toBe(FINAL_TOTAL);
	});

	it("counts a charged cancellation once, at its final total, as 0 successful requests", async () => {
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req_cancel" });
		if (decision.outcome !== "allowed") throw new Error("expected admission");
		const c: any = {
			requestId: "req_cancel", billingRequestId: "bill_cancel", workspaceId: WORKSPACE, keyId: KEY,
			endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate",
			model: "openai/gpt-5-mini", requestedModel: "openai/gpt-5-mini", stream: true,
			body: { model: "openai/gpt-5-mini", stream: true, messages: [{ role: "user", content: "x".repeat(500) }] }, rawBody: {},
			meta: { requestId: "req_cancel", apiKeyId: KEY, authMethod: "api_key" }, providers: [], pricing: {},
			gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
			spendAdmission: decision.admission,
		};
		const { upstream, reader } = await start(c);
		upstream.text("y".repeat(500));
		await reader.read();
		await reader.cancel();
		await vi.advanceTimersByTimeAsync(15_000);
		await settle();
		// The drain ends early with no usage: the request keeps the $0.01 the checkpoint estimated.
		upstream.text("z".repeat(500));
		upstream.cut();
		await settle();
		expect(chargeRpcMock.mock.calls.at(-1)?.[1]).toMatchObject({ final: true, total_nanos: 1_000_000 });
		await flushSpendRecordsForTests();
		await settle();
		const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number; requests: number }>;
		expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos, entry.requests])).toEqual([["bill_cancel", 1_000_000, 0]]);
		expect(await daily()).toMatchObject({ costUsedNanos: 1_000_000, requestsUsed: 0 });
		// No count after a reseed here: main's seed leaves out unsuccessful rows; #3547 covers it.
	});

	it("counts a one-off charge once, as 0 requests, when the stream fails after the debit", async () => {
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req_after" });
		if (decision.outcome !== "allowed") throw new Error("expected admission");
		const c: any = {
			requestId: "req_after", billingRequestId: "bill_after", workspaceId: WORKSPACE, keyId: KEY,
			endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate",
			model: "openai/gpt-5-mini", requestedModel: "openai/gpt-5-mini", stream: true,
			body: { model: "openai/gpt-5-mini", stream: true, messages: [{ role: "user", content: "x".repeat(500) }] }, rawBody: {},
			meta: { requestId: "req_after", apiKeyId: KEY, authMethod: "api_key" }, providers: [], pricing: {},
			gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
			spendAdmission: decision.admission,
		};
		// The success audit fails after the wallet debit; the finalization error audit follows.
		telemetryMock.mockRejectedValueOnce(new Error("telemetry unavailable"));
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { upstream, reader } = await start(c);
		upstream.text("Hello");
		upstream.finish({ prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 });
		while (!(await reader.read()).done) { /* the client reads to the end */ }
		await settle();
		await flushSpendRecordsForTests();
		await settle();
		error.mockRestore();
		expect(chargeRpcMock.mock.calls.map(([kind, args]) => [kind, args.cost_nanos])).toEqual([["one_off", FINAL_TOTAL]]);
		// The failure audit wrote the row with the confirmed charge ...
		expect(auditRows.map((row) => [row.kind, row.errorCode ?? null, row.costNanos ?? null])).toEqual([
			["failure", "gateway:stream_finalization_failed", FINAL_TOTAL],
		]);
		// ... and the coordinator got one record of it, as 0 successful requests.
		const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number; requests: number }>;
		expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos, entry.requests])).toEqual([["bill_after", FINAL_TOTAL, 0]]);
		expect(await daily()).toMatchObject({ costUsedNanos: FINAL_TOTAL, requestsUsed: 0 });
	});

	describe("a confirmed debit whose success row is not delivered", () => {
		function contextFor(id: string, overrides: Record<string, unknown>): any {
			return {
				requestId: `req_${id}`, billingRequestId: `bill_${id}`, workspaceId: WORKSPACE, keyId: KEY,
				endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate",
				model: "openai/gpt-5-mini", requestedModel: "openai/gpt-5-mini", stream: false,
				body: { model: "openai/gpt-5-mini", messages: [{ role: "user", content: "Hello" }] }, rawBody: {},
				meta: { requestId: `req_${id}`, apiKeyId: KEY, authMethod: "api_key", startedAtMs: Date.now() - 50 }, providers: [], pricing: {},
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
				timer: { span: (_name: string, fn: () => unknown) => fn(), mark: () => {}, end: () => {} },
				...overrides,
			};
		}

		// Each runs the real caller to the end of its accounting: $2.62 debited, then the row write fails.
		const callers: Record<string, (c: any) => Promise<void>> = {
			async buffered(c) {
				const payload = {
					id: "chatcmpl-1", object: "chat.completion", created: 1, model: "gpt-5-mini",
					choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
					usage: { prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 },
				};
				const result: any = {
					kind: "completed", provider: "openai", keySource: "gateway", upstream: new Response(null, { status: 200 }),
					normalized: payload, rawResponse: payload, mappedRequest: null,
					bill: { cost_cents: 0, currency: "USD", usage: payload.usage, upstream_id: "chatcmpl-1", finish_reason: "stop" },
				};
				const response = await finalizeRequest({ pre: { ok: true, ctx: c }, exec: { ok: true, result }, endpoint: c.endpoint } as any);
				expect(response.status).toBe(200);
			},
			async streamed(c) {
				const { upstream, reader } = await start({ ...c, stream: true, body: { ...c.body, stream: true } });
				upstream.text("Hello");
				upstream.finish({ prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 });
				while (!(await reader.read()).done) { /* the client reads to the end */ }
			},
			async speech(c) {
				const speech = { ...c, endpoint: "audio.speech", capability: "audio.speech", body: { model: "openai/gpt-4o-mini-tts", input: "Hello", voice: "alloy" } };
				const bill = { cost_cents: 0, currency: "USD", usage: { input_tokens: 120, output_tokens: 250, total_tokens: 370 }, upstream_id: "speech_1", finish_reason: null };
				const result: any = {
					kind: "stream", provider: "openai", keySource: "gateway", generationTimeMs: 1,
					upstream: new Response(null, { status: 200, headers: { "content-type": "audio/mpeg" } }),
					stream: new Response(new Uint8Array([1, 2, 3])).body, usageFinalizer: async () => bill, bill,
				};
				const response = await finalizeRequest({ pre: { ok: true, ctx: speech }, exec: { ok: true, result }, endpoint: "audio.speech" } as any);
				const reader = response.body!.getReader();
				while (!(await reader.read()).done) { /* the client reads to the end */ }
			},
		};

		it.each([
			["buffered", "reject"], ["buffered", "false"],
			["streamed", "reject"], ["streamed", "false"],
			["speech", "reject"], ["speech", "false"],
		] as const)("counts a %s request at once when its row write is %s", async (path, mode) => {
			const id = `${path}_${mode}`;
			const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: `req_${id}` });
			if (decision.outcome !== "allowed") throw new Error("expected admission");
			auditWrite.mode = mode;
			const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
			await callers[path](contextFor(id, { spendAdmission: decision.admission }));
			await settle();
			await flushSpendRecordsForTests();
			await settle();
			error.mockRestore();
			expect(chargeRpcMock.mock.calls.map(([kind, args]) => [kind, args.cost_nanos])).toEqual([["one_off", FINAL_TOTAL]]);
			// The row did not land ...
			expect(auditRows).toEqual([]);
			// ... and the coordinator counts the debit straight away, once, as the success it was.
			const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number; requests: number }>;
			expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos, entry.requests])).toEqual([[`bill_${id}`, FINAL_TOTAL, 1]]);
			expect(await daily()).toMatchObject({ costUsedNanos: FINAL_TOTAL, requestsUsed: 1 });
		});

		it("routes a buffered finalization error after the debit to the charged-failure record", async () => {
			const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req_buffered_throw" });
			if (decision.outcome !== "allowed") throw new Error("expected admission");
			// The success audit throws after the wallet debit.
			telemetryMock.mockRejectedValueOnce(new Error("telemetry unavailable"));
			const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
			await callers.buffered(contextFor("buffered_throw", { spendAdmission: decision.admission }));
			await settle();
			await flushSpendRecordsForTests();
			await settle();
			error.mockRestore();
			expect(auditRows.map((row) => [row.kind, row.errorCode ?? null, row.costNanos ?? null])).toEqual([
				["failure", "gateway:nonstream_finalization_failed", FINAL_TOTAL],
			]);
			const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number; requests: number }>;
			expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos, entry.requests])).toEqual([["bill_buffered_throw", FINAL_TOTAL, 0]]);
			expect(await daily()).toMatchObject({ costUsedNanos: FINAL_TOTAL, requestsUsed: 0 });
		});

		it.each(["buffered", "streamed", "speech"] as const)(
			"keeps one success row and one record when a %s request's success audit throws after its row landed",
			async (path) => {
				const id = `${path}_late`;
				const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: `req_${id}` });
				if (decision.outcome !== "allowed") throw new Error("expected admission");
				// The success row lands and spend is settled; data contribution then throws, which sends
				// the request to the finalization failure audit.
				dataContributionMock.mockRejectedValueOnce(new Error("contribution store unavailable"));
				const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
				await callers[path](contextFor(id, {
					spendAdmission: decision.admission,
					teamSettings: { dataContributionEnabled: true },
				}));
				await settle();
				await flushSpendRecordsForTests();
				await settle();
				const reported = error.mock.calls.filter(([message]) => message === "[gateway] request accounting error");
				error.mockRestore();
				expect(dataContributionMock).toHaveBeenCalledTimes(1);
				// One row, the success: the later error writes no second, billed row ...
				expect(auditRows.map((row) => [row.kind, row.statusCode])).toEqual([["success", 200]]);
				// ... and is reported as an accounting error instead.
				expect(reported.map(([, detail]) => (detail as { reason: string }).reason)).toEqual([
					`${path === "buffered" ? "nonstream" : path === "streamed" ? "stream" : "speech"}_finalization_failed`,
				]);
				// Data contribution discounts the bill (1% by default): the record is what was debited.
				const debited = chargeRpcMock.mock.calls.map(([, args]) => args.cost_nanos);
				expect(debited).toEqual([Math.round(FINAL_TOTAL * 0.99)]);
				const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number; requests: number }>;
				expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos, entry.requests])).toEqual([[`bill_${id}`, debited[0], 1]]);
				expect(await daily()).toMatchObject({ costUsedNanos: debited[0], requestsUsed: 1 });
			},
		);

		it("keeps a delivered buffered request a success, pending reconciliation, when its charge never goes through", async () => {
			const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req_charge_failed" });
			if (decision.outcome !== "allowed") throw new Error("expected admission");
			// Every charge attempt fails; the stored total reads back 0.
			chargeRpcMock.mockRejectedValue(new Error("db unavailable"));
			const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
			await callers.buffered(contextFor("charge_failed", { spendAdmission: decision.admission }));
			await settle();
			await vi.advanceTimersByTimeAsync(700);
			await settle();
			await flushSpendRecordsForTests();
			await settle();
			const reported = error.mock.calls.filter(([message]) => message === "[gateway] request accounting error");
			error.mockRestore();
			expect(chargeRpcMock).toHaveBeenCalledTimes(3);
			// The request is reported as the success it was, with its real status, and its row holds
			// what the database has (0) and the bill it meant to charge, pending reconciliation.
			expect(auditRows).toHaveLength(1);
			expect(auditRows[0]).toMatchObject({
				kind: "success",
				statusCode: 200,
				pendingCharge: { costNanos: 0, expectedCostNanos: FINAL_TOTAL },
				detailMetadata: expect.objectContaining({
					accounting_finalization: expect.objectContaining({ billing_status: "pending_reconciliation", response_delivered: true, expected_cost_nanos: FINAL_TOTAL }),
				}),
			});
			// The accounting error is reported apart from the request.
			expect(reported.map(([, detail]) => (detail as { reason: string }).reason)).toEqual(["charge_pending_reconciliation"]);
			// Spend limits count one successful request at the bill it meant to charge.
			const sent = recorded.flat() as Array<{ billingRequestId: string; costNanos: number; requests: number }>;
			expect(sent.map((entry) => [entry.billingRequestId, entry.costNanos, entry.requests])).toEqual([["bill_charge_failed", FINAL_TOTAL, 1]]);
			expect(await daily()).toMatchObject({ costUsedNanos: FINAL_TOTAL, requestsUsed: 1 });
		});
	});
});
