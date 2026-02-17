"use server";

import { revalidatePath } from "next/cache";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import {
	requireAuthenticatedUser,
	requireTeamMembership,
} from "@/utils/serverActionAuth";

export type ProviderRestrictionMode = "none" | "allowlist" | "blocklist";

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
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const update: any = {
		team_id: teamId,
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
		.from("team_settings")
		.upsert(update, { onConflict: "team_id" });
	if (error) throw error;

	revalidatePath("/settings/guardrails");
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

	allowedApiModelIds?: string[];
	budgets?: GuardrailBudgetPayload;
};

export async function createGuardrail(payload: GuardrailUpsertPayload) {
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	if (!payload.name?.trim()) throw new Error("Name is required");

	const row: any = {
		team_id: teamId,
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

	if (Array.isArray(payload.allowedApiModelIds)) {
		row.allowed_api_model_ids = payload.allowedApiModelIds;
	}

	const budgets = payload.budgets ?? {};
	row.daily_limit_requests = budgets.dailyRequests ?? 0;
	row.weekly_limit_requests = budgets.weeklyRequests ?? 0;
	row.monthly_limit_requests = budgets.monthlyRequests ?? 0;
	row.daily_limit_cost_nanos = budgets.dailyCostNanos ?? 0;
	row.weekly_limit_cost_nanos = budgets.weeklyCostNanos ?? 0;
	row.monthly_limit_cost_nanos = budgets.monthlyCostNanos ?? 0;

	const { data, error } = await supabase
		.from("team_guardrails")
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
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

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

	if (Array.isArray(payload.allowedApiModelIds)) {
		row.allowed_api_model_ids = payload.allowedApiModelIds;
	}

	const budgets = payload.budgets ?? {};
	row.daily_limit_requests = budgets.dailyRequests ?? 0;
	row.weekly_limit_requests = budgets.weeklyRequests ?? 0;
	row.monthly_limit_requests = budgets.monthlyRequests ?? 0;
	row.daily_limit_cost_nanos = budgets.dailyCostNanos ?? 0;
	row.weekly_limit_cost_nanos = budgets.weeklyCostNanos ?? 0;
	row.monthly_limit_cost_nanos = budgets.monthlyCostNanos ?? 0;

	const { error } = await supabase
		.from("team_guardrails")
		.update(row)
		.eq("id", id)
		.eq("team_id", teamId);
	if (error) throw error;

	revalidatePath("/settings/guardrails");
	return { success: true };
}

export async function deleteGuardrail(id: string) {
	if (!id) throw new Error("Missing guardrail id");
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const { error } = await supabase
		.from("team_guardrails")
		.delete()
		.eq("id", id)
		.eq("team_id", teamId);
	if (error) throw error;

	revalidatePath("/settings/guardrails");
	return { success: true };
}

export async function setGuardrailKeys(guardrailId: string, keyIds: string[]) {
	if (!guardrailId) throw new Error("Missing guardrail id");
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	// Ensure guardrail belongs to team.
	const { data: guardrailRow, error: guardrailErr } = await supabase
		.from("team_guardrails")
		.select("id, team_id")
		.eq("id", guardrailId)
		.maybeSingle();
	if (guardrailErr) throw guardrailErr;
	if (!guardrailRow?.id || guardrailRow.team_id !== teamId) {
		throw new Error("Guardrail not found");
	}

	// Ensure all keys belong to the team.
	if (keyIds.length) {
		const { data: keyRows, error: keyErr } = await supabase
			.from("keys")
			.select("id, team_id")
			.in("id", keyIds);
		if (keyErr) throw keyErr;
		const bad = (keyRows ?? []).some((k) => k.team_id !== teamId);
		if (bad) throw new Error("One or more keys do not belong to this team");
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

