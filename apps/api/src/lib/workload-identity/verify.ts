// Purpose: Verify OIDC tokens that external platforms issue to customer workloads.
// Why: Lets the gateway accept a short-lived platform token (Vercel, GitHub
// Actions, GitLab, Google Cloud, AWS, a workspace's own issuer...) instead of a
// long-lived Phaseo API key.
// How: Strict JWS parsing, asymmetric algorithms only, cached JWKS (found by
// OIDC discovery for custom issuers), and standard time-claim checks. Policy
// matching lives in policy.ts.

import {
	discoveryUrlForIssuer,
	isAllowedDiscoveredJwksUrl,
	jwksUrlForIssuer,
	providerForIssuer,
	type WorkloadIdentityProvider,
} from "./issuers";

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
const DISCOVERY_KV_PREFIX = "workload-identity:discovery:v1:";
// An unknown kid triggers at most one refetch per URL per window, so random
// kids cannot turn the gateway into a JWKS request amplifier.
const JWKS_FORCED_REFRESH_INTERVAL_MS = 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 3_000;
const JWKS_MAX_BYTES = 64 * 1024;
// A failed fetch is not retried for a minute, so unverified tokens naming a
// missing or failing issuer cannot drive an outbound request on every attempt.
const JWKS_FAILURE_BACKOFF_MS = 60 * 1000;
const JWKS_FAILURE_MAX_ENTRIES = 1_000;

type SupportedAlg = "RS256" | "ES256" | "ES384";
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
	// AWS outbound identity federation signs with ES384 unless the caller asks for RS256.
	ES384: {
		kty: "EC",
		import: { name: "ECDSA", namedCurve: "P-384" },
		verify: { name: "ECDSA", hash: "SHA-384" },
	},
};

function isSupportedAlg(value: unknown): value is SupportedAlg {
	return typeof value === "string" && Object.hasOwn(ALGORITHMS, value);
}

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
	/** JWKS URL from a custom issuer's discovery document, already checked against the issuer's host. */
	getJwksUri?(issuer: string): Promise<string>;
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
		/**
		 * Issuers some active policy names. Vercel serves keys for any team name,
		 * so without this an unverified token could make us fetch keys for any slug.
		 */
		configuredIssuers?: ReadonlySet<string>;
		nowSeconds?: number;
		maxLifetimeSeconds?: number;
	},
): Promise<VerifiedWorkloadToken | WorkloadTokenFailure> {
	const decoded = decodeJwt(token);
	if (!decoded) return { ok: false, reason: "workload_token_malformed" };

	const { header, payload } = decoded;
	const alg = header.alg;
	if (!isSupportedAlg(alg)) return { ok: false, reason: "workload_token_unsupported_alg" };
	if (header.crit !== undefined) return { ok: false, reason: "workload_token_unsupported_alg" };
	const kid = typeof header.kid === "string" && header.kid.length > 0 ? header.kid : null;
	if (!kid) return { ok: false, reason: "workload_token_malformed" };

	const iss = payload.iss;
	if (typeof iss !== "string") return { ok: false, reason: "workload_token_malformed" };
	const provider = providerForIssuer(iss);
	if (!provider) return { ok: false, reason: "workload_issuer_not_trusted" };
	// Custom issuers are only ever looked up once an active policy names them.
	if (provider === "custom" && !options.configuredIssuers) return { ok: false, reason: "workload_issuer_not_trusted" };

	const aud = payload.aud;
	const audienceValid = typeof aud === "string" || (Array.isArray(aud) && aud.length > 0 && aud.every((value) => typeof value === "string"));
	if (!audienceValid || !isFiniteNumber(payload.exp) || !isFiniteNumber(payload.iat)) {
		return { ok: false, reason: "workload_token_malformed" };
	}
	if (payload.nbf !== undefined && !isFiniteNumber(payload.nbf)) return { ok: false, reason: "workload_token_malformed" };
	const audiences: unknown[] = Array.isArray(aud) ? aud : [aud];
	// Exact match on each audience value, never a substring.
	if (!audiences.some((value) => value === WORKLOAD_IDENTITY_AUDIENCE)) return { ok: false, reason: "workload_token_wrong_audience" };

	// Check time claims before any network work so expired tokens stay cheap.
	const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
	if (payload.exp <= now - CLOCK_SKEW_SECONDS) return { ok: false, reason: "workload_token_expired" };
	const notBefore = isFiniteNumber(payload.nbf) ? payload.nbf : payload.iat;
	if (notBefore > now + CLOCK_SKEW_SECONDS) return { ok: false, reason: "workload_token_not_yet_valid" };
	const maxLifetime = options.maxLifetimeSeconds ?? DEFAULT_MAX_TOKEN_LIFETIME_SECONDS;
	if (payload.exp - notBefore > maxLifetime) return { ok: false, reason: "workload_token_lifetime_too_long" };
	if (options.configuredIssuers && !options.configuredIssuers.has(iss)) return { ok: false, reason: "workload_issuer_not_trusted" };

	let jwksUrl = jwksUrlForIssuer(iss, provider);
	if (provider === "custom") {
		if (!options.jwks.getJwksUri) return { ok: false, reason: "workload_jwks_unavailable" };
		try {
			jwksUrl = await options.jwks.getJwksUri(iss);
		} catch {
			return { ok: false, reason: "workload_jwks_unavailable" };
		}
	}
	if (!jwksUrl) return { ok: false, reason: "workload_issuer_not_trusted" };

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

type L1Entry<T> = { value: T; expiresAt: number };
const jwksL1 = new Map<string, L1Entry<JsonWebKey[]>>();
const discoveryL1 = new Map<string, L1Entry<string>>();
// When each URL last started a forced refresh, successful or not.
const forcedRefreshAt = new Map<string, number>();
const failedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();

export function __resetWorkloadJwksCacheForTests(): void {
	jwksL1.clear();
	discoveryL1.clear();
	forcedRefreshAt.clear();
	failedUntil.clear();
	inFlight.clear();
}

async function fetchJsonDocument(url: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
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
	const parsed = JSON.parse(text) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("jwks_invalid");
	return parsed as Record<string, unknown>;
}

function parseKeys(document: { keys?: unknown }): JsonWebKey[] {
	if (!Array.isArray(document.keys)) throw new Error("jwks_invalid");
	return document.keys.filter((key): key is JsonWebKey => Boolean(key) && typeof key === "object");
}

/**
 * Isolate cache (10 min) in front of KV (1 h) in front of the issuer, for key
 * sets and for custom issuers' discovery documents.
 * Callers must only pass URLs from `jwksUrlForIssuer` or `getJwksUri`.
 */
export function createJwksSource(args: { kv?: KVNamespace | null; fetchImpl?: typeof fetch; nowMs?: () => number }): JwksSource {
	const fetchImpl = args.fetchImpl ?? fetch;
	const nowMs = args.nowMs ?? Date.now;

	async function load<T>(spec: {
		url: string;
		l1: Map<string, L1Entry<T>>;
		kvPrefix: string;
		parse(document: Record<string, unknown>): T;
		toKv(value: T): Record<string, unknown>;
		forceRefresh?: boolean;
		fallback?: T;
	}): Promise<T> {
		const { url, l1 } = spec;
		const now = nowMs();
		const cached = l1.get(url);
		if (spec.forceRefresh) {
			// Rate-limit forced refresh attempts, reserving the slot before the fetch so
			// failures and concurrent requests cannot bypass it.
			const last = forcedRefreshAt.get(url);
			if (last !== undefined && now - last < JWKS_FORCED_REFRESH_INTERVAL_MS) {
				const value = cached?.value ?? spec.fallback;
				if (value === undefined) throw new Error("jwks_backoff");
				return value;
			}
			forcedRefreshAt.set(url, now);
		} else {
			if (cached && cached.expiresAt > now) return cached.value;
			if (args.kv) {
				try {
					const stored = await args.kv.get(`${spec.kvPrefix}${url}`, "json") as Record<string, unknown> | null;
					if (stored) {
						const value = spec.parse(stored);
						l1.set(url, { value, expiresAt: now + JWKS_L1_TTL_MS });
						return value;
					}
				} catch {
					// Fall through to the issuer when KV is unavailable or holds a bad entry.
				}
			}
		}

		if ((failedUntil.get(url) ?? 0) > now) throw new Error("jwks_backoff");
		// Concurrent misses share one fetch.
		let pending = inFlight.get(url) as Promise<T> | undefined;
		if (!pending) {
			pending = fetchJsonDocument(url, fetchImpl).then(spec.parse).finally(() => inFlight.delete(url));
			inFlight.set(url, pending);
		}
		let value: T;
		try {
			value = await pending;
		} catch (error) {
			failedUntil.delete(url);
			failedUntil.set(url, now + JWKS_FAILURE_BACKOFF_MS);
			while (failedUntil.size > JWKS_FAILURE_MAX_ENTRIES) failedUntil.delete(failedUntil.keys().next().value as string);
			throw error;
		}
		failedUntil.delete(url);
		l1.set(url, { value, expiresAt: now + JWKS_L1_TTL_MS });
		while (l1.size > JWKS_FAILURE_MAX_ENTRIES) l1.delete(l1.keys().next().value as string);
		if (args.kv) {
			try {
				await args.kv.put(`${spec.kvPrefix}${url}`, JSON.stringify(spec.toKv(value)), { expirationTtl: JWKS_KV_TTL_SECONDS });
			} catch {
				// Caching is best effort.
			}
		}
		return value;
	}

	return {
		getKeys(url, options = {}) {
			return load({
				url,
				l1: jwksL1,
				kvPrefix: JWKS_KV_PREFIX,
				parse: parseKeys,
				toKv: (keys) => ({ keys }),
				forceRefresh: options.forceRefresh,
				fallback: [],
			});
		},
		async getJwksUri(issuer) {
			const url = discoveryUrlForIssuer(issuer);
			if (!url) throw new Error("issuer_not_custom");
			return load({
				url,
				l1: discoveryL1,
				kvPrefix: DISCOVERY_KV_PREFIX,
				parse: (document) => {
					// OIDC Discovery: the document must name the issuer it was fetched for.
					if (document.issuer !== issuer || !isAllowedDiscoveredJwksUrl(issuer, document.jwks_uri)) {
						throw new Error("discovery_invalid");
					}
					return document.jwks_uri;
				},
				toKv: (jwksUri) => ({ issuer, jwks_uri: jwksUri }),
			});
		},
	};
}
