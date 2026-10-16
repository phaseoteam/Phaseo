import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequestAction, PullRequestView } from "../../../shared/pullRequestView";
import { useBackgroundRefresh } from "../../lib/useBackgroundRefresh";
import { errorMessage } from "./presentation";
import { seedPullRequestTabStatus } from "./tabStatus";

/** One pull request: the latest view, a refresh that never overlaps itself, and writes that report inline. */
export function usePullRequest(projectId: string, number: number) {
	const api = window.phaseoDesktop?.workspace;
	const [view, setView] = useState<PullRequestView>();
	const [error, setError] = useState(""), [refreshing, setRefreshing] = useState(true);
	const [pending, setPending] = useState<PullRequestAction["type"]>();
	const [actionError, setActionError] = useState<{ action: PullRequestAction["type"]; message: string }>();
	const generation = useRef(0), busy = useRef(false);
	const refresh = useCallback(async () => {
		if (!api) { setRefreshing(false); setError("Open the desktop app to load this pull request."); return; }
		const current = ++generation.current; setRefreshing(true);
		try { const value = await api.pullRequestView(projectId, number); seedPullRequestTabStatus(projectId, number, value); if (current === generation.current) { setView(value); setError(""); } }
		catch (reason) { if (current === generation.current) setError(errorMessage(reason)); }
		finally { if (current === generation.current) setRefreshing(false); }
	}, [api, projectId, number]);
	useEffect(() => { setView(undefined); setError(""); setActionError(undefined); void refresh(); return () => { generation.current++; }; }, [refresh]);
	useBackgroundRefresh(() => { if (!busy.current) void refresh(); });
	const perform = useCallback(async (action: PullRequestAction): Promise<boolean> => {
		if (!api || !view || busy.current) return false;
		busy.current = true; setPending(action.type); setActionError(undefined);
		const current = ++generation.current;
		try { const value = await api.pullRequestAction(projectId, { number, headOid: view.headOid, action }); if (current === generation.current) setView(value); return true; }
		catch (reason) { setActionError({ action: action.type, message: errorMessage(reason) }); void refresh(); return false; }
		finally { busy.current = false; setPending(undefined); }
	}, [api, view, projectId, number, refresh]);
	return { view, error, refreshing, refresh, perform, pending, actionError, clearActionError: () => setActionError(undefined) };
}
export type PullRequestState = ReturnType<typeof usePullRequest>;
