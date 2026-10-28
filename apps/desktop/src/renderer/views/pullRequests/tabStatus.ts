import { useSyncExternalStore } from "react";

export type PullRequestTabStatus = { state: "OPEN" | "CLOSED" | "MERGED" | "open" | "closed" | "merged"; draft: boolean };
const statuses = new Map<string, PullRequestTabStatus>(), listeners = new Set<() => void>();
const key = (projectId: string, number: number) => `${projectId}#${number}`;

/**
 * T3's PullRequestTabStatusSeed: what the row that opened a pull request (or its last read) said about its state, so
 * its pane tab wears the state colour even when the chat does not link it.
 */
export function seedPullRequestTabStatus(projectId: string, number: number, status: PullRequestTabStatus) {
	const current = statuses.get(key(projectId, number));
	if (current?.state === status.state && current.draft === status.draft) return;
	statuses.set(key(projectId, number), { state: status.state, draft: status.draft });
	if (statuses.size > 500) statuses.delete(statuses.keys().next().value!);
	for (const listener of listeners) listener();
}
export function usePullRequestTabStatus(projectId: string, number: number) {
	return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => statuses.get(key(projectId, number)));
}
