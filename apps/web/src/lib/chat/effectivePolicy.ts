import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export type ChatRestriction = { mode: "none" | "allowlist" | "blocklist"; ids: string[] };
export type ChatPolicyLayer = { provider: ChatRestriction; model: ChatRestriction };
export type ChatEffectivePolicy = {
	account: ChatPolicyLayer | null;
	workspace: ChatPolicyLayer | null;
	guardrails: Array<ChatPolicyLayer & { id: string; name: string }>;
	workspaceId: string | null;
};

function blocked(rule: ChatRestriction | null | undefined, candidates: string[]) {
	if (!rule || rule.mode === "none") return false;
	const matches = candidates.some((candidate) => rule.ids.includes(candidate));
	return rule.mode === "blocklist" ? matches : !matches;
}

export function applyChatEffectivePolicy(models: GatewaySupportedModel[], policy: ChatEffectivePolicy | null): GatewaySupportedModel[] {
	if (!policy) return models;
	return models.map((model) => {
		const modelIds = [model.modelId, model.selectorModelId, model.internalModelId ?? ""].filter(Boolean);
		const reasons: NonNullable<GatewaySupportedModel["chatBlockedReasons"]> = [];
		if (blocked(policy.workspace?.provider, [model.providerId]) || blocked(policy.workspace?.model, modelIds)) {
			reasons.push({ source: "workspace", label: "Blocked by workspace Data Controls", settingsHref: "/settings/privacy" });
		}
		if (blocked(policy.account?.provider, [model.providerId]) || blocked(policy.account?.model, modelIds)) {
			reasons.push({ source: "account", label: "Blocked by your Personal Data Controls", settingsHref: "/settings/account/privacy" });
		}
		for (const guardrail of policy.guardrails) {
			if (blocked(guardrail.provider, [model.providerId]) || blocked(guardrail.model, modelIds)) {
				reasons.push({ source: "guardrail", label: `Blocked by ${guardrail.name}`, settingsHref: `/settings/guardrails/${guardrail.id}` });
			}
		}
		return { ...model, chatBlockedReasons: reasons };
	});
}
