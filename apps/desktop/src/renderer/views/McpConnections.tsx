import { useEffect, useRef, useState } from "react";
import { Globe, Plus, SquareTerminal, X } from "lucide-react";
import { ArgumentFields } from "../components/ArgumentFields";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { maximumMcpHeaders, type McpConnection } from "../../shared/mcp";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "../settings/SettingsLayout";

/** A header row: `saved` rows have a value in the vault that is never sent here; typing one replaces it. */
export type HeaderRow = { name: string; value: string; saved: boolean };
const rowInput = "h-8 min-w-0 flex-1 rounded-lg border border-input bg-background/40 px-2.5 font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20";
const headerCount = (connection: McpConnection) => connection.transport === "http" && connection.secretHeaders?.length ? ` · ${connection.secretHeaders.length} ${connection.secretHeaders.length === 1 ? "header" : "headers"}` : "";

/** HTTP headers such as Authorization. Values are stored encrypted on this device and are not shown again. */
export function HeaderFields({ value, onChange }: { value: HeaderRow[]; onChange: (value: HeaderRow[]) => void }) {
	const update = (index: number, change: Partial<HeaderRow>) => onChange(value.map((row, position) => position === index ? { ...row, ...change } : row));
	return <fieldset className="header-fields flex min-w-0 flex-col gap-1.5">
		<legend className="mb-1.5 text-xs font-medium text-muted-foreground">Headers <span className="font-normal">· values are stored encrypted on this device and not shown again</span></legend>
		{value.map((row, index) => <div className="header-row flex items-center gap-1.5" key={index}>
			{row.saved
				? <code className="flex h-8 min-w-0 flex-1 items-center truncate px-2.5 font-mono text-[12.5px] text-foreground" aria-label={`Header ${index + 1} name`}>{row.name}</code>
				: <input aria-label={`Header ${index + 1} name`} value={row.name} maxLength={100} placeholder="Authorization" required spellCheck={false} onChange={event => update(index, { name: event.target.value })} className={rowInput} />}
			<input aria-label={`${row.name || `Header ${index + 1}`} value`} type="password" autoComplete="off" spellCheck={false} value={row.value} maxLength={8000} required={!row.saved} placeholder={row.saved ? "Saved · type to replace" : "Bearer …"} onChange={event => update(index, { value: event.target.value })} className={rowInput} />
			<button type="button" aria-label={`Remove header ${row.name || index + 1}`} title="Remove header" onClick={() => onChange(value.filter((_, position) => position !== index))}
				className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="size-3.5" /></button>
		</div>)}
		<button className="add-header -ml-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" type="button" disabled={value.length >= maximumMcpHeaders}
			onClick={() => onChange([...value, { name: "", value: "", saved: false }])}><Plus className="size-3.5" />Add header</button>
	</fieldset>;
}

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

export function McpConnections() {
	const api = window.phaseoDesktop?.workspace; const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [editing, setEditing] = useState<string>(); const [name, setName] = useState(""); const [projectId, setProjectId] = useState(""); const [transport, setTransport] = useState<"stdio" | "http">("stdio");
	const [executable, setExecutable] = useState(""); const [argumentsValue, setArgumentsValue] = useState<string[]>([]); const [url, setUrl] = useState(""); const [headers, setHeaders] = useState<HeaderRow[]>([]); const [enabled, setEnabled] = useState(true);
	const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [archived, setArchived] = useState(false);
	const [editorError, setEditorError] = useState("");
	const savePending = useRef(false); const form = useRef<HTMLFormElement>(null);
	useEffect(() => { if (editing) { form.current?.closest(".connection-editor")?.scrollIntoView({ block: "nearest" }); form.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); } }, [editing]);
	useEffect(() => { if (!api) return; let active = true; void api.overview().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); }); const unsubscribe = api.onOverviewChange(setWorkspace); return () => { active = false; unsubscribe(); }; }, [api]);
	function reset() { setEditorError(""); setEditing(undefined); setName(""); setProjectId(""); setTransport("stdio"); setExecutable(""); setArgumentsValue([]); setUrl(""); setHeaders([]); setEnabled(true); }
	async function save(connection: McpConnection, editor = false, values?: Record<string, string>) { if (!api || savePending.current) return false; savePending.current = true; setBusy(true); (editor ? setEditorError : setError)(""); try { setWorkspace(await api.mcp({ type: "save", connection, ...(values && Object.keys(values).length ? { headers: values } : {}) })); return true; } catch (reason) { (editor ? setEditorError : setError)(message(reason)); return false; } finally { savePending.current = false; setBusy(false); } }
	async function submit() {
		const common = { id: editing ?? crypto.randomUUID(), name, projectId: projectId || undefined, enabled };
		// Only typed values travel; a saved row left empty keeps its value in main.
		const named = headers.map(row => ({ ...row, name: row.name.trim() })), values = Object.fromEntries(named.filter(row => row.value).map(row => [row.name, row.value]));
		if (await save(transport === "stdio" ? { ...common, transport, executable, arguments: [...argumentsValue] } : { ...common, transport, url, ...(named.length ? { secretHeaders: named.map(row => row.name) } : {}) }, true, transport === "http" ? values : undefined)) reset();
	}
	function edit(connection: McpConnection) {
		setEditorError(""); setEditing(connection.id); setName(connection.name); setProjectId(connection.projectId ?? ""); setTransport(connection.transport); setEnabled(connection.enabled);
		setExecutable(connection.transport === "stdio" ? connection.executable : ""); setArgumentsValue(connection.transport === "stdio" ? [...connection.arguments] : []); setUrl(connection.transport === "http" ? connection.url : "");
		setHeaders(connection.transport === "http" ? (connection.secretHeaders ?? []).map(name => ({ name, value: "", saved: true })) : []);
	}
	const scope = (connection: McpConnection) => connection.projectId ? workspace.projects.find(project => project.id === connection.projectId)?.name ?? "Missing project" : "All projects";
	const visibleConnections = workspace.mcpConnections.filter(connection => Boolean(connection.archived) === archived);
	return <SettingsPageLayout title="MCP servers" description="Tools your Code and Plan chats can use, from Model Context Protocol servers. Phaseo, Codex, Claude Code, OpenCode and compatible ACP agents pick up changes on their next turn.">
		{error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
		<SettingsSection title={archived ? "Archived servers" : "Servers"} label="MCP servers"
			action={<SettingsButton variant="ghost" disabled={busy} onClick={() => { setArchived(value => !value); reset(); }}>{archived ? "Active servers" : "Archived servers"}</SettingsButton>}>
			{visibleConnections.map(connection => <article key={connection.id}>
				<SettingsRow icon={connection.transport === "stdio" ? <SquareTerminal /> : <Globe />} title={connection.name}
					description={<span className="flex min-w-0 items-center gap-1.5"><span className="shrink-0">{connection.transport === "stdio" ? "Local process" : "HTTP"} · {scope(connection)}{headerCount(connection)}</span><code className="min-w-0 truncate font-mono text-[11.5px]">{connection.transport === "stdio" ? [connection.executable, ...connection.arguments].join(" ") : connection.url}</code></span>}
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
					{transport === "stdio" ? <ArgumentFields value={argumentsValue} onChange={setArgumentsValue} disabled={busy} /> : <HeaderFields value={headers} onChange={setHeaders} />}
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
