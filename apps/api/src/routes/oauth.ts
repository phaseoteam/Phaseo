import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { ALL_SUPPORTED_SCOPES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "@/routes/utils";
import {
	CLI_CLIENT_ID,
	CLI_DEFAULT_SCOPES,
	assertRedirectAllowed,
	authorizationConsentUrl,
	bearerToken,
	claimsScopes,
	createOpaqueCode,
	createUserCode,
	defaultDeviceIntervalSeconds,
	deviceExpiresInSeconds,
	filterAllowedScopes,
	getApiBaseUrl,
	getIssuer,
	getLocalJwks,
	getSupabaseActor,
	hashOAuthSecret,
	issueTokenPair,
	loadOAuthClient,
	makeAuthCodeExpiry,
	makeDeviceCodeExpiry,
	normalizeScopes,
	normalizeUserCode,
	parseTokenRequestBody,
	revokeToken,
	rotateRefreshToken,
	validateLocalAccessToken,
	verificationUriFor,
	verifyPkce,
	ensureGrant,
	ensureGrants,
	verifyClientSecret,
} from "@/lib/oauth/service";

export const oauthRouter = new Hono<Env>();

function noStore(status = 200) {
	return { status, headers: { "Cache-Control": "no-store" } };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
	const text = await req.text();
	return parseTokenRequestBody(text, req.headers.get("content-type"));
}

function oauthError(error: string, description: string, status = 400) {
	return json({ error, error_description: description }, status, { "Cache-Control": "no-store" });
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
			const decoded = atob(authorization.slice(6).trim());
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

async function requireSupabaseActor(req: Request) {
	const token = bearerToken(req);
	if (!token) return null;
	return getSupabaseActor(token);
}

oauthRouter.post(
	"/device/code",
	withRuntime(async (req) => {
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch {
			return oauthError("invalid_request", "Request body must be JSON or form encoded");
		}

		const clientId = String(body.client_id ?? CLI_CLIENT_ID).trim();
		const client = await loadOAuthClient(clientId);
		if (!client || client.client_type !== "public") {
			return oauthError("invalid_client", "Unknown or unsupported OAuth client", 401);
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
			return oauthError("server_error", error.message, 500);
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

		if (responseType !== "code") {
			return oauthError("unsupported_response_type", "Only response_type=code is supported");
		}
		if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
			return oauthError("invalid_request", "client_id, redirect_uri, and S256 PKCE are required");
		}
		const client = await loadOAuthClient(clientId);
		if (!client || !assertRedirectAllowed(client, redirectUri)) {
			return oauthError("invalid_client", "OAuth client or redirect_uri is invalid", 401);
		}

		const requestedScopes = normalizeScopes(url.searchParams.get("scope"), ["openid", "profile", "email"]);
		const scopes = filterAllowedScopes(client, requestedScopes);
		if (scopes.length !== requestedScopes.length) {
			return oauthError("invalid_scope", "One or more requested scopes are not allowed for this client");
		}

		const params = new URLSearchParams();
		for (const key of ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method"]) {
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

		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch {
			return oauthError("invalid_request", "Request body must be JSON or form encoded");
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
		const state = typeof body.state === "string" ? body.state : null;
		if (!clientId || !redirectUri || !workspaceId || !codeChallenge || codeChallengeMethod !== "S256") {
			return oauthError("invalid_request", "client_id, redirect_uri, workspace_id, and S256 PKCE are required");
		}

		const client = await loadOAuthClient(clientId);
		if (!client || !assertRedirectAllowed(client, redirectUri)) {
			return oauthError("invalid_client", "OAuth client or redirect_uri is invalid", 401);
		}
		const scopes = filterAllowedScopes(client, normalizeScopes(body.scopes, ["openid", "profile", "email"]));
		const selectedWorkspaceIds = Array.from(new Set([...workspaceIds, workspaceId]));
		const supabase = getSupabaseAdmin();
		const memberships = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", actor.userId)
			.in("workspace_id", selectedWorkspaceIds);
		if (memberships.error) {
			return oauthError("server_error", memberships.error.message, 500);
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
			expires_at: makeAuthCodeExpiry(),
		});
		if (insert.error) return oauthError("server_error", insert.error.message, 500);

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

		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch {
			return oauthError("invalid_request", "Request body must be JSON or form encoded");
		}

		const userCode = normalizeUserCode(String(body.user_code ?? ""));
		const action = String(body.action ?? "lookup");
		const workspaceId = String(body.workspace_id ?? "").trim();
		if (!userCode) return oauthError("invalid_request", "user_code is required");

		const supabase = getSupabaseAdmin();
		const { data: device, error } = await supabase
			.from("oauth_device_codes")
			.select("id, client_id, scopes, status, expires_at")
			.eq("user_code_hash", await hashOAuthSecret(userCode))
			.maybeSingle();
		if (error) return oauthError("server_error", error.message, 500);
		if (!device || Date.parse(String(device.expires_at)) <= Date.now()) {
			return oauthError("expired_token", "Device code was not found or has expired", 400);
		}
		const client = await loadOAuthClient(String(device.client_id));
		if (!client) return oauthError("invalid_client", "OAuth client is unavailable", 400);

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
		if (action === "deny") {
			await supabase
				.from("oauth_device_codes")
				.update({ status: "denied", denied_at: new Date().toISOString(), user_id: actor.userId })
				.eq("id", device.id);
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
		await supabase
			.from("oauth_device_codes")
			.update({
				status: "approved",
				approved_at: new Date().toISOString(),
				user_id: actor.userId,
				workspace_id: workspaceId,
			})
			.eq("id", device.id)
			.eq("status", "pending");
		return json({ ok: true }, 200, { "Cache-Control": "no-store" });
	}),
);

oauthRouter.post(
	"/token",
	withRuntime(async (req) => {
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch {
			return oauthError("invalid_request", "Request body must be JSON or form encoded");
		}
		const grantType = String(body.grant_type ?? "").trim();
		const supabase = getSupabaseAdmin();

		if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
			const deviceCode = String(body.device_code ?? "").trim();
			const clientId = String(body.client_id ?? CLI_CLIENT_ID).trim();
			if (!deviceCode) return oauthError("invalid_request", "device_code is required");
			const { data, error } = await supabase
				.from("oauth_device_codes")
				.select("id, client_id, user_id, workspace_id, scopes, status, expires_at, consumed_at")
				.eq("device_code_hash", await hashOAuthSecret(deviceCode))
				.eq("client_id", clientId)
				.maybeSingle();
			if (error) return oauthError("server_error", error.message, 500);
			if (!data || Date.parse(String(data.expires_at)) <= Date.now()) {
				return oauthError("expired_token", "Device code has expired");
			}
			if (data.status === "denied") return oauthError("access_denied", "The user denied this device request");
			if (data.status !== "approved") return oauthError("authorization_pending", "Authorization is still pending");
			if (data.consumed_at) return oauthError("invalid_grant", "Device code has already been consumed");
			await supabase
				.from("oauth_device_codes")
				.update({ consumed_at: new Date().toISOString() })
				.eq("id", data.id)
				.is("consumed_at", null);
			return json(
				await issueTokenPair({
					userId: String(data.user_id),
					workspaceId: String(data.workspace_id),
					clientId: String(data.client_id),
					scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
				}),
				200,
				{ "Cache-Control": "no-store" },
			);
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
			const { data, error } = await supabase
				.from("oauth_authorization_codes")
				.select("id, client_id, user_id, workspace_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used_at")
				.eq("code_hash", await hashOAuthSecret(code))
				.eq("client_id", client.id)
				.maybeSingle();
			if (error) return oauthError("server_error", error.message, 500);
			if (!data || data.used_at || Date.parse(String(data.expires_at)) <= Date.now()) {
				return oauthError("invalid_grant", "Authorization code is invalid or expired");
			}
			if (String(data.redirect_uri) !== redirectUri) {
				return oauthError("invalid_grant", "redirect_uri does not match");
			}
			if (!(await verifyPkce({
				codeVerifier: verifier,
				codeChallenge: String(data.code_challenge),
				method: String(data.code_challenge_method),
			}))) {
				return oauthError("invalid_grant", "PKCE verification failed");
			}
			await supabase
				.from("oauth_authorization_codes")
				.update({ used_at: new Date().toISOString() })
				.eq("id", data.id)
				.is("used_at", null);
			return json(
				await issueTokenPair({
					userId: String(data.user_id),
					workspaceId: String(data.workspace_id),
					clientId: String(data.client_id),
					scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
				}),
				200,
				{ "Cache-Control": "no-store" },
			);
		}

		if (grantType === "refresh_token") {
			const token = String(body.refresh_token ?? "").trim();
			if (!token) return oauthError("invalid_request", "refresh_token is required");
			const { clientId, clientSecret } = readClientCredentials(req, body);
			const next = await rotateRefreshToken(token, {
				clientId: clientId || undefined,
				clientSecret,
			});
			if (!next.ok) {
				if (next.reason === "invalid_client") {
					return oauthError("invalid_client", "OAuth client authentication failed", 401);
				}
				return oauthError("invalid_grant", "Refresh token is invalid or expired", 401);
			}
			return json(next.tokens, 200, { "Cache-Control": "no-store" });
		}

		return oauthError("unsupported_grant_type", "Unsupported grant_type");
	}),
);

oauthRouter.post(
	"/revoke",
	withRuntime(async (req) => {
		let body: Record<string, unknown>;
		try {
			body = await readBody(req);
		} catch {
			return oauthError("invalid_request", "Request body must be JSON or form encoded");
		}
		const token = String(body.token ?? "").trim();
		if (token) await revokeToken(token);
		return new Response(null, noStore(200));
	}),
);

oauthRouter.get(
	"/userinfo",
	withRuntime(async (req) => {
		const token = bearerToken(req);
		if (!token) return oauthError("invalid_token", "Bearer token is required", 401);
		const validation = await validateLocalAccessToken(token);
		if (!validation.valid || !validation.claims) {
			return oauthError("invalid_token", validation.error ?? "Invalid access token", 401);
		}
		const scopes = claimsScopes(validation.claims);
		return json(
			{
				sub: validation.claims.sub,
				email: scopes.includes("email") ? validation.claims.email ?? null : undefined,
				name: scopes.includes("profile") ? (validation.claims as any).name ?? null : undefined,
				workspace_id: validation.claims.workspace_id,
				client_id: validation.claims.client_id,
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
			{
				issuer: getIssuer(),
				authorization_endpoint: `${getApiBaseUrl()}/oauth/authorize`,
				token_endpoint: `${getApiBaseUrl()}/oauth/token`,
				device_authorization_endpoint: `${getApiBaseUrl()}/oauth/device/code`,
				revocation_endpoint: `${getApiBaseUrl()}/oauth/revoke`,
				userinfo_endpoint: `${getApiBaseUrl()}/oauth/userinfo`,
				jwks_uri: `${getApiBaseUrl()}/oauth/.well-known/jwks.json`,
				response_types_supported: ["code"],
				grant_types_supported: [
					"authorization_code",
					"refresh_token",
					"urn:ietf:params:oauth:grant-type:device_code",
				],
				code_challenge_methods_supported: ["S256"],
				scopes_supported: [...ALL_SUPPORTED_SCOPES],
			},
			200,
			{ "Cache-Control": "public, max-age=300" },
			),
		),
	);

oauthRouter.get(
	"/.well-known/jwks.json",
	withRuntime(async () => json(await getLocalJwks(), 200, { "Cache-Control": "public, max-age=300" })),
);
