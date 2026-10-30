import { formatTime } from "@phaseo/app-kit/format";
import { ArgumentFields } from "../components/ArgumentFields";
import { useEffect, useRef, useState } from "react";
import type { AgentStatus, HarnessInstallation } from "../../shared/workspace";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { useBackgroundRefresh } from "../lib/useBackgroundRefresh";
import { Bot, RotateCw } from "lucide-react";
import { cn } from "../lib/utils";
import { HarnessLogo } from "../components/HarnessLogo";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "../settings/SettingsLayout";

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
	const updatePending = useRef(false);
	const [updating, setUpdating] = useState<HarnessInstallation["harness"]>();
	const [updateFeedback, setUpdateFeedback] = useState<{ error: boolean; text: string }>();
	const [editorError, setEditorError] = useState("");
	useEffect(() => {
		if (!api) return; let active = true;
		void api.harnessUpdateStatus().then(value => { if (active && !updatePending.current) setUpdating(value); }, () => {});
		return () => { active = false; };
	}, [api]);
	useEffect(() => {
		if (!api || !updating) return; let active = true, pending = false;
		const timer = setInterval(() => {
			if (pending || updatePending.current) return; pending = true;
			void api.harnessUpdateStatus().then(value => {
				if (!active) return; setUpdating(value);
				if (!value) { setUpdateFeedback({ error: false, text: "Update ended. Check the installed version." }); refreshInstallations(); }
			}, () => {}).finally(() => { pending = false; });
		}, 1_000);
		return () => { active = false; clearInterval(timer); };
	}, [api, updating]);
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
		if (!api || installationPending.current || updatePending.current) return;
		installationPending.current = true; setRefreshing(true); setInstallationRequest(value => value + 1);
	}
	useBackgroundRefresh(refreshInstallations);
	async function updateHarness(harness: "codex" | "claude" | "pi") {
		if (!api || updatePending.current || installationPending.current || updating) return;
		updatePending.current = true; setUpdating(harness); setUpdateFeedback(undefined);
		try { await api.updateHarness(harness); setUpdateFeedback({ error: false, text: "Update completed." }); }
		catch (reason) { setUpdateFeedback({ error: true, text: (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") }); }
		finally { updatePending.current = false; setUpdating(undefined); refreshInstallations(); }
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
	const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
	return <SettingsPageLayout title="Agents" description="Coding agents installed on this computer, and any agent that speaks the Agent Client Protocol.">
		{error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
		{/* The class names are hooks for the harness maintenance smoke. */}
		<section className="native-harness-panel flex flex-col gap-2.5" aria-label="Installed agents" aria-busy={refreshing || Boolean(updating)}>
			<div className="flex items-end gap-3 px-0.5">
				<div className="min-w-0 flex-1"><h2 className="text-[13.5px] font-bold">Installed agents</h2><p className="mt-0.5 text-xs text-muted-foreground">Updates apply to every account that uses the agent. Usage limits are under Usage & limits.</p></div>
				{updating ? <SettingsButton disabled={!api} onClick={() => void api?.cancelHarnessUpdate().catch(reason => setUpdateFeedback({ error: true, text: message(reason) }))}>Cancel update</SettingsButton>
					: <SettingsButton variant="ghost" disabled={refreshing} onClick={refreshInstallations}><RotateCw className={refreshing ? "animate-spin" : undefined} />{refreshing ? "Checking…" : "Check again"}</SettingsButton>}
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-card/60">
				{refreshing && !installed.length && <SettingsNote className="harness-feedback" role="status">Checking installed agents…</SettingsNote>}
				{installationError && <SettingsNote className="harness-feedback" tone="error" role="alert">{installationError}</SettingsNote>}
				{!refreshing && !installationError && !installed.length && <SettingsNote className="harness-feedback">No coding agents found on this computer.</SettingsNote>}
				{updateFeedback && <SettingsNote className="harness-feedback" tone={updateFeedback.error ? "error" : "muted"} role={updateFeedback.error ? "alert" : "status"}>{updateFeedback.text}</SettingsNote>}
				{installed.length > 0 && <ul className="harness-list flex flex-col divide-y divide-border">{installed.map(value => <li key={value.harness}>
					<SettingsRow icon={<HarnessLogo harness={value.harness} />}
						title={<span className="flex items-center gap-2"><strong className="font-semibold">{harnessNames[value.harness] ?? value.harness}</strong><span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold", value.installed ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{value.installed ? "Installed" : "Unavailable"}</span></span>}
						description={value.version ? `${value.version}${value.maintenance && value.maintenance.method !== "manual" ? ` · ${value.maintenance.method === "npm" ? "npm" : "Native installer"}` : ""}` : value.installed ? "Version unknown" : "Not found on this computer"}
						control={value.maintenance?.canUpdate ? <SettingsButton disabled={refreshing || Boolean(updating)} onClick={() => { if (value.harness === "codex" || value.harness === "claude" || value.harness === "pi") void updateHarness(value.harness); }}>{updating === value.harness ? "Updating…" : "Update"}</SettingsButton>
							: value.maintenance ? <span className="text-xs text-muted-foreground">Update with your installer</span> : undefined}>
						{!value.installed && value.error && <details className="-mt-1.5 ml-11 text-xs text-muted-foreground"><summary className="w-fit hover:text-foreground">Installation details</summary><p data-selectable className="mt-1.5 ml-5 font-normal leading-relaxed whitespace-pre-wrap text-foreground/80">{value.error}</p></details>}
					</SettingsRow>
				</li>)}</ul>}
			</div>
		</section>
		<SettingsSection title="ACP agents" description="Connect an installed agent that supports the Agent Client Protocol." label="ACP agents"
			action={<SettingsButton variant="ghost" disabled={busy} onClick={() => { setShowArchived(value => !value); reset(); }}>{showArchived ? "Active agents" : "Archived agents"}</SettingsButton>}>
			{visibleAgents.map(agent => <article key={agent.id}>
				<SettingsRow icon={<Bot />} title={agent.name} description={<code className="font-mono text-[11.5px]">{agent.executable} {agent.arguments.join(" ")}</code>}
					control={<>
						<SettingsButton disabled={!!checking} onClick={() => void check(agent.id)}>{checking === agent.id ? "Checking…" : "Check connection"}</SettingsButton>
						<SettingsButton variant="ghost" disabled={busy || checking === agent.id} onClick={() => { setEditorError(""); setEditing(agent.id); setName(agent.name); setExecutable(agent.executable); setArgumentsValue([...agent.arguments]); }}>Edit</SettingsButton>
						<SettingsButton variant="ghost" disabled={busy || checking === agent.id} onClick={() => { if (!api) return; reset(); void api.command({ type: "update-agent", id: agent.id, archived: !agent.archived }).then(setWorkspace, reason => setError(message(reason))); }}>{agent.archived ? "Restore" : "Archive"}</SettingsButton>
					</>}>
					{statuses[agent.id] && <div className="account-status rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
						<p className="text-foreground">Connected to {statuses[agent.id].name ?? agent.name}{statuses[agent.id].version ? ` · ${statuses[agent.id].version}` : ""}</p>
						<p>Capabilities: {statuses[agent.id].capabilities.join(", ") || "Basic ACP"}</p>
						{statuses[agent.id].authMethods.length > 0 && <p>Sign-in: {statuses[agent.id].authMethods.join(", ")}</p>}
						<p>Checked {formatTime(statuses[agent.id].checkedAt, { includeSeconds: true })}</p>
					</div>}
				</SettingsRow>
			</article>)}
			{!visibleAgents.length && <SettingsNote>{showArchived ? "No archived agents." : "No ACP agents connected yet."}</SettingsNote>}
		</SettingsSection>
		<SettingsSection title={editing ? "Edit agent" : "Connect an agent"} className="connection-editor">
			<form ref={form} aria-label="Agent connection" className="flex flex-col gap-3 p-4" onSubmit={event => { event.preventDefault(); void add(); }}>
				{editorError && <p className="text-xs text-destructive" role="alert">{editorError}</p>}
				<fieldset className="connection-fields flex flex-col gap-3" disabled={busy}>
					<div className="grid grid-cols-2 gap-3">
						<SettingsField label="Name"><input value={name} onChange={event => setName(event.target.value)} required maxLength={100} className={settingsInput} /></SettingsField>
						<SettingsField label="Executable"><input value={executable} onChange={event => setExecutable(event.target.value)} placeholder="Path to an agent executable" required className={settingsInput} /></SettingsField>
					</div>
					<ArgumentFields value={argumentsValue} onChange={setArgumentsValue} disabled={busy} />
					<div className="account-form-actions flex gap-2">
						<SettingsButton variant="primary" type="submit" disabled={busy || !api}>{busy ? "Saving…" : editing ? "Save agent" : "Connect agent"}</SettingsButton>
						{editing && <SettingsButton variant="ghost" disabled={busy} onClick={reset}>Cancel</SettingsButton>}
					</div>
				</fieldset>
			</form>
		</SettingsSection>
	</SettingsPageLayout>;
}
