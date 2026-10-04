import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";

export function CommandPalette({ onClose, onNavigate, onTheme }: { onClose: () => void; onNavigate: (page: string, taskId?: string) => void; onTheme: (theme: "light" | "dark" | "system") => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [query, setQuery] = useState(""); const [selected, setSelected] = useState(0);
	const [attempt, setAttempt] = useState(0);
	const [loading, setLoading] = useState(true);
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview); const [error, setError] = useState("");
	useEffect(() => {
		const element = dialog.current; const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		element?.showModal();
		return () => { element?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
	}, []);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace; if (!api) { setLoading(false); return; }
		let active = true; let changed = false; setLoading(true); setError("");
		void api.overview().then(value => { if (active && !changed) setWorkspace(value); }, reason => { if (active) setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); }).finally(() => { if (active) setLoading(false); });
		const unsubscribe = api.onOverviewChange(value => { changed = true; if (active) setWorkspace(value); }); return () => { active = false; unsubscribe(); };
	}, [attempt]);
	const commands = [
		{ id: "new", title: "New chat", detail: "Create", action: () => onNavigate("tasks") },
		...["inbox", "missions", "projects", "proposals", "browser", "accounts", "agents", "terminals", "mcp", "settings"].map(page => ({ id: page, title: `Open ${page === "mcp" ? "MCP connections" : page}`, detail: "Navigation", action: () => onNavigate(page) })),
		...["light", "dark", "system"].map(theme => ({ id: theme, title: `${theme[0].toUpperCase()}${theme.slice(1)} theme`, detail: "Appearance", action: () => onTheme(theme as "light" | "dark" | "system") })),
		...workspace.tasks.map(task => ({ id: task.id, title: task.title, detail: `${task.harness} · ${task.status}${task.archived ? " · archived" : ""}`, action: () => onNavigate("tasks", task.id) })),
	].filter(command => `${command.title} ${command.detail}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50);
	const index = Math.min(selected, commands.length - 1);
	useEffect(() => { document.getElementById(`workspace-command-${index}`)?.scrollIntoView({ block: "nearest" }); }, [index, query, workspace]);
	function choose(position: number) { const command = commands[position]; if (command) { command.action(); onClose(); } }
	return <dialog className="command-palette" ref={dialog} aria-label="Workspace commands" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}><div className="command-search"><Search size={18} /><input role="combobox" aria-label="Search commands and tasks" aria-expanded="true" aria-controls="workspace-command-results" aria-activedescendant={index >= 0 ? `workspace-command-${index}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(value => Math.max(0, Math.min(commands.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter") { event.preventDefault(); choose(index); } }} placeholder="Search commands and tasks" /><button type="button" aria-label="Close commands" onClick={onClose}><X size={16} /></button></div>{loading && <p className="command-feedback" role="status">Loading tasks…</p>}{error && <div className="command-feedback"><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}<div id="workspace-command-results" role="listbox" aria-label="Commands" className="command-results">{commands.map((command, position) => <button id={`workspace-command-${position}`} role="option" aria-selected={position === index} tabIndex={-1} type="button" key={command.id} onClick={() => choose(position)} onMouseEnter={() => setSelected(position)}><span>{command.title}</span><small>{command.detail}</small></button>)}{!commands.length && <p className="task-muted">No matching commands or chats.</p>}</div></dialog>;
}
