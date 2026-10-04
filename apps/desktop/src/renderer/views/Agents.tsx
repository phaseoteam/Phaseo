import { useEffect, useState } from "react";
import type { AgentStatus, HarnessInstallation, Workspace } from "../../shared/workspace";
import { emptyWorkspace } from "../../shared/workspace";

export function Agents() {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	const [installed, setInstalled] = useState<HarnessInstallation[]>([]);
	const [name, setName] = useState(""); const [executable, setExecutable] = useState(""); const [argumentsText, setArgumentsText] = useState("[]");
	const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<string>(); const [showArchived, setShowArchived] = useState(false); const [checking, setChecking] = useState<string>();
	const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({}); const [refreshing, setRefreshing] = useState(false);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.get().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		void api.installations().then(value => { if (active) setInstalled(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onChange(setWorkspace); return () => { active = false; unsubscribe(); };
	}, [api]);
	async function add() {
		if (!api) return; setBusy(true); setError("");
		try { const argumentsValue: unknown = JSON.parse(argumentsText); if (!Array.isArray(argumentsValue) || argumentsValue.some(value => typeof value !== "string")) throw new Error('Use a JSON array of arguments, such as ["--acp"].'); setWorkspace(await api.command({ ...(editing ? { type: "update-agent" as const, id: editing } : { type: "add-agent" as const }), name, executable, arguments: argumentsValue as string[] })); if (editing) setStatuses(current => { const next = { ...current }; delete next[editing]; return next; }); reset(); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
	}
	function reset() { setEditing(undefined); setName(""); setExecutable(""); setArgumentsText("[]"); }
	async function check(id: string) {
		if (!api || checking) return; setChecking(id); setError("");
		try { const status = await api.checkAgent(id); setStatuses(current => ({ ...current, [id]: status })); }
		catch (reason) { setError(String(reason)); } finally { setChecking(undefined); }
	}
	return <div className="page accounts-page"><h1>Agents</h1>{error && <p className="task-error" role="alert">{error}</p>}
		<section className="panel"><div className="panel-heading"><h2>Native harnesses</h2><button type="button" disabled={refreshing || !api} onClick={() => { if (!api) return; setRefreshing(true); void api.installations().then(setInstalled, reason => setError(String(reason))).finally(() => setRefreshing(false)); }}>{refreshing ? "Checking…" : "Refresh"}</button></div>{installed.map(value => <div className="account-row" key={value.harness}><div><strong>{value.harness}</strong><small>{value.installed ? `Installed${value.version ? ` · ${value.version}` : ""}` : value.error ?? "Install the native CLI to use this harness."}</small></div></div>)}</section>
		<section className="panel"><div className="panel-heading"><h2>ACP agents</h2><button type="button" onClick={() => { setShowArchived(value => !value); reset(); }}>{showArchived ? "Active agents" : "Archived agents"}</button></div>
			{workspace.agents.filter(agent => Boolean(agent.archived) === showArchived).map(agent => <article key={agent.id}><div className="account-row"><div><strong>{agent.name}</strong><details className="agent-command"><summary>Command</summary><code>{agent.executable} {agent.arguments.join(" ")}</code></details></div><button type="button" disabled={!!checking} onClick={() => void check(agent.id)}>{checking === agent.id ? "Checking…" : "Check connection"}</button><button type="button" disabled={busy || checking === agent.id} onClick={() => { setEditing(agent.id); setName(agent.name); setExecutable(agent.executable); setArgumentsText(JSON.stringify(agent.arguments)); }}>Edit</button><button type="button" disabled={busy || checking === agent.id} onClick={() => { if (!api) return; reset(); void api.command({ type: "update-agent", id: agent.id, archived: !agent.archived }).then(setWorkspace, reason => setError(String(reason))); }}>{agent.archived ? "Restore" : "Archive"}</button></div>
				{statuses[agent.id] && <div className="account-status"><p>Connected to {statuses[agent.id].name ?? agent.name}{statuses[agent.id].version ? ` · ${statuses[agent.id].version}` : ""}</p><p>Native capabilities: {statuses[agent.id].capabilities.join(", ") || "Basic ACP"}</p>{statuses[agent.id].authMethods.length > 0 && <small>Native sign-in: {statuses[agent.id].authMethods.join(", ")}</small>}<small>Checked {new Date(statuses[agent.id].checkedAt).toLocaleTimeString()}</small></div>}
			</article>)}
			{!workspace.agents.length && <p className="task-muted">Connect an installed agent that supports the Agent Client Protocol.</p>}
			<form className="account-form" aria-label="Agent connection" onSubmit={event => { event.preventDefault(); void add(); }}><label>Name<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label><label>Executable<input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Path to an agent executable" required /></label><label>Arguments<input value={argumentsText} onChange={event => setArgumentsText(event.target.value)} required /></label><div className="account-form-actions"><button className="task-primary" type="submit" disabled={busy || !api}>{editing ? "Save agent" : "Connect agent"}</button>{editing && <button type="button" disabled={busy} onClick={reset}>Cancel</button>}</div></form>
		</section>
	</div>;
}
