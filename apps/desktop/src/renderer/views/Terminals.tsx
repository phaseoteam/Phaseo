import { useEffect, useRef, useState } from "react";
import { Plus, Square, Trash2 } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TerminalCommand, TerminalSession, WorkspaceApi } from "../../shared/workspace";

export function Terminals() {
	const api = window.phaseoDesktop?.workspace;
	const [sessions, setSessions] = useState<TerminalSession[]>([]);
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const [projectId, setProjectId] = useState("");
	const [selectedId, setSelectedId] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.terminals().then(value => { if (active) setSessions(value); }, reason => { if (active) setError(String(reason)); });
		void api.overview().then(value => { if (active) setProjects(value.projects.filter(project => !project.worktree?.removedAt)); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onTerminalEvent(event => setSessions(values => event.session ? [event.session, ...values.filter(value => value.id !== event.sessionId)] : values.map(value => value.id === event.sessionId ? { ...value, output: (value.output + (event.data ?? "")).slice(-1024 * 1024) } : value)));
		const unsubscribeWorkspace = api.onOverviewChange(value => { const projects = value.projects.filter(project => !project.worktree?.removedAt); setProjects(projects); setProjectId(current => projects.some(project => project.id === current) ? current : ""); });
		return () => { active = false; unsubscribe(); unsubscribeWorkspace(); };
	}, [api]);
	async function command(command: TerminalCommand) {
		if (!api) { setError("Open the desktop application to use local terminals."); return; }
		setBusy(true); setError("");
		try { const result = await api.terminal(command); setSessions(result); if (command.type === "open") setSelectedId(result.find(session => !sessions.some(value => value.id === session.id))?.id ?? ""); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setBusy(false); }
	}
	const selected = sessions.find(session => session.id === selectedId);
	return <div className="terminal-workspace"><aside className="terminal-list"><h1>Terminals</h1><select aria-label="Terminal project" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Personal terminal</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className="task-primary" type="button" disabled={busy} onClick={() => void command({ type: "open", ...(projectId ? { projectId } : {}) })}><Plus size={14} /> New terminal</button>{sessions.map(session => <button className={`task-row ${selectedId === session.id ? "selected" : ""}`} key={session.id} onClick={() => setSelectedId(session.id)}><span>{session.title}</span><small>{session.status}{session.exitCode !== undefined ? ` · exit ${session.exitCode}` : ""}</small></button>)}</aside><section className="terminal-detail">
		{error && <p className="task-error" role="alert">{error}</p>}
		{selected ? <><header className="task-toolbar"><div><strong>{selected.title}</strong><small>{selected.cwd}</small></div>{selected.status === "running" ? <button type="button" aria-label="Close terminal" onClick={() => void command({ type: "close", id: selected.id })}><Square size={14} /></button> : <button type="button" aria-label="Delete transcript" onClick={() => void command({ type: "delete", id: selected.id })}><Trash2 size={14} /></button>}</header>{api && <TerminalView key={selected.id} session={selected} api={api} onError={setError} />}</> : <div className="empty-state"><h2>Open a terminal</h2><p>Run local commands in a project or personal workspace.</p></div>}
	</section></div>;
}

export function AuthTerminal({ id }: { id: string }) {
	const api = window.phaseoDesktop?.workspace; const [session, setSession] = useState<TerminalSession>(); const [error, setError] = useState("");
	useEffect(() => {
		if (!api) return; let active = true;
		void api.terminals().then(values => { if (active) setSession(values.find(value => value.id === id)); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onTerminalEvent(event => { if (event.sessionId === id) setSession(current => event.session ?? (current ? { ...current, output: (current.output + (event.data ?? "")).slice(-1024 * 1024) } : current)); });
		return () => { active = false; unsubscribe(); };
	}, [api, id]);
	return <section className="task-auth-terminal" aria-label="Native sign-in terminal"><strong>{session?.title ?? "Native sign-in"}</strong>{error && <p role="alert">{error}</p>}{api && session && <TerminalView session={session} api={api} onError={setError} />}</section>;
}

function TerminalView({ session, api, onError }: { session: TerminalSession; api: WorkspaceApi; onError: (error: string) => void }) {
	const host = useRef<HTMLDivElement>(null);
	const current = useRef(session); current.current = session;
	useEffect(() => {
		if (!host.current) return;
		const colors = () => { const style = getComputedStyle(document.documentElement); return { background: style.getPropertyValue("--background").trim(), foreground: style.getPropertyValue("--text").trim() }; };
		const terminal = new Terminal({ fontSize: 14, fontFamily: "Cascadia Code, Consolas, monospace", cursorBlink: true, scrollback: 10000, theme: colors() });
		const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current); terminal.write(current.current.output);
		const input = terminal.onData(data => { if (current.current.status === "running") void api.terminal({ type: "write", id: current.current.id, data }).catch(reason => onError(String(reason))); });
		const unsubscribe = api.onTerminalEvent(event => { if (event.sessionId === current.current.id && event.data) terminal.write(event.data); });
		const resize = new ResizeObserver(() => { fit.fit(); if (current.current.status === "running") void api.terminal({ type: "resize", id: current.current.id, columns: Math.min(terminal.cols, 500), rows: Math.min(terminal.rows, 500) }).catch(reason => onError(String(reason))); });
		resize.observe(host.current);
		const theme = new MutationObserver(() => { terminal.options.theme = colors(); }); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => { input.dispose(); unsubscribe(); resize.disconnect(); theme.disconnect(); terminal.dispose(); };
	}, [api, onError]);
	return <div className="terminal-emulator" ref={host} />;
}
