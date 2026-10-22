// OAuth client steps for connecting a remote MCP server, following the MCP
// authorization spec: find the server's protected resource metadata (RFC 9728),
// its authorization server metadata (RFC 8414 or OpenID discovery), register
// Phaseo as a client (a client ID metadata document where supported, otherwise
// dynamic registration, RFC 7591), then authorization code with PKCE (S256)
// and a resource indicator (RFC 8707). Refresh and revocation (RFC 7009) too.
//
// Every request goes through the fetch the caller passes in, which must be
// the SSRF-guarded safeFetch: all of these URLs come from servers we don't run.
//
// The web API runs the sign-in and the gateway refreshes tokens, from generated
// copies (scripts/sync-mcp-connections.mjs). Keep it dependency-free.

export type OAuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class McpOAuthError extends Error {
	readonly code: string;
	constructor(code: string, message?: string) {
		super(message ?? code);
		this.name = "McpOAuthError";
		this.code = code;
	}
}

export type AuthorizationServerMetadata = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	revocation_endpoint?: string;
	scopes_supported?: string[];
	code_challenge_methods_supported?: string[];
	token_endpoint_auth_methods_supported?: string[];
	client_id_metadata_document_supported?: boolean;
	authorization_response_iss_parameter_supported?: boolean;
};

export type McpServerProbe =
	| { kind: "open" }
	| {
		kind: "oauth";
		/** The resource indicator to request tokens for. */
		resource: string;
		scopes: string[];
		authServer: AuthorizationServerMetadata;
	};

export type ClientRegistration = {
	kind: "cimd" | "dcr";
	clientId: string;
	clientSecret: string | null;
	tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
};

export type TokenSet = {
	accessToken: string;
	refreshToken: string | null;
	/** ISO time, or null when the server gave no lifetime. */
	expiresAt: string | null;
	scopes: string[];
};

const MCP_PROTOCOL_VERSION = "2025-06-18";
const JSON_HEADERS = { accept: "application/json" };

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function httpsUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		// Keep the server's own spelling: issuers are compared as exact strings (RFC 8414).
		return new URL(value).protocol === "https:" ? value.trim() : null;
	} catch {
		return null;
	}
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
	if (!response.ok) {
		await response.body?.cancel().catch(() => undefined);
		return null;
	}
	return asRecord(await response.json().catch(() => null));
}

/** Parses `Bearer resource_metadata="…", scope="…"` from a WWW-Authenticate header. */
export function parseBearerChallenge(header: string | null): { resourceMetadata: string | null; scope: string | null } {
	const out = { resourceMetadata: null as string | null, scope: null as string | null };
	if (!header || !/^\s*bearer\b/i.test(header)) return out;
	for (const match of header.matchAll(/([a-z_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/gi)) {
		const name = match[1]?.toLowerCase();
		const value = (match[2] ?? match[3] ?? "").replace(/\\(.)/g, "$1");
		if (name === "resource_metadata") out.resourceMetadata = value;
		if (name === "scope") out.scope = value;
	}
	return out;
}

function wellKnownUrls(base: string, suffix: string): string[] {
	const url = new URL(base);
	const path = url.pathname.replace(/\/+$/, "");
	const urls = [`${url.origin}/.well-known/${suffix}${path}`];
	if (path) urls.push(`${url.origin}/.well-known/${suffix}`);
	return urls;
}

async function firstJson(fetch: OAuthFetch, urls: string[]): Promise<Record<string, unknown> | null> {
	for (const url of urls) {
		const body = await readJson(await fetch(url, { headers: JSON_HEADERS }));
		if (body) return body;
	}
	return null;
}

/** RFC 8414 first, then OpenID discovery, in the order the MCP spec gives. */
export async function discoverAuthorizationServer(fetch: OAuthFetch, issuer: string): Promise<AuthorizationServerMetadata> {
	const url = new URL(issuer);
	const path = url.pathname.replace(/\/+$/, "");
	const candidates = path
		? [
			`${url.origin}/.well-known/oauth-authorization-server${path}`,
			`${url.origin}/.well-known/openid-configuration${path}`,
			`${url.origin}${path}/.well-known/openid-configuration`,
		]
		: [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
	const body = await firstJson(fetch, candidates);
	if (!body) throw new McpOAuthError("authorization_server_metadata_not_found");
	const metadata = {
		issuer: httpsUrl(body.issuer),
		authorization_endpoint: httpsUrl(body.authorization_endpoint),
		token_endpoint: httpsUrl(body.token_endpoint),
	};
	if (!metadata.issuer || !metadata.authorization_endpoint || !metadata.token_endpoint) {
		throw new McpOAuthError("authorization_server_metadata_invalid");
	}
	// RFC 8414 section 3.3: the document must be for the issuer we asked about.
	if (metadata.issuer.replace(/\/+$/, "") !== issuer.replace(/\/+$/, "")) {
		throw new McpOAuthError("authorization_server_issuer_mismatch");
	}
	const challengeMethods = stringArray(body.code_challenge_methods_supported);
	if (!challengeMethods.includes("S256")) throw new McpOAuthError("authorization_server_pkce_unsupported");
	return {
		issuer: metadata.issuer,
		authorization_endpoint: metadata.authorization_endpoint,
		token_endpoint: metadata.token_endpoint,
		registration_endpoint: httpsUrl(body.registration_endpoint) ?? undefined,
		revocation_endpoint: httpsUrl(body.revocation_endpoint) ?? undefined,
		scopes_supported: stringArray(body.scopes_supported),
		code_challenge_methods_supported: challengeMethods,
		token_endpoint_auth_methods_supported: stringArray(body.token_endpoint_auth_methods_supported),
		client_id_metadata_document_supported: body.client_id_metadata_document_supported === true,
		authorization_response_iss_parameter_supported: body.authorization_response_iss_parameter_supported === true,
	};
}

/**
 * Asks the server whether it needs sign-in. An initialize call that succeeds
 * means it is open; a 401 (or published resource metadata) means OAuth.
 */
export async function probeMcpServer(fetch: OAuthFetch, serverUrl: string): Promise<McpServerProbe> {
	const response = await fetch(serverUrl, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": MCP_PROTOCOL_VERSION },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Phaseo", version: "1.0.0" } },
		}),
	});
	await response.body?.cancel().catch(() => undefined);
	const challenge = parseBearerChallenge(response.headers.get("www-authenticate"));
	if (response.ok && !challenge.resourceMetadata) return { kind: "open" };

	const metadataUrl = httpsUrl(challenge.resourceMetadata);
	const resourceMetadata = metadataUrl
		? await readJson(await fetch(metadataUrl, { headers: JSON_HEADERS }))
		: await firstJson(fetch, wellKnownUrls(serverUrl, "oauth-protected-resource"));
	if (!resourceMetadata && response.status !== 401) throw new McpOAuthError("server_unreachable", `The server answered ${response.status}.`);

	const server = new URL(serverUrl);
	let resource = serverUrl;
	let issuer = server.origin;
	let scopes = challenge.scope ? challenge.scope.split(/\s+/).filter(Boolean) : [];
	if (resourceMetadata) {
		const declared = httpsUrl(resourceMetadata.resource);
		// RFC 9728 section 3.3: metadata for some other resource must not be used.
		if (!declared || new URL(declared).origin !== server.origin) throw new McpOAuthError("resource_metadata_mismatch");
		resource = declared;
		const servers = stringArray(resourceMetadata.authorization_servers).map(httpsUrl).filter((item): item is string => item !== null);
		if (!servers[0]) throw new McpOAuthError("authorization_server_missing");
		issuer = servers[0];
		if (scopes.length === 0) scopes = stringArray(resourceMetadata.scopes_supported);
	}
	const authServer = await discoverAuthorizationServer(fetch, issuer);
	return { kind: "oauth", resource, scopes, authServer };
}

/** Dynamic client registration (RFC 7591) as a public client. */
export async function registerClient(fetch: OAuthFetch, authServer: AuthorizationServerMetadata, client: {
	redirectUri: string;
	clientName: string;
	clientUri: string;
	logoUri?: string;
}): Promise<ClientRegistration> {
	if (!authServer.registration_endpoint) throw new McpOAuthError("registration_unsupported");
	const response = await fetch(authServer.registration_endpoint, {
		method: "POST",
		headers: { "content-type": "application/json", ...JSON_HEADERS },
		body: JSON.stringify({
			client_name: client.clientName,
			client_uri: client.clientUri,
			...(client.logoUri ? { logo_uri: client.logoUri } : {}),
			redirect_uris: [client.redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	});
	const body = await readJson(response);
	const clientId = typeof body?.client_id === "string" ? body.client_id : null;
	if (!clientId) throw new McpOAuthError("registration_failed", `Registration answered ${response.status}.`);
	const secret = typeof body?.client_secret === "string" && body.client_secret ? body.client_secret : null;
	const method = body?.token_endpoint_auth_method;
	return {
		kind: "dcr",
		clientId,
		clientSecret: secret,
		tokenEndpointAuthMethod: !secret ? "none" : method === "client_secret_post" ? "client_secret_post" : "client_secret_basic",
	};
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomUrlToken(bytes = 32): string {
	return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
	return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export async function buildAuthorizationUrl(args: {
	authServer: AuthorizationServerMetadata;
	clientId: string;
	redirectUri: string;
	resource: string;
	scopes: string[];
	state: string;
	codeVerifier: string;
}): Promise<string> {
	const url = new URL(args.authServer.authorization_endpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", args.clientId);
	url.searchParams.set("redirect_uri", args.redirectUri);
	url.searchParams.set("code_challenge", await pkceChallenge(args.codeVerifier));
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", args.state);
	url.searchParams.set("resource", args.resource);
	if (args.scopes.length) url.searchParams.set("scope", args.scopes.join(" "));
	return url.toString();
}

/** RFC 9207: when the server sends (or promises) an iss parameter, it must be the issuer we started with. */
export function checkAuthorizationResponseIssuer(authServer: Pick<AuthorizationServerMetadata, "issuer" | "authorization_response_iss_parameter_supported">, iss: string | null): void {
	if (iss === null) {
		if (authServer.authorization_response_iss_parameter_supported) throw new McpOAuthError("authorization_issuer_missing");
		return;
	}
	if (iss.replace(/\/+$/, "") !== authServer.issuer.replace(/\/+$/, "")) throw new McpOAuthError("authorization_issuer_mismatch");
}

export type TokenClient = {
	tokenEndpoint: string;
	clientId: string;
	clientSecret: string | null;
	tokenEndpointAuthMethod: ClientRegistration["tokenEndpointAuthMethod"];
};

async function tokenRequest(fetch: OAuthFetch, client: TokenClient, params: Record<string, string>): Promise<TokenSet> {
	const body = new URLSearchParams(params);
	const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", ...JSON_HEADERS };
	if (client.clientSecret && client.tokenEndpointAuthMethod === "client_secret_basic") {
		headers.authorization = `Basic ${btoa(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`)}`;
	} else {
		body.set("client_id", client.clientId);
		if (client.clientSecret) body.set("client_secret", client.clientSecret);
	}
	const response = await fetch(client.tokenEndpoint, { method: "POST", headers, body: body.toString() });
	const payload = asRecord(await response.json().catch(() => null));
	if (!response.ok) {
		const error = typeof payload?.error === "string" ? payload.error : `http_${response.status}`;
		throw new McpOAuthError(error === "invalid_grant" ? "invalid_grant" : "token_request_failed", error);
	}
	const accessToken = typeof payload?.access_token === "string" ? payload.access_token : null;
	if (!accessToken) throw new McpOAuthError("token_response_invalid");
	const tokenType = typeof payload?.token_type === "string" ? payload.token_type.toLowerCase() : "bearer";
	if (tokenType !== "bearer") throw new McpOAuthError("token_type_unsupported");
	const expiresIn = typeof payload?.expires_in === "number" ? payload.expires_in : Number(payload?.expires_in);
	return {
		accessToken,
		refreshToken: typeof payload?.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : null,
		expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
		scopes: typeof payload?.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [],
	};
}

export function exchangeAuthorizationCode(fetch: OAuthFetch, client: TokenClient, args: {
	code: string;
	codeVerifier: string;
	redirectUri: string;
	resource: string;
}): Promise<TokenSet> {
	return tokenRequest(fetch, client, {
		grant_type: "authorization_code",
		code: args.code,
		code_verifier: args.codeVerifier,
		redirect_uri: args.redirectUri,
		resource: args.resource,
	});
}

/** Throws McpOAuthError("invalid_grant") when the person must sign in again. */
export async function refreshAccessToken(fetch: OAuthFetch, client: TokenClient, args: {
	refreshToken: string;
	resource: string;
}): Promise<TokenSet> {
	const tokens = await tokenRequest(fetch, client, {
		grant_type: "refresh_token",
		refresh_token: args.refreshToken,
		resource: args.resource,
	});
	// Servers that don't rotate refresh tokens leave the old one valid.
	return { ...tokens, refreshToken: tokens.refreshToken ?? args.refreshToken };
}

/** Best effort: RFC 7009 revocation. Returns false when the server has no endpoint or refuses. */
export async function revokeToken(fetch: OAuthFetch, client: Omit<TokenClient, "tokenEndpoint"> & { revocationEndpoint?: string | null }, token: string, hint: "access_token" | "refresh_token"): Promise<boolean> {
	if (!client.revocationEndpoint) return false;
	const body = new URLSearchParams({ token, token_type_hint: hint });
	const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
	if (client.clientSecret && client.tokenEndpointAuthMethod === "client_secret_basic") {
		headers.authorization = `Basic ${btoa(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`)}`;
	} else {
		body.set("client_id", client.clientId);
		if (client.clientSecret) body.set("client_secret", client.clientSecret);
	}
	const response = await fetch(client.revocationEndpoint, { method: "POST", headers, body: body.toString() }).catch(() => null);
	await response?.body?.cancel().catch(() => undefined);
	return Boolean(response?.ok);
}
