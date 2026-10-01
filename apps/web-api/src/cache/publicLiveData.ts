import type { PublicCachePolicy } from "@/http/cache";

/** Shared public provider, pricing and telemetry freshness. Expiry blocks on
 * revalidation instead of serving an extra stale window to a 15-minute poll.
 * Browser query memory owns client reuse; do not add a second HTTP-cache TTL.
 */
export const PUBLIC_LIVE_DATA_CACHE = {
	edgeTtlSeconds: 15 * 60,
	staleWhileRevalidateSeconds: 0,
	staleIfErrorSeconds: 0,
	browserTtlSeconds: 0,
	browserStaleWhileRevalidateSeconds: 0,
} as const satisfies PublicCachePolicy;
