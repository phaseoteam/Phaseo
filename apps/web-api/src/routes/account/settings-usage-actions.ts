import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";
import {
	fetchAsyncJobDetail,
	fetchChartData,
	fetchFunStats,
	fetchJobsRollups,
	fetchAppMetadata,
	fetchAppNames,
	fetchModelMetadata,
	fetchOrganizationColors,
	fetchPaginatedRequests,
	fetchProviderMetadata,
	fetchProviderNames,
	fetchRecentAsyncJobs,
	fetchSessionRequests,
	fetchSessionRollups,
	investigateGeneration,
	runWithUsageContext,
} from "@/usage/actions";

export const accountSettingsUsageActionsRouter = new Hono<{ Bindings: Env }>();

accountSettingsUsageActionsRouter.get("/usage/realtime", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim() ?? "";
	const account = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!account) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const page = Math.max(1, Math.min(10000, Math.trunc(Number(c.req.query("page")) || 1)));
	const { data, error } = await account.client.from("gateway_realtime_sessions")
		.select("session_id,provider,model_id,voice,status,source,started_at,connected_at,ended_at,expires_at,reservation_count,reserved_nanos,captured_nanos,released_nanos,estimated_cost_nanos,final_cost_nanos,currency,usage,pricing_lines,disconnect_reason,error_code")
		.eq("workspace_id", account.workspaceId)
		.order("started_at", { ascending: false }).order("session_id", { ascending: false })
		.range((page - 1) * 50, page * 50);
	if (error) return c.json({ error: "realtime_sessions_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ sessions: (data ?? []).slice(0, 50), hasMore: (data ?? []).length > 50 }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsUsageActionsRouter.get("/usage/logs/:requestId", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim() ?? "";
	const requestId = c.req.param("requestId")?.trim() ?? "";
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	if (!requestId) return c.json({ error: "request_id_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const account = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!account) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await runWithUsageContext({ account, env: c.env }, () =>
			investigateGeneration(requestId),
		);
		if (!result.success || !result.data) {
			return c.json(
				{ error: result.error ?? "request_not_found" },
				result.error?.toLowerCase().includes("not found") ? 404 : 503,
				PRIVATE_NO_STORE_HEADERS,
			);
		}
		return c.json({ data: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("usage_log_detail_failed", { requestId, error });
		return c.json({ error: "usage_log_detail_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsUsageActionsRouter.post("/usage/actions", async (c) => {
	const body: { workspaceId?: unknown; operation?: unknown; args?: unknown[] } = await c.req.json().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const account = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!account) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const args = Array.isArray(body.args) ? body.args : [];
	try {
		const result = await runWithUsageContext({ account, env: c.env }, async () => {
			switch (body.operation) {
				case "paginatedRequests": return fetchPaginatedRequests(args[0] as any);
				case "funStats": return fetchFunStats(args[0] as any);
				case "investigateGeneration": return investigateGeneration(String(args[0] ?? ""));
				case "chartData": return fetchChartData(args[0] as any);
				case "sessionRollups": return fetchSessionRollups(args[0] as any);
				case "sessionRequests": return fetchSessionRequests(args[0] as any);
				case "jobsRollups": return fetchJobsRollups(args[0] as any);
				case "recentAsyncJobs": return fetchRecentAsyncJobs(args[0] as any);
				case "asyncJobDetail": return fetchAsyncJobDetail(args[0] as any);
				case "organizationColors": return Array.from((await fetchOrganizationColors(args[0] as string[])).entries());
				case "modelMetadata": return Array.from((await fetchModelMetadata(args[0] as string[])).entries());
				case "providerNames": return Array.from((await fetchProviderNames(args[0] as string[])).entries());
				case "providerMetadata": return Array.from((await fetchProviderMetadata(args[0] as string[])).entries());
				case "appNames": return Array.from((await fetchAppNames(args[0] as string[])).entries());
				case "appMetadata": return Array.from((await fetchAppMetadata(args[0] as string[])).entries());
				default: throw new Error("invalid_usage_operation");
			}
		});
		return c.json({ result }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("usage_action_failed", { operation: body.operation, error });
		return c.json({ error: error instanceof Error ? error.message : "usage_action_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});
