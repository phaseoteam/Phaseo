import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { SLACK_AGENT_MANAGED_KEY_NAME } from "@/lib/managed-keys";
import { requireAccountWorkspace } from "./context";

const MODES = new Set(["balanced", "price", "latency", "throughput"]);
const FIELDS = new Set(["always", "endpoint", "model", "session_id", "metadata"]);
const OPERATORS = new Set(["equals", "not_equals", "contains", "starts_with", "exists"]);
const NODE_TYPES = new Set(["start", "condition", "percentage", "model", "rate_limit", "budget_limit", "end"]);

function text(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized ? normalized.slice(0, max) : null;
}

function providers(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => text(item, 128)).filter((item): item is string => Boolean(item)))].slice(0, 64);
}

function models(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => text(item, 256)).filter((item): item is string => Boolean(item)))].slice(0, 8);
}

function action(value: unknown) {
	const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const mode = text(raw.routingMode, 32);
	return {
		...(text(raw.model, 256) ? { model: text(raw.model, 256) } : {}),
		modelFallbacks: models(raw.modelFallbacks),
		...(mode && MODES.has(mode) ? { routingMode: mode } : {}),
		providerOrder: providers(raw.providerOrder),
		providerOnly: providers(raw.providerOnly),
		providerIgnore: providers(raw.providerIgnore),
		allowFallbacks: raw.allowFallbacks !== false,
	};
}

function slug(value: unknown, fallback: string): string {
	return (text(value, 63) ?? fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63) || `route-${crypto.randomUUID().slice(0, 8)}`;
}

function graph(value: Record<string, unknown>) {
	const nodes = (Array.isArray(value.nodes) ? value.nodes : []).slice(0, 64).flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const node = entry as Record<string, any>;
		const id = text(node.id, 80);
		const type = text(node.type, 32);
		if (!id || !type || !NODE_TYPES.has(type)) return [];
		const position = node.position && typeof node.position === "object" ? { x: Math.max(-10_000, Math.min(10_000, Number(node.position.x) || 0)), y: Math.max(-10_000, Math.min(10_000, Number(node.position.y) || 0)) } : null;
		const data = node.data && typeof node.data === "object" && !Array.isArray(node.data) ? node.data : {};
		return [{ id, type, position, data }];
	});
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges = (Array.isArray(value.edges) ? value.edges : []).slice(0, 128).flatMap((entry, index) => {
		if (!entry || typeof entry !== "object") return [];
		const edge = entry as Record<string, unknown>;
		const source = text(edge.source, 80);
		const target = text(edge.target, 80);
		if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return [];
		return [{ id: text(edge.id, 100) ?? `${source}-${target}-${index}`, source, target, sourceHandle: text(edge.sourceHandle, 80) }];
	});
	const requestedEntry = text(value.entryNodeId, 80);
	return { schemaVersion: 2, entryNodeId: requestedEntry && nodeIds.has(requestedEntry) ? requestedEntry : nodes.find((node) => node.type === "start")?.id ?? nodes[0]?.id ?? null, nodes, edges };
}

function routeConfig(value: unknown) {
	const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const rules = (Array.isArray(raw.rules) ? raw.rules : []).slice(0, 32).flatMap((entry, index) => {
		if (!entry || typeof entry !== "object") return [];
		const rule = entry as Record<string, unknown>;
		const condition = rule.condition && typeof rule.condition === "object" ? rule.condition as Record<string, unknown> : {};
		const field = text(condition.field, 32) ?? "always";
		const operator = text(condition.operator, 32) ?? (field === "always" ? "exists" : "equals");
		if (!FIELDS.has(field) || !OPERATORS.has(operator)) return [];
		return [{
			id: text(rule.id, 80) ?? crypto.randomUUID(),
			name: text(rule.name, 120) ?? `Rule ${index + 1}`,
			enabled: rule.enabled !== false,
			condition: {
				field,
				operator,
				value: text(condition.value, 512),
				metadataKey: text(condition.metadataKey, 128),
			},
			action: action(rule.action),
		}];
	});
	return {
		...(Array.isArray(raw.nodes) ? graph(raw) : {}),
		cacheAwareRouting: raw.cacheAwareRouting !== false,
		sessionAffinity: raw.sessionAffinity !== false,
		defaultAction: action(raw.defaultAction),
		rules,
	};
}

function isAdmin(role: string): boolean {
	return role === "owner" || role === "admin";
}

async function invalidateGatewayKey(env: Env, keyId: string) {
	const key = env.PHASEO_MANAGEMENT_KEY ?? env.PHASEO_CONTROL_KEY;
	if (!key || !env.PHASEO_CONTROL_SECRET) return;
	await fetch(`${(env.GATEWAY_API_ORIGIN ?? "http://localhost:8787").replace(/\/$/, "")}/v1/keys/${encodeURIComponent(keyId)}/invalidate`, {
		method: "POST",
		headers: { authorization: `Bearer ${key}`, "x-control-secret": env.PHASEO_CONTROL_SECRET },
	});
}

async function invalidateKeys(c: any, keyIds: string[]) {
	await Promise.allSettled([...new Set(keyIds)].map((keyId) => invalidateGatewayKey(c.env, keyId)));
}

export const accountSettingsDynamicRoutesRouter = new Hono<{ Bindings: Env }>();

accountSettingsDynamicRoutesRouter.get("/dynamic-routes", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ workspaceId: null, routes: [], keys: [], providers: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [routesResult, linksResult, keysResult, providersResult] = await Promise.all([
		context.client.from("gateway_dynamic_routes").select("id,workspace_id,name,slug,description,status,version,deployed_version,config,created_at,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
		context.client.from("gateway_dynamic_route_keys").select("route_id,key_id"),
		context.client.from("keys").select("id,name,prefix,status").eq("workspace_id", workspaceId).neq("status", "deleted").neq("name", "__chat_route_managed_key__").neq("name", SLACK_AGENT_MANAGED_KEY_NAME).order("created_at", { ascending: false }),
		context.client.from("v2_providers")
			.select("api_provider_id:provider_slug,api_provider_name:name,status,routing_enabled")
			.eq("routable", true)
			.eq("routing_enabled", true)
			.in("status", ["active", "degraded"])
			.order("name", { ascending: true }),
	]);
	if ([routesResult, linksResult, keysResult, providersResult].some((result) => result.error)) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const routeIds = new Set((routesResult.data ?? []).map((route) => route.id));
	const versionsResult = routeIds.size
		? await context.client.from("gateway_dynamic_route_versions").select("route_id,version,config,created_by,created_at").in("route_id", [...routeIds]).order("version", { ascending: false })
		: { data: [], error: null };
	if (versionsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const versionsByRoute = new Map<string, any[]>();
	for (const version of versionsResult.data ?? []) {
		if (!routeIds.has(version.route_id)) continue;
		versionsByRoute.set(version.route_id, [...(versionsByRoute.get(version.route_id) ?? []), version]);
	}
	const keyIdsByRoute = new Map<string, string[]>();
	for (const row of linksResult.data ?? []) {
		if (!routeIds.has(row.route_id)) continue;
		keyIdsByRoute.set(row.route_id, [...(keyIdsByRoute.get(row.route_id) ?? []), row.key_id]);
	}
	return c.json({
		workspaceId,
		routes: (routesResult.data ?? []).map((route) => {
			const versions = versionsByRoute.get(route.id) ?? [];
			const latest = versions[0];
			return {
				...route,
				config: latest?.config ?? route.config,
				keyIds: keyIdsByRoute.get(route.id) ?? [],
				versions: versions.map((item) => ({ version: item.version, status: item.version === route.deployed_version ? "deployed" : item.version === route.version ? "draft" : "superseded", created_at: item.created_at, created_by: item.created_by })),
			};
		}),
		keys: keysResult.data ?? [],
		providers: (providersResult.data ?? []).map((provider) => ({
			id: provider.api_provider_id,
			name: provider.api_provider_name ?? provider.api_provider_id,
			status: provider.status,
			routingStatus: provider.routing_enabled ? "active" : "disabled",
		})),
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDynamicRoutesRouter.post("/dynamic-routes", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = text(body.workspaceId, 80);
	const name = text(body.name, 80);
	if (!workspaceId || !name) return c.json({ error: "invalid_route" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !isAdmin(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const config = routeConfig(body.config);
	const result = await context.client.from("gateway_dynamic_routes").insert({
		workspace_id: workspaceId,
		name,
		slug: slug(body.slug, name),
		description: text(body.description, 500),
		status: body.status === "paused" ? "paused" : "active",
		config: {},
		created_by: user.id,
	}).select("id,version,created_at").maybeSingle();
	if (result.error) return c.json({ error: /unique/i.test(result.error.message) ? "duplicate_route" : "route_write_failed" }, /unique/i.test(result.error.message) ? 409 : 503, PRIVATE_NO_STORE_HEADERS);
	const routeId = result.data?.id;
	if (!routeId) return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const versionResult = await context.client.from("gateway_dynamic_route_versions").insert({ route_id: routeId, version: 1, config, created_by: user.id });
	if (versionResult.error) {
		await context.client.from("gateway_dynamic_routes").delete().eq("id", routeId);
		return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ route: { id: result.data?.id, name, version: result.data?.version ?? 1, createdAt: result.data?.created_at } }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDynamicRoutesRouter.put("/dynamic-routes/:routeId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const routeId = c.req.param("routeId");
	const existing = await client.from("gateway_dynamic_routes").select("id,workspace_id,version").eq("id", routeId).maybeSingle();
	if (existing.error || !existing.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: existing.data.workspace_id });
	if (!context || !isAdmin(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const nextVersion = Number(existing.data.version ?? 1) + 1;
	const update: Record<string, unknown> = { updated_at: new Date().toISOString(), version: nextVersion };
	if (body.name !== undefined) { const name = text(body.name, 80); if (!name) return c.json({ error: "invalid_route" }, 400, PRIVATE_NO_STORE_HEADERS); update.name = name; }
	if (body.description !== undefined) update.description = text(body.description, 500);
	if (body.status !== undefined) update.status = body.status === "paused" ? "paused" : "active";
	const config = routeConfig(body.config);
	const versionResult = await context.client.from("gateway_dynamic_route_versions").insert({ route_id: routeId, version: nextVersion, config, created_by: user.id });
	if (versionResult.error) return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("gateway_dynamic_routes").update(update).eq("id", routeId).eq("workspace_id", context.workspaceId);
	if (result.error) {
		await context.client.from("gateway_dynamic_route_versions").delete().eq("route_id", routeId).eq("version", nextVersion);
		return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ success: true, version: update.version }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDynamicRoutesRouter.post("/dynamic-routes/:routeId/versions/:version/deploy", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const routeId = c.req.param("routeId");
	const version = Number(c.req.param("version"));
	if (!Number.isInteger(version) || version < 1) return c.json({ error: "invalid_version" }, 400, PRIVATE_NO_STORE_HEADERS);
	const route = await client.from("gateway_dynamic_routes").select("id,workspace_id").eq("id", routeId).maybeSingle();
	if (route.error || !route.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: route.data.workspace_id });
	if (!context || !isAdmin(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const selected = await context.client.from("gateway_dynamic_route_versions").select("config").eq("route_id", routeId).eq("version", version).maybeSingle();
	if (selected.error || !selected.data?.config) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const deployed = await context.client.from("gateway_dynamic_routes").update({ config: selected.data.config, deployed_version: version, updated_at: new Date().toISOString() }).eq("id", routeId).eq("workspace_id", context.workspaceId);
	if (deployed.error) return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const links = await context.client.from("gateway_dynamic_route_keys").select("key_id").eq("route_id", routeId);
	c.executionCtx.waitUntil(invalidateKeys(c, (links.data ?? []).map((row) => row.key_id)));
	return c.json({ success: true, deployedVersion: version }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDynamicRoutesRouter.put("/dynamic-routes/:routeId/keys", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const routeId = c.req.param("routeId");
	const route = await client.from("gateway_dynamic_routes").select("id,workspace_id").eq("id", routeId).maybeSingle();
	if (route.error || !route.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: route.data.workspace_id });
	if (!context || !isAdmin(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: { keyIds?: unknown } = await c.req.json<{ keyIds?: unknown }>().catch(() => ({}));
	const keyIds = providers(body.keyIds);
	const keys = keyIds.length ? await context.client.from("keys").select("id").eq("workspace_id", context.workspaceId).in("id", keyIds) : { data: [], error: null };
	if (keys.error || (keys.data ?? []).length !== keyIds.length) return c.json({ error: "invalid_keys" }, 409, PRIVATE_NO_STORE_HEADERS);
	const previous = await context.client.from("gateway_dynamic_route_keys").select("key_id").eq("route_id", routeId);
	if (previous.error) return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const replaced = await context.client.rpc("replace_gateway_dynamic_route_keys", {
		p_route_id: routeId,
		p_key_ids: keyIds,
		p_attached_by: user.id,
	});
	if (replaced.error) return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const invalidated = [...(previous.data ?? []).map((row) => row.key_id), ...keyIds];
	c.executionCtx.waitUntil(invalidateKeys(c, invalidated));
	return c.json({ success: true, keyIds }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsDynamicRoutesRouter.delete("/dynamic-routes/:routeId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const routeId = c.req.param("routeId");
	const route = await client.from("gateway_dynamic_routes").select("id,workspace_id,name").eq("id", routeId).maybeSingle();
	if (route.error || !route.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: route.data.workspace_id });
	if (!context || !isAdmin(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const confirm = c.req.query("confirmName");
	if (confirm && confirm !== route.data.name) return c.json({ error: "confirmation_mismatch" }, 409, PRIVATE_NO_STORE_HEADERS);
	const links = await context.client.from("gateway_dynamic_route_keys").select("key_id").eq("route_id", routeId);
	const deleted = await context.client.from("gateway_dynamic_routes").delete().eq("id", routeId).eq("workspace_id", context.workspaceId);
	if (deleted.error) return c.json({ error: "route_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(invalidateKeys(c, (links.data ?? []).map((row) => row.key_id)));
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
