// Purpose: Track the request and token limits providers impose on gateway-managed credentials.
// Why: Keeps Phaseo within upstream quotas, counted globally across all users, without delaying
//      requests or excluding a provider outright.
// How: Loads limits from Supabase (served stale-while-revalidate). Each limit applies across a
//      provider ("*") or to one upstream model, and is counted in fixed windows by its own Durable
//      Object. Isolates hold leases (slices of the remaining allowance the object has already
//      counted) and admit from them locally. Request-path charges are never awaited: a refusal
//      marks the scope saturated in this isolate until its window resets, and routing deranks it.

import { resolveCanonicalTokenUsage } from "@core/usage-normalization";
import { LeasePool, type LeaseAcquireResult, type LeaseReturn, type LeaseTransport, type LeaseVector } from "@core/lease-pool";
import { __resetTieredCacheForTests, tieredRead } from "@core/tiered-cache";
import { dispatchBackground, getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { PipelineContext } from "@pipeline/before/types";

const CONFIG_CACHE_TTL_MS = 60_000;
const PRE_INFERENCE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 405, 413, 415, 422]);

/** Lease parameters shared by the coordinator and the isolate cache. */
export const PROVIDER_LEASE = {
	/** Maximum lease lifetime; leases also end before the next limited window starts. */
	ttlMs: 60_000,
	/** Leases end this long before a window boundary to absorb clock skew between isolates and the object. */
	windowSkewMs: 2_000,
	/** Leases that would live shorter than this are not granted; the request is admitted alone. */
	minLifetimeMs: 3_000,
	/** A lease takes at most 1/shareDivisor of the allowance above the reserve floor. */
	shareDivisor: 4,
	/** The last `reserveFraction` of each limit (at least `minReserve`) is never leased in bulk. */
	reserveFraction: 0.02,
	minReserve: 2,
	/** Unreturned leases are forgotten this long after expiry; their allowance stays consumed. */
	returnGraceMs: 10 * 60_000,
} as const;

export type ProviderLeaseMeta = { minuteWindow: number; dayWindow: number };

/** Applies a limit across all of a provider's models. */
export const ALL_PROVIDER_MODELS = "*";

export type ProviderRateLimitConfig = {
	providerId: string;
	/** Upstream model id the limit applies to, or `ALL_PROVIDER_MODELS`. */
	modelSlug?: string;
	requestsPerMinute: number | null;
	requestsPerDay: number | null;
	tokensPerMinute: number | null;
	tokensPerDay: number | null;
	headroomBps: number;
};

export type ProviderRateLimitAdmission = {
	allowed: boolean;
	reason: "requests_per_minute" | "requests_per_day" | "tokens_per_minute" | "tokens_per_day" | null;
	retryAfterSeconds: number | null;
	reservation: ProviderTokenReservation | null;
	/** How the decision was made (telemetry only). */
	source?: "lease" | "coordinator" | "fail_open" | "unconfigured";
};

export type ProviderTokenReservation = {
	id: string;
	providerId: string;
	/** Limit scope the tokens were reserved in (see `providerLimitScope`); the provider when absent. */
	scope?: string;
	/** Reserved tokens. Zero means usage is counted only once it is known. */
	tokens: number;
	minuteWindow: number;
	dayWindow: number;
	/** Lease the tokens were taken from; settled locally while this isolate still holds it. */
	leaseId?: string;
};

export type ProviderRateLimitCounters = {
	minuteWindow: number;
	dayWindow: number;
	minuteRequests: number;
	dayRequests: number;
	minuteTokens: number;
	dayTokens: number;
};

const DAY_MS = 86_400_000;

export function effectiveTokenLimit(limit: number | null, headroomBps: number): number | null {
	if (limit == null) return null;
	return Math.max(1, Math.floor(limit * (10_000 - headroomBps) / 10_000));
}

export function resolveProviderRateLimitDenial(
	config: ProviderRateLimitConfig,
	counters: ProviderRateLimitCounters,
	nowMs: number,
	reservationTokens = 0,
	reservationRequests = 1,
): ProviderRateLimitAdmission | null {
	const violations: Array<{ reason: NonNullable<ProviderRateLimitAdmission["reason"]>; resetMs: number }> = [];
	const minuteResetMs = (counters.minuteWindow + 1) * 60_000;
	const dayResetMs = (counters.dayWindow + 1) * DAY_MS;
	if (config.requestsPerMinute != null && counters.minuteRequests + reservationRequests > config.requestsPerMinute) {
		violations.push({ reason: "requests_per_minute", resetMs: minuteResetMs });
	}
	if (config.requestsPerDay != null && counters.dayRequests + reservationRequests > config.requestsPerDay) {
		violations.push({ reason: "requests_per_day", resetMs: dayResetMs });
	}
	const tokensPerMinute = effectiveTokenLimit(config.tokensPerMinute, config.headroomBps);
	if (tokensPerMinute != null && counters.minuteTokens + reservationTokens > tokensPerMinute) {
		violations.push({ reason: "tokens_per_minute", resetMs: minuteResetMs });
	}
	const tokensPerDay = effectiveTokenLimit(config.tokensPerDay, config.headroomBps);
	if (tokensPerDay != null && counters.dayTokens + reservationTokens > tokensPerDay) {
		violations.push({ reason: "tokens_per_day", resetMs: dayResetMs });
	}
	if (!violations.length) return null;
	const blocking = violations.sort((left, right) => right.resetMs - left.resetMs)[0];
	return {
		allowed: false,
		reason: blocking.reason,
		retryAfterSeconds: Math.max(1, Math.ceil((blocking.resetMs - nowMs) / 1000)),
		reservation: null,
	};
}

const REQUEST_TOKEN_OVERHEAD = 16;
const UNBOUNDED_TOKEN_INPUT_KEYS = new Set([
	"audio",
	"image",
	"images",
	"image_url",
	"input_audio",
	"input_image",
	"input_video",
	"video",
	"web_search_options",
	"websearchoptions",
]);

function containsUnboundedTokenInput(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	if (Array.isArray(value)) return value.some(containsUnboundedTokenInput);
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (UNBOUNDED_TOKEN_INPUT_KEYS.has(key.toLowerCase())) return true;
		if (containsUnboundedTokenInput(entry)) return true;
	}
	return false;
}

function positiveSafeInteger(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function serializedInputTokenUpperBound(body: unknown): number | null {
	try {
		const bytes = new TextEncoder().encode(JSON.stringify(body ?? {})).byteLength;
		return Math.max(1, bytes + REQUEST_TOKEN_OVERHEAD);
	} catch {
		return null;
	}
}

type BodyStats = { unbounded: boolean; inputUpperBound: number | null };
// Failover attempts estimate the same request body repeatedly; measure it once.
const bodyStatsCache = new WeakMap<object, BodyStats>();

function requestBodyStats(body: unknown, bodyBytes: number | null | undefined): BodyStats {
	const cacheable = body !== null && typeof body === "object";
	const cached = cacheable ? bodyStatsCache.get(body as object) : undefined;
	const unbounded = cached?.unbounded ?? containsUnboundedTokenInput(body);
	const knownBytes = Number.isSafeInteger(bodyBytes) && Number(bodyBytes) >= 0 ? Number(bodyBytes) : null;
	const inputUpperBound = knownBytes != null
		? Math.max(1, knownBytes + REQUEST_TOKEN_OVERHEAD)
		: cached ? cached.inputUpperBound : unbounded ? null : serializedInputTokenUpperBound(body);
	if (cacheable && !cached && knownBytes == null) bodyStatsCache.set(body as object, { unbounded, inputUpperBound });
	return { unbounded, inputUpperBound };
}

function decisionsTokenReservation(args: {
	body: unknown;
	requestedMaxOutputTokens?: number | null;
	providerMaxInputTokens?: number | null;
	providerMaxOutputTokens?: number | null;
}): number | null {
	if (!args.body || typeof args.body !== "object" || Array.isArray(args.body)) return null;
	const body = args.body as Record<string, unknown>;
	const questions = body.questions;
	if (!questions || typeof questions !== "object" || Array.isArray(questions)) return null;
	const questionEntries = Object.entries(questions as Record<string, unknown>);
	if (questionEntries.length === 0 || questionEntries.length > 128) return null;

	const outputUpperBound =
		positiveSafeInteger(args.requestedMaxOutputTokens) ??
		positiveSafeInteger(args.providerMaxOutputTokens);
	if (outputUpperBound == null) return null;

	let reservation = 0;
	for (const [, questionValue] of questionEntries) {
		if (!questionValue || typeof questionValue !== "object" || Array.isArray(questionValue)) return null;
		const question = questionValue as Record<string, unknown>;
		const criteria = question.criteria;
		const options = criteria && typeof criteria === "object"
			? Array.isArray(criteria)
				? criteria
				: Object.entries(criteria as Record<string, unknown>).map(([key, description], index) => ({
					label: String.fromCharCode(65 + index),
					key,
					description,
				}))
			: criteria;
		const userContent = { state: body.state, question: question.instructions, options };
		const inputUpperBound = containsUnboundedTokenInput(userContent) || (Array.isArray(body.images) && body.images.length > 0)
			? positiveSafeInteger(args.providerMaxInputTokens)
			: serializedInputTokenUpperBound(userContent);
		// Tev adds a fixed system prompt and one chat message per choice request.
		const perRequestOverhead = 192 + outputUpperBound;
		if (
			inputUpperBound == null ||
			inputUpperBound > Number.MAX_SAFE_INTEGER - perRequestOverhead ||
			reservation > Number.MAX_SAFE_INTEGER - inputUpperBound - perRequestOverhead
		) {
			return null;
		}
		reservation += inputUpperBound + perRequestOverhead;
	}
	return reservation;
}

export function estimateProviderTokenReservation(args: {
	providerId?: string;
	capability: string;
	body: unknown;
	/**
	 * UTF-8 byte length of the JSON request body as it will be sent, when already known.
	 * Omit it to measure `body` (once per body object). Must not be smaller than the body.
	 */
	bodyBytes?: number | null;
	requestedMaxOutputTokens?: number | null;
	providerMaxInputTokens?: number | null;
	providerMaxOutputTokens?: number | null;
}): number | null {
	const stats = requestBodyStats(args.body, args.bodyBytes);
	const inputUpperBound = stats.unbounded
		? positiveSafeInteger(args.providerMaxInputTokens)
		: stats.inputUpperBound;
	if (inputUpperBound == null) return null;

	if (args.capability === "decisions.make" &&
		(args.providerId === "openai" || Array.isArray((args.body as any)?.questions))) {
		// The canonical Decisions format evaluates all questions in one call.
		const outputUpperBound = positiveSafeInteger(args.providerMaxOutputTokens);
		if (outputUpperBound == null || inputUpperBound > Number.MAX_SAFE_INTEGER - outputUpperBound) return null;
		return inputUpperBound + outputUpperBound;
	}
	if (args.capability === "decisions.make") return decisionsTokenReservation(args);
	if (args.capability === "embeddings" || args.capability === "moderations") return inputUpperBound;
	if (args.capability !== "text.generate") return null;
	const outputUpperBound =
		positiveSafeInteger(args.requestedMaxOutputTokens) ??
		positiveSafeInteger(args.providerMaxOutputTokens);
	if (outputUpperBound == null || inputUpperBound > Number.MAX_SAFE_INTEGER - outputUpperBound) return null;
	return inputUpperBound + outputUpperBound;
}

function finitePositive(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseProviderRateLimitConfig(row: Record<string, unknown>): ProviderRateLimitConfig | null {
	if (row.enabled !== true || typeof row.provider_id !== "string" || !row.provider_id.trim()) return null;
	const modelSlug = typeof row.provider_model_slug === "string" && row.provider_model_slug.trim()
		? row.provider_model_slug.trim()
		: ALL_PROVIDER_MODELS;
	const config = {
		providerId: row.provider_id.trim(),
		modelSlug,
		requestsPerMinute: finitePositive(row.requests_per_minute),
		requestsPerDay: finitePositive(row.requests_per_day),
		tokensPerMinute: finitePositive(row.tokens_per_minute),
		tokensPerDay: finitePositive(row.tokens_per_day),
		headroomBps: Math.min(5000, Math.max(0, Number(row.headroom_bps) || 0)),
	};
	return config.requestsPerMinute || config.requestsPerDay || config.tokensPerMinute || config.tokensPerDay
		? config
		: null;
}

/**
 * The model a candidate's limits are matched on: its upstream model id, which is what
 * providers meter. Falls back to the public model id for routes without one.
 */
export function providerLimitModel(candidate: { providerModelSlug?: string | null; apiModelId?: string | null }): string | null {
	return candidate.providerModelSlug?.trim() || candidate.apiModelId?.trim() || null;
}

/** Counter scope of a limit: the provider, or `provider::model` for a model-specific limit. */
export function providerLimitScope(config: Pick<ProviderRateLimitConfig, "providerId" | "modelSlug">): string {
	const model = config.modelSlug ?? ALL_PROVIDER_MODELS;
	return model === ALL_PROVIDER_MODELS ? config.providerId : `${config.providerId}::${model}`;
}

const CONFIG_SELECT = "provider_id,provider_model_slug,requests_per_minute,requests_per_day,tokens_per_minute,tokens_per_day,headroom_bps,enabled";
const configKey = (providerId: string) => `gateway:provider-rate-limit-config:v3:${providerId}`;

function isConfigList(providerId: string) {
	const limit = (field: unknown) => field === null || (Number.isSafeInteger(field) && Number(field) > 0);
	const isConfig = (value: unknown): value is ProviderRateLimitConfig => {
		if (!value || typeof value !== "object") return false;
		const config = value as Record<string, unknown>;
		return config.providerId === providerId &&
			typeof config.modelSlug === "string" && config.modelSlug.length > 0 &&
			limit(config.requestsPerMinute) && limit(config.requestsPerDay) &&
			limit(config.tokensPerMinute) && limit(config.tokensPerDay) &&
			typeof config.headroomBps === "number" && config.headroomBps >= 0 && config.headroomBps <= 5000;
	};
	return (value: unknown): value is ProviderRateLimitConfig[] =>
		Array.isArray(value) && value.length > 0 && value.every(isConfig);
}

/**
 * A provider's limits (provider-wide and per model). Configuration is shared (never counters
 * or reservations) and served stale while it is revalidated in the background, so a refresh
 * never delays admission. A cold isolate awaits KV, then Supabase; a snapshot older than
 * `maxStaleMs` is never used.
 */
async function loadConfigs(providerId: string): Promise<ProviderRateLimitConfig[] | null> {
	return tieredRead<ProviderRateLimitConfig[]>({
		key: configKey(providerId),
		l1FreshMs: CONFIG_CACHE_TTL_MS,
		maxStaleMs: 15 * 60_000,
		l2: false,
		l3: { freshS: CONFIG_CACHE_TTL_MS / 1000, expirationS: 24 * 60 * 60 },
		validate: isConfigList(providerId),
		loader: async () => {
			const { data, error } = await getSupabaseAdmin()
				.from("provider_rate_limits")
				.select(CONFIG_SELECT)
				.eq("provider_id", providerId);
			if (error) throw new Error(`provider_rate_limit_config_error:${error.message ?? "unknown"}`);
			const configs = (Array.isArray(data) ? data : [])
				.map((row) => parseProviderRateLimitConfig(row as Record<string, unknown>))
				.filter((config): config is ProviderRateLimitConfig => config?.providerId === providerId);
			return configs.length ? configs : null;
		},
	});
}

// Scopes a coordinator refused, until their blocking window resets. Isolate-local: each
// isolate learns from its own (background) charges and deranks the scope in routing.
const MAX_SATURATED_SCOPES = 2_000;
const saturatedUntil = new Map<string, number>();

function markSaturated(scope: string, retryAfterSeconds: number | null): void {
	saturatedUntil.delete(scope);
	if (saturatedUntil.size >= MAX_SATURATED_SCOPES) saturatedUntil.delete(saturatedUntil.keys().next().value!);
	saturatedUntil.set(scope, Date.now() + Math.max(1, retryAfterSeconds ?? 60) * 1000);
}

function scopeSaturated(scope: string, now: number): boolean {
	const until = saturatedUntil.get(scope);
	if (until === undefined) return false;
	if (until > now) return true;
	saturatedUntil.delete(scope);
	return false;
}

/**
 * Whether this provider (across its models, or for this model) recently reached a limit on
 * Phaseo's managed credentials. Synchronous: routing deranks such candidates, never drops them.
 */
export function providerQuotaSaturated(providerId: string, model: string | null): boolean {
	if (saturatedUntil.size === 0) return false;
	const now = Date.now();
	return scopeSaturated(providerId, now) ||
		(model != null && scopeSaturated(providerLimitScope({ providerId, modelSlug: model }), now));
}

type ProviderRateLimitStub = {
	admit(config: ProviderRateLimitConfig, reservationTokens: number | null, reservationId: string, nowMs?: number, reservationRequests?: number): Promise<ProviderRateLimitAdmission>;
	acquireLease(config: ProviderRateLimitConfig, need: LeaseVector, want: LeaseVector, returns: LeaseReturn[], reservationId: string, nowMs?: number): Promise<LeaseAcquireResult<ProviderLeaseMeta, ProviderRateLimitAdmission>>;
	returnLeases(returns: LeaseReturn[], nowMs?: number): Promise<void>;
	recordRequests(requests: number, nowMs?: number): Promise<void>;
	recordTokens(tokens: number, nowMs?: number): Promise<void>;
	reconcileTokens(reservation: ProviderTokenReservation, actualTokens: number, nowMs?: number): Promise<void>;
};

function getStub(scope: string): ProviderRateLimitStub | null {
	const namespace = getBindings().PROVIDER_RATE_LIMITS;
	if (!namespace) return null;
	// Provider-wide scopes keep the original object names, so their counters carry over.
	return namespace.getByName(`managed:${scope}`) as unknown as ProviderRateLimitStub;
}

type ProviderPool = { fingerprint: string; pool: LeasePool<ProviderLeaseMeta, ProviderRateLimitAdmission> };
const pools = new Map<string, ProviderPool>();

function configFingerprint(config: ProviderRateLimitConfig): string {
	return [config.requestsPerMinute, config.requestsPerDay, config.tokensPerMinute, config.tokensPerDay, config.headroomBps].join(":");
}

function background(promise: Promise<unknown>): void {
	try {
		dispatchBackground(promise);
	} catch {
		promise.catch(() => undefined);
	}
}

function transportFor(stub: ProviderRateLimitStub, config: ProviderRateLimitConfig, reservationId: string): LeaseTransport<ProviderLeaseMeta, ProviderRateLimitAdmission> {
	return {
		acquire: (need, want, returns) => stub.acquireLease(config, need, want, returns,
			need.requests > 0 ? reservationId : crypto.randomUUID()),
		returnLeases: (returns) => stub.returnLeases(returns),
	};
}

function poolFor(scope: string, config: ProviderRateLimitConfig, stub: ProviderRateLimitStub): ProviderPool["pool"] {
	const fingerprint = configFingerprint(config);
	const existing = pools.get(scope);
	if (existing?.fingerprint === fingerprint) return existing.pool;
	if (existing) {
		// Limits changed: stop admitting from slices sized for the old limits.
		const returns = existing.pool.drain();
		if (returns.length) background(stub.returnLeases(returns));
	}
	const pool = new LeasePool<ProviderLeaseMeta, ProviderRateLimitAdmission>({ background });
	pools.set(scope, { fingerprint, pool });
	return pool;
}

type TokenEstimate = number | null | (() => number | null);
const ALLOWED: ProviderRateLimitAdmission = { allowed: true, reason: null, retryAfterSeconds: null, reservation: null };

/**
 * Admits against one limit scope. A refusal marks the scope saturated in this isolate.
 * `unboundedTokens` decides what a request without a safe token upper bound reserves:
 * everything (the coordinator then refuses it) or nothing (usage is counted once known).
 */
async function admitScope(
	config: ProviderRateLimitConfig,
	reservationTokens: TokenEstimate,
	reservationId: string,
	reservationRequests: number,
	unboundedTokens: "reserve_all" | "count_after",
): Promise<ProviderRateLimitAdmission> {
	const scope = providerLimitScope(config);
	try {
		const stub = getStub(scope);
		if (!stub) return { ...ALLOWED, source: "unconfigured" };
		if (!Number.isSafeInteger(reservationRequests) || reservationRequests < 1) {
			return { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 60, reservation: null, source: "coordinator" };
		}
		const hasTokenLimit = config.tokensPerMinute != null || config.tokensPerDay != null;
		const estimate = hasTokenLimit
			? (typeof reservationTokens === "function" ? reservationTokens() : reservationTokens)
			: 0;
		const tokens = !hasTokenLimit ? 0
			: Number.isSafeInteger(estimate) && Number(estimate) > 0 ? Number(estimate)
			: unboundedTokens === "count_after" ? 0 : Number.MAX_SAFE_INTEGER;
		const pool = poolFor(scope, config, stub);
		const admission = await pool.admit(reservationId, { requests: reservationRequests, units: tokens },
			transportFor(stub, config, reservationId));
		if ("denial" in admission) {
			markSaturated(scope, admission.denial.retryAfterSeconds);
			if (unboundedTokens === "reserve_all") return { ...admission.denial, source: "coordinator" };
			// The attempt is still sent (deranked, not blocked), so it must still count, above all
			// toward longer windows: its request now, its tokens once usage is known.
			await stub.recordRequests(reservationRequests);
			const now = Date.now();
			return {
				...admission.denial,
				reservation: hasTokenLimit ? {
					id: reservationId, providerId: config.providerId, scope, tokens: 0,
					minuteWindow: Math.floor(now / 60_000), dayWindow: Math.floor(now / DAY_MS),
				} : null,
				source: "coordinator",
			};
		}
		saturatedUntil.delete(scope);
		const { ticket } = admission;
		return {
			allowed: true,
			reason: null,
			retryAfterSeconds: null,
			reservation: hasTokenLimit && (tokens > 0 || unboundedTokens === "count_after") ? {
				id: reservationId,
				providerId: config.providerId,
				scope,
				tokens,
				minuteWindow: ticket.meta.minuteWindow,
				dayWindow: ticket.meta.dayWindow,
				leaseId: ticket.leaseId,
			} : null,
			source: ticket.fromSlice ? "lease" : "coordinator",
		};
	} catch (error) {
		console.error("[gateway] provider rate-limit admission failed open", {
			provider: config.providerId,
			scope,
			error: error instanceof Error ? error.message : String(error),
		});
		return { ...ALLOWED, source: "fail_open" };
	}
}

/**
 * Awaited admission against a provider's provider-wide limit. Request paths use
 * `chargeManagedProvider`, which never waits and covers per-model limits too.
 */
export async function admitManagedProvider(
	providerId: string,
	/** Token reservation, or a function computing it; evaluated only when a token limit exists. */
	reservationTokens: TokenEstimate,
	reservationId = crypto.randomUUID(),
	reservationRequests = 1,
): Promise<ProviderRateLimitAdmission> {
	let config: ProviderRateLimitConfig | undefined;
	try {
		config = (await loadConfigs(providerId))?.find((entry) => providerLimitScope(entry) === providerId);
	} catch (error) {
		console.error("[gateway] provider rate-limit admission failed open", {
			provider: providerId,
			error: error instanceof Error ? error.message : String(error),
		});
		return { ...ALLOWED, source: "fail_open" };
	}
	if (!config) return { ...ALLOWED, source: "unconfigured" };
	// Without a safe upper bound the coordinator fails closed, as before.
	return admitScope(config, reservationTokens, reservationId, reservationRequests, "reserve_all");
}

/** Usage counted for one attempt across every limit scope that applies to it. */
export type ProviderQuotaCharge = {
	id: string;
	providerId: string;
	model: string | null;
	/** Reservations held in each scope; settles once the background admissions do. */
	reservations: Promise<ProviderTokenReservation[]>;
};

/**
 * Counts an attempt on Phaseo's managed credentials against the provider-wide limit and the
 * model's limit, globally. Returns at once: admissions run in the background (instant from a
 * held slice). A refused scope is deranked by routing until its window resets; the attempt
 * itself is never blocked, so a cold isolate may briefly exceed a limit.
 */
export function chargeManagedProvider(args: {
	providerId: string;
	model: string | null;
	/** Token reservation, or a function computing it; evaluated at most once, only for token limits. */
	reservationTokens: TokenEstimate;
	reservationId?: string;
	reservationRequests?: number;
}): ProviderQuotaCharge {
	const id = args.reservationId ?? crypto.randomUUID();
	let estimated: { value: number | null } | null = null;
	const estimate = () => {
		estimated ??= { value: typeof args.reservationTokens === "function" ? args.reservationTokens() : args.reservationTokens };
		return estimated.value;
	};
	const reservations = (async () => {
		const configs = await loadConfigs(args.providerId);
		const applicable = (configs ?? []).filter((config) =>
			(config.modelSlug ?? ALL_PROVIDER_MODELS) === ALL_PROVIDER_MODELS || config.modelSlug === args.model);
		const admissions = await Promise.all(applicable.map((config) =>
			admitScope(config, estimate, id, args.reservationRequests ?? 1, "count_after")));
		return admissions.flatMap((admission) => admission.reservation ? [admission.reservation] : []);
	})().catch((error: unknown) => {
		console.error("[gateway] provider rate-limit charge failed open", {
			provider: args.providerId,
			error: error instanceof Error ? error.message : String(error),
		});
		return [] as ProviderTokenReservation[];
	});
	background(reservations);
	return { id, providerId: args.providerId, model: args.model, reservations };
}

/**
 * Applies the actual token usage of a reservation exactly once. Refunds go to the isolate's
 * lease while it is still held (no round trip); anything else is sent to the coordinator,
 * whose reconciliation is idempotent per reservation id. Returns that call, if any.
 */
function settleReservation(reservation: ProviderTokenReservation, actualTokens: number): Promise<void> | null {
	const scope = reservation.scope ?? reservation.providerId;
	const pool = pools.get(scope)?.pool;
	if (pool?.isSettled(reservation.id)) return null;
	const delta = actualTokens - reservation.tokens;
	if (delta <= 0 && reservation.leaseId && pool?.settle(
		{ id: reservation.id, leaseId: reservation.leaseId, requests: 0 },
		{ requests: 0, units: delta },
	)) {
		return null;
	}
	// Overruns always go to the coordinator so they are counted even if this isolate dies.
	pool?.markSettled(reservation.id);
	if (reservation.tokens === 0 && delta === 0) return null;
	const stub = getStub(scope);
	return stub ? stub.reconcileTokens(reservation, actualTokens) : null;
}

/** A single reservation, or an attempt's charge across limit scopes. */
type HeldTokens = ProviderTokenReservation | ProviderQuotaCharge;

const isCharge = (held: HeldTokens): held is ProviderQuotaCharge => "reservations" in held;

function logSettlementFailure(message: string, reservation: ProviderTokenReservation, error: unknown): void {
	console.error(message, {
		provider: reservation.providerId,
		reservationId: reservation.id,
		error: error instanceof Error ? error.message : String(error),
	});
}

function settleInBackground(held: HeldTokens, actualTokens: number, failure: string): void {
	if (isCharge(held)) {
		background(held.reservations.then((parts) => {
			for (const part of parts) settleInBackground(part, actualTokens, failure);
		}));
		return;
	}
	try {
		const call = settleReservation(held, actualTokens);
		if (call) background(call.catch((error) => logSettlementFailure(failure, held, error)));
	} catch (error) {
		logSettlementFailure(failure, held, error);
	}
}

/** Returns a reservation's tokens. Never blocks failover: coordinator calls run in the background. */
export async function releaseManagedProviderReservation(
	reservation: HeldTokens | null | undefined,
): Promise<void> {
	if (!reservation) return;
	settleInBackground(reservation, 0, "[gateway] provider token reservation release failed");
}

/** Settles a failed attempt's reservation without blocking failover. Returns whether it was handled. */
export async function settleFailedManagedProviderReservation(args: {
	reservation: HeldTokens | null | undefined;
	status: number;
	usageCandidates: unknown[];
	upstreamRequestCount: number;
}): Promise<boolean> {
	if (!args.reservation) return false;
	const tokens = args.usageCandidates.reduce<number>(
		(max, usage) => Math.max(max, resolveCanonicalTokenUsage(usage).totalTokens),
		0,
	);
	if (tokens > 0) {
		settleInBackground(args.reservation, tokens, "[gateway] failed provider token reservation reconciliation failed");
		return true;
	}

	// Release only statuses that unambiguously reject the request before inference.
	// Throttling, conflicts, timeouts, and server errors may follow provider work.
	if (args.upstreamRequestCount === 1 && PRE_INFERENCE_REJECTION_STATUSES.has(args.status)) {
		await releaseManagedProviderReservation(args.reservation);
		return true;
	}
	return false;
}

export async function recordManagedProviderTokensOnce(args: {
	ctx: PipelineContext;
	providerId: string;
	keySource: "gateway" | "byok" | undefined;
	usage: unknown;
	reservation?: HeldTokens | null;
}): Promise<void> {
	if (args.keySource === "byok" || args.ctx.testingMode) return;
	const meta = args.ctx.meta as Record<string, unknown>;
	const accountingKey = args.reservation?.id ?? `legacy:${args.providerId}`;
	const recorded = Array.isArray(meta.__providerRateLimitTokensRecorded)
		? meta.__providerRateLimitTokensRecorded as string[]
		: [];
	if (recorded.includes(accountingKey)) return;
	const tokens = resolveCanonicalTokenUsage(args.usage).totalTokens;
	// Once dispatch may have occurred, missing usage is not evidence of zero provider consumption.
	// Keep the conservative reservation until its fixed window expires rather than reopening capacity.
	if (tokens <= 0) return;
	try {
		if (args.reservation && isCharge(args.reservation)) {
			// The charge already holds a reservation in every scope with a token limit.
			const parts = await args.reservation.reservations;
			await Promise.all(parts.map((part) => settleReservation(part, tokens)));
			meta.__providerRateLimitTokensRecorded = [...recorded, accountingKey];
			return;
		}
		const reservation = args.reservation && !isCharge(args.reservation) ? args.reservation : null;
		const config = (await loadConfigs(args.providerId))?.find((entry) => providerLimitScope(entry) === args.providerId);
		if (!config || (!config.tokensPerMinute && !config.tokensPerDay)) return;
		if (reservation?.providerId === args.providerId) {
			await settleReservation(reservation, tokens);
		} else {
			await getStub(args.providerId)?.recordTokens(tokens);
		}
		meta.__providerRateLimitTokensRecorded = [...recorded, accountingKey];
	} catch (error) {
		console.error("[gateway] provider token accounting failed", {
			provider: args.providerId,
			requestId: args.ctx.requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** Clears isolate configuration and lease state (tests only). */
export function clearProviderRateLimitConfigCacheForTests(): void {
	__resetTieredCacheForTests();
	pools.clear();
	saturatedUntil.clear();
}

