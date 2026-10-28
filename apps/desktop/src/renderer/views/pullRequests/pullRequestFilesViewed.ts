import type { PullRequestFilesViewed, PullRequestFileViewedState } from "../../../shared/pullRequestFiles";

/** What GitHub last said about each file, by path (T3's pullRequestFilesViewed.logic). Absent means it said nothing. */
export type FileViewedStates = ReadonlyMap<string, PullRequestFileViewedState>;
/** Presses GitHub has not confirmed yet, by path. */
export type FileViewedOverlay = ReadonlyMap<string, boolean>;

export function toFileViewedStates(result: PullRequestFilesViewed | null | undefined): FileViewedStates | null { return result ? new Map(result.files.map(file => [file.path, file.state])) : null; }
/** `dismissed` is GitHub saying the file moved since it was ticked, which reads as unseen: the code behind the tick changed. */
export function isFileViewed(path: string, states: FileViewedStates | null, overlay: FileViewedOverlay) { return overlay.get(path) ?? states?.get(path) === "viewed"; }
export function isStaleViewed(path: string, states: FileViewedStates | null, overlay: FileViewedOverlay) { return !overlay.has(path) && states?.get(path) === "dismissed"; }
export function countViewedFiles(paths: readonly string[], states: FileViewedStates | null, overlay: FileViewedOverlay) { return paths.reduce((total, path) => isFileViewed(path, states, overlay) ? total + 1 : total, 0); }
/**
 * Everything GitHub has caught up on, removed. A press is held until a read that could have seen it comes back rather
 * than when the write succeeds, so the box does not flash back in between. `pending` paths are still in flight and
 * win; `answered` paths have had such a read and go on that read alone, even where it contradicts the press.
 */
export function settleFileViewedOverlay(overlay: FileViewedOverlay, states: FileViewedStates | null, pending: ReadonlySet<string>, answered: ReadonlySet<string>): FileViewedOverlay {
	if (states === null || overlay.size === 0) return overlay;
	const next = new Map(overlay);
	for (const [path, pressed] of overlay) { if (pending.has(path)) continue; if (answered.has(path) || (states.get(path) === "viewed") === pressed) next.delete(path); }
	return next.size === overlay.size ? overlay : next;
}
/** A failed request's presses taken back, but only those it still answers for: a path pressed again since is a later request's. */
export function revertFileViewedOverlay(overlay: FileViewedOverlay, batch: readonly { path: string; viewed: boolean }[], owned: ReadonlySet<string>): FileViewedOverlay {
	const next = new Map(overlay);
	for (const { path, viewed } of batch) if (owned.has(path) && next.get(path) === viewed) next.delete(path);
	return next.size === overlay.size ? overlay : next;
}

/** Ticks kept on this computer, for when GitHub's own record cannot be read; keyed by blob so a later push shows "Changed". */
export type LocalViewedFiles = Record<string, string>;
export const viewedStorageKey = (repository: string, number: number) => `phaseo.desktop.pullRequestViewed.${repository.toLowerCase()}#${number}`;
export function readLocalViewed(storage: Pick<Storage, "getItem">, key: string): LocalViewedFiles {
	try { const value = JSON.parse(storage.getItem(key) ?? "{}"); return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([path, blob]) => typeof path === "string" && typeof blob === "string").slice(0, 3000)) as LocalViewedFiles : {}; }
	catch { return {}; }
}
/** The local ticks in GitHub's words, so one counter and one checkbox serve both. */
export function localViewedStates(files: LocalViewedFiles, blobs: ReadonlyMap<string, string>): FileViewedStates {
	return new Map(Object.entries(files).map(([path, blob]) => [path, blobs.get(path) === undefined || blobs.get(path) === blob ? "viewed" as const : "dismissed" as const]));
}
