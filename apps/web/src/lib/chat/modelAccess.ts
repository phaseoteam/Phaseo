// Which models the signed-in member may use in the workspace picked in the header, as the gateway works it out
// (web-api GET /api/account/settings/models/access, from the gateway's /internal/model-access). The gateway applies
// the same rules Chat sends are checked against: the workspace baseline (Settings, Privacy), the member's departments,
// the member and their Chat key's own guardrails. Read-only here; rules are edited on the settings pages.
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export type ModelAccess = {
	workspaceId: string;
	workspaceName: string;
	source: "chat_key" | "member";
	/** Whether any rule rules out models or providers. */
	restricted: boolean;
	hiddenModelCount: number;
	limitedModelCount: number;
	/** Every model the rules leave out. */
	hiddenModels: Array<{ id: string; name: string }>;
	/** Models kept with only some providers: the providers still allowed. */
	limitedModels: Record<string, string[]>;
};

/** Where the rules are listed (members can see them; admins can change them there). */
export const MODEL_ACCESS_RULES_HREF = "/settings/guardrails";

export function hiddenModelIdSet(access: ModelAccess | null | undefined): Set<string> {
	return new Set(access?.restricted ? access.hiddenModels.map((model) => model.id) : []);
}

/** Whether the rules leave this model out; checks every id a row carries (chat rows carry three). */
export function isModelHidden(access: ModelAccess | null | undefined, ids: Array<string | null | undefined>, hidden = hiddenModelIdSet(access)): boolean {
	return ids.some((id) => Boolean(id) && hidden.has(id!));
}

/** Whether the rules allow this provider for this model. */
export function isProviderAllowed(access: ModelAccess | null | undefined, ids: Array<string | null | undefined>, providerId: string): boolean {
	if (!access?.restricted) return true;
	for (const id of ids) {
		const allowed = id ? access.limitedModels[id] : undefined;
		if (allowed) return allowed.includes(providerId);
	}
	return true;
}

const chatModelIds = (model: GatewaySupportedModel) => [model.modelId, model.selectorModelId, model.internalModelId];

/**
 * Chat's routes (one per model and provider) without those the rules leave out: hidden models, and providers turned
 * off for a model that's otherwise allowed. Without an answer (signed out, or the check failed) nothing is removed;
 * the gateway still enforces the rules, and the allow/block-list badges (applyChatEffectivePolicy) still show.
 */
export function applyModelAccess(models: GatewaySupportedModel[], access: ModelAccess | null | undefined): GatewaySupportedModel[] {
	if (!access?.restricted) return models;
	const hidden = hiddenModelIdSet(access);
	return models.filter((model) => {
		// The workspace's own models aren't in the gateway's shared list under their chat route; keep them.
		if (model.isInternal) return true;
		const ids = chatModelIds(model);
		return !isModelHidden(access, ids, hidden) && isProviderAllowed(access, ids, model.providerId);
	});
}

/**
 * Whether a saved chat uses a model (or a provider) the rules leave out. Such chats are left as saved rather than moved
 * to another model: the model is gone from the picker because of this workspace's rules, not because it was retired,
 * and the same chat opened under another workspace should still have it.
 */
export function threadUsesHiddenModel(
	access: ModelAccess | null | undefined,
	thread: { modelId?: string | null; settings: { providerId?: string | null; compareModelIds?: string[] | null } },
): boolean {
	if (!access?.restricted) return false;
	const hidden = hiddenModelIdSet(access);
	const modelIds = [thread.modelId, ...(thread.settings.compareModelIds ?? [])].filter((id): id is string => Boolean(id));
	if (modelIds.some((id) => hidden.has(id))) return true;
	const providerId = thread.settings.providerId;
	return Boolean(thread.modelId && providerId && !isProviderAllowed(access, [thread.modelId], providerId));
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Hidden models matching a search (every word in the id or name), to say why a search finds nothing. */
export function hiddenModelsMatching(access: ModelAccess | null | undefined, query: string): Array<{ id: string; name: string }> {
	const terms = normalise(query).split(" ").filter(Boolean);
	if (!access?.restricted || terms.length === 0) return [];
	return access.hiddenModels.filter((model) => {
		const haystack = `${normalise(model.id)} ${normalise(model.name)}`;
		return terms.every((term) => haystack.includes(term));
	});
}

/**
 * Whether the rules leave a catalogue model out (/models): its own id, or every API id the gateway lists it under, is
 * hidden. A model the gateway doesn't list at all isn't reported as blocked; it isn't the workspace's rules that
 * make it unavailable.
 */
export function isCatalogueModelBlocked(
	access: ModelAccess | null | undefined,
	model: { model_id?: string | null; gateway_api_model_ids?: string[] | null },
	hidden = hiddenModelIdSet(access),
): boolean {
	if (hidden.size === 0) return false;
	if (model.model_id && hidden.has(model.model_id)) return true;
	const apiIds = (model.gateway_api_model_ids ?? []).filter(Boolean);
	return apiIds.length > 0 && apiIds.every((id) => hidden.has(id));
}
