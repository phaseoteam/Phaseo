// The signed-in person's own account: profile fields and the apps they have
// authorized with OAuth (the dashboard's Profile and Authorized apps pages).
// OAuth tokens only: a management key belongs to a workspace, not a person.
// Password, MFA and passkeys stay in the browser on purpose.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { authenticateManagement } from "@/pipeline/before/auth";
import { getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, isResponse, requireJsonBody } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const PHASEO_CLI_CLIENT_IDS = new Set(["phaseo_cli", "aistats_cli"]);
const PROFILE_COLUMNS = "display_name,default_workspace_id,obfuscate_info";

async function oauthUser(req: Request, scope: string) {
	const auth = await authenticateManagement(req, { useKvCache: false });
	if (!auth.ok || auth.authMethod !== "oauth" || !auth.userId) {
		return { response: json({ error: "unauthorised", message: "Bearer OAuth token is invalid or expired; management keys cannot use account routes" }, 401, NO_STORE) } as const;
	}
	const scopes = auth.oauthScopes ?? auth.scopes ?? [];
	if (!scopes.includes(scope)) {
		return { response: json({ error: "insufficient_scope", message: `Token requires ${scope}` }, 403, NO_STORE) } as const;
	}
	return { auth: { ...auth, userId: auth.userId } } as const;
}

function pathId(req: Request): string {
	return decodeURIComponent(new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "").trim();
}

function formatProfile(userId: string, row: Record<string, unknown> | null) {
	return {
		user_id: userId,
		display_name: typeof row?.display_name === "string" ? row.display_name : null,
		default_workspace_id: typeof row?.default_workspace_id === "string" ? row.default_workspace_id : null,
		obfuscate_info: row?.obfuscate_info === true,
	};
}

async function handleGetProfile(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.ME_READ);
	if ("response" in access) return access.response;
	const { data, error } = await getSupabaseAdmin().from("users").select(PROFILE_COLUMNS).eq("user_id", access.auth.userId).maybeSingle();
	if (error) return internalServerError("me.profile.get", error);
	return json({ data: formatProfile(access.auth.userId, data as Record<string, unknown> | null) }, 200, NO_STORE);
}

/** The dashboard's profile fields: display name, default workspace (one you belong to) and hiding your details on screen. */
async function handleUpdateProfile(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.SETTINGS_WRITE);
	if ("response" in access) return access.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const { userId } = access.auth;
	const update: Record<string, unknown> = {};
	if (body.display_name !== undefined) {
		const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
		if (!name || name.length > 100) return json({ error: "bad_request", message: "display_name must be 1 to 100 characters" }, 400, NO_STORE);
		update.display_name = name;
	}
	if (body.obfuscate_info !== undefined) {
		if (typeof body.obfuscate_info !== "boolean") return json({ error: "bad_request", message: "obfuscate_info must be a boolean" }, 400, NO_STORE);
		update.obfuscate_info = body.obfuscate_info;
	}
	if (body.default_workspace_id !== undefined) {
		const workspaceId = body.default_workspace_id === null ? null : typeof body.default_workspace_id === "string" ? body.default_workspace_id.trim() : "";
		if (workspaceId === "") return json({ error: "bad_request", message: "default_workspace_id must be a workspace id or null" }, 400, NO_STORE);
		if (workspaceId) {
			const membership = await getSupabaseAdmin().from("workspace_members").select("workspace_id")
				.eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
			if (membership.error) return internalServerError("me.profile.update", membership.error);
			if (!membership.data) return json({ error: "forbidden", message: "default_workspace_id must be a workspace you belong to" }, 403, NO_STORE);
		}
		update.default_workspace_id = workspaceId;
	}
	if (Object.keys(update).length === 0) {
		return json({ error: "bad_request", message: "Send at least one of: display_name, default_workspace_id, obfuscate_info" }, 400, NO_STORE);
	}
	const { data, error } = await getSupabaseAdmin().from("users")
		.upsert({ user_id: userId, ...update }, { onConflict: "user_id" })
		.select(PROFILE_COLUMNS).maybeSingle();
	if (error) return internalServerError("me.profile.update", error);
	return json({ data: formatProfile(userId, data as Record<string, unknown> | null) }, 200, NO_STORE);
}

type AuthorizationRow = { id: string; client_id: string; workspace_id: string; scopes: unknown; created_at: string; last_used_at: string | null };

/** Apps you have authorized with OAuth, in any workspace. */
async function handleListAuthorizedApps(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.OAUTH_CLIENTS_READ);
	if ("response" in access) return access.response;
	try {
		const client = getSupabaseAdmin();
		const result = await client.from("oauth_authorizations")
			.select("id,client_id,workspace_id,scopes,created_at,last_used_at")
			.eq("user_id", access.auth.userId)
			.is("revoked_at", null)
			.order("last_used_at", { ascending: false, nullsFirst: false });
		if (result.error) throw new Error(result.error.message || "Failed to list authorizations");
		const rows = (result.data ?? []) as AuthorizationRow[];
		const clientIds = [...new Set(rows.map((row) => String(row.client_id ?? "")).filter(Boolean))];
		const workspaceIds = [...new Set(rows.map((row) => String(row.workspace_id ?? "")).filter(Boolean))];
		const [apps, workspaces] = await Promise.all([
			clientIds.length
				? client.from("oauth_app_metadata").select("client_id,name").in("client_id", clientIds)
				: Promise.resolve({ data: [], error: null }),
			workspaceIds.length
				? client.from("workspaces").select("id,name").in("id", workspaceIds)
				: Promise.resolve({ data: [], error: null }),
		]);
		if (apps.error || workspaces.error) throw new Error("Failed to read authorized apps");
		const appsById = new Map((apps.data ?? []).map((app: any) => [String(app.client_id), app]));
		const workspacesById = new Map((workspaces.data ?? []).map((workspace: any) => [String(workspace.id), workspace]));
		return json({
			data: rows.map((row) => {
				const app = appsById.get(row.client_id);
				return {
					id: row.id,
					client_id: row.client_id,
					app_name: app?.name ?? (PHASEO_CLI_CLIENT_IDS.has(row.client_id) ? "Phaseo CLI" : "OAuth application"),
					workspace_id: row.workspace_id,
					workspace_name: workspacesById.get(row.workspace_id)?.name ?? null,
					scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
					current: row.client_id === access.auth.oauthClientId && row.workspace_id === access.auth.workspaceId,
					authorized_at: row.created_at,
					last_used_at: row.last_used_at,
				};
			}),
		}, 200, NO_STORE);
	} catch (error) {
		return internalServerError("me.authorized_apps.list", error);
	}
}

/**
 * Narrows an app's access. Scopes can only be removed here: adding one needs
 * the person's consent in the browser, so no token can widen a grant.
 */
async function handleReduceAuthorizedAppScopes(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.OAUTH_CLIENTS_WRITE);
	if ("response" in access) return access.response;
	const id = pathId(req);
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	if (!Array.isArray(body.scopes)) return json({ error: "bad_request", message: "scopes must be an array" }, 400, NO_STORE);
	const scopes = [...new Set(body.scopes.map((scope) => typeof scope === "string" ? scope.trim() : "").filter(Boolean))];
	if (scopes.length === 0) return json({ error: "bad_request", message: "Keep at least one scope, or revoke the app instead" }, 400, NO_STORE);
	try {
		const client = getSupabaseAdmin();
		const existing = await client.from("oauth_authorizations").select("id,workspace_id,client_id,scopes")
			.eq("id", id).eq("user_id", access.auth.userId).is("revoked_at", null).maybeSingle();
		if (existing.error) throw new Error(existing.error.message || "Failed to read authorization");
		if (!existing.data) return json({ error: "not_found", message: "Authorized app not found" }, 404, NO_STORE);
		const current = new Set(Array.isArray(existing.data.scopes) ? existing.data.scopes.map(String) : []);
		if (scopes.some((scope) => !current.has(scope))) {
			return json({ error: "scopes_can_only_be_reduced", message: "Scopes can only be removed here; add scopes by authorizing the app again in the browser" }, 400, NO_STORE);
		}
		const updated = await client.from("oauth_authorizations").update({ scopes })
			.eq("id", existing.data.id).eq("user_id", access.auth.userId).is("revoked_at", null);
		if (updated.error) throw new Error(updated.error.message || "Failed to update authorization");
		await recordWorkspaceAuditEvent(client, {
			workspaceId: String(existing.data.workspace_id),
			actorUserId: access.auth.userId,
			action: "oauth_authorization.reduced",
			targetType: "oauth_authorization",
			targetId: String(existing.data.id),
			targetName: String(existing.data.client_id),
			metadata: { removed: [...current].filter((scope) => !scopes.includes(scope)) },
		});
		return json({ data: { id: existing.data.id, scopes } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("me.authorized_apps.update", error);
	}
}

/** Revokes an app's access, so its tokens stop working. Revoking the calling app's own grant signs it out. */
async function handleRevokeAuthorizedApp(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.OAUTH_CLIENTS_DELETE);
	if ("response" in access) return access.response;
	const id = pathId(req);
	try {
		const client = getSupabaseAdmin();
		const { data, error } = await client.from("oauth_authorizations")
			.update({ revoked_at: new Date().toISOString() })
			.eq("id", id).eq("user_id", access.auth.userId).is("revoked_at", null)
			.select("id,workspace_id,client_id").maybeSingle();
		if (error) throw new Error(error.message || "Failed to revoke authorization");
		if (!data) return json({ error: "not_found", message: "Authorized app not found" }, 404, NO_STORE);
		await recordWorkspaceAuditEvent(client, {
			workspaceId: String(data.workspace_id),
			actorUserId: access.auth.userId,
			action: "oauth_authorization.revoked",
			targetType: "oauth_authorization",
			targetId: String(data.id),
			targetName: String(data.client_id),
		});
		return json({ revoked: true, id: data.id }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("me.authorized_apps.revoke", error);
	}
}

export const meAccountRoutes = new Hono<Env>();

meAccountRoutes.get("/profile", withRuntime(handleGetProfile));
meAccountRoutes.patch("/profile", withRuntime(handleUpdateProfile));
meAccountRoutes.get("/authorized-apps", withRuntime(handleListAuthorizedApps));
meAccountRoutes.patch("/authorized-apps/:id", withRuntime(handleReduceAuthorizedAppScopes));
meAccountRoutes.delete("/authorized-apps/:id", withRuntime(handleRevokeAuthorizedApp));
