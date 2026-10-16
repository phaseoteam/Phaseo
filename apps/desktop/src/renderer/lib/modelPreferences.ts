import { useEffect, useState } from "react";
import type { Harness, ModelOption, ModelOptionValues } from "../../shared/workspace";

export type ModelSelection = { harness: Harness; model: string; accountId?: string; reasoningEffort?: string; serviceTier?: string; /** Per-model settings such as Claude Code effort, context window and fast mode. */ options?: ModelOptionValues };
export type ModelPreferences = { defaultSelection?: ModelSelection; recentSelection?: ModelSelection; recent: ModelSelection[] };
const key = "phaseo.desktop.modelPreferences";
const event = "phaseo-model-preferences-changed";
const valid = (value: unknown): value is ModelSelection => {
	if (!value || typeof value !== "object") return false;
	const selection = value as ModelSelection;
	return ["codex", "claude", "phaseo", "opencode", "pi", "cursor", "grok", "acp"].includes(selection.harness) && typeof selection.model === "string" && !!selection.model && !["default", "auto"].includes(selection.model) && [selection.accountId, selection.reasoningEffort, selection.serviceTier].every(field => field === undefined || typeof field === "string") && (selection.options === undefined || (!!selection.options && typeof selection.options === "object" && !Array.isArray(selection.options)));
};

export function readModelPreferences(): ModelPreferences {
	try {
		const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
		return { defaultSelection: valid(saved?.defaultSelection) ? saved.defaultSelection : undefined, recentSelection: valid(saved?.recentSelection) ? saved.recentSelection : undefined, recent: Array.isArray(saved?.recent) ? saved.recent.filter(valid).slice(0, 50) : [] };
	} catch { return { recent: [] }; }
}

function write(preferences: ModelPreferences) {
	try { localStorage.setItem(key, JSON.stringify(preferences)); window.dispatchEvent(new Event(event)); } catch { /* Storage failures do not interrupt a conversation. */ }
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
