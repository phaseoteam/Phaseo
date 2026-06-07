import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "@/routes/utils";
import {
	isResponse,
	parseOffset,
	parsePathId,
	parsePositiveInt,
	requireJsonBody,
	requireCapability,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

type GuardrailRow = Record<string, unknown> & {
	id: string;
	workspace_id: string;
	name?: string | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

type KeyAssignmentRow = {
	key_id: string;
	name?: string | null;
	prefix?: string | null;
	status?: string | null;
	created_at?: string | null;
};

type MemberAssignmentRow = {
	user_id: string;
	role?: string | null;
	display_name?: string | null;
	joined_at?: string | null;
};

const FIELD_MAP: Record<string, string> = {
	privacyEnablePaidMayTrain: "privacy_enable_paid_may_train",
	privacyEnableFreeMayTrain: "privacy_enable_free_may_train",
	privacyEnableFreeMayPublishPrompts: "privacy_enable_free_may_publish_prompts",
	privacyEnableInputOutputLogging: "privacy_enable_input_output_logging",
	privacyZdrOnly: "privacy_zdr_only",
	providerRestrictionMode: "provider_restriction_mode",
	providerRestrictionProviderIds: "provider_restriction_provider_ids",
	providerRestrictionEnforceAllowed: "provider_restriction_enforce_allowed",
	modelRestrictionMode: "model_restriction_mode",
	allowedApiModelIds: "allowed_api_model_ids",
	promptInjectionEnabled: "prompt_injection_enabled",
	promptInjectionAction: "prompt_injection_action",
	sensitiveInfoEnabled: "sensitive_info_enabled",
	sensitiveInfoDefaultAction: "sensitive_info_default_action",
	sensitiveInfoRules: "sensitive_info_rules",
};

const WRITABLE_FIELDS = new Set([
	"name",
	"description",
	"enabled",
	"privacy_enable_paid_may_train",
	"privacy_enable_free_may_train",
	"privacy_enable_free_may_publish_prompts",
	"privacy_enable_input_output_logging",
	"privacy_zdr_only",
	"provider_restriction_mode",
	"provider_restriction_provider_ids",
	"provider_restriction_enforce_allowed",
	"model_restriction_mode",
	"allowed_api_model_ids",
	"prompt_injection_enabled",
	"prompt_injection_action",
	"sensitive_info_enabled",
	"sensitive_info_default_action",
	"sensitive_info_rules",
	"daily_limit_requests",
	"weekly_limit_requests",
	"monthly_limit_requests",
	"daily_limit_cost_nanos",
	"weekly_limit_cost_nanos",
	"monthly_limit_cost_nanos",
]);

function normalizeGuardrailPatch(body: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(body)) {
		if (rawKey === "budgets" && value && typeof value === "object" && !Array.isArray(value)) {
			const budgets = value as Record<string, unknown>;
			if (budgets.dailyRequests !== undefined) patch.daily_limit_requests = budgets.dailyRequests;
			if (budgets.weeklyRequests !== undefined) patch.weekly_limit_requests = budgets.weeklyRequests;
			if (budgets.monthlyRequests !== undefined) patch.monthly_limit_requests = budgets.monthlyRequests;
			if (budgets.dailyCostNanos !== undefined) patch.daily_limit_cost_nanos = budgets.dailyCostNanos;
			if (budgets.weeklyCostNanos !== undefined) patch.weekly_limit_cost_nanos = budgets.weeklyCostNanos;
			if (budgets.monthlyCostNanos !== undefined) patch.monthly_limit_cost_nanos = budgets.monthlyCostNanos;
			continue;
		}
		const key = FIELD_MAP[rawKey] ?? rawKey;
		if (WRITABLE_FIELDS.has(key)) patch[key] = value;
	}
	if (typeof patch.name === "string") patch.name = patch.name.trim();
	if (!patch.name && body.name !== undefined) delete patch.name;
	return patch;
}

function selectColumns(): string {
	return [
		"id",
		"workspace_id",
		"name",
		"description",
		"enabled",
		"privacy_enable_paid_may_train",
		"privacy_enable_free_may_train",
		"privacy_enable_free_may_publish_prompts",
		"privacy_enable_input_output_logging",
		"privacy_zdr_only",
		"provider_restriction_mode",
		"provider_restriction_provider_ids",
		"provider_restriction_enforce_allowed",
		"model_restriction_mode",
		"allowed_api_model_ids",
		"prompt_injection_enabled",
		"prompt_injection_action",
		"sensitive_info_enabled",
		"sensitive_info_default_action",
		"sensitive_info_rules",
		"daily_limit_requests",
		"weekly_limit_requests",
		"monthly_limit_requests",
		"daily_limit_cost_nanos",
		"weekly_limit_cost_nanos",
		"monthly_limit_cost_nanos",
		"created_at",
		"updated_at",
	].join(", ");
}

async function findGuardrail(workspaceId: string, id: string): Promise<GuardrailRow | null> {
	const { data, error } = await getSupabaseAdmin()
		.from("workspace_guardrails")
		.select(selectColumns())
		.eq("workspace_id", workspaceId)
		.eq("id", id)
		.maybeSingle();
	if (error) throw new Error(error.message || "Failed to fetch guardrail");
	return (data as unknown as GuardrailRow | null) ?? null;
}

function parseGuardrailResourceId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const guardrailsIndex = segments.lastIndexOf("guardrails");
	if (guardrailsIndex < 0) return null;
	const candidate = segments[guardrailsIndex + 1];
	if (!candidate) return null;
	return decodeURIComponent(candidate).trim() || null;
}

async function listGuardrailKeyAssignments(workspaceId: string, guardrailId: string): Promise<KeyAssignmentRow[]> {
	const { data: assignmentRows, error: assignmentError } = await getSupabaseAdmin()
		.from("key_guardrails")
		.select("key_id")
		.eq("guardrail_id", guardrailId);
	if (assignmentError) {
		throw new Error(assignmentError.message || "Failed to fetch guardrail key assignments");
	}

	const keyIds = (assignmentRows ?? []).map((row) => String(row.key_id ?? "").trim()).filter(Boolean);
	if (!keyIds.length) return [];

	const { data: keyRows, error: keyError } = await getSupabaseAdmin()
		.from("keys")
		.select("id, name, prefix, status, created_at, workspace_id")
		.in("id", keyIds);
	if (keyError) {
		throw new Error(keyError.message || "Failed to fetch guardrail keys");
	}

	const keysById = new Map(
		(keyRows ?? [])
			.filter((row) => row.workspace_id === workspaceId)
			.map((row) => [
				String(row.id),
				{
					key_id: String(row.id),
					name: row.name ?? null,
					prefix: row.prefix ?? null,
					status: row.status ?? null,
					created_at: (row as { created_at?: string | null }).created_at ?? null,
				} satisfies KeyAssignmentRow,
			]),
	);
	const assignments: KeyAssignmentRow[] = [];
	for (const keyId of keyIds) {
		const assignment = keysById.get(keyId);
		if (assignment) assignments.push(assignment);
	}
	return assignments;
}

async function listGuardrailMemberAssignments(workspaceId: string, guardrailId: string): Promise<MemberAssignmentRow[]> {
	const supabase = getSupabaseAdmin();
	const { data: assignmentRows, error: assignmentError } = await supabase
		.from("workspace_member_guardrails")
		.select("user_id")
		.eq("workspace_id", workspaceId)
		.eq("guardrail_id", guardrailId);
	if (assignmentError) {
		throw new Error(assignmentError.message || "Failed to fetch guardrail member assignments");
	}

	const userIds = (assignmentRows ?? []).map((row) => String(row.user_id ?? "").trim()).filter(Boolean);
	if (!userIds.length) return [];

	const { data: memberRows, error: memberError } = await supabase
		.from("workspace_members")
		.select("user_id, role, joined_at")
		.eq("workspace_id", workspaceId)
		.in("user_id", userIds);
	if (memberError) {
		throw new Error(memberError.message || "Failed to fetch workspace members");
	}

	const { data: userRows, error: userError } = await supabase
		.from("users")
		.select("user_id, display_name")
		.in("user_id", userIds);
	if (userError) {
		throw new Error(userError.message || "Failed to fetch member profiles");
	}

	const usersById = new Map(
		(userRows ?? []).map((row) => [
			String(row.user_id),
			{
				display_name: row.display_name ?? null,
			},
		]),
	);
	const membersById = new Map(
		(memberRows ?? []).map((row) => [
			String(row.user_id),
			{
				user_id: String(row.user_id),
				role: row.role ?? null,
				display_name: usersById.get(String(row.user_id))?.display_name ?? null,
				joined_at: (row as { joined_at?: string | null }).joined_at ?? null,
			} satisfies MemberAssignmentRow,
		]),
	);
	const assignments: MemberAssignmentRow[] = [];
	for (const userId of userIds) {
		const assignment = membersById.get(userId);
		if (assignment) assignments.push(assignment);
	}
	return assignments;
}

async function handleListGuardrails(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	const url = new URL(req.url);
	const offset = parseOffset(url.searchParams.get("offset"));
	const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

	try {
		const { data, error } = await getSupabaseAdmin()
			.from("workspace_guardrails")
			.select(selectColumns())
			.eq("workspace_id", auth.value.workspaceId)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (error) throw new Error(error.message || "Failed to list guardrails");
		return json({ data: data ?? [] }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleCreateGuardrail(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const patch = normalizeGuardrailPatch(body);
	if (!patch.name) return json({ error: "bad_request", message: "name is required" }, 400, { "Cache-Control": "no-store" });

	try {
		const { data, error } = await getSupabaseAdmin()
			.from("workspace_guardrails")
			.insert({
				workspace_id: auth.value.workspaceId,
				enabled: true,
				...patch,
				updated_at: new Date().toISOString(),
			})
			.select(selectColumns())
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to create guardrail");
		return json({ data }, 201, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleGetGuardrail(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	const id = parsePathId(new URL(req.url), "guardrails");
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });
		const { data: keyRows, error: keyError } = await getSupabaseAdmin()
			.from("key_guardrails")
			.select("key_id")
			.eq("guardrail_id", id);
		if (keyError) throw new Error(keyError.message || "Failed to fetch guardrail keys");
		return json({ data: { ...guardrail, key_ids: (keyRows ?? []).map((row) => row.key_id) } }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleUpdateGuardrail(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const id = parsePathId(new URL(req.url), "guardrails");
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const patch = normalizeGuardrailPatch(body);
	if (Object.keys(patch).length === 0) {
		return json({ error: "bad_request", message: "No supported guardrail fields were provided" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const { data, error } = await getSupabaseAdmin()
			.from("workspace_guardrails")
			.update({ ...patch, updated_at: new Date().toISOString() })
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", id)
			.select(selectColumns())
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to update guardrail");
		if (!data) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleDeleteGuardrail(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_DELETE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const id = parsePathId(new URL(req.url), "guardrails");
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		await getSupabaseAdmin().from("key_guardrails").delete().eq("guardrail_id", id);
		const { error } = await getSupabaseAdmin()
			.from("workspace_guardrails")
			.delete()
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", id);
		if (error) throw new Error(error.message || "Failed to delete guardrail");
		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleSetGuardrailKeys(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;
	const id = new URL(req.url).pathname.split("/").slice(-2, -1)[0];
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const keyIds = Array.isArray(body.key_ids) ? body.key_ids.map((item) => String(item)).filter(Boolean) : [];

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });
		if (keyIds.length) {
			const { data: keyRows, error: keyError } = await getSupabaseAdmin()
				.from("keys")
				.select("id, workspace_id, status")
				.in("id", keyIds);
			if (keyError) throw new Error(keyError.message || "Failed to validate keys");
			const validKeyIds = new Set((keyRows ?? [])
				.filter((row) => row.workspace_id === auth.value.workspaceId && String(row.status ?? "").toLowerCase() !== "deleted")
				.map((row) => row.id));
			if (keyIds.some((keyId) => !validKeyIds.has(keyId))) {
				return json({ error: "bad_request", message: "One or more keys do not belong to this workspace" }, 400, { "Cache-Control": "no-store" });
			}
		}
		await getSupabaseAdmin().from("key_guardrails").delete().eq("guardrail_id", id);
		if (keyIds.length) {
			const { error } = await getSupabaseAdmin()
				.from("key_guardrails")
				.insert(keyIds.map((keyId) => ({ key_id: keyId, guardrail_id: id })));
			if (error) throw new Error(error.message || "Failed to assign guardrail keys");
		}
		return json({ data: { guardrail_id: id, key_ids: keyIds } }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleListGuardrailKeys(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	const id = parseGuardrailResourceId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });
		const assignments = await listGuardrailKeyAssignments(auth.value.workspaceId, id);
		return json({ data: assignments, total_count: assignments.length }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleAddGuardrailKeys(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const id = parseGuardrailResourceId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const keyIds = Array.isArray(body.key_ids)
		? Array.from(new Set(body.key_ids.map((item) => String(item ?? "").trim()).filter(Boolean)))
		: [];
	if (!keyIds.length) {
		return json({ error: "bad_request", message: "key_ids must contain at least one key id" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });

		const { data: keyRows, error: keyError } = await getSupabaseAdmin()
			.from("keys")
			.select("id, workspace_id, status")
			.in("id", keyIds);
		if (keyError) throw new Error(keyError.message || "Failed to validate keys");
		const validKeyIds = new Set(
			(keyRows ?? [])
				.filter((row) => row.workspace_id === auth.value.workspaceId && String(row.status ?? "").toLowerCase() !== "deleted")
				.map((row) => String(row.id)),
		);
		if (keyIds.some((keyId) => !validKeyIds.has(keyId))) {
			return json({ error: "bad_request", message: "One or more keys do not belong to this workspace" }, 400, { "Cache-Control": "no-store" });
		}

		const { error: insertError } = await getSupabaseAdmin()
			.from("key_guardrails")
			.upsert(
				keyIds.map((keyId) => ({ key_id: keyId, guardrail_id: id })),
				{ onConflict: "key_id,guardrail_id", ignoreDuplicates: true },
			);
		if (insertError) throw new Error(insertError.message || "Failed to assign guardrail keys");

		const assignments = await listGuardrailKeyAssignments(auth.value.workspaceId, id);
		const added = assignments.filter((assignment) => keyIds.includes(assignment.key_id));
		return json({ added_count: added.length, data: added }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleRemoveGuardrailKeys(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const id = parseGuardrailResourceId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const keyIds = Array.isArray(body.key_ids)
		? Array.from(new Set(body.key_ids.map((item) => String(item ?? "").trim()).filter(Boolean)))
		: [];
	if (!keyIds.length) {
		return json({ error: "bad_request", message: "key_ids must contain at least one key id" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });

		const { error: deleteError, count } = await getSupabaseAdmin()
			.from("key_guardrails")
			.delete({ count: "exact" })
			.eq("guardrail_id", id)
			.in("key_id", keyIds);
		if (deleteError) throw new Error(deleteError.message || "Failed to remove guardrail keys");

		return json({ removed_count: count ?? 0 }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleListGuardrailMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	const id = parseGuardrailResourceId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });
		const assignments = await listGuardrailMemberAssignments(auth.value.workspaceId, id);
		return json({ data: assignments, total_count: assignments.length }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleAddGuardrailMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const id = parseGuardrailResourceId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const userIds = Array.isArray(body.user_ids)
		? Array.from(new Set(body.user_ids.map((item) => String(item ?? "").trim()).filter(Boolean)))
		: [];
	if (!userIds.length) {
		return json({ error: "bad_request", message: "user_ids must contain at least one user id" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });

		const { data: memberRows, error: memberError } = await getSupabaseAdmin()
			.from("workspace_members")
			.select("user_id")
			.eq("workspace_id", auth.value.workspaceId)
			.in("user_id", userIds);
		if (memberError) throw new Error(memberError.message || "Failed to validate workspace members");
		const validUserIds = new Set((memberRows ?? []).map((row) => String(row.user_id)));
		if (userIds.some((userId) => !validUserIds.has(userId))) {
			return json({ error: "bad_request", message: "One or more users are not members of this workspace" }, 400, { "Cache-Control": "no-store" });
		}

		const { error: insertError } = await getSupabaseAdmin()
			.from("workspace_member_guardrails")
			.upsert(
				userIds.map((userId) => ({
					workspace_id: auth.value.workspaceId,
					user_id: userId,
					guardrail_id: id,
				})),
				{ onConflict: "workspace_id,user_id,guardrail_id", ignoreDuplicates: true },
			);
		if (insertError) throw new Error(insertError.message || "Failed to assign guardrail members");

		const assignments = await listGuardrailMemberAssignments(auth.value.workspaceId, id);
		const added = assignments.filter((assignment) => userIds.includes(assignment.user_id));
		return json({ added_count: added.length, data: added }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleRemoveGuardrailMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.GUARDRAILS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const id = parseGuardrailResourceId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Guardrail id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const userIds = Array.isArray(body.user_ids)
		? Array.from(new Set(body.user_ids.map((item) => String(item ?? "").trim()).filter(Boolean)))
		: [];
	if (!userIds.length) {
		return json({ error: "bad_request", message: "user_ids must contain at least one user id" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const guardrail = await findGuardrail(auth.value.workspaceId, id);
		if (!guardrail) return json({ error: "not_found", message: "Guardrail not found" }, 404, { "Cache-Control": "no-store" });

		const { error: deleteError, count } = await getSupabaseAdmin()
			.from("workspace_member_guardrails")
			.delete({ count: "exact" })
			.eq("workspace_id", auth.value.workspaceId)
			.eq("guardrail_id", id)
			.in("user_id", userIds);
		if (deleteError) throw new Error(deleteError.message || "Failed to remove guardrail members");

		return json({ removed_count: count ?? 0 }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

export const guardrailsRoutes = new Hono<Env>();

guardrailsRoutes.get("/", withRuntime(handleListGuardrails));
guardrailsRoutes.post("/", withRuntime(handleCreateGuardrail));
guardrailsRoutes.get("/:id", withRuntime(handleGetGuardrail));
guardrailsRoutes.patch("/:id", withRuntime(handleUpdateGuardrail));
guardrailsRoutes.delete("/:id", withRuntime(handleDeleteGuardrail));
guardrailsRoutes.get("/:id/keys", withRuntime(handleListGuardrailKeys));
guardrailsRoutes.post("/:id/keys/add", withRuntime(handleAddGuardrailKeys));
guardrailsRoutes.post("/:id/keys/remove", withRuntime(handleRemoveGuardrailKeys));
guardrailsRoutes.get("/:id/members", withRuntime(handleListGuardrailMembers));
guardrailsRoutes.post("/:id/members/add", withRuntime(handleAddGuardrailMembers));
guardrailsRoutes.post("/:id/members/remove", withRuntime(handleRemoveGuardrailMembers));
guardrailsRoutes.put("/:id/keys", withRuntime(handleSetGuardrailKeys));
