// Purpose: Public dynamic-routing management.
// Why: Dashboard routing workflows must be fully automatable.
// How: Exposes bounded versioned routes, deployments, and key attachments.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { publishWorkspaceMutation } from "@/core/workspace-publication";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { normalizeDynamicRouteConfig } from "@/pipeline/before/dynamic-routes";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, requireCapability, requireOAuthWorkspaceRole } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const ROUTE_COLUMNS = "id,workspace_id,name,slug,description,status,version,deployed_version,config,created_at,updated_at";

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized && normalized.length <= max ? normalized : null;
}

function slug(value: unknown, fallback: string): string {
	return (text(value, 63) ?? fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63) || `route-${crypto.randomUUID().slice(0, 8)}`;
}

function ids(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > 64) return null;
	const output = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
	return output.every((item) => item.length <= 128) ? output : null;
}

function pagination(url: URL) {
	const offset = Number(url.searchParams.get("offset") ?? "0");
	const limit = Number(url.searchParams.get("limit") ?? "100");
	return Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 100
		? { offset, limit }
		: null;
}

function routeId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const index = segments.lastIndexOf("dynamic-routes");
	return index >= 0 && segments[index + 1] ? decodeURIComponent(segments[index + 1]).trim() || null : null;
}

function routeVersion(url: URL): number | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const index = segments.lastIndexOf("versions");
	const value = index >= 0 ? Number(segments[index + 1]) : NaN;
	return Number.isInteger(value) && value >= 1 ? value : null;
}

function normalizedConfig(value: unknown) {
	if (!object(value)) return null;
	const config = normalizeDynamicRouteConfig(value);
	return JSON.stringify(config).length <= 60_000 ? config : null;
}

async function authorize(req: Request, write: boolean) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, write ? CAPABILITIES.SETTINGS_WRITE : CAPABILITIES.SETTINGS_READ);
	if (scopeError) return { response: scopeError } as const;
	const roles = write ? ["owner", "admin"] : ["owner", "admin", "member"];
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, roles);
	if (roleError) return { response: roleError } as const;
	return { auth: auth.value } as const;
}

async function loadRoute(workspaceId: string, id: string) {
	const { data, error } = await getSupabaseAdmin().from("gateway_dynamic_routes").select(ROUTE_COLUMNS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(error.message || "Failed to load dynamic route");
	return data as Record<string, any> | null;
}

async function routeRelations(routeIds: string[]) {
	if (!routeIds.length) return { versions: [] as any[], keys: [] as any[] };
	const client = getSupabaseAdmin();
	const [versions, keys] = await Promise.all([
		client.from("gateway_dynamic_route_versions").select("route_id,version,config,created_by,created_at").in("route_id", routeIds).order("version", { ascending: false }),
		client.from("gateway_dynamic_route_keys").select("route_id,key_id").in("route_id", routeIds),
	]);
	if (versions.error || keys.error) throw new Error(versions.error?.message || keys.error?.message || "Failed to load dynamic route relations");
	return { versions: versions.data ?? [], keys: keys.data ?? [] };
}

function formatRoute(row: Record<string, any>, relations: Awaited<ReturnType<typeof routeRelations>>) {
	const versions = relations.versions.filter((item) => item.route_id === row.id);
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		name: row.name,
		slug: row.slug,
		description: row.description ?? null,
		status: row.status,
		version: Number(row.version ?? 1),
		deployed_version: row.deployed_version == null ? null : Number(row.deployed_version),
		config: versions[0]?.config ?? row.config ?? {},
		key_ids: relations.keys.filter((item) => item.route_id === row.id).map((item) => item.key_id),
		versions: versions.map((item) => ({
			version: Number(item.version),
			status: Number(item.version) === Number(row.deployed_version) ? "deployed" : Number(item.version) === Number(row.version) ? "draft" : "superseded",
			created_by: item.created_by ?? null,
			created_at: item.created_at ?? null,
		})),
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

async function audit(auth: any, action: string, route: Record<string, any>, metadata?: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: auth.userId,
		action,
		targetType: "dynamic_route",
		targetId: String(route.id),
		targetName: String(route.name ?? ""),
		metadata,
		requestId: auth.requestId,
	});
}

async function listRoutes(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const page = pagination(new URL(req.url));
	if (!page) return json({ error: "bad_request", message: "Invalid pagination" }, 400, NO_STORE);
	try {
		const { data, error, count } = await getSupabaseAdmin().from("gateway_dynamic_routes").select(ROUTE_COLUMNS, { count: "exact" }).eq("workspace_id", access.auth.workspaceId).order("updated_at", { ascending: false }).range(page.offset, page.offset + page.limit - 1);
		if (error) throw new Error(error.message || "Failed to list dynamic routes");
		const rows = (data ?? []) as Array<Record<string, any>>;
		const relations = await routeRelations(rows.map((row) => String(row.id)));
		return json({ data: rows.map((row) => formatRoute(row, relations)), total_count: count ?? rows.length }, 200, NO_STORE);
	} catch (error) { return internalServerError("routing.dynamic_routes.list", error); }
}

async function getRoute(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const id = routeId(new URL(req.url)); if (!id) return json({ error: "bad_request", message: "Route id is required" }, 400, NO_STORE);
	try {
		const route = await loadRoute(access.auth.workspaceId, id);
		if (!route) return json({ error: "not_found", message: "Dynamic route not found" }, 404, NO_STORE);
		return json({ data: formatRoute(route, await routeRelations([id])) }, 200, NO_STORE);
	} catch (error) { return internalServerError("routing.dynamic_routes.get", error); }
}

async function createRoute(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const body = await req.json<Record<string, unknown>>().catch(() => null);
	const name = text(body?.name, 80); const description = body?.description == null ? null : text(body.description, 500); const config = normalizedConfig(body?.config ?? {});
	if (!body || !name || (body.description != null && description === null) || !config) return json({ error: "bad_request", message: "Invalid route name, description, or config" }, 400, NO_STORE);
	const status = body.status === "paused" ? "paused" : "active";
	let id: string | null = null;
	try {
		const client = getSupabaseAdmin();
		const created = await client.from("gateway_dynamic_routes").insert({ workspace_id: access.auth.workspaceId, name, slug: slug(body.slug, name), description, status, config: {}, created_by: access.auth.userId ?? null }).select(ROUTE_COLUMNS).maybeSingle();
		if (created.error || !created.data?.id) {
			if (/unique/i.test(created.error?.message ?? "")) return json({ error: "conflict", message: "A route with this name or slug already exists" }, 409, NO_STORE);
			throw new Error(created.error?.message || "Failed to create dynamic route");
		}
		id = String(created.data.id);
		const version = await client.from("gateway_dynamic_route_versions").insert({ route_id: id, version: 1, config, created_by: access.auth.userId ?? null });
		if (version.error) throw new Error(version.error.message || "Failed to create route version");
		await audit(access.auth, "routing.dynamic_route.created", created.data, { version: 1 });
		return json({ data: formatRoute({ ...created.data, config }, await routeRelations([id])) }, 201, NO_STORE);
	} catch (error) {
		if (id) await getSupabaseAdmin().from("gateway_dynamic_routes").delete().eq("workspace_id", access.auth.workspaceId).eq("id", id);
		return internalServerError("routing.dynamic_routes.create", error);
	}
}

async function updateRoute(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const id = routeId(new URL(req.url)); const body = await req.json<Record<string, unknown>>().catch(() => null);
	if (!id || !body) return json({ error: "bad_request", message: "Route id and JSON body are required" }, 400, NO_STORE);
	const supportedFields = new Set(["name", "description", "status", "config"]);
	const bodyFields = Object.keys(body);
	if (!bodyFields.length || bodyFields.some((field) => !supportedFields.has(field))) return json({ error: "bad_request", message: "At least one supported route field is required" }, 400, NO_STORE);
	try {
		const existing = await loadRoute(access.auth.workspaceId, id);
		if (!existing) return json({ error: "not_found", message: "Dynamic route not found" }, 404, NO_STORE);
		const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (body.name !== undefined) { const name = text(body.name, 80); if (!name) return json({ error: "bad_request", message: "name must be 1-80 characters" }, 400, NO_STORE); patch.name = name; }
		if (body.description !== undefined) { const description = body.description == null ? null : text(body.description, 500); if (body.description != null && !description) return json({ error: "bad_request", message: "description must be at most 500 characters" }, 400, NO_STORE); patch.description = description; }
		if (body.status !== undefined) { if (body.status !== "active" && body.status !== "paused") return json({ error: "bad_request", message: "status must be active or paused" }, 400, NO_STORE); patch.status = body.status; }
		let nextVersion = Number(existing.version ?? 1);
		if (body.config !== undefined) {
			const config = normalizedConfig(body.config); if (!config) return json({ error: "bad_request", message: "config must be a bounded object" }, 400, NO_STORE);
			nextVersion += 1; patch.version = nextVersion;
			const version = await getSupabaseAdmin().from("gateway_dynamic_route_versions").insert({ route_id: id, version: nextVersion, config, created_by: access.auth.userId ?? null });
			if (version.error) throw new Error(version.error.message || "Failed to create route version");
		}
		const updated = await getSupabaseAdmin().from("gateway_dynamic_routes").update(patch).eq("workspace_id", access.auth.workspaceId).eq("id", id).select(ROUTE_COLUMNS).maybeSingle();
		if (updated.error || !updated.data) {
			if (body.config !== undefined) await getSupabaseAdmin().from("gateway_dynamic_route_versions").delete().eq("route_id", id).eq("version", nextVersion);
			if (/unique/i.test(updated.error?.message ?? "")) return json({ error: "conflict", message: "A route with this name already exists" }, 409, NO_STORE);
			throw new Error(updated.error?.message || "Failed to update dynamic route");
		}
		if (body.status !== undefined && body.status !== existing.status) {
			await publishWorkspaceMutation(access.auth.workspaceId);
		}
		await audit(access.auth, "routing.dynamic_route.updated", updated.data, { changed_fields: Object.keys(body), version: nextVersion });
		return json({ data: formatRoute(updated.data, await routeRelations([id])) }, 200, NO_STORE);
	} catch (error) { return internalServerError("routing.dynamic_routes.update", error); }
}

async function deployVersion(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const url = new URL(req.url); const id = routeId(url); const version = routeVersion(url);
	if (!id || !version) return json({ error: "bad_request", message: "Valid route id and version are required" }, 400, NO_STORE);
	try {
		const route = await loadRoute(access.auth.workspaceId, id); if (!route) return json({ error: "not_found", message: "Dynamic route not found" }, 404, NO_STORE);
		const selected = await getSupabaseAdmin().from("gateway_dynamic_route_versions").select("config").eq("route_id", id).eq("version", version).maybeSingle();
		if (selected.error) throw new Error(selected.error.message || "Failed to load route version");
		if (!selected.data?.config) return json({ error: "not_found", message: "Route version not found" }, 404, NO_STORE);
		const updated = await getSupabaseAdmin().from("gateway_dynamic_routes").update({ config: selected.data.config, deployed_version: version, updated_at: new Date().toISOString() }).eq("workspace_id", access.auth.workspaceId).eq("id", id);
		if (updated.error) throw new Error(updated.error.message || "Failed to deploy route version");
		await publishWorkspaceMutation(access.auth.workspaceId);
		await audit(access.auth, "routing.dynamic_route.deployed", route, { version });
		return json({ data: { id, deployed_version: version } }, 200, NO_STORE);
	} catch (error) { return internalServerError("routing.dynamic_routes.deploy", error); }
}

async function replaceKeys(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const id = routeId(new URL(req.url)); const body = await req.json<Record<string, unknown>>().catch(() => null); const keyIds = ids(body?.key_ids ?? body?.keyIds);
	if (!id || !body || !keyIds) return json({ error: "bad_request", message: "key_ids must contain at most 64 key ids" }, 400, NO_STORE);
	try {
		const route = await loadRoute(access.auth.workspaceId, id); if (!route) return json({ error: "not_found", message: "Dynamic route not found" }, 404, NO_STORE);
		const client = getSupabaseAdmin();
		const valid = keyIds.length ? await client.from("keys").select("id").eq("workspace_id", access.auth.workspaceId).neq("status", "deleted").in("id", keyIds) : { data: [], error: null };
		if (valid.error) throw new Error(valid.error.message || "Failed to validate route keys");
		if ((valid.data ?? []).length !== keyIds.length) return json({ error: "conflict", message: "One or more API keys are unavailable" }, 409, NO_STORE);
		const replaced = await client.rpc("replace_gateway_dynamic_route_keys", { p_route_id: id, p_key_ids: keyIds, p_attached_by: access.auth.userId ?? null });
		if (replaced.error) throw new Error(replaced.error.message || "Failed to replace route keys");
		await publishWorkspaceMutation(access.auth.workspaceId);
		await audit(access.auth, "routing.dynamic_route.keys_updated", route, { key_count: keyIds.length });
		return json({ data: { id, key_ids: keyIds } }, 200, NO_STORE);
	} catch (error) { return internalServerError("routing.dynamic_routes.keys", error); }
}

async function deleteRoute(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const url = new URL(req.url); const id = routeId(url); if (!id) return json({ error: "bad_request", message: "Route id is required" }, 400, NO_STORE);
	try {
		const route = await loadRoute(access.auth.workspaceId, id); if (!route) return json({ error: "not_found", message: "Dynamic route not found" }, 404, NO_STORE);
		const confirmation = url.searchParams.get("confirm_name"); if (confirmation !== null && confirmation !== route.name) return json({ error: "conflict", message: "Route name confirmation does not match" }, 409, NO_STORE);
		const deleted = await getSupabaseAdmin().from("gateway_dynamic_routes").delete().eq("workspace_id", access.auth.workspaceId).eq("id", id); if (deleted.error) throw new Error(deleted.error.message || "Failed to delete dynamic route");
		await publishWorkspaceMutation(access.auth.workspaceId);
		await audit(access.auth, "routing.dynamic_route.deleted", route);
		return json({ data: { id, deleted: true } }, 200, NO_STORE);
	} catch (error) { return internalServerError("routing.dynamic_routes.delete", error); }
}

export const routingRoutes = new Hono<Env>();

routingRoutes.get("/dynamic-routes", withRuntime(listRoutes));
routingRoutes.post("/dynamic-routes", withRuntime(createRoute));
routingRoutes.get("/dynamic-routes/:id", withRuntime(getRoute));
routingRoutes.patch("/dynamic-routes/:id", withRuntime(updateRoute));
routingRoutes.delete("/dynamic-routes/:id", withRuntime(deleteRoute));
routingRoutes.put("/dynamic-routes/:id/keys", withRuntime(replaceKeys));
routingRoutes.post("/dynamic-routes/:id/versions/:version/deploy", withRuntime(deployVersion));
