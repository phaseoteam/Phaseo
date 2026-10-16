import { useSyncExternalStore } from "react";
import type { TerminalSession, WorkspaceApi } from "../../shared/workspace";

/**
 * Every terminal session, shared by all terminal surfaces. Output is kept apart from the session list, so
 * streaming output does not re-render tabs; a terminal view reads it once and then follows the events.
 */
let sessions: TerminalSession[] = [];
const outputs = new Map<string, string>();
const listeners = new Set<() => void>();
const exitListeners = new Set<(session: TerminalSession) => void>();
let started: WorkspaceApi | undefined;
/** Terminals closed from the app: their transcripts are removed once the process has exited. */
const closing = new Set<string>();

const emit = () => { for (const listener of listeners) listener(); };
function upsert(session: TerminalSession) {
	const previous = sessions.find(value => value.id === session.id);
	outputs.set(session.id, session.output);
	sessions = previous ? sessions.map(value => value.id === session.id ? { ...session, output: "" } : value) : [{ ...session, output: "" }, ...sessions];
	emit();
	if (previous?.status === "running" && session.status !== "running") {
		for (const listener of exitListeners) listener(session);
		if (closing.delete(session.id)) void deleteTranscript(session.id);
	}
}

function start(api: WorkspaceApi) {
	if (started === api) return;
	started = api;
	api.onTerminalEvent(event => {
		if (event.session) upsert(event.session);
		else if (event.data) outputs.set(event.sessionId, ((outputs.get(event.sessionId) ?? "") + event.data).slice(-1024 * 1024));
	});
	void refreshTerminals(api);
}

export async function refreshTerminals(api: WorkspaceApi) { replace(await api.terminals()); }
function replace(values: TerminalSession[]) {
	for (const value of values) outputs.set(value.id, value.output);
	sessions = values.map(value => ({ ...value, output: "" }));
	for (const value of values) if (value.status !== "running" && closing.delete(value.id)) void deleteTranscript(value.id);
	emit();
}

/** Terminal sessions without their output, newest first. */
export function useTerminalSessions(): TerminalSession[] {
	const api = window.phaseoDesktop?.workspace;
	if (api) start(api);
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => sessions);
}
export const terminalOutput = (id: string) => outputs.get(id) ?? "";
export const terminalSession = (id: string) => sessions.find(session => session.id === id);
/** Called when a running terminal's process exits. */
export function onTerminalExit(listener: (session: TerminalSession) => void) { exitListeners.add(listener); return () => { exitListeners.delete(listener); }; }

/** Running terminals for a chat, or for a project when no chat is given (sign-in terminals excluded). */
export function terminalsFor(values: readonly TerminalSession[], scope: { projectId?: string; taskId?: string }) {
	return values.filter(session => !session.ephemeral && session.status === "running" && (session.projectId ?? "") === (scope.projectId ?? "") && (scope.taskId === undefined || session.taskId === scope.taskId))
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const terminalTitle = (session?: Pick<TerminalSession, "title">) => session?.title || "Terminal";

/** Opens a terminal in a project (and chat), running a project script when one is given, and returns its session. */
export async function createTerminal(scope: { projectId?: string; taskId?: string; scriptId?: string }): Promise<TerminalSession> {
	const api = window.phaseoDesktop?.workspace;
	if (!api) throw new Error("Open the desktop app to use terminals.");
	start(api);
	const before = new Set(sessions.map(session => session.id));
	const result = await api.terminal({ type: "open", ...(scope.projectId ? { projectId: scope.projectId } : {}), ...(scope.taskId ? { taskId: scope.taskId } : {}), ...(scope.scriptId ? { scriptId: scope.scriptId } : {}) });
	replace(result);
	const created = result.find(session => !before.has(session.id) && session.status === "running" && (session.taskId ?? "") === (scope.taskId ?? ""));
	if (!created) throw new Error("The terminal did not start.");
	return created;
}

/** Stops a terminal's process; its transcript is removed when the process has exited. */
export async function closeTerminal(id: string) {
	const api = window.phaseoDesktop?.workspace;
	if (!api) return;
	const session = sessions.find(value => value.id === id);
	if (session?.status === "running") { closing.add(id); replace(await api.terminal({ type: "close", id })); }
	else await deleteTranscript(id);
}
export async function deleteTranscript(id: string) {
	const api = window.phaseoDesktop?.workspace;
	if (!api) return;
	try { replace(await api.terminal({ type: "delete", id })); outputs.delete(id); } catch { /* Already removed, or still stopping. */ }
}
