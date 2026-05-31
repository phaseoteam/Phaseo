import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import {
	isResponse,
	parseOffset,
	parsePathId,
	parsePositiveInt,
	requireJsonBody,
	requireOAuthScope,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

type GuardrailRow = Record<string, unknown> & {
	id: string;
	workspace_id: string;
	name?: string | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

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

async function handleListGuardrails(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireOAuthScope(auth.value, "guardrails:read");
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
	const scopeError = requireOAuthScope(auth.value, "guardrails:write");
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
	const scopeError = requireOAuthScope(auth.value, "guardrails:read");
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
	const scopeError = requireOAuthScope(auth.value, "guardrails:write");
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
	const scopeError = requireOAuthScope(auth.value, "guardrails:delete");
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
	const scopeError = requireOAuthScope(auth.value, "guardrails:write");
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

export const guardrailsRoutes = new Hono<Env>();

guardrailsRoutes.get("/", withRuntime(handleListGuardrails));
guardrailsRoutes.post("/", withRuntime(handleCreateGuardrail));
guardrailsRoutes.get("/:id", withRuntime(handleGetGuardrail));
guardrailsRoutes.patch("/:id", withRuntime(handleUpdateGuardrail));
guardrailsRoutes.delete("/:id", withRuntime(handleDeleteGuardrail));
guardrailsRoutes.put("/:id/keys", withRuntime(handleSetGuardrailKeys));
