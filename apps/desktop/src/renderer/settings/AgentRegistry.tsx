import { useEffect, useMemo, useState } from "react";
import { Bot, RotateCw, Search } from "lucide-react";
import { launchLabel, type AcpRegistryAgent, type AcpRegistryLaunch } from "../../shared/acpRegistry";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { errorText } from "../app/workspace";
import { Select } from "../components/Select";
import { cn } from "../lib/utils";
import { SettingsButton, SettingsNote, SettingsSection, settingsInput } from "./SettingsLayout";

function RegistryRow({ agent, added, onAdd }: { agent: AcpRegistryAgent; added: boolean; onAdd: (kind: AcpRegistryLaunch["kind"]) => Promise<void> }) {
	const [kind, setKind] = useState(agent.launches[0].kind);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState("");
	const [iconFailed, setIconFailed] = useState(false);
	const add = async () => { setBusy(true); setFailed(""); try { await onAdd(kind); } catch (reason) { setFailed(errorText(reason)); } finally { setBusy(false); } };
	return <li data-registry-agent={agent.id} className="flex flex-col gap-1.5 border-t border-border/60 px-4 py-3 first:border-t-0">
		<div className="flex items-start gap-3">
			<span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
				{agent.icon && !iconFailed ? <img src={agent.icon} alt="" referrerPolicy="no-referrer" onError={() => setIconFailed(true)} className="size-4 dark:invert" /> : <Bot className="size-4" />}
			</span>
			<div className="min-w-0 flex-1">
				<p className="flex min-w-0 items-baseline gap-2 text-[13px]"><span className="truncate font-semibold">{agent.name}</span><span className="shrink-0 font-mono text-[11px] text-muted-foreground">{agent.version}</span></p>
				{agent.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>}
				<p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[agent.authors.join(", "), agent.license].filter(Boolean).join(" · ")}</p>
			</div>
			<div className="flex shrink-0 items-center gap-1.5">
				{agent.launches.length > 1 && <Select label={`How to run ${agent.name}`} value={kind} onValueChange={value => setKind(value as AcpRegistryLaunch["kind"])} options={agent.launches.map(launch => ({ value: launch.kind, label: launchLabel(launch) }))} />}
				<SettingsButton disabled={busy || added} onClick={() => void add()} title={agent.launches.length === 1 ? launchLabel(agent.launches[0]) : undefined}>{added ? "Added" : busy ? (kind === "binary" ? "Downloading…" : "Adding…") : "Add"}</SettingsButton>
			</div>
		</div>
		{failed && <p role="alert" className="ml-10 text-xs text-destructive">{failed}</p>}
	</li>;
}

/**
 * The public Agent Client Protocol registry, searchable: adding an agent connects it like any ACP agent, started by its
 * downloaded binary or by npx or uvx at the exact version the registry lists.
 */
export function AgentRegistry({ connected, onAdded }: { connected: string[]; onAdded: (workspace: WorkspaceOverview) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const [agents, setAgents] = useState<AcpRegistryAgent[]>();
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(false);
	const load = (fresh = false) => { if (!api) return; setLoading(true); setError(""); void api.acpRegistry(fresh).then(setAgents, reason => setError(errorText(reason))).finally(() => setLoading(false)); };
	useEffect(() => { load(); }, []);
	const shown = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (agents ?? []).filter(agent => !needle || `${agent.name} ${agent.id} ${agent.description} ${agent.authors.join(" ")}`.toLowerCase().includes(needle));
	}, [agents, query]);
	return <SettingsSection title="Find an agent" label="Agent registry" description="Agents from the public Agent Client Protocol registry that run on this computer. Each is added at the exact version listed."
		action={<SettingsButton variant="ghost" disabled={loading} onClick={() => load(true)}><RotateCw className={cn("size-3.5", loading && "animate-spin")} />Refresh</SettingsButton>}>
		<div className="px-4 pt-3 pb-2"><label className="relative block"><Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<input type="search" aria-label="Search the agent registry" placeholder="Search agents" value={query} onChange={event => setQuery(event.target.value)} className={cn(settingsInput, "pl-8")} /></label></div>
		{error ? <SettingsNote>{error}</SettingsNote>
			: !agents ? <SettingsNote>Reading the registry…</SettingsNote>
			: !shown.length ? <SettingsNote>No agent in the registry matches.</SettingsNote>
			: <ul className="max-h-[28rem] overflow-y-auto">{shown.map(agent => <RegistryRow key={agent.id} agent={agent} added={connected.includes(agent.name)}
				onAdd={async kind => { if (!api) return; onAdded(await api.addRegistryAgent(agent.id, kind)); }} />)}</ul>}
	</SettingsSection>;
}
