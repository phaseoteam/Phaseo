// Purpose: Enforce approximate limits for gateway-managed provider credentials.
// Why: Prevents Phaseo from overrunning upstream request and token quotas while preserving failover.
// How: Loads configuration from Supabase and coordinates fixed-window counters in a Durable Object.

import { resolveCanonicalTokenUsage } from "@core/usage-normalization";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { PipelineContext } from "@pipeline/before/types";

const CONFIG_CACHE_TTL_MS = 60_000;
const PRE_INFERENCE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 405, 413, 415, 422]);

export type ProviderRateLimitConfig = {
	providerId: string;
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
};

export type ProviderTokenReservation = {
	id: string;
	providerId: string;
	tokens: number;
	minuteWindow: number;
	dayWindow: number;
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

function effectiveTokenLimit(limit: number | null, headroomBps: number): number | null {
	if (limit == null) return null;
	return Math.max(1, Math.floor(limit * (10_000 - headroomBps) / 10_000));
}

export function resolveProviderRateLimitDenial(
	config: ProviderRateLimitConfig,
	counters: ProviderRateLimitCounters,
	nowMs: number,
	reservationTokens = 0,
): ProviderRateLimitAdmission | null {
	const violations: Array<{ reason: NonNullable<ProviderRateLimitAdmission["reason"]>; resetMs: number }> = [];
	const minuteResetMs = (counters.minuteWindow + 1) * 60_000;
	const dayResetMs = (counters.dayWindow + 1) * DAY_MS;
	if (config.requestsPerMinute != null && counters.minuteRequests >= config.requestsPerMinute) {
		violations.push({ reason: "requests_per_minute", resetMs: minuteResetMs });
	}
	if (config.requestsPerDay != null && counters.dayRequests >= config.requestsPerDay) {
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

export function estimateProviderTokenReservation(args: {
	capability: string;
	body: unknown;
	requestedMaxOutputTokens?: number | null;
	providerMaxInputTokens?: number | null;
	providerMaxOutputTokens?: number | null;
}): number | null {
	const inputUpperBound = containsUnboundedTokenInput(args.body)
		? positiveSafeInteger(args.providerMaxInputTokens)
		: serializedInputTokenUpperBound(args.body);
	if (inputUpperBound == null) return null;

	if (args.capability === "embeddings" || args.capability === "moderations") return inputUpperBound;
	if (args.capability !== "text.generate") return null;
	const outputUpperBound =
		positiveSafeInteger(args.requestedMaxOutputTokens) ??
		positiveSafeInteger(args.providerMaxOutputTokens);
	if (outputUpperBound == null || inputUpperBound > Number.MAX_SAFE_INTEGER - outputUpperBound) return null;
	return inputUpperBound + outputUpperBound;
}

type CachedConfig = { expiresAt: number; value: ProviderRateLimitConfig | null };
const configCache = new Map<string, CachedConfig>();
const configInflight = new Map<string, Promise<ProviderRateLimitConfig | null>>();

function finitePositive(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseProviderRateLimitConfig(row: Record<string, unknown>): ProviderRateLimitConfig | null {
	if (row.enabled !== true || typeof row.provider_id !== "string" || !row.provider_id.trim()) return null;
	const config = {
		providerId: row.provider_id.trim(),
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

async function loadConfig(providerId: string): Promise<ProviderRateLimitConfig | null> {
	const now = Date.now();
	const cached = configCache.get(providerId);
	if (cached && cached.expiresAt > now) return cached.value;
	const inflight = configInflight.get(providerId);
	if (inflight) return inflight;

	const loader = (async () => {
		const { data, error } = await getSupabaseAdmin()
			.from("provider_rate_limits")
			.select("provider_id,requests_per_minute,requests_per_day,tokens_per_minute,tokens_per_day,headroom_bps,enabled")
			.eq("provider_id", providerId)
			.maybeSingle();
		if (error) throw new Error(`provider_rate_limit_config_error:${error.message ?? "unknown"}`);
		const value = data ? parseProviderRateLimitConfig(data as Record<string, unknown>) : null;
		configCache.set(providerId, { expiresAt: now + CONFIG_CACHE_TTL_MS, value });
		return value;
	})();
	configInflight.set(providerId, loader);
	try {
		return await loader;
	} finally {
		configInflight.delete(providerId);
	}
}

type ProviderRateLimitStub = {
	admit(config: ProviderRateLimitConfig, reservationTokens: number | null, reservationId: string, nowMs?: number): Promise<ProviderRateLimitAdmission>;
	recordTokens(tokens: number, nowMs?: number): Promise<void>;
	reconcileTokens(reservation: ProviderTokenReservation, actualTokens: number, nowMs?: number): Promise<void>;
};

function getStub(providerId: string): ProviderRateLimitStub | null {
	const namespace = getBindings().PROVIDER_RATE_LIMITS;
	if (!namespace) return null;
	return namespace.getByName(`managed:${providerId}`) as unknown as ProviderRateLimitStub;
}

export async function admitManagedProvider(
	providerId: string,
	reservationTokens: number | null,
	reservationId = crypto.randomUUID(),
): Promise<ProviderRateLimitAdmission> {
	const fallback: ProviderRateLimitAdmission = { allowed: true, reason: null, retryAfterSeconds: null, reservation: null };
	try {
		const config = await loadConfig(providerId);
		if (!config) return fallback;
		const stub = getStub(providerId);
		return stub ? await stub.admit(config, reservationTokens, reservationId) : fallback;
	} catch (error) {
		console.error("[gateway] provider rate-limit admission failed open", {
			provider: providerId,
			error: error instanceof Error ? error.message : String(error),
		});
		return fallback;
	}
}

export async function releaseManagedProviderReservation(
	reservation: ProviderTokenReservation | null | undefined,
): Promise<void> {
	if (!reservation) return;
	try {
		await getStub(reservation.providerId)?.reconcileTokens(reservation, 0);
	} catch (error) {
		console.error("[gateway] provider token reservation release failed", {
			provider: reservation.providerId,
			reservationId: reservation.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function settleFailedManagedProviderReservation(args: {
	reservation: ProviderTokenReservation | null | undefined;
	status: number;
	usageCandidates: unknown[];
	upstreamRequestCount: number;
}): Promise<void> {
	if (!args.reservation) return;
	const tokens = args.usageCandidates.reduce<number>(
		(max, usage) => Math.max(max, resolveCanonicalTokenUsage(usage).totalTokens),
		0,
	);
	if (tokens > 0) {
		try {
			await getStub(args.reservation.providerId)?.reconcileTokens(args.reservation, tokens);
		} catch (error) {
			console.error("[gateway] failed provider token reservation reconciliation failed", {
				provider: args.reservation.providerId,
				reservationId: args.reservation.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return;
	}

	// Release only statuses that unambiguously reject the request before inference.
	// Throttling, conflicts, timeouts, and server errors may follow provider work.
	if (args.upstreamRequestCount === 1 && PRE_INFERENCE_REJECTION_STATUSES.has(args.status)) {
		await releaseManagedProviderReservation(args.reservation);
	}
}

export async function recordManagedProviderTokensOnce(args: {
	ctx: PipelineContext;
	providerId: string;
	keySource: "gateway" | "byok" | undefined;
	usage: unknown;
	reservation?: ProviderTokenReservation | null;
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
		const config = await loadConfig(args.providerId);
		if (!config || (!config.tokensPerMinute && !config.tokensPerDay)) return;
		const stub = getStub(args.providerId);
		if (args.reservation?.providerId === args.providerId) {
			await stub?.reconcileTokens(args.reservation, tokens);
		} else {
			await stub?.recordTokens(tokens);
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

export function clearProviderRateLimitConfigCacheForTests(): void {
	configCache.clear();
}
