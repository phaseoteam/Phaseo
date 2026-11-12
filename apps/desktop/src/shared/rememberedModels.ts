import type { ProjectModelDefault } from "./projectSettings";
import type { Harness } from "./workspace";
import type { WorkspaceOverview } from "./workspaceOverview";

const selectionHarnesses = ["codex", "claude", "phaseo", "opencode", "pi", "cursor", "grok", "acp"];

/** A model and its settings as the picker chooses them ("default" and "auto" aren't real choices to remember). */
export function isModelSelection(value: unknown): value is ProjectModelDefault {
	if (!value || typeof value !== "object") return false;
	const selection = value as ProjectModelDefault;
	return selectionHarnesses.includes(selection.harness) && typeof selection.model === "string" && !!selection.model && selection.model.length <= 300 && !["default", "auto"].includes(selection.model)
		&& [selection.accountId, selection.reasoningEffort, selection.serviceTier].every(field => field === undefined || (typeof field === "string" && field.length <= 200))
		&& (selection.options === undefined || (!!selection.options && typeof selection.options === "object" && !Array.isArray(selection.options)));
}

/**
 * What the window remembers in its own storage and mirrors to the main process, so a phone starts chats the way the
 * window would: the model a new chat starts with (the person's default, else the last one picked) and the favourites.
 */
export type RememberedModels = { selection?: ProjectModelDefault; favourites: string[] };
export function validateRememberedModels(value: unknown): RememberedModels {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
	if (!input) throw new Error("Invalid remembered models.");
	if (input.selection !== undefined && !isModelSelection(input.selection)) throw new Error("Invalid remembered model.");
	const favourites = input.favourites ?? [];
	if (!Array.isArray(favourites) || favourites.length > 500 || favourites.some(key => typeof key !== "string" || key.length > 300)) throw new Error("Invalid favourite models.");
	return { ...input.selection ? { selection: input.selection as ProjectModelDefault } : {}, favourites: favourites as string[] };
}

/**
 * The agents the person can run now: local ones found installed and signed in (or listing models, for OpenCode and
 * Pi), every configured and unexpired account, and outside agents. The window's pickers and the phone both use this.
 */
export function connectedHarnesses(local: readonly Harness[], overview: Pick<WorkspaceOverview, "accounts" | "agents">, now = Date.now()) {
	const connected = new Set<Harness>(local);
	for (const account of overview.accounts) if (account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > now)) connected.add(account.harness);
	if (overview.agents.some(agent => !agent.archived)) connected.add("acp");
	return connected;
}
