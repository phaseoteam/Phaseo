import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";
import { workspaceUserProfile } from "./workspaceUserProfile";
import { keyUsageSeries } from "./keyUsageSeries";
import { metadataForIds } from "./settings-usage";

export const accountSettingsWorkspaceUsersRouter = new Hono<{ Bindings: Env }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

accountSettingsWorkspaceUsersRouter.get("/workspace-users/:userId", async (c) => {
	if (!await requireUser(c.req.raw, c.env)) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = c.req.query("workspaceId") ?? "";
	const userId = c.req.param("userId");
	if (!UUID.test(workspaceId) || !UUID.test(userId)) return c.json({ error: "invalid_user_scope" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const page = Math.max(1, Math.min(10000, Math.trunc(Number(c.req.query("keyPage")) || 1)));
	const [member, workspace, keys] = await Promise.all([
		context.client.from("workspace_members").select("role,joined_at").eq("workspace_id", context.workspaceId).eq("user_id", userId).maybeSingle(),
		context.client.from("workspaces").select("owner_user_id").eq("id", context.workspaceId).maybeSingle(),
		context.client.from("keys").select("id,workspace_id,name,prefix,status,created_at,last_used_at,expires_at", { count: "exact" }).eq("workspace_id", context.workspaceId).eq("created_by", userId).neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: false }).order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
	]);
	if (member.error || workspace.error || keys.error) return c.json({ error: "user_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!member.data && workspace.data?.owner_user_id !== userId && !keys.count) {
		const historicalKey = await context.client.from("keys").select("id").eq("workspace_id", context.workspaceId).eq("created_by", userId).limit(1);
		if (historicalKey.error) return c.json({ error: "user_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!historicalKey.data?.length) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	}
	const to = new Date();
	const from = new Date(to); from.setUTCHours(0, 0, 0, 0); from.setUTCDate(from.getUTCDate() - 29);
	const [profile, usage, logs] = await Promise.all([
		workspaceUserProfile(context, userId),
		context.client.rpc("get_workspace_user_usage", { p_workspace_id: context.workspaceId, p_user_id: userId, p_from: from.toISOString(), p_to: to.toISOString() }),
		context.client.from("v2_web_gateway_requests_by_creator").select("request_id,created_at,model_id,success,cost_nanos").eq("workspace_id", context.workspaceId).eq("key_created_by", userId).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at", { ascending: false }).order("request_id").limit(50),
	]);
	let analytics = null;
	if (!usage.error && usage.data) {
		const value = usage.data as { requests: number; spendUsd: number; points: Array<{ date: string; requests: number; spendUsd: number }>; models: Array<{ modelId: string; requests: number; spendUsd: number }> };
		analytics = { ...value, points: keyUsageSeries(value.points.map((point) => ({ bucket: point.date, requests: point.requests, cost: point.spendUsd })), from.toISOString(), to.toISOString()) };
	}
	const modelIds = Array.from(new Set([...(analytics?.models ?? []).map((model) => model.modelId), ...(logs.data ?? []).map((log) => log.model_id)].filter((id): id is string => Boolean(id))));
	const metadata = await metadataForIds(context, { models: modelIds }).catch(() => ({ modelMetadataEntries: [] }));
	return c.json({ profile, modelMetadataEntries: metadata.modelMetadataEntries, workspaceId: context.workspaceId, workspaceName: context.workspaceName, role: workspace.data?.owner_user_id === userId ? "owner" : member.data?.role ?? null, joinedAt: member.data?.joined_at ?? null,
		from: from.toISOString(), to: to.toISOString(), analytics, keys: (keys.data ?? []).slice(0, PAGE_SIZE), keyCount: keys.count ?? 0, keyPage: page, hasMoreKeys: (keys.data?.length ?? 0) > PAGE_SIZE, logs: logs.error ? null : logs.data ?? [],
	}, 200, PRIVATE_NO_STORE_HEADERS);
});
