import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
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

export const updateGlobalGuardrailsSettings = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { payload: GlobalGuardrailsSettingsPayload; expectedWorkspaceId?: string }) => input)
	.handler(async ({ data: { payload, expectedWorkspaceId } }) => {
		const context = await account(expectedWorkspaceId);
		const result = await fetchAccountWebApi<{ success: true }>("/api/account/settings/guardrails/global", context.accessToken, { method: "PUT", body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }) });
		return result;
	});

export const createGuardrail = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((payload: GuardrailUpsertPayload) => payload)
	.handler(async ({ data: payload }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ id?: string }>("/api/account/settings/guardrails", context.accessToken, { method: "POST", body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }) });
		return result;
	});

export const updateGuardrail = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; payload: GuardrailUpsertPayload }) => input)
	.handler(async ({ data: { id, payload } }) => {
		if (!id) throw new Error("Missing guardrail id");
		const context = await account();
		const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(id)}`, context.accessToken, { method: "PUT", body: JSON.stringify({ ...payload, workspaceId: context.workspaceId }) });
		return result;
	});

export const deleteGuardrail = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing guardrail id");
		const context = await account();
		const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(id)}`, context.accessToken, { method: "DELETE", body: JSON.stringify({ workspaceId: context.workspaceId }) });
		return result;
	});

export const setGuardrailKeys = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { guardrailId: string; keyIds: string[] }) => input)
	.handler(async ({ data: { guardrailId, keyIds } }) => {
		if (!guardrailId) throw new Error("Missing guardrail id");
		const context = await account();
		const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(guardrailId)}/keys`, context.accessToken, { method: "PUT", body: JSON.stringify({ keyIds, workspaceId: context.workspaceId }) });
		return result;
	});

export const setGuardrailMembers = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { guardrailId: string; userIds: string[] }) => input)
	.handler(async ({ data: { guardrailId, userIds } }) => {
		if (!guardrailId) throw new Error("Missing guardrail id");
		const context = await account();
		const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/guardrails/${encodeURIComponent(guardrailId)}/members`, context.accessToken, { method: "PUT", body: JSON.stringify({ userIds, workspaceId: context.workspaceId }) });
		return result;
	});
