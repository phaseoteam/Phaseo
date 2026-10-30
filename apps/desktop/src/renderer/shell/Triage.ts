import { useSyncExternalStore } from "react";
import type { TriagePreparation } from "../../shared/triage";
import type { WorkspaceApi } from "../../shared/workspace";
import { errorText } from "../app/workspace";

/** Triage on the new-chat screen: fetching the build's source, ready with its checkout, or failed. */
export type TriageState = { status: "idle" } | { status: "preparing" } | { status: "ready"; preparation: TriagePreparation } | { status: "failed"; error: string };

let state: TriageState = { status: "idle" };
const listeners = new Set<() => void>();
const set = (next: TriageState) => { state = next; for (const listener of listeners) listener(); };
export const useTriage = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);

/** Fetches (or reuses) the source for this build; the new-chat screen shows progress and takes over once it is ready. */
export function startTriage(api: WorkspaceApi) {
	if (state.status === "preparing") return;
	set({ status: "preparing" });
	api.prepareTriage().then(preparation => { if (state.status === "preparing") set({ status: "ready", preparation }); }, reason => { if (state.status === "preparing") set({ status: "failed", error: errorText(reason) }); });
}
export function endTriage() { set({ status: "idle" }); }
