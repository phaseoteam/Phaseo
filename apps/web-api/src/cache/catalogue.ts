import type { PublicCachePolicy } from "@/http/cache";

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
	edgeTtlSeconds: 5 * 60,
	staleWhileRevalidateSeconds: 5 * 60,
	staleIfErrorSeconds: 60 * 60,
	browserTtlSeconds: 0,
	browserStaleWhileRevalidateSeconds: 0,
	cacheTags: PUBLIC_MODEL_CATALOGUE_CACHE_TAGS,
};
