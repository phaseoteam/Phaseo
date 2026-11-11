/**
 * JWKS (JSON Web Key Set) Utilities
 *
 * Handles fetching and caching of public keys from Supabase's JWKS endpoint.
 * Uses Cloudflare KV for caching to minimize latency.
 *
 * JWKS Endpoint: https://<project>.supabase.co/auth/v1/.well-known/jwks.json
 *
 * Caching Strategy:
 * - Cache JWKS for 1 hour (3600 seconds)
 * - On cache miss, fetch from Supabase and cache
 * - On an unknown kid, refresh JWKS (key rotation) at most once a minute per isolate
 */

const JWKS_CACHE_KEY = "oauth:jwks";
const JWKS_CACHE_TTL = 3600; // 1 hour in seconds
const JWKS_ERROR_CACHE_KEY = "oauth:jwks:error";
const JWKS_ERROR_CACHE_TTL = 60; // 1 minute suppression for repeated failures
// An unknown kid triggers at most one refetch per JWKS URL per window in each
// isolate, so unverified tokens with random kids cannot drive Supabase fetches
// and KV writes on every request.
const JWKS_FORCED_REFRESH_INTERVAL_MS = 60 * 1000;

export interface JWKS {
	keys: JsonWebKey[];
}

// When each Supabase base URL last started a forced refresh, successful or not.
const forcedRefreshAt = new Map<string, number>();
// The last JWKS this isolate saw per base URL, served when a forced refresh is
// throttled or fails.
const lastKnownJwks = new Map<string, JWKS>();

export function __resetOAuthJwksStateForTests(): void {
	forcedRefreshAt.clear();
	lastKnownJwks.clear();
}

function normalizeSupabaseBaseUrl(supabaseUrl: string): string {
	const trimmed = `${supabaseUrl}`.replace(/\/+$/, "");
	if (trimmed.endsWith("/auth/v1")) {
		return trimmed.slice(0, -"/auth/v1".length);
	}
	return trimmed;
}

function candidateJwksUrls(supabaseUrl: string): string[] {
	const base = normalizeSupabaseBaseUrl(supabaseUrl);
	// Supabase Auth JWKS is under /auth/v1. Keep root fallback for compatibility.
	return [`${base}/auth/v1/.well-known/jwks.json`, `${base}/.well-known/jwks.json`];
}

/**
 * Fetch JWKS from Supabase
 */
export async function fetchJWKS(supabaseUrl: string): Promise<JWKS> {
	const urls = candidateJwksUrls(supabaseUrl);
	let lastErr: string | null = null;

	for (const jwksUrl of urls) {
		try {
			const response = await fetch(jwksUrl, {
				headers: {
					"User-Agent": "Phaseo-Gateway/1.0",
				},
			});

			if (!response.ok) {
				lastErr = `${response.status} ${response.statusText} @ ${jwksUrl}`;
				continue;
			}

			const jwks: JWKS = await response.json();
			if (!jwks.keys || !Array.isArray(jwks.keys)) {
				lastErr = `invalid_jwks_format @ ${jwksUrl}`;
				continue;
			}

			return jwks;
		} catch (error: any) {
			lastErr = `${error?.message ?? "fetch_error"} @ ${jwksUrl}`;
		}
	}

	throw new Error(`Failed to fetch JWKS: ${lastErr ?? "no_jwks_endpoint_available"}`);
}

/**
 * Get JWKS with caching (Cloudflare KV)
 *
 * Returns cached JWKS if available, otherwise fetches from Supabase.
 */
export async function getJWKSWithCache(
	supabaseUrl: string,
	kv: KVNamespace | null
): Promise<JWKS> {
	// Try to get from cache first
	if (kv) {
		try {
			const cachedError = await kv.get(JWKS_ERROR_CACHE_KEY);
			if (cachedError) {
				throw new Error(`JWKS temporarily unavailable: ${cachedError}`);
			}

			const cached = (await kv.get(JWKS_CACHE_KEY, "json")) as JWKS | null;
			if (cached && Array.isArray(cached.keys)) {
				lastKnownJwks.set(normalizeSupabaseBaseUrl(supabaseUrl), cached);
				return cached;
			}
		} catch (error) {
			// Propagate explicit JWKS unavailable markers; otherwise continue to fetch.
			if (error instanceof Error && error.message.startsWith("JWKS temporarily unavailable:")) {
				throw error;
			}
			// Continue to fetch if cache read fails
		}
	}

	// Fetch from Supabase
	let jwks: JWKS;
	try {
		jwks = await fetchJWKS(supabaseUrl);
	} catch (error: any) {
		if (kv) {
			try {
				await kv.put(JWKS_ERROR_CACHE_KEY, String(error?.message ?? "jwks_fetch_failed"), {
					expirationTtl: JWKS_ERROR_CACHE_TTL,
				});
			} catch {
				// ignore cache write failures
			}
		}
		throw error;
	}
	lastKnownJwks.set(normalizeSupabaseBaseUrl(supabaseUrl), jwks);

	// Store in cache (fire and forget)
	if (kv) {
		try {
			await kv.put(JWKS_CACHE_KEY, JSON.stringify(jwks), {
				expirationTtl: JWKS_CACHE_TTL,
			});
			await kv.delete(JWKS_ERROR_CACHE_KEY);
		} catch (error) {
			// Don't fail if caching fails
		}
	}

	return jwks;
}

/**
 * Invalidate JWKS cache
 *
 * Used when signature verification fails (might indicate key rotation)
 */
export async function invalidateJWKSCache(kv: KVNamespace | null): Promise<void> {
	if (kv) {
		try {
			await kv.delete(JWKS_CACHE_KEY);
			await kv.delete(JWKS_ERROR_CACHE_KEY);
		} catch (error) {
			console.error("Error invalidating JWKS cache:", error);
		}
	}
}

/** Cached JWKS without fetching: KV first (other isolates may have refreshed it), then this isolate's copy. */
async function readKnownJWKS(baseUrl: string, kv: KVNamespace | null): Promise<JWKS> {
	if (kv) {
		try {
			const cached = (await kv.get(JWKS_CACHE_KEY, "json")) as JWKS | null;
			if (cached && Array.isArray(cached.keys)) return cached;
		} catch {
			// Fall back to the isolate copy.
		}
	}
	return lastKnownJwks.get(baseUrl) ?? { keys: [] };
}

/**
 * Get JWKS with retry on verification failure
 *
 * Without `forceRefresh` this is `getJWKSWithCache`. With it (the token's kid
 * was not in the cached set, which may mean key rotation), this refetches at
 * most once per base URL per minute per isolate. The refresh runs before any
 * signature check, so it must stay cheap for forged tokens:
 * - inside the window it returns the cached keys, so an unknown kid just fails;
 * - the good cached JWKS is replaced only after a successful fetch;
 * - a failed forced fetch returns the cached keys and does not write the
 *   error marker, so tokens signed by a known key keep working.
 */
export async function getJWKSWithRetry(
	supabaseUrl: string,
	kv: KVNamespace | null,
	forceRefresh = false,
	nowMs: number = Date.now()
): Promise<JWKS> {
	if (!forceRefresh) {
		return await getJWKSWithCache(supabaseUrl, kv);
	}

	const baseUrl = normalizeSupabaseBaseUrl(supabaseUrl);
	const last = forcedRefreshAt.get(baseUrl);
	if (last !== undefined && nowMs - last < JWKS_FORCED_REFRESH_INTERVAL_MS) {
		return await readKnownJWKS(baseUrl, kv);
	}
	// Reserve the slot before the fetch so concurrent requests and failures cannot bypass it.
	forcedRefreshAt.set(baseUrl, nowMs);

	let jwks: JWKS;
	try {
		jwks = await fetchJWKS(supabaseUrl);
	} catch (error) {
		console.error("Forced JWKS refresh failed; keeping cached keys:", error);
		return await readKnownJWKS(baseUrl, kv);
	}
	lastKnownJwks.set(baseUrl, jwks);
	if (kv) {
		try {
			await kv.put(JWKS_CACHE_KEY, JSON.stringify(jwks), {
				expirationTtl: JWKS_CACHE_TTL,
			});
			await kv.delete(JWKS_ERROR_CACHE_KEY);
		} catch {
			// Caching is best effort.
		}
	}
	return jwks;
}
