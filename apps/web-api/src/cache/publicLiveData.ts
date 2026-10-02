import type { PublicCachePolicy } from "@/http/cache";

/** Shared public provider, pricing and telemetry freshness. Serve cached data
 * while refreshing and during a brief backend outage to protect the database.
 * Browser query memory owns client reuse; do not add a second HTTP-cache TTL.
 */
export const PUBLIC_LIVE_DATA_CACHE = {
	edgeTtlSeconds: 15 * 60,
	staleWhileRevalidateSeconds: 15 * 60,
	staleIfErrorSeconds: 60 * 60,
	browserTtlSeconds: 0,
	browserStaleWhileRevalidateSeconds: 0,
} as const satisfies PublicCachePolicy;
