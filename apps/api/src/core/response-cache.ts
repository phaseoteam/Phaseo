// Purpose: Opt-in response caching for repeated text requests.
// Why: Identical requests can be answered without a provider call, for free.
// How: Caching is off unless a request header or the preset turns it on. Entries
//      are scoped to the API key and keyed by a hash of the normalized request,
//      so a key only ever sees responses produced under its own policy. Storage
//      is best-effort: an entry may be evicted before its TTL expires.
import type { Endpoint } from "@core/types";

const RESPONSE_CACHE_VERSION = "v2";
const RESPONSE_CACHE_PREFIX = "gateway:response-cache";
export const DEFAULT_RESPONSE_CACHE_TTL_SECONDS = 300;
const MIN_RESPONSE_CACHE_TTL_SECONDS = 1;
const MAX_RESPONSE_CACHE_TTL_SECONDS = 86_400;
/** Serialized records above this size are not stored. */
export const MAX_RESPONSE_CACHE_RECORD_BYTES = 1_000_000;

export const RESPONSE_CACHE_REQUEST_HEADERS = {
	enabled: "x-phaseo-cache",
	ttl: "x-phaseo-cache-ttl",
	clear: "x-phaseo-cache-clear",
} as const;

export const RESPONSE_CACHE_RESPONSE_HEADERS = {
	status: "X-Phaseo-Cache-Status",
	age: "X-Phaseo-Cache-Age",
	ttl: "X-Phaseo-Cache-TTL",
	sourceId: "X-Phaseo-Cache-Source-Id",
} as const;
const RESPONSE_CACHE_ELIGIBLE_ENDPOINTS = new Set<Endpoint>([
	"responses",
	"chat.completions",
	"messages",
]);

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ResponseCacheTtlSource = "request" | "preset" | "default" | "disabled";

export type ResponseCacheDisabledReason = "preset_disabled" | "request_disabled" | "not_enabled";

export type ResponseCachePolicy =
	| { enabled: true; ttlSeconds: number; source: Exclude<ResponseCacheTtlSource, "disabled"> }
	| { enabled: false; ttlSeconds: null; source: "disabled"; reason: ResponseCacheDisabledReason };

export type ResponseCacheFingerprintInput = {
	workspaceId: string;
	apiKeyId: string;
	endpoint: Endpoint;
	model: string;
	stream: boolean;
	body: unknown;
	protocol?: string | null;
	presetId?: string | null;
	presetSlug?: string | null;
	routingMode?: string | null;
};

export type ResponseCacheFingerprint = {
	version: string;
	serialized: string;
	digest: string;
};

export type ResponseCacheStore = {
	kind: "upstash";
	get<T>(key: string): Promise<T | null>;
	/** Resolves false when the value was not stored (for example, too large). */
	set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;
	delete(key: string): Promise<void>;
};

/** One SSE frame as it was sent to the client: parsed JSON, or a raw block. */
export type CachedStreamFrame =
	| { eventName: string | null; data: unknown }
	| { raw: string };

export type CachedResponseRecord = {
	version: string;
	key: string;
	fingerprint: string;
	endpoint: Endpoint;
	model: string;
	statusCode: number;
	/** The JSON body for buffered requests; null for streamed ones. */
	responseBody: unknown;
	/** The SSE frames for streamed requests; absent for buffered ones. */
	streamFrames?: CachedStreamFrame[] | null;
	providerId: string | null;
	providerModelSlug: string | null;
	usage: unknown;
	currency: string | null;
	finishReason: string | null;
	nativeResponseId: string | null;
	routingMode: string | null;
	preset: {
		id: string | null;
		slug: string | null;
	};
	/** Gateway request ID of the request that produced this entry. */
	sourceRequestId: string;
	createdAt: string;
	expiresAt: string;
	ttlSeconds: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeScalar(value: unknown): JsonPrimitive {
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	return String(value);
}

function sanitizeRequestValue(value: unknown): JsonValue | undefined {
	if (value === undefined) return undefined;
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return normalizeScalar(value);
	}
	if (Array.isArray(value)) {
		return value
			.map((entry) => sanitizeRequestValue(entry))
			.filter((entry): entry is JsonValue => entry !== undefined);
	}
	if (!isPlainObject(value)) {
		return normalizeScalar(value);
	}

	const out: Record<string, JsonValue> = {};
	for (const key of Object.keys(value).sort()) {
		if (key === "debug") continue;
		const normalized = sanitizeRequestValue(value[key]);
		if (normalized === undefined) continue;
		out[key] = normalized;
	}
	return out;
}

export function stableStringify(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed || null;
}

export function buildResponseCacheFingerprintPayload(
	input: ResponseCacheFingerprintInput,
): Record<string, JsonValue> {
	return {
		version: RESPONSE_CACHE_VERSION,
		workspace_id: input.workspaceId,
		api_key_id: input.apiKeyId,
		endpoint: input.endpoint,
		model: input.model,
		stream: input.stream,
		protocol: normalizeOptionalText(input.protocol),
		preset: {
			id: normalizeOptionalText(input.presetId),
			slug: normalizeOptionalText(input.presetSlug),
		},
		routing_mode: normalizeOptionalText(input.routingMode),
		body: sanitizeRequestValue(input.body) ?? null,
	};
}

export async function buildResponseCacheFingerprint(
	input: ResponseCacheFingerprintInput,
): Promise<ResponseCacheFingerprint> {
	const payload = buildResponseCacheFingerprintPayload(input);
	const serialized = stableStringify(payload);
	const digest = await sha256Hex(
		`${RESPONSE_CACHE_PREFIX}:${RESPONSE_CACHE_VERSION}:${serialized}`,
	);
	return {
		version: RESPONSE_CACHE_VERSION,
		serialized,
		digest,
	};
}

/** Entries belong to one API key: rotating or revoking the key leaves them unreachable. */
export function buildResponseCacheKey(apiKeyId: string, digest: string): string {
	return `${RESPONSE_CACHE_PREFIX}:${RESPONSE_CACHE_VERSION}:${apiKeyId}:${digest}`;
}

export function isResponseCacheEligible(args: {
	endpoint: Endpoint;
	stream: boolean;
	apiKeyId?: string | null;
	debugEnabled?: boolean;
	hasTools?: boolean;
	serverToolsEnabled?: boolean;
	zeroDataRetention?: boolean;
}): { eligible: boolean; reason: string } {
	// Streamed and buffered requests are both eligible; stream mode is part of
	// the fingerprint, so each gets its own entry.
	if (!RESPONSE_CACHE_ELIGIBLE_ENDPOINTS.has(args.endpoint)) {
		return { eligible: false, reason: "unsupported_endpoint" };
	}
	// Storing a response would break the workspace's retention promise.
	if (args.zeroDataRetention) {
		return { eligible: false, reason: "zero_data_retention" };
	}
	if (!args.apiKeyId) {
		return { eligible: false, reason: "no_api_key" };
	}
	if (args.debugEnabled) {
		return { eligible: false, reason: "debug_enabled" };
	}
	if (args.serverToolsEnabled) {
		return { eligible: false, reason: "server_tools_enabled" };
	}
	if (args.hasTools) {
		return { eligible: false, reason: "tools_present" };
	}
	return { eligible: true, reason: "eligible" };
}

function coercePositiveInteger(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const rounded = Math.floor(value);
	return rounded > 0 ? rounded : null;
}

export function clampResponseCacheTtlSeconds(ttlSeconds: number): number {
	return Math.max(
		MIN_RESPONSE_CACHE_TTL_SECONDS,
		Math.min(MAX_RESPONSE_CACHE_TTL_SECONDS, Math.floor(ttlSeconds)),
	);
}

/** Reads a boolean cache header; anything unrecognised counts as absent. */
export function parseResponseCacheFlag(value: string | null | undefined): boolean | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "true" || normalized === "1") return true;
	if (normalized === "false" || normalized === "0") return false;
	return null;
}

/**
 * Reads the TTL header leniently: leading digits are used (`60abc` is 60,
 * `1.5` is 1) and later clamped; a value with no leading digits is ignored.
 */
export function parseResponseCacheTtl(value: string | null | undefined): number | null {
	const match = value?.trim().match(/^\d+/);
	if (!match) return null;
	return clampResponseCacheTtlSeconds(Number(match[0]));
}

/**
 * Precedence: a preset that disables caching cannot be overridden; a request
 * header can disable it; otherwise the request header or the preset enables
 * it. With neither, caching is off. TTL comes from the request, then the
 * preset, then the default.
 */
export function resolveResponseCachePolicy(args: {
	requestEnabled?: boolean | null;
	requestTtlSeconds?: number | null;
	presetEnabled?: boolean | null;
	presetTtlSeconds?: number | null;
}): ResponseCachePolicy {
	if (args.presetEnabled === false) {
		return { enabled: false, ttlSeconds: null, source: "disabled", reason: "preset_disabled" };
	}
	if (args.requestEnabled === false) {
		return { enabled: false, ttlSeconds: null, source: "disabled", reason: "request_disabled" };
	}
	if (args.requestEnabled !== true && args.presetEnabled !== true) {
		return { enabled: false, ttlSeconds: null, source: "disabled", reason: "not_enabled" };
	}

	const requestTtl = coercePositiveInteger(args.requestTtlSeconds);
	if (requestTtl !== null) {
		return { enabled: true, ttlSeconds: clampResponseCacheTtlSeconds(requestTtl), source: "request" };
	}
	const presetTtl = coercePositiveInteger(args.presetTtlSeconds);
	if (presetTtl !== null) {
		return { enabled: true, ttlSeconds: clampResponseCacheTtlSeconds(presetTtl), source: "preset" };
	}
	return { enabled: true, ttlSeconds: DEFAULT_RESPONSE_CACHE_TTL_SECONDS, source: "default" };
}

/** Sets every numeric usage counter to zero, keeping the protocol's shape. */
export function zeroUsageCounters(value: unknown): unknown {
	if (typeof value === "number") return 0;
	if (Array.isArray(value)) return value.map((entry) => zeroUsageCounters(entry));
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) out[key] = zeroUsageCounters(entry);
		return out;
	}
	return value;
}

type ReplayRewrite = { sourceRequestId: string; requestId: string; nowSeconds: number };

/**
 * Gives a replayed payload the hit's own identity: IDs derived from the source
 * request ID (the ID itself, or `{id}-…`) take the new request ID, creation
 * times become now, and every `usage` object reports zero.
 */
function rewriteReplayValue(value: unknown, rewrite: ReplayRewrite): unknown {
	if (typeof value === "string") {
		if (value === rewrite.sourceRequestId) return rewrite.requestId;
		if (value.startsWith(`${rewrite.sourceRequestId}-`)) {
			return rewrite.requestId + value.slice(rewrite.sourceRequestId.length);
		}
		return value;
	}
	if (Array.isArray(value)) return value.map((entry) => rewriteReplayValue(entry, rewrite));
	if (!isPlainObject(value)) return value;
	const out: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key === "usage" && entry && typeof entry === "object") {
			out[key] = zeroUsageCounters(entry);
		} else if ((key === "created" || key === "created_at") && typeof entry === "number") {
			out[key] = rewrite.nowSeconds;
		} else {
			out[key] = rewriteReplayValue(entry, rewrite);
		}
	}
	return out;
}

function replayRewrite(args: { sourceRequestId: string; requestId: string; now?: Date }): ReplayRewrite {
	return {
		sourceRequestId: args.sourceRequestId,
		requestId: args.requestId,
		nowSeconds: Math.floor((args.now ?? new Date()).getTime() / 1000),
	};
}

/**
 * Prepares a stored response body for replay: the hit gets its own request ID
 * and creation time, and reports zero usage because it is not billed.
 */
export function buildCachedResponseBody(args: {
	responseBody: unknown;
	sourceRequestId: string;
	requestId: string;
	now?: Date;
}): unknown {
	return rewriteReplayValue(args.responseBody, replayRewrite(args));
}

/** Rebuilds a stored stream as SSE text, rewritten the same way as a buffered body. */
export function buildCachedSseBody(args: {
	frames: CachedStreamFrame[];
	sourceRequestId: string;
	requestId: string;
	now?: Date;
}): string {
	const rewrite = replayRewrite(args);
	return args.frames
		.map((frame) => {
			if ("raw" in frame) return `${frame.raw}\n\n`;
			const prefix = frame.eventName ? `event: ${frame.eventName}\n` : "";
			return `${prefix}data: ${JSON.stringify(rewriteReplayValue(frame.data, rewrite))}\n\n`;
		})
		.join("");
}

export function applyResponseCacheHeaders(
	headers: Headers,
	state: {
		status: "hit" | "miss";
		ttlSeconds: number | null;
		ageMs?: number | null;
		sourceRequestId?: string | null;
	},
): void {
	headers.set(RESPONSE_CACHE_RESPONSE_HEADERS.status, state.status === "hit" ? "HIT" : "MISS");
	const ageSeconds = Math.floor(Math.max(0, state.ageMs ?? 0) / 1000);
	if (typeof state.ttlSeconds === "number") {
		// On a hit, the time left before the entry expires; on a miss, the full TTL.
		const ttl = state.status === "hit" ? Math.max(0, state.ttlSeconds - ageSeconds) : state.ttlSeconds;
		headers.set(RESPONSE_CACHE_RESPONSE_HEADERS.ttl, String(ttl));
	}
	if (state.status === "hit") {
		headers.set(RESPONSE_CACHE_RESPONSE_HEADERS.age, String(ageSeconds));
		if (state.sourceRequestId) headers.set(RESPONSE_CACHE_RESPONSE_HEADERS.sourceId, state.sourceRequestId);
	}
}

export function buildCachedResponseRecord(args: {
	key: string;
	fingerprint: string;
	endpoint: Endpoint;
	model: string;
	statusCode: number;
	responseBody: unknown;
	streamFrames?: CachedStreamFrame[] | null;
	providerId?: string | null;
	providerModelSlug?: string | null;
	usage?: unknown;
	currency?: string | null;
	finishReason?: string | null;
	nativeResponseId?: string | null;
	routingMode?: string | null;
	presetId?: string | null;
	presetSlug?: string | null;
	sourceRequestId: string;
	ttlSeconds: number;
	now?: Date;
}): CachedResponseRecord {
	const createdAt = args.now ?? new Date();
	const expiresAt = new Date(createdAt.getTime() + args.ttlSeconds * 1000);
	return {
		version: RESPONSE_CACHE_VERSION,
		key: args.key,
		fingerprint: args.fingerprint,
		endpoint: args.endpoint,
		model: args.model,
		statusCode: args.statusCode,
		responseBody: args.responseBody,
		streamFrames: args.streamFrames ?? null,
		providerId: args.providerId ?? null,
		providerModelSlug: args.providerModelSlug ?? null,
		usage: args.usage ?? null,
		currency: args.currency ?? null,
		finishReason: args.finishReason ?? null,
		nativeResponseId: args.nativeResponseId ?? null,
		routingMode: args.routingMode ?? null,
		preset: {
			id: args.presetId ?? null,
			slug: args.presetSlug ?? null,
		},
		sourceRequestId: args.sourceRequestId,
		createdAt: createdAt.toISOString(),
		expiresAt: expiresAt.toISOString(),
		ttlSeconds: args.ttlSeconds,
	};
}
