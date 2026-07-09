import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { DEFAULT_CLI_OAUTH_CAPABILITIES, parseStoredScopeList } from "@/lib/authz/capabilities";
import { timingSafeEqual } from "@/routes/auth.helpers";
import { validateOAuthToken, type JWTClaims } from "./jwt";

const encoder = new TextEncoder();
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEVICE_CODE_TTL_SECONDS = 10 * 60;
const AUTH_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_DEVICE_INTERVAL_SECONDS = 5;
const DEFAULT_WEB_BASE_URL = "https://phaseo.app";
const DEFAULT_API_BASE_URL = "https://api.phaseo.ai";
const ACCESS_TOKEN_AUDIENCE = "phaseo-api";
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

export const CLI_CLIENT_ID = "phaseo_cli";
export const LEGACY_CLI_CLIENT_ID = "aistats_cli";
const CLI_CLIENT_IDS = new Set([CLI_CLIENT_ID, LEGACY_CLI_CLIENT_ID]);

export const CLI_DEFAULT_SCOPES = DEFAULT_CLI_OAUTH_CAPABILITIES;

type OAuthClient = {
	id: string;
	name: string;
	description?: string | null;
	logo_url?: string | null;
	homepage_url?: string | null;
	client_type: "public" | "confidential";
	client_secret_hash?: string | null;
	redirect_uris: string[];
	allowed_scopes: string[];
	is_first_party: boolean;
	beta_status: "private" | "beta" | "public";
	status: string;
};

export type OAuthActor = {
	userId: string;
	email?: string | null;
	name?: string | null;
};

type TokenIssueInput = {
	userId: string;
	workspaceId: string;
	clientId: string;
	scopes: string[];
	email?: string | null;
	name?: string | null;
};

let ephemeralSigningKey:
	| {
			privateKey: CryptoKey;
			publicJwk: JsonWebKey;
			kid: string;
	  }
	| null = null;

function base64UrlEncodeBytes(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value: string): string {
	return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeBytes(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function randomBase64Url(byteLength: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	return base64UrlEncodeBytes(bytes);
}

export function getApiBaseUrl(): string {
	const bindings = getBindings();
	return String(bindings.GATEWAY_PUBLIC_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export function getWebBaseUrl(): string {
	const bindings = getBindings();
	return String(bindings.PHASEO_WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
}

export function getIssuer(): string {
	return `${getApiBaseUrl()}/oauth`;
}

export function isThirdPartyOAuthEnabled(): boolean {
	const bindings = getBindings();
	const raw = bindings.PHASEO_THIRD_PARTY_OAUTH_ENABLED;
	if (typeof raw === "boolean") return raw;
	return TRUTHY_VALUES.has(String(raw ?? "").trim().toLowerCase());
}

export function isOAuthClientUsable(clientId: string): boolean {
	return CLI_CLIENT_IDS.has(clientId.trim()) || isThirdPartyOAuthEnabled();
}

export function normalizeScopes(raw: unknown, fallback: readonly string[] = []): string[] {
	const input = Array.isArray(raw)
		? raw
		: typeof raw === "string"
			? raw.split(/[,\s]+/)
			: fallback;
	return Array.from(
		new Set(
			input
				.map((scope) => String(scope).trim())
				.filter(Boolean),
		),
	);
}

export function parseTokenRequestBody(raw: string, contentType: string | null): Record<string, unknown> {
	if (contentType?.toLowerCase().includes("application/json")) {
		return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
	}
	const params = new URLSearchParams(raw);
	const out: Record<string, string> = {};
	for (const [key, value] of params.entries()) out[key] = value;
	return out;
}

async function sha256Base64Url(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return base64UrlEncodeBytes(new Uint8Array(digest));
}

export async function hashOAuthSecret(value: string): Promise<string> {
	const bindings = getBindings();
	const pepper = String(
		bindings.PHASEO_OAUTH_TOKEN_PEPPER ??
			bindings.KEY_PEPPER_ACTIVE ??
			bindings.KEY_PEPPER ??
			"",
	);
	return sha256Base64Url(`${pepper}:${value}`);
}

export async function verifyClientSecret(
	client: Pick<OAuthClient, "client_type" | "client_secret_hash">,
	providedSecret: string | null | undefined,
): Promise<boolean> {
	if (client.client_type !== "confidential") return true;
	const normalizedSecret = String(providedSecret ?? "").trim();
	if (!normalizedSecret || !client.client_secret_hash) return false;
	return timingSafeEqual(await hashOAuthSecret(normalizedSecret), client.client_secret_hash);
}

export function createUserCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let out = "";
	const maxUnbiasedByte = Math.floor(256 / alphabet.length) * alphabet.length;
	while (out.length < 8) {
		const chunk = crypto.getRandomValues(new Uint8Array(8));
		for (const byte of chunk) {
			if (byte >= maxUnbiasedByte) continue;
			out += alphabet[byte % alphabet.length];
			if (out.length === 8) break;
		}
	}
	return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizeUserCode(value: string): string {
	return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.+)$/, "$1-$2");
}

async function importPrivateJwk(jwk: JsonWebKey): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"jwk",
		jwk,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
}

function publicJwkFromPrivate(jwk: JsonWebKey): JsonWebKey {
	const { d, p, q, dp, dq, qi, oth, key_ops, ...publicJwk } = jwk as any;
	return {
		...publicJwk,
		kid: (jwk as any).kid ?? "phaseo-oauth-v1",
		alg: "RS256",
		use: "sig",
		key_ops: ["verify"],
	} as JsonWebKey;
}

async function getSigningMaterial() {
	const bindings = getBindings();
	const rawJwk = String(bindings.PHASEO_OAUTH_PRIVATE_JWK ?? "").trim();
	if (rawJwk) {
		const jwk = JSON.parse(rawJwk) as JsonWebKey;
		return {
			privateKey: await importPrivateJwk(jwk),
			publicJwk: publicJwkFromPrivate(jwk),
			kid: String((jwk as any).kid ?? "phaseo-oauth-v1"),
		};
	}

	if (String(bindings.NODE_ENV ?? "").toLowerCase() === "production") {
		throw new Error("PHASEO_OAUTH_PRIVATE_JWK is required for OAuth token signing");
	}

	if (!ephemeralSigningKey) {
		const keyPair = await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["sign", "verify"],
		);
		const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
		ephemeralSigningKey = {
			privateKey: keyPair.privateKey,
			publicJwk: {
				...publicJwk,
				kid: "phaseo-oauth-dev",
				alg: "RS256",
				use: "sig",
				key_ops: ["verify"],
			} as JsonWebKey,
			kid: "phaseo-oauth-dev",
		};
	}

	return ephemeralSigningKey;
}

export async function getLocalJwks(): Promise<{ keys: JsonWebKey[] }> {
	const material = await getSigningMaterial();
	return { keys: [material.publicJwk] };
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
	const material = await getSigningMaterial();
	const header = {
		alg: "RS256",
		typ: "JWT",
		kid: material.kid,
	};
	const encodedHeader = base64UrlEncodeText(JSON.stringify(header));
	const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
	const signingInput = `${encodedHeader}.${encodedPayload}`;
	const signature = await crypto.subtle.sign(
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		material.privateKey,
		encoder.encode(signingInput),
	);
	return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

export async function validateLocalAccessToken(token: string) {
	const jwks = await getLocalJwks();
	return validateOAuthToken(token, jwks.keys, getIssuer(), ACCESS_TOKEN_AUDIENCE);
}

async function fetchUserProfile(userId: string): Promise<{ email?: string | null; name?: string | null }> {
	const supabase = getSupabaseAdmin();
	const { data } = await supabase.auth.admin.getUserById(userId);
	const user = data?.user;
	const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
	return {
		email: user?.email ?? null,
		name:
			typeof metadata.full_name === "string"
				? metadata.full_name
				: typeof metadata.name === "string"
					? metadata.name
					: null,
	};
}

export async function getSupabaseActor(accessToken: string): Promise<OAuthActor | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase.auth.getUser(accessToken);
	if (error || !data?.user?.id) return null;
	const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
	return {
		userId: data.user.id,
		email: data.user.email ?? null,
		name:
			typeof metadata.full_name === "string"
				? metadata.full_name
				: typeof metadata.name === "string"
					? metadata.name
					: null,
	};
}

export async function loadOAuthClient(clientId: string): Promise<OAuthClient | null> {
	const supabase = getSupabaseAdmin();
	const id = clientId.trim();
	if (!id) return null;
	if (!isOAuthClientUsable(id)) return null;

	let firstParty = await supabase
		.from("oauth_clients")
		.select("id, name, description, logo_url, homepage_url, client_type, client_secret_hash, redirect_uris, allowed_scopes, is_first_party, beta_status, status")
		.eq("id", id)
		.eq("status", "active")
		.maybeSingle();
	if ((firstParty.error || !firstParty.data) && id === LEGACY_CLI_CLIENT_ID) {
		firstParty = await supabase
			.from("oauth_clients")
			.select("id, name, description, logo_url, homepage_url, client_type, client_secret_hash, redirect_uris, allowed_scopes, is_first_party, beta_status, status")
			.eq("id", CLI_CLIENT_ID)
			.eq("status", "active")
			.maybeSingle();
	}
	if (!firstParty.error && firstParty.data) {
		const row = firstParty.data as any;
		return {
			id: id === LEGACY_CLI_CLIENT_ID ? LEGACY_CLI_CLIENT_ID : row.id,
			name: row.name,
			description: row.description ?? null,
			logo_url: row.logo_url ?? null,
			homepage_url: row.homepage_url ?? null,
			client_type: row.client_type ?? "public",
			client_secret_hash: row.client_secret_hash ?? null,
			redirect_uris: Array.isArray(row.redirect_uris) ? row.redirect_uris : [],
			allowed_scopes: Array.isArray(row.allowed_scopes) ? row.allowed_scopes : [],
			is_first_party: Boolean(row.is_first_party),
			beta_status: row.beta_status ?? "private",
			status: row.status ?? "active",
		};
	}

	let metadata = await supabase
		.from("oauth_app_metadata")
		.select("client_id, name, description, logo_url, homepage_url, client_type, client_secret_hash, redirect_uris, allowed_scopes, is_first_party, beta_status, status")
		.eq("client_id", id)
		.eq("status", "active")
		.maybeSingle();
	if ((metadata.error || !metadata.data) && id === LEGACY_CLI_CLIENT_ID) {
		metadata = await supabase
			.from("oauth_app_metadata")
			.select("client_id, name, description, logo_url, homepage_url, client_type, client_secret_hash, redirect_uris, allowed_scopes, is_first_party, beta_status, status")
			.eq("client_id", CLI_CLIENT_ID)
			.eq("status", "active")
			.maybeSingle();
	}
	if (metadata.error || !metadata.data) return null;
	const row = metadata.data as any;
	return {
		id: id === LEGACY_CLI_CLIENT_ID ? LEGACY_CLI_CLIENT_ID : row.client_id,
		name: row.name,
		description: row.description ?? null,
		logo_url: row.logo_url ?? null,
		homepage_url: row.homepage_url ?? null,
		client_type: row.client_type ?? "public",
		client_secret_hash: row.client_secret_hash ?? null,
		redirect_uris: Array.isArray(row.redirect_uris) ? row.redirect_uris : [],
		allowed_scopes: Array.isArray(row.allowed_scopes) ? row.allowed_scopes : [],
		is_first_party: Boolean(row.is_first_party),
		beta_status: row.beta_status ?? "beta",
		status: row.status ?? "active",
	};
}

export function filterAllowedScopes(client: OAuthClient, requested: string[]): string[] {
	const allowed = new Set(parseStoredScopeList(client.allowed_scopes));
	return requested.filter((scope) => allowed.has(scope));
}

function isCliLoopbackRedirectUri(client: OAuthClient, redirectUri: string): boolean {
	if (!CLI_CLIENT_IDS.has(client.id)) return false;
	try {
		const url = new URL(redirectUri);
		return (
			url.protocol === "http:" &&
			(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") &&
			url.pathname === "/callback"
		);
	} catch {
		return false;
	}
}

export function assertRedirectAllowed(client: OAuthClient, redirectUri: string): boolean {
	return client.redirect_uris.some((uri) => uri === redirectUri) || isCliLoopbackRedirectUri(client, redirectUri);
}

export async function ensureGrant(args: {
	userId: string;
	workspaceId: string;
	clientId: string;
	scopes: string[];
}) {
	const supabase = getSupabaseAdmin();
	const existing = await supabase
		.from("oauth_authorizations")
		.select("id, revoked_at")
		.eq("user_id", args.userId)
		.eq("client_id", args.clientId)
		.eq("workspace_id", args.workspaceId)
		.maybeSingle();

	if (existing.data?.id) {
		await supabase
			.from("oauth_authorizations")
			.update({ scopes: args.scopes, revoked_at: null })
			.eq("id", existing.data.id);
		return;
	}

	await supabase.from("oauth_authorizations").insert({
		user_id: args.userId,
		client_id: args.clientId,
		workspace_id: args.workspaceId,
		scopes: args.scopes,
	});
}

export async function issueTokenPair(input: TokenIssueInput) {
	const profile =
		input.email || input.name
			? { email: input.email ?? null, name: input.name ?? null }
			: await fetchUserProfile(input.userId);
	const now = Math.floor(Date.now() / 1000);
	const accessToken = await signJwt({
		iss: getIssuer(),
		sub: input.userId,
		aud: ACCESS_TOKEN_AUDIENCE,
		exp: now + ACCESS_TOKEN_TTL_SECONDS,
		iat: now,
		jti: crypto.randomUUID(),
		user_id: input.userId,
		workspace_id: input.workspaceId,
		client_id: input.clientId,
		scope: input.scopes.join(" "),
		email: profile.email ?? undefined,
		name: profile.name ?? undefined,
	});

	const refreshToken = randomBase64Url(48);
	const refreshHash = await hashOAuthSecret(refreshToken);
	const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
	const supabase = getSupabaseAdmin();
	const { error: refreshInsertError } = await supabase.from("oauth_refresh_tokens").insert({
		token_hash: refreshHash,
		user_id: input.userId,
		workspace_id: input.workspaceId,
		client_id: input.clientId,
		scopes: input.scopes,
		expires_at: refreshExpiresAt,
	});
	if (refreshInsertError) {
		throw new Error(refreshInsertError.message || "Failed to persist OAuth refresh token");
	}

	return {
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: ACCESS_TOKEN_TTL_SECONDS,
		refresh_token: refreshToken,
		scope: input.scopes.join(" "),
	};
}

export async function rotateRefreshToken(
	refreshToken: string,
	clientAuth?: { clientId?: string; clientSecret?: string | null },
): Promise<
	| { ok: true; tokens: Awaited<ReturnType<typeof issueTokenPair>> }
	| { ok: false; reason: "invalid_client" | "invalid_grant" }
> {
	const tokenHash = await hashOAuthSecret(refreshToken);
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("oauth_refresh_tokens")
		.select("id, user_id, workspace_id, client_id, scopes, expires_at, revoked_at")
		.eq("token_hash", tokenHash)
		.maybeSingle();
	if (error || !data || data.revoked_at) return { ok: false, reason: "invalid_grant" };
	if (data.expires_at && Date.parse(String(data.expires_at)) <= Date.now()) {
		return { ok: false, reason: "invalid_grant" };
	}
	const clientId = String(data.client_id ?? "").trim();
	const client = await loadOAuthClient(clientId);
	if (!client) return { ok: false, reason: "invalid_grant" };
	if (clientAuth?.clientId && clientAuth.clientId !== clientId) {
		return { ok: false, reason: "invalid_client" };
	}
	if (client.client_type === "confidential") {
		if (!clientAuth?.clientId || clientAuth.clientId !== clientId) {
			return { ok: false, reason: "invalid_client" };
		}
		if (!(await verifyClientSecret(client, clientAuth.clientSecret))) {
			return { ok: false, reason: "invalid_client" };
		}
	}
	const authorization = await supabase
		.from("oauth_authorizations")
		.select("scopes, revoked_at")
		.eq("user_id", data.user_id)
		.eq("workspace_id", data.workspace_id)
		.eq("client_id", clientId)
		.maybeSingle();
	if (authorization.error || !authorization.data || authorization.data.revoked_at !== null) {
		return { ok: false, reason: "invalid_grant" };
	}

	const rotation = await supabase
		.from("oauth_refresh_tokens")
		.update({ revoked_at: new Date().toISOString(), last_used_at: new Date().toISOString() })
		.eq("id", data.id)
		.is("revoked_at", null)
		.select("id")
		.maybeSingle();
	if (rotation.error || !rotation.data) {
		return { ok: false, reason: "invalid_grant" };
	}

	return {
		ok: true,
		tokens: await issueTokenPair({
		userId: String(data.user_id),
		workspaceId: String(data.workspace_id),
		clientId,
		scopes: Array.isArray(authorization.data.scopes)
			? authorization.data.scopes.map(String)
			: Array.isArray(data.scopes)
				? data.scopes.map(String)
				: [],
		}),
	};
}

export async function ensureGrants(args: {
	userId: string;
	workspaceIds: string[];
	clientId: string;
	scopes: string[];
}) {
	const workspaceIds = Array.from(
		new Set(
			args.workspaceIds
				.map((workspaceId) => String(workspaceId ?? "").trim())
				.filter(Boolean),
		),
	);
	for (const workspaceId of workspaceIds) {
		await ensureGrant({
			userId: args.userId,
			workspaceId,
			clientId: args.clientId,
			scopes: args.scopes,
		});
	}
}

export async function revokeToken(token: string) {
	const tokenHash = await hashOAuthSecret(token);
	const supabase = getSupabaseAdmin();
	await supabase
		.from("oauth_refresh_tokens")
		.update({ revoked_at: new Date().toISOString() })
		.eq("token_hash", tokenHash)
		.is("revoked_at", null);
}

export function makeDeviceCodeExpiry(): string {
	return new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString();
}

export function makeAuthCodeExpiry(): string {
	return new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();
}

export function defaultDeviceIntervalSeconds(): number {
	return DEFAULT_DEVICE_INTERVAL_SECONDS;
}

export function deviceExpiresInSeconds(): number {
	return DEVICE_CODE_TTL_SECONDS;
}

export function createOpaqueCode(): string {
	return randomBase64Url(32);
}

export async function verifyPkce(args: { codeVerifier: string; codeChallenge: string; method: string }) {
	if (args.method !== "S256") return false;
	const expected = await sha256Base64Url(args.codeVerifier);
	return expected === args.codeChallenge;
}

export function bearerToken(req: Request): string | null {
	const header = req.headers.get("authorization") ?? "";
	if (!header.toLowerCase().startsWith("bearer ")) return null;
	return header.slice(7).trim() || null;
}

export function claimsScopes(claims: JWTClaims): string[] {
	return normalizeScopes(claims.scope ?? "");
}

export function hasScope(claims: JWTClaims, scope: string): boolean {
	return claimsScopes(claims).includes(scope);
}

export function verificationUriFor(userCode?: string): string {
	const base = `${getWebBaseUrl()}/activate`;
	if (!userCode) return base;
	const url = new URL(base);
	url.searchParams.set("user_code", userCode);
	return url.toString();
}

export function authorizationConsentUrl(params: URLSearchParams): string {
	const url = new URL(`${getWebBaseUrl()}/oauth/consent`);
	params.forEach((value, key) => url.searchParams.set(key, value));
	url.searchParams.set("phaseo_oauth", "1");
	return url.toString();
}

export function decodeBase64UrlJson<T>(value: string): T {
	return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(value))) as T;
}
