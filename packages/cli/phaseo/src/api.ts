import { readSession, writeSession, type Session } from "./session.js";
import {
	DEFAULT_CLI_OAUTH_CAPABILITIES,
	normalizeScopeList,
} from "./capabilities.js";

export const DEFAULT_API_URL = "https://api.phaseo.app";
export const DEFAULT_LOGIN_SCOPES = DEFAULT_CLI_OAUTH_CAPABILITIES;

export const DEFAULT_SCOPE = DEFAULT_LOGIN_SCOPES.join(" ");

export function parseScopeArgument(raw?: string): string {
	const normalized = normalizeScopeList(raw, {
		allowIdentityScopes: true,
		defaultScopes: DEFAULT_LOGIN_SCOPES,
	});
	if (!normalized.ok) {
		throw new Error("message" in normalized ? normalized.message : "Invalid scopes");
	}
	return normalized.value.join(" ");
}

export function normalizeApiRoot(input?: string): string {
	const raw = input || process.env.PHASEO_API_URL || DEFAULT_API_URL;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("Phaseo API URL must be a valid absolute URL");
	}
	const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]" || url.hostname === "localhost";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new Error("Phaseo API URL must use HTTPS (HTTP is only allowed for loopback development)");
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error("Phaseo API URL must not contain credentials, a query string, or a fragment");
	}
	return url.toString().replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function v1Url(apiRoot: string, path: string): string {
	return `${apiRoot}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

export function oauthUrl(apiRoot: string, path: string): string {
	return `${apiRoot}/oauth${path.startsWith("/") ? path : `/${path}`}`;
}

export function authorizeUrl(apiRoot: string, params: {
	clientId: string;
	redirectUri: string;
	scope: string;
	state: string;
	codeChallenge: string;
	codeChallengeMethod?: string;
}): string {
	const url = new URL(oauthUrl(apiRoot, "/authorize"));
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("scope", params.scope);
	url.searchParams.set("state", params.state);
	url.searchParams.set("code_challenge", params.codeChallenge);
	url.searchParams.set("code_challenge_method", params.codeChallengeMethod ?? "S256");
	return url.toString();
}

async function parseJson(response: Response): Promise<any> {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function requireRefreshableCliTokens(body: any): {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope?: string;
} {
	if (
		typeof body?.access_token !== "string" ||
		!body.access_token ||
		typeof body?.refresh_token !== "string" ||
		!body.refresh_token ||
		typeof body?.expires_in !== "number" ||
		!Number.isFinite(body.expires_in) ||
		body.expires_in <= 0
	) {
		throw new Error("Phaseo OAuth did not return a refreshable CLI session");
	}
	return {
		access_token: body.access_token,
		refresh_token: body.refresh_token,
		expires_in: body.expires_in,
		scope: typeof body.scope === "string" ? body.scope : undefined,
	};
}

export async function apiFetch(apiRoot: string, path: string, init: RequestInit & { accessToken?: string } = {}) {
	const headers = new Headers(init.headers);
	if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
	if (init.accessToken) headers.set("authorization", `Bearer ${init.accessToken}`);
	const response = await fetch(v1Url(apiRoot, path), { ...init, headers });
	const body = await parseJson(response);
	if (!response.ok) {
		const message = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : response.statusText;
		throw new Error(message);
	}
	return body;
}

export async function refreshSession(session: Session): Promise<Session> {
	const response = await fetch(oauthUrl(session.apiUrl, "/token"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: "refresh_token",
			client_id: "phaseo_cli",
			refresh_token: session.refreshToken,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		throw new Error(typeof body?.error_description === "string" ? body.error_description : "Failed to refresh Phaseo session");
	}
	const tokens = requireRefreshableCliTokens(body);
	const next: Session = {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + tokens.expires_in * 1000,
		apiUrl: session.apiUrl,
		scope: tokens.scope,
	};
	await writeSession(next);
	return next;
}

export async function getSessionAccessToken(): Promise<Session> {
	const session = await readSession();
	if (!session) throw new Error("Not logged in. Run `phaseo login` first.");
	if (session.expiresAt - Date.now() < 60_000) {
		return refreshSession(session);
	}
	return session;
}

export async function startDeviceLogin(apiRoot: string, scope = DEFAULT_SCOPE) {
	const response = await fetch(oauthUrl(apiRoot, "/device/code"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_id: "phaseo_cli",
			scope,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		throw new Error(typeof body?.error_description === "string" ? body.error_description : "Failed to start device login");
	}
	return body as {
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};
}

export async function pollDeviceToken(apiRoot: string, deviceCode: string) {
	const response = await fetch(oauthUrl(apiRoot, "/token"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			client_id: "phaseo_cli",
			device_code: deviceCode,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		const code = typeof body?.error === "string" ? body.error : "token_error";
		const description = typeof body?.error_description === "string" ? body.error_description : code;
		const error = new Error(description) as Error & { code?: string };
		error.code = code;
		throw error;
	}
	return requireRefreshableCliTokens(body);
}

export async function revokeRefreshToken(apiRoot: string, refreshToken: string): Promise<void> {
	const response = await fetch(oauthUrl(apiRoot, "/revoke"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token: refreshToken }),
	});
	if (!response.ok) {
		const body = await parseJson(response);
		const description =
			typeof body?.error_description === "string"
				? body.error_description
				: typeof body?.message === "string"
					? body.message
					: `OAuth token revocation failed with HTTP ${response.status}`;
		throw new Error(description);
	}
}

export async function exchangeAuthorizationCode(apiRoot: string, args: {
	code: string;
	redirectUri: string;
	codeVerifier: string;
	clientId?: string;
	clientSecret?: string;
}): Promise<{
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope?: string;
}> {
	const response = await fetch(oauthUrl(apiRoot, "/token"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			client_id: args.clientId ?? "phaseo_cli",
			client_secret: args.clientSecret,
			code: args.code,
			redirect_uri: args.redirectUri,
			code_verifier: args.codeVerifier,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		throw new Error(typeof body?.error_description === "string" ? body.error_description : "Failed to exchange authorization code");
	}
	return requireRefreshableCliTokens(body);
}
