import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export type ChatRestriction = { mode: "none" | "allowlist" | "blocklist"; ids: string[] };
export type ChatPolicyLayer = { provider: ChatRestriction; model: ChatRestriction };
export type ChatEffectivePolicy = {
	workspace: ChatPolicyLayer | null;
	guardrails: Array<ChatPolicyLayer & { id: string; name: string }>;
	workspaceId: string | null;
};

export type WorkspacePolicyBlockedReason = {
	source: "workspace" | "guardrail";
	label: string;
	settingsHref: string;
};

function blocked(rule: ChatRestriction | null | undefined, candidates: string[]) {
	if (!rule || rule.mode === "none" || candidates.length === 0) return false;
	const matches = candidates.some((candidate) => rule.ids.includes(candidate));
	return rule.mode === "blocklist" ? matches : !matches;
}

export function getWorkspacePolicyBlockedReasons(
	policy: ChatEffectivePolicy | null,
	{
		modelIds = [],
		providerIds = [],
	}: { modelIds?: string[]; providerIds?: string[] },
): WorkspacePolicyBlockedReason[] {
	if (!policy) return [];
	const reasons: WorkspacePolicyBlockedReason[] = [];
	if (blocked(policy.workspace?.provider, providerIds) || blocked(policy.workspace?.model, modelIds)) {
		reasons.push({ source: "workspace", label: "Blocked by workspace Data Controls", settingsHref: "/settings/privacy" });
	}
	for (const guardrail of policy.guardrails) {
		if (blocked(guardrail.provider, providerIds) || blocked(guardrail.model, modelIds)) {
			reasons.push({ source: "guardrail", label: `Blocked by ${guardrail.name}`, settingsHref: `/settings/guardrails/${guardrail.id}` });
		}
	}
	return reasons;
}

export function applyChatEffectivePolicy(models: GatewaySupportedModel[], policy: ChatEffectivePolicy | null): GatewaySupportedModel[] {
	if (!policy) return models;
	return models.map((model) => {
		const modelIds = [model.modelId, model.selectorModelId, model.internalModelId ?? ""].filter(Boolean);
		const reasons: NonNullable<GatewaySupportedModel["chatBlockedReasons"]> = getWorkspacePolicyBlockedReasons(
			policy,
			{ modelIds, providerIds: [model.providerId] },
		);
		return { ...model, chatBlockedReasons: reasons };
	});
}
