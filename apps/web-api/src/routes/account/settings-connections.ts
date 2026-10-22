import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { getDataClient } from "@/data/supabase";
import { withSessionAuthorization } from "@/auth/sessionCookie";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import {
	connectionKeyringFromEnv,
	decryptConnectionSecret,
	encryptConnectionSecret,
	hashOAuthState,
	labelSlugFromName,
	type ConnectionKeyring,
} from "@/lib/mcp-connections-shared";
import {
	McpOAuthError,
	buildAuthorizationUrl,
	checkAuthorizationResponseIssuer,
	exchangeAuthorizationCode,
	probeMcpServer,
	randomUrlToken,
	registerClient,
	revokeToken,
	type AuthorizationServerMetadata,
	type ClientRegistration,
	type OAuthFetch,
} from "@/lib/mcp-connections-oauth";
import { SsrfError, safeFetch, validatePublicUrl } from "@/lib/ssrf";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";

// Connections: remote MCP servers (Linear, Notion, Sentry, ...) a person signs
// in to once, then uses through Phaseo's own MCP server. Connections are always
// personal: only the person who connected can list or call them, and calls run
// with their upstream account.
//
// Signing in follows the MCP authorization spec (see lib/mcp-connections-oauth).
// Phaseo identifies itself with a client ID metadata document where the
// server supports it (served below), and otherwise registers dynamically.
// Tokens and PKCE verifiers are encrypted with MCP_CONNECTIONS_KEY_V<n> and
// never returned.
//
// The OAuth redirect is https://phaseo.app/api/account/settings/connections/callback
// (PHASEO_WEB_ORIGIN changes the origin), served straight by this Worker like
// the Slack callback. The browser arrives with its Supabase session cookie, and
// the callback requires that user to be the one who started the sign-in.

const CALLBACK_PATH = "/api/account/settings/connections/callback";
const CLIENT_METADATA_PATH = "/api/account/settings/connections/client-metadata.json";
const SETTINGS_PATH = "/settings/connections";
const DEFAULT_WEB_ORIGIN = "https://phaseo.app";
const DEFAULT_MCP_URL = "https://mcp.phaseo.app/mcp";
const MAX_CONNECTIONS_PER_PERSON = 25;
const UPSTREAM_TIMEOUT_MS = 10_000;
const UPSTREAM_MAX_BYTES = 256 * 1024;
const OAUTH_CODE_PATTERN = /^[\x21-\x7e]{1,2048}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTION_COLUMNS = "id,label_slug,display_name,server_url,auth_kind,status,scopes,tools_changed_at,tools_reviewed_at,disabled_tools,last_used_at,last_error,created_at,updated_at";

type Body = Record<string, unknown>;
type OAuthClientRow = {
	id: string;
	issuer: string;
	registration_kind: "cimd" | "dcr";
	client_id: string;
	client_secret_enc: string | null;
	metadata: Record<string, unknown> | null;
};

function json(c: any, body: unknown, status = 200) {
	return c.json(body, status, PRIVATE_NO_STORE_HEADERS);
}

async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

function requestId(c: any): string | null {
	return c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? null;
}

export function connectionsWebOrigin(env: Env): string {
	const configured = env.PHASEO_WEB_ORIGIN?.trim();
	if (configured) {
		try {
			const url = new URL(configured);
			if (url.protocol === "https:" || (env.ENV !== "production" && url.protocol === "http:")) return url.origin;
		} catch {}
	}
	return DEFAULT_WEB_ORIGIN;
}

export function connectionsRedirectUri(env: Env): string {
	return `${connectionsWebOrigin(env)}${CALLBACK_PATH}`;
}

/** Phaseo's OAuth client ID wherever client ID metadata documents are supported: the document's own URL. */
export function connectionsClientMetadataUrl(env: Env): string {
	return `${connectionsWebOrigin(env)}${CLIENT_METADATA_PATH}`;
}

function hubEnabled(env: Env): boolean {
	return env.MCP_HUB_ENABLED === "true";
}

function keyring(env: Env): ConnectionKeyring | null {
	const ring = connectionKeyringFromEnv(env as unknown as Record<string, unknown>);
	return ring.keys[ring.activeVersion] ? ring : null;
}

function notAvailable(c: any) {
	return json(c, { error: "connections_unavailable", message: "Connections are not available yet" }, 503);
}

/** safeFetch with the limits every upstream OAuth and probe request gets. */
const upstreamFetch: OAuthFetch = (input, init) => safeFetch(input, init, { timeoutMs: UPSTREAM_TIMEOUT_MS, maxBytes: UPSTREAM_MAX_BYTES });

function redirectToSettings(env: Env, params: Record<string, string>): Response {
	const url = new URL(SETTINGS_PATH, connectionsWebOrigin(env));
	for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
	return new Response(null, {
		status: 302,
		headers: { Location: url.toString(), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
	});
}

async function audit(c: any, context: AccountWorkspaceContext, action: string, target: { id: string; name: string }, metadata: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: `mcp_connection.${action}`,
		targetType: "mcp_connection",
		targetId: target.id,
		targetName: target.name,
		metadata,
		requestId: requestId(c),
	});
}

function errorCode(error: unknown): string {
	if (error instanceof McpOAuthError || error instanceof SsrfError) return error.code;
	return "connect_failed";
}

const ERROR_MESSAGES: Record<string, string> = {
	server_unreachable: "That server did not answer like an MCP server.",
	registration_unsupported: "This server only accepts apps it has approved, so Phaseo can't connect to it yet.",
	registration_failed: "The server refused to register Phaseo.",
	authorization_server_pkce_unsupported: "This server's sign-in does not support PKCE, which Phaseo requires.",
	authorization_server_metadata_not_found: "Could not find this server's sign-in details.",
	resource_metadata_mismatch: "The server's sign-in details are for a different address.",
	ssrf_url_private_network_not_allowed: "That address is on a private network.",
	ssrf_url_must_use_https: "The server address must use https.",
	ssrf_url_dns_resolution_failed: "Could not look up that server.",
	ssrf_timeout: "The server took too long to answer.",
};

function connectFailure(c: any, error: unknown) {
	const code = errorCode(error);
	return json(c, { error: code, message: ERROR_MESSAGES[code] ?? "Could not connect to that server." }, 422);
}

function sanitizeName(value: unknown, fallback: string): string {
	const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) : "";
	return text || fallback;
}

/** The person's label for this server: reuse it when reconnecting, otherwise the first free slug. */
async function chooseLabel(context: AccountWorkspaceContext, serverUrl: string, name: string): Promise<{ label: string; existing: boolean } | { error: string }> {
	const rows = await context.client.from("mcp_connections").select("label_slug,server_url")
		.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id);
	if (rows.error) return { error: "lookup_failed" };
	const owned = (rows.data ?? []) as Array<{ label_slug: string; server_url: string }>;
	const same = owned.find((row) => row.server_url === serverUrl);
	if (same) return { label: same.label_slug, existing: true };
	if (owned.length >= MAX_CONNECTIONS_PER_PERSON) return { error: "connection_limit_reached" };
	const taken = new Set(owned.map((row) => row.label_slug));
	const base = labelSlugFromName(name);
	for (let index = 1; index < 100; index += 1) {
		const suffix = index === 1 ? "" : `_${index}`;
		const label = `${base.slice(0, 24 - suffix.length)}${suffix}`;
		if (!taken.has(label)) return { label, existing: false };
	}
	return { error: "connection_limit_reached" };
}

function authServerFromRow(row: OAuthClientRow): AuthorizationServerMetadata {
	const metadata = (row.metadata ?? {}) as Partial<AuthorizationServerMetadata>;
	return { ...metadata, issuer: row.issuer } as AuthorizationServerMetadata;
}

function tokenEndpointAuthMethod(row: OAuthClientRow): ClientRegistration["tokenEndpointAuthMethod"] {
	const method = (row.metadata ?? {}).token_endpoint_auth_method;
	return method === "client_secret_basic" || method === "client_secret_post" ? method : "none";
}

/**
 * The client Phaseo uses with this authorization server: its metadata document
 * where supported, otherwise a dynamic registration kept for every later
 * connection to the same issuer.
 */
async function oauthClientFor(env: Env, context: AccountWorkspaceContext, ring: ConnectionKeyring, authServer: AuthorizationServerMetadata): Promise<OAuthClientRow> {
	const redirectUri = connectionsRedirectUri(env);
	const kind = authServer.client_id_metadata_document_supported ? "cimd" : "dcr";
	const existing = await context.client.from("mcp_oauth_clients").select("id,issuer,registration_kind,client_id,client_secret_enc,metadata")
		.eq("issuer", authServer.issuer).eq("registration_kind", kind).eq("redirect_uri", redirectUri).maybeSingle();
	if (existing.error) throw new McpOAuthError("lookup_failed");
	if (existing.data) {
		const row = existing.data as OAuthClientRow;
		// Keep the endpoints current; the registration itself stays.
		const metadata = { ...authServer, token_endpoint_auth_method: tokenEndpointAuthMethod(row) };
		await context.client.from("mcp_oauth_clients").update({ metadata, updated_at: new Date().toISOString() }).eq("id", row.id);
		return { ...row, metadata };
	}

	const registration: ClientRegistration = kind === "cimd"
		? { kind, clientId: connectionsClientMetadataUrl(env), clientSecret: null, tokenEndpointAuthMethod: "none" }
		: await registerClient(upstreamFetch, authServer, {
			redirectUri,
			clientName: "Phaseo",
			clientUri: connectionsWebOrigin(env),
			logoUri: `${connectionsWebOrigin(env)}/apple-touch-icon.png`,
		});
	const id = crypto.randomUUID();
	const row = {
		id,
		issuer: authServer.issuer,
		registration_kind: kind,
		redirect_uri: redirectUri,
		client_id: registration.clientId,
		client_secret_enc: registration.clientSecret
			? await encryptConnectionSecret(ring, registration.clientSecret, { recordId: id, field: "client_secret" })
			: null,
		metadata: { ...authServer, token_endpoint_auth_method: registration.tokenEndpointAuthMethod },
	};
	const inserted = await context.client.from("mcp_oauth_clients").insert(row);
	if (inserted.error) {
		// Another sign-in registered first; use that one.
		if (inserted.error.code === "23505") return oauthClientFor(env, context, ring, authServer);
		throw new McpOAuthError("lookup_failed");
	}
	return row as OAuthClientRow;
}

async function clientSecret(ring: ConnectionKeyring, row: OAuthClientRow): Promise<string | null> {
	return row.client_secret_enc
		? decryptConnectionSecret(ring, row.client_secret_enc, { recordId: row.id, field: "client_secret" })
		: null;
}

export const accountSettingsConnectionsRouter = new Hono<{ Bindings: Env }>();

accountSettingsConnectionsRouter.get("/connections/client-metadata.json", (c) => {
	const origin = connectionsWebOrigin(c.env);
	return c.json({
		client_id: connectionsClientMetadataUrl(c.env),
		client_name: "Phaseo",
		client_uri: origin,
		logo_uri: `${origin}/apple-touch-icon.png`,
		redirect_uris: [connectionsRedirectUri(c.env)],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		token_endpoint_auth_method: "none",
	}, 200, { "Cache-Control": "public, max-age=3600" });
});

accountSettingsConnectionsRouter.get("/connections", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!context) return json(c, { error: "forbidden" }, 403);
	const enabled = hubEnabled(c.env) && keyring(c.env) !== null;
	if (!enabled) return json(c, { enabled: false, mcpUrl: DEFAULT_MCP_URL, connections: [] });
	const result = await context.client.from("mcp_connections").select(CONNECTION_COLUMNS)
		.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id).order("created_at", { ascending: true });
	if (result.error) return json(c, { error: "lookup_failed" }, 503);
	return json(c, { enabled: true, mcpUrl: c.env.MCP_PUBLIC_URL?.trim() || DEFAULT_MCP_URL, connections: result.data ?? [] });
});

accountSettingsConnectionsRouter.post("/connections/start", async (c) => {
	const body = await readBody(c);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(body.workspaceId ?? "") });
	if (!context) return json(c, { error: "forbidden" }, 403);
	const ring = keyring(c.env);
	if (!hubEnabled(c.env) || !ring) return notAvailable(c);

	const checked = validatePublicUrl(body.serverUrl);
	if (checked.ok === false) return json(c, { error: `ssrf_${checked.reason}`, message: ERROR_MESSAGES[`ssrf_${checked.reason}`] ?? "Enter the server's https address." }, 400);
	const serverUrl = checked.url;
	const displayName = sanitizeName(body.name, new URL(serverUrl).hostname);
	const label = await chooseLabel(context, serverUrl, displayName);
	if ("error" in label) {
		return json(c, { error: label.error, message: label.error === "connection_limit_reached" ? `You can connect up to ${MAX_CONNECTIONS_PER_PERSON} servers.` : undefined }, label.error === "lookup_failed" ? 503 : 409);
	}

	try {
		const probe = await probeMcpServer(upstreamFetch, serverUrl);
		if (probe.kind === "open") {
			const saved = await context.client.from("mcp_connections").upsert({
				workspace_id: context.workspaceId,
				user_id: context.user.id,
				label_slug: label.label,
				display_name: displayName,
				server_url: serverUrl,
				auth_kind: "none",
				status: "active",
				access_token_enc: null,
				refresh_token_enc: null,
				last_error: null,
				updated_at: new Date().toISOString(),
			}, { onConflict: "workspace_id,user_id,label_slug" }).select("id").maybeSingle();
			if (saved.error || !saved.data?.id) return json(c, { error: "save_failed" }, 503);
			await audit(c, context, label.existing ? "reconnected" : "connected", { id: String(saved.data.id), name: displayName }, { server_host: new URL(serverUrl).host, auth_kind: "none" });
			return json(c, { mode: "connected", id: saved.data.id, label: label.label });
		}

		const client = await oauthClientFor(c.env, context, ring, probe.authServer);
		const state = randomUrlToken();
		const codeVerifier = randomUrlToken(48);
		const pendingId = crypto.randomUUID();
		const pending = await context.client.from("mcp_oauth_pending").insert({
			id: pendingId,
			state_hash: await hashOAuthState(state),
			workspace_id: context.workspaceId,
			user_id: context.user.id,
			oauth_client_id: client.id,
			server_url: serverUrl,
			resource: probe.resource,
			issuer: probe.authServer.issuer,
			label_slug: label.label,
			display_name: displayName,
			scopes: probe.scopes,
			code_verifier_enc: await encryptConnectionSecret(ring, codeVerifier, {
				recordId: pendingId, field: "code_verifier", workspaceId: context.workspaceId, userId: context.user.id,
			}),
		});
		if (pending.error) return json(c, { error: "save_failed" }, 503);
		// Expired sign-ins are only useful for debugging for a short while.
		await context.client.from("mcp_oauth_pending").delete().lt("expires_at", new Date().toISOString());

		const authorizationUrl = await buildAuthorizationUrl({
			authServer: probe.authServer,
			clientId: client.client_id,
			redirectUri: connectionsRedirectUri(c.env),
			resource: probe.resource,
			scopes: probe.scopes,
			state,
			codeVerifier,
		});
		return json(c, { mode: "authorize", authorizationUrl, label: label.label });
	} catch (error) {
		return connectFailure(c, error);
	}
});

accountSettingsConnectionsRouter.get("/connections/callback", async (c) => {
	const env = c.env;
	const fail = (error: string) => redirectToSettings(env, { error });
	const ring = keyring(env);
	if (!hubEnabled(env) || !ring) return fail("connections_unavailable");

	const state = c.req.query("state") ?? "";
	if (!state || state.length > 200) return fail("state_invalid");
	// Single use: whoever reads the row first deletes it.
	const claimed = await getDataClient(env).from("mcp_oauth_pending")
		.delete().eq("state_hash", await hashOAuthState(state)).select("*").maybeSingle();
	if (claimed.error) return fail("connect_failed");
	const pending = claimed.data as Record<string, any> | null;
	if (!pending) return fail("state_invalid");
	if (Date.parse(String(pending.expires_at)) < Date.now()) return fail("state_expired");

	const upstreamError = c.req.query("error");
	if (upstreamError) return fail(upstreamError === "access_denied" ? "access_denied" : "upstream_error");
	const code = c.req.query("code") ?? "";
	if (!OAUTH_CODE_PATTERN.test(code)) return fail("code_missing");

	// Bind the callback to the browser's signed-in user: the one who started it.
	const authRequest = withSessionAuthorization(c.req.raw, env);
	if (!authRequest) return fail("sign_in_required");
	const context = await requireAccountWorkspace({ request: authRequest, env, workspaceId: String(pending.workspace_id) });
	if (!context) return fail("sign_in_required");
	if (context.user.id !== pending.user_id) return fail("session_mismatch");

	const clientResult = await context.client.from("mcp_oauth_clients").select("id,issuer,registration_kind,client_id,client_secret_enc,metadata")
		.eq("id", String(pending.oauth_client_id)).maybeSingle();
	if (clientResult.error || !clientResult.data) return fail("connect_failed");
	const client = clientResult.data as OAuthClientRow;
	const authServer = authServerFromRow(client);
	if (authServer.issuer !== pending.issuer) return fail("connect_failed");

	try {
		checkAuthorizationResponseIssuer(authServer, c.req.query("iss") ?? null);
		const codeVerifier = await decryptConnectionSecret(ring, String(pending.code_verifier_enc), {
			recordId: String(pending.id), field: "code_verifier", workspaceId: context.workspaceId, userId: context.user.id,
		});
		const tokens = await exchangeAuthorizationCode(upstreamFetch, {
			tokenEndpoint: authServer.token_endpoint,
			clientId: client.client_id,
			clientSecret: await clientSecret(ring, client),
			tokenEndpointAuthMethod: tokenEndpointAuthMethod(client),
		}, { code, codeVerifier, redirectUri: connectionsRedirectUri(env), resource: String(pending.resource) });

		const existing = await context.client.from("mcp_connections").select("id")
			.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id).eq("label_slug", String(pending.label_slug)).maybeSingle();
		if (existing.error) return fail("connect_failed");
		const connectionId = String(existing.data?.id ?? crypto.randomUUID());
		const secretContext = { recordId: connectionId, workspaceId: context.workspaceId, userId: context.user.id };
		const saved = await context.client.from("mcp_connections").upsert({
			id: connectionId,
			workspace_id: context.workspaceId,
			user_id: context.user.id,
			label_slug: String(pending.label_slug),
			display_name: String(pending.display_name),
			server_url: String(pending.server_url),
			auth_kind: "oauth",
			resource: String(pending.resource),
			issuer: authServer.issuer,
			oauth_client_id: client.id,
			scopes: tokens.scopes.length ? tokens.scopes : (pending.scopes ?? []),
			status: "active",
			access_token_enc: await encryptConnectionSecret(ring, tokens.accessToken, { ...secretContext, field: "access_token" }),
			refresh_token_enc: tokens.refreshToken
				? await encryptConnectionSecret(ring, tokens.refreshToken, { ...secretContext, field: "refresh_token" })
				: null,
			access_expires_at: tokens.expiresAt,
			last_error: null,
			updated_at: new Date().toISOString(),
		}, { onConflict: "workspace_id,user_id,label_slug" });
		if (saved.error) return fail("connect_failed");
		await audit(c, context, existing.data ? "reconnected" : "connected", { id: connectionId, name: String(pending.display_name) }, {
			server_host: new URL(String(pending.server_url)).host,
			auth_kind: "oauth",
			registration_kind: client.registration_kind,
		});
		return redirectToSettings(env, { connected: String(pending.label_slug) });
	} catch (error) {
		return fail(errorCode(error));
	}
});

accountSettingsConnectionsRouter.delete("/connections/:connectionId", async (c) => {
	const connectionId = c.req.param("connectionId");
	if (!UUID_PATTERN.test(connectionId)) return json(c, { error: "not_found" }, 404);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!context) return json(c, { error: "forbidden" }, 403);
	const loaded = await context.client.from("mcp_connections").select("id,display_name,server_url,auth_kind,oauth_client_id,access_token_enc,refresh_token_enc")
		.eq("id", connectionId).eq("workspace_id", context.workspaceId).eq("user_id", context.user.id).maybeSingle();
	if (loaded.error) return json(c, { error: "lookup_failed" }, 503);
	if (!loaded.data) return json(c, { error: "not_found" }, 404);
	const row = loaded.data as Record<string, any>;

	// Tell the server first, while we still hold the tokens. Failure doesn't block removal.
	let revoked = false;
	const ring = keyring(c.env);
	if (ring && row.oauth_client_id && (row.refresh_token_enc || row.access_token_enc)) {
		try {
			const clientResult = await context.client.from("mcp_oauth_clients").select("id,issuer,registration_kind,client_id,client_secret_enc,metadata")
				.eq("id", String(row.oauth_client_id)).maybeSingle();
			const client = clientResult.data as OAuthClientRow | null;
			if (client) {
				const field = row.refresh_token_enc ? "refresh_token" : "access_token";
				const token = await decryptConnectionSecret(ring, String(row.refresh_token_enc ?? row.access_token_enc), {
					recordId: connectionId, field, workspaceId: context.workspaceId, userId: context.user.id,
				});
				revoked = await revokeToken(upstreamFetch, {
					revocationEndpoint: authServerFromRow(client).revocation_endpoint ?? null,
					clientId: client.client_id,
					clientSecret: await clientSecret(ring, client),
					tokenEndpointAuthMethod: tokenEndpointAuthMethod(client),
				}, token, field);
			}
		} catch {
			revoked = false;
		}
	}

	const removed = await context.client.from("mcp_connections").delete()
		.eq("id", connectionId).eq("workspace_id", context.workspaceId).eq("user_id", context.user.id);
	if (removed.error) return json(c, { error: "delete_failed" }, 503);
	await audit(c, context, "disconnected", { id: connectionId, name: String(row.display_name) }, {
		server_host: new URL(String(row.server_url)).host,
		upstream_revoked: revoked,
	});
	return json(c, { success: true, upstreamRevoked: revoked });
});
