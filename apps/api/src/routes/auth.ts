import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/runtime/types";
import { decodeJWT } from "@/lib/oauth/jwt";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";

const authRouter = new Hono<Env>();

const DEFAULT_SCOPE = "openid email profile gateway:access";
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const KEY_PREFIX = "aistats_v1_sk_";
const encoder = new TextEncoder();

const exchangeSchema = z.object({
	code: z.string().min(1, "code is required"),
	redirect_uri: z.string().url("redirect_uri must be a valid URL"),
	client_id: z.string().min(1).optional(),
	client_secret: z.string().min(1).optional(),
	code_verifier: z.string().min(1).optional(),
	key_name: z.string().min(1).max(100).optional(),
	include_tokens: z.boolean().optional(),
	scopes: z.union([z.string(), z.array(z.string())]).optional(),
});

type OAuthAppMetadataRow = {
	client_id: string;
	team_id: string;
	name: string | null;
	status: string;
	redirect_uris: string[] | null;
};

type ResolveOAuthAppResult =
	| { ok: true; app: OAuthAppMetadataRow }
	| { ok: false; response: Response };

function normalizeSupabaseBase(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/auth/v1")) {
		return trimmed.slice(0, -"/auth/v1".length);
	}
	return trimmed;
}

function randomBase62(length: number): string {
	const unbiasedLimit = Math.floor(256 / BASE62.length) * BASE62.length;
	let out = "";
	while (out.length < length) {
		const bytes = crypto.getRandomValues(new Uint8Array(length));
		for (let i = 0; i < bytes.length && out.length < length; i++) {
			const value = bytes[i];
			if (value >= unbiasedLimit) continue;
			out += BASE62[value % BASE62.length];
		}
	}
	return out;
}

function generateGatewayKey() {
	const kid = randomBase62(12);
	const secret = randomBase62(40);
	const plaintext = `${KEY_PREFIX}${kid}_${secret}`;
	const prefix = kid.slice(0, 6);
	return { kid, secret, plaintext, prefix };
}

async function hmacSecret(secret: string, pepper: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(pepper),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(secret));
	const bytes = new Uint8Array(signature);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

function normalizeScopeInput(scopes: unknown): { ok: true; value: string } | { ok: false; message: string } {
	if (scopes === undefined || scopes === null) {
		return { ok: true, value: "[]" };
	}
	if (typeof scopes === "string") {
		const trimmed = scopes.trim();
		return { ok: true, value: trimmed.length ? trimmed : "[]" };
	}
	if (Array.isArray(scopes)) {
		const normalized = scopes.map((entry) => String(entry));
		return { ok: true, value: JSON.stringify(normalized) };
	}
	return { ok: false, message: "scopes must be a string or string[]" };
}

function timingSafeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i++) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function resolveOAuthApp(args: { clientId?: string | null; redirectUri: string }): Promise<ResolveOAuthAppResult> {
	const supabase = getSupabaseAdmin();
	const clientId = args.clientId?.trim() || null;
	if (clientId) {
		const { data, error } = await supabase
			.from("oauth_app_metadata")
			.select("client_id, team_id, name, status, redirect_uris")
			.eq("client_id", clientId)
			.eq("status", "active")
			.maybeSingle();
		if (error) {
			return {
				ok: false,
				response: json(
					{ ok: false, error: "oauth_app_lookup_failed", message: error.message },
					500,
					{ "Cache-Control": "no-store" },
				),
			};
		}
		if (!data) {
			return {
				ok: false,
				response: json(
					{ ok: false, error: "oauth_app_not_found", message: "OAuth app not found or inactive" },
					404,
					{ "Cache-Control": "no-store" },
				),
			};
		}
		const registeredRedirects = Array.isArray((data as any).redirect_uris)
			? ((data as any).redirect_uris as string[])
			: [];
		if (registeredRedirects.length === 0) {
			return {
				ok: false,
				response: json(
					{
						ok: false,
						error: "oauth_app_redirects_unconfigured",
						message: "OAuth app has no registered redirect_uris",
					},
					400,
					{ "Cache-Control": "no-store" },
				),
			};
		}
		if (!registeredRedirects.some((uri) => timingSafeEqual(uri, args.redirectUri))) {
			return {
				ok: false,
				response: json(
					{
						ok: false,
						error: "redirect_uri_not_registered",
						message: "redirect_uri is not registered for this OAuth app",
					},
					400,
					{ "Cache-Control": "no-store" },
				),
			};
		}
		return { ok: true, app: data as OAuthAppMetadataRow };
	}

	const { data, error } = await supabase
		.from("oauth_app_metadata")
		.select("client_id, team_id, name, status, redirect_uris")
		.eq("status", "active")
		.contains("redirect_uris", [args.redirectUri])
		.limit(2);
	if (error) {
		return {
			ok: false,
			response: json(
				{ ok: false, error: "oauth_app_lookup_failed", message: error.message },
				500,
				{ "Cache-Control": "no-store" },
			),
		};
	}
	if (!data || data.length === 0) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "oauth_app_not_found_by_redirect_uri",
					message: "No active OAuth app found for this redirect_uri",
				},
				404,
				{ "Cache-Control": "no-store" },
			),
		};
	}
	if (data.length > 1) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "oauth_app_ambiguous_redirect_uri",
					message: "Multiple OAuth apps match this redirect_uri; provide client_id explicitly",
				},
				409,
				{ "Cache-Control": "no-store" },
			),
		};
	}
	return { ok: true, app: data[0] as OAuthAppMetadataRow };
}

function parseRedirectUriFromQuery(url: URL): string | null {
	const redirectUri = url.searchParams.get("redirect_uri")?.trim();
	return redirectUri || null;
}

function applyCorsHeaders(headers: Headers) {
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

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
		const pepper = String(bindings.KEY_PEPPER ?? "").trim();
		if (!pepper) {
			return json(
				{ ok: false, error: "server_misconfig", message: "KEY_PEPPER is not configured" },
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
