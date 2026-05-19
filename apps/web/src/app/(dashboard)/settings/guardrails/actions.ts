"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

export type ProviderRestrictionMode = "none" | "allowlist" | "blocklist";
export type SensitiveInfoAction = "flag" | "redact" | "block";
export type PromptInjectionAction = "flag" | "redact" | "block";
export type SensitiveInfoRuleId =
	| "email_address"
	| "phone_number"
	| "ssn"
	| "credit_card_number"
	| "ip_address"
	| "person_name"
	| "physical_address";

export type SensitiveInfoBuiltinRulePayload = {
	id: SensitiveInfoRuleId;
	kind: "builtin";
	enabled: boolean;
	action: SensitiveInfoAction;
};

export type SensitiveInfoCustomRulePayload = {
	id: string;
	kind: "custom";
	enabled: boolean;
	action: SensitiveInfoAction;
	name: string;
	pattern: string;
	flags?: string | null;
};

export type SensitiveInfoRulePayload =
	| SensitiveInfoBuiltinRulePayload
	| SensitiveInfoCustomRulePayload;

export type GlobalGuardrailsSettingsPayload = {
	privacyEnablePaidMayTrain?: boolean;
	privacyEnableFreeMayTrain?: boolean;
	privacyEnableFreeMayPublishPrompts?: boolean;
	privacyEnableInputOutputLogging?: boolean;
	privacyZdrOnly?: boolean;
	providerRestrictionMode?: ProviderRestrictionMode;
	providerRestrictionProviderIds?: string[];
	providerRestrictionEnforceAllowed?: boolean;
};

export async function updateGlobalGuardrailsSettings(
	payload: GlobalGuardrailsSettingsPayload,
) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const update: any = {
		workspace_id: workspaceId,
		updated_at: new Date().toISOString(),
	};

	if (typeof payload.privacyEnablePaidMayTrain === "boolean") {
		update.privacy_enable_paid_may_train = payload.privacyEnablePaidMayTrain;
	}
	if (typeof payload.privacyEnableFreeMayTrain === "boolean") {
		update.privacy_enable_free_may_train = payload.privacyEnableFreeMayTrain;
	}
	if (typeof payload.privacyEnableFreeMayPublishPrompts === "boolean") {
		update.privacy_enable_free_may_publish_prompts =
			payload.privacyEnableFreeMayPublishPrompts;
	}
	if (typeof payload.privacyEnableInputOutputLogging === "boolean") {
		update.privacy_enable_input_output_logging =
			payload.privacyEnableInputOutputLogging;
	}
	if (typeof payload.privacyZdrOnly === "boolean") {
		update.privacy_zdr_only = payload.privacyZdrOnly;
	}

	if (payload.providerRestrictionMode) {
		update.provider_restriction_mode = payload.providerRestrictionMode;
	}
	if (Array.isArray(payload.providerRestrictionProviderIds)) {
		update.provider_restriction_provider_ids =
			payload.providerRestrictionProviderIds;
	}
	if (typeof payload.providerRestrictionEnforceAllowed === "boolean") {
		update.provider_restriction_enforce_allowed =
			payload.providerRestrictionEnforceAllowed;
	}

	const { error } = await supabase
		.from("workspace_settings")
		.upsert(update, { onConflict: "workspace_id" });
	if (error) throw error;

	revalidatePath("/settings/guardrails");
	revalidatePath("/settings/privacy");
}

export type GuardrailBudgetPayload = {
	dailyRequests?: number | null;
	weeklyRequests?: number | null;
	monthlyRequests?: number | null;
	dailyCostNanos?: number | null;
	weeklyCostNanos?: number | null;
	monthlyCostNanos?: number | null;
};

export type GuardrailUpsertPayload = {
	enabled?: boolean;
	name: string;
	description?: string | null;

	privacyEnablePaidMayTrain?: boolean;
	privacyEnableFreeMayTrain?: boolean;
	privacyEnableFreeMayPublishPrompts?: boolean;
	privacyEnableInputOutputLogging?: boolean;
	privacyZdrOnly?: boolean;

	providerRestrictionMode?: ProviderRestrictionMode;
	providerRestrictionProviderIds?: string[];
	providerRestrictionEnforceAllowed?: boolean;

	modelRestrictionMode?: ProviderRestrictionMode;
	allowedApiModelIds?: string[];
	promptInjectionEnabled?: boolean;
	promptInjectionAction?: PromptInjectionAction;
	sensitiveInfoEnabled?: boolean;
	sensitiveInfoDefaultAction?: SensitiveInfoAction;
	sensitiveInfoRules?: SensitiveInfoRulePayload[];
	budgets?: GuardrailBudgetPayload;
};

export async function createGuardrail(payload: GuardrailUpsertPayload) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	if (!payload.name?.trim()) throw new Error("Name is required");

	const row: any = {
		workspace_id: workspaceId,
		name: payload.name.trim(),
		description: payload.description ?? null,
		enabled: payload.enabled ?? true,
		updated_at: new Date().toISOString(),
	};

	if (typeof payload.privacyEnablePaidMayTrain === "boolean") {
		row.privacy_enable_paid_may_train = payload.privacyEnablePaidMayTrain;
	}
	if (typeof payload.privacyEnableFreeMayTrain === "boolean") {
		row.privacy_enable_free_may_train = payload.privacyEnableFreeMayTrain;
	}
	if (typeof payload.privacyEnableFreeMayPublishPrompts === "boolean") {
		row.privacy_enable_free_may_publish_prompts =
			payload.privacyEnableFreeMayPublishPrompts;
	}
	if (typeof payload.privacyEnableInputOutputLogging === "boolean") {
		row.privacy_enable_input_output_logging =
			payload.privacyEnableInputOutputLogging;
	}
	if (typeof payload.privacyZdrOnly === "boolean") {
		row.privacy_zdr_only = payload.privacyZdrOnly;
	}

	if (payload.providerRestrictionMode) {
		row.provider_restriction_mode = payload.providerRestrictionMode;
	}
	if (Array.isArray(payload.providerRestrictionProviderIds)) {
		row.provider_restriction_provider_ids = payload.providerRestrictionProviderIds;
	}
	if (typeof payload.providerRestrictionEnforceAllowed === "boolean") {
		row.provider_restriction_enforce_allowed =
			payload.providerRestrictionEnforceAllowed;
	}

	if (payload.modelRestrictionMode) {
		row.model_restriction_mode = payload.modelRestrictionMode;
	}
	if (Array.isArray(payload.allowedApiModelIds)) {
		row.allowed_api_model_ids = payload.allowedApiModelIds;
	}
	if (typeof payload.promptInjectionEnabled === "boolean") {
		row.prompt_injection_enabled = payload.promptInjectionEnabled;
	}
	if (payload.promptInjectionAction) {
		row.prompt_injection_action = payload.promptInjectionAction;
	}
	if (typeof payload.sensitiveInfoEnabled === "boolean") {
		row.sensitive_info_enabled = payload.sensitiveInfoEnabled;
	}
	if (payload.sensitiveInfoDefaultAction) {
		row.sensitive_info_default_action = payload.sensitiveInfoDefaultAction;
	}
	if (Array.isArray(payload.sensitiveInfoRules)) {
		row.sensitive_info_rules = payload.sensitiveInfoRules;
	}

	const budgets = payload.budgets ?? {};
	row.daily_limit_requests = budgets.dailyRequests ?? 0;
	row.weekly_limit_requests = budgets.weeklyRequests ?? 0;
	row.monthly_limit_requests = budgets.monthlyRequests ?? 0;
	row.daily_limit_cost_nanos = budgets.dailyCostNanos ?? 0;
	row.weekly_limit_cost_nanos = budgets.weeklyCostNanos ?? 0;
	row.monthly_limit_cost_nanos = budgets.monthlyCostNanos ?? 0;

	const { data, error } = await supabase
		.from("workspace_guardrails")
		.insert(row)
		.select("id")
		.maybeSingle();
	if (error) throw error;

	revalidatePath("/settings/guardrails");
	return { id: data?.id as string | undefined };
}

export async function updateGuardrail(id: string, payload: GuardrailUpsertPayload) {
	if (!id) throw new Error("Missing guardrail id");
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	if (!payload.name?.trim()) throw new Error("Name is required");

	const row: any = {
		name: payload.name.trim(),
		description: payload.description ?? null,
		enabled: payload.enabled ?? true,
		updated_at: new Date().toISOString(),
	};

	if (typeof payload.privacyEnablePaidMayTrain === "boolean") {
		row.privacy_enable_paid_may_train = payload.privacyEnablePaidMayTrain;
	}
	if (typeof payload.privacyEnableFreeMayTrain === "boolean") {
		row.privacy_enable_free_may_train = payload.privacyEnableFreeMayTrain;
	}
	if (typeof payload.privacyEnableFreeMayPublishPrompts === "boolean") {
		row.privacy_enable_free_may_publish_prompts =
			payload.privacyEnableFreeMayPublishPrompts;
	}
	if (typeof payload.privacyEnableInputOutputLogging === "boolean") {
		row.privacy_enable_input_output_logging =
			payload.privacyEnableInputOutputLogging;
	}
	if (typeof payload.privacyZdrOnly === "boolean") {
		row.privacy_zdr_only = payload.privacyZdrOnly;
	}

	if (payload.providerRestrictionMode) {
		row.provider_restriction_mode = payload.providerRestrictionMode;
	}
	if (Array.isArray(payload.providerRestrictionProviderIds)) {
		row.provider_restriction_provider_ids = payload.providerRestrictionProviderIds;
	}
	if (typeof payload.providerRestrictionEnforceAllowed === "boolean") {
		row.provider_restriction_enforce_allowed =
			payload.providerRestrictionEnforceAllowed;
	}

	if (payload.modelRestrictionMode) {
		row.model_restriction_mode = payload.modelRestrictionMode;
	}
	if (Array.isArray(payload.allowedApiModelIds)) {
		row.allowed_api_model_ids = payload.allowedApiModelIds;
	}
	if (typeof payload.promptInjectionEnabled === "boolean") {
		row.prompt_injection_enabled = payload.promptInjectionEnabled;
	}
	if (payload.promptInjectionAction) {
		row.prompt_injection_action = payload.promptInjectionAction;
	}
	if (typeof payload.sensitiveInfoEnabled === "boolean") {
		row.sensitive_info_enabled = payload.sensitiveInfoEnabled;
	}
	if (payload.sensitiveInfoDefaultAction) {
		row.sensitive_info_default_action = payload.sensitiveInfoDefaultAction;
	}
	if (Array.isArray(payload.sensitiveInfoRules)) {
		row.sensitive_info_rules = payload.sensitiveInfoRules;
	}

	const budgets = payload.budgets ?? {};
	row.daily_limit_requests = budgets.dailyRequests ?? 0;
	row.weekly_limit_requests = budgets.weeklyRequests ?? 0;
	row.monthly_limit_requests = budgets.monthlyRequests ?? 0;
	row.daily_limit_cost_nanos = budgets.dailyCostNanos ?? 0;
	row.weekly_limit_cost_nanos = budgets.weeklyCostNanos ?? 0;
	row.monthly_limit_cost_nanos = budgets.monthlyCostNanos ?? 0;

	const { error } = await supabase
		.from("workspace_guardrails")
		.update(row)
		.eq("id", id)
		.eq("workspace_id", workspaceId);
	if (error) throw error;

	revalidatePath("/settings/guardrails");
	return { success: true };
}

export async function deleteGuardrail(id: string) {
	if (!id) throw new Error("Missing guardrail id");
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const { error } = await supabase
		.from("workspace_guardrails")
		.delete()
		.eq("id", id)
		.eq("workspace_id", workspaceId);
	if (error) throw error;

	revalidatePath("/settings/guardrails");
	return { success: true };
}

export async function setGuardrailKeys(guardrailId: string, keyIds: string[]) {
	if (!guardrailId) throw new Error("Missing guardrail id");
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing workspace id");
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	// Ensure guardrail belongs to team.
	const { data: guardrailRow, error: guardrailErr } = await supabase
		.from("workspace_guardrails")
		.select("id, workspace_id")
		.eq("id", guardrailId)
		.maybeSingle();
	if (guardrailErr) throw guardrailErr;
	if (!guardrailRow?.id || guardrailRow.workspace_id !== workspaceId) {
		throw new Error("Guardrail not found");
	}

	// Ensure all keys belong to the workspace.
	if (keyIds.length) {
		const { data: keyRows, error: keyErr } = await supabase
			.from("keys")
			.select("id, workspace_id, status")
			.in("id", keyIds);
		if (keyErr) throw keyErr;
		const keyRowMap = new Map((keyRows ?? []).map((k) => [k.id, k]));
		const bad = keyIds.some((keyId) => {
			const row = keyRowMap.get(keyId);
			if (!row) return true;
			if (row.workspace_id !== workspaceId) return true;
			return String((row as any).status ?? "").toLowerCase() === "deleted";
		});
		if (bad) throw new Error("One or more keys do not belong to this workspace");
	}

	// Replace associations.
	const { error: delErr } = await supabase
		.from("key_guardrails")
		.delete()
		.eq("guardrail_id", guardrailId);
	if (delErr) throw delErr;

	if (keyIds.length) {
		const rows = keyIds.map((keyId) => ({ key_id: keyId, guardrail_id: guardrailId }));
		const { error: insErr } = await supabase.from("key_guardrails").insert(rows);
		if (insErr) throw insErr;
	}

	revalidatePath("/settings/guardrails");
	return { success: true };
}

