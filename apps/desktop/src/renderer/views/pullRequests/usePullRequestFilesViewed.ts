import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PullRequestFilesViewed } from "../../../shared/pullRequestFiles";
import { showToast } from "../../components/ui/toast";
import { errorMessage } from "./presentation";
import { countViewedFiles, isFileViewed, isStaleViewed, localViewedStates, readLocalViewed, revertFileViewedOverlay, settleFileViewedOverlay, toFileViewedStates, viewedStorageKey, type FileViewedOverlay, type FileViewedStates, type LocalViewedFiles } from "./pullRequestFilesViewed";

/** Long enough that ticking down a list costs one request, short enough that a tick before closing the pane is recorded. */
const FLUSH_DELAY = 400;
const NONE: FileViewedOverlay = new Map();

/**
 * Which files this reader has cleared, as GitHub records it (T3's usePullRequestFilesViewed), so a review carried on
 * from github.com or another machine picks up where it was left. Presses show at once and are held over GitHub's
 * answer until a read that could have seen them comes back. When GitHub's record cannot be read, ticks are kept on
 * this computer instead and the count says so.
 */
export function usePullRequestFilesViewed({ projectId, repository, number, blobs }: { projectId: string; repository: string; number: number; blobs: ReadonlyMap<string, string> }) {
	const api = window.phaseoDesktop?.workspace;
	const [result, setResult] = useState<PullRequestFilesViewed | null>(null), [error, setError] = useState<string | null>(null);
	const storageKey = viewedStorageKey(repository, number);
	const [local, setLocal] = useState<LocalViewedFiles>(() => readLocalViewed(localStorage, storageKey));
	const [overlay, setOverlay] = useState<FileViewedOverlay>(NONE);
	const scopeKey = `${projectId} ${repository} ${number}`, scope = useRef(scopeKey);
	const queued = useRef(new Map<string, boolean>()), sentBy = useRef(new Map<string, number>()), requests = useRef(0), timer = useRef<number | null>(null);
	const answeredFrom = useRef(new Map<string, FileViewedStates | null>());
	const fallback = error !== null && result === null;
	const remote = useMemo(() => toFileViewedStates(result), [result]);
	const states = useMemo(() => fallback ? localViewedStates(local, blobs) : remote, [fallback, local, blobs, remote]);
	const statesRef = useRef(states);
	statesRef.current = states;

	const refresh = useCallback(async () => {
		if (!api) return;
		const asked = scope.current;
		try { const value = await api.pullRequestFilesViewed(projectId, number); if (scope.current === asked) { setResult(value); setError(null); } }
		catch (reason) { if (scope.current === asked) setError(errorMessage(reason)); }
	}, [api, projectId, number]);

	useEffect(() => {
		const pending = new Set([...queued.current.keys(), ...sentBy.current.keys()]), answered = new Set<string>();
		for (const [path, from] of answeredFrom.current) { if (pending.has(path) || from === states) continue; answered.add(path); answeredFrom.current.delete(path); }
		setOverlay(current => settleFileViewedOverlay(current, states, pending, answered));
	}, [states]);

	const flush = useCallback(() => {
		timer.current = null;
		const batch = [...queued.current].map(([path, viewed]) => ({ path, viewed }));
		if (!batch.length || !api) return;
		queued.current = new Map();
		const from = scope.current, request = ++requests.current;
		for (const file of batch) sentBy.current.set(file.path, request);
		void api.setPullRequestFilesViewed(projectId, { number, files: batch }).then(() => true, () => false).then(done => {
			const mine = batch.map(file => file.path).filter(path => sentBy.current.get(path) === request);
			for (const path of mine) sentBy.current.delete(path);
			if (scope.current !== from) return;
			if (!done) {
				const owned = new Set(mine.filter(path => !queued.current.has(path)));
				// Kept here instead of lost: the next read that works puts GitHub's record back on top.
				if (!fallback) setOverlay(current => revertFileViewedOverlay(current, batch, owned));
				if (owned.size && !fallback) showToast("error", "Could not update viewed files");
				return;
			}
			for (const path of mine) answeredFrom.current.set(path, statesRef.current);
			void refresh();
		});
	}, [api, projectId, number, refresh, fallback]);
	const flushRef = useRef(flush);
	flushRef.current = flush;

	useEffect(() => {
		const flushScope = flushRef.current;
		scope.current = scopeKey;
		setResult(null); setError(null); setLocal(readLocalViewed(localStorage, storageKey));
		void refresh();
		return () => {
			if (timer.current !== null) { window.clearTimeout(timer.current); flushScope(); }
			queued.current = new Map(); sentBy.current = new Map(); answeredFrom.current = new Map(); setOverlay(NONE);
		};
	}, [scopeKey, storageKey, refresh]);

	const setViewed = useCallback((path: string, viewed: boolean) => {
		setOverlay(current => new Map(current).set(path, viewed));
		setLocal(current => {
			const next = { ...current };
			if (viewed) next[path] = blobs.get(path) ?? ""; else delete next[path];
			try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Ticks stay for this session. */ }
			return next;
		});
		queued.current.set(path, viewed);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => flushRef.current(), FLUSH_DELAY);
	}, [blobs, storageKey]);

	return {
		isViewed: (path: string) => isFileViewed(path, states, overlay),
		isStale: (path: string) => isStaleViewed(path, states, overlay),
		/** Ticked files across the whole change: every path GitHub reported on, and any pressed or loaded since. */
		count: (paths: readonly string[]) => countViewedFiles([...new Set([...states?.keys() ?? [], ...overlay.keys(), ...paths])], states, overlay),
		setViewed, refresh,
		/** GitHub's record was read but stops short of every file. */
		truncated: result?.truncated === true,
		/** GitHub's record could not be read; the boxes are the last answer, or this computer's own ticks. */
		error, local: fallback,
	};
}
