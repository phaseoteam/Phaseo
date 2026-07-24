import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

const SUPPORTED_SCOPES = new Set([
	"openid", "profile", "email", "me:read", "models:read", "providers:read",
	"pricing:read", "credits:read", "activity:read", "analytics:read",
	"generations:read", "workspaces:read", "keys:read", "presets:read",
	"settings:read", "guardrails:read", "management_keys:read", "oauth_clients:read",
	"workspaces:write", "keys:write", "presets:write", "settings:write",
	"guardrails:write", "management_keys:write", "oauth_clients:write",
	"workspaces:delete", "keys:delete", "presets:delete", "guardrails:delete",
	"management_keys:delete", "oauth_clients:delete",
]);

type OAuthBody = {
	name?: string;
	description?: string;
	homepage_url?: string;
	redirect_uris?: string[];
	workspace_id?: string;
	logo_url?: string;
	privacy_policy_url?: string;
	terms_of_service_url?: string;
	allowed_scopes?: string[];
};

function enabled(env: Env): boolean {
	return new Set(["1", "true", "yes", "on"]).has(
		String(env.PHASEO_THIRD_PARTY_OAUTH_ENABLED ?? "").trim().toLowerCase(),
	);
}

function normalizeScopes(value: unknown): string[] {
	if (!Array.isArray(value)) throw new Error("Choose at least one OAuth scope");
	const scopes = [...new Set(value.map((scope) => String(scope).trim()).filter(Boolean))];
	if (!scopes.length) throw new Error("Choose at least one OAuth scope");
	const unsupported = scopes.find((scope) => !SUPPORTED_SCOPES.has(scope));
	if (unsupported) throw new Error(`Unsupported OAuth scope: ${unsupported}`);
	return scopes;
}

function validateRedirectUris(value: unknown): string[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error("At least one redirect URI is required");
	return value.map((entry) => {
		const uri = String(entry).trim();
		let url: URL;
		try { url = new URL(uri); } catch { throw new Error(`Invalid redirect URI format: ${uri}`); }
		const loopback = ["127.0.0.1", "::1", "[::1]", "localhost"].includes(url.hostname);
		if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
			throw new Error(`Invalid redirect URI: ${uri}`);
		}
		return uri;
	});
}

function validateMetadataUrls(body: OAuthBody): void {
	for (const field of ["homepage_url", "logo_url", "privacy_policy_url", "terms_of_service_url"] as const) {
		const value = body[field]?.trim();
		if (!value) continue;
		let url: URL;
		try { url = new URL(value); } catch { throw new Error(`${field.replaceAll("_", " ")} must be a valid HTTPS URL`); }
		if (url.protocol !== "https:" || url.username || url.password || url.hash) {
			throw new Error(`${field.replaceAll("_", " ")} must be an HTTPS URL without credentials or a fragment`);
		}
	}
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hashSecret(env: Env, secret: string): Promise<string> {
	const pepper = String(env.PHASEO_OAUTH_TOKEN_PEPPER ?? env.KEY_PEPPER_ACTIVE ?? "").trim();
	if (!pepper) throw new Error("OAuth token pepper is not configured");
	const iterations = 600_000;
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const material = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const hash = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", iterations, salt: new TextEncoder().encode(`${pepper}:${base64Url(salt)}`) },
		material,
		256,
	);
	return `pbkdf2-sha256$${iterations}$${base64Url(salt)}$${base64Url(new Uint8Array(hash))}`;
}

async function appContext(request: Request, env: Env, clientId: string) {
	const client = getDataClient(env);
	const app = await client.from("oauth_app_metadata").select("*").eq("client_id", clientId).maybeSingle();
	if (app.error || !app.data?.workspace_id) return null;
	const context = await requireAccountWorkspace({ request, env, workspaceId: String(app.data.workspace_id) });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return null;
	return { app: app.data, context, client };
}

function failure(c: any, error: unknown, status: 400 | 409 | 503 = 400) {
	return c.json({ error: error instanceof Error ? error.message : "OAuth app operation failed" }, status, PRIVATE_NO_STORE_HEADERS);
}

export const accountSettingsOAuthRouter = new Hono<{ Bindings: Env }>();

accountSettingsOAuthRouter.post("/oauth-apps", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "Unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	if (!enabled(c.env)) return c.json({ error: "OAuth client management is coming soon. The Phaseo CLI is available during the private OAuth beta." }, 409, PRIVATE_NO_STORE_HEADERS);
	const body: OAuthBody = await c.req.json<OAuthBody>().catch(() => ({}));
	const name = body.name?.trim() ?? "";
	if (name.length < 3) return c.json({ error: "App name must be at least 3 characters" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: body.workspace_id });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "Workspace owner or admin access is required to create OAuth apps" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const redirectUris = validateRedirectUris(body.redirect_uris);
		validateMetadataUrls(body);
		const allowedScopes = normalizeScopes(body.allowed_scopes);
		const admin = getDataClient(c.env);
		const created = await (admin.auth.admin.oauth as any).createClient({ name, redirect_uris: redirectUris });
		if (created.error || !created.data?.client_id || !created.data?.client_secret) throw new Error(`Failed to create OAuth client: ${created.error?.message ?? "Unknown error"}`);
		const metadata = await context.client.from("oauth_app_metadata").insert({
			client_id: created.data.client_id,
			workspace_id: context.workspaceId,
			name,
			description: body.description,
			redirect_uris: redirectUris,
			homepage_url: body.homepage_url,
			logo_url: body.logo_url,
			privacy_policy_url: body.privacy_policy_url,
			terms_of_service_url: body.terms_of_service_url,
			client_type: "confidential",
			client_secret_hash: await hashSecret(c.env, created.data.client_secret),
			allowed_scopes: allowedScopes,
			created_by: user.id,
			status: "active",
		}).select().single();
		if (metadata.error) {
			await (admin.auth.admin.oauth as any).deleteClient(created.data.client_id);
			throw new Error(`Failed to create OAuth app: ${metadata.error.message}`);
		}
		return c.json({ data: { ...metadata.data, client_secret: created.data.client_secret } }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return failure(c, error); }
});

accountSettingsOAuthRouter.put("/oauth-apps/:clientId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "Unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	if (!enabled(c.env)) return c.json({ error: "OAuth client management is coming soon. The Phaseo CLI is available during the private OAuth beta." }, 409, PRIVATE_NO_STORE_HEADERS);
	const loaded = await appContext(c.req.raw, c.env, c.req.param("clientId"));
	if (!loaded) return c.json({ error: "Workspace owner or admin access is required" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: OAuthBody & { operation?: string } = await c.req
		.json<OAuthBody & { operation?: string }>()
		.catch(() => ({}));
	try {
		if (body.operation === "redirect-uris") {
			const redirectUris = validateRedirectUris(body.redirect_uris);
			const authUpdate = await (loaded.client.auth.admin.oauth as any).updateClient(loaded.app.client_id, { redirect_uris: redirectUris });
			if (authUpdate.error) throw new Error(`Failed to update redirect URIs: ${authUpdate.error.message}`);
			const metadata = await loaded.context.client.from("oauth_app_metadata").update({ redirect_uris: redirectUris }).eq("client_id", loaded.app.client_id).eq("workspace_id", loaded.context.workspaceId);
			if (metadata.error) throw new Error(`Redirect URIs updated in OAuth client but metadata sync failed: ${metadata.error.message}`);
			return c.json({ data: { redirect_uris: redirectUris } }, 200, PRIVATE_NO_STORE_HEADERS);
		}
		const update: Record<string, unknown> = {};
		for (const field of ["name", "description", "homepage_url", "logo_url", "privacy_policy_url", "terms_of_service_url"] as const) {
			if (body[field] !== undefined) update[field] = body[field];
		}
		if (body.allowed_scopes !== undefined) update.allowed_scopes = normalizeScopes(body.allowed_scopes);
		validateMetadataUrls(body);
		const result = await loaded.context.client.from("oauth_app_metadata").update(update).eq("client_id", loaded.app.client_id).eq("workspace_id", loaded.context.workspaceId).select().single();
		if (result.error) throw new Error(`Failed to update OAuth app: ${result.error.message}`);
		return c.json({ data: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return failure(c, error); }
});

accountSettingsOAuthRouter.post("/oauth-apps/:clientId/regenerate-secret", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "Unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	if (!enabled(c.env)) return c.json({ error: "OAuth client management is coming soon. The Phaseo CLI is available during the private OAuth beta." }, 409, PRIVATE_NO_STORE_HEADERS);
	const loaded = await appContext(c.req.raw, c.env, c.req.param("clientId"));
	if (!loaded) return c.json({ error: "Workspace owner or admin access is required" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const regenerated = await (loaded.client.auth.admin.oauth as any).regenerateSecret(loaded.app.client_id);
		if (regenerated.error || !regenerated.data?.client_secret) throw new Error(`Failed to regenerate secret: ${regenerated.error?.message ?? "Unknown error"}`);
		const result = await loaded.context.client.from("oauth_app_metadata").update({ client_secret_hash: await hashSecret(c.env, regenerated.data.client_secret) }).eq("client_id", loaded.app.client_id).eq("workspace_id", loaded.context.workspaceId);
		if (result.error) throw new Error(`Failed to update OAuth client secret: ${result.error.message}`);
		return c.json({ data: { client_id: loaded.app.client_id, client_secret: regenerated.data.client_secret } }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return failure(c, error, 503); }
});

accountSettingsOAuthRouter.delete("/oauth-apps/:clientId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "Unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	if (!enabled(c.env)) return c.json({ error: "OAuth client management is coming soon. The Phaseo CLI is available during the private OAuth beta." }, 409, PRIVATE_NO_STORE_HEADERS);
	const loaded = await appContext(c.req.raw, c.env, c.req.param("clientId"));
	if (!loaded) return c.json({ error: "Workspace owner or admin access is required" }, 403, PRIVATE_NO_STORE_HEADERS);
	const deleted = await (loaded.client.auth.admin.oauth as any).deleteClient(loaded.app.client_id);
	if (deleted.error) return failure(c, new Error(`Failed to delete OAuth client: ${deleted.error.message}`), 503);
	const metadata = await loaded.context.client.from("oauth_app_metadata").delete().eq("client_id", loaded.app.client_id).eq("workspace_id", loaded.context.workspaceId);
	if (metadata.error) return failure(c, new Error(`Failed to delete OAuth app: ${metadata.error.message}`), 503);
	return c.json({ data: { success: true } }, 200, PRIVATE_NO_STORE_HEADERS);
});
