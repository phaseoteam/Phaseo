import { useEffect, useState } from "react";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import type { McpConnection } from "../../shared/mcp";

export function McpConnections() {
	const api = window.phaseoDesktop?.workspace; const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [editing, setEditing] = useState<string>(); const [name, setName] = useState(""); const [projectId, setProjectId] = useState(""); const [transport, setTransport] = useState<"stdio" | "http">("stdio");
	const [executable, setExecutable] = useState(""); const [argumentsText, setArgumentsText] = useState("[]"); const [url, setUrl] = useState(""); const [enabled, setEnabled] = useState(true);
	const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [archived, setArchived] = useState(false);
	useEffect(() => { if (!api) return; let active = true; void api.overview().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); }); const unsubscribe = api.onOverviewChange(setWorkspace); return () => { active = false; unsubscribe(); }; }, [api]);
	function reset() { setEditing(undefined); setName(""); setProjectId(""); setTransport("stdio"); setExecutable(""); setArgumentsText("[]"); setUrl(""); setEnabled(true); }
	async function save(connection: McpConnection) { if (!api || busy) return false; setBusy(true); setError(""); try { setWorkspace(await api.mcp({ type: "save", connection })); return true; } catch (reason) { setError(String(reason)); return false; } finally { setBusy(false); } }
	async function submit() {
		let argumentsValue: unknown = []; try { if (transport === "stdio") { argumentsValue = JSON.parse(argumentsText); if (!Array.isArray(argumentsValue) || argumentsValue.some(value => typeof value !== "string")) throw new Error("Use a JSON array of arguments."); } } catch (reason) { setError(String(reason)); return; }
		const common = { id: editing ?? crypto.randomUUID(), name, projectId: projectId || undefined, enabled };
		if (await save(transport === "stdio" ? { ...common, transport, executable, arguments: argumentsValue as string[] } : { ...common, transport, url })) reset();
	}
	return <div className="page accounts-page"><h1>MCP connections</h1><p>Used by Codex, Claude, OpenCode and compatible ACP agents in Code and Plan mode. Changes apply on the next turn.</p>{error && <p className="task-error" role="alert">{error}</p>}
		<section className="panel"><div className="panel-heading"><h2>Connections</h2><button type="button" onClick={() => { setArchived(value => !value); reset(); }}>{archived ? "Active connections" : "Archived connections"}</button></div>
			{workspace.mcpConnections.filter(connection => Boolean(connection.archived) === archived).map(connection => <article className="account-row" key={connection.id}><div><strong>{connection.name}</strong><small>{connection.transport === "stdio" ? "Local process" : "HTTP"} · {connection.projectId ? workspace.projects.find(project => project.id === connection.projectId)?.name ?? "Missing project" : "All projects"} · {connection.enabled && !connection.archived ? "Enabled" : "Disabled"}</small></div>
				{!connection.archived && <button type="button" disabled={busy} onClick={() => void save({ ...connection, enabled: !connection.enabled })}>{connection.enabled ? "Disable" : "Enable"}</button>}
				{!connection.archived && <button type="button" disabled={busy} onClick={() => { setEditing(connection.id); setName(connection.name); setProjectId(connection.projectId ?? ""); setTransport(connection.transport); setEnabled(connection.enabled); setExecutable(connection.transport === "stdio" ? connection.executable : ""); setArgumentsText(connection.transport === "stdio" ? JSON.stringify(connection.arguments) : "[]"); setUrl(connection.transport === "http" ? connection.url : ""); }}>Edit</button>}
				<button type="button" disabled={busy} onClick={() => { reset(); void save({ ...connection, archived: !connection.archived, enabled: false }); }}>{connection.archived ? "Restore" : "Archive"}</button></article>)}
			{!workspace.mcpConnections.length && <p className="task-muted">Add a local MCP server or an HTTP endpoint.</p>}
			{!archived && <form className="account-form" aria-label="MCP connection" onSubmit={event => { event.preventDefault(); void submit(); }}>
				<label>Name<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label><label>Scope<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">All projects</option>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
				<label>Transport<select value={transport} onChange={event => setTransport(event.target.value as "stdio" | "http")}><option value="stdio">Local process</option><option value="http">HTTP</option></select></label>
				{transport === "stdio" ? <><label>Executable<input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Absolute path to an executable" required /></label><label>Arguments<input value={argumentsText} onChange={event => setArgumentsText(event.target.value)} required /></label></> : <label>URL<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" required /></label>}
				<label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enabled</label><div className="account-form-actions"><button className="task-primary" type="submit" disabled={busy || !api}>{editing ? "Save connection" : "Add connection"}</button>{editing && <button type="button" disabled={busy} onClick={reset}>Cancel</button>}</div>
			</form>}
		</section>
	</div>;
}
