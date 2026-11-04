"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

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
	modelRestrictionMode?: ProviderRestrictionMode;
	modelRestrictionModelIds?: string[];
	ioLoggingEnabled?: boolean;
	ioLoggingRetentionDays?: number;
	ioLoggingIncludeProviderPayloads?: boolean;
	ioLoggingContentsAccess?: "members" | "admins";
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
};

async function account(expectedWorkspaceId?: string): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("Missing workspace id");
	if (expectedWorkspaceId && workspaceId !== expectedWorkspaceId) throw new Error("Active workspace changed");
	return { accessToken, workspaceId };
}

function refresh(includePrivacy = false): void {
	revalidatePath("/settings/guardrails");
	if (includePrivacy) revalidatePath("/settings/privacy");
}

export async function updateGlobalGuardrailsSettings(payload: GlobalGuardrailsSettingsPayload, expectedWorkspaceId?: string) {
	const context = await account(expectedWorkspaceId);
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

export async function setGuardrailMembers(guardrailId: string, userIds: string[]) {
	if (!guardrailId) throw new Error("Missing guardrail id");
	const context = await account();
	const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(guardrailId)}/members`, context.accessToken, { method: "PUT", body: JSON.stringify({ userIds, workspaceId: context.workspaceId }) });
	refresh();
	return result;
}

export type GuardrailAssignmentChange = {
	targetType: "workspace" | "department" | "member" | "key";
	/** Empty for "workspace": the workspace itself is the target. */
	targetIds: string[];
	addGuardrailIds?: string[];
	removeGuardrailIds?: string[];
};

export type GuardrailAssignmentResult = { ok: true } | { ok: false; error: string | null };

/**
 * Adds or removes guardrails on many keys or members without touching their other assignments.
 * A refused change comes back as a value, not a throw, so the page can show the server's reason
 * (a production server action replaces a thrown error's message).
 */
export async function updateGuardrailAssignments(change: GuardrailAssignmentChange, expectedWorkspaceId?: string): Promise<GuardrailAssignmentResult> {
	const context = await account(expectedWorkspaceId);
	try {
		await fetchAccountWebApi<{ success: true }>("/api/account/settings/guardrails/assignments", context.accessToken, { method: "PATCH", body: JSON.stringify({ ...change, workspaceId: context.workspaceId }) });
	} catch (error) {
		if (!(error instanceof WebApiError)) throw error;
		// The route words its 400, 404 and 409 reasons for people; 403 and 503 carry internal codes.
		return { ok: false, error: error.status < 500 && error.status !== 403 && error.detail ? error.detail : null };
	}
	refresh();
	revalidatePath("/settings/keys");
	return { ok: true };
}
