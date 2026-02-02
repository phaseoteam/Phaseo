/**
 * JWKS (JSON Web Key Set) Utilities
 *
 * Handles fetching and caching of public keys from Supabase's JWKS endpoint.
 * Uses Cloudflare KV for caching to minimize latency.
 *
 * JWKS Endpoint: https://<project>.supabase.co/.well-known/jwks.json
 *
 * Caching Strategy:
 * - Cache JWKS for 1 hour (3600 seconds)
 * - On cache miss, fetch from Supabase and cache
 * - On signature verification failure, refresh JWKS (key rotation)
 */

const JWKS_CACHE_KEY = "oauth:jwks";
const JWKS_CACHE_TTL = 3600; // 1 hour in seconds

export interface JWKS {
	keys: JsonWebKey[];
}

/**
 * Fetch JWKS from Supabase
 */
export async function fetchJWKS(supabaseUrl: string): Promise<JWKS> {
	const jwksUrl = `${supabaseUrl}/.well-known/jwks.json`;

	try {
		const response = await fetch(jwksUrl, {
			headers: {
				"User-Agent": "AIStats-Gateway/1.0",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`);
		}

		const jwks: JWKS = await response.json();

		if (!jwks.keys || !Array.isArray(jwks.keys)) {
			throw new Error("Invalid JWKS format");
		}

		return jwks;
	} catch (error: any) {
		console.error("Error fetching JWKS:", error);
		throw new Error(`Failed to fetch JWKS: ${error.message}`);
	}
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
			const cached = await kv.get(JWKS_CACHE_KEY, "json");
			if (cached && cached.keys && Array.isArray(cached.keys)) {
				return cached as JWKS;
			}
		} catch (error) {
			console.error("Error reading JWKS from cache:", error);
			// Continue to fetch if cache read fails
		}
	}

	// Fetch from Supabase
	const jwks = await fetchJWKS(supabaseUrl);

	// Store in cache (fire and forget)
	if (kv) {
		try {
			await kv.put(JWKS_CACHE_KEY, JSON.stringify(jwks), {
				expirationTtl: JWKS_CACHE_TTL,
			});
		} catch (error) {
			console.error("Error caching JWKS:", error);
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
		} catch (error) {
			console.error("Error invalidating JWKS cache:", error);
		}
	}
}

/**
 * Get JWKS with retry on verification failure
 *
 * This function:
 * 1. Gets cached JWKS
 * 2. If verification fails, invalidates cache and refetches
 * 3. Returns fresh JWKS for retry
 */
export async function getJWKSWithRetry(
	supabaseUrl: string,
	kv: KVNamespace | null,
	forceRefresh = false
): Promise<JWKS> {
	if (forceRefresh) {
		await invalidateJWKSCache(kv);
	}

	return await getJWKSWithCache(supabaseUrl, kv);
}
