import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { setKeyVersion } from "@/core/kv";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import {
	internalServerError,
	isResponse,
	parsePathId,
	requireCapability,
	requireJsonBody,
	requireOAuthWorkspaceRole,
} from "./route-helpers";
// Validation is shared with the settings API and page (packages/shared/workspace-budgets).
import {
	BUDGET_INTERVAL_ERROR,
	BUDGET_LIMIT_ERROR,
	budgetNanosToUsd,
	budgetUsdToNanos,
	parseBudgetInterval,
	parseBudgetLimitUsd,
	type BudgetInterval,
} from "@/core/workspace-budgets";

const BUDGET_COLUMNS = "id,workspace_id,interval,limit_nanos,created_by,created_at,updated_at";

type BudgetRow = {
	id: string;
	workspace_id: string;
	interval: BudgetInterval;
	limit_nanos: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

type BudgetStatusRow = BudgetRow & {
	usage_nanos?: number;
	remaining_nanos?: number;
	projected_usage_nanos?: number;
	exceeded?: boolean;
	window_start?: string | null;
	reset_at?: string | null;
};

function actorUserId(auth: { userId?: string | null }): string | null {
	return auth.userId?.trim() || null;
}

async function invalidateWorkspaceGatewayContext(workspaceId: string): Promise<void> {
	const { data, error } = await getSupabaseAdmin().from("keys")
		.select("id").eq("workspace_id", workspaceId).neq("status", "deleted");
	if (error) throw error;
	const version = Date.now();
	await Promise.all((data ?? []).map((row) => setKeyVersion("id", String(row.id), version)));
}

async function loadBudgetStatus(workspaceId: string): Promise<Map<string, BudgetStatusRow>> {
	const { data, error } = await getSupabaseAdmin().rpc("gateway_workspace_budget_status", {
		p_workspace_id: workspaceId,
		p_requested_amount_nanos: 0,
	});
	if (error) throw error;
	const budgets = Array.isArray((data as { budgets?: unknown } | null)?.budgets)
		? (data as { budgets: BudgetStatusRow[] }).budgets
		: [];
	return new Map(budgets.map((budget) => [budget.id, budget]));
}

function formatBudget(row: BudgetRow, status?: BudgetStatusRow) {
	const usageNanos = Number(status?.usage_nanos ?? 0);
	const limitNanos = Number(row.limit_nanos);
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		interval: row.interval,
		limit: budgetNanosToUsd(limitNanos),
		limit_nanos: limitNanos,
		usage: budgetNanosToUsd(usageNanos),
		usage_nanos: usageNanos,
		remaining: budgetNanosToUsd(Math.max(limitNanos - usageNanos, 0)),
		remaining_nanos: Math.max(limitNanos - usageNanos, 0),
		exceeded: usageNanos >= limitNanos,
		window_start: status?.window_start ?? null,
		reset_at: status?.reset_at ?? null,
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

async function authorize(req: Request, capability: string) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError } as const;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError } as const;
	return { auth: auth.value } as const;
}

async function handleListBudgets(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_READ);
	if ("response" in authorization) return authorization.response;
	try {
		const supabase = getSupabaseAdmin();
		const [{ data, error }, statuses] = await Promise.all([
			supabase.from("workspace_budgets").select(BUDGET_COLUMNS)
				.eq("workspace_id", authorization.auth.workspaceId).order("created_at", { ascending: true }),
			loadBudgetStatus(authorization.auth.workspaceId),
		]);
		if (error) throw error;
		return json({ data: (data ?? []).map((row) => formatBudget(row as BudgetRow, statuses.get(row.id))) }, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		return internalServerError("budgets.list", error);
	}
}

async function handleCreateBudget(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_WRITE);
	if ("response" in authorization) return authorization.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const interval = parseBudgetInterval(body.interval);
	const limit = parseBudgetLimitUsd(body.limit);
	if (!interval) return json({ error: "bad_request", message: BUDGET_INTERVAL_ERROR }, 400, { "Cache-Control": "no-store" });
	if (limit === null) return json({ error: "bad_request", message: BUDGET_LIMIT_ERROR }, 400, { "Cache-Control": "no-store" });
	try {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.from("workspace_budgets").insert({
			workspace_id: authorization.auth.workspaceId,
			interval,
			limit_nanos: budgetUsdToNanos(limit),
			created_by: actorUserId(authorization.auth),
		}).select(BUDGET_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: `A ${interval} budget already exists` }, 409, { "Cache-Control": "no-store" });
			throw error;
		}
		const row = data as BudgetRow;
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: authorization.auth.workspaceId,
			actorUserId: actorUserId(authorization.auth),
			action: "workspace_budget.created",
			targetType: "workspace_budget",
			targetId: row.id,
			targetName: interval,
			metadata: { interval, limit_nanos: row.limit_nanos },
		});
		await invalidateWorkspaceGatewayContext(authorization.auth.workspaceId);
		const statuses = await loadBudgetStatus(authorization.auth.workspaceId);
		return json({ data: formatBudget(row, statuses.get(row.id)) }, 201, { "Cache-Control": "no-store" });
	} catch (error) {
		return internalServerError("budgets.create", error);
	}
}

async function handleGetBudget(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_READ);
	if ("response" in authorization) return authorization.response;
	const id = parsePathId(new URL(req.url), "budgets");
	if (!id) return json({ error: "bad_request", message: "Budget id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const supabase = getSupabaseAdmin();
		const [{ data, error }, statuses] = await Promise.all([
			supabase.from("workspace_budgets").select(BUDGET_COLUMNS)
				.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).maybeSingle(),
			loadBudgetStatus(authorization.auth.workspaceId),
		]);
		if (error) throw error;
		if (!data) return json({ error: "not_found", message: "Budget not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data: formatBudget(data as BudgetRow, statuses.get(data.id)) }, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		return internalServerError("budgets.get", error);
	}
}

async function handleUpdateBudget(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_WRITE);
	if ("response" in authorization) return authorization.response;
	const id = parsePathId(new URL(req.url), "budgets");
	if (!id) return json({ error: "bad_request", message: "Budget id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const interval = body.interval === undefined ? undefined : parseBudgetInterval(body.interval);
	const limit = body.limit === undefined ? undefined : parseBudgetLimitUsd(body.limit);
	if (body.interval !== undefined && !interval) return json({ error: "bad_request", message: BUDGET_INTERVAL_ERROR }, 400, { "Cache-Control": "no-store" });
	if (body.limit !== undefined && limit === null) return json({ error: "bad_request", message: BUDGET_LIMIT_ERROR }, 400, { "Cache-Control": "no-store" });
	if (interval === undefined && limit === undefined) return json({ error: "bad_request", message: "Provide interval or limit" }, 400, { "Cache-Control": "no-store" });
	try {
		const supabase = getSupabaseAdmin();
		const payload = {
			...(interval ? { interval } : {}),
			...(limit !== undefined && limit !== null ? { limit_nanos: budgetUsdToNanos(limit) } : {}),
			updated_at: new Date().toISOString(),
		};
		const { data, error } = await supabase.from("workspace_budgets").update(payload)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(BUDGET_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: `A ${interval} budget already exists` }, 409, { "Cache-Control": "no-store" });
			throw error;
		}
		if (!data) return json({ error: "not_found", message: "Budget not found" }, 404, { "Cache-Control": "no-store" });
		const row = data as BudgetRow;
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: authorization.auth.workspaceId,
			actorUserId: actorUserId(authorization.auth),
			action: "workspace_budget.updated",
			targetType: "workspace_budget",
			targetId: row.id,
			targetName: row.interval,
			metadata: { interval: row.interval, limit_nanos: row.limit_nanos },
		});
		await invalidateWorkspaceGatewayContext(authorization.auth.workspaceId);
		const statuses = await loadBudgetStatus(authorization.auth.workspaceId);
		return json({ data: formatBudget(row, statuses.get(row.id)) }, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		return internalServerError("budgets.update", error);
	}
}

async function handleDeleteBudget(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_DELETE);
	if ("response" in authorization) return authorization.response;
	const id = parsePathId(new URL(req.url), "budgets");
	if (!id) return json({ error: "bad_request", message: "Budget id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.from("workspace_budgets").delete()
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(BUDGET_COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return json({ error: "not_found", message: "Budget not found" }, 404, { "Cache-Control": "no-store" });
		const row = data as BudgetRow;
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: authorization.auth.workspaceId,
			actorUserId: actorUserId(authorization.auth),
			action: "workspace_budget.deleted",
			targetType: "workspace_budget",
			targetId: row.id,
			targetName: row.interval,
			metadata: { interval: row.interval, limit_nanos: row.limit_nanos },
		});
		await invalidateWorkspaceGatewayContext(authorization.auth.workspaceId);
		return json({ data: { id: row.id, deleted: true } }, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		return internalServerError("budgets.delete", error);
	}
}

export const budgetsRoutes = new Hono<Env>();
budgetsRoutes.get("/", withRuntime(handleListBudgets));
budgetsRoutes.post("/", withRuntime(handleCreateBudget));
budgetsRoutes.get("/:id", withRuntime(handleGetBudget));
budgetsRoutes.patch("/:id", withRuntime(handleUpdateBudget));
budgetsRoutes.delete("/:id", withRuntime(handleDeleteBudget));
