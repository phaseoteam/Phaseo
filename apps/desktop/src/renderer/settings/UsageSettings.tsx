import { useEffect, useMemo, useState } from "react";
import { Monitor, Plus, RotateCw, Server } from "lucide-react";
import type { ImportableHub, UsageHub, UsageHubSnapshot } from "../../shared/usageHubs";
import { errorText, useWorkspace } from "../app/workspace";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";
import { usagePools, type UsageProvider } from "./usagePools";
import { ProviderPoolSection } from "./UsageLimits";
import { checkAllUsage, checkUsageHub, setT3Hubs, setUsageError, setUsageHubs, usageAccounts, usageChecking, usageLocals, useUsageLimits, type UsageLocal as Local, type UsageResult as Result } from "./usageLimitsStore";

const names: Record<UsageProvider, string> = { codex: "Codex", claude: "Claude Code", cursor: "Cursor", grok: "Grok" };

/**
 * Limits pooled per provider across every account Phaseo can read, like T3 Code's Usage page: logins on this
 * computer, accounts added here, and accounts on usage hubs. Everything is read once per visit; the readings are
 * shared with the sidebar's rings.
 */
export function UsageSettings() {
	const { api, overview } = useWorkspace();
	const locals = useMemo(() => usageLocals(overview.accounts), [overview.accounts]);
	const limits = useUsageLimits();
	const { statuses, hubs, snapshots, t3Hubs, error } = limits;
	const checkHub = (hub: UsageHub) => { if (api) void checkUsageHub(api, hub); };
	const checkAll = () => { if (api) void checkAllUsage(api, locals); };
	const keys = locals.map(local => local.key).join("|");
	// Each check starts an agent or calls a hub, so they run once per visit rather than on a timer.
	useEffect(() => { checkAll(); }, [keys, api]);

	const pools = usagePools(usageAccounts(locals, limits));
	const busy = usageChecking(limits);
	// Limits nobody could read, said once at the top rather than repeated per account.
	const unread: string[] = [
		...locals.flatMap((local): string[] => { const status = statuses[local.key]; if (!status || status === "checking") return []; return "error" in status ? [`${local.title}: ${status.error}`] : status.usageError && status.authenticated ? [`${local.title}: ${status.usageError}`] : []; }),
		...hubs.flatMap(hub => { const snapshot = snapshots[hub.id]; return snapshot && snapshot !== "checking" ? [...snapshot.error ? [`${hub.label}: ${snapshot.error}`] : [], ...snapshot.accounts.filter(account => account.status.usageError).length ? [`${hub.label}: ${snapshot.accounts.filter(account => account.status.usageError).length} account(s) couldn't be read`] : []] : []; }),
	];

	return <SettingsPageLayout title="Usage & limits" description="How much is left across your subscriptions, pooled per provider. Hover an account for its details."
		actions={<SettingsButton variant="ghost" disabled={busy || !api} onClick={checkAll}><RotateCw className={busy ? "animate-spin" : undefined} />{busy ? "Checking…" : "Check again"}</SettingsButton>}>
		{pools.map(pool => <ProviderPoolSection key={pool.provider} pool={pool} />)}
		{!pools.length && <p className="text-[13px] text-muted-foreground">{busy ? "Checking your subscriptions…" : "No limits to show yet. Sign in to Codex or Claude Code, or add a usage hub below."}</p>}
		{unread.length > 0 && <div role="status" className="flex flex-col gap-1 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-muted-foreground">{unread.map(line => <p key={line}>{line}</p>)}</div>}
		<Sources locals={locals} statuses={statuses} hubs={hubs} snapshots={snapshots} t3Hubs={t3Hubs} error={error}
			onCheckHub={checkHub} onHubs={list => { const added = list.filter(hub => !hubs.some(existing => existing.id === hub.id)); setUsageHubs(list); for (const hub of added) checkHub(hub); }} onT3Hubs={setT3Hubs} onError={setUsageError} />
		<p className="px-0.5 text-xs text-muted-foreground">Phaseo API usage and credits are on your dashboard at phaseo.app.</p>
	</SettingsPageLayout>;
}

/** Where limits come from: logins on this computer and usage hubs, with hub setup. One line each. */
function Sources({ locals, statuses, hubs, snapshots, t3Hubs, error, onCheckHub, onHubs, onT3Hubs, onError }: {
	locals: Local[]; statuses: Record<string, Result>; hubs: UsageHub[]; snapshots: Record<string, UsageHubSnapshot | "checking">; t3Hubs: ImportableHub[]; error: string;
	onCheckHub: (hub: UsageHub) => void; onHubs: (hubs: UsageHub[]) => void; onT3Hubs: (hubs: ImportableHub[]) => void; onError: (error: string) => void;
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
	async function importT3() {
		if (!api) return; setImporting(true); onError("");
		try { onHubs(await api.usageHubs({ type: "import-t3" })); onT3Hubs([]); }
		catch (reason) { onError(errorText(reason)); onT3Hubs(await api.usageHubs({ type: "t3-hubs" }).catch(() => [])); } finally { setImporting(false); }
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
		{t3Hubs.length > 0 && <SettingsRow icon={<Server />} title={t3Hubs.length === 1 ? `T3 Code has a hub: ${t3Hubs[0].label}` : `T3 Code has ${t3Hubs.length} hubs`} description={t3Hubs.map(hub => hub.url).join(", ")}
			control={<SettingsButton variant="primary" disabled={importing} onClick={() => void importT3()}>{importing ? "Importing…" : "Import from T3 Code"}</SettingsButton>} />}
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
