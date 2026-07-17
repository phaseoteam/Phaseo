import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { ALL_SUPPORTED_SCOPES, GATEWAY_ACCESS_SCOPE } from "@/lib/authz/capabilities";
import { checkOAuthRateLimit } from "@/lib/oauth/rateLimit";
import { authenticateManagement } from "@/pipeline/before/auth";
import { json, withRuntime } from "@/routes/utils";
import {
	approveMcpAction,
	completeMcpAction,
	consumeMcpAction,
	getMcpActionApprovalForUser,
	normalizeMcpAction,
	prepareMcpAction,
} from "@/lib/mcp/actionApprovals";
import {
	getMcpSecretRevealForUser,
	revealMcpSecrets,
	storeMcpSecretReveal,
} from "@/lib/mcp/secretReveals";
import {
	CLI_CLIENT_ID,
	CLI_DEFAULT_SCOPES,
	assertRedirectAllowed,
	authorizationConsentUrl,
	bearerToken,
	createOpaqueCode,
	createUserCode,
	defaultDeviceIntervalSeconds,
	deviceExpiresInSeconds,
	filterAllowedScopes,
	getApiBaseUrl,
	getIssuer,
	getLocalJwks,
	getSupabaseActor,
	getWebBaseUrl,
	hashOAuthSecret,
	hashOAuthSecretCandidates,
	hasActiveOAuthWorkspaceAccess,
	issueTokenPairForGrant,
	issueOAuthManagedKeyForAuthorizationCode,
	issueMcpUpstreamToken,
	isValidPkceChallenge,
	isFirstPartyCliClient,
	isThirdPartyOAuthEnabled,
	loadOAuthClient,
	makeAuthCodeExpiry,
	makeDeviceCodeExpiry,
	normalizeScopes,
	normalizeUserCode,
	parseTokenRequestBody,
	revokeToken,
	rotateRefreshToken,
	verificationUriFor,
	verifyPkce,
	ensureGrant,
	ensureGrants,
	verifyClientSecret,
} from "@/lib/oauth/service";

export const oauthRouter = new Hono<Env>();
const MAX_OAUTH_REQUEST_BODY_BYTES = 16 * 1024;
const OAUTH_CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Max-Age": "86400",
};
const DYNAMIC_MCP_SCOPES = [
	"openid",
	"profile",
	"email",
	"me:read",
	"models:read",
	"providers:read",
	"pricing:read",
	"credits:read",
	"activity:read",
	"analytics:read",
	"generations:read",
	"workspaces:read",
	"keys:read",
	"presets:read",
	"settings:read",
	"guardrails:read",
	"management_keys:read",
	"oauth_clients:read",
] as const;
const DYNAMIC_MCP_DEFAULT_SCOPES = [
	"me:read",
	"models:read",
	"providers:read",
	"pricing:read",
	"credits:read",
	"activity:read",
	"analytics:read",
	"generations:read",
	"workspaces:read",
	"keys:read",
	"presets:read",
	"settings:read",
	"guardrails:read",
	"management_keys:read",
	"oauth_clients:read",
] as const;
const DYNAMIC_MCP_SCOPE_SET = new Set<string>(DYNAMIC_MCP_SCOPES);
const MCP_RESOURCE_SERVER_CLIENT_ID = "phaseo_mcp_resource_server";

class OAuthRequestBodyTooLarge extends Error {}

oauthRouter.use("*", async (c, next) => {
	if (c.req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
	}
	await next();
	const headers = new Headers(c.res.headers);
	for (const [key, value] of Object.entries(OAUTH_CORS_HEADERS)) headers.set(key, value);
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
});

function noStore(status = 200) {
	return { status, headers: { "Cache-Control": "no-store" } };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
	const contentLength = Number(req.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_OAUTH_REQUEST_BODY_BYTES) {
		throw new OAuthRequestBodyTooLarge();
	}
	if (!req.body) return {};

	const reader = req.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_OAUTH_REQUEST_BODY_BYTES) {
				await reader.cancel();
				throw new OAuthRequestBodyTooLarge();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const text = new TextDecoder().decode(bytes);
	return parseTokenRequestBody(text, req.headers.get("content-type"));
}

function invalidBodyError(error: unknown) {
	if (error instanceof OAuthRequestBodyTooLarge) {
		return oauthError("invalid_request", "OAuth request body is too large", 413);
	}
	return oauthError("invalid_request", "Request body must be JSON or form encoded");
}

function oauthError(error: string, description: string, status = 400, headers: Record<string, string> = {}) {
	return json({ error, error_description: description }, status, { "Cache-Control": "no-store", ...headers });
}

function rateLimitError(error = "temporarily_unavailable") {
	return oauthError(error, "Too many OAuth requests; retry later", error === "slow_down" ? 400 : 429, { "Retry-After": "60" });
}

function normalizeWorkspaceIds(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return Array.from(
			new Set(
				raw
					.map((value) => String(value ?? "").trim())
					.filter(Boolean),
			),
		);
	}
	if (typeof raw === "string" && raw.trim().length > 0) {
		return [raw.trim()];
	}
	return [];
}

function readClientCredentials(
	req: Request,
	body: Record<string, unknown>,
): { clientId: string; clientSecret: string | null } {
	const authorization = req.headers.get("authorization") ?? "";
	if (authorization.toLowerCase().startsWith("basic ")) {
		try {
			const encoded = authorization.slice(6).trim();
			if (encoded.length > 2048) throw new Error("OAuth client credentials are too large");
			const decoded = atob(encoded);
			const separatorIndex = decoded.indexOf(":");
			if (separatorIndex >= 0) {
				return {
					clientId: decoded.slice(0, separatorIndex).trim(),
					clientSecret: decoded.slice(separatorIndex + 1),
				};
			}
		} catch {
			// Fall back to request-body credentials.
		}
	}

	return {
		clientId: String(body.client_id ?? "").trim(),
		clientSecret:
			typeof body.client_secret === "string" ? body.client_secret : null,
	};
}

function constantTimeEqualText(left: string, right: string): boolean {
	const length = Math.max(left.length, right.length);
	let difference = left.length === right.length ? 0 : 1;
	for (let index = 0; index < length; index += 1) {
		difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
	}
	return difference === 0;
}

function hasUnsafeMetadataCharacters(value: string): boolean {
	return /[\u0000-\u001F\u007F]/.test(value);
}

async function requireSupabaseActor(req: Request) {
	const token = bearerToken(req);
	if (!token) return null;
	return getSupabaseActor(token);
}

function isDynamicClientRedirectUriAllowed(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 2048) return false;
	try {
		const url = new URL(value);
		if (url.username || url.password || url.hash) return false;
		if (url.protocol === "https:") return true;
		return url.protocol === "http:" &&
			(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]");
	} catch {
		return false;
	}
}

function isDynamicClientMetadataUrlAllowed(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 2048) return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password && !url.hash;
	} catch {
		return false;
	}
}

function isProtectedResourceAllowed(value: string): boolean {
	if (value.length > 2048) return false;
	try {
		const url = new URL(value);
		if (url.username || url.password || url.hash) return false;
		if (url.protocol === "https:") return true;
		return url.protocol === "http:" &&
			(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]");
	} catch {
		return false;
	}
}

export function oauthAuthorizationServerMetadata() {
	const apiBaseUrl = getApiBaseUrl();
	return {
		issuer: getIssuer(),
		authorization_endpoint: `${apiBaseUrl}/oauth/authorize`,
		token_endpoint: `${apiBaseUrl}/oauth/token`,
		device_authorization_endpoint: `${apiBaseUrl}/oauth/device/code`,
		revocation_endpoint: `${apiBaseUrl}/oauth/revoke`,
		userinfo_endpoint: `${apiBaseUrl}/oauth/userinfo`,
		jwks_uri: `${apiBaseUrl}/oauth/.well-known/jwks.json`,
		response_types_supported: ["code"],
		grant_types_supported: [
			"authorization_code",
			"refresh_token",
			"urn:ietf:params:oauth:grant-type:device_code",
		],
		token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
		code_challenge_methods_supported: ["S256"],
		scopes_supported: [...ALL_SUPPORTED_SCOPES],
		...(isThirdPartyOAuthEnabled() ? { registration_endpoint: `${apiBaseUrl}/oauth/register` } : {}),
	};
}

oauthRouter.get(
	"/client-metadata",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		if (!(await checkOAuthRateLimit(req, "token", `client-metadata:${actor.userId}`))) return rateLimitError();
		const clientId = new URL(req.url).searchParams.get("client_id")?.trim() ?? "";
		if (!clientId || clientId.length > 256) {
			return oauthError("invalid_request", "A valid client_id is required");
		}
		const client = await loadOAuthClient(clientId);
		if (!client) return oauthError("invalid_client", "OAuth client is not active", 404);
		return json({
			client_id: client.id,
			name: client.name,
			description: client.description ?? null,
			homepage_url: client.homepage_url ?? null,
			logo_url: client.logo_url ?? null,
			redirect_uris: client.redirect_uris,
			is_first_party: client.is_first_party,
			registration_source: client.registration_source,
		}, 200, { "Cache-Control": "no-store" });
	}),
);

function actionApprovalError(error: unknown): Response {
	const requestId = crypto.randomUUID();
	console.error("mcp_action_approval_failed", {
		request_id: requestId,
		message: error instanceof Error ? error.message : "unknown_error",
	});
	return oauthError("server_error", `Action approval service unavailable. Reference: ${requestId}`, 500);
}

function oauthStorageError(operation: string, error: unknown): Response {
	const requestId = crypto.randomUUID();
	console.error("oauth_storage_operation_failed", {
		operation,
		request_id: requestId,
		message: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "unknown_error"),
	});
	return oauthError("server_error", `OAuth service request failed. Reference: ${requestId}`, 500);
}

async function authenticatedMcpActionActor(req: Request) {
	const auth = await authenticateManagement(req, { useKvCache: false });
	if (!auth.ok || auth.authMethod !== "oauth" || !auth.userId || !auth.oauthClientId) return null;
	return {
		userId: auth.userId,
		workspaceId: auth.workspaceId,
		clientId: auth.oauthClientId,
		scopes: auth.oauthScopes ?? auth.scopes ?? [],
	};
}

oauthRouter.post(
	"/mcp/action-approval/prepare",
	withRuntime(async (req) => {
		const actor = await authenticatedMcpActionActor(req);
		if (!actor) return oauthError("invalid_token", "An authenticated MCP OAuth token is required", 401);
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const action = normalizeMcpAction(body.action);
		if (!action) return oauthError("invalid_request", "A valid bounded MCP action is required");
		const destructive = action.method === "DELETE" || action.required_scopes.some((scope) => scope.endsWith(":delete"));
		if (!(await checkOAuthRateLimit(req, destructive ? "strict" : "token", `mcp-prepare:${actor.userId}:${actor.workspaceId}:${action.tool_name}`))) {
			return rateLimitError();
		}
		try {
			const prepared = await prepareMcpAction(actor, action);
			if (!prepared) return oauthError("insufficient_scope", "The OAuth grant cannot approve this action", 403);
			return json({
				approval_id: prepared.approvalId,
				execution_token: prepared.executionToken,
				expires_at: prepared.expiresAt,
				approval_url: `${getWebBaseUrl()}/mcp/approvals/${encodeURIComponent(prepared.approvalId)}`,
			}, 201, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.post(
	"/mcp/action-approval/consume",
	withRuntime(async (req) => {
		const actor = await authenticatedMcpActionActor(req);
		if (!actor) return oauthError("invalid_token", "An authenticated MCP OAuth token is required", 401);
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const action = normalizeMcpAction(body.action);
		const executionToken = String(body.execution_token ?? "").trim();
		if (!action || executionToken.length < 32 || executionToken.length > 512) {
			return oauthError("invalid_request", "A valid action and execution token are required");
		}
		const destructive = action.method === "DELETE" || action.required_scopes.some((scope) => scope.endsWith(":delete"));
		if (!(await checkOAuthRateLimit(req, destructive ? "strict" : "token", `mcp-consume:${actor.userId}:${actor.workspaceId}:${action.tool_name}`))) {
			return rateLimitError();
		}
		try {
			const consumed = await consumeMcpAction(actor, action, executionToken);
			if (!consumed) return oauthError("invalid_grant", "Action approval is missing, expired, changed, or already used", 409);
			return json({ approval_id: consumed.approvalId, consumed: true }, 200, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.post(
	"/mcp/action-approval/complete",
	withRuntime(async (req) => {
		const actor = await authenticatedMcpActionActor(req);
		if (!actor) return oauthError("invalid_token", "An authenticated MCP OAuth token is required", 401);
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const action = normalizeMcpAction(body.action);
		const approvalId = String(body.approval_id ?? "").trim();
		const outcome = body.outcome === "succeeded" || body.outcome === "failed" ? body.outcome : null;
		if (!action || !/^[0-9a-f-]{36}$/i.test(approvalId) || !outcome) {
			return oauthError("invalid_request", "A valid action, approval_id, and outcome are required");
		}
		try {
			const completed = await completeMcpAction(actor, action, approvalId, outcome);
			if (!completed) return oauthError("invalid_grant", "Action approval could not be completed", 409);
			return json({ completed: true }, 200, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.get(
	"/mcp/action-approval",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		const approvalId = new URL(req.url).searchParams.get("approval_id")?.trim() ?? "";
		if (!/^[0-9a-f-]{36}$/i.test(approvalId)) return oauthError("invalid_request", "A valid approval_id is required");
		if (!(await checkOAuthRateLimit(req, "token", `mcp-approval-read:${actor.userId}`))) return rateLimitError();
		try {
			const approval = await getMcpActionApprovalForUser(approvalId, actor.userId);
			if (!approval) return oauthError("invalid_grant", "Action approval was not found", 404);
			return json({ approval }, 200, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.post(
	"/mcp/action-approval/approve",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const approvalId = String(body.approval_id ?? "").trim();
		if (!/^[0-9a-f-]{36}$/i.test(approvalId)) return oauthError("invalid_request", "A valid approval_id is required");
		if (!(await checkOAuthRateLimit(req, "strict", `mcp-approval-write:${actor.userId}`))) return rateLimitError();
		try {
			const approved = await approveMcpAction(approvalId, actor.userId);
			if (!approved) return oauthError("invalid_grant", "Action approval is expired, already used, or unavailable", 409);
			return json({ approval_id: approved.approvalId, approved_at: approved.approvedAt }, 200, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.post(
	"/mcp/secret-reveal/store",
	withRuntime(async (req) => {
		const actor = await authenticatedMcpActionActor(req);
		if (!actor) return oauthError("invalid_token", "An authenticated MCP OAuth token is required", 401);
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const approvalId = String(body.approval_id ?? "").trim();
		const toolName = String(body.tool_name ?? "").trim();
		const rawSecrets = body.secrets;
		if (!/^[0-9a-f-]{36}$/i.test(approvalId) || !/^[a-z][a-z0-9_]{2,99}$/.test(toolName) || !rawSecrets || typeof rawSecrets !== "object" || Array.isArray(rawSecrets)) {
			return oauthError("invalid_request", "A valid approval, tool, and secret payload are required");
		}
		const secrets = Object.fromEntries(
			Object.entries(rawSecrets as Record<string, unknown>)
				.filter((entry): entry is [string, string] => typeof entry[1] === "string"),
		);
		if (!(await checkOAuthRateLimit(req, "strict", `mcp-secret-store:${actor.userId}:${actor.workspaceId}`))) return rateLimitError();
		try {
			const reveal = await storeMcpSecretReveal({ actor, approvalId, toolName, secrets });
			if (!reveal) return oauthError("invalid_grant", "The consumed action does not match this secret reveal", 409);
			return json({
				reveal_id: reveal.revealId,
				expires_at: reveal.expiresAt,
				reveal_url: `${getWebBaseUrl()}/mcp/secret-reveals/${encodeURIComponent(reveal.revealId)}`,
			}, 201, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.get(
	"/mcp/secret-reveal",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		const revealId = new URL(req.url).searchParams.get("reveal_id")?.trim() ?? "";
		if (!/^[0-9a-f-]{36}$/i.test(revealId)) return oauthError("invalid_request", "A valid reveal_id is required");
		if (!(await checkOAuthRateLimit(req, "token", `mcp-secret-read:${actor.userId}`))) return rateLimitError();
		try {
			const reveal = await getMcpSecretRevealForUser(revealId, actor.userId);
			if (!reveal) return oauthError("invalid_grant", "Secret reveal was not found", 404);
			return json({ reveal }, 200, { "Cache-Control": "no-store" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

oauthRouter.post(
	"/mcp/secret-reveal/reveal",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const revealId = String(body.reveal_id ?? "").trim();
		if (!/^[0-9a-f-]{36}$/i.test(revealId)) return oauthError("invalid_request", "A valid reveal_id is required");
		if (!(await checkOAuthRateLimit(req, "strict", `mcp-secret-reveal:${actor.userId}`))) return rateLimitError();
		try {
			const revealed = await revealMcpSecrets(revealId, actor.userId);
			if (!revealed) return oauthError("invalid_grant", "Secret reveal is expired, already viewed, or unavailable", 409);
			return json(revealed, 200, { "Cache-Control": "no-store", "Pragma": "no-cache" });
		} catch (error) {
			return actionApprovalError(error);
		}
	}),
);

/**
 * Register a public OAuth client for an MCP host. The registration only sets
 * which scopes the client may later request; the user still grants an exact
 * subset for an exact workspace on the consent screen.
 */
oauthRouter.post(
	"/register",
	withRuntime(async (req) => {
		if (!isThirdPartyOAuthEnabled()) {
			return oauthError("registration_not_supported", "Dynamic client registration is not enabled", 403);
		}
		if (!(await checkOAuthRateLimit(req, "strict", "dynamic-client-registration"))) return rateLimitError();
		if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
			return oauthError("invalid_client_metadata", "Dynamic client registration requires application/json");
		}

		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			if (error instanceof OAuthRequestBodyTooLarge) return invalidBodyError(error);
			return oauthError("invalid_client_metadata", "Request body must be valid JSON");
		}

		const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
		if (redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(isDynamicClientRedirectUriAllowed)) {
			return oauthError("invalid_redirect_uri", "redirect_uris must contain 1-10 HTTPS or loopback callback URLs");
		}
		if (body.client_uri !== undefined && !isDynamicClientMetadataUrlAllowed(body.client_uri)) {
			return oauthError("invalid_client_metadata", "client_uri must be an HTTPS URL");
		}
		if (body.logo_uri !== undefined && !isDynamicClientMetadataUrlAllowed(body.logo_uri)) {
			return oauthError("invalid_client_metadata", "logo_uri must be an HTTPS URL");
		}

		const clientName = String(body.client_name ?? "Unverified MCP client").normalize("NFKC").trim();
		if (clientName.length < 3 || clientName.length > 100 || hasUnsafeMetadataCharacters(clientName)) {
			return oauthError("invalid_client_metadata", "client_name must contain 3-100 characters");
		}
		if (/\b(?:phaseo|ai[\s_-]*stats)\b/i.test(clientName)) {
			return oauthError("invalid_client_metadata", "Dynamically registered clients cannot use reserved Phaseo product names");
		}
		const clientDescription = typeof body.client_description === "string"
			? body.client_description.normalize("NFKC").trim()
			: "";
		if (clientDescription.length > 500 || hasUnsafeMetadataCharacters(clientDescription)) {
			return oauthError("invalid_client_metadata", "client_description must contain at most 500 characters without control characters");
		}
		if (String(body.token_endpoint_auth_method ?? "none") !== "none") {
			return oauthError("invalid_client_metadata", "Only public clients using token_endpoint_auth_method=none are supported");
		}

		const responseTypes = Array.isArray(body.response_types) ? body.response_types.map(String) : ["code"];
		const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ["authorization_code"];
		const safeGrantTypes = Array.from(new Set(grantTypes));
		if (
			!responseTypes.every((value) => value === "code") ||
			!safeGrantTypes.includes("authorization_code") ||
			!safeGrantTypes.every((value) => value === "authorization_code" || value === "refresh_token")
		) {
			return oauthError(
				"invalid_client_metadata",
				"Dynamically registered clients support authorization_code and refresh_token grants with code responses",
			);
		}

		const requestedScopes = normalizeScopes(body.scope, DYNAMIC_MCP_DEFAULT_SCOPES);
		if (requestedScopes.length === 0 || !requestedScopes.every((scope) => DYNAMIC_MCP_SCOPE_SET.has(scope))) {
			return oauthError("invalid_scope", "Dynamically registered MCP clients are limited to read-only Phaseo scopes");
		}
		const clientId = crypto.randomUUID();
		const safeRedirectUris = Array.from(new Set(redirectUris as string[]));
		const { error } = await getSupabaseAdmin().from("oauth_clients").insert({
			id: clientId,
			name: clientName,
			description: clientDescription || null,
			logo_url: typeof body.logo_uri === "string" ? body.logo_uri : null,
			homepage_url: typeof body.client_uri === "string" ? body.client_uri : null,
			client_type: "public",
			redirect_uris: safeRedirectUris,
			allowed_scopes: requestedScopes,
			is_first_party: false,
			beta_status: "public",
			status: "active",
		});
		if (error) return oauthError("server_error", "Failed to register OAuth client", 500);

		return json({
			client_id: clientId,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_name: clientName,
			redirect_uris: safeRedirectUris,
			response_types: ["code"],
			grant_types: safeGrantTypes,
			token_endpoint_auth_method: "none",
			scope: requestedScopes.join(" "),
		}, 201, { "Cache-Control": "no-store" });
	}),
);

oauthRouter.post(
	"/device/code",
	withRuntime(async (req) => {
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}

		const clientId = String(body.client_id ?? CLI_CLIENT_ID).trim();
		if (!(await checkOAuthRateLimit(req, "strict", "device-code"))) return rateLimitError();
		const client = await loadOAuthClient(clientId);
		if (!client || client.client_type !== "public") {
			return oauthError("invalid_client", "Unknown or unsupported OAuth client", 401);
		}
		// Device authorization creates a refreshable control-plane session and is
		// reserved for the trusted Phaseo CLI. Third-party apps use PKCE and
		// receive gateway-scoped delegated keys instead.
		if (!isFirstPartyCliClient(client.id)) {
			return oauthError("invalid_client", "Device authorization is only available to the Phaseo CLI", 401);
		}

		const requestedScopes = normalizeScopes(body.scope, CLI_DEFAULT_SCOPES);
		const scopes = filterAllowedScopes(client, requestedScopes);
		if (scopes.length !== requestedScopes.length) {
			return oauthError("invalid_scope", "One or more requested scopes are not allowed for this client");
		}

		const deviceCode = createOpaqueCode();
		const userCode = createUserCode();
		const supabase = getSupabaseAdmin();
		const { error } = await supabase.from("oauth_device_codes").insert({
			device_code_hash: await hashOAuthSecret(deviceCode),
			user_code_hash: await hashOAuthSecret(normalizeUserCode(userCode)),
			client_id: client.id,
			scopes,
			status: "pending",
			interval_seconds: defaultDeviceIntervalSeconds(),
			expires_at: makeDeviceCodeExpiry(),
		});
		if (error) {
			return oauthStorageError("oauth.device_code.insert", error);
		}

		return json(
			{
				device_code: deviceCode,
				user_code: userCode,
				verification_uri: verificationUriFor(),
				verification_uri_complete: verificationUriFor(userCode),
				expires_in: deviceExpiresInSeconds(),
				interval: defaultDeviceIntervalSeconds(),
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	}),
);

oauthRouter.get(
	"/authorize",
	withRuntime(async (req) => {
		const url = new URL(req.url);
		const clientId = url.searchParams.get("client_id")?.trim() ?? "";
		const redirectUri = url.searchParams.get("redirect_uri")?.trim() ?? "";
		const responseType = url.searchParams.get("response_type")?.trim() ?? "code";
		const codeChallenge = url.searchParams.get("code_challenge")?.trim() ?? "";
		const codeChallengeMethod = url.searchParams.get("code_challenge_method")?.trim() ?? "S256";
		const resource = url.searchParams.get("resource")?.trim() ?? "";
		const state = url.searchParams.get("state") ?? "";
		if (!(await checkOAuthRateLimit(req, "token", "authorize"))) return rateLimitError();

		if (responseType !== "code") {
			return oauthError("unsupported_response_type", "Only response_type=code is supported");
		}
		if (!clientId || !redirectUri || !isValidPkceChallenge(codeChallenge) || codeChallengeMethod !== "S256") {
			return oauthError("invalid_request", "client_id, redirect_uri, and S256 PKCE are required");
		}
		if (clientId.length > 256 || redirectUri.length > 2048 || state.length > 2048) {
			return oauthError("invalid_request", "OAuth request parameters are too large");
		}
		if (resource && !isProtectedResourceAllowed(resource)) {
			return oauthError("invalid_target", "resource must be an HTTPS or loopback protected resource URL");
		}
		const client = await loadOAuthClient(clientId);
		if (!client || !assertRedirectAllowed(client, redirectUri)) {
			return oauthError("invalid_client", "OAuth client or redirect_uri is invalid", 401);
		}

		const requestedScopes = normalizeScopes(
			url.searchParams.get("scope"),
			isFirstPartyCliClient(client.id)
				? ["openid", "profile", "email"]
				: ["openid", "profile", "email", GATEWAY_ACCESS_SCOPE],
		);
		const scopes = filterAllowedScopes(client, requestedScopes);
		if (scopes.length !== requestedScopes.length) {
			return oauthError("invalid_scope", "One or more requested scopes are not allowed for this client");
		}
		if (!isFirstPartyCliClient(client.id) && !resource && !scopes.includes(GATEWAY_ACCESS_SCOPE)) {
			return oauthError("invalid_scope", `${GATEWAY_ACCESS_SCOPE} is required for third-party OAuth`);
		}

		const params = new URLSearchParams();
		for (const key of ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method", "resource"]) {
			const value = url.searchParams.get(key);
			if (value) params.set(key, value);
		}
		return Response.redirect(authorizationConsentUrl(params), 302);
	}),
);

oauthRouter.post(
	"/authorize/approve",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		if (!(await checkOAuthRateLimit(req, "token", `authorize-approve:${actor.userId}`))) return rateLimitError();

		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}

		const clientId = String(body.client_id ?? "").trim();
		const redirectUri = String(body.redirect_uri ?? "").trim();
		const workspaceId = String(
			body.primary_workspace_id ??
				body.workspace_id ??
				"",
		).trim();
		const workspaceIds = normalizeWorkspaceIds(body.workspace_ids);
		const codeChallenge = String(body.code_challenge ?? "").trim();
		const codeChallengeMethod = String(body.code_challenge_method ?? "S256").trim();
		const resource = String(body.resource ?? "").trim();
		const state = typeof body.state === "string" ? body.state : null;
		if (!clientId || !redirectUri || !workspaceId || !isValidPkceChallenge(codeChallenge) || codeChallengeMethod !== "S256") {
			return oauthError("invalid_request", "client_id, redirect_uri, workspace_id, and S256 PKCE are required");
		}
		if (clientId.length > 256 || redirectUri.length > 2048 || (state?.length ?? 0) > 2048) {
			return oauthError("invalid_request", "OAuth request parameters are too large");
		}
		if (resource && !isProtectedResourceAllowed(resource)) {
			return oauthError("invalid_target", "resource must be an HTTPS or loopback protected resource URL");
		}

		const client = await loadOAuthClient(clientId);
		if (!client || !assertRedirectAllowed(client, redirectUri)) {
			return oauthError("invalid_client", "OAuth client or redirect_uri is invalid", 401);
		}
		const requestedScopes = normalizeScopes(
			body.scopes,
			isFirstPartyCliClient(client.id)
				? ["openid", "profile", "email"]
				: ["openid", "profile", "email", GATEWAY_ACCESS_SCOPE],
		);
		const scopes = filterAllowedScopes(client, requestedScopes);
		if (scopes.length !== requestedScopes.length) {
			return oauthError("invalid_scope", "One or more requested scopes are not allowed for this client");
		}
		if (!isFirstPartyCliClient(client.id) && !resource && !scopes.includes(GATEWAY_ACCESS_SCOPE)) {
			return oauthError("invalid_scope", `${GATEWAY_ACCESS_SCOPE} is required for third-party OAuth`);
		}
		const selectedWorkspaceIds = Array.from(new Set([...workspaceIds, workspaceId]));
		const supabase = getSupabaseAdmin();
		const memberships = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", actor.userId)
			.in("workspace_id", selectedWorkspaceIds);
		if (memberships.error) {
			return oauthStorageError("oauth.authorization.memberships", memberships.error);
		}
		const grantedWorkspaceIds = new Set(
			(memberships.data ?? []).map((row: { workspace_id?: unknown }) => String(row.workspace_id ?? "").trim()).filter(Boolean),
		);
		if (!selectedWorkspaceIds.every((candidate) => grantedWorkspaceIds.has(candidate))) {
			return oauthError("access_denied", "User is not a member of one or more selected workspaces", 403);
		}

		await ensureGrants({
			userId: actor.userId,
			workspaceIds: selectedWorkspaceIds,
			clientId: client.id,
			scopes,
		});
		const code = createOpaqueCode();
		const insert = await supabase.from("oauth_authorization_codes").insert({
			code_hash: await hashOAuthSecret(code),
			client_id: client.id,
			user_id: actor.userId,
			workspace_id: workspaceId,
			redirect_uri: redirectUri,
			scopes,
			code_challenge: codeChallenge,
			code_challenge_method: codeChallengeMethod,
			...(resource ? { resource } : {}),
			expires_at: makeAuthCodeExpiry(),
		});
		if (insert.error) return oauthStorageError("oauth.authorization_code.insert", insert.error);

		const redirect = new URL(redirectUri);
		redirect.searchParams.set("code", code);
		if (state) redirect.searchParams.set("state", state);
		return json({ redirect_url: redirect.toString() }, 200, { "Cache-Control": "no-store" });
	}),
);

oauthRouter.post(
	"/device/activate",
	withRuntime(async (req) => {
		const actor = await requireSupabaseActor(req);
		if (!actor) return oauthError("access_denied", "User session is required", 401);
		if (!(await checkOAuthRateLimit(req, "strict", `device-activate:${actor.userId}`))) return rateLimitError();

		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}

		const userCode = normalizeUserCode(String(body.user_code ?? ""));
		const action = String(body.action ?? "lookup");
		const workspaceId = String(body.workspace_id ?? "").trim();
		if (!userCode) return oauthError("invalid_request", "user_code is required");

		const supabase = getSupabaseAdmin();
		const { data: device, error } = await supabase
			.from("oauth_device_codes")
			.select("id, client_id, scopes, status, expires_at")
			.in("user_code_hash", await hashOAuthSecretCandidates(userCode))
			.maybeSingle();
		if (error) return oauthStorageError("oauth.device_activation.lookup", error);
		if (!device || Date.parse(String(device.expires_at)) <= Date.now()) {
			return oauthError("expired_token", "Device code was not found or has expired", 400);
		}
		const client = await loadOAuthClient(String(device.client_id));
		if (!client) return oauthError("invalid_client", "OAuth client is unavailable", 400);
		if (!isFirstPartyCliClient(client.id)) {
			return oauthError("invalid_client", "Device authorization is only available to the Phaseo CLI", 400);
		}

		if (action === "lookup") {
			return json(
				{
					client: {
						id: client.id,
						name: client.name,
						description: client.description ?? null,
						logo_url: client.logo_url ?? null,
					},
					scopes: Array.isArray(device.scopes) ? device.scopes : [],
					status: device.status,
				},
				200,
				{ "Cache-Control": "no-store" },
			);
		}
		if (device.status !== "pending") {
			return oauthError("invalid_grant", "Device code is no longer pending");
		}
		if (action === "deny") {
			const deny = await supabase
				.from("oauth_device_codes")
				.update({ status: "denied", denied_at: new Date().toISOString(), user_id: actor.userId })
				.eq("id", device.id)
				.eq("status", "pending")
				.select("id")
				.maybeSingle();
			if (deny.error) return oauthStorageError("oauth.device_activation.deny", deny.error);
			if (!deny.data) return oauthError("invalid_grant", "Device code is no longer pending");
			return json({ ok: true }, 200, { "Cache-Control": "no-store" });
		}
		if (action !== "approve" || !workspaceId) {
			return oauthError("invalid_request", "action must be lookup, approve, or deny");
		}

		const membership = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("workspace_id", workspaceId)
			.eq("user_id", actor.userId)
			.maybeSingle();
		if (membership.error || !membership.data) {
			return oauthError("access_denied", "User is not a member of the selected workspace", 403);
		}
		const scopes = Array.isArray(device.scopes) ? device.scopes.map(String) : [];
		await ensureGrant({ userId: actor.userId, workspaceId, clientId: client.id, scopes });
		const approve = await supabase
			.from("oauth_device_codes")
			.update({
				status: "approved",
				approved_at: new Date().toISOString(),
				user_id: actor.userId,
				workspace_id: workspaceId,
			})
			.eq("id", device.id)
			.eq("status", "pending")
			.select("id")
			.maybeSingle();
		if (approve.error) return oauthStorageError("oauth.device_activation.approve", approve.error);
		if (!approve.data) return oauthError("invalid_grant", "Device code is no longer pending");
		return json({ ok: true }, 200, { "Cache-Control": "no-store" });
	}),
);

oauthRouter.post(
	"/token",
	withRuntime(async (req) => {
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const grantType = String(body.grant_type ?? "").trim();
		if (!(await checkOAuthRateLimit(req, "token", grantType || "unknown-grant"))) {
			return rateLimitError(grantType === "urn:ietf:params:oauth:grant-type:device_code" ? "slow_down" : undefined);
		}
		const supabase = getSupabaseAdmin();

		if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
			const deviceCode = String(body.device_code ?? "").trim();
			const clientId = String(body.client_id ?? CLI_CLIENT_ID).trim();
			if (!deviceCode) return oauthError("invalid_request", "device_code is required");
			const { data, error } = await supabase
				.from("oauth_device_codes")
				.select("id, client_id, user_id, workspace_id, scopes, status, expires_at, consumed_at")
				.in("device_code_hash", await hashOAuthSecretCandidates(deviceCode))
				.eq("client_id", clientId)
				.maybeSingle();
			if (error) return oauthStorageError("oauth.device_token.lookup", error);
			if (!data || Date.parse(String(data.expires_at)) <= Date.now()) {
				return oauthError("expired_token", "Device code has expired");
			}
			if (!isFirstPartyCliClient(String(data.client_id))) {
				return oauthError("invalid_grant", "Device authorization is only available to the Phaseo CLI");
			}
			if (data.status === "denied") return oauthError("access_denied", "The user denied this device request");
			if (data.status !== "approved") {
				const poll = await supabase.rpc("enforce_oauth_device_poll_interval", { p_device_id: data.id });
				if (poll.error) return oauthStorageError("oauth.device_token.poll", poll.error);
				if (poll.data === "slow_down") {
					return oauthError("slow_down", "Device token polling is too frequent", 400);
				}
				return oauthError("authorization_pending", "Authorization is still pending");
			}
			if (data.consumed_at) return oauthError("invalid_grant", "Device code has already been consumed");
			if (!(await hasActiveOAuthWorkspaceAccess({
				userId: String(data.user_id),
				workspaceId: String(data.workspace_id),
				clientId: String(data.client_id),
			}))) {
				return oauthError("invalid_grant", "Device authorization is no longer valid");
			}
			try {
				const tokens = await issueTokenPairForGrant(
					{ type: "device_code", id: String(data.id) },
					{
						userId: String(data.user_id),
						workspaceId: String(data.workspace_id),
						clientId: String(data.client_id),
						scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
					},
				);
				if (!tokens) return oauthError("invalid_grant", "Device code has already been consumed");
				return json(tokens, 200, { "Cache-Control": "no-store" });
			} catch (error) {
				console.error("oauth_device_token_issue_failed", {
					clientId: String(data.client_id),
					message: error instanceof Error ? error.message : String(error),
				});
				return oauthError("server_error", "Failed to issue OAuth token", 500);
			}
		}

		if (grantType === "authorization_code") {
			const code = String(body.code ?? "").trim();
			const { clientId, clientSecret } = readClientCredentials(req, body);
			const redirectUri = String(body.redirect_uri ?? "").trim();
			const verifier = String(body.code_verifier ?? "").trim();
			if (!code || !clientId || !redirectUri || !verifier) {
				return oauthError("invalid_request", "code, client_id, redirect_uri, and code_verifier are required");
			}
			const client = await loadOAuthClient(clientId);
			if (!client || !assertRedirectAllowed(client, redirectUri)) {
				return oauthError("invalid_client", "OAuth client or redirect_uri is invalid", 401);
			}
			if (!(await verifyClientSecret(client, clientSecret))) {
				return oauthError("invalid_client", "OAuth client authentication failed", 401);
			}
			const requestedResource = String(body.resource ?? "").trim();
			let { data, error } = await supabase
				.from("oauth_authorization_codes")
				.select("id, client_id, user_id, workspace_id, redirect_uri, scopes, code_challenge, code_challenge_method, resource, expires_at, used_at")
				.in("code_hash", await hashOAuthSecretCandidates(code))
				.eq("client_id", client.id)
				.maybeSingle();
			// During a rolling deployment, non-resource clients remain compatible
			// with the schema from immediately before OAuth resource indicators.
			if (
				error &&
				!requestedResource &&
				/(?:resource.*column|column.*resource|resource.*schema cache)/i.test(error.message)
			) {
				const legacyResult = await supabase
					.from("oauth_authorization_codes")
					.select("id, client_id, user_id, workspace_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used_at")
					.in("code_hash", await hashOAuthSecretCandidates(code))
					.eq("client_id", client.id)
					.maybeSingle();
				data = legacyResult.data ? { ...legacyResult.data, resource: null } : null;
				error = legacyResult.error;
			}
			if (error) return oauthStorageError("oauth.authorization_code.lookup", error);
			if (!data || data.used_at || Date.parse(String(data.expires_at)) <= Date.now()) {
				return oauthError("invalid_grant", "Authorization code is invalid or expired");
			}
			if (String(data.redirect_uri) !== redirectUri) {
				return oauthError("invalid_grant", "redirect_uri does not match");
			}
			const resource = requestedResource;
			const grantedResource = String(data.resource ?? "").trim();
			if (resource !== grantedResource) {
				return oauthError("invalid_target", "resource does not match the authorization request");
			}
			if (!(await verifyPkce({
				codeVerifier: verifier,
				codeChallenge: String(data.code_challenge),
				method: String(data.code_challenge_method),
			}))) {
				return oauthError("invalid_grant", "PKCE verification failed");
			}
			if (!(await hasActiveOAuthWorkspaceAccess({
				userId: String(data.user_id),
				workspaceId: String(data.workspace_id),
				clientId: String(data.client_id),
			}))) {
				return oauthError("invalid_grant", "OAuth workspace access is no longer active");
			}
			const tokenInput = {
				userId: String(data.user_id),
				workspaceId: String(data.workspace_id),
				clientId: String(data.client_id),
				scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
				...(grantedResource ? { resource: grantedResource } : {}),
			};
			if (
				!isFirstPartyCliClient(client.id) &&
				!grantedResource &&
				!tokenInput.scopes.includes(GATEWAY_ACCESS_SCOPE)
			) {
				return oauthError("invalid_scope", `${GATEWAY_ACCESS_SCOPE} consent is required for a delegated key`);
			}
			// The CLI retains refreshable sessions for `login`, logout, and token
			// renewal. Third-party PKCE clients receive durable user-funded keys.
			const tokens = isFirstPartyCliClient(client.id)
				? await issueTokenPairForGrant(
					{ type: "authorization_code", id: String(data.id) },
					tokenInput,
				)
				: await issueOAuthManagedKeyForAuthorizationCode(String(data.id), tokenInput);
			if (!tokens) return oauthError("invalid_grant", "Authorization code is invalid or expired");
			return json(tokens, 200, { "Cache-Control": "no-store" });
		}

		if (grantType === "refresh_token") {
			const token = String(body.refresh_token ?? "").trim();
			if (!token) return oauthError("invalid_request", "refresh_token is required");
			const { clientId, clientSecret } = readClientCredentials(req, body);
			const next = await rotateRefreshToken(token, {
				clientId: clientId || undefined,
				clientSecret,
			});
			if (next.ok) {
				return json(next.tokens, 200, { "Cache-Control": "no-store" });
			}
			const reason = "reason" in next ? next.reason : "invalid_grant";
			if (reason === "invalid_client") {
				return oauthError("invalid_client", "OAuth client authentication failed", 401);
			}
			return oauthError("invalid_grant", "Refresh token is invalid or expired", 401);
		}

		return oauthError("unsupported_grant_type", "Unsupported grant_type");
	}),
);

oauthRouter.post(
	"/mcp/token-exchange",
	withRuntime(async (req) => {
		if (!(await checkOAuthRateLimit(req, "token", "mcp-token-exchange"))) return rateLimitError();
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}

		const configuredSecret = String(getBindings().PHASEO_MCP_RESOURCE_SERVER_SECRET ?? "").trim();
		const credentials = readClientCredentials(req, body);
		if (
			configuredSecret.length < 64 ||
			credentials.clientId !== MCP_RESOURCE_SERVER_CLIENT_ID ||
			!credentials.clientSecret ||
			credentials.clientSecret.length > 512 ||
			!constantTimeEqualText(credentials.clientSecret, configuredSecret)
		) {
			return oauthError("invalid_client", "MCP resource server authentication failed", 401, {
				"WWW-Authenticate": 'Basic realm="Phaseo MCP token exchange"',
			});
		}

		const subjectToken = String(body.subject_token ?? "").trim();
		const resource = String(body.resource ?? "").trim();
		if (!subjectToken || !resource || !isProtectedResourceAllowed(resource)) {
			return oauthError("invalid_request", "subject_token and a valid protected resource are required");
		}
		const tokenRequest = new Request(req.url, {
			headers: { Authorization: `Bearer ${subjectToken}` },
		});
		const auth = await authenticateManagement(tokenRequest, {
			useKvCache: false,
			allowResourceBoundOAuthKey: true,
		});
		if (
			!auth.ok ||
			auth.authMethod !== "oauth" ||
			!auth.userId ||
			!auth.oauthClientId ||
			auth.oauthResource !== resource
		) {
			return json({ active: false }, 200, { "Cache-Control": "no-store" });
		}
		const scopes = auth.oauthScopes ?? auth.scopes ?? [];
		const upstream = await issueMcpUpstreamToken({
			userId: auth.userId,
			workspaceId: auth.workspaceId,
			clientId: auth.oauthClientId,
			scopes,
		});
		return json({
			active: true,
			resource,
			workspace_id: auth.workspaceId,
			scope: scopes.join(" "),
			upstream_access_token: upstream.access_token,
			token_type: upstream.token_type,
			expires_in: upstream.expires_in,
		}, 200, { "Cache-Control": "no-store" });
	}),
);

oauthRouter.post(
	"/revoke",
	withRuntime(async (req) => {
		if (!(await checkOAuthRateLimit(req, "token", "revoke"))) return rateLimitError();
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch (error) {
			return invalidBodyError(error);
		}
		const token = String(body.token ?? "").trim();
		if (token) await revokeToken(token);
		return new Response(null, noStore(200));
	}),
);

oauthRouter.get(
	"/userinfo",
	withRuntime(async (req) => {
		const auth = await authenticateManagement(req, {
			useKvCache: false,
			allowResourceBoundOAuthKey: true,
		});
		if (!auth.ok || auth.authMethod !== "oauth" || !auth.userId || !auth.oauthClientId) {
			return oauthError("invalid_token", "Bearer OAuth token is invalid or expired", 401);
		}
		const scopes = auth.oauthScopes ?? auth.scopes ?? [];
		if (!scopes.includes("openid")) {
			return oauthError("insufficient_scope", "Token requires openid", 403);
		}
		const { data } = await getSupabaseAdmin().auth.admin.getUserById(auth.userId);
		const user = data?.user;
		const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
		const name =
			typeof metadata.full_name === "string"
				? metadata.full_name
				: typeof metadata.name === "string"
					? metadata.name
					: null;
		return json(
			{
				sub: auth.userId,
				email: scopes.includes("email") ? user?.email ?? null : undefined,
				name: scopes.includes("profile") ? name : undefined,
				workspace_id: auth.workspaceId,
				client_id: auth.oauthClientId,
				resource: auth.oauthResource ?? undefined,
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	}),
);

oauthRouter.get(
	"/.well-known/openid-configuration",
	withRuntime(async () =>
		json(
			oauthAuthorizationServerMetadata(),
			200,
			{ "Cache-Control": "public, max-age=300" },
			),
	),
);

// MCP clients discover OAuth authorization servers through RFC 8414 metadata,
// rather than OpenID Connect discovery. Keep both documents aligned because
// Phaseo supports OIDC identity scopes and MCP's OAuth 2.1 authorization flow.
oauthRouter.get(
	"/.well-known/oauth-authorization-server",
	withRuntime(async () =>
		json(
			oauthAuthorizationServerMetadata(),
			200,
			{ "Cache-Control": "public, max-age=300" },
		),
	),
);

oauthRouter.get(
	"/.well-known/jwks.json",
	withRuntime(async () => json(await getLocalJwks(), 200, { "Cache-Control": "public, max-age=300" })),
);
