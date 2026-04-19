import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { decodeJWT } from "@/lib/oauth/jwt";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { resolveActiveKeyPepper } from "@/lib/security/keyPepper";
import { json, withRuntime } from "@/routes/utils";

import {
	DEFAULT_SCOPE,
	applyCorsHeaders,
	exchangeSchema,
	generateGatewayKey,
	hmacSecret,
	normalizeScopeInput,
	normalizeSupabaseBase,
	parseRedirectUriFromQuery,
	resolveOAuthApp,
	safeJsonParse,
	timingSafeEqual,
} from "./auth.helpers";

const authRouter = new Hono<Env>();

authRouter.use("*", async (c, next) => {
	if (c.req.method === "OPTIONS") {
		const headers = new Headers();
		applyCorsHeaders(headers);
		return new Response(null, { status: 204, headers });
	}
	await next();
	const headers = new Headers(c.res.headers);
	applyCorsHeaders(headers);
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
});

authRouter.get(
	"/",
	withRuntime(async (req) => {
		const url = new URL(req.url);
		const redirectUri = parseRedirectUriFromQuery(url);
		if (!redirectUri) {
			return json(
				{
					ok: false,
					error: "redirect_uri_required",
					message: "Provide redirect_uri",
				},
				400,
				{ "Cache-Control": "no-store" },
			);
		}
		try {
			new URL(redirectUri);
		} catch {
			return json(
				{
					ok: false,
					error: "invalid_redirect_uri",
					message: "redirect_uri must be a valid URL",
				},
				400,
				{ "Cache-Control": "no-store" },
			);
		}

		const resolvedApp = await resolveOAuthApp({
			clientId: url.searchParams.get("client_id"),
			redirectUri,
		});
		if (resolvedApp.ok === false) {
			return resolvedApp.response;
		}

		const bindings = getBindings();
		const supabaseUrl = String(bindings.SUPABASE_URL ?? "").trim();
		if (!supabaseUrl) {
			return json(
				{
					ok: false,
					error: "server_misconfig",
					message: "SUPABASE_URL is not configured",
				},
				503,
				{ "Cache-Control": "no-store" },
			);
		}

		const authBase = normalizeSupabaseBase(supabaseUrl);
		const params = new URLSearchParams();
		params.set("client_id", resolvedApp.app.client_id);
		params.set("redirect_uri", redirectUri);
		params.set("response_type", url.searchParams.get("response_type")?.trim() || "code");
		params.set("scope", url.searchParams.get("scope")?.trim() || DEFAULT_SCOPE);

		const passthroughParams = ["state", "code_challenge", "code_challenge_method", "nonce", "prompt"];
		for (const key of passthroughParams) {
			const value = url.searchParams.get(key)?.trim();
			if (value) params.set(key, value);
		}
		if (params.has("code_challenge") && !params.has("code_challenge_method")) {
			params.set("code_challenge_method", "S256");
		}

		const authorizeUrl = `${authBase}/auth/v1/oauth/authorize?${params.toString()}`;
		return Response.redirect(authorizeUrl, 302);
	}),
);

authRouter.post(
	"/exchange",
	withRuntime(async (req) => {
		let body: unknown;
		try {
			body = await req.json();
		} catch {
			return json({ ok: false, error: "invalid_json" }, 400, { "Cache-Control": "no-store" });
		}

		const parsed = exchangeSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					ok: false,
					error: "validation_error",
					details: parsed.error.issues,
				},
				400,
				{ "Cache-Control": "no-store" },
			);
		}

		const input = parsed.data;
		const resolvedApp = await resolveOAuthApp({
			clientId: input.client_id,
			redirectUri: input.redirect_uri,
		});
		if (resolvedApp.ok === false) {
			return resolvedApp.response;
		}

		const scopeInput = normalizeScopeInput(input.scopes);
		if (scopeInput.ok === false) {
			return json(
				{ ok: false, error: "invalid_scopes", message: scopeInput.message },
				400,
				{ "Cache-Control": "no-store" },
			);
		}

		const bindings = getBindings();
		const supabaseUrl = String(bindings.SUPABASE_URL ?? "").trim();
		if (!supabaseUrl) {
			return json(
				{ ok: false, error: "server_misconfig", message: "SUPABASE_URL is not configured" },
				503,
				{ "Cache-Control": "no-store" },
			);
		}
		const pepper = resolveActiveKeyPepper(bindings);
		if (!pepper) {
			return json(
				{
					ok: false,
					error: "server_misconfig",
					message: "KEY_PEPPER_ACTIVE (or KEY_PEPPER) is not configured",
				},
				503,
				{ "Cache-Control": "no-store" },
			);
		}

		const tokenPayload: Record<string, string> = {
			grant_type: "authorization_code",
			code: input.code,
			redirect_uri: input.redirect_uri,
			client_id: resolvedApp.app.client_id,
		};
		if (input.client_secret?.trim()) {
			tokenPayload.client_secret = input.client_secret.trim();
		}
		if (input.code_verifier?.trim()) {
			tokenPayload.code_verifier = input.code_verifier.trim();
		}

		const tokenUrl = `${normalizeSupabaseBase(supabaseUrl)}/auth/v1/oauth/token`;
		const tokenRes = await fetch(tokenUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(tokenPayload),
		});
		const tokenText = await tokenRes.text();
		const tokenBody = safeJsonParse(tokenText);
		if (!tokenRes.ok) {
			return json(
				{
					ok: false,
					error: "token_exchange_failed",
					status: tokenRes.status,
					upstream: tokenBody,
				},
				tokenRes.status >= 500 ? 502 : 400,
				{ "Cache-Control": "no-store" },
			);
		}

		const accessToken =
			tokenBody && typeof tokenBody === "object" && typeof (tokenBody as any).access_token === "string"
				? ((tokenBody as any).access_token as string)
				: null;
		if (!accessToken) {
			return json(
				{
					ok: false,
					error: "token_exchange_invalid_response",
					message: "OAuth token response did not include access_token",
				},
				502,
				{ "Cache-Control": "no-store" },
			);
		}

		const decoded = decodeJWT(accessToken);
		const claims = decoded?.payload ?? {};
		const oauthUserId = typeof claims.user_id === "string" ? claims.user_id : null;
		const oauthTeamId = typeof claims.team_id === "string" ? claims.team_id : null;
		const oauthClientId = typeof claims.client_id === "string" ? claims.client_id : null;
		if (!oauthUserId || !oauthTeamId || !oauthClientId) {
			return json(
				{
					ok: false,
					error: "token_claims_missing",
					message: "Expected user_id, team_id, and client_id claims in access token",
				},
				400,
				{ "Cache-Control": "no-store" },
			);
		}
		if (!timingSafeEqual(oauthClientId, resolvedApp.app.client_id)) {
			return json(
				{
					ok: false,
					error: "token_client_mismatch",
					message: "OAuth token client_id does not match resolved app",
				},
				400,
				{ "Cache-Control": "no-store" },
			);
		}

		const supabase = getSupabaseAdmin();
		const { data: authorization, error: authorizationError } = await supabase
			.from("oauth_authorizations")
			.select("id")
			.eq("client_id", oauthClientId)
			.eq("team_id", oauthTeamId)
			.eq("user_id", oauthUserId)
			.is("revoked_at", null)
			.maybeSingle();
		if (authorizationError) {
			return json(
				{ ok: false, error: "authorization_lookup_failed", message: authorizationError.message },
				500,
				{ "Cache-Control": "no-store" },
			);
		}
		if (!authorization) {
			return json(
				{
					ok: false,
					error: "authorization_not_found",
					message: "No active OAuth authorization found for this user/team/client",
				},
				403,
				{ "Cache-Control": "no-store" },
			);
		}

		const keyName = input.key_name?.trim() || `${resolvedApp.app.name ?? "OAuth app"} access key`;
		for (let attempt = 0; attempt < 3; attempt++) {
			const generated = generateGatewayKey();
			const hash = await hmacSecret(generated.secret, pepper);
			const insertResult = await supabase
				.from("keys")
				.insert({
					team_id: oauthTeamId,
					name: keyName,
					kid: generated.kid,
					hash,
					prefix: generated.prefix,
					status: "active",
					scopes: scopeInput.value,
					created_by: oauthUserId,
					daily_limit_requests: 0,
					weekly_limit_requests: 0,
					monthly_limit_requests: 0,
					daily_limit_cost_nanos: 0,
					weekly_limit_cost_nanos: 0,
					monthly_limit_cost_nanos: 0,
				})
				.select("id, team_id, name, prefix, status, created_by, created_at")
				.maybeSingle();

			if (!insertResult.error && insertResult.data) {
				const responsePayload: Record<string, unknown> = {
					ok: true,
					key: {
						id: insertResult.data.id,
						team_id: insertResult.data.team_id,
						name: insertResult.data.name,
						prefix: insertResult.data.prefix,
						status: insertResult.data.status,
						created_by: insertResult.data.created_by,
						created_at: insertResult.data.created_at,
						plaintext: generated.plaintext,
					},
					oauth: {
						client_id: oauthClientId,
						user_id: oauthUserId,
						team_id: oauthTeamId,
						scope:
							tokenBody && typeof tokenBody === "object" && typeof (tokenBody as any).scope === "string"
								? (tokenBody as any).scope
								: null,
					},
				};
				if (input.include_tokens) {
					responsePayload.tokens = tokenBody;
				}
				return json(responsePayload, 201, { "Cache-Control": "no-store" });
			}

			const errorCode = (insertResult.error as { code?: string } | null)?.code;
			if (errorCode === "23505" && attempt < 2) {
				continue;
			}
			return json(
				{
					ok: false,
					error: "key_insert_failed",
					message: insertResult.error?.message ?? "Failed to create key",
				},
				500,
				{ "Cache-Control": "no-store" },
			);
		}

		return json(
			{
				ok: false,
				error: "key_generation_failed",
				message: "Failed to generate a unique key after multiple attempts",
			},
			500,
			{ "Cache-Control": "no-store" },
		);
	}),
);

export { authRouter };
