import { ArgumentFields } from "../components/ArgumentFields";
import { Select } from "../components/Select";
import { useEffect, useRef, useState } from "react";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import type { McpConnection } from "../../shared/mcp";

export function McpConnections() {
	const api = window.phaseoDesktop?.workspace; const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [editing, setEditing] = useState<string>(); const [name, setName] = useState(""); const [projectId, setProjectId] = useState(""); const [transport, setTransport] = useState<"stdio" | "http">("stdio");
	const [executable, setExecutable] = useState(""); const [argumentsValue, setArgumentsValue] = useState<string[]>([]); const [url, setUrl] = useState(""); const [enabled, setEnabled] = useState(true);
	const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [archived, setArchived] = useState(false);
	const [editorError, setEditorError] = useState("");
	const savePending = useRef(false); const form = useRef<HTMLFormElement>(null);
	useEffect(() => { if (editing) { form.current?.closest(".connection-editor")?.scrollIntoView({ block: "nearest" }); form.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); } }, [editing]);
	useEffect(() => { if (!api) return; let active = true; void api.overview().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); }); const unsubscribe = api.onOverviewChange(setWorkspace); return () => { active = false; unsubscribe(); }; }, [api]);
	function reset() { setEditorError(""); setEditing(undefined); setName(""); setProjectId(""); setTransport("stdio"); setExecutable(""); setArgumentsValue([]); setUrl(""); setEnabled(true); }
	async function save(connection: McpConnection, editor = false) { if (!api || savePending.current) return false; savePending.current = true; setBusy(true); (editor ? setEditorError : setError)(""); try { setWorkspace(await api.mcp({ type: "save", connection })); return true; } catch (reason) { (editor ? setEditorError : setError)((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); return false; } finally { savePending.current = false; setBusy(false); } }
	async function submit() {
		const common = { id: editing ?? crypto.randomUUID(), name, projectId: projectId || undefined, enabled };
		if (await save(transport === "stdio" ? { ...common, transport, executable, arguments: [...argumentsValue] } : { ...common, transport, url }, true)) reset();
	}
	const visibleConnections = workspace.mcpConnections.filter(connection => Boolean(connection.archived) === archived);
	return <div className="page accounts-page"><h1>MCP connections</h1><p>Used by Phaseo, Codex, Claude, OpenCode and compatible ACP agents in Code and Plan mode. Changes apply on the next turn.</p>{error && <p className="task-error" role="alert">{error}</p>}
		<section className="panel"><div className="panel-heading"><h2>Connections</h2><button type="button" disabled={busy} onClick={() => { setArchived(value => !value); reset(); }}>{archived ? "Active connections" : "Archived connections"}</button></div>
			{visibleConnections.map(connection => <article className="account-row" key={connection.id}><div><strong>{connection.name}</strong><small>{connection.transport === "stdio" ? "Local process" : "HTTP"} · {connection.projectId ? workspace.projects.find(project => project.id === connection.projectId)?.name ?? "Missing project" : "All projects"} · {connection.enabled && !connection.archived ? "Enabled" : "Disabled"}</small></div>
				{!connection.archived && <button type="button" disabled={busy} onClick={() => void save({ ...connection, enabled: !connection.enabled })}>{connection.enabled ? "Disable" : "Enable"}</button>}
				{!connection.archived && <button type="button" disabled={busy} onClick={() => { setEditorError(""); setEditing(connection.id); setName(connection.name); setProjectId(connection.projectId ?? ""); setTransport(connection.transport); setEnabled(connection.enabled); setExecutable(connection.transport === "stdio" ? connection.executable : ""); setArgumentsValue(connection.transport === "stdio" ? [...connection.arguments] : []); setUrl(connection.transport === "http" ? connection.url : ""); }}>Edit</button>}
				<button type="button" disabled={busy} onClick={() => { reset(); void save({ ...connection, archived: !connection.archived, enabled: false }); }}>{connection.archived ? "Restore" : "Archive"}</button></article>)}
			{!visibleConnections.length && <p className="task-muted">{archived ? "No archived connections." : "Add a local MCP server or an HTTP endpoint."}</p>}
		</section>
		{!archived && <section className="panel connection-editor"><div className="panel-heading"><h2>{editing ? "Edit connection" : "New connection"}</h2></div>
			{editorError && <p className="task-error" role="alert">{editorError}</p>}
			<form ref={form} aria-label="MCP connection" onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset className="account-form connection-fields" disabled={busy}>
				<label>Name<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label><label>Scope<Select label="MCP scope" value={projectId} onValueChange={setProjectId} options={[{ value: "", label: "All projects" }, ...workspace.projects.map(project => ({ value: project.id, label: project.name }))]} /></label>
				<label>Transport<Select label="MCP transport" value={transport} onValueChange={value => setTransport(value as "stdio" | "http")} options={[{ value: "stdio", label: "Local process" }, { value: "http", label: "HTTP" }]} /></label>
				{transport === "stdio" ? <><label>Executable<input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Absolute path to an executable" required /></label><ArgumentFields value={argumentsValue} onChange={setArgumentsValue} disabled={busy} /></> : <label>URL<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" required /></label>}
				<label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enabled</label><div className="account-form-actions"><button className="task-primary" type="submit" disabled={busy || !api}>{busy ? "Saving…" : editing ? "Save connection" : "Add connection"}</button>{editing && <button type="button" disabled={busy} onClick={reset}>Cancel</button>}</div>
			</fieldset></form>
		</section>}
	</div>;
}
