import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequestAction, PullRequestView } from "../../../shared/pullRequestView";
import { showToast } from "../../components/ui/toast";
import { useBackgroundRefresh } from "../../lib/useBackgroundRefresh";
import { errorMessage } from "./presentation";
import { actionFailureLabel, actionSuccessLabel, readableFailure } from "./pullRequestFeedback";

/**
 * One pull request: the latest view, a refresh that never overlaps itself, and writes that report as toasts the way
 * T3 Code's do ("Could not …" with GitHub's reason or a hint at what to check).
 */
export function usePullRequest(projectId: string, number: number) {
	const api = window.phaseoDesktop?.workspace;
	const [view, setView] = useState<PullRequestView>();
	const [error, setError] = useState(""), [refreshing, setRefreshing] = useState(true);
	const [pending, setPending] = useState<PullRequestAction["type"]>();
	const generation = useRef(0), busy = useRef(false);
	const refresh = useCallback(async () => {
		if (!api) { setRefreshing(false); setError("Open the desktop app to load this pull request."); return; }
		const current = ++generation.current; setRefreshing(true);
		try { const value = await api.pullRequestView(projectId, number); if (current === generation.current) { setView(value); setError(""); } }
		catch (reason) { if (current === generation.current) setError(errorMessage(reason)); }
		finally { if (current === generation.current) setRefreshing(false); }
	}, [api, projectId, number]);
	useEffect(() => { setView(undefined); setError(""); void refresh(); return () => { generation.current++; }; }, [refresh]);
	useBackgroundRefresh(() => { if (!busy.current) void refresh(); });
	const perform = useCallback(async (action: PullRequestAction): Promise<boolean> => {
		if (!api || !view || busy.current) return false;
		busy.current = true; setPending(action.type);
		const current = ++generation.current;
		try {
			const value = await api.pullRequestAction(projectId, { number, headOid: view.headOid, action });
			if (current === generation.current) setView(value);
			const success = actionSuccessLabel(action);
			if (success) showToast("success", success, undefined, value.revertUrl ? { label: "Open on GitHub", onClick: () => void api.openLink(value.revertUrl!) } : undefined);
			return true;
		}
		catch (reason) { showToast("error", actionFailureLabel(action), readableFailure(errorMessage(reason), action)); void refresh(); return false; }
		finally { busy.current = false; setPending(undefined); }
	}, [api, view, projectId, number, refresh]);
	return { view, error, refreshing, refresh, perform, pending };
}
export type PullRequestState = ReturnType<typeof usePullRequest>;
