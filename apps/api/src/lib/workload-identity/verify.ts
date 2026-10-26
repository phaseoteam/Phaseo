// Purpose: Verify OIDC tokens that external platforms issue to customer workloads.
// Why: Lets the gateway accept a short-lived Vercel or GitHub Actions token
// instead of a long-lived Phaseo API key.
// How: Strict JWS parsing, asymmetric algorithms only, cached JWKS, and
// standard time-claim checks. Policy matching lives in policy.ts.

import { jwksUrlForIssuer, presetProviderForIssuer, type WorkloadIdentityProvider } from "./issuers";

const MAX_TOKEN_LENGTH = 8_192;
const CLOCK_SKEW_SECONDS = 60;
export const DEFAULT_MAX_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
/**
 * Tokens must be minted for Phaseo. Platform default audiences (for example
 * Vercel's https://vercel.com/<team>) are shared with every service the
 * workload calls, so a token sent elsewhere could be replayed here.
 */
export const WORKLOAD_IDENTITY_AUDIENCE = "https://api.phaseo.app";

const JWKS_L1_TTL_MS = 10 * 60 * 1000;
const JWKS_KV_TTL_SECONDS = 60 * 60;
const JWKS_KV_PREFIX = "workload-identity:jwks:v1:";
// An unknown kid triggers at most one refetch per URL per window, so random
// kids cannot turn the gateway into a JWKS request amplifier.
const JWKS_FORCED_REFRESH_INTERVAL_MS = 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 3_000;
const JWKS_MAX_BYTES = 64 * 1024;
// A failed fetch is not retried for a minute, so unverified tokens naming a
// missing or failing issuer cannot drive an outbound request on every attempt.
const JWKS_FAILURE_BACKOFF_MS = 60 * 1000;
const JWKS_FAILURE_MAX_ENTRIES = 1_000;

type SupportedAlg = "RS256" | "ES256";
const ALGORITHMS: Record<SupportedAlg, { kty: string; import: RsaHashedImportParams | EcKeyImportParams; verify: AlgorithmIdentifier | EcdsaParams }> = {
	RS256: {
		kty: "RSA",
		import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		verify: { name: "RSASSA-PKCS1-v1_5" },
	},
	ES256: {
		kty: "EC",
		import: { name: "ECDSA", namedCurve: "P-256" },
		verify: { name: "ECDSA", hash: "SHA-256" },
	},
};

export type WorkloadTokenClaims = Record<string, unknown> & {
	iss: string;
	exp: number;
	iat: number;
	aud: string | string[];
};

export type WorkloadTokenFailureReason =
	| "workload_token_malformed"
	| "workload_token_wrong_audience"
	| "workload_token_unsupported_alg"
	| "workload_issuer_not_trusted"
	| "workload_jwks_unavailable"
	| "workload_token_key_not_found"
	| "workload_token_invalid_signature"
	| "workload_token_expired"
	| "workload_token_not_yet_valid"
	| "workload_token_lifetime_too_long";

export type VerifiedWorkloadToken = {
	ok: true;
	provider: WorkloadIdentityProvider;
	claims: WorkloadTokenClaims;
};
export type WorkloadTokenFailure = { ok: false; reason: WorkloadTokenFailureReason };

export type JwksSource = {
	/** Returns the issuer's signing keys; `forceRefresh` bypasses caches. */
	getKeys(url: string, options?: { forceRefresh?: boolean }): Promise<JsonWebKey[]>;
};

type DecodedJwt = {
	header: Record<string, unknown>;
	payload: Record<string, unknown>;
	signingInput: Uint8Array<ArrayBuffer>;
	signature: Uint8Array<ArrayBuffer>;
};

function decodeBase64UrlBytes(segment: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(segment)) return null;
	try {
		const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
	const bytes = decodeBase64UrlBytes(segment);
	if (!bytes) return null;
	try {
		const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
		return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

export function decodeJwt(token: string): DecodedJwt | null {
	if (token.length > MAX_TOKEN_LENGTH) return null;
	const parts = token.split(".");
	if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
	const header = decodeJsonSegment(parts[0]);
	const payload = decodeJsonSegment(parts[1]);
	const signature = decodeBase64UrlBytes(parts[2]);
	if (!header || !payload || !signature) return null;
	return {
		header,
		payload,
		signingInput: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
		signature,
	};
}

/** Cheap pre-check used by the auth router; does not verify anything. */
export function readUnverifiedIssuer(token: string): string | null {
	const decoded = decodeJwt(token);
	const iss = decoded?.payload.iss;
	return typeof iss === "string" && iss.length > 0 ? iss : null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

async function verifySignature(decoded: DecodedJwt, alg: SupportedAlg, jwk: JsonWebKey): Promise<boolean> {
	const spec = ALGORITHMS[alg];
	if (jwk.kty !== spec.kty) return false;
	if (jwk.use !== undefined && jwk.use !== "sig") return false;
	if (jwk.alg !== undefined && jwk.alg !== alg) return false;
	try {
		// Strip private members defensively; a published JWKS should never have them.
		const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...publicJwk } = jwk;
		const key = await crypto.subtle.importKey("jwk", publicJwk, spec.import, false, ["verify"]);
		return await crypto.subtle.verify(spec.verify, key, decoded.signature, decoded.signingInput);
	} catch {
		return false;
	}
}

export async function verifyWorkloadToken(
	token: string,
	options: {
		jwks: JwksSource;
		nowSeconds?: number;
		maxLifetimeSeconds?: number;
	},
): Promise<VerifiedWorkloadToken | WorkloadTokenFailure> {
	const decoded = decodeJwt(token);
	if (!decoded) return { ok: false, reason: "workload_token_malformed" };

	const { header, payload } = decoded;
	const alg = header.alg;
	if (alg !== "RS256" && alg !== "ES256") return { ok: false, reason: "workload_token_unsupported_alg" };
	if (header.crit !== undefined) return { ok: false, reason: "workload_token_unsupported_alg" };
	const kid = typeof header.kid === "string" && header.kid.length > 0 ? header.kid : null;
	if (!kid) return { ok: false, reason: "workload_token_malformed" };

	const iss = payload.iss;
	if (typeof iss !== "string") return { ok: false, reason: "workload_token_malformed" };
	const provider = presetProviderForIssuer(iss);
	const jwksUrl = provider ? jwksUrlForIssuer(iss, provider) : null;
	if (!provider || !jwksUrl) return { ok: false, reason: "workload_issuer_not_trusted" };

	const aud = payload.aud;
	const audienceValid = typeof aud === "string" || (Array.isArray(aud) && aud.length > 0 && aud.every((value) => typeof value === "string"));
	if (!audienceValid || !isFiniteNumber(payload.exp) || !isFiniteNumber(payload.iat)) {
		return { ok: false, reason: "workload_token_malformed" };
	}
	if (payload.nbf !== undefined && !isFiniteNumber(payload.nbf)) return { ok: false, reason: "workload_token_malformed" };
	const audiences: unknown[] = Array.isArray(aud) ? aud : [aud];
	if (!audiences.includes(WORKLOAD_IDENTITY_AUDIENCE)) return { ok: false, reason: "workload_token_wrong_audience" };

	// Check time claims before any network work so expired tokens stay cheap.
	const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
	if (payload.exp <= now - CLOCK_SKEW_SECONDS) return { ok: false, reason: "workload_token_expired" };
	const notBefore = isFiniteNumber(payload.nbf) ? payload.nbf : payload.iat;
	if (notBefore > now + CLOCK_SKEW_SECONDS) return { ok: false, reason: "workload_token_not_yet_valid" };
	const maxLifetime = options.maxLifetimeSeconds ?? DEFAULT_MAX_TOKEN_LIFETIME_SECONDS;
	if (payload.exp - notBefore > maxLifetime) return { ok: false, reason: "workload_token_lifetime_too_long" };

	let keys: JsonWebKey[];
	try {
		keys = await options.jwks.getKeys(jwksUrl);
	} catch {
		return { ok: false, reason: "workload_jwks_unavailable" };
	}
	let jwk = keys.find((key) => (key as { kid?: unknown }).kid === kid);
	if (!jwk) {
		// Issuers rotate keys; refetch once before giving up.
		try {
			keys = await options.jwks.getKeys(jwksUrl, { forceRefresh: true });
		} catch {
			return { ok: false, reason: "workload_jwks_unavailable" };
		}
		jwk = keys.find((key) => (key as { kid?: unknown }).kid === kid);
	}
	if (!jwk) return { ok: false, reason: "workload_token_key_not_found" };

	if (!(await verifySignature(decoded, alg, jwk))) {
		return { ok: false, reason: "workload_token_invalid_signature" };
	}

	return { ok: true, provider, claims: payload as WorkloadTokenClaims };
}

/* -------------------- JWKS source -------------------- */

type JwksL1Entry = { keys: JsonWebKey[]; expiresAt: number };
const jwksL1 = new Map<string, JwksL1Entry>();
// When each URL last started a forced refresh, successful or not.
const forcedRefreshAt = new Map<string, number>();
const failedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<JsonWebKey[]>>();

export function __resetWorkloadJwksCacheForTests(): void {
	jwksL1.clear();
	forcedRefreshAt.clear();
	failedUntil.clear();
	inFlight.clear();
}

async function fetchJwksDocument(url: string, fetchImpl: typeof fetch): Promise<JsonWebKey[]> {
	const response = await fetchImpl(url, {
		headers: { accept: "application/json", "user-agent": "Phaseo-Gateway/1.0" },
		redirect: "manual",
		signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
	});
	if (response.status !== 200) throw new Error(`jwks_http_${response.status}`);
	const declaredLength = Number(response.headers.get("content-length") ?? "0");
	if (declaredLength > JWKS_MAX_BYTES) throw new Error("jwks_too_large");
	const text = await response.text();
	if (text.length > JWKS_MAX_BYTES) throw new Error("jwks_too_large");
	const parsed = JSON.parse(text) as { keys?: unknown };
	if (!Array.isArray(parsed.keys)) throw new Error("jwks_invalid");
	return parsed.keys.filter((key): key is JsonWebKey => Boolean(key) && typeof key === "object");
}

/**
 * Isolate cache (10 min) in front of KV (1 h) in front of the issuer.
 * Callers must only pass URLs from `jwksUrlForIssuer`.
 */
export function createJwksSource(args: { kv?: KVNamespace | null; fetchImpl?: typeof fetch; nowMs?: () => number }): JwksSource {
	const fetchImpl = args.fetchImpl ?? fetch;
	const nowMs = args.nowMs ?? Date.now;
	return {
		async getKeys(url, options = {}) {
			const now = nowMs();
			const l1 = jwksL1.get(url);
			if (options.forceRefresh) {
				// Rate-limit forced refresh attempts, reserving the slot before the fetch so
				// failures and concurrent requests cannot bypass it.
				const last = forcedRefreshAt.get(url);
				if (last !== undefined && now - last < JWKS_FORCED_REFRESH_INTERVAL_MS) return l1?.keys ?? [];
				forcedRefreshAt.set(url, now);
			} else {
				if (l1 && l1.expiresAt > now) return l1.keys;
				if (args.kv) {
					try {
						const cached = await args.kv.get(`${JWKS_KV_PREFIX}${url}`, "json") as { keys?: unknown } | null;
						if (cached && Array.isArray(cached.keys)) {
							const keys = cached.keys as JsonWebKey[];
							jwksL1.set(url, { keys, expiresAt: now + JWKS_L1_TTL_MS });
							return keys;
						}
					} catch {
						// Fall through to the issuer when KV is unavailable.
					}
				}
			}

			if ((failedUntil.get(url) ?? 0) > now) throw new Error("jwks_backoff");
			// Concurrent misses share one fetch.
			let pending = inFlight.get(url);
			if (!pending) {
				pending = fetchJwksDocument(url, fetchImpl).finally(() => inFlight.delete(url));
				inFlight.set(url, pending);
			}
			let keys: JsonWebKey[];
			try {
				keys = await pending;
			} catch (error) {
				failedUntil.delete(url);
				failedUntil.set(url, now + JWKS_FAILURE_BACKOFF_MS);
				while (failedUntil.size > JWKS_FAILURE_MAX_ENTRIES) failedUntil.delete(failedUntil.keys().next().value as string);
				throw error;
			}
			failedUntil.delete(url);
			jwksL1.set(url, { keys, expiresAt: now + JWKS_L1_TTL_MS });
			if (args.kv) {
				try {
					await args.kv.put(`${JWKS_KV_PREFIX}${url}`, JSON.stringify({ keys }), { expirationTtl: JWKS_KV_TTL_SECONDS });
				} catch {
					// Caching is best effort.
				}
			}
			return keys;
		},
	};
}
