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
	rejectThirdPartyOAuthSpendingChange,
	requireCapability,
	requireJsonBody,
	requireOAuthWorkspaceRole,
} from "./route-helpers";
import { authenticateDashboardSession } from "./dashboard-session";
import { handleGetRateLimitTier, handleRaiseRateLimitTier } from "./rate-limit-raise";

// Rate limit policies are rate guardrails (workspace_guardrails kind 'rate'), which kept their ids.
// This API keeps the policy and assignment shapes it always had:
// - a policy is a rate guardrail. Ones made here have no counting set: they count per key, member
//   or department they are assigned to, and per end user when assigned to the whole workspace.
// - an assignment is a guardrail assignment of a rate guardrail. key, member and department are those
//   levels; end_user_default is a workspace assignment of a guardrail that counts per end user.
//   Key and member assignments are written to key_guardrails and workspace_member_guardrails, which
//   workspace_guardrail_assignments is copied from. Workspace assignments that count another way
//   (made under Settings, Guardrails) are not listed here. guardrail targets are no longer accepted:
//   assign the rate guardrail where that guardrail is assigned instead.
const GUARDRAIL_COLUMNS = "id,workspace_id,name,description,rate_requests_per_minute,rate_tokens_per_minute,rate_concurrent_requests,rate_fail_closed,rate_counting,created_at,updated_at";
const ASSIGNMENT_COLUMNS = "id,workspace_id,guardrail_id,target_type,target_id,created_by,created_at";
const TARGET_TYPES = ["key", "member", "department", "guardrail", "end_user_default"] as const;
type TargetType = (typeof TARGET_TYPES)[number];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INT4 = 2_147_483_647;
const NO_STORE = { "Cache-Control": "no-store" };
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;
const READ_PAGE = 1000;
const GUARDRAIL_TARGET_MESSAGE = "Rate limits can no longer be assigned to a guardrail. Assign the rate limit to the keys, members or departments that guardrail is assigned to.";

type GuardrailRow = {
	id: string;
	workspace_id: string;
	name: string;
	description: string | null;
	rate_requests_per_minute: number | null;
	rate_tokens_per_minute: number | string | null;
	rate_concurrent_requests: number | null;
	rate_fail_closed: boolean;
	rate_counting: string | null;
	created_at: string;
	updated_at: string;
};

type LevelRow = {
	id: string;
	workspace_id: string;
	guardrail_id: string;
	target_type: "workspace" | "department" | "member" | "key";
	target_id: string | null;
	created_by: string | null;
	created_at: string;
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

function conflict(message: string) {
	return json({ error: "conflict", message }, 409, NO_STORE);
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

type PolicyFields = Partial<Pick<GuardrailRow, "name" | "description" | "rate_requests_per_minute" | "rate_tokens_per_minute" | "rate_concurrent_requests" | "rate_fail_closed">>;

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
	if (requests.value !== undefined) fields.rate_requests_per_minute = requests.value;
	if (tokens.value !== undefined) fields.rate_tokens_per_minute = tokens.value;
	if (concurrent.value !== undefined) fields.rate_concurrent_requests = concurrent.value;
	if (body.fail_closed !== undefined) fields.rate_fail_closed = body.fail_closed as boolean;
	return { ok: true, value: fields };
}

function hasLimit(policy: Pick<GuardrailRow, "rate_requests_per_minute" | "rate_tokens_per_minute" | "rate_concurrent_requests">): boolean {
	return policy.rate_requests_per_minute != null || policy.rate_tokens_per_minute != null || policy.rate_concurrent_requests != null;
}

function formatPolicy(row: GuardrailRow) {
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		name: row.name,
		description: row.description ?? null,
		requests_per_minute: row.rate_requests_per_minute == null ? null : Number(row.rate_requests_per_minute),
		tokens_per_minute: row.rate_tokens_per_minute == null ? null : Number(row.rate_tokens_per_minute),
		concurrent_requests: row.rate_concurrent_requests == null ? null : Number(row.rate_concurrent_requests),
		fail_closed: Boolean(row.rate_fail_closed),
		// Guardrails do not record who made them.
		created_by: null,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/** Whether a workspace assignment of this guardrail is the end-user default. */
const countsPerEndUser = (guardrail: Pick<GuardrailRow, "rate_counting"> | undefined) =>
	Boolean(guardrail) && (guardrail!.rate_counting == null || guardrail!.rate_counting === "each_end_user");

/** The assignment as this API shows it, or null when it has no equivalent here. */
function formatAssignment(row: LevelRow, guardrail: Pick<GuardrailRow, "rate_counting"> | undefined) {
	if (row.target_type === "workspace" && !countsPerEndUser(guardrail)) return null;
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		policy_id: row.guardrail_id,
		target_type: row.target_type === "workspace" ? "end_user_default" as const : row.target_type,
		target_id: row.target_type === "workspace" ? null : row.target_id,
		created_by: row.created_by,
		created_at: row.created_at,
		// Assignments are added and removed, not edited.
		updated_at: row.created_at,
	};
}

const DASHBOARD_SCOPES = [CAPABILITIES.RATE_LIMITS_READ, CAPABILITIES.RATE_LIMITS_WRITE, CAPABILITIES.RATE_LIMITS_DELETE];

async function authorize(req: Request, capability: string) {
	// Settings → Rate limits writes through web-api with the user's session, so
	// the dashboard gets the same validation, audit and plan publish as the API.
	const session = await authenticateDashboardSession(req, DASHBOARD_SCOPES);
	if (session instanceof Response) return { response: session } as const;
	if (session) {
		if (!["owner", "admin"].includes(session.role)) {
			return { response: json({ error: "forbidden", message: "Only workspace owners and admins can manage rate limits" }, 403, NO_STORE) } as const;
		}
		return { auth: session.auth } as const;
	}
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError } as const;
	// Rate limits hold keys, members and departments: apps can read them but not change them.
	const appError = capability === CAPABILITIES.RATE_LIMITS_READ ? null : rejectThirdPartyOAuthSpendingChange(auth.value, "Apps that use Sign in with Phaseo can't change rate limits. The person can change them under Settings, Rate limits.");
	if (appError) return { response: appError } as const;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError } as const;
	return { auth: auth.value } as const;
}

async function auditPolicy(
	auth: { workspaceId: string; userId?: string | null },
	action: "created" | "updated" | "deleted",
	row: GuardrailRow,
) {
	const policy = formatPolicy(row);
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action: `rate_limit_policy.${action}`,
		targetType: "rate_limit_policy",
		targetId: row.id,
		targetName: row.name,
		metadata: {
			requests_per_minute: policy.requests_per_minute,
			tokens_per_minute: policy.tokens_per_minute,
			concurrent_requests: policy.concurrent_requests,
			fail_closed: policy.fail_closed,
		},
	});
}

type Assignment = NonNullable<ReturnType<typeof formatAssignment>>;

async function auditAssignment(
	auth: { workspaceId: string; userId?: string | null },
	action: "created" | "updated" | "deleted",
	row: Assignment,
) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action: `rate_limit_assignment.${action}`,
		targetType: "rate_limit_assignment",
		targetId: row.id,
		targetName: row.target_type,
		metadata: { policy_id: row.policy_id, target_type: row.target_type, target_id: row.target_id },
	});
}

const rateGuardrails = (workspaceId: string) => getSupabaseAdmin().from("workspace_guardrails").select(GUARDRAIL_COLUMNS)
	.eq("workspace_id", workspaceId).eq("kind", "rate");

async function readRateGuardrail(workspaceId: string, id: string): Promise<GuardrailRow | null> {
	const { data, error } = await rateGuardrails(workspaceId).eq("id", id).maybeSingle();
	if (error) throw error;
	return (data as GuardrailRow | null) ?? null;
}

async function readAllRateGuardrails(workspaceId: string): Promise<GuardrailRow[]> {
	const rows: GuardrailRow[] = [];
	for (let offset = 0; ; offset += READ_PAGE) {
		const { data, error } = await rateGuardrails(workspaceId)
			.order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + READ_PAGE - 1);
		if (error) throw error;
		rows.push(...((data ?? []) as GuardrailRow[]));
		if ((data ?? []).length < READ_PAGE) return rows;
	}
}

/** Every assignment of the given rate guardrails, oldest first. */
async function readLevelRows(workspaceId: string, guardrailIds: string[]): Promise<LevelRow[]> {
	if (!guardrailIds.length) return [];
	const rows: LevelRow[] = [];
	for (let offset = 0; ; offset += READ_PAGE) {
		const { data, error } = await getSupabaseAdmin().from("workspace_guardrail_assignments").select(ASSIGNMENT_COLUMNS)
			.eq("workspace_id", workspaceId).in("guardrail_id", guardrailIds)
			.order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + READ_PAGE - 1);
		if (error) throw error;
		rows.push(...((data ?? []) as LevelRow[]));
		if ((data ?? []).length < READ_PAGE) return rows;
	}
}

async function readLevelRow(workspaceId: string, id: string): Promise<{ row: LevelRow; guardrail: GuardrailRow; assignment: Assignment } | null> {
	const { data, error } = await getSupabaseAdmin().from("workspace_guardrail_assignments").select(ASSIGNMENT_COLUMNS)
		.eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw error;
	if (!data) return null;
	const row = data as LevelRow;
	const guardrail = await readRateGuardrail(workspaceId, row.guardrail_id);
	const assignment = guardrail ? formatAssignment(row, guardrail) : null;
	return guardrail && assignment ? { row, guardrail, assignment } : null;
}

/** Another rate guardrail with this name (names are unique, ignoring case and spaces at the ends). */
async function nameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean> {
	const wanted = name.trim().toLowerCase();
	return (await readAllRateGuardrails(workspaceId)).some((row) => row.id !== exceptId && row.name.trim().toLowerCase() === wanted);
}

const NAME_TAKEN = "A rate limit policy with this name already exists";

async function handleListPolicies(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_READ);
	if ("response" in authorization) return authorization.response;
	const page = parsePage(new URL(req.url));
	if (page.ok === false) return badRequest(page.message);
	const { offset, limit } = page.value;
	try {
		const { data, error } = await rateGuardrails(authorization.auth.workspaceId)
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.range(offset, offset + limit);
		if (error) throw error;
		return json(pageResponse((data ?? []).map((row) => formatPolicy(row as GuardrailRow)), limit), 200, NO_STORE);
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
	if (!hasLimit({ rate_requests_per_minute: null, rate_tokens_per_minute: null, rate_concurrent_requests: null, ...fields.value })) {
		return badRequest("Set at least one of requests_per_minute, tokens_per_minute, or concurrent_requests");
	}
	const workspaceId = authorization.auth.workspaceId;
	try {
		if (await nameTaken(workspaceId, fields.value.name!)) return conflict(NAME_TAKEN);
		const { data, error } = await getSupabaseAdmin().from("workspace_guardrails").insert({
			...fields.value,
			workspace_id: workspaceId,
			kind: "rate",
			enabled: true,
		}).select(GUARDRAIL_COLUMNS).maybeSingle();
		if (error) {
			// workspace_guardrails_rate_name_idx: another request took the name first.
			if (error.code === "23505") return conflict(NAME_TAKEN);
			throw error;
		}
		const row = data as GuardrailRow;
		await publishRateLimitPlan(workspaceId);
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
		const row = await readRateGuardrail(authorization.auth.workspaceId, id);
		if (!row) return notFound("Rate limit policy not found");
		return json({ data: formatPolicy(row) }, 200, NO_STORE);
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
	const workspaceId = authorization.auth.workspaceId;
	try {
		const existing = await readRateGuardrail(workspaceId, id);
		if (!existing) return notFound("Rate limit policy not found");
		if (!hasLimit({ ...existing, ...fields.value })) {
			return badRequest("A rate limit policy must keep at least one of requests_per_minute, tokens_per_minute, or concurrent_requests");
		}
		if (fields.value.name !== undefined && await nameTaken(workspaceId, fields.value.name, id)) return conflict(NAME_TAKEN);
		const { data, error } = await getSupabaseAdmin().from("workspace_guardrails").update(fields.value)
			.eq("workspace_id", workspaceId).eq("kind", "rate").eq("id", id).select(GUARDRAIL_COLUMNS).maybeSingle();
		if (error) {
			if (error.code === "23505") return conflict(NAME_TAKEN);
			if (error.code === "23514") return badRequest("A rate limit policy must keep at least one limit");
			throw error;
		}
		if (!data) return notFound("Rate limit policy not found");
		const row = data as GuardrailRow;
		await publishRateLimitPlan(workspaceId);
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
		// Its assignments go with it (foreign keys cascade).
		const { data, error } = await getSupabaseAdmin().from("workspace_guardrails").delete()
			.eq("workspace_id", authorization.auth.workspaceId).eq("kind", "rate").eq("id", id).select(GUARDRAIL_COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return notFound("Rate limit policy not found");
		const row = data as GuardrailRow;
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

type Level = LevelRow["target_type"];
const levelOf = (targetType: Exclude<TargetType, "guardrail">): Level => targetType === "end_user_default" ? "workspace" : targetType;

/** Confirms a key, member or department belongs to the workspace. */
async function targetBelongsToWorkspace(workspaceId: string, targetType: Exclude<TargetType, "guardrail" | "end_user_default">, targetId: string): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const query = targetType === "key"
		? supabase.from("keys").select("id").eq("workspace_id", workspaceId).eq("id", targetId).neq("status", "deleted")
		: targetType === "member"
			? supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", targetId)
			: supabase.from("workspace_departments").select("id").eq("workspace_id", workspaceId).eq("id", targetId);
	const { data, error } = await query.maybeSingle();
	if (error) throw error;
	return Boolean(data);
}

/** The target's rate assignments this API lists (each target has at most one policy through this API). */
async function targetAssignments(workspaceId: string, level: Level, targetId: string | null): Promise<Assignment[]> {
	const guardrails = new Map((await readAllRateGuardrails(workspaceId)).map((row) => [row.id, row]));
	return (await readLevelRows(workspaceId, [...guardrails.keys()]))
		.filter((row) => row.target_type === level && row.target_id === targetId)
		.map((row) => formatAssignment(row, guardrails.get(row.guardrail_id)))
		.filter((row): row is Assignment => row !== null);
}

async function readCreatedRow(workspaceId: string, guardrailId: string, level: Level, targetId: string | null): Promise<LevelRow | null> {
	let query = getSupabaseAdmin().from("workspace_guardrail_assignments").select(ASSIGNMENT_COLUMNS)
		.eq("workspace_id", workspaceId).eq("guardrail_id", guardrailId).eq("target_type", level);
	query = targetId === null ? query.is("target_id", null) : query.eq("target_id", targetId);
	const { data, error } = await query.maybeSingle();
	if (error) throw error;
	return (data as LevelRow | null) ?? null;
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
	const workspaceId = authorization.auth.workspaceId;
	try {
		// No guardrail targets exist any more.
		if (targetType === "guardrail") return json(pageResponse([], limit), 200, NO_STORE);
		const all = await readAllRateGuardrails(workspaceId);
		const guardrails = new Map(all.filter((row) => !policyId || row.id === policyId).map((row) => [row.id, row]));
		const assignments = (await readLevelRows(workspaceId, [...guardrails.keys()]))
			.filter((row) => !targetType || row.target_type === levelOf(targetType))
			.map((row) => formatAssignment(row, guardrails.get(row.guardrail_id)))
			.filter((row): row is Assignment => row !== null);
		return json(pageResponse(assignments.slice(offset, offset + limit + 1), limit), 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.list", error);
	}
}

const ONE_PER_TARGET = "This target already has a rate limit policy; update or delete that assignment instead";
const END_USER_COUNTING = "This rate limit counts another way, so it can't be the default for each end user. Choose one that counts per end user.";

async function handleCreateAssignment(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_WRITE);
	if ("response" in authorization) return authorization.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const policyId = parseUuid(body.policy_id);
	if (!policyId) return badRequest("policy_id must be a rate limit policy id");
	const targetType = parseTargetType(body.target_type);
	if (!targetType) return badRequest(`target_type must be one of: ${TARGET_TYPES.join(", ")}`);
	if (targetType === "guardrail") return badRequest(GUARDRAIL_TARGET_MESSAGE);
	const targetId = targetType === "end_user_default" ? null : parseUuid(body.target_id);
	if (targetType === "end_user_default" && body.target_id != null) return badRequest("target_id must be omitted for end_user_default");
	if (targetType !== "end_user_default" && !targetId) return badRequest(`target_id must be the id of the ${targetType}`);
	const workspaceId = authorization.auth.workspaceId;
	const level = levelOf(targetType);
	try {
		const guardrail = await readRateGuardrail(workspaceId, policyId);
		if (!guardrail) return badRequest("policy_id or target_id does not match this workspace");
		if (targetType === "end_user_default" && !countsPerEndUser(guardrail)) return badRequest(END_USER_COUNTING);
		if (targetType !== "end_user_default" && !(await targetBelongsToWorkspace(workspaceId, targetType, targetId!))) {
			return badRequest(`target_id does not match a ${targetType} in this workspace`);
		}
		if ((await targetAssignments(workspaceId, level, targetId)).length) return conflict(ONE_PER_TARGET);
		const supabase = getSupabaseAdmin();
		const createdBy = actorUserId(authorization.auth);
		// Key and member rows are copied into workspace_guardrail_assignments by a trigger.
		const { error } = targetType === "key"
			? await supabase.from("key_guardrails").insert({ key_id: targetId, guardrail_id: policyId })
			: targetType === "member"
				? await supabase.from("workspace_member_guardrails").insert({ workspace_id: workspaceId, user_id: targetId, guardrail_id: policyId })
				: await supabase.from("workspace_guardrail_assignments").insert({ workspace_id: workspaceId, guardrail_id: policyId, target_type: level, target_id: targetId, created_by: createdBy });
		if (error) {
			if (error.code === "23505") return conflict(ONE_PER_TARGET);
			if (error.code === "23503") return badRequest("policy_id or target_id does not match this workspace");
			throw error;
		}
		let row = await readCreatedRow(workspaceId, policyId, level, targetId);
		if (!row) throw new Error("The rate limit assignment was not recorded");
		if ((targetType === "key" || targetType === "member") && createdBy) {
			const { error: actorError } = await supabase.from("workspace_guardrail_assignments").update({ created_by: createdBy }).eq("id", row.id);
			if (!actorError) row = { ...row, created_by: createdBy };
		}
		const assignment = formatAssignment(row, guardrail)!;
		await publishRateLimitPlan(workspaceId);
		await auditAssignment(authorization.auth, "created", assignment);
		return json({ data: assignment }, 201, NO_STORE);
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
		const found = await readLevelRow(authorization.auth.workspaceId, id);
		if (!found) return notFound("Rate limit assignment not found");
		return json({ data: found.assignment }, 200, NO_STORE);
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
	const workspaceId = authorization.auth.workspaceId;
	try {
		const found = await readLevelRow(workspaceId, id);
		if (!found) return notFound("Rate limit assignment not found");
		const guardrail = await readRateGuardrail(workspaceId, policyId);
		if (!guardrail) return badRequest("policy_id does not match a rate limit policy in this workspace");
		if (found.row.target_type === "workspace" && !countsPerEndUser(guardrail)) return badRequest(END_USER_COUNTING);
		const previous = found.row.guardrail_id;
		if (policyId !== previous) {
			const supabase = getSupabaseAdmin();
			// The level row moves first, so the trigger copying the legacy row below finds it and keeps its id.
			const { error } = await supabase.from("workspace_guardrail_assignments").update({ guardrail_id: policyId })
				.eq("workspace_id", workspaceId).eq("id", id);
			if (error) {
				if (error.code === "23505") return conflict("This target already has that rate limit policy");
				throw error;
			}
			const legacy = found.row.target_type === "key"
				? await supabase.from("key_guardrails").update({ guardrail_id: policyId })
					.eq("key_id", found.row.target_id).eq("guardrail_id", previous)
				: found.row.target_type === "member"
					? await supabase.from("workspace_member_guardrails").update({ guardrail_id: policyId })
						.eq("workspace_id", workspaceId).eq("user_id", found.row.target_id).eq("guardrail_id", previous)
					: { error: null };
			if (legacy.error) throw legacy.error;
		}
		const assignment = formatAssignment({ ...found.row, guardrail_id: policyId }, guardrail)!;
		await publishRateLimitPlan(workspaceId);
		await auditAssignment(authorization.auth, "updated", assignment);
		return json({ data: assignment }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("rate_limits.assignments.update", error);
	}
}

async function handleDeleteAssignment(req: Request) {
	const authorization = await authorize(req, CAPABILITIES.RATE_LIMITS_DELETE);
	if ("response" in authorization) return authorization.response;
	const id = parseUuid(parsePathId(new URL(req.url), "assignments"));
	if (!id) return badRequest("A rate limit assignment id is required");
	const workspaceId = authorization.auth.workspaceId;
	try {
		const found = await readLevelRow(workspaceId, id);
		if (!found) return notFound("Rate limit assignment not found");
		const supabase = getSupabaseAdmin();
		const { row } = found;
		// Removing a key or member's legacy row removes its copy too.
		const { error } = row.target_type === "key"
			? await supabase.from("key_guardrails").delete().eq("key_id", row.target_id).eq("guardrail_id", row.guardrail_id)
			: row.target_type === "member"
				? await supabase.from("workspace_member_guardrails").delete()
					.eq("workspace_id", workspaceId).eq("user_id", row.target_id).eq("guardrail_id", row.guardrail_id)
				: await supabase.from("workspace_guardrail_assignments").delete().eq("workspace_id", workspaceId).eq("id", id);
		if (error) throw error;
		await publishRateLimitPlan(workspaceId);
		await auditAssignment(authorization.auth, "deleted", found.assignment);
		return json({ data: { id, deleted: true } }, 200, NO_STORE);
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
// The workspace's trust-ladder tier and self-serve raises (owner only; never a management key).
rateLimitsRoutes.get("/tier", withRuntime(handleGetRateLimitTier));
rateLimitsRoutes.post("/tier/raise", withRuntime(handleRaiseRateLimitTier));
