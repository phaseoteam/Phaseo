import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
// Every successful write republishes the workspace's enforcement plan; it
// reaches every isolate within about a minute. A failed publish is logged
// (rate_limit_plan_publish_failed) and does not fail the request, because the
// database change has already been made.
import { publishRateLimitPlan } from "@core/rate-limit-policies";
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

const POLICY_COLUMNS = "id,workspace_id,name,description,requests_per_minute,tokens_per_minute,concurrent_requests,fail_closed,created_by,created_at,updated_at";
const ASSIGNMENT_COLUMNS = "id,workspace_id,policy_id,target_type,key_id,user_id,department_id,guardrail_id,created_by,created_at,updated_at";
const TARGET_TYPES = ["key", "member", "department", "guardrail", "end_user_default"] as const;
type TargetType = (typeof TARGET_TYPES)[number];
const TARGET_COLUMNS: Record<Exclude<TargetType, "end_user_default">, "key_id" | "user_id" | "department_id" | "guardrail_id"> = {
	key: "key_id",
	member: "user_id",
	department: "department_id",
	guardrail: "guardrail_id",
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INT4 = 2_147_483_647;
const NO_STORE = { "Cache-Control": "no-store" };
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

type PolicyRow = {
	id: string;
	workspace_id: string;
	name: string;
	description: string | null;
	requests_per_minute: number | null;
	tokens_per_minute: number | null;
	concurrent_requests: number | null;
	fail_closed: boolean;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

type AssignmentRow = {
	id: string;
	workspace_id: string;
	policy_id: string;
	target_type: TargetType;
	key_id: string | null;
	user_id: string | null;
	department_id: string | null;
	guardrail_id: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** Offset pagination matching the key list; one extra row is read to report has_more without a count query. */
function parsePage(url: URL): Parsed<{ offset: number; limit: number }> {
	const rawOffset = url.searchParams.get("offset");
	const rawLimit = url.searchParams.get("limit");
	const offset = rawOffset === null ? 0 : Number(rawOffset);
	const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
	if (!Number.isSafeInteger(offset) || offset < 0) return { ok: false, message: "offset must be a whole number of at least 0" };
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
		return { ok: false, message: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}` };
	}
	return { ok: true, value: { offset, limit } };
}

function pageResponse<T>(rows: T[], limit: number) {
	return { data: rows.slice(0, limit), has_more: rows.length > limit };
}

function badRequest(message: string) {
	return json({ error: "bad_request", message }, 400, NO_STORE);
}

function notFound(message: string) {
	return json({ error: "not_found", message }, 404, NO_STORE);
}

function actorUserId(auth: { userId?: string | null }): string | null {
	return auth.userId?.trim() || null;
}

function parseUuid(value: unknown): string | null {
	return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/** A positive whole-number limit, or null to leave that dimension unlimited. */
function parseLimit(value: unknown, field: string, max: number): Parsed<number | null | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null) return { ok: true, value: null };
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > max) {
		return { ok: false, message: `${field} must be a positive whole number up to ${max}, or null` };
	}
	return { ok: true, value };
}

function parseName(value: unknown): Parsed<string | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	const name = typeof value === "string" ? value.trim() : "";
	if (name.length < 1 || name.length > 100) return { ok: false, message: "name must be 1 to 100 characters" };
	return { ok: true, value: name };
}

function parseDescription(value: unknown): Parsed<string | null | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null) return { ok: true, value: null };
	if (typeof value !== "string" || value.length > 500) return { ok: false, message: "description must be a string of at most 500 characters, or null" };
	return { ok: true, value: value.trim() || null };
}

type PolicyFields = Partial<Pick<PolicyRow, "name" | "description" | "requests_per_minute" | "tokens_per_minute" | "concurrent_requests" | "fail_closed">>;

function parsePolicyFields(body: Record<string, unknown>): Parsed<PolicyFields> {
	const name = parseName(body.name);
	if (name.ok === false) return { ok: false, message: name.message };
	const description = parseDescription(body.description);
	if (description.ok === false) return { ok: false, message: description.message };
	const requests = parseLimit(body.requests_per_minute, "requests_per_minute", MAX_INT4);
	if (requests.ok === false) return { ok: false, message: requests.message };
	const tokens = parseLimit(body.tokens_per_minute, "tokens_per_minute", Number.MAX_SAFE_INTEGER);
	if (tokens.ok === false) return { ok: false, message: tokens.message };
	const concurrent = parseLimit(body.concurrent_requests, "concurrent_requests", MAX_INT4);
	if (concurrent.ok === false) return { ok: false, message: concurrent.message };
	if (body.fail_closed !== undefined && typeof body.fail_closed !== "boolean") {
		return { ok: false, message: "fail_closed must be a boolean" };
	}
	const fields: PolicyFields = {};
	if (name.value !== undefined) fields.name = name.value;
	if (description.value !== undefined) fields.description = description.value;
	if (requests.value !== undefined) fields.requests_per_minute = requests.value;
	if (tokens.value !== undefined) fields.tokens_per_minute = tokens.value;
	if (concurrent.value !== undefined) fields.concurrent_requests = concurrent.value;
	if (body.fail_closed !== undefined) fields.fail_closed = body.fail_closed as boolean;
	return { ok: true, value: fields };
}

function hasLimit(policy: Pick<PolicyRow, "requests_per_minute" | "tokens_per_minute" | "concurrent_requests">): boolean {
	return policy.requests_per_minute != null || policy.tokens_per_minute != null || policy.concurrent_requests != null;
}

function formatPolicy(row: PolicyRow) {
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		name: row.name,
		description: row.description ?? null,
		requests_per_minute: row.requests_per_minute == null ? null : Number(row.requests_per_minute),
		tokens_per_minute: row.tokens_per_minute == null ? null : Number(row.tokens_per_minute),
		concurrent_requests: row.concurrent_requests == null ? null : Number(row.concurrent_requests),
		fail_closed: Boolean(row.fail_closed),
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

function assignmentTargetId(row: AssignmentRow): string | null {
	return row.target_type === "end_user_default" ? null : row[TARGET_COLUMNS[row.target_type]];
}

function formatAssignment(row: AssignmentRow) {
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		policy_id: row.policy_id,
		target_type: row.target_type,
		target_id: assignmentTargetId(row),
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

async function auditPolicy(
	auth: { workspaceId: string; userId?: string | null },
	action: "created" | "updated" | "deleted",
	row: PolicyRow,
) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action: `rate_limit_policy.${action}`,
		targetType: "rate_limit_policy",
		targetId: row.id,
		targetName: row.name,
		metadata: {
			requests_per_minute: row.requests_per_minute,
			tokens_per_minute: row.tokens_per_minute,
			concurrent_requests: row.concurrent_requests,
			fail_closed: row.fail_closed,
		},
	});
}

async function auditAssignment(
	auth: { workspaceId: string; userId?: string | null },
	action: "created" | "updated" | "deleted",
	row: AssignmentRow,
) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action: `rate_limit_assignment.${action}`,
		targetType: "rate_limit_assignment",
		targetId: row.id,
		targetName: row.target_type,
		metadata: { policy_id: row.policy_id, target_type: row.target_type, target_id: assignmentTargetId(row) },
	});
}

async function handleListPolicies(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_READ);
	if ("response" in authorization) return authorization.response;
	const page = parsePage(new URL(req.url));
	if (page.ok === false) return badRequest(page.message);
	const { offset, limit } = page.value;
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policies").select(POLICY_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId)
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.range(offset, offset + limit);
		if (error) throw error;
		return json(pageResponse((data ?? []).map((row) => formatPolicy(row as PolicyRow)), limit), 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.policies.list", error);
	}
}

async function handleCreatePolicy(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_WRITE);
	if ("response" in authorization) return authorization.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	if (body.name === undefined) return badRequest("name is required");
	const fields = parsePolicyFields(body);
	if (fields.ok === false) return badRequest(fields.message);
	if (!hasLimit({ requests_per_minute: null, tokens_per_minute: null, concurrent_requests: null, ...fields.value })) {
		return badRequest("Set at least one of requests_per_minute, tokens_per_minute, or concurrent_requests");
	}
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policies").insert({
			...fields.value,
			workspace_id: authorization.auth.workspaceId,
			created_by: actorUserId(authorization.auth),
		}).select(POLICY_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: "A rate limit policy with this name already exists" }, 409, NO_STORE);
			throw error;
		}
		const row = data as PolicyRow;
		await publishRateLimitPlan(authorization.auth.workspaceId);
		await auditPolicy(authorization.auth, "created", row);
		return json({ data: formatPolicy(row) }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.policies.create", error);
	}
}

async function handleGetPolicy(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_READ);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "policies"));
	if (!id) return badRequest("A rate limit policy id is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policies").select(POLICY_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).maybeSingle();
		if (error) throw error;
		if (!data) return notFound("Rate limit policy not found");
		return json({ data: formatPolicy(data as PolicyRow) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.policies.get", error);
	}
}

async function handleUpdatePolicy(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_WRITE);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "policies"));
	if (!id) return badRequest("A rate limit policy id is required");
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const fields = parsePolicyFields(body);
	if (fields.ok === false) return badRequest(fields.message);
	if (Object.keys(fields.value).length === 0) return badRequest("Provide at least one field to update");
	try {
		const supabase = getSupabaseAdmin();
		const { data: existing, error: fetchError } = await supabase.from("workspace_rate_limit_policies").select(POLICY_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).maybeSingle();
		if (fetchError) throw fetchError;
		if (!existing) return notFound("Rate limit policy not found");
		if (!hasLimit({ ...(existing as PolicyRow), ...fields.value })) {
			return badRequest("A rate limit policy must keep at least one of requests_per_minute, tokens_per_minute, or concurrent_requests");
		}
		const { data, error } = await supabase.from("workspace_rate_limit_policies").update(fields.value)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(POLICY_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: "A rate limit policy with this name already exists" }, 409, NO_STORE);
			if (error.code === "23514") return badRequest("A rate limit policy must keep at least one limit");
			throw error;
		}
		if (!data) return notFound("Rate limit policy not found");
		const row = data as PolicyRow;
		await publishRateLimitPlan(authorization.auth.workspaceId);
		await auditPolicy(authorization.auth, "updated", row);
		return json({ data: formatPolicy(row) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.policies.update", error);
	}
}

async function handleDeletePolicy(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_DELETE);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "policies"));
	if (!id) return badRequest("A rate limit policy id is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policies").delete()
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(POLICY_COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return notFound("Rate limit policy not found");
		const row = data as PolicyRow;
		await publishRateLimitPlan(authorization.auth.workspaceId);
		await auditPolicy(authorization.auth, "deleted", row);
		return json({ data: { id: row.id, deleted: true } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.policies.delete", error);
	}
}

function parseTargetType(value: unknown): TargetType | null {
	const type = String(value ?? "").trim().toLowerCase();
	return TARGET_TYPES.includes(type as TargetType) ? type as TargetType : null;
}

/** Confirms a key or guardrail target belongs to the workspace. Members and departments are checked by foreign keys. */
async function targetBelongsToWorkspace(workspaceId: string, targetType: TargetType, targetId: string | null): Promise<boolean> {
	if (targetType === "key") {
		const { data, error } = await getSupabaseAdmin().from("keys").select("id")
			.eq("workspace_id", workspaceId).eq("id", targetId).neq("status", "deleted").maybeSingle();
		if (error) throw error;
		return Boolean(data);
	}
	if (targetType === "guardrail") {
		const { data, error } = await getSupabaseAdmin().from("workspace_guardrails").select("id")
			.eq("workspace_id", workspaceId).eq("id", targetId).maybeSingle();
		if (error) throw error;
		return Boolean(data);
	}
	return true;
}

async function handleListAssignments(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_READ);
	if ("response" in authorization) return authorization.response;
	const url = new URL(req.url);
	const policyIdParam = url.searchParams.get("policy_id");
	const targetTypeParam = url.searchParams.get("target_type");
	const policyId = policyIdParam === null ? null : parseUuid(policyIdParam);
	const targetType = targetTypeParam === null ? null : parseTargetType(targetTypeParam);
	if (policyIdParam !== null && !policyId) return badRequest("policy_id must be a rate limit policy id");
	if (targetTypeParam !== null && !targetType) return badRequest(`target_type must be one of: ${TARGET_TYPES.join(", ")}`);
	const page = parsePage(url);
	if (page.ok === false) return badRequest(page.message);
	const { offset, limit } = page.value;
	try {
		let query = getSupabaseAdmin().from("workspace_rate_limit_policy_assignments").select(ASSIGNMENT_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId);
		if (policyId) query = query.eq("policy_id", policyId);
		if (targetType) query = query.eq("target_type", targetType);
		const { data, error } = await query
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.range(offset, offset + limit);
		if (error) throw error;
		return json(pageResponse((data ?? []).map((row) => formatAssignment(row as AssignmentRow)), limit), 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.list", error);
	}
}

async function handleCreateAssignment(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_WRITE);
	if ("response" in authorization) return authorization.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const policyId = parseUuid(body.policy_id);
	if (!policyId) return badRequest("policy_id must be a rate limit policy id");
	const targetType = parseTargetType(body.target_type);
	if (!targetType) return badRequest(`target_type must be one of: ${TARGET_TYPES.join(", ")}`);
	const targetId = targetType === "end_user_default" ? null : parseUuid(body.target_id);
	if (targetType === "end_user_default" && body.target_id != null) return badRequest("target_id must be omitted for end_user_default");
	if (targetType !== "end_user_default" && !targetId) return badRequest(`target_id must be the id of the ${targetType}`);
	const workspaceId = authorization.auth.workspaceId;
	try {
		if (!(await targetBelongsToWorkspace(workspaceId, targetType, targetId))) {
			return badRequest(`target_id does not match a ${targetType} in this workspace`);
		}
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policy_assignments").insert({
			workspace_id: workspaceId,
			policy_id: policyId,
			target_type: targetType,
			...(targetType === "end_user_default" ? {} : { [TARGET_COLUMNS[targetType]]: targetId }),
			created_by: actorUserId(authorization.auth),
		}).select(ASSIGNMENT_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return json({ error: "conflict", message: "This target already has a rate limit policy; update or delete that assignment instead" }, 409, NO_STORE);
			if (error.code === "23503") return badRequest("policy_id or target_id does not match this workspace");
			throw error;
		}
		const row = data as AssignmentRow;
		await publishRateLimitPlan(authorization.auth.workspaceId);
		await auditAssignment(authorization.auth, "created", row);
		return json({ data: formatAssignment(row) }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.create", error);
	}
}

async function handleGetAssignment(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_READ);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "assignments"));
	if (!id) return badRequest("A rate limit assignment id is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policy_assignments").select(ASSIGNMENT_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).maybeSingle();
		if (error) throw error;
		if (!data) return notFound("Rate limit assignment not found");
		return json({ data: formatAssignment(data as AssignmentRow) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.get", error);
	}
}

async function handleUpdateAssignment(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_WRITE);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "assignments"));
	if (!id) return badRequest("A rate limit assignment id is required");
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const policyId = parseUuid(body.policy_id);
	if (!policyId) return badRequest("policy_id must be a rate limit policy id");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policy_assignments").update({ policy_id: policyId })
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(ASSIGNMENT_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23503") return badRequest("policy_id does not match a rate limit policy in this workspace");
			throw error;
		}
		if (!data) return notFound("Rate limit assignment not found");
		const row = data as AssignmentRow;
		await publishRateLimitPlan(authorization.auth.workspaceId);
		await auditAssignment(authorization.auth, "updated", row);
		return json({ data: formatAssignment(row) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.update", error);
	}
}

async function handleDeleteAssignment(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_DELETE);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "assignments"));
	if (!id) return badRequest("A rate limit assignment id is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policy_assignments").delete()
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(ASSIGNMENT_COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return notFound("Rate limit assignment not found");
		const row = data as AssignmentRow;
		await publishRateLimitPlan(authorization.auth.workspaceId);
		await auditAssignment(authorization.auth, "deleted", row);
		return json({ data: { id: row.id, deleted: true } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.delete", error);
	}
}

export const rateLimitsRoutes = new Hono<Env>();
rateLimitsRoutes.get("/policies", withRuntime(handleListPolicies));
rateLimitsRoutes.post("/policies", withRuntime(handleCreatePolicy));
rateLimitsRoutes.get("/policies/:id", withRuntime(handleGetPolicy));
rateLimitsRoutes.patch("/policies/:id", withRuntime(handleUpdatePolicy));
rateLimitsRoutes.delete("/policies/:id", withRuntime(handleDeletePolicy));
rateLimitsRoutes.get("/assignments", withRuntime(handleListAssignments));
rateLimitsRoutes.post("/assignments", withRuntime(handleCreateAssignment));
rateLimitsRoutes.get("/assignments/:id", withRuntime(handleGetAssignment));
rateLimitsRoutes.patch("/assignments/:id", withRuntime(handleUpdateAssignment));
rateLimitsRoutes.delete("/assignments/:id", withRuntime(handleDeleteAssignment));
