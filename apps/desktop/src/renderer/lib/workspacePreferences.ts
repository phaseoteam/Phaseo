import { useEffect, useSyncExternalStore } from "react";
import { defaultPreferences, type WorkspacePreferences } from "../../shared/preferences";

/** Workspace preferences for components that only read them (merge method, diff file state), read once per window and kept current by Settings. */
let current: WorkspacePreferences | undefined;
let requested = false;
const listeners = new Set<() => void>();

export function publishWorkspacePreferences(value: WorkspacePreferences) {
	current = value;
	for (const listener of listeners) listener();
}

function request() {
	if (requested) return;
	requested = true;
	void window.phaseoDesktop?.workspace?.preferences?.().then(value => { if (!current) publishWorkspacePreferences(value.preferences); }, () => { requested = false; });
}

/** The same outside a render, for code that only needs the value when it runs (polling intervals, a new browser tab's profile); the loaded preferences, else the defaults while they load. It does not re-render. */
export function readWorkspacePreferences(): WorkspacePreferences {
	request();
	return current ?? defaultPreferences;
}

/**
 * Saves part of one preferences group from outside Settings, such as a diff toolbar button that also changes the default.
 * Reads the saved preferences first, so a change made elsewhere since this window loaded isn't overwritten.
 */
export async function saveChatPreferences(change: Partial<WorkspacePreferences["chat"]>) {
	const api = window.phaseoDesktop?.workspace;
	const base = current ?? defaultPreferences;
	publishWorkspacePreferences({ ...base, chat: { ...base.chat, ...change } });
	if (!api) return;
	const saved = (await api.preferences()).preferences;
	publishWorkspacePreferences(await api.savePreferences({ ...saved, chat: { ...saved.chat, ...change } }));
}

/** The preferences outside React when a saved choice must not be missed, such as where a clicked link opens: waits for them to load. */
export async function fetchWorkspacePreferences(): Promise<WorkspacePreferences> {
	if (current) return current;
	try { const value = await window.phaseoDesktop?.workspace?.preferences(); if (value && !current) publishWorkspacePreferences(value.preferences); } catch { /* Use the defaults. */ }
	return current ?? defaultPreferences;
}

/** Keeps the document's diff colour scheme (Settings → Diffs) in step with the preference. */
export function useDiffColours() {
	const { diffColours } = useWorkspacePreferences().chat;
	useEffect(() => { document.documentElement.toggleAttribute("data-diff-colours", diffColours !== "red-green"); document.documentElement.dataset.diffColours = diffColours; }, [diffColours]);
}

export function useWorkspacePreferences(): WorkspacePreferences {
	request();
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current ?? defaultPreferences, () => defaultPreferences);
}
