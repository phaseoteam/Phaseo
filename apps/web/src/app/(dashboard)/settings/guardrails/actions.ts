"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type ProviderRestrictionMode = "none" | "allowlist" | "blocklist";
export type SensitiveInfoAction = "flag" | "redact" | "block";
export type PromptInjectionAction = "flag" | "redact" | "block";
export type SensitiveInfoRuleId = "email_address" | "phone_number" | "ssn" | "credit_card_number" | "ip_address" | "person_name" | "physical_address";

export type SensitiveInfoBuiltinRulePayload = { id: SensitiveInfoRuleId; kind: "builtin"; enabled: boolean; action: SensitiveInfoAction };
export type SensitiveInfoCustomRulePayload = { id: string; kind: "custom"; enabled: boolean; action: SensitiveInfoAction; name: string; pattern: string; flags?: string | null };
export type SensitiveInfoRulePayload = SensitiveInfoBuiltinRulePayload | SensitiveInfoCustomRulePayload;

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

export type GuardrailBudgetPayload = {
	dailyRequests?: number | null;
	weeklyRequests?: number | null;
	monthlyRequests?: number | null;
	dailyCostNanos?: number | null;
	weeklyCostNanos?: number | null;
	monthlyCostNanos?: number | null;
};

export type GuardrailUpsertPayload = GlobalGuardrailsSettingsPayload & {
	enabled?: boolean;
	name: string;
	description?: string | null;
	modelRestrictionMode?: ProviderRestrictionMode;
	allowedApiModelIds?: string[];
	promptInjectionEnabled?: boolean;
	promptInjectionAction?: PromptInjectionAction;
	sensitiveInfoEnabled?: boolean;
	sensitiveInfoDefaultAction?: SensitiveInfoAction;
	sensitiveInfoRules?: SensitiveInfoRulePayload[];
	budgets?: GuardrailBudgetPayload;
};

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("Missing workspace id");
	return { accessToken, workspaceId };
}

function refresh(includePrivacy = false): void {
	revalidatePath("/settings/guardrails");
	if (includePrivacy) revalidatePath("/settings/privacy");
}

export async function updateGlobalGuardrailsSettings(payload: GlobalGuardrailsSettingsPayload) {
	const context = await account();
	const result = await fetchAccountWebApi<{ success: true }>("/api/account/settings/guardrails/global", context.accessToken, { method: "PUT", body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }) });
	refresh(true);
	return result;
}

export async function createGuardrail(payload: GuardrailUpsertPayload) {
	const context = await account();
	const result = await fetchAccountWebApi<{ id?: string }>("/api/account/settings/guardrails", context.accessToken, { method: "POST", body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }) });
	refresh();
	return result;
}

export async function updateGuardrail(id: string, payload: GuardrailUpsertPayload) {
	if (!id) throw new Error("Missing guardrail id");
	const context = await account();
	const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(id)}`, context.accessToken, { method: "PUT", body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }) });
	refresh();
	return result;
}

export async function deleteGuardrail(id: string) {
	if (!id) throw new Error("Missing guardrail id");
	const context = await account();
	const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(id)}`, context.accessToken, { method: "DELETE", body: JSON.stringify({ workspaceId: context.workspaceId }) });
	refresh();
	return result;
}

export async function setGuardrailKeys(guardrailId: string, keyIds: string[]) {
	if (!guardrailId) throw new Error("Missing guardrail id");
	const context = await account();
	const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(guardrailId)}/keys`, context.accessToken, { method: "PUT", body: JSON.stringify({ keyIds, workspaceId: context.workspaceId }) });
	refresh();
	return result;
}
