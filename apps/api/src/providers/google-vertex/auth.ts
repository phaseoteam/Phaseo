import { googleOAuthTokenRequestInit, resolveGoogleOAuthTokenUri } from "./token-uri";
import type { ExecutorUpstreamTiming } from "@executors/types";

type VertexServiceAccount = {
	client_email: string;
	private_key: string;
	token_uri?: string;
};

function vertexError(code: string): Error & { code: string } {
	const error = new Error(code) as Error & { code: string };
	error.code = code;
	return error;
}

export function resolveVertexApiBase(bindings: Record<string, unknown>): string {
	const rawBase = String(bindings.GOOGLE_VERTEX_BASE_URL || "").replace(/\/+$/, "");
	const project = String(bindings.GOOGLE_VERTEX_PROJECT || "").trim();
	const location = String(bindings.GOOGLE_VERTEX_LOCATION || "").trim() || "global";

	if (rawBase) {
		if (/\/v\d+(?:beta\d+)?\/projects\/[^/]+\/locations\/[^/]+$/i.test(rawBase)) {
			return rawBase;
		}
		if (!project) throw vertexError("google-vertex_project_missing");
		if (/\/v\d+(?:beta\d+)?$/i.test(rawBase)) {
			return `${rawBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
		}
		return `${rawBase}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
	}

	if (!project) throw vertexError("google-vertex_project_missing");
	const host = location.toLowerCase() === "global"
		? "aiplatform.googleapis.com"
		: `${encodeURIComponent(location)}-aiplatform.googleapis.com`;
	return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
}

export async function resolveVertexAccessToken(rawKey: string, upstreamTiming?: ExecutorUpstreamTiming): Promise<string> {
	const value = rawKey.trim();
	if (!value) throw vertexError("google-vertex_access_token_missing");

	if (value.startsWith("{")) {
		try {
			const parsed = JSON.parse(value) as Record<string, unknown>;
			if (isVertexServiceAccount(parsed)) {
				return mintServiceAccountAccessToken(parsed, upstreamTiming);
			}
			const token = typeof parsed.access_token === "string" ? parsed.access_token.trim() : "";
			if (token) return token;
		} catch {
			// Continue with plain token handling.
		}
	}

	if (value.startsWith("Bearer ")) {
		return value.slice("Bearer ".length).trim();
	}
	return value;
}

export function resolveGoogleCloudStorageMediaUrl(rawUri: string): string | null {
	const trimmed = rawUri.trim();
	if (!trimmed) return null;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (!trimmed.startsWith("gs://")) return null;
	const withoutScheme = trimmed.slice("gs://".length);
	const firstSlash = withoutScheme.indexOf("/");
	if (firstSlash < 1 || firstSlash === withoutScheme.length - 1) return null;
	const bucket = withoutScheme.slice(0, firstSlash);
	const objectPath = withoutScheme.slice(firstSlash + 1);
	return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function isVertexServiceAccount(payload: Record<string, unknown>): payload is VertexServiceAccount {
	return (
		typeof payload.client_email === "string" &&
		typeof payload.private_key === "string"
	);
}

const VERTEX_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
/** Treat cached tokens as expired this long before Google's expires_in. */
const VERTEX_TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const VERTEX_TOKEN_CACHE_MAX_ENTRIES = 256;
/**
 * Concurrent requests share one in-flight mint. Bound the wait so a request
 * never hangs on another request's mint (Workers may cancel I/O when the
 * originating request ends); after this it mints its own token.
 */
const VERTEX_TOKEN_INFLIGHT_WAIT_MS = 5_000;

type CachedVertexToken = { accessToken: string; refreshAtMs: number };

// Isolate-local only: tokens are never written to KV, logs, or errors.
const vertexTokenCache = new Map<string, CachedVertexToken>();
const vertexTokenInflight = new Map<string, Promise<CachedVertexToken | null>>();

/** Test hook: drop cached and in-flight service-account tokens. */
export function clearVertexAccessTokenCache(): void {
	vertexTokenCache.clear();
	vertexTokenInflight.clear();
}

async function vertexTokenCacheKey(sa: VertexServiceAccount, tokenUri: string): Promise<string> {
	const material = JSON.stringify([sa.client_email, sa.private_key, tokenUri, VERTEX_OAUTH_SCOPE]);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rememberVertexToken(key: string, token: CachedVertexToken): void {
	vertexTokenCache.delete(key);
	vertexTokenCache.set(key, token);
	while (vertexTokenCache.size > VERTEX_TOKEN_CACHE_MAX_ENTRIES) {
		const oldest = vertexTokenCache.keys().next().value;
		if (oldest === undefined) break;
		vertexTokenCache.delete(oldest);
	}
}

async function waitForInflight<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<undefined>((resolve) => {
				timer = setTimeout(() => resolve(undefined), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function mintServiceAccountAccessToken(sa: VertexServiceAccount, upstreamTiming?: ExecutorUpstreamTiming): Promise<string> {
	const tokenUri = resolveGoogleOAuthTokenUri(sa.token_uri);
	const key = await vertexTokenCacheKey(sa, tokenUri);
	const cached = vertexTokenCache.get(key);
	if (cached && Date.now() < cached.refreshAtMs) return cached.accessToken;
	if (cached) vertexTokenCache.delete(key);

	const inflight = vertexTokenInflight.get(key);
	if (inflight) {
		// Errors are not shared: a failed mint is retried by each waiter.
		const shared = await waitForInflight(inflight.catch(() => null), VERTEX_TOKEN_INFLIGHT_WAIT_MS);
		if (shared && Date.now() < shared.refreshAtMs) return shared.accessToken;
		return (await requestServiceAccountAccessToken(sa, tokenUri, upstreamTiming)).accessToken;
	}

	const minted = requestServiceAccountAccessToken(sa, tokenUri, upstreamTiming);
	const tracked = minted.then(
		(token) => {
			if (token.refreshAtMs > Date.now()) rememberVertexToken(key, token);
			return token;
		},
	).finally(() => {
		if (vertexTokenInflight.get(key) === tracked) vertexTokenInflight.delete(key);
	});
	vertexTokenInflight.set(key, tracked);
	return (await tracked).accessToken;
}

async function requestServiceAccountAccessToken(
	sa: VertexServiceAccount,
	tokenUri: string,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<CachedVertexToken> {
	const requestedAtMs = Date.now();
	const now = Math.floor(requestedAtMs / 1000);
	const header = { alg: "RS256", typ: "JWT" };
	const claimSet = {
		iss: sa.client_email,
		sub: sa.client_email,
		aud: tokenUri,
		scope: VERTEX_OAUTH_SCOPE,
		iat: now,
		exp: now + 3600,
	};

	const encodedHeader = base64UrlEncodeUtf8(JSON.stringify(header));
	const encodedClaims = base64UrlEncodeUtf8(JSON.stringify(claimSet));
	const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
	const signature = await signJwtRs256(unsignedJwt, sa.private_key);
	const assertion = `${unsignedJwt}.${signature}`;

	const body = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion,
	});

	const init = googleOAuthTokenRequestInit(body);
	const res = await (upstreamTiming ? upstreamTiming.fetch(tokenUri, init, "auth") : fetch(tokenUri, init));

	if (!res.ok) {
		throw vertexError(`google-vertex_oauth_error_${res.status}`);
	}
	const json = await res.json() as { access_token?: string; expires_in?: unknown };
	if (!json?.access_token) {
		throw vertexError("google-vertex_oauth_access_token_missing");
	}
	// Measure the lifetime from when the token was requested; a missing or
	// invalid expires_in leaves refreshAtMs in the past, i.e. not cached.
	const expiresInSeconds = Number(json.expires_in);
	const refreshAtMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
		? requestedAtMs + expiresInSeconds * 1000 - VERTEX_TOKEN_REFRESH_MARGIN_MS
		: 0;
	return { accessToken: json.access_token, refreshAtMs };
}

async function signJwtRs256(unsignedJwt: string, privateKeyPem: string): Promise<string> {
	const pem = privateKeyPem.replace(/\\n/g, "\n");
	const keyData = pemToArrayBuffer(pem);
	const key = await crypto.subtle.importKey(
		"pkcs8",
		keyData,
		{
			name: "RSASSA-PKCS1-v1_5",
			hash: "SHA-256",
		},
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		new TextEncoder().encode(unsignedJwt),
	);
	return base64UrlEncodeBytes(new Uint8Array(signature));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
	const base64 = pem
		.replace(/-----BEGIN PRIVATE KEY-----/g, "")
		.replace(/-----END PRIVATE KEY-----/g, "")
		.replace(/\s+/g, "");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function base64UrlEncodeUtf8(value: string): string {
	return base64UrlFromBase64(btoa(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return base64UrlFromBase64(btoa(binary));
}

function base64UrlFromBase64(value: string): string {
	return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
