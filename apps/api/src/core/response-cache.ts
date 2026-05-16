import type { Endpoint } from "@core/types";

const RESPONSE_CACHE_VERSION = "v1";
const RESPONSE_CACHE_PREFIX = "gateway:response-cache";
const DEFAULT_RESPONSE_CACHE_TTL_SECONDS = 300;
const MIN_RESPONSE_CACHE_TTL_SECONDS = 30;
const MAX_RESPONSE_CACHE_TTL_SECONDS = 86_400;
const RESPONSE_CACHE_ELIGIBLE_ENDPOINTS = new Set<Endpoint>([
	"responses",
	"chat.completions",
	"messages",
]);

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ResponseCacheTtlSource =
	| "request"
	| "preset"
	| "workspace_default"
	| "platform_default"
	| "disabled";

export type ResponseCachePolicy = {
	enabled: boolean;
	ttlSeconds: number | null;
	source: ResponseCacheTtlSource;
};

export type ResponseCacheFingerprintInput = {
	workspaceId: string;
	endpoint: Endpoint;
	model: string;
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
	set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
	delete(key: string): Promise<void>;
};

export type CachedResponseRecord = {
	version: string;
	key: string;
	fingerprint: string;
	endpoint: Endpoint;
	model: string;
	statusCode: number;
	responseBody: unknown;
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
		endpoint: input.endpoint,
		model: input.model,
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

export function buildResponseCacheKey(workspaceId: string, digest: string): string {
	return `${RESPONSE_CACHE_PREFIX}:${RESPONSE_CACHE_VERSION}:${workspaceId}:${digest}`;
}

export function isResponseCacheEligible(args: {
	endpoint: Endpoint;
	stream: boolean;
	debugEnabled?: boolean;
	hasTools?: boolean;
	serverToolsEnabled?: boolean;
}): { eligible: boolean; reason: string } {
	if (!RESPONSE_CACHE_ELIGIBLE_ENDPOINTS.has(args.endpoint)) {
		return { eligible: false, reason: "unsupported_endpoint" };
	}
	if (args.stream) {
		return { eligible: false, reason: "streaming_request" };
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

export function resolveResponseCachePolicy(args: {
	requestTtlSeconds?: number | null;
	presetTtlSeconds?: number | null;
	workspaceDefaultTtlSeconds?: number | null;
	platformDefaultTtlSeconds?: number | null;
	requestDisabled?: boolean;
	presetDisabled?: boolean;
	workspaceDisabled?: boolean;
}): ResponseCachePolicy {
	if (args.requestDisabled || args.presetDisabled || args.workspaceDisabled) {
		return {
			enabled: false,
			ttlSeconds: null,
			source: "disabled",
		};
	}

	const sources: Array<[ResponseCacheTtlSource, number | null]> = [
		["request", coercePositiveInteger(args.requestTtlSeconds)],
		["preset", coercePositiveInteger(args.presetTtlSeconds)],
		["workspace_default", coercePositiveInteger(args.workspaceDefaultTtlSeconds)],
		[
			"platform_default",
			coercePositiveInteger(args.platformDefaultTtlSeconds) ??
				DEFAULT_RESPONSE_CACHE_TTL_SECONDS,
		],
	];

	for (const [source, ttlSeconds] of sources) {
		if (ttlSeconds === null) continue;
		return {
			enabled: true,
			ttlSeconds: clampResponseCacheTtlSeconds(ttlSeconds),
			source,
		};
	}

	return {
		enabled: false,
		ttlSeconds: null,
		source: "disabled",
	};
}

export function buildCachedResponseRecord(args: {
	key: string;
	fingerprint: string;
	endpoint: Endpoint;
	model: string;
	statusCode: number;
	responseBody: unknown;
	providerId?: string | null;
	providerModelSlug?: string | null;
	usage?: unknown;
	currency?: string | null;
	finishReason?: string | null;
	nativeResponseId?: string | null;
	routingMode?: string | null;
	presetId?: string | null;
	presetSlug?: string | null;
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
		createdAt: createdAt.toISOString(),
		expiresAt: expiresAt.toISOString(),
		ttlSeconds: args.ttlSeconds,
	};
}
