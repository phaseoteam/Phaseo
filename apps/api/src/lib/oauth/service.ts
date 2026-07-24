import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import {
	DEFAULT_CLI_OAUTH_CAPABILITIES,
	GATEWAY_ACCESS_SCOPE,
	parseStoredScopeList,
} from "@/lib/authz/capabilities";
import { resolveActiveKeyPepper, resolveKeyPepperCandidates } from "@/lib/security/keyPepper";
import { generateGatewayKey, hmacSecret, timingSafeEqual } from "@/routes/auth.helpers";
import { validateOAuthToken, type JWTClaims } from "./jwt";

const encoder = new TextEncoder();
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEVICE_CODE_TTL_SECONDS = 10 * 60;
const AUTH_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_DEVICE_INTERVAL_SECONDS = 5;
const DEFAULT_WEB_BASE_URL = "https://phaseo.app";
const DEFAULT_API_BASE_URL = "https://api.phaseo.app";
const ACCESS_TOKEN_AUDIENCE = "phaseo-api";
const MCP_UPSTREAM_TOKEN_TTL_SECONDS = 5 * 60;
const DELEGATED_ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

export const CLI_CLIENT_ID = "phaseo_cli";
export const LEGACY_CLI_CLIENT_ID = "aistats_cli";
const CLI_CLIENT_IDS = new Set([CLI_CLIENT_ID, LEGACY_CLI_CLIENT_ID]);

export function isFirstPartyCliClient(clientId: string): boolean {
	return CLI_CLIENT_IDS.has(clientId.trim());
}

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
	registration_source: "first_party" | "dynamic" | "developer";
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
	resource?: string | null;
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

export function getGatewayOAuthResource(): string {
	const baseUrl = getApiBaseUrl();
	return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function normalizeOAuthResource(value: string): string | null {
	try {
		const url = new URL(value);
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
		return url.toString();
	} catch {
		return null;
	}
}

export function isGatewayOAuthResource(resource: string | null | undefined): boolean {
	if (!resource) return false;
	return normalizeOAuthResource(resource) === normalizeOAuthResource(getGatewayOAuthResource());
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

// The older /auth exchange flow mints keys that predate delegated-key
// revocation metadata. Keep it independently disabled unless it is migrated.
export function isLegacyOAuthExchangeEnabled(): boolean {
	const bindings = getBindings();
	const raw = bindings.PHASEO_LEGACY_OAUTH_EXCHANGE_ENABLED;
	if (typeof raw === "boolean") return raw;
	return TRUTHY_VALUES.has(String(raw ?? "").trim().toLowerCase());
}

export function isOAuthClientUsable(clientId: string): boolean {
	return isFirstPartyCliClient(clientId) || isThirdPartyOAuthEnabled();
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

function resolveOAuthTokenPeppers(): string[] {
	const bindings = getBindings();
	const active = String(bindings.PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE ?? "").trim();
	if (!active) {
		throw new Error("PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE is not configured");
	}
	const previous = String(bindings.PHASEO_OAUTH_TOKEN_PEPPER_PREVIOUS ?? "").trim();
	return previous && previous !== active ? [active, previous] : [active];
}

export async function hashOAuthSecret(value: string): Promise<string> {
	const [active] = resolveOAuthTokenPeppers();
	return sha256Base64Url(`${active}:${value}`);
}

export async function hashOAuthSecretCandidates(value: string): Promise<string[]> {
	return Promise.all(resolveOAuthTokenPeppers().map((pepper) => sha256Base64Url(`${pepper}:${value}`)));
}

export async function hashOAuthClientSecret(value: string): Promise<string> {
	// OAuth client secrets are generated opaque values, not user-chosen passwords.
	// A peppered SHA-256 hash therefore retains the required secret-at-rest and
	// rotation properties without consuming a Worker CPU budget on every client
	// registration or token exchange. verifyClientSecret still accepts legacy
	// PBKDF2 records so this format change is backwards compatible.
	return hashOAuthSecret(value);
}

async function verifyPbkdf2OAuthClientSecret(value: string, stored: string): Promise<boolean> {
	const [, rawIterations, salt, expected] = stored.split("$");
	const iterations = Number(rawIterations);
	if (!Number.isSafeInteger(iterations) || iterations < 100_000 || !salt || !expected) return false;
	const key = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"]);
	const candidates = await Promise.all(resolveOAuthTokenPeppers().map(async (pepper) => {
		const bits = await crypto.subtle.deriveBits(
			{ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(`${pepper}:${salt}`), iterations },
			key,
			256,
		);
		return base64UrlEncodeBytes(new Uint8Array(bits));
	}));
	return candidates.some((candidate) => timingSafeEqual(candidate, expected));
}

export async function verifyClientSecret(
	client: Pick<OAuthClient, "client_type" | "client_secret_hash">,
	providedSecret: string | null | undefined,
): Promise<boolean> {
	if (client.client_type !== "confidential") return true;
	const normalizedSecret = String(providedSecret ?? "").trim();
	if (!normalizedSecret || !client.client_secret_hash) return false;
	if (client.client_secret_hash.startsWith("pbkdf2-sha256$")) {
		return verifyPbkdf2OAuthClientSecret(normalizedSecret, client.client_secret_hash);
	}
	const candidates = await hashOAuthSecretCandidates(normalizedSecret);
	return candidates.some((candidate) => timingSafeEqual(candidate, client.client_secret_hash as string));
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

export async function issueMcpUpstreamToken(input: TokenIssueInput) {
	const now = Math.floor(Date.now() / 1000);
	return {
		access_token: await signJwt({
			iss: getIssuer(),
			sub: input.userId,
			aud: ACCESS_TOKEN_AUDIENCE,
			exp: now + MCP_UPSTREAM_TOKEN_TTL_SECONDS,
			iat: now,
			jti: crypto.randomUUID(),
			user_id: input.userId,
			workspace_id: input.workspaceId,
			client_id: input.clientId,
			scope: input.scopes.join(" "),
		}),
		token_type: "Bearer" as const,
		expires_in: MCP_UPSTREAM_TOKEN_TTL_SECONDS,
		scope: input.scopes.join(" "),
	};
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
			registration_source: Boolean(row.is_first_party) ? "first_party" : "dynamic",
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
		registration_source: Boolean(row.is_first_party) ? "first_party" : "developer",
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
			(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]") &&
			url.pathname === "/callback" &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
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
	if (existing.error) {
		throw new Error(existing.error.message || "Failed to load OAuth authorization");
	}

	if (existing.data?.id) {
		const { error } = await supabase
			.from("oauth_authorizations")
			.update({ scopes: args.scopes, revoked_at: null })
			.eq("id", existing.data.id);
		if (error) throw new Error(error.message || "Failed to update OAuth authorization");
		return;
	}

	const { error } = await supabase.from("oauth_authorizations").insert({
		user_id: args.userId,
		client_id: args.clientId,
		workspace_id: args.workspaceId,
		scopes: args.scopes,
	});
	if (error) throw new Error(error.message || "Failed to create OAuth authorization");
}

export async function getActiveOAuthWorkspaceScopes(args: {
	userId: string;
	workspaceId: string;
	clientId: string;
}): Promise<string[] | null> {
	const supabase = getSupabaseAdmin();
	const [authorization, membership] = await Promise.all([
		supabase
			.from("oauth_authorizations")
			.select("scopes, revoked_at")
			.eq("user_id", args.userId)
			.eq("workspace_id", args.workspaceId)
			.eq("client_id", args.clientId)
			.maybeSingle(),
		supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", args.userId)
			.eq("workspace_id", args.workspaceId)
			.maybeSingle(),
	]);
	if (authorization.error || membership.error || !authorization.data || authorization.data.revoked_at !== null || !membership.data) {
		return null;
	}

	return Array.isArray(authorization.data.scopes)
		? authorization.data.scopes.map(String).filter(Boolean)
		: [];
}

export async function hasActiveOAuthWorkspaceAccess(args: {
	userId: string;
	workspaceId: string;
	clientId: string;
}): Promise<boolean> {
	return (await getActiveOAuthWorkspaceScopes(args)) !== null;
}

async function createTokenPairMaterial(input: TokenIssueInput) {
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
	return {
		response: {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			scope: input.scopes.join(" "),
		},
		refreshHash,
		refreshExpiresAt,
	};
}

export async function issueTokenPair(input: TokenIssueInput) {
	const material = await createTokenPairMaterial(input);
	const supabase = getSupabaseAdmin();
	const { error: refreshInsertError } = await supabase.from("oauth_refresh_tokens").insert({
		token_hash: material.refreshHash,
		user_id: input.userId,
		workspace_id: input.workspaceId,
		client_id: input.clientId,
		scopes: input.scopes,
		expires_at: material.refreshExpiresAt,
		family_id: crypto.randomUUID(),
	});
	if (refreshInsertError) {
		throw new Error(refreshInsertError.message || "Failed to persist OAuth refresh token");
	}

	return material.response;
}

export async function issueTokenPairForGrant(
	grant: { type: "device_code" | "authorization_code"; id: string },
	input: TokenIssueInput,
) {
	const material = await createTokenPairMaterial(input);
	const { data, error } = await getSupabaseAdmin().rpc("consume_oauth_grant_and_issue_refresh_token", {
		p_grant_type: grant.type,
		p_grant_id: grant.id,
		p_token_hash: material.refreshHash,
		p_user_id: input.userId,
		p_workspace_id: input.workspaceId,
		p_client_id: input.clientId,
		p_scopes: input.scopes,
		p_expires_at: material.refreshExpiresAt,
		p_family_id: crypto.randomUUID(),
	});
	if (error) throw new Error(error.message || "Failed to consume OAuth grant and persist refresh token");
	if (data !== "issued") return null;
	return material.response;
}

export async function issueOAuthManagedKeyForAuthorizationCode(
	grantId: string,
	input: TokenIssueInput,
) {
	// Unbound delegated keys can spend workspace credits and require Gateway
	// consent. A key bound to the Gateway API is still a Gateway credential and
	// must carry the same explicit credit-spending permission.
	if ((!input.resource || isGatewayOAuthResource(input.resource)) && !input.scopes.includes(GATEWAY_ACCESS_SCOPE)) {
		return null;
	}

	const pepper = resolveActiveKeyPepper(getBindings());
	if (!pepper) throw new Error("KEY_PEPPER_ACTIVE is not configured");

	const generated = generateGatewayKey();
	const supabase = getSupabaseAdmin();
	const rpcInput = {
		p_code_id: grantId,
		p_key_hash: await hmacSecret(generated.secret, pepper),
		p_key_kid: generated.kid,
		p_key_prefix: generated.prefix,
		p_key_name: `OAuth: ${input.clientId}`,
		p_user_id: input.userId,
		p_workspace_id: input.workspaceId,
		p_client_id: input.clientId,
		p_scopes: input.scopes,
		p_resource: input.resource ?? null,
	};
	let { data, error } = await supabase.rpc("consume_oauth_code_and_issue_managed_key", rpcInput);
	if (error && !input.resource && /p_resource|schema cache|function.*not found/i.test(error.message)) {
		const { p_resource: _resource, ...legacyRpcInput } = rpcInput;
		const legacyResult = await supabase.rpc(
			"consume_oauth_code_and_issue_managed_key",
			legacyRpcInput,
		);
		data = legacyResult.data;
		error = legacyResult.error;
	}
	if (error) throw new Error(error.message || "Failed to consume OAuth code and issue key");
	if (data !== "issued") return null;
	return {
		access_token: generated.plaintext,
		token_type: "Bearer",
		expires_in: DELEGATED_ACCESS_TOKEN_TTL_SECONDS,
		scope: input.scopes.join(" "),
		...(input.resource ? { resource: input.resource } : {}),
	};
}

export async function rotateRefreshToken(
	refreshToken: string,
	clientAuth?: { clientId?: string; clientSecret?: string | null },
): Promise<
	| { ok: true; tokens: Awaited<ReturnType<typeof issueTokenPair>> }
	| { ok: false; reason: "invalid_client" | "invalid_grant" }
> {
	const tokenHashes = await hashOAuthSecretCandidates(refreshToken);
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("oauth_refresh_tokens")
		.select("id, token_hash, user_id, workspace_id, client_id, scopes, expires_at, revoked_at")
		.in("token_hash", tokenHashes)
		.maybeSingle();
	if (error || !data) return { ok: false, reason: "invalid_grant" };
	const tokenHash = String(data.token_hash ?? "");
	if (!tokenHash) return { ok: false, reason: "invalid_grant" };
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
	if (data.revoked_at) {
		const replay = await supabase.rpc("rotate_oauth_refresh_token", {
			p_current_token_hash: tokenHash,
			p_next_token_hash: tokenHash,
			p_next_expires_at: new Date().toISOString(),
			p_scopes: [],
		});
		if (replay.error) throw new Error(replay.error.message || "Failed to revoke replayed OAuth token family");
		return { ok: false, reason: "invalid_grant" };
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
	const membership = await supabase
		.from("workspace_members")
		.select("workspace_id")
		.eq("user_id", data.user_id)
		.eq("workspace_id", data.workspace_id)
		.maybeSingle();
	if (membership.error || !membership.data) {
		return { ok: false, reason: "invalid_grant" };
	}
	const scopes = Array.isArray(authorization.data.scopes)
		? authorization.data.scopes.map(String)
		: Array.isArray(data.scopes)
			? data.scopes.map(String)
			: [];
	const material = await createTokenPairMaterial({
		userId: String(data.user_id),
		workspaceId: String(data.workspace_id),
		clientId,
		scopes,
	});
	const rotation = await supabase.rpc("rotate_oauth_refresh_token", {
		p_current_token_hash: tokenHash,
		p_next_token_hash: material.refreshHash,
		p_next_expires_at: material.refreshExpiresAt,
		p_scopes: scopes,
	});
	if (rotation.error || rotation.data !== "rotated") {
		return { ok: false, reason: "invalid_grant" };
	}

	return {
		ok: true,
		tokens: material.response,
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
	const tokenHashes = await hashOAuthSecretCandidates(token);
	const supabase = getSupabaseAdmin();
	await supabase
		.from("oauth_refresh_tokens")
		.update({ revoked_at: new Date().toISOString() })
		.in("token_hash", tokenHashes)
		.is("revoked_at", null);

	// Third-party authorization-code grants return an opaque delegated Gateway
	// key as their OAuth access token. RFC 7009 revocation must invalidate that
	// credential too, while proving possession of its secret before changing it.
	const delegatedKey = /^phaseo_v1_sk_([A-Za-z0-9]{12})_([A-Za-z0-9]{40})$/.exec(token);
	if (!delegatedKey) return;
	const [, kid, secret] = delegatedKey;
	const { data: keyRow, error } = await supabase
		.from("keys")
		.select("id, hash, key_kind, status")
		.eq("kid", kid)
		.maybeSingle();
	if (error || !keyRow || keyRow.key_kind !== "oauth_delegated" || keyRow.status !== "active") return;

	const candidates = resolveKeyPepperCandidates(getBindings());
	const hashes = await Promise.all(candidates.map((candidate) => hmacSecret(secret, candidate.value)));
	if (!hashes.some((candidate) => timingSafeEqual(candidate, String(keyRow.hash ?? "")))) return;

	await supabase
		.from("keys")
		.update({ status: "revoked" })
		.eq("id", keyRow.id)
		.eq("status", "active")
		.eq("key_kind", "oauth_delegated");
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

export function isValidPkceChallenge(value: string): boolean {
	return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isValidPkceVerifier(value: string): boolean {
	return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export async function verifyPkce(args: { codeVerifier: string; codeChallenge: string; method: string }) {
	if (
		args.method !== "S256" ||
		!isValidPkceVerifier(args.codeVerifier) ||
		!isValidPkceChallenge(args.codeChallenge)
	) return false;
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
