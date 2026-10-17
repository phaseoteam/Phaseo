// Purpose: Orchestrates the provider simulator across providers, routes, scenarios and response variants.
// Why: One entry point produces the machine-readable results the audit and the Markdown matrix are built from.
// How: For each sampled route: request matrix, determinism, prefix stability, response variants for every
//      client surface in streaming and buffered mode, error variants, then a pricing sweep of all active routes.

import type { PriceCard, PriceRule } from "@pipeline/pricing/types";
import { guardAllFailed } from "@pipeline/execute/guards";
import { extractDownstreamRateLimitHeaders } from "@pipeline/upstream-rate-limit-headers";
import { extractCacheAffinityTokens } from "@pipeline/execute/sticky-routing";
import { Timer } from "@pipeline/telemetry/timer";
import { buildClientMatrix, type ClientScenario, type Surface } from "./client-requests";
import { COMMON_USAGE, detectDialect, nativeJson, type Dialect, type ResponseVariant } from "./dialects";
import { redactHeaders } from "./fetch-capture";
import { withProviderBindings } from "./env";
import { loadCataloguePriceCard } from "./catalogue";
import { listSimProviders, modelFamily, type SimProvider } from "./providers";
import { runRequest, type RequestRun, type RouteUnderTest } from "./request-pipeline";
import { deliverToClient, priceUsage, pricingError, type ClientOutcome, type PricingOutcome } from "./response-pipeline";
import {
	BASIC, ERROR_VARIANTS, EXPECTED_FINISH, FINISH_VARIANTS, REFUSAL_VARIANT, RESPONSE_SENTINELS, SUCCESS_FINISH, expectedBilling, maxVariant,
} from "./response-variants";
import { derivedUsageProfile, requestSchema, resolveSpec, responseSchema, extraUsageFor, usageProfileFor } from "./spec-registry";
import { validateAgainstSchema, type SchemaIssue } from "./schema";
import { comparePrefix, diffBodies, inventedFields, isEmptyDiff, nondeterministicPaths, summariseDiff, traceSentinels } from "./trace";

// ---------------------------------------------------------------------------
// Result types.
// ---------------------------------------------------------------------------

export type RequestResult = {
	scenario: string;
	surface: Surface;
	kind: ClientScenario["kind"];
	param?: string;
	/** For parameter scenarios: whether our public OpenAPI spec documents the parameter. */
	documented?: boolean;
	outcome: "sent" | "rejected_schema" | "rejected_validation" | "rejected_ir" | "executor_error" | "no_upstream_call";
	detail?: string;
	routing?: { unsupported: string[]; unknown: string[] };
	dialect?: Dialect;
	url?: string;
	effect?: "no_upstream_change" | "changed";
	effectDiff?: string[];
	dropped?: string[];
	renamed?: string[];
	stringified?: string[];
	changed?: string[];
	specIssues?: SchemaIssue[];
	extraProviderCalls?: number;
};

export type ResponseResult = {
	surface: Surface;
	mode: "stream" | "buffered";
	variant: string;
	dialect: Dialect;
	outcome: "ok" | "executor_error" | "materialise_error" | "upstream_error" | "no_call";
	detail?: string;
	finishReason?: string | null;
	finishExpected?: string[] | null;
	finishOk?: boolean;
	lost?: string[];
	clientUsage?: any;
	metered?: Record<string, number>;
	expected?: { uncachedInput: number; cachedRead: number; cacheWrite: number; output: number };
	billingDelta?: Record<string, number>;
	pricing?: { ok: boolean; error?: string; totalNanos?: number };
	framePricingErrors?: string[];
	wouldPin?: boolean;
	/** Whether this response would be billed: usage reached pricing and pricing succeeded. */
	billed?: { usage: boolean; ok?: boolean; error?: string; inputTokens?: number; outputTokens?: number };
	/** Shaped usage handed to pricing; kept for the all-routes pricing sweep. */
	shapedUsage?: any;
	error?: { status: number; clientStatus?: number; clientError?: string; retryAfterForwarded?: boolean; retried?: number };
};

export type RouteResult = {
	model: string;
	providerModelSlug: string | null;
	family: string;
	active: boolean;
	priceCard: boolean;
	dialects: Dialect[];
	spec: { kind: string; id: string; url: string | null } | null;
	specs: Partial<Record<Dialect, { kind: string; id: string; url: string | null }>>;
	baseBodies: Partial<Record<Surface, { url: string; headers: Record<string, string>; body: any }>>;
	invented: Partial<Record<Surface, Array<{ path: string; value: unknown }>>>;
	requests: RequestResult[];
	nondeterminism: Array<{ scenario: string; paths: string[] }>;
	prefix: Array<{ conversation: string; step: number; stable: boolean; divergence?: string }>;
	responses: ResponseResult[];
	responseSpecIssues: Partial<Record<Dialect, SchemaIssue[]>>;
};

export type ProviderResult = {
	providerId: string;
	registeredIds: string[];
	executor: string;
	activeRoutes: number;
	placeholder: boolean;
	usageProfile: { profile?: Record<string, boolean | undefined>; source: string };
	routes: RouteResult[];
	pricingSweep: {
		checked: number;
		noPriceCard: string[];
		throws: Array<{ model: string; error: string }>;
		mismatches: Array<{ model: string; delta: Record<string, number> }>;
	};
	crash?: string;
};

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

const UNIVERSAL_METERS = [
	"input_text_tokens", "input_image_tokens", "input_audio_tokens", "input_video_tokens",
	"output_text_tokens", "output_reasoning_tokens", "output_image_tokens", "output_audio_tokens", "output_video_tokens",
	"cached_read_text_tokens", "cached_read_image_tokens", "cached_read_audio_tokens",
	"cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h",
	"server_tool_web_search_requests", "native_web_search_requests",
];

/** A card with a rule for every meter, so the engine reports every quantity usage normalisation produced. */
function universalCard(): PriceCard {
	return {
		provider: "sim", model: "sim", endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: "sim",
		rules: UNIVERSAL_METERS.map((meter, index) => ({
			id: `universal:${index}`, pricing_plan: "standard", meter, unit: "token", unit_size: 1, price_per_unit: "0.000000001",
			currency: "USD", match: [], priority: 100, included_quantity: 0, billing_timestamp_basis: "request_start", time_windows: [],
		}) as PriceRule),
	} as PriceCard;
}

function meteredQuantities(shapedUsage: any, body: any): Record<string, number> {
	const priced = priceUsage(shapedUsage, universalCard(), body);
	if (!priced || !priced.ok) return {};
	const out: Record<string, number> = {};
	for (const line of priced.lines) out[line.meter] = (out[line.meter] ?? 0) + line.quantity;
	return out;
}

function sumMeters(metered: Record<string, number>, prefixes: string[]): number {
	return Object.entries(metered).filter(([meter]) => prefixes.some((prefix) => meter.startsWith(prefix))).reduce((sum, [, value]) => sum + value, 0);
}

function billingDelta(metered: Record<string, number>, expected: ReturnType<typeof expectedBilling>): Record<string, number> {
	const actual = {
		uncachedInput: sumMeters(metered, ["input_"]),
		cachedRead: sumMeters(metered, ["cached_read_"]),
		// The aggregate write meter is derived alongside the 5m/1h split; count the split when present.
		cacheWrite: (metered.cached_write_text_tokens_5m ?? 0) + (metered.cached_write_text_tokens_1h ?? 0) || (metered.cached_write_text_tokens ?? 0),
		output: sumMeters(metered, ["output_"]),
	};
	const delta: Record<string, number> = {};
	for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
		const diff = actual[key] - expected[key];
		if (diff !== 0) delta[key] = diff;
	}
	return delta;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function cancelStream(run: RequestRun) {
	const result: any = run.result;
	if (result?.kind === "stream" && result.stream && !result.stream.locked) {
		void result.stream.cancel().catch(() => {});
	}
}

const INTERESTING_HEADERS = /^(?!content-type$|content-length$|accept$|user-agent$).+/i;

function specIssuesFor(providerId: string, dialect: Dialect, body: any): { issues: SchemaIssue[]; spec: RouteResult["spec"] } {
	const spec = resolveSpec(providerId, dialect);
	if (!spec || !body) return { issues: [], spec: null };
	const schema = requestSchema(spec, dialect);
	const issues = schema ? validateAgainstSchema(spec.doc, schema, body) : [];
	return { issues, spec: { kind: spec.entry.kind, id: spec.file.id, url: spec.file.source.url ?? spec.file.source.docs ?? null } };
}

function classifyRequest(run: RequestRun): RequestResult["outcome"] {
	if (!run.zod.ok) return "rejected_schema";
	if (!run.validation.ok) return "rejected_validation";
	if (run.irIssues.length) return "rejected_ir";
	if (run.executorError && !run.providerCall) return "executor_error";
	if (!run.providerCall) return "no_upstream_call";
	return "sent";
}

// ---------------------------------------------------------------------------
// Per route.
// ---------------------------------------------------------------------------

async function simulateRoute(provider: SimProvider, route: RouteUnderTest, scenarios: ClientScenario[]): Promise<RouteResult> {
	const result: RouteResult = {
		model: route.route.apiModelId,
		providerModelSlug: route.route.providerModelSlug,
		family: modelFamily(route.route.apiModelId),
		active: route.route.active,
		priceCard: Boolean(route.priceCard),
		dialects: [],
		spec: null,
		specs: {},
		baseBodies: {},
		invented: {},
		requests: [],
		nondeterminism: [],
		prefix: [],
		responses: [],
		responseSpecIssues: {},
	};
	const baseUpstream = new Map<Surface, any>();
	const agentBodies = new Map<string, any>();
	let counter = 0;

	for (const scenario of scenarios) {
		const requestId = `req_sim_${(counter += 1).toString().padStart(4, "0")}`;
		let run: RequestRun;
		try {
			run = await runRequest({ scenario, route, requestId });
		} catch (error) {
			result.requests.push({ scenario: scenario.id, surface: scenario.surface, kind: scenario.kind, param: scenario.param, outcome: "executor_error", detail: errorMessage(error) });
			continue;
		}
		cancelStream(run);
		const outcome = classifyRequest(run);
		const entry: RequestResult = { scenario: scenario.id, surface: scenario.surface, kind: scenario.kind, param: scenario.param, outcome };
		if (scenario.kind === "param") entry.documented = !/not in the public OpenAPI spec/.test(scenario.note ?? "");
		if (outcome === "rejected_schema") entry.detail = run.zod.issues?.join("; ");
		if (outcome === "rejected_validation") entry.detail = `${run.validation.status}: ${run.validation.errorKeywords?.join(", ")} ${run.validation.errorDetail ?? ""}`.trim();
		if (outcome === "rejected_ir") entry.detail = run.irIssues.join("; ");
		if (run.executorError) entry.detail = [entry.detail, run.executorError].filter(Boolean).join(" | ");
		if (run.validation.ok && (run.validation.unsupportedForProvider?.length || run.validation.unknownForProvider?.length)) {
			entry.routing = { unsupported: run.validation.unsupportedForProvider ?? [], unknown: run.validation.unknownForProvider ?? [] };
		}
		const call = run.providerCall;
		if (call) {
			const dialect = detectDialect(call.url);
			entry.dialect = dialect;
			entry.url = call.url.replace(/key=[^&]+/, "key=<redacted>");
			if (!result.dialects.includes(dialect)) result.dialects.push(dialect);
			const body = call.bodyJson;
			const fates = traceSentinels(run.clientBody, body, call.bodyText ?? "");
			const pick = (fate: string) => fates.filter((f) => f.fate === fate).map((f) => `${f.clientPath}${f.upstreamPaths.length ? ` -> ${f.upstreamPaths.join(" | ")}` : ""}`);
			entry.dropped = pick("dropped");
			entry.renamed = pick("renamed");
			entry.stringified = pick("stringified");
			entry.changed = pick("changed");
			const spec = specIssuesFor(provider.providerId, dialect, body);
			if (spec.spec && !result.spec) result.spec = spec.spec;
			if (spec.spec && !result.specs[dialect]) result.specs[dialect] = spec.spec;
			entry.specIssues = spec.issues;
			entry.extraProviderCalls = run.extraProviderCalls.length;
			if (scenario.kind === "base") {
				baseUpstream.set(scenario.surface, body);
				const headers = Object.fromEntries(Object.entries(redactHeaders(call.headers)).filter(([key]) => INTERESTING_HEADERS.test(key)));
				result.baseBodies[scenario.surface] = { url: entry.url!, headers, body };
				result.invented[scenario.surface] = inventedFields(run.clientBody, body);
			} else if (scenario.kind === "param" || scenario.kind === "cache" || scenario.kind === "reasoning" || scenario.kind === "tools") {
				const base = baseUpstream.get(scenario.surface);
				if (base) {
					const diff = diffBodies(base, body);
					entry.effect = isEmptyDiff(diff) ? "no_upstream_change" : "changed";
					entry.effectDiff = summariseDiff(diff, 10);
				}
			}
			if (scenario.conversation) agentBodies.set(`${scenario.conversation.id}:${scenario.conversation.step}`, body);
		}
		result.requests.push(entry);

		// Determinism: the same client request again under a different request id.
		if (call && (scenario.kind === "base" || (scenario.kind === "agent" && scenario.conversation?.step === 2))) {
			await new Promise((resolve) => setTimeout(resolve, 3));
			const again = await runRequest({ scenario, route, requestId: `req_sim_repeat_${counter}` });
			cancelStream(again);
			if (again.providerCall?.bodyJson) {
				const paths = nondeterministicPaths(call.bodyJson, again.providerCall.bodyJson);
				const urlDiff = again.providerCall.url !== call.url ? ["<url>"] : [];
				if (paths.length || urlDiff.length) result.nondeterminism.push({ scenario: scenario.id, paths: [...urlDiff, ...paths.map((p) => `${p.path}: ${JSON.stringify(p.a)} vs ${JSON.stringify(p.b)}`.slice(0, 200))] });
			}
		}
	}

	for (const conversation of ["chat-agent", "responses-agent", "messages-agent"]) {
		for (const step of [2, 3]) {
			const previous = agentBodies.get(`${conversation}:${step - 1}`);
			const next = agentBodies.get(`${conversation}:${step}`);
			if (!previous || !next) continue;
			const check = comparePrefix(previous, next);
			result.prefix.push({ conversation, step, stable: check.stable, divergence: check.divergence });
		}
	}

	result.responses = await simulateResponses(provider, route, scenarios, result);
	return result;
}

// ---------------------------------------------------------------------------
// Responses.
// ---------------------------------------------------------------------------

function lostSentinels(outcome: ClientOutcome, dialect: Dialect): string[] {
	const haystack = outcome.clientText;
	return RESPONSE_SENTINELS
		.filter((sentinel) => !sentinel.dialects || sentinel.dialects.includes(dialect))
		.filter((sentinel) => !(sentinel.id === "system_fingerprint" && outcome.surface !== "chat"))
		.filter((sentinel) => !haystack.includes(sentinel.value))
		.map((sentinel) => sentinel.id);
}

function finishValue(outcome: ClientOutcome): string | null {
	if (outcome.mode === "buffered") {
		const json = outcome.clientJson;
		if (!json) return outcome.finishReason;
		if (outcome.surface === "chat") return json.choices?.[0]?.finish_reason ?? null;
		if (outcome.surface === "messages") return json.stop_reason ?? null;
		return json.status === "incomplete" ? `incomplete:${json.incomplete_details?.reason ?? "?"}` : json.status ?? null;
	}
	const frames = outcome.frames;
	for (let index = frames.length - 1; index >= 0; index -= 1) {
		const frame = frames[index];
		if (outcome.surface === "chat" && frame?.choices?.[0]?.finish_reason) return frame.choices[0].finish_reason;
		if (outcome.surface === "messages" && frame?.delta?.stop_reason) return frame.delta.stop_reason;
		if (outcome.surface === "responses" && frame?.response?.status && /completed|incomplete|failed/.test(frame.type ?? "")) {
			return frame.response.status === "incomplete" ? `incomplete:${frame.response.incomplete_details?.reason ?? "?"}` : frame.response.status;
		}
	}
	return outcome.finishReason;
}

async function clientErrorFor(run: RequestRun, route: RouteUnderTest): Promise<ResponseResult["error"]> {
	const upstream: Response | undefined = (run.result as any)?.upstream;
	if (!upstream) return undefined;
	let payload: any = null;
	try {
		payload = await upstream.clone().json();
	} catch {
		payload = null;
	}
	const headers = extractDownstreamRateLimitHeaders(upstream.headers, { includeQuotaDetails: false });
	// Approximates execute/index.ts:1215-1300: the attempt error recorded for a non-2xx upstream.
	const ctx: any = {
		model: route.route.apiModelId,
		endpoint: "chat.completions",
		requestId: run.scenarioId,
		attemptErrors: [{
			provider: route.providerId,
			type: "upstream_non_2xx",
			status: upstream.status,
			upstream_rate_limit_headers: Object.keys(headers).length ? headers : null,
			upstream_error_code: payload?.error?.code ?? payload?.error?.type ?? payload?.error?.status ?? null,
			upstream_error_type: payload?.error?.type ?? payload?.type ?? null,
			upstream_error_message: payload?.error?.message ?? null,
		}],
	};
	const guarded = await guardAllFailed(ctx, { timer: new Timer(), internal: { adapterMarked: false } } as any);
	let clientError: string | undefined;
	try {
		const json: any = await guarded.response.clone().json();
		clientError = [json.error, json.reason].filter(Boolean).join(":");
	} catch {
		clientError = undefined;
	}
	return {
		status: upstream.status,
		clientStatus: guarded.response.status,
		clientError,
		retryAfterForwarded: upstream.headers.get("retry-after") ? guarded.response.headers.get("retry-after") !== null : undefined,
		retried: run.extraProviderCalls.length,
	};
}

async function simulateResponses(provider: SimProvider, route: RouteUnderTest, scenarios: ClientScenario[], routeResult: RouteResult): Promise<ResponseResult[]> {
	const out: ResponseResult[] = [];
	const extra = extraUsageFor(provider.providerId);
	const profile = usageProfileFor(provider.providerId) ?? COMMON_USAGE;
	const max = maxVariant(extra, profile);
	const plan: Array<{ variant: ResponseVariant; modes: Array<"stream" | "buffered"> }> = [
		{ variant: BASIC, modes: ["stream", "buffered"] },
		{ variant: max, modes: ["stream", "buffered"] },
		...FINISH_VARIANTS.map((variant) => ({ variant, modes: ["stream", "buffered"] as Array<"stream" | "buffered"> })),
		{ variant: REFUSAL_VARIANT, modes: ["stream", "buffered"] },
		...ERROR_VARIANTS.map((variant) => ({ variant, modes: (variant.error?.kind === "mid_stream" ? ["stream", "buffered"] : ["buffered"]) as Array<"stream" | "buffered"> })),
	];
	for (const surface of ["chat", "responses", "messages"] as Surface[]) {
		const scenario = scenarios.find((entry) => entry.id === `${surface}.tools.probe`);
		if (!scenario) continue;
		for (const { variant, modes } of plan) {
			if (variant.error && variant.error.kind !== "mid_stream" && surface !== "chat") continue;
			for (const mode of modes) {
				const requestId = `req_sim_resp_${surface}_${variant.id}_${mode}`;
				let run: RequestRun;
				try {
					run = await runRequest({ scenario, route, requestId, variant, clientStream: mode === "stream" });
				} catch (error) {
					out.push({ surface, mode, variant: variant.id, dialect: "unknown", outcome: "executor_error", detail: errorMessage(error) });
					continue;
				}
				const dialect = run.providerCall ? detectDialect(run.providerCall.url) : "unknown";
				const entry: ResponseResult = { surface, mode, variant: variant.id, dialect, outcome: "ok" };
				if (!run.providerCall || !run.result) {
					entry.outcome = run.providerCall ? "executor_error" : "no_call";
					entry.detail = run.executorError ?? run.validation.errorDetail ?? run.zod.issues?.join("; ");
					out.push(entry);
					continue;
				}
				if (variant.error && variant.error.kind !== "mid_stream") {
					entry.outcome = "upstream_error";
					entry.error = await clientErrorFor(run, route);
					if (run.result.kind === "stream") cancelStream(run);
					out.push(entry);
					continue;
				}
				if (!(run.result as any).upstream?.ok) {
					entry.outcome = "upstream_error";
					entry.detail = `executor reported upstream status ${(run.result as any).upstream?.status}`;
					cancelStream(run);
					out.push(entry);
					continue;
				}
				let outcome: ClientOutcome;
				try {
					outcome = await deliverToClient({ result: run.result, mode, surface, body: run.parsedBody ?? run.clientBody, requestId, route });
				} catch (error) {
					entry.outcome = "materialise_error";
					entry.detail = errorMessage(error);
					out.push(entry);
					continue;
				}
				if (outcome.materialiseError) {
					entry.outcome = "materialise_error";
					entry.detail = outcome.materialiseError;
				}
				entry.finishReason = finishValue(outcome);
				if (variant.error?.kind === "mid_stream") {
					// The upstream failed part-way: the client must see an error, never a normal stop.
					const surfaced = /SIM-ERROR-MID-STREAM|"type":"error"|"status":"failed"|"error":{/.test(outcome.clientText) || Boolean(outcome.materialiseError);
					entry.finishExpected = ["error surfaced, no success finish"];
					entry.finishOk = surfaced && !SUCCESS_FINISH.has(String(entry.finishReason));
					entry.detail = `error surfaced: ${surfaced}`;
				} else {
					const expectedFinish = EXPECTED_FINISH[surface][variant.finish] ?? null;
					entry.finishExpected = expectedFinish;
					entry.finishOk = expectedFinish ? expectedFinish.includes(String(entry.finishReason)) : undefined;
				}
				if (variant.id === "max" || variant.id === "text") entry.lost = lostSentinels(outcome, dialect).filter((id) => variant.id === "max" || id === "text");
				entry.framePricingErrors = outcome.framePricingErrors.length ? Array.from(new Set(outcome.framePricingErrors)) : undefined;
				entry.billed = outcome.shapedUsage
					? {
						usage: true,
						ok: outcome.pricing ? outcome.pricing.ok : undefined,
						error: pricingError(outcome.pricing),
						inputTokens: Number(outcome.shapedUsage.input_tokens ?? 0),
						outputTokens: Number(outcome.shapedUsage.output_tokens ?? 0),
					}
					: { usage: false };
				if (variant.id === "max") {
					entry.clientUsage = outcome.clientUsage;
					entry.shapedUsage = outcome.shapedUsage;
					if (outcome.shapedUsage) {
						entry.metered = meteredQuantities(outcome.shapedUsage, run.parsedBody ?? run.clientBody);
						entry.expected = expectedBilling(dialect, profile);
						entry.billingDelta = billingDelta(entry.metered, entry.expected);
					}
					const pricing: PricingOutcome | null = outcome.pricing;
					entry.pricing = pricing ? (pricing.ok ? { ok: true, totalNanos: (pricing as { totalNanos: number }).totalNanos } : { ok: false, error: pricingError(pricing) }) : undefined;
					entry.wouldPin = pricing?.ok ? extractCacheAffinityTokens(pricing.pricedUsage) !== null : false;
				}
				out.push(entry);
			}
		}
	}
	// Check the synthesised responses against the provider's response schema, so drift in the
	// simulator's own fixtures is visible.
	for (const dialect of routeResult.dialects) {
		const spec = resolveSpec(provider.providerId, dialect);
		const schema = spec ? responseSchema(spec, dialect) : undefined;
		if (spec && schema) routeResult.responseSpecIssues[dialect] = validateAgainstSchema(spec.doc, schema, nativeJson(dialect, max)).slice(0, 20);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Pricing sweep over every active route.
// ---------------------------------------------------------------------------

function pricingSweep(provider: SimProvider, routes: RouteResult[]): ProviderResult["pricingSweep"] {
	const sweep: ProviderResult["pricingSweep"] = { checked: 0, noPriceCard: [], throws: [], mismatches: [] };
	// Shaped usage per model family, from the sampled route's buffered chat "max" run.
	const profile = usageProfileFor(provider.providerId) ?? COMMON_USAGE;
	const byFamily = new Map<string, { shaped: any; dialect: Dialect }>();
	for (const route of routes) {
		const max = route.responses.find((entry) => entry.variant === "max" && entry.surface === "chat" && entry.mode === "buffered");
		if (max?.shapedUsage) byFamily.set(route.family, { shaped: max.shapedUsage, dialect: max.dialect });
	}
	const fallback = byFamily.values().next().value;
	for (const route of provider.routes.filter((entry) => entry.active)) {
		const sample = byFamily.get(modelFamily(route.apiModelId)) ?? fallback;
		if (!sample) continue;
		sweep.checked += 1;
		const card = loadCataloguePriceCard(provider.catalogueId, route.apiModelId);
		if (!card) {
			sweep.noPriceCard.push(route.apiModelId);
			continue;
		}
		const priced = priceUsage(sample.shaped, card, {});
		if (!priced) continue;
		if (!priced.ok) {
			sweep.throws.push({ model: route.apiModelId, error: pricingError(priced) ?? "pricing failed" });
			continue;
		}
		const lines: Record<string, number> = {};
		for (const line of priced.lines) lines[line.meter] = (lines[line.meter] ?? 0) + line.quantity;
		const delta = billingDelta(lines, expectedBilling(sample.dialect, profile));
		if (Object.keys(delta).length) sweep.mismatches.push({ model: route.apiModelId, delta });
	}
	return sweep;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export async function runSimulation(options: { providers?: string[]; scenarioFilter?: (scenario: ClientScenario) => boolean; onProvider?: (result: ProviderResult) => void } = {}) {
	const matrix = buildClientMatrix();
	const scenarios = options.scenarioFilter ? matrix.scenarios.filter(options.scenarioFilter) : matrix.scenarios;
	const wanted = options.providers?.length ? new Set(options.providers) : null;
	const providers = listSimProviders(wanted ? (id) => wanted.has(id) : undefined);
	const results: ProviderResult[] = [];
	for (const provider of providers) {
		const providerResult: ProviderResult = {
			providerId: provider.providerId,
			registeredIds: provider.registeredIds,
			executor: provider.executorName,
			activeRoutes: provider.activeRouteCount,
			placeholder: provider.placeholder,
			usageProfile: derivedUsageProfile(provider.providerId) as any,
			routes: [],
			pricingSweep: { checked: 0, noPriceCard: [], throws: [], mismatches: [] },
		};
		try {
			for (const route of provider.sampled) providerResult.routes.push(await withProviderBindings(provider.providerId, () => simulateRoute(provider, route, scenarios)));
			providerResult.pricingSweep = pricingSweep(provider, providerResult.routes);
		} catch (error) {
			providerResult.crash = errorMessage(error);
		}
		results.push(providerResult);
		options.onProvider?.(providerResult);
	}
	return { matrix, results };
}
