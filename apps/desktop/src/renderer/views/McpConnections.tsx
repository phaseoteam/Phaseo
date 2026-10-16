import { useEffect, useRef, useState } from "react";
import { Globe, SquareTerminal } from "lucide-react";
import { ArgumentFields } from "../components/ArgumentFields";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import type { McpConnection } from "../../shared/mcp";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "../settings/SettingsLayout";

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

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
	async function save(connection: McpConnection, editor = false) { if (!api || savePending.current) return false; savePending.current = true; setBusy(true); (editor ? setEditorError : setError)(""); try { setWorkspace(await api.mcp({ type: "save", connection })); return true; } catch (reason) { (editor ? setEditorError : setError)(message(reason)); return false; } finally { savePending.current = false; setBusy(false); } }
	async function submit() {
		const common = { id: editing ?? crypto.randomUUID(), name, projectId: projectId || undefined, enabled };
		if (await save(transport === "stdio" ? { ...common, transport, executable, arguments: [...argumentsValue] } : { ...common, transport, url }, true)) reset();
	}
	function edit(connection: McpConnection) {
		setEditorError(""); setEditing(connection.id); setName(connection.name); setProjectId(connection.projectId ?? ""); setTransport(connection.transport); setEnabled(connection.enabled);
		setExecutable(connection.transport === "stdio" ? connection.executable : ""); setArgumentsValue(connection.transport === "stdio" ? [...connection.arguments] : []); setUrl(connection.transport === "http" ? connection.url : "");
	}
	const scope = (connection: McpConnection) => connection.projectId ? workspace.projects.find(project => project.id === connection.projectId)?.name ?? "Missing project" : "All projects";
	const visibleConnections = workspace.mcpConnections.filter(connection => Boolean(connection.archived) === archived);
	return <SettingsPageLayout title="MCP servers" description="Tools your Code and Plan chats can use, from Model Context Protocol servers. Phaseo, Codex, Claude Code, OpenCode and compatible ACP agents pick up changes on their next turn.">
		{error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
		<SettingsSection title={archived ? "Archived servers" : "Servers"} label="MCP servers"
			action={<SettingsButton variant="ghost" disabled={busy} onClick={() => { setArchived(value => !value); reset(); }}>{archived ? "Active servers" : "Archived servers"}</SettingsButton>}>
			{visibleConnections.map(connection => <article key={connection.id}>
				<SettingsRow icon={connection.transport === "stdio" ? <SquareTerminal /> : <Globe />} title={connection.name}
					description={<span className="flex min-w-0 items-center gap-1.5"><span className="shrink-0">{connection.transport === "stdio" ? "Local process" : "HTTP"} · {scope(connection)}</span><code className="min-w-0 truncate font-mono text-[11.5px]">{connection.transport === "stdio" ? [connection.executable, ...connection.arguments].join(" ") : connection.url}</code></span>}
					control={<>
						{!connection.archived && <Switch aria-label={`${connection.name} enabled`} checked={connection.enabled} disabled={busy} onCheckedChange={value => void save({ ...connection, enabled: value })} />}
						{!connection.archived && <SettingsButton variant="ghost" disabled={busy} onClick={() => edit(connection)}>Edit</SettingsButton>}
						<SettingsButton variant="ghost" disabled={busy} onClick={() => { reset(); void save({ ...connection, archived: !connection.archived, enabled: false }); }}>{connection.archived ? "Restore" : "Archive"}</SettingsButton>
					</>} />
			</article>)}
			{!visibleConnections.length && <SettingsNote>{archived ? "No archived servers." : "No servers yet. Add a local MCP server or an HTTP endpoint below."}</SettingsNote>}
		</SettingsSection>
		{!archived && <SettingsSection title={editing ? "Edit server" : "Add a server"} className="connection-editor">
			<form ref={form} aria-label="MCP connection" className="flex flex-col gap-3 p-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
				{editorError && <p className="text-xs text-destructive" role="alert">{editorError}</p>}
				<fieldset className="connection-fields flex flex-col gap-3" disabled={busy}>
					<div className="grid grid-cols-2 gap-3">
						<SettingsField label="Name"><input value={name} onChange={event => setName(event.target.value)} required maxLength={100} className={settingsInput} /></SettingsField>
						<SettingsField label="Available in"><Select label="MCP scope" value={projectId} onValueChange={setProjectId} options={[{ value: "", label: "All projects" }, ...workspace.projects.map(project => ({ value: project.id, label: project.name }))]} /></SettingsField>
						<SettingsField label="Transport"><Select label="MCP transport" value={transport} onValueChange={value => setTransport(value as "stdio" | "http")} options={[{ value: "stdio", label: "Local process" }, { value: "http", label: "HTTP" }]} /></SettingsField>
						{transport === "stdio"
							? <SettingsField label="Executable"><input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Absolute path to an executable" required className={settingsInput} /></SettingsField>
							: <SettingsField label="URL"><input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" required className={settingsInput} /></SettingsField>}
					</div>
					{transport === "stdio" && <ArgumentFields value={argumentsValue} onChange={setArgumentsValue} disabled={busy} />}
					<div className="account-form-actions flex items-center gap-2">
						<SettingsButton variant="primary" type="submit" disabled={busy || !api}>{busy ? "Saving…" : editing ? "Save server" : "Add server"}</SettingsButton>
						{editing && <SettingsButton variant="ghost" disabled={busy} onClick={reset}>Cancel</SettingsButton>}
						<label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground"><Switch aria-label="Turn on after saving" checked={enabled} disabled={busy} onCheckedChange={setEnabled} />Turn on</label>
					</div>
				</fieldset>
			</form>
		</SettingsSection>}
	</SettingsPageLayout>;
}
