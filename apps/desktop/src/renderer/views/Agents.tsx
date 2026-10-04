import { ArgumentFields } from "../components/ArgumentFields";
import { useEffect, useRef, useState } from "react";
import type { AgentStatus, HarnessInstallation } from "../../shared/workspace";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";

const harnessNames: Partial<Record<HarnessInstallation["harness"], string>> = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok" };

export function Agents() {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [installed, setInstalled] = useState<HarnessInstallation[]>([]);
	const [name, setName] = useState(""); const [executable, setExecutable] = useState(""); const [argumentsValue, setArgumentsValue] = useState<string[]>([]);
	const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<string>(); const [showArchived, setShowArchived] = useState(false); const [checking, setChecking] = useState<string>();
	const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({}); const [refreshing, setRefreshing] = useState(true);
	const [installationError, setInstallationError] = useState(""); const [installationRequest, setInstallationRequest] = useState(0);
	const installationPending = useRef(true);
	const [editorError, setEditorError] = useState("");
	const savePending = useRef(false); const form = useRef<HTMLFormElement>(null);
	useEffect(() => { if (editing) { form.current?.closest(".connection-editor")?.scrollIntoView({ block: "nearest" }); form.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); } }, [editing]);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onOverviewChange(setWorkspace); return () => { active = false; unsubscribe(); };
	}, [api]);
	useEffect(() => {
		if (!api) { installationPending.current = false; setRefreshing(false); setInstallationError("Open the desktop application to check native harnesses."); return; }
		let active = true; installationPending.current = true; setRefreshing(true); setInstallationError("");
		void api.installations().then(value => { if (active) setInstalled(value); }, reason => { if (active) setInstallationError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); }).finally(() => { if (active) { installationPending.current = false; setRefreshing(false); } });
		return () => { active = false; };
	}, [api, installationRequest]);
	function refreshInstallations() {
		if (!api || installationPending.current) return;
		installationPending.current = true; setRefreshing(true); setInstallationRequest(value => value + 1);
	}
	async function add() {
		if (!api || savePending.current) return; savePending.current = true; setBusy(true); setEditorError("");
		try { setWorkspace(await api.command({ ...(editing ? { type: "update-agent" as const, id: editing } : { type: "add-agent" as const }), name, executable, arguments: [...argumentsValue] })); if (editing) setStatuses(current => { const next = { ...current }; delete next[editing]; return next; }); reset(); }
		catch (reason) { setEditorError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } finally { savePending.current = false; setBusy(false); }
	}
	function reset() { setEditorError(""); setEditing(undefined); setName(""); setExecutable(""); setArgumentsValue([]); }
	async function check(id: string) {
		if (!api || checking) return; setChecking(id); setError("");
		try { const status = await api.checkAgent(id); setStatuses(current => ({ ...current, [id]: status })); }
		catch (reason) { setError(String(reason)); } finally { setChecking(undefined); }
	}
	const visibleAgents = workspace.agents.filter(agent => Boolean(agent.archived) === showArchived);
	return <div className="page accounts-page"><h1>Agents</h1>{error && <p className="task-error" role="alert">{error}</p>}
		<section className="panel native-harness-panel" aria-busy={refreshing}><div className="panel-heading"><h2>Native harnesses</h2><button type="button" disabled={refreshing || !api} onClick={refreshInstallations}>{refreshing ? "Checking…" : installationError ? "Retry" : "Refresh"}</button></div>
			{refreshing && <p className="harness-feedback" role="status">Checking native installations…</p>}
			{installationError && <p className="harness-feedback task-error" role="alert">{installationError}</p>}
			{!refreshing && !installationError && !installed.length && <p className="harness-feedback">No native harnesses found.</p>}
			{installed.length > 0 && <ul className="harness-list">{installed.map(value => <li key={value.harness}><div className="harness-heading"><strong>{harnessNames[value.harness] ?? value.harness}</strong><span className="status-pill">{value.installed ? "Installed" : "Unavailable"}</span></div>{value.version && <p>{value.version}</p>}{!value.installed && value.error && <details><summary>Installation details</summary><p>{value.error}</p></details>}</li>)}</ul>}
		</section>
		<section className="panel"><div className="panel-heading"><h2>ACP agents</h2><button type="button" disabled={busy} onClick={() => { setShowArchived(value => !value); reset(); }}>{showArchived ? "Active agents" : "Archived agents"}</button></div>
			{visibleAgents.map(agent => <article key={agent.id}><div className="account-row"><div><strong>{agent.name}</strong><details className="agent-command"><summary>Command</summary><code>{agent.executable} {agent.arguments.join(" ")}</code></details></div><button type="button" disabled={!!checking} onClick={() => void check(agent.id)}>{checking === agent.id ? "Checking…" : "Check connection"}</button><button type="button" disabled={busy || checking === agent.id} onClick={() => { setEditorError(""); setEditing(agent.id); setName(agent.name); setExecutable(agent.executable); setArgumentsValue([...agent.arguments]); }}>Edit</button><button type="button" disabled={busy || checking === agent.id} onClick={() => { if (!api) return; reset(); void api.command({ type: "update-agent", id: agent.id, archived: !agent.archived }).then(setWorkspace, reason => setError(String(reason))); }}>{agent.archived ? "Restore" : "Archive"}</button></div>
				{statuses[agent.id] && <div className="account-status"><p>Connected to {statuses[agent.id].name ?? agent.name}{statuses[agent.id].version ? ` · ${statuses[agent.id].version}` : ""}</p><p>Native capabilities: {statuses[agent.id].capabilities.join(", ") || "Basic ACP"}</p>{statuses[agent.id].authMethods.length > 0 && <small>Native sign-in: {statuses[agent.id].authMethods.join(", ")}</small>}<small>Checked {new Date(statuses[agent.id].checkedAt).toLocaleTimeString()}</small></div>}
			</article>)}
			{!visibleAgents.length && <p className="task-muted">{showArchived ? "No archived agents." : "Connect an installed agent that supports the Agent Client Protocol."}</p>}
		</section>
		<section className="panel connection-editor"><div className="panel-heading"><h2>{editing ? "Edit agent" : "New agent"}</h2></div>
			{editorError && <p className="task-error" role="alert">{editorError}</p>}
			<form ref={form} aria-label="Agent connection" onSubmit={event => { event.preventDefault(); void add(); }}><fieldset className="account-form connection-fields" disabled={busy}><label>Name<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label><label>Executable<input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Path to an agent executable" required /></label><ArgumentFields value={argumentsValue} onChange={setArgumentsValue} disabled={busy} /><div className="account-form-actions"><button className="task-primary" type="submit" disabled={busy || !api}>{busy ? "Saving…" : editing ? "Save agent" : "Connect agent"}</button>{editing && <button type="button" disabled={busy} onClick={reset}>Cancel</button>}</div></fieldset></form>
		</section>
	</div>;
}
