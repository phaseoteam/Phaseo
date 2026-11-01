import { useEffect, useMemo, useState } from "react";
import { Monitor, Plus, RotateCw, Server } from "lucide-react";
import type { ImportableHub, UsageHub, UsageHubSnapshot } from "../../shared/usageHubs";
import type { UsageFolder } from "../../shared/usageLedger";
import { HarnessLogo } from "../components/HarnessLogo";
import { errorText, useWorkspace } from "../app/workspace";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";
import { usagePools, type UsageProvider } from "./usagePools";
import { ProviderPoolSection } from "./UsageLimits";
import { checkAllUsage, checkUsageHub, refreshUsageIfStale, setImportableHubs, setUsageError, setUsageHubs, usageAccounts, usageChecking, usageLocals, useUsageLimits, type UsageLocal as Local, type UsageResult as Result } from "./usageLimitsStore";

const names: Record<UsageProvider, string> = { codex: "Codex", claude: "Claude Code", cursor: "Cursor", grok: "Grok" };

/** Checks every login and hub on opening unless the rings checked them in the last five minutes; each check starts an agent or calls a hub. */
function useUsageChecks() {
	const { api, overview } = useWorkspace();
	const locals = useMemo(() => usageLocals(overview.accounts), [overview.accounts]);
	const limits = useUsageLimits();
	const checkAll = () => { if (api) void checkAllUsage(api, locals); };
	const keys = locals.map(local => local.key).join("|");
	useEffect(() => { if (api) refreshUsageIfStale(api, locals, 5 * 60_000); }, [keys, api]);
	return { api, locals, limits, checkAll, busy: usageChecking(limits) };
}

/**
 * Limits pooled per provider across every account Phaseo can read: logins on this
 * computer, accounts added here, and accounts on usage hubs. The readings are shared with the sidebar's rings.
 */
export function UsageLimitsPanel() {
	const { api, locals, limits, checkAll, busy } = useUsageChecks();
	const { statuses, hubs, snapshots } = limits;
	const { openSettings } = useWorkspace();
	const pools = usagePools(usageAccounts(locals, limits));
	// Limits nobody could read, said once at the top rather than repeated per account. A login whose plan has no limits
	// (Claude Code signed in with a key while a hub holds the subscriptions) isn't a failure once something else covers
	// that provider.
	const unread: string[] = [
		...locals.flatMap((local): string[] => { const status = statuses[local.key]; if (!status || status === "checking") return []; return "error" in status ? [`${local.title}: ${status.error}`] : status.usageError && status.authenticated && !(status.noPlanLimits && pools.some(pool => pool.provider === local.harness)) ? [`${local.title}: ${status.usageError}`] : []; }),
		...hubs.flatMap(hub => { const snapshot = snapshots[hub.id]; return snapshot && snapshot !== "checking" ? [...snapshot.error ? [`${hub.label}: ${snapshot.error}`] : [], ...snapshot.accounts.filter(account => account.status.usageError).length ? [`${hub.label}: ${snapshot.accounts.filter(account => account.status.usageError).length} account(s) couldn't be read`] : []] : []; }),
	];
	return <div className="flex flex-col gap-6">
		<div className="flex items-center gap-2">
			<p className="min-w-0 flex-1 text-xs text-muted-foreground">How much is left across your subscriptions, pooled per provider. Hover an account for its details.</p>
			<SettingsButton variant="ghost" onClick={() => openSettings("usage")}>Sources</SettingsButton>
			<SettingsButton variant="ghost" disabled={busy || !api} onClick={checkAll}><RotateCw className={busy ? "animate-spin" : undefined} />{busy ? "Checking…" : "Check again"}</SettingsButton>
		</div>
		{unread.length > 0 && <div role="status" className="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-muted-foreground">{unread.map(line => <p key={line}>{line}</p>)}</div>}
		{pools.map(pool => <ProviderPoolSection key={pool.provider} pool={pool} />)}
		{!pools.length && <p className="text-[13px] text-muted-foreground">{busy ? "Checking your subscriptions…" : "No limits to show yet. Sign in to Codex or Claude Code, or add a usage hub in Settings."}</p>}
	</div>;
}

/** Where the Usage page's limits come from: logins on this computer and usage hubs, with hub setup. */
export function UsageSettings() {
	const { api, locals, limits, checkAll, busy } = useUsageChecks();
	const { statuses, hubs, snapshots, importableHubs, error } = limits;
	const { openUsage } = useWorkspace();
	const checkHub = (hub: UsageHub) => { if (api) void checkUsageHub(api, hub); };
	return <SettingsPageLayout title="Usage sources" description="Where the Usage page reads your subscription limits and your Claude Code and Codex history from."
		actions={<><SettingsButton variant="ghost" onClick={() => openUsage("limits")}>Show limits</SettingsButton><SettingsButton variant="ghost" disabled={busy || !api} onClick={checkAll}><RotateCw className={busy ? "animate-spin" : undefined} />{busy ? "Checking…" : "Check again"}</SettingsButton></>}>
		<Sources locals={locals} statuses={statuses} hubs={hubs} snapshots={snapshots} importableHubs={importableHubs} error={error}
			onCheckHub={checkHub} onHubs={list => { const added = list.filter(hub => !hubs.some(existing => existing.id === hub.id)); setUsageHubs(list); for (const hub of added) checkHub(hub); }} onImportableHubs={setImportableHubs} onError={setUsageError} />
		<Transcripts />
		<p className="px-0.5 text-xs text-muted-foreground">Phaseo API usage and credits are on your dashboard at phaseo.app.</p>
	</SettingsPageLayout>;
}

/**
 * The Claude Code and Codex transcript folders the Usage page reads its history from: the ones found on their own and
 * any added here, such as a config folder another app points Claude Code at.
 */
function Transcripts() {
	const { api } = useWorkspace();
	const [folders, setFolders] = useState<UsageFolder[]>();
	const [error, setError] = useState("");
	const ask = (request: Parameters<NonNullable<typeof api>["usageFolders"]>[0]) => { if (api) void api.usageFolders(request).then(value => { setFolders(value); setError(""); }, reason => setError(errorText(reason))); };
	useEffect(() => { ask({ type: "list" }); }, [api]);
	return <SettingsSection title="Transcripts" description="Claude Code and Codex history for the Usage page is read from these folders, wherever the sessions ran. Only files from the last 90 days are read."
		action={<><SettingsButton onClick={() => ask({ type: "add", harness: "claude" })}><Plus />Claude Code folder</SettingsButton><SettingsButton onClick={() => ask({ type: "add", harness: "codex" })}><Plus />Codex folder</SettingsButton></>}>
		{folders?.map(folder => <SettingsRow key={`${folder.harness}:${folder.directory}`} icon={<HarnessLogo harness={folder.harness} />} title={<span className="font-mono text-[12px]">{folder.directory}</span>}
			description={`${names[folder.harness]} · ${folder.files ? `${folder.files === 1 ? "1 file" : `${folder.files.toLocaleString("en-US")} files`} from the last 90 days` : "No recent transcripts"}${folder.added ? " · added here" : ""}`}
			control={folder.added ? <SettingsButton variant="danger" onClick={() => ask({ type: "remove", directory: folder.directory })}>Remove</SettingsButton> : undefined} />)}
		{!folders && !error && <SettingsRow title="Looking for transcripts…" />}
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</SettingsSection>;
}

/** Where limits come from: logins on this computer and usage hubs, with hub setup. One line each. */
function Sources({ locals, statuses, hubs, snapshots, importableHubs, error, onCheckHub, onHubs, onImportableHubs, onError }: {
	locals: Local[]; statuses: Record<string, Result>; hubs: UsageHub[]; snapshots: Record<string, UsageHubSnapshot | "checking">; importableHubs: ImportableHub[]; error: string;
	onCheckHub: (hub: UsageHub) => void; onHubs: (hubs: UsageHub[]) => void; onImportableHubs: (hubs: ImportableHub[]) => void; onError: (error: string) => void;
}) {
	const { api } = useWorkspace();
	const [adding, setAdding] = useState(false), [saving, setSaving] = useState(false), [importing, setImporting] = useState(false);
	const [url, setUrl] = useState("http://127.0.0.1:8317"), [key, setKey] = useState(""), [label, setLabel] = useState("");
	const localLine = (local: Local) => { const status = statuses[local.key]; return !status || status === "checking" ? "Checking…" : "error" in status ? "Couldn't check" : !status.authenticated ? "Not signed in" : status.plan ?? "Signed in"; };
	async function add() {
		if (!api) return; setSaving(true); onError("");
		try { onHubs(await api.usageHubs({ type: "add", url, key, ...label.trim() ? { label: label.trim() } : {} })); setAdding(false); setKey(""); setLabel(""); }
		catch (reason) { onError(errorText(reason)); } finally { setSaving(false); }
	}
	async function importHubs() {
		if (!api) return; setImporting(true); onError("");
		try { onHubs(await api.usageHubs({ type: "import-hubs" })); onImportableHubs([]); }
		catch (reason) { onError(errorText(reason)); onImportableHubs(await api.usageHubs({ type: "importable-hubs" }).catch(() => [])); } finally { setImporting(false); }
	}
	async function remove(hub: UsageHub) {
		if (!api || !window.confirm(`Remove ${hub.label}? Its management key is deleted from this computer.`)) return;
		try { onHubs(await api.usageHubs({ type: "remove", id: hub.id })); } catch (reason) { onError(errorText(reason)); }
	}
	return <SettingsSection title="Sources" description="Where these limits come from. Usage hubs are CLIProxyAPI servers that hold many accounts."
		action={!adding && <SettingsButton onClick={() => { setAdding(true); onError(""); }}><Plus />Add hub</SettingsButton>}>
		<SettingsRow icon={<Monitor />} title="This computer" description={locals.map(local => `${names[local.harness]}${local.accountId ? ` (${local.title})` : ""}: ${localLine(local)}`).join(" · ")} />
		{hubs.map(hub => {
			const snapshot = snapshots[hub.id], checking = snapshot === "checking";
			const summary = !snapshot || checking ? "Checking…" : snapshot.error ? snapshot.error : `${snapshot.accounts.length === 1 ? "1 account" : `${snapshot.accounts.length} accounts`}${snapshot.skipped ? ` · ${snapshot.skipped} for other providers not read` : ""}`;
			return <SettingsRow key={hub.id} icon={<Server />} title={hub.label} description={<><span className="font-mono">{hub.url}</span> · <span className={snapshot && snapshot !== "checking" && snapshot.error ? "text-destructive" : undefined}>{summary}</span></>}
				control={<><SettingsButton variant="ghost" disabled={checking} onClick={() => onCheckHub(hub)}>Check</SettingsButton><SettingsButton variant="danger" onClick={() => void remove(hub)}>Remove</SettingsButton></>} />;
		})}
		{importableHubs.length > 0 && <SettingsRow icon={<Server />} title={importableHubs.length === 1 ? `Another app on this computer has a hub: ${importableHubs[0].label}` : `Another app on this computer has ${importableHubs.length} hubs`} description={importableHubs.map(hub => hub.url).join(", ")}
			control={<SettingsButton variant="primary" disabled={importing} onClick={() => void importHubs()}>{importing ? "Importing…" : "Import"}</SettingsButton>} />}
		{adding && <form aria-label="Add usage hub" className="flex flex-col gap-3 p-4" onSubmit={event => { event.preventDefault(); void add(); }}>
			<div className="grid grid-cols-3 gap-3">
				<SettingsField label="Hub address"><input value={url} onChange={event => setUrl(event.target.value)} required placeholder="http://127.0.0.1:8317" className={settingsInput} /></SettingsField>
				<SettingsField label="Management key"><input type="password" value={key} onChange={event => setKey(event.target.value)} required autoComplete="off" className={settingsInput} /></SettingsField>
				<SettingsField label="Name (optional)"><input value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder="Home hub" className={settingsInput} /></SettingsField>
			</div>
			<div className="flex items-center gap-2">
				<SettingsButton variant="primary" type="submit" disabled={saving || !url.trim() || !key.trim()}>{saving ? "Checking the hub…" : "Add hub"}</SettingsButton>
				<SettingsButton variant="ghost" onClick={() => setAdding(false)}>Cancel</SettingsButton>
				<span className="text-xs text-muted-foreground">The key is checked once, then kept in secure storage. Five wrong keys block your address on the hub for 30 minutes.</span>
			</div>
		</form>}
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</SettingsSection>;
}
