import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Workspace } from "../../shared/workspace";
import { emptyWorkspace } from "../../shared/workspace";

export function CommandPalette({ onClose, onNavigate, onTheme }: { onClose: () => void; onNavigate: (page: string, taskId?: string) => void; onTheme: (theme: "light" | "dark" | "system") => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [query, setQuery] = useState(""); const [selected, setSelected] = useState(0);
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace); const [error, setError] = useState("");
	useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
	useEffect(() => { document.getElementById(`workspace-command-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, query]);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace; if (!api) return;
		let active = true;
		void api.get().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onChange(setWorkspace); return () => { active = false; unsubscribe(); };
	}, []);
	const commands = [
		{ id: "new", title: "New task", detail: "Create", action: () => onNavigate("tasks") },
		...["home", "projects", "accounts", "agents", "terminals"].map(page => ({ id: page, title: `Open ${page}`, detail: "Navigation", action: () => onNavigate(page) })),
		...["light", "dark", "system"].map(theme => ({ id: theme, title: `${theme[0].toUpperCase()}${theme.slice(1)} theme`, detail: "Appearance", action: () => onTheme(theme as "light" | "dark" | "system") })),
		...workspace.tasks.map(task => ({ id: task.id, title: task.title, detail: `${task.harness} · ${task.status}${task.archived ? " · archived" : ""}`, action: () => onNavigate("tasks", task.id) })),
	].filter(command => `${command.title} ${command.detail}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50);
	const index = Math.min(selected, commands.length - 1);
	function choose(position: number) { const command = commands[position]; if (command) { command.action(); onClose(); } }
	return <dialog className="command-palette" ref={dialog} aria-label="Workspace commands" onCancel={onClose} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}><div className="command-search"><Search size={18} /><input autoFocus role="combobox" aria-label="Search commands and tasks" aria-expanded="true" aria-controls="workspace-command-results" aria-activedescendant={index >= 0 ? `workspace-command-${index}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(value => Math.max(0, Math.min(commands.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter") { event.preventDefault(); choose(index); } }} placeholder="Search commands and tasks" /><button type="button" aria-label="Close commands" onClick={onClose}><X size={16} /></button></div>{error && <p className="task-error" role="alert">{error}</p>}<div id="workspace-command-results" role="listbox" aria-label="Commands" className="command-results">{commands.map((command, position) => <button id={`workspace-command-${position}`} role="option" aria-selected={position === index} tabIndex={-1} type="button" key={command.id} onClick={() => choose(position)} onMouseEnter={() => setSelected(position)}><span>{command.title}</span><small>{command.detail}</small></button>)}{!commands.length && <p className="task-muted">No matching commands or tasks.</p>}</div></dialog>;
}
