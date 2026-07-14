// Purpose: Shared OAuth route helper utilities.

import { z } from "zod";
import {
	DEFAULT_MANAGEMENT_KEY_CAPABILITIES,
	normalizeScopeList,
	serializeScopeList,
} from "@/lib/authz/capabilities";
import { isThirdPartyOAuthEnabled } from "@/lib/oauth/service";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";

export const DEFAULT_SCOPE = "openid email profile gateway:access";
export const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const INFERENCE_KEY_PREFIX = "phaseo_v1_sk_";
export const MANAGEMENT_KEY_PREFIX = "phaseo_v1_mk_";
// Kept as an alias while consumers migrate to the explicit inference name.
export const KEY_PREFIX = INFERENCE_KEY_PREFIX;
export const encoder = new TextEncoder();

export const exchangeSchema = z.object({
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
	workspace_id: string;
	name: string | null;
	status: string;
	redirect_uris: string[] | null;
};

type ResolveOAuthAppResult =
	| { ok: true; app: OAuthAppMetadataRow }
	| { ok: false; response: Response };

export function normalizeSupabaseBase(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/auth/v1")) {
		return trimmed.slice(0, -"/auth/v1".length);
	}
	return trimmed;
}

export function randomBase62(length: number): string {
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

function generateKey(tokenPrefix: string) {
	const kid = randomBase62(12);
	const secret = randomBase62(40);
	const plaintext = `${tokenPrefix}${kid}_${secret}`;
	const prefix = kid.slice(0, 6);
	return { kid, secret, plaintext, prefix };
}

export function generateGatewayKey() {
	return generateKey(INFERENCE_KEY_PREFIX);
}

export function generateManagementKey() {
	return generateKey(MANAGEMENT_KEY_PREFIX);
}

export async function hmacSecret(secret: string, pepper: string): Promise<string> {
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

export function normalizeScopeInput(scopes: unknown): { ok: true; value: string } | { ok: false; message: string } {
	const normalized = normalizeScopeList(scopes, {
		allowIdentityScopes: false,
		defaultScopes: DEFAULT_MANAGEMENT_KEY_CAPABILITIES,
	});
	if (normalized.ok === false) {
		return { ok: false, message: normalized.message };
	}
	return { ok: true, value: serializeScopeList(normalized.value) };
}

export function timingSafeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i++) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

export function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export async function resolveOAuthApp(args: { clientId?: string | null; redirectUri: string }): Promise<ResolveOAuthAppResult> {
	if (!isThirdPartyOAuthEnabled()) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "third_party_oauth_disabled",
					message: "OAuth client management is coming soon. The Phaseo CLI is available during the private OAuth beta.",
				},
				403,
				{ "Cache-Control": "no-store" },
			),
		};
	}

	const supabase = getSupabaseAdmin();
	const clientId = args.clientId?.trim() || null;
	if (clientId) {
		const { data, error } = await supabase
			.from("oauth_app_metadata")
			.select("client_id, workspace_id, name, status, redirect_uris")
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
		.select("client_id, workspace_id, name, status, redirect_uris")
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

export function parseRedirectUriFromQuery(url: URL): string | null {
	const redirectUri = url.searchParams.get("redirect_uri")?.trim();
	return redirectUri || null;
}

export function applyCorsHeaders(headers: Headers) {
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
}
