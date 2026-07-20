import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

export type ChatProxyEnvelope = {
	baseUrl?: string;
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
};

type GatewayKeys = { apiKey: string; userId: string; workspaceId: string };
type GatewayKeyError = { status: number; code: string; message: string };
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUBLIC_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";
const ALLOWED_APP_HEADERS = new Set(["x-title", "http-referer", "x-app-id", "x-app-name"]);
const CANONICAL_CHAT_APP_HEADERS = { "x-app-id": "phaseo-chat", "x-app-name": "Phaseo Chat", "x-title": "Phaseo Chat", "http-referer": "https://phaseo.app/chat" };

function cookieValue(request: Request, name: string): string {
	for (const segment of (request.headers.get("cookie") ?? "").split(";")) {
		const separator = segment.indexOf("=");
		if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
		const value = segment.slice(separator + 1).trim();
		try { return decodeURIComponent(value); } catch { return value; }
	}
	return "";
}

async function deterministicBase62(seed: string, length: number): Promise<string> {
	let output = "";
	for (let counter = 0; output.length < length; counter += 1) {
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}:${counter}`)));
		for (const byte of digest) { output += BASE62[byte % BASE62.length]; if (output.length >= length) break; }
	}
	return output.slice(0, length);
}

async function keyHash(pepper: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(secret)));
	return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function truthy(value: unknown): boolean { return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase()); }

async function invalidateGatewayKey(env: Env, keyId: string) {
	const key = env.PHASEO_MANAGEMENT_KEY ?? env.PHASEO_CONTROL_KEY;
	if (!key || !env.PHASEO_CONTROL_SECRET) return;
	await fetch(`${(env.GATEWAY_API_ORIGIN ?? "http://localhost:8787").replace(/\/+$/, "")}/v1/keys/${encodeURIComponent(keyId)}/invalidate`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "x-control-secret": env.PHASEO_CONTROL_SECRET } });
}

async function resolveGatewayKeys(request: Request, env: Env, waitUntil: (promise: Promise<unknown>) => void): Promise<GatewayKeys | GatewayKeyError> {
	const user = await requireUser(request, env);
	if (!user) return { status: 401, code: "unauthorized", message: "Sign in is required to use chat" };
	const client = getDataClient(env);
	const [profile, memberships, owned] = await Promise.all([
		client.from("users").select("default_workspace_id").eq("user_id", user.id).maybeSingle(),
		client.from("workspace_members").select("workspace_id").eq("user_id", user.id).order("workspace_id", { ascending: true }),
		client.from("workspaces").select("id").eq("owner_user_id", user.id).order("id", { ascending: true }),
	]);
	if (profile.error || memberships.error || owned.error) return { status: 503, code: "workspace_unavailable", message: "Unable to resolve a workspace for chat" };
	const accessible = new Set([...(memberships.data ?? []).map((row) => String(row.workspace_id ?? "")), ...(owned.data ?? []).map((row) => String(row.id ?? ""))].filter(Boolean));
	const requested = cookieValue(request, "activeWorkspaceId").trim();
	const fallback = String(profile.data?.default_workspace_id ?? "").trim();
	const workspaceId = (requested && accessible.has(requested) ? requested : "") || (fallback && accessible.has(fallback) ? fallback : "") || [...accessible][0] || "";
	if (!workspaceId) return { status: 403, code: "no_workspace_membership", message: "A workspace is required to use chat" };
	const seed = String(env.CHAT_ROUTE_KEY_SEED ?? env.KEY_PEPPER_ACTIVE ?? "").trim();
	const pepper = String(env.KEY_PEPPER_ACTIVE ?? "").trim();
	if (!seed || !pepper) return { status: 503, code: "chat_key_configuration_missing", message: "Chat authentication is not configured" };
	const kid = await deterministicBase62(`${seed}:kid:${workspaceId}`, 12);
	const secret = await deterministicBase62(`${seed}:secret:${workspaceId}`, 40);
	const apiKey = `phaseo_v1_sk_${kid}_${secret}`;
	const expectedHash = await keyHash(pepper, secret);
	const existing = await client.from("keys").select("id,workspace_id,status,hash").eq("kid", kid).maybeSingle();
	if (existing.error) return { status: 503, code: "chat_key_lookup_failed", message: "Unable to prepare chat authentication" };
	if (!existing.data) {
		const inserted = await client.from("keys").insert({ workspace_id: workspaceId, name: "__chat_route_managed_key__", kid, hash: expectedHash, prefix: kid.slice(0, 6), status: "active", scopes: "[]", created_by: user.id, daily_limit_requests: 0, weekly_limit_requests: 0, monthly_limit_requests: 0, daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 0 });
		if (inserted.error && String(inserted.error.code ?? "") !== "23505") return { status: 503, code: "chat_key_create_failed", message: "Unable to prepare chat authentication" };
	} else {
		if (String(existing.data.workspace_id) !== workspaceId) return { status: 500, code: "chat_key_collision", message: "Unable to prepare chat authentication" };
		const update: Record<string, unknown> = {};
		if (String(existing.data.status) !== "active") update.status = "active";
		if (truthy(env.CHAT_ROUTE_FORCE_HASH_SYNC) && String(existing.data.hash ?? "").toLowerCase().trim() !== expectedHash) update.hash = expectedHash;
		if (Object.keys(update).length) {
			const updated = await client.from("keys").update(update).eq("id", existing.data.id).eq("workspace_id", workspaceId);
			if (updated.error) return { status: 503, code: "chat_key_update_failed", message: "Unable to prepare chat authentication" };
			waitUntil(invalidateGatewayKey(env, String(existing.data.id)));
		}
	}
	return { apiKey, userId: user.id, workspaceId };
}

function normalizeGatewayBaseUrl(value: string | undefined): string | undefined {
	const trimmed = value?.trim().replace(/^['"]|['"]$/g, "");
	if (!trimmed) return undefined;
	const base = trimmed.replace(/\/+$/, "");
	return base.endsWith("/v1") ? base : `${base}/v1`;
}

function isDevelopmentLocalGatewayBaseUrl(baseUrl: string, environment: string): boolean {
	if (environment === "production") return false;
	try { const url = new URL(baseUrl); return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "8787" && url.pathname.replace(/\/+$/, "") === "/v1"; } catch { return false; }
}

export function resolveGatewayBaseUrlForEnvironment(args: { configuredBaseUrl?: string; requestedBaseUrl?: string; environment: string }): string | null {
	const configured = normalizeGatewayBaseUrl(args.configuredBaseUrl);
	if (args.environment === "production") return configured ?? null;
	const requested = normalizeGatewayBaseUrl(args.requestedBaseUrl);
	if (requested && (requested === PUBLIC_GATEWAY_BASE_URL || requested === configured || isDevelopmentLocalGatewayBaseUrl(requested, args.environment))) return requested;
	return configured ?? PUBLIC_GATEWAY_BASE_URL;
}

function privateResponse(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) headers.set(name, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonError(status: number, code: string, message: string): Response {
	return new Response(JSON.stringify({ error: code, message }), { status, headers: { "Content-Type": "application/json", ...PRIVATE_NO_STORE_HEADERS } });
}

function sanitizeAppHeaders(input: unknown): Record<string, string> {
	if (!input || typeof input !== "object" || Array.isArray(input)) return {};
	return Object.fromEntries(Object.entries(input).flatMap(([rawKey, rawValue]) => {
		const key = rawKey.trim().toLowerCase();
		return ALLOWED_APP_HEADERS.has(key) && typeof rawValue === "string" ? [[key, rawValue]] : [];
	}));
}

export async function proxyGateway(request: Request, env: Env, waitUntil: (promise: Promise<unknown>) => void, args: { path: string; method?: "GET" | "POST"; requestBody?: Record<string, unknown>; appHeaders?: unknown; debug?: boolean; stream?: boolean; baseUrl?: string }): Promise<Response> {
	const auth = await resolveGatewayKeys(request, env, waitUntil);
	if (!("apiKey" in auth)) return jsonError(auth.status, auth.code, auth.message);
	const baseUrl = resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: env.AI_STATS_GATEWAY_URL ?? env.PHASEO_GATEWAY_URL, requestedBaseUrl: args.baseUrl, environment: env.ENV });
	if (!baseUrl) return jsonError(500, "gateway_not_configured", "Missing AI_STATS_GATEWAY_URL for chat gateway proxy.");
	try {
		const upstream = await fetch(`${baseUrl}${args.path}`, {
			method: args.method ?? "POST",
			headers: { ...(args.method === "GET" ? {} : { "Content-Type": "application/json" }), ...sanitizeAppHeaders(args.appHeaders), ...CANONICAL_CHAT_APP_HEADERS, Authorization: `Bearer ${auth.apiKey}`, ...(args.debug ? { "x-gateway-debug": "true" } : {}), ...(args.stream ? { Accept: "text/event-stream" } : {}) },
			...(args.method === "GET" ? {} : { body: JSON.stringify(args.requestBody ?? {}) }),
		});
		return privateResponse(upstream);
	} catch {
		return jsonError(502, "gateway_unreachable", "The gateway is temporarily unavailable. Please try again.");
	}
}
