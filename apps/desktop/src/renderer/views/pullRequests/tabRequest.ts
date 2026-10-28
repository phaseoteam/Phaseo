import { useEffect, useRef } from "react";

export type PullRequestTabName = "summary" | "guide" | "timeline" | "code";
const requested = new Map<string, PullRequestTabName>();
const key = (projectId: string, number: number) => `${projectId}#${number}`;
const EVENT = "phaseo:pull-request-tab";

/** Asks the pull request's pane to show a tab, whether it is open already or opens next (the guide notice's "Open guide"). */
export function requestPullRequestTab(projectId: string, number: number, tab: PullRequestTabName) {
	requested.set(key(projectId, number), tab);
	window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId, number } }));
}
/** Shows a requested tab once, when the pane mounts or while it is open. */
export function useRequestedPullRequestTab(projectId: string, number: number, select: (tab: PullRequestTabName) => void) {
	const latest = useRef(select);
	latest.current = select;
	useEffect(() => {
		const take = () => { const tab = requested.get(key(projectId, number)); if (tab) { requested.delete(key(projectId, number)); latest.current(tab); } };
		take();
		const listener = (event: Event) => { const detail = (event as CustomEvent<{ projectId: string; number: number }>).detail; if (detail?.projectId === projectId && detail.number === number) take(); };
		window.addEventListener(EVENT, listener);
		return () => window.removeEventListener(EVENT, listener);
	}, [projectId, number]);
}
