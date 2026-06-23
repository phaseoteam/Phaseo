import type {
	CapabilityRoutingStatus,
	GateCheck,
	GatewayContextData,
	ProviderRolloutStatus,
	RoutingStatus,
	TeamEnrichment,
} from "./types";

const STATIC_TTL_MIN = 300; // 5 minutes
const STATIC_TTL_MAX = 900; // 15 minutes
const DYNAMIC_TTL_MIN = 120; // 2 minutes
const DYNAMIC_TTL_MAX = 600; // 10 minutes
const CREDIT_TTL_MAX = 7200; // 2 hours
const BALANCE_TTL_CAP_USD = 250;
const MIN_TTL_SECONDS = 60; // Cloudflare KV minimum
const MAX_TTL_SECONDS = 7200; // 2 hours

/**
 * Clamp TTL to valid range for Cloudflare Workers KV
 * Minimum: 60s (KV requirement)
 * Maximum: 7200s (2 hours)
 */
export function clampTtl(value: number): number {
	return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(value)));
}

export function round3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function toUnixSeconds(date: Date): number {
	return Math.floor(date.getTime() / 1000);
}

function parseWindowEnd(
	bucket: "daily" | "weekly" | "monthly",
	windowStart?: string | null,
): number | null {
	if (!windowStart) return null;
	const start = new Date(windowStart);
	if (!Number.isFinite(start.getTime())) return null;
	const end = new Date(start);
	if (bucket === "daily") {
		end.setUTCDate(start.getUTCDate() + 1);
	} else if (bucket === "weekly") {
		end.setUTCDate(start.getUTCDate() + 7);
	} else {
		end.setUTCMonth(start.getUTCMonth() + 1);
	}
	return toUnixSeconds(end);
}

function bucketPressureScore(bucket?: {
	requestsUsed: number;
	requestsLimit: number;
	costUsedNanos: number;
	costLimitNanos: number;
} | null): number {
	if (!bucket) return 0;
	const ratios: number[] = [];
	if (bucket.requestsLimit > 0) ratios.push(bucket.requestsUsed / bucket.requestsLimit);
	if (bucket.costLimitNanos > 0) ratios.push(bucket.costUsedNanos / bucket.costLimitNanos);
	return ratios.length ? Math.max(...ratios) : 0;
}

function finiteNumber(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function resolveBalanceUsd(context: GatewayContextData): number | null {
	const enriched = finiteNumber(context.teamEnrichment?.balance_usd);
	if (enriched !== null) return Math.max(0, enriched);
	const nanos = finiteNumber(context.credit?.balanceNanos);
	if (nanos === null) return null;
	return Math.max(0, nanos / 1_000_000_000);
}

/**
 * Map wallet balance to TTL with a fast drop-off near low balances.
 * - 0 USD => 120s
 * - 250+ USD => 600s
 * - Uses logarithmic normalization + power curve for steeper lower-tier decay.
 */
export function computeBalanceAwareTtlSeconds(balanceUsd: number): number {
	if (!Number.isFinite(balanceUsd) || balanceUsd <= 0) return DYNAMIC_TTL_MIN;
	const cappedBalance = Math.min(balanceUsd, BALANCE_TTL_CAP_USD);
	const normalized = Math.log1p(cappedBalance) / Math.log1p(BALANCE_TTL_CAP_USD);
	const weighted = Math.pow(normalized, 2);
	const ttl = DYNAMIC_TTL_MIN + weighted * (DYNAMIC_TTL_MAX - DYNAMIC_TTL_MIN);
	return clampTtl(ttl);
}

/**
 * Credit snapshots are safe to cache longer for high-balance workspaces because
 * the DB/ledger remains authoritative and low-balance users revalidate quickly.
 */
export function computeCreditSnapshotTtlSeconds(balanceUsd: number | null): number {
	if (balanceUsd === null || !Number.isFinite(balanceUsd) || balanceUsd < 10) return 60;
	if (balanceUsd < 25) return 120;
	if (balanceUsd < 100) return 300;
	if (balanceUsd < 250) return 600;
	if (balanceUsd < 1000) return 1800;
	return CREDIT_TTL_MAX;
}

export function computeCreditSnapshotTtlForContext(context: GatewayContextData): number {
	return computeCreditSnapshotTtlSeconds(resolveBalanceUsd(context));
}

/**
 * Compute adaptive TTL for dynamic data (key limits, buckets)
 * Respects Cloudflare KV 60s minimum TTL
 */
export function computeAdaptiveTtlForDynamic(context: GatewayContextData): number {
	let ttl = DYNAMIC_TTL_MAX;

	// If key, limits, or credit are not OK, revalidate aggressively.
	if (!context.key.ok || !context.keyLimit.ok || !context.credit.ok) {
		return clampTtl(60);
	}

	// Credit balance curve: high balances can tolerate longer cache windows,
	// while low balances quickly move to short TTL.
	const balanceUsd = resolveBalanceUsd(context);
	if (balanceUsd !== null) {
		ttl = Math.min(ttl, computeBalanceAwareTtlSeconds(balanceUsd));
	}

	const buckets = context.keyLimit.buckets ?? null;
	const nowSec = context.keyLimit.now
		? toUnixSeconds(new Date(context.keyLimit.now))
		: toUnixSeconds(new Date());
	const bucketEntries: Array<["daily" | "weekly" | "monthly", any]> = [
		["daily", buckets?.daily ?? null],
		["weekly", buckets?.weekly ?? null],
		["monthly", buckets?.monthly ?? null],
	];

	for (const [bucketName, bucket] of bucketEntries) {
		if (!bucket) continue;
		const pressure = bucketPressureScore(bucket);

		// High pressure = shorter TTL (but respect 60s minimum).
		if (pressure >= 0.95) ttl = Math.min(ttl, 60);
		else if (pressure >= 0.9) ttl = Math.min(ttl, 75);
		else if (pressure >= 0.8) ttl = Math.min(ttl, 90);
		else if (pressure >= 0.6) ttl = Math.min(ttl, 120);
		else if (pressure >= 0.4) ttl = Math.min(ttl, 180);
		else ttl = Math.min(ttl, DYNAMIC_TTL_MAX);

		const windowEnd = parseWindowEnd(bucketName, bucket.windowStart);
		if (windowEnd) {
			const secondsToReset = windowEnd - nowSec;
			if (secondsToReset > 0 && secondsToReset >= MIN_TTL_SECONDS) {
				ttl = Math.min(ttl, secondsToReset);
			}
		}
	}

	return clampTtl(ttl);
}

/**
 * Compute TTL for static data (providers, pricing)
 * Uses longer TTL since this data changes infrequently
 */
export function computeStaticTtl(): number {
	// Static data can be cached for 5-15 minutes.
	// Use midpoint default and keep tunable via constants.
	return Math.floor((STATIC_TTL_MIN + STATIC_TTL_MAX) / 2);
}

type DynamicContextCacheEntry = Pick<
	GatewayContextData,
	| "workspaceId"
	| "key"
	| "keyLimit"
	| "keyEnrichment"
	| "teamSettings"
> & {
	// Legacy entries included credit in the dynamic context. Keep accepting
	// them so deploys do not invalidate every hot context at once.
	credit?: GateCheck;
	teamEnrichment?: TeamEnrichment | null;
};
type StaticContextCacheEntry = Pick<
	GatewayContextData,
	"workspaceId" | "resolvedModel" | "preset" | "providers" | "pricing" | "testingMode"
>;
type CreditContextCacheEntry = Pick<GatewayContextData, "workspaceId" | "credit" | "teamEnrichment">;

export function isDynamicContextLike(value: unknown): value is DynamicContextCacheEntry {
	if (!value || typeof value !== "object") return false;
	const ctx = value as DynamicContextCacheEntry;
	return Boolean(ctx.workspaceId && ctx.key && ctx.keyLimit);
}

export function isStaticContextLike(value: unknown): value is StaticContextCacheEntry {
	if (!value || typeof value !== "object") return false;
	const ctx = value as StaticContextCacheEntry;
	return Boolean(
		ctx.workspaceId &&
			Array.isArray(ctx.providers) &&
			ctx.pricing &&
			typeof ctx.pricing === "object",
	);
}

export function isCreditContextLike(value: unknown): value is CreditContextCacheEntry {
	if (!value || typeof value !== "object") return false;
	const ctx = value as CreditContextCacheEntry;
	return Boolean(ctx.workspaceId && ctx.credit);
}

export function mergeCachedContext(args: {
	dynamic: DynamicContextCacheEntry;
	static: StaticContextCacheEntry;
	credit?: CreditContextCacheEntry | null;
	endpoint: string;
}): GatewayContextData {
	const credit = args.credit?.credit ?? args.dynamic.credit;
	if (!credit) {
		throw new Error("gateway_context_credit_cache_missing");
	}
	return {
		workspaceId: args.dynamic.workspaceId,
		endpoint: args.endpoint as any,
		resolvedModel: args.static.resolvedModel ?? null,
		preset: args.static.preset ?? null,
		key: args.dynamic.key,
		keyLimit: args.dynamic.keyLimit,
		credit,
		providers: args.static.providers ?? [],
		pricing: args.static.pricing ?? {},
		teamEnrichment: args.credit?.teamEnrichment ?? args.dynamic.teamEnrichment ?? null,
		keyEnrichment: args.dynamic.keyEnrichment ?? null,
		teamSettings: args.dynamic.teamSettings ?? null,
		testingMode: Boolean(args.static.testingMode),
	};
}

export function splitContextForCache(value: GatewayContextData): {
	dynamic: DynamicContextCacheEntry;
	static: StaticContextCacheEntry;
	credit: CreditContextCacheEntry;
} {
	return {
		dynamic: {
			workspaceId: value.workspaceId,
			key: value.key,
			keyLimit: value.keyLimit,
			keyEnrichment: value.keyEnrichment ?? null,
			teamSettings: value.teamSettings ?? null,
		},
		static: {
			workspaceId: value.workspaceId,
			resolvedModel: value.resolvedModel ?? null,
			preset: value.preset ?? null,
			providers: value.providers ?? [],
			pricing: value.pricing ?? {},
			testingMode: Boolean(value.testingMode),
		},
		credit: {
			workspaceId: value.workspaceId,
			credit: value.credit,
			teamEnrichment: value.teamEnrichment ?? null,
		},
	};
}

export function cloneGatewayContextData(value: GatewayContextData): GatewayContextData {
	return {
		...value,
		key: value.key ? { ...value.key } : value.key,
		keyLimit: value.keyLimit
			? {
					...value.keyLimit,
					buckets: value.keyLimit.buckets
						? {
								daily: value.keyLimit.buckets.daily
									? { ...value.keyLimit.buckets.daily }
									: undefined,
								weekly: value.keyLimit.buckets.weekly
									? { ...value.keyLimit.buckets.weekly }
									: undefined,
								monthly: value.keyLimit.buckets.monthly
									? { ...value.keyLimit.buckets.monthly }
									: undefined,
						  }
						: value.keyLimit.buckets ?? null,
			  }
			: value.keyLimit,
		credit: value.credit ? { ...value.credit } : value.credit,
		providers: (value.providers ?? []).map((provider) => ({
			...provider,
			byokMeta: Array.isArray(provider.byokMeta) ? [...provider.byokMeta] : [],
			inputModalities: Array.isArray(provider.inputModalities)
				? [...provider.inputModalities]
				: provider.inputModalities ?? null,
			outputModalities: Array.isArray(provider.outputModalities)
				? [...provider.outputModalities]
				: provider.outputModalities ?? null,
			executionRegions: Array.isArray(provider.executionRegions)
				? [...provider.executionRegions]
				: provider.executionRegions ?? null,
			dataRegions: Array.isArray(provider.dataRegions)
				? [...provider.dataRegions]
				: provider.dataRegions ?? null,
			capabilityParams: provider.capabilityParams ? { ...provider.capabilityParams } : {},
		})),
		pricing: { ...(value.pricing ?? {}) },
		teamEnrichment: value.teamEnrichment ? { ...value.teamEnrichment } : value.teamEnrichment ?? null,
		keyEnrichment: value.keyEnrichment ? { ...value.keyEnrichment } : value.keyEnrichment ?? null,
		teamSettings: value.teamSettings ? { ...value.teamSettings } : value.teamSettings ?? null,
		contextTelemetry: value.contextTelemetry
			? { ...value.contextTelemetry }
			: value.contextTelemetry,
	};
}

export function trackContextInflight(args: {
	cacheKey: string;
	promise: Promise<GatewayContextData>;
	contextInflight: Map<string, Promise<GatewayContextData>>;
	maxEntries: number;
}): void {
	while (args.contextInflight.size >= args.maxEntries) {
		const oldest = args.contextInflight.keys().next().value;
		if (!oldest) break;
		args.contextInflight.delete(oldest);
	}
	args.contextInflight.set(args.cacheKey, args.promise);
}

export function normalizeProviderStatus(value: unknown): ProviderRolloutStatus {
	const status = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (status === "active") return "active";
	if (status === "beta") return "beta";
	if (status === "alpha") return "alpha";
	if (status === "notready" || status === "not_ready") {
		return "not_ready";
	}
	if (status === "gated") return "gated";
	if (status === "access_limited") return "access_limited";
	if (status === "region_limited") return "region_limited";
	if (status === "project_limited") return "project_limited";
	if (status === "paused") return "paused";
	if (status === "soft_blocked") return "soft_blocked";
	return "active";
}

export function normalizeRoutingStatus(value: unknown): RoutingStatus {
	const status = String(value ?? "").trim().toLowerCase();
	if (status === "active") return "active";
	if (status === "deranked" || status === "deranked_lvl1" || status === "deranked-lvl1") {
		return "deranked_lvl1";
	}
	if (status === "deranked_lvl2" || status === "deranked-lvl2") return "deranked_lvl2";
	if (status === "deranked_lvl3" || status === "deranked-lvl3") return "deranked_lvl3";
	if (status === "disabled") return "disabled";
	if (status === "notready" || status === "not_ready" || status === "not ready") {
		return "disabled";
	}
	return "active";
}

export function normalizeCapabilityStatus(value: unknown): CapabilityRoutingStatus {
	const status = String(value ?? "").trim().toLowerCase();
	if (
		status === "internal_testing" ||
		status === "internal-testing" ||
		status === "internaltesting"
	) {
		return "internal_testing";
	}
	if (status === "coming_soon" || status === "coming-soon" || status === "comingsoon") {
		return "coming_soon";
	}
	return normalizeRoutingStatus(status);
}

export const ROUTABLE_CAPABILITY_STATUSES = [
	"active",
	"deranked",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
] as const;

export const ROUTABLE_CAPABILITY_STATUSES_WITH_TESTING = [
	...ROUTABLE_CAPABILITY_STATUSES,
	"internal_testing",
] as const;

export function parseModalities(value: unknown): Set<string> {
	if (Array.isArray(value)) {
		return new Set(
			value
				.map((entry) => String(entry ?? "").trim().toLowerCase())
				.filter(Boolean),
		);
	}
	if (typeof value === "string") {
		return new Set(
			value
				.split(",")
				.map((entry) => entry.trim().toLowerCase())
				.filter(Boolean),
		);
	}
	return new Set<string>();
}

function normalizeInputModalityBase(value: string): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "text" || normalized.startsWith("text_")) return "text";
	if (normalized === "image" || normalized.startsWith("image_")) return "image";
	if (normalized === "audio" || normalized.startsWith("audio_")) return "audio";
	if (normalized === "video" || normalized.startsWith("video_")) return "video";
	return normalized;
}

function normalizeOutputModalityBase(value: string): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "text" || normalized.startsWith("text_")) return "text";
	if (normalized === "image" || normalized.startsWith("image_")) return "image";
	if (normalized === "audio" || normalized === "audio_tts" || normalized === "audio_music") {
		return "audio";
	}
	if (normalized === "video" || normalized.startsWith("video_")) return "video";
	return normalized;
}

export function supportsEndpointViaModalities(args: {
	endpoint: string;
	inputModalities: Set<string>;
	outputModalities: Set<string>;
}): boolean {
	const endpoint = String(args.endpoint ?? "").trim().toLowerCase();
	const input = new Set(Array.from(args.inputModalities).map(normalizeInputModalityBase));
	const output = new Set(Array.from(args.outputModalities).map(normalizeOutputModalityBase));

	const hasInput = (...values: string[]) => values.some((value) => input.has(value));
	const hasOutput = (...values: string[]) => values.some((value) => output.has(value));

	switch (endpoint) {
		case "audio.speech":
			return hasInput("text") && hasOutput("audio");
		case "audio.transcription":
		case "audio.translations":
			return hasInput("audio") && hasOutput("text");
		case "images.generations":
		case "images.generate":
		case "image.generate":
			return hasInput("text", "image") && hasOutput("image");
		case "images.edits":
		case "image.edit":
			return hasInput("image", "text") && hasOutput("image");
		case "video.generation":
		case "video.generate":
			return hasInput("text", "image", "video") && hasOutput("video");
		case "music.generate":
			return hasInput("text") && hasOutput("audio");
		case "ocr":
			return hasInput("image") && hasOutput("text");
		default:
			return false;
	}
}

export function toMillis(value: string | null | undefined): number {
	if (!value) return 0;
	const ts = Date.parse(value);
	return Number.isFinite(ts) ? ts : 0;
}

export function isWithinEffectiveWindow(
	effectiveFrom: string | null | undefined,
	effectiveTo: string | null | undefined,
	nowMs: number,
): boolean {
	const startMs = effectiveFrom ? Date.parse(effectiveFrom) : null;
	const endMs = effectiveTo ? Date.parse(effectiveTo) : null;
	if (startMs !== null && Number.isFinite(startMs) && startMs > nowMs) return false;
	if (endMs !== null && Number.isFinite(endMs) && nowMs >= endMs) return false;
	return true;
}
