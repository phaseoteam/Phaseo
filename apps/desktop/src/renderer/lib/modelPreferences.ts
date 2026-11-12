import { useEffect, useState } from "react";
import { isModelSelection } from "../../shared/rememberedModels";
import type { Harness, ModelOption, ModelOptionValues } from "../../shared/workspace";

export type ModelSelection = { harness: Harness; model: string; accountId?: string; reasoningEffort?: string; serviceTier?: string; /** Per-model settings such as Claude Code effort, context window and fast mode. */ options?: ModelOptionValues };
export type ModelPreferences = { defaultSelection?: ModelSelection; recentSelection?: ModelSelection; recent: ModelSelection[] };
const key = "phaseo.desktop.modelPreferences";
const event = "phaseo-model-preferences-changed";
const valid: (value: unknown) => value is ModelSelection = isModelSelection;
/** The model picker's starred models, as `harness:model` keys. */
export const favouriteModelsKey = "phaseo.desktop.favouriteModels";

/**
 * Sends the model a new chat starts with (the default, else the last picked) and the favourites to main, so a phone
 * starts chats the way this window would. Called when the window starts and whenever either changes.
 */
export function mirrorModelPreferences() {
	if (typeof window === "undefined") return;
	const preferences = readModelPreferences();
	let favourites: string[] = [];
	try { const saved: unknown = JSON.parse(localStorage.getItem(favouriteModelsKey) ?? "[]"); if (Array.isArray(saved)) favourites = saved.filter((value): value is string => typeof value === "string").slice(0, 500); } catch { /* Unreadable favourites count as none. */ }
	const selection = preferences.defaultSelection ?? preferences.recentSelection;
	void window.phaseoDesktop?.workspace.rememberModels({ ...selection ? { selection } : {}, favourites }).catch(() => {});
}

export function readModelPreferences(): ModelPreferences {
	try {
		const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
		return { defaultSelection: valid(saved?.defaultSelection) ? saved.defaultSelection : undefined, recentSelection: valid(saved?.recentSelection) ? saved.recentSelection : undefined, recent: Array.isArray(saved?.recent) ? saved.recent.filter(valid).slice(0, 50) : [] };
	} catch { return { recent: [] }; }
}

function write(preferences: ModelPreferences) {
	try { localStorage.setItem(key, JSON.stringify(preferences)); window.dispatchEvent(new Event(event)); } catch { /* Storage failures do not interrupt a conversation. */ }
	mirrorModelPreferences();
}

export function rememberModel(selection: ModelSelection) {
	if (!valid(selection)) return;
	const preferences = readModelPreferences();
	write({ ...preferences, recentSelection: selection, recent: [selection, ...preferences.recent.filter(value => value.harness !== selection.harness || (value.accountId ?? "") !== (selection.accountId ?? ""))].slice(0, 50) });
}

export function setDefaultModel(selection?: ModelSelection) {
	if (selection && !valid(selection)) return;
	write({ ...readModelPreferences(), defaultSelection: selection });
}

export function preferredModel(preferences: ModelPreferences, harness: Harness, accountId: string | undefined, models: ModelOption[]) {
	return [preferences.defaultSelection, ...preferences.recent].find(selection => selection?.harness === harness && (selection.accountId ?? "") === (accountId ?? "") && models.some(model => model.id === selection.model));
}

export function useModelPreferences() {
	const [preferences, setPreferences] = useState(readModelPreferences);
	useEffect(() => {
		const update = () => setPreferences(readModelPreferences());
		window.addEventListener(event, update); window.addEventListener("storage", update);
		return () => { window.removeEventListener(event, update); window.removeEventListener("storage", update); };
	}, []);
	return preferences;
}
