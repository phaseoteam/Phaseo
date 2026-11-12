import type { PublicCachePolicy } from "@/http/cache";

// Policy withdrawal must remain bounded even when a cache purge is unavailable.
export const PUBLIC_DATA_POLICY_CACHE: PublicCachePolicy = {
	edgeTtlSeconds: 5 * 60,
	browserTtlSeconds: 0,
	browserStaleWhileRevalidateSeconds: 0,
};

/**
 * The main public catalogue and the gateway selector are different payloads,
 * but both are projections of the same model catalogue. Keep their cache
 * contract shared so either catalogue invalidation reaches both responses.
 */
export const PUBLIC_MODEL_CATALOGUE_CACHE_TAGS = [
	"web-api-models",
	"web-api-gateway-models",
] as const;

export const PUBLIC_MODEL_CATALOGUE_CACHE: PublicCachePolicy = {
	...PUBLIC_DATA_POLICY_CACHE,
	cacheTags: PUBLIC_MODEL_CATALOGUE_CACHE_TAGS,
};
