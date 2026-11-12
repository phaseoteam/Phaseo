import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import { invalidateWorkspaceGatewayContext } from "./gateway-invalidation";
import {
	BUDGET_INTERVAL_ERROR,
	BUDGET_LIMIT_ERROR,
	budgetIntervalRank,
	budgetNanosToUsd,
	budgetUsdToNanos,
	parseBudgetInterval,
	parseBudgetLimitUsd,
	type BudgetInterval,
} from "./workspace-budgets";

// Workspace budgets for the settings page. Writes go through the same shared
// validation as the control API (packages/shared/workspace-budgets), are
// audit-logged with the same actions, and invalidate the gateway's cached
// workspace context so enforcement picks up the change at once.
//
// Usage comes from gateway_workspace_budget_status, the function the gateway
// enforces with, so the page shows exactly what enforcement sees. Every member
// can read budgets; only owners and admins can change them.
//
// Department budgets (workspace_department_budgets) live on the same page.
// They only alert, through the 15-minute sweep_department_budget_alerts, so
// their writes need no gateway invalidation. Usage comes from
// workspace_department_budget_status, the function the sweep reads, and the
// writes use the same validation and audit actions as /v1/department-budgets.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUDGET_COLUMNS = "id,workspace_id,interval,limit_nanos,created_by,created_at,updated_at";

type Body = Record<string, unknown>;

type BudgetRow = {
	id: string;
	workspace_id: string;
	interval: BudgetInterval;
	limit_nanos: number | string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

type BudgetStatusRow = BudgetRow & {
	usage_nanos?: number | string | null;
	window_start?: string | null;
	reset_at?: string | null;
};

export type DepartmentBudgetInterval = Exclude<BudgetInterval, "lifetime">;

export type SettingsDepartmentBudget = Omit<SettingsWorkspaceBudget, "interval"> & {
	interval: DepartmentBudgetInterval;
	department_id: string;
	department_name: string | null;
};

export type SettingsBudgetDepartment = { id: string; name: string };

const DEPARTMENT_BUDGET_COLUMNS = "id,workspace_id,department_id,interval,limit_nanos,created_by,created_at,updated_at";
const DEPARTMENT_BUDGET_INTERVAL_ERROR = "interval must be daily, weekly, or monthly";

type DepartmentBudgetRow = Omit<BudgetRow, "interval"> & { interval: DepartmentBudgetInterval; department_id: string };
type DepartmentBudgetStatusRow = DepartmentBudgetRow & Omit<BudgetStatusRow, "interval"> & { department_name?: string | null };

export type SettingsWorkspaceBudget = {
	id: string;
	interval: BudgetInterval;
	limit_usd: number;
	limit_nanos: number;
	usage_usd: number;
	usage_nanos: number;
	remaining_nanos: number;
	/** Share of the limit used so far, 0–100+ (it can pass 100 while held work settles). */
	percent_used: number;
	exceeded: boolean;
	window_start: string | null;
	/** When the window resets; null for lifetime budgets. */
	reset_at: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

function json(c: any, body: unknown, status = 200) {
	return c.json(body, status, PRIVATE_NO_STORE_HEADERS);
}

function badRequest(c: any, message: string) {
	return json(c, { error: "bad_request", message }, 400);
}

async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

export function canManageBudgets(context: AccountWorkspaceContext): boolean {
	return context.isOwner || ["owner", "admin"].includes(context.role.toLowerCase());
}

async function managerContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") });
	if (!context) return { response: json(c, { error: "forbidden" }, 403) } as const;
	if (!canManageBudgets(context)) {
		return { response: json(c, { error: "forbidden", message: "Only workspace owners and admins can manage budgets" }, 403) } as const;
	}
	return { context } as const;
}

function budgetId(c: any): string | null {
	const id = String(c.req.param("budgetId") ?? "").trim();
	return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

function departmentBudgetId(c: any): string | null {
	const id = String(c.req.param("departmentBudgetId") ?? "").trim();
	return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

/** Department budgets have no lifetime window. */
function parseDepartmentBudgetInterval(value: unknown): DepartmentBudgetInterval | null {
	const interval = parseBudgetInterval(value);
	return interval && interval !== "lifetime" ? interval : null;
}

export function formatSettingsDepartmentBudget(row: DepartmentBudgetStatusRow): SettingsDepartmentBudget {
	return {
		...formatSettingsBudget(row),
		interval: row.interval,
		department_id: row.department_id,
		department_name: row.department_name ?? null,
	};
}

export function formatSettingsBudget(row: Omit<BudgetStatusRow, "interval"> & { interval: BudgetInterval }): SettingsWorkspaceBudget {
	const limitNanos = Number(row.limit_nanos) || 0;
	const usageNanos = Math.max(0, Number(row.usage_nanos ?? 0) || 0);
	return {
		id: row.id,
		interval: row.interval,
		limit_usd: budgetNanosToUsd(limitNanos),
		limit_nanos: limitNanos,
		usage_usd: budgetNanosToUsd(usageNanos),
		usage_nanos: usageNanos,
		remaining_nanos: Math.max(limitNanos - usageNanos, 0),
		percent_used: limitNanos > 0 ? (usageNanos / limitNanos) * 100 : 0,
		exceeded: limitNanos > 0 && usageNanos >= limitNanos,
		window_start: row.window_start ?? null,
		reset_at: row.reset_at ?? null,
		created_by: row.created_by ?? null,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/** One RPC: the status function aggregates usage in SQL for every budget of the workspace. */
async function loadBudgetStatus(context: AccountWorkspaceContext): Promise<{ budgets: BudgetStatusRow[]; now: string | null }> {
	const { data, error } = await context.client.rpc("gateway_workspace_budget_status", {
		p_workspace_id: context.workspaceId,
		p_requested_amount_nanos: 0,
	});
	if (error) throw error;
	const result = data as { budgets?: unknown; now?: unknown } | null;
	const budgets = Array.isArray(result?.budgets) ? result.budgets as BudgetStatusRow[] : [];
	return { budgets, now: typeof result?.now === "string" ? result.now : null };
}

/** One RPC: usage per department budget, summed in SQL. */
async function loadDepartmentBudgetStatus(context: AccountWorkspaceContext): Promise<DepartmentBudgetStatusRow[]> {
	const { data, error } = await context.client.rpc("workspace_department_budget_status", { p_workspace_id: context.workspaceId });
	if (error) throw error;
	return Array.isArray(data) ? data as DepartmentBudgetStatusRow[] : [];
}

async function loadDepartments(context: AccountWorkspaceContext): Promise<SettingsBudgetDepartment[]> {
	const { data, error } = await context.client.from("workspace_departments").select("id,name")
		.eq("workspace_id", context.workspaceId).order("name").limit(500);
	if (error) throw error;
	return (data ?? []).map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }));
}

async function departmentStatusFor(context: AccountWorkspaceContext, row: DepartmentBudgetRow): Promise<SettingsDepartmentBudget> {
	const status = await loadDepartmentBudgetStatus(context).catch(() => null);
	return formatSettingsDepartmentBudget(status?.find((budget) => budget.id === row.id) ?? row);
}

async function auditDepartmentBudget(context: AccountWorkspaceContext, action: "created" | "updated" | "deleted", row: DepartmentBudgetRow) {
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: `workspace_department_budget.${action}`,
		targetType: "workspace_department_budget",
		targetId: row.id,
		targetName: row.interval,
		metadata: { department_id: row.department_id, interval: row.interval, limit_nanos: Number(row.limit_nanos) },
	});
}

async function statusFor(context: AccountWorkspaceContext, row: BudgetRow): Promise<SettingsWorkspaceBudget> {
	const status = await loadBudgetStatus(context).catch(() => null);
	return formatSettingsBudget(status?.budgets.find((budget) => budget.id === row.id) ?? row);
}

async function audit(context: AccountWorkspaceContext, action: "created" | "updated" | "deleted", row: BudgetRow) {
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: `workspace_budget.${action}`,
		targetType: "workspace_budget",
		targetId: row.id,
		targetName: row.interval,
		metadata: { interval: row.interval, limit_nanos: Number(row.limit_nanos) },
	});
}

async function invalidate(context: AccountWorkspaceContext, env: Env): Promise<boolean> {
	return invalidateWorkspaceGatewayContext(context, env).catch(() => false);
}

export const accountSettingsBudgetsRouter = new Hono<{ Bindings: Env }>();

accountSettingsBudgetsRouter.get("/budgets", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		return json(c, { workspaceId: null, canManageBudgets: false, observedAt: new Date().toISOString(), budgets: [], departmentBudgets: [], departments: [] });
	}
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return json(c, { error: "forbidden" }, 403);
	try {
		// Department budgets are optional on the page: if they can't be read, the
		// workspace budgets still load and departmentBudgets is null.
		const [status, departmentSection] = await Promise.all([
			loadBudgetStatus(context),
			Promise.all([loadDepartmentBudgetStatus(context), loadDepartments(context)]).catch(() => null),
		]);
		const budgets = status.budgets
			.map(formatSettingsBudget)
			.sort((a, b) => budgetIntervalRank(a.interval) - budgetIntervalRank(b.interval));
		return json(c, {
			workspaceId: context.workspaceId,
			canManageBudgets: canManageBudgets(context),
			observedAt: status.now ?? new Date().toISOString(),
			budgets,
			departmentBudgets: departmentSection ? departmentSection[0].map(formatSettingsDepartmentBudget) : null,
			departments: departmentSection ? departmentSection[1] : [],
		});
	} catch {
		return json(c, { error: "budgets_unavailable" }, 503);
	}
});

accountSettingsBudgetsRouter.post("/budgets", async (c) => {
	const body = await readBody(c);
	const manager = await managerContext(c, body.workspaceId);
	if ("response" in manager) return manager.response;
	const { context } = manager;
	const interval = parseBudgetInterval(body.interval);
	const limit = parseBudgetLimitUsd(body.limit);
	if (!interval) return badRequest(c, BUDGET_INTERVAL_ERROR);
	if (limit === null) return badRequest(c, BUDGET_LIMIT_ERROR);
	const result = await context.client.from("workspace_budgets").insert({
		workspace_id: context.workspaceId,
		interval,
		limit_nanos: budgetUsdToNanos(limit),
		created_by: context.user.id,
	}).select(BUDGET_COLUMNS).maybeSingle();
	if (result.error) {
		if (result.error.code === "23505") return json(c, { error: "conflict", message: `A ${interval} budget already exists` }, 409);
		return json(c, { error: "budget_write_failed" }, 503);
	}
	const row = result.data as BudgetRow;
	await audit(context, "created", row);
	const gatewayCacheInvalidated = await invalidate(context, c.env);
	return json(c, { budget: await statusFor(context, row), gatewayCacheInvalidated }, 201);
});

accountSettingsBudgetsRouter.patch("/budgets/:budgetId", async (c) => {
	const body = await readBody(c);
	const manager = await managerContext(c, body.workspaceId);
	if ("response" in manager) return manager.response;
	const { context } = manager;
	const id = budgetId(c);
	if (!id) return badRequest(c, "Budget id is required");
	const interval = body.interval === undefined ? undefined : parseBudgetInterval(body.interval);
	const limit = body.limit === undefined ? undefined : parseBudgetLimitUsd(body.limit);
	if (body.interval !== undefined && !interval) return badRequest(c, BUDGET_INTERVAL_ERROR);
	if (body.limit !== undefined && limit === null) return badRequest(c, BUDGET_LIMIT_ERROR);
	if (interval === undefined && limit === undefined) return badRequest(c, "Provide interval or limit");
	const result = await context.client.from("workspace_budgets").update({
		...(interval ? { interval } : {}),
		...(typeof limit === "number" ? { limit_nanos: budgetUsdToNanos(limit) } : {}),
		updated_at: new Date().toISOString(),
	}).eq("workspace_id", context.workspaceId).eq("id", id).select(BUDGET_COLUMNS).maybeSingle();
	if (result.error) {
		if (result.error.code === "23505") return json(c, { error: "conflict", message: `A ${interval} budget already exists` }, 409);
		return json(c, { error: "budget_write_failed" }, 503);
	}
	if (!result.data) return json(c, { error: "not_found", message: "Budget not found" }, 404);
	const row = result.data as BudgetRow;
	await audit(context, "updated", row);
	const gatewayCacheInvalidated = await invalidate(context, c.env);
	return json(c, { budget: await statusFor(context, row), gatewayCacheInvalidated });
});

accountSettingsBudgetsRouter.delete("/budgets/:budgetId", async (c) => {
	const body = await readBody(c);
	const manager = await managerContext(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in manager) return manager.response;
	const { context } = manager;
	const id = budgetId(c);
	if (!id) return badRequest(c, "Budget id is required");
	const result = await context.client.from("workspace_budgets").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select(BUDGET_COLUMNS).maybeSingle();
	if (result.error) return json(c, { error: "budget_write_failed" }, 503);
	if (!result.data) return json(c, { error: "not_found", message: "Budget not found" }, 404);
	const row = result.data as BudgetRow;
	await audit(context, "deleted", row);
	const gatewayCacheInvalidated = await invalidate(context, c.env);
	return json(c, { deleted: true, id: row.id, gatewayCacheInvalidated });
});

accountSettingsBudgetsRouter.post("/budgets/departments", async (c) => {
	const body = await readBody(c);
	const manager = await managerContext(c, body.workspaceId);
	if ("response" in manager) return manager.response;
	const { context } = manager;
	const departmentId = String(body.departmentId ?? "").trim();
	const interval = parseDepartmentBudgetInterval(body.interval);
	const limit = parseBudgetLimitUsd(body.limit);
	if (!UUID_PATTERN.test(departmentId)) return badRequest(c, "departmentId must be a UUID");
	if (!interval) return badRequest(c, DEPARTMENT_BUDGET_INTERVAL_ERROR);
	if (limit === null) return badRequest(c, BUDGET_LIMIT_ERROR);
	const result = await context.client.from("workspace_department_budgets").insert({
		workspace_id: context.workspaceId,
		department_id: departmentId.toLowerCase(),
		interval,
		limit_nanos: budgetUsdToNanos(limit),
		created_by: context.user.id,
	}).select(DEPARTMENT_BUDGET_COLUMNS).maybeSingle();
	if (result.error) {
		if (result.error.code === "23505") return json(c, { error: "conflict", message: `This department already has a ${interval} budget` }, 409);
		// The foreign key covers (department_id, workspace_id), so another workspace's department is not found either.
		if (result.error.code === "23503") return json(c, { error: "not_found", message: "Department not found" }, 404);
		return json(c, { error: "budget_write_failed" }, 503);
	}
	const row = result.data as DepartmentBudgetRow;
	await auditDepartmentBudget(context, "created", row);
	return json(c, { budget: await departmentStatusFor(context, row) }, 201);
});

accountSettingsBudgetsRouter.patch("/budgets/departments/:departmentBudgetId", async (c) => {
	const body = await readBody(c);
	const manager = await managerContext(c, body.workspaceId);
	if ("response" in manager) return manager.response;
	const { context } = manager;
	const id = departmentBudgetId(c);
	if (!id) return badRequest(c, "Budget id is required");
	const limit = parseBudgetLimitUsd(body.limit);
	if (limit === null) return badRequest(c, BUDGET_LIMIT_ERROR);
	const result = await context.client.from("workspace_department_budgets").update({
		limit_nanos: budgetUsdToNanos(limit),
		updated_at: new Date().toISOString(),
	}).eq("workspace_id", context.workspaceId).eq("id", id).select(DEPARTMENT_BUDGET_COLUMNS).maybeSingle();
	if (result.error) return json(c, { error: "budget_write_failed" }, 503);
	if (!result.data) return json(c, { error: "not_found", message: "Budget not found" }, 404);
	const row = result.data as DepartmentBudgetRow;
	await auditDepartmentBudget(context, "updated", row);
	return json(c, { budget: await departmentStatusFor(context, row) });
});

accountSettingsBudgetsRouter.delete("/budgets/departments/:departmentBudgetId", async (c) => {
	const body = await readBody(c);
	const manager = await managerContext(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in manager) return manager.response;
	const { context } = manager;
	const id = departmentBudgetId(c);
	if (!id) return badRequest(c, "Budget id is required");
	const result = await context.client.from("workspace_department_budgets").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select(DEPARTMENT_BUDGET_COLUMNS).maybeSingle();
	if (result.error) return json(c, { error: "budget_write_failed" }, 503);
	if (!result.data) return json(c, { error: "not_found", message: "Budget not found" }, 404);
	const row = result.data as DepartmentBudgetRow;
	await auditDepartmentBudget(context, "deleted", row);
	return json(c, { deleted: true, id: row.id });
});
