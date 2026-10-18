// Simulates multi-step agent turns through the real router and the real sticky-routing
// store: KV is an in-memory map shared by every "isolate", and an isolate restart is a
// cleared L1. Health and provider quota are the only stubs.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecoveryProbeRequest } from "./health.config";

const runtime = vi.hoisted(() => ({
	kv: new Map<string, { value: string; ttlSeconds?: number }>(),
	background: [] as Promise<unknown>[],
	health: new Map<string, Record<string, unknown>>(),
	quotaPressure: new Map<string, number>(),
}));

vi.mock("@/core/kv", () => ({
	getJson: async (key: string) => {
		const entry = runtime.kv.get(key);
		return entry ? JSON.parse(entry.value) : null;
	},
	putJson: async (key: string, value: unknown, ttlSeconds?: number) => {
		runtime.kv.set(key, { value: JSON.stringify(value), ttlSeconds });
	},
}));

vi.mock("@/runtime/env", () => ({
	dispatchBackground: (promise: Promise<unknown>) => runtime.background.push(promise),
}));

vi.mock("./health", () => ({
	readHealthManyOptimistic: (_endpoint: string, _model: string, providerIds: string[]) =>
		Object.fromEntries(providerIds.map((providerId) => [providerId, healthFor(providerId)])),
}));

vi.mock("@core/provider-rate-limits", () => ({
	providerLimitModel: (c: { providerModelSlug?: string | null; apiModelId?: string | null }) =>
		c.providerModelSlug || c.apiModelId || null,
	providerQuotaPressure: (providerId: string) => runtime.quotaPressure.get(providerId) ?? 0,
	providerQuotaHeadroom: () => 1,
}));

const { routeProviders } = await import("./routing");
const sticky = await import("./sticky-routing");

const WORKSPACE = "ws_agent";
const MODEL = "anthropic/claude-sonnet-5";
// Sonnet 5 is served by seven routes, each with its own prompt cache.
const CLAUDE_PROVIDERS = [
	"anthropic",
	"anthropic-us",
	"anthropic-aws",
	"anthropic-aws-us",
	"amazon-bedrock",
	"google-vertex",
	"google-vertex-eu",
];
// Anthropic list prices for Sonnet 5 per token: $3/M input, $0.30/M cache read.
const SONNET_CARD = {
	provider: "anthropic",
	model: MODEL,
	endpoint: "chat.completions",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: "1",
	rules: [
		{ pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1, price_per_unit: "0.000003", currency: "USD", match: [], priority: 1 },
		{ pricing_plan: "standard", meter: "cached_read_text_tokens", unit: "token", unit_size: 1, price_per_unit: "0.0000003", currency: "USD", match: [], priority: 1 },
		{ pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1, price_per_unit: "0.000015", currency: "USD", match: [], priority: 1 },
	],
};

function healthFor(providerId: string) {
	return {
		endpoint: "chat.completions",
		provider: providerId,
		model: MODEL,
		lat_ewma_10s: 900,
		lat_ewma_60s: 900,
		lat_ewma_300s: 900,
		err_ewma_10s: 0,
		err_ewma_60s: 0,
		err_ewma_300s: 0,
		rate_10s: 1,
		rate_60s: 1,
		tp_ewma_60s: 60,
		rec_ok_ew_60s: 10,
		rec_tot_ew_60s: 10,
		rec_tot_ew_10s: 2,
		inflight: 0,
		current_load: 0,
		breaker: "closed",
		breaker_until_ms: 0,
		breaker_attempts: 0,
		last_success_ms: Date.now() - 1_000,
		last_ts_10s: Date.now() - 1_000,
		last_ts_60s: Date.now() - 1_000,
		last_ts_300s: Date.now() - 1_000,
		last_updated: Date.now(),
		...(runtime.health.get(providerId) ?? {}),
	};
}

function candidate(providerId: string, providerModelSlug = "claude-sonnet-5") {
	return {
		providerId,
		providerFamilyId: "anthropic",
		providerStatus: "active",
		providerRoutingStatus: "active",
		modelRoutingStatus: "active",
		capabilityStatus: "active",
		apiModelId: MODEL,
		providerModelSlug,
		adapter: { name: providerId },
		baseWeight: 1,
		byokMeta: [],
		pricingCard: { ...SONNET_CARD, provider: providerId },
	} as any;
}

// A 40-step coding-agent turn: a fixed system prompt and the same first user message,
// with tool results appended on every step.
function agentBody(step: number, extra: Record<string, unknown> = {}) {
	const messages: any[] = [
		{ role: "system", content: "You are a coding agent. Follow the repository conventions." },
		{ role: "user", content: "Fix the failing test in src/parser.ts" },
	];
	for (let i = 1; i < step; i++) {
		messages.push({ role: "assistant", content: null, tool_calls: [{ id: `call_${i}`, type: "function", function: { name: "read_file", arguments: `{"path":"src/f${i}.ts"}` } }] });
		messages.push({ role: "tool", tool_call_id: `call_${i}`, content: `file ${i}` });
	}
	return { model: MODEL, messages, ...extra };
}

/** Request ids for 40 steps, with every fifth step a recovery-probe request. */
function stepRequestIds(): string[] {
	const probes: string[] = [];
	const normal: string[] = [];
	for (let n = 0; probes.length < 8 || normal.length < 32; n++) {
		const id = `req_turn_${n}`;
		if (isRecoveryProbeRequest(WORKSPACE, id)) {
			if (probes.length < 8) probes.push(id);
		} else if (normal.length < 32) {
			normal.push(id);
		}
	}
	return Array.from({ length: 40 }, (_, i) => ((i + 1) % 5 === 0 ? probes.shift()! : normal.shift()!));
}

async function drainBackground() {
	while (runtime.background.length) await Promise.allSettled(runtime.background.splice(0));
}

async function runStep(args: {
	step: number;
	requestId: string;
	body: any;
	coldIsolate: boolean;
	cacheAwareRouting?: boolean;
	providers?: string[];
}) {
	if (args.coldIsolate) sticky.resetStickyRoutingStateForTests();
	const routed = await routeProviders((args.providers ?? CLAUDE_PROVIDERS).map((id) => candidate(id)), {
		endpoint: "chat.completions",
		model: MODEL,
		workspaceId: WORKSPACE,
		body: args.body,
		requestId: args.requestId,
		cacheAwareRouting: args.cacheAwareRouting,
	});
	const served = routed.ranked[0]!.candidate;
	// Claude streams on main drop cache_creation, so the first step reports no cache
	// usage at all; later steps report reads.
	const usage = args.step === 1
		? { input_tokens: 12_000, output_tokens: 400 }
		: { input_tokens: 600, output_tokens: 400, input_tokens_details: { cached_tokens: 12_000 } };
	await sticky.maybeWriteStickyRoutingFromUsage({
		workspaceId: WORKSPACE,
		endpoint: "chat.completions",
		model: MODEL,
		body: args.body,
		providerId: served.providerId,
		providerModelSlug: served.providerModelSlug,
		apiModelId: served.apiModelId,
		keySource: "gateway",
		usage,
		enabled: args.cacheAwareRouting !== false,
	});
	await drainBackground();
	return { providerId: served.providerId as string, diagnostics: routed.diagnostics };
}

beforeEach(() => {
	runtime.kv.clear();
	runtime.background.length = 0;
	runtime.health.clear();
	runtime.quotaPressure.clear();
	sticky.resetStickyRoutingStateForTests();
	// One route is recovering, so every probe request has somewhere to go.
	runtime.health.set("google-vertex-eu", { breaker: "half_open", err_ewma_10s: 0.2, err_ewma_60s: 0.2 });
});

describe("cache affinity across a 40-step agent turn", () => {
	it.each([
		["prompt_cache_key", { prompt_cache_key: "agent-turn-42" }],
		["session_id", { session_id: "sess_7f3a" }],
		["a cache_control opt-in", { provider_options: { anthropic: { cache_control: { type: "ephemeral" } } } }],
	])("keeps every step on one provider when the request carries %s", async (_label, extra) => {
		const requestIds = stepRequestIds();
		const served: string[] = [];
		let probeSteps = 0;
		let coldSteps = 0;
		for (let step = 1; step <= 40; step++) {
			const coldIsolate = step % 3 === 0;
			const result = await runStep({ step, requestId: requestIds[step - 1]!, body: agentBody(step, extra), coldIsolate });
			served.push(result.providerId);
			if (isRecoveryProbeRequest(WORKSPACE, requestIds[step - 1]!) && step > 1) {
				probeSteps++;
				expect(result.diagnostics.stickyRouting.recoveryProbeSkipped).toBe(true);
				expect(result.diagnostics.algorithm.selectionMethod).not.toBe("recovery_probe");
			}
			if (coldIsolate) {
				coldSteps++;
				expect(result.diagnostics.stickyRouting.readMode).toBe("kv");
			}
			if (step > 1) {
				expect(result.diagnostics.stickyRouting.applied).toBe(true);
				expect(result.diagnostics.stickyRouting.demotionReason).toBeNull();
			}
		}
		expect(probeSteps).toBeGreaterThanOrEqual(7);
		expect(coldSteps).toBe(13);
		expect(new Set(served).size).toBe(1);
		// One KV write for the whole turn: unchanged pins are not rewritten.
		expect(runtime.kv.size).toBe(1);
	});

	it("spreads the same turn across providers when affinity is off (baseline)", async () => {
		const requestIds = stepRequestIds();
		const served = new Set<string>();
		for (let step = 1; step <= 40; step++) {
			const result = await runStep({
				step,
				requestId: requestIds[step - 1]!,
				body: agentBody(step, { prompt_cache_key: "agent-turn-42" }),
				coldIsolate: step % 3 === 0,
				cacheAwareRouting: false,
			});
			served.add(result.providerId);
		}
		expect(served.size).toBeGreaterThanOrEqual(5);
	});

	it("demotes the pin only when its provider fails, logs why, and re-pins the new provider", async () => {
		const requestIds = stepRequestIds();
		const body = (step: number) => agentBody(step, { prompt_cache_key: "agent-turn-43" });
		const first = await runStep({ step: 1, requestId: requestIds[0]!, body: body(1), coldIsolate: false });
		for (let step = 2; step <= 10; step++) {
			const result = await runStep({ step, requestId: requestIds[step - 1]!, body: body(step), coldIsolate: step % 4 === 0 });
			expect(result.providerId).toBe(first.providerId);
		}

		runtime.health.set(first.providerId, {
			breaker: "open",
			breaker_until_ms: Date.now() + 60_000,
			err_ewma_10s: 1,
			err_ewma_60s: 0.6,
		});
		const failedOver = await runStep({ step: 11, requestId: requestIds[10]!, body: body(11), coldIsolate: false });
		expect(failedOver.providerId).not.toBe(first.providerId);
		expect(failedOver.diagnostics.stickyRouting.hintedProvider).toBe(first.providerId);
		expect(failedOver.diagnostics.stickyRouting.demotionReason).toBe("pinned_provider_breaker_open");

		for (let step = 12; step <= 40; step++) {
			const result = await runStep({ step, requestId: requestIds[step - 1]!, body: body(step), coldIsolate: step % 4 === 0 });
			expect(result.providerId).toBe(failedOver.providerId);
		}
	});

	it("demotes the pin when Phaseo's managed quota on that provider is exhausted", async () => {
		const body = agentBody(1, { prompt_cache_key: "agent-turn-44" });
		const first = await runStep({ step: 1, requestId: "req_q1", body, coldIsolate: false });
		runtime.quotaPressure.set(first.providerId, 0.2);
		const next = await runStep({ step: 2, requestId: "req_q2", body: agentBody(2, { prompt_cache_key: "agent-turn-44" }), coldIsolate: false });
		expect(next.providerId).not.toBe(first.providerId);
		expect(next.diagnostics.stickyRouting.demotionReason).toBe("pinned_provider_quota_exhausted");
	});

	it("does not demote an explicit pin because the cache read price equals input", async () => {
		const body = (step: number) => agentBody(step, { prompt_cache_key: "agent-turn-45" });
		const first = await runStep({ step: 1, requestId: "req_p1", body: body(1), coldIsolate: false });
		const flat = (id: string) => {
			const entry = candidate(id);
			entry.pricingCard = {
				...SONNET_CARD,
				rules: SONNET_CARD.rules.map((rule) => rule.meter === "cached_read_text_tokens" ? { ...rule, price_per_unit: "0.000003" } : rule),
			};
			return entry;
		};
		const routed = await routeProviders(CLAUDE_PROVIDERS.map(flat), {
			endpoint: "chat.completions",
			model: MODEL,
			workspaceId: WORKSPACE,
			body: body(2),
			requestId: "req_p2",
		});
		expect(routed.ranked[0]!.candidate.providerId).toBe(first.providerId);
		expect(routed.diagnostics.stickyRouting.applied).toBe(true);
	});

	it("keeps the exact route (deployment or region slug) when a provider offers several", async () => {
		const body = agentBody(1, { prompt_cache_key: "agent-turn-46" });
		await sticky.writeStickyRouting(
			WORKSPACE,
			"chat.completions",
			MODEL,
			{ key: (await sticky.resolveStickyRoutingContext({ endpoint: "chat.completions", body }))!.key, source: "prompt_cache_key", explicit: true },
			{ providerId: "google-vertex", providerModelSlug: "claude-sonnet-5@us-east5" },
			0,
		);
		const routed = await routeProviders([
			candidate("google-vertex", "claude-sonnet-5@global"),
			candidate("google-vertex", "claude-sonnet-5@us-east5"),
			candidate("anthropic"),
		], {
			endpoint: "chat.completions",
			model: MODEL,
			workspaceId: WORKSPACE,
			body,
			requestId: "req_route_1",
		});
		expect(routed.ranked[0]!.candidate.providerModelSlug).toBe("claude-sonnet-5@us-east5");
		expect(routed.diagnostics.stickyRouting.hintedProviderModelSlug).toBe("claude-sonnet-5@us-east5");
	});

	it("keeps pins per workspace", async () => {
		const body = agentBody(1, { prompt_cache_key: "shared-name" });
		const first = await runStep({ step: 1, requestId: "req_w1", body, coldIsolate: false });
		const other = await routeProviders(CLAUDE_PROVIDERS.map((id) => candidate(id)), {
			endpoint: "chat.completions",
			model: MODEL,
			workspaceId: "ws_other",
			body,
			requestId: "req_w2",
		});
		expect(first.providerId).toBeTruthy();
		expect(other.diagnostics.stickyRouting.hintedProvider).toBeNull();
	});
});
