/** Asks the pane to open a project file in a file surface (the diff's file names and the file explorer send it). */
export const OPEN_PROJECT_FILE_EVENT = "phaseo:open-project-file";
/** `line` scrolls to and highlights that line (terminal file links). */
export type OpenProjectFileDetail = { projectId: string; path: string; line?: number };
/** A surface changed the project's files or Git state (a save, stage, commit, push), so others refresh. */
export const PROJECT_CHANGED_EVENT = "phaseo:project-changed";
export type ProjectChangedDetail = { projectId: string };

/** Lines asked for before their file surface mounted, by project and path (see revealLine.ts). */
export const pendingFileLines = new Map<string, number>();
export const pendingLineKey = (projectId: string, path: string) => `${projectId}\n${path}`;
export const openProjectFile = (detail: OpenProjectFileDetail) => { if (detail.line) pendingFileLines.set(pendingLineKey(detail.projectId, detail.path), detail.line); window.dispatchEvent(new CustomEvent<OpenProjectFileDetail>(OPEN_PROJECT_FILE_EVENT, { detail })); };
export const announceProjectChange = (projectId: string) => window.dispatchEvent(new CustomEvent<ProjectChangedDetail>(PROJECT_CHANGED_EVENT, { detail: { projectId } }));
export function onProjectChange(projectId: string, listener: () => void) {
	const handle = (event: Event) => { if ((event as CustomEvent<ProjectChangedDetail>).detail?.projectId === projectId) listener(); };
	window.addEventListener(PROJECT_CHANGED_EVENT, handle);
	return () => window.removeEventListener(PROJECT_CHANGED_EVENT, handle);
}

/** Where the Diff pane keeps each chat's chosen scope. */
export const DIFF_SELECTION_KEY = "phaseo.desktop.diffSelection";
/** Asks the pane to show the Diff at one turn of a chat (the changed-files row under a turn sends it). */
export const OPEN_TURN_DIFF_EVENT = "phaseo:open-turn-diff";
/** `path` scrolls the diff to that file once it has loaded. */
export type OpenTurnDiffDetail = { taskId: string; messageId: string; path?: string };
/** The file a turn diff was opened at, by chat, for a Diff pane that mounts after the event. */
export const pendingTurnDiffPaths = new Map<string, string>();
export function openTurnDiff(detail: OpenTurnDiffDetail) {
	// Saved first, so a Diff pane that opens now starts at this turn; an open one follows the event.
	if (detail.path) pendingTurnDiffPaths.set(detail.taskId, detail.path); else pendingTurnDiffPaths.delete(detail.taskId);
	try { const saved = JSON.parse(localStorage.getItem(DIFF_SELECTION_KEY) ?? "{}") as Record<string, unknown>; localStorage.setItem(DIFF_SELECTION_KEY, JSON.stringify({ ...saved, [detail.taskId]: { kind: "turn", messageId: detail.messageId } })); } catch { /* The open pane still follows the event. */ }
	window.dispatchEvent(new CustomEvent<OpenTurnDiffDetail>(OPEN_TURN_DIFF_EVENT, { detail }));
}

/** Asks the pane to show a side chat of the open chat as a tab (after /side, or from the chat's side chat list). */
export const OPEN_SIDE_CHAT_EVENT = "phaseo:open-side-chat";
export type OpenSideChatDetail = { parentId: string; id: string };
export const openSideChat = (detail: OpenSideChatDetail) => window.dispatchEvent(new CustomEvent<OpenSideChatDetail>(OPEN_SIDE_CHAT_EVENT, { detail }));
