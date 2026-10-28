import { useEffect, useRef } from "react";
import type { PullRequestGuideFinished } from "../../../shared/workspace";
import { useWorkspace } from "../../app/workspace";
import { toastManager } from "../../components/ui/toast";
import { openPullRequest } from "./events";
import { requestPullRequestTab } from "./tabRequest";

/** Whether the person is reading this pull request's guide right now, in which case nothing needs saying. */
const readingGuide = (number: number) => Array.from(document.querySelectorAll(`[data-pull-request="${number}"] nav[aria-label="Review tour"]`)).some(element => (element as HTMLElement).checkVisibility?.({ visibilityProperty: true }) ?? true);

/**
 * T3's PullRequestGuideRunCoordinator: when a review guide run ends, a toast says "Review guide ready" or "Review guide
 * failed" with "Open guide", unless the person is reading that guide. When the window is not in front, the main process
 * shows a desktop notification instead, and clicking it opens the guide.
 */
export function GuideRunNotices() {
	const { api, overview, selectedId, select, setNewChatProjectId } = useWorkspace();
	const state = useRef({ overview, selectedId });
	state.current = { overview, selectedId };
	useEffect(() => {
		if (!api?.onPullRequestGuideFinished) return;
		const open = (event: PullRequestGuideFinished) => {
			if (!event.projectId) return;
			const projectId = event.projectId, { overview: current, selectedId: chat } = state.current;
			const show = () => { requestPullRequestTab(projectId, event.number, "guide"); openPullRequest({ number: event.number }); };
			// The pane belongs to the open chat; a guide from another project opens beside a new chat there.
			if (current.tasks.find(task => task.id === chat)?.projectId === projectId) { show(); return; }
			select(undefined); setNewChatProjectId(projectId); window.setTimeout(show, 50);
		};
		return api.onPullRequestGuideFinished((event, opened) => {
			if (opened) { open(event); return; }
			if (document.visibilityState !== "visible" || !document.hasFocus() || readingGuide(event.number)) return;
			const body = event.title || `${event.repository} #${event.number}`;
			const id = toastManager.add({ type: event.error ? "error" : "success", title: event.error ? "Review guide failed" : "Review guide ready", description: event.error ? `${body}: ${event.error}` : body, timeout: event.error ? 10000 : 6000,
				...(event.projectId ? { actionProps: { children: "Open guide", onClick: () => { toastManager.close(id); open(event); } } } : {}) });
		});
	}, [api, select, setNewChatProjectId]);
	return null;
}
