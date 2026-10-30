import { useSyncExternalStore } from "react";
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
	void window.phaseoDesktop?.workspace?.preferences().then(value => { if (!current) publishWorkspacePreferences(value.preferences); }, () => { requested = false; });
}

export function useWorkspacePreferences(): WorkspacePreferences {
	request();
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current ?? defaultPreferences);
}
