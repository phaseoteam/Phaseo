// Department spend budgets. They alert only: the 15-minute sweep
// (sweep_department_budget_alerts) pushes owners and admins at about 80% and
// 100%, and nothing here touches the gateway, so changes need no cache
// invalidation. Spend comes from workspace_department_budget_status, which
// counts a department's linked keys plus its members' unlinked keys and OAuth
// requests, from the hourly usage rollup.
import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
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

const COLUMNS = "id,workspace_id,department_id,interval,limit_nanos,created_by,created_at,updated_at";
const INTERVALS = ["daily", "weekly", "monthly"] as const;
type Interval = (typeof INTERVALS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

type Row = {
	id: string;
	workspace_id: string;
	department_id: string;
	interval: Interval;
	limit_nanos: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

type Status = {
	id: string;
	department_name?: string | null;
	usage_nanos?: number | string;
	window_start?: string | null;
	reset_at?: string | null;
};

function badRequest(message: string) {
	return json({ error: "bad_request", message }, 400, NO_STORE);
}

function notFound(message = "Department budget not found") {
	return json({ error: "not_found", message }, 404, NO_STORE);
}

function parseInterval(value: unknown): Interval | null {
	const interval = String(value ?? "").trim().toLowerCase();
	return INTERVALS.includes(interval as Interval) ? interval as Interval : null;
}

function parseUsd(value: unknown): number | null {
	const amount = Number(value);
	const nanos = Math.round(amount * 1_000_000_000);
	return Number.isFinite(amount) && amount > 0 && nanos > 0 && Number.isSafeInteger(nanos) ? nanos : null;
}

function parseUuid(value: unknown): string | null {
	const id = String(value ?? "").trim();
	return UUID.test(id) ? id.toLowerCase() : null;
}

function actorUserId(auth: { userId?: string | null }): string | null {
	return auth.userId?.trim() || null;
}

async function loadStatus(workspaceId: string): Promise<Map<string, Status>> {
	const { data, error } = await getSupabaseAdmin().rpc("workspace_department_budget_status", { p_workspace_id: workspaceId });
	if (error) throw error;
	const budgets = Array.isArray(data) ? data as Status[] : [];
	return new Map(budgets.map((budget) => [budget.id, budget]));
}

function format(row: Row, status?: Status) {
	const usageNanos = Number(status?.usage_nanos ?? 0);
	const limitNanos = Number(row.limit_nanos);
	const remainingNanos = Math.max(limitNanos - usageNanos, 0);
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		department_id: row.department_id,
		department_name: status?.department_name ?? null,
		interval: row.interval,
		limit: limitNanos / 1_000_000_000,
		limit_nanos: limitNanos,
		usage: usageNanos / 1_000_000_000,
		usage_nanos: usageNanos,
		remaining: remainingNanos / 1_000_000_000,
		remaining_nanos: remainingNanos,
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

function pathId(req: Request): string | null {
	return parseUuid(parsePathId(new URL(req.url), "department-budgets"));
}

async function audit(auth: { workspaceId: string; userId?: string | null }, action: string, row: Row) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action,
		targetType: "workspace_department_budget",
		targetId: row.id,
		targetName: row.interval,
		metadata: { department_id: row.department_id, interval: row.interval, limit_nanos: row.limit_nanos },
	});
}

async function handleList(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_READ);
	if ("response" in authorization) return authorization.response;
	const filter = new URL(req.url).searchParams.get("department_id");
	const departmentId = filter === null ? null : parseUuid(filter);
	if (filter !== null && !departmentId) return badRequest("department_id must be a UUID");
	try {
		let query = getSupabaseAdmin().from("workspace_department_budgets").select(COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId);
		if (departmentId) query = query.eq("department_id", departmentId);
		const [{ data, error }, statuses] = await Promise.all([
			query.order("created_at", { ascending: true }).order("id", { ascending: true }),
			loadStatus(authorization.auth.workspaceId),
		]);
		if (error) throw error;
		return json({ data: (data ?? []).map((row) => format(row as Row, statuses.get(row.id))) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("department_budgets.list", error);
	}
}

async function handleCreate(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_WRITE);
	if ("response" in authorization) return authorization.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const departmentId = parseUuid(body.department_id);
	const interval = parseInterval(body.interval);
	const limitNanos = parseUsd(body.limit);
	if (!departmentId) return badRequest("department_id must be a UUID");
	if (!interval) return badRequest("interval must be daily, weekly, or monthly");
	if (limitNanos === null) return badRequest("limit must be a positive USD amount");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_department_budgets").insert({
			workspace_id: authorization.auth.workspaceId,
			department_id: departmentId,
			interval,
			limit_nanos: limitNanos,
			created_by: actorUserId(authorization.auth),
		}).select(COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: `This department already has a ${interval} budget` }, 409, NO_STORE);
			// The foreign key covers (department_id, workspace_id), so another workspace's department is not found either.
			if (error.code === "23503") return notFound("Department not found");
			throw error;
		}
		const row = data as Row;
		await audit(authorization.auth, "workspace_department_budget.created", row);
		const statuses = await loadStatus(authorization.auth.workspaceId);
		return json({ data: format(row, statuses.get(row.id)) }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("department_budgets.create", error);
	}
}

async function handleGet(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_READ);
	if ("response" in authorization) return authorization.response;
	const id = pathId(req);
	if (!id) return badRequest("Department budget id must be a UUID");
	try {
		const [{ data, error }, statuses] = await Promise.all([
			getSupabaseAdmin().from("workspace_department_budgets").select(COLUMNS)
				.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).maybeSingle(),
			loadStatus(authorization.auth.workspaceId),
		]);
		if (error) throw error;
		if (!data) return notFound();
		return json({ data: format(data as Row, statuses.get(id)) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("department_budgets.get", error);
	}
}

async function handleUpdate(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_WRITE);
	if ("response" in authorization) return authorization.response;
	const id = pathId(req);
	if (!id) return badRequest("Department budget id must be a UUID");
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const interval = body.interval === undefined ? undefined : parseInterval(body.interval);
	const limitNanos = body.limit === undefined ? undefined : parseUsd(body.limit);
	if (interval === null) return badRequest("interval must be daily, weekly, or monthly");
	if (limitNanos === null) return badRequest("limit must be a positive USD amount");
	if (interval === undefined && limitNanos === undefined) return badRequest("Provide interval or limit");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_department_budgets").update({
			...(interval ? { interval } : {}),
			...(limitNanos !== undefined ? { limit_nanos: limitNanos } : {}),
		}).eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: `This department already has a ${interval} budget` }, 409, NO_STORE);
			throw error;
		}
		if (!data) return notFound();
		const row = data as Row;
		await audit(authorization.auth, "workspace_department_budget.updated", row);
		const statuses = await loadStatus(authorization.auth.workspaceId);
		return json({ data: format(row, statuses.get(row.id)) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("department_budgets.update", error);
	}
}

async function handleDelete(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.BUDGETS_DELETE);
	if ("response" in authorization) return authorization.response;
	const id = pathId(req);
	if (!id) return badRequest("Department budget id must be a UUID");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_department_budgets").delete()
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return notFound();
		await audit(authorization.auth, "workspace_department_budget.deleted", data as Row);
		return json({ data: { id, deleted: true } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("department_budgets.delete", error);
	}
}

export const departmentBudgetsRoutes = new Hono<Env>();
departmentBudgetsRoutes.get("/", withRuntime(handleList));
departmentBudgetsRoutes.post("/", withRuntime(handleCreate));
departmentBudgetsRoutes.get("/:id", withRuntime(handleGet));
departmentBudgetsRoutes.patch("/:id", withRuntime(handleUpdate));
departmentBudgetsRoutes.delete("/:id", withRuntime(handleDelete));
