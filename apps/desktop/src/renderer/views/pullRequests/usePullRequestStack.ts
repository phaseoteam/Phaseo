import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { PullRequestStackRead } from "../../../shared/pullRequestStacks";
import { errorMessage } from "./presentation";

type Entry = { data?: PullRequestStackRead; error?: string; pending: boolean; generation: number };
const entries = new Map<string, Entry>(), listeners = new Set<() => void>();
const empty: Entry = { pending: false, generation: 0 };
const emit = () => { for (const listener of listeners) listener(); };
function load(projectId: string, number: number, fresh: boolean) {
	const api = window.phaseoDesktop?.workspace, key = `${projectId}#${number}`, current = entries.get(key) ?? empty;
	if (!api) return;
	if (current.pending && !fresh) return;
	const generation = current.generation + 1;
	entries.set(key, { ...current, pending: true, generation }); emit();
	void api.pullRequestStack(projectId, number, fresh).then(
		data => { if (entries.get(key)?.generation === generation) { entries.set(key, { data, pending: false, generation }); emit(); } },
		reason => { const entry = entries.get(key); if (entry?.generation === generation) { entries.set(key, { ...entry, error: errorMessage(reason), pending: false }); emit(); } },
	);
}

/**
 * One pull request's native stack, shared by every surface that asks (the header's stack menu, the stacked-base mark,
 * a row's layer popover), so they cost one read. `enabled` false holds the read until a popover opens.
 */
export function usePullRequestStack(projectId: string, number: number, enabled = true) {
	const key = `${projectId}#${number}`;
	const entry = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => entries.get(key) ?? empty);
	useEffect(() => { if (enabled && projectId && !entries.get(key)?.data && !entries.get(key)?.pending) load(projectId, number, false); }, [enabled, key, projectId, number]);
	const refresh = useCallback(() => load(projectId, number, true), [projectId, number]);
	// A failed refresh keeps what was read before and says it may be stale.
	const notice = entry.data?.stack ? entry.error ? "Stack data may be stale. We couldn’t refresh it." : entry.pending ? "Refreshing stack… Showing saved data." : null : null;
	return { stack: entry.data?.stack ?? null, defaultBranch: entry.data?.defaultBranch, loaded: Boolean(entry.data), pending: entry.pending, error: entry.error, notice, refresh };
}
export function forgetPullRequestStacks(projectId: string, numbers: number[]) { for (const number of numbers) entries.delete(`${projectId}#${number}`); emit(); }
