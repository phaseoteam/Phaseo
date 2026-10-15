import { useCallback, useEffect, useState } from "react";
import { Plus, Server } from "lucide-react";
import type { UsageHub, UsageHubSnapshot } from "../../shared/usageHubs";
import { errorText, useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { SettingsButton, SettingsField, SettingsNote, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";
import { UsageMeters } from "./UsageMeters";

/** CLIProxyAPI hubs: every Codex and Claude account on the hub, with its limits, read when the page opens. */
export function UsageHubsSection({ refresh }: { refresh: number }) {
	const { api } = useWorkspace();
	const [hubs, setHubs] = useState<UsageHub[]>([]);
	const [snapshots, setSnapshots] = useState<Record<string, UsageHubSnapshot | "checking">>({});
	const [adding, setAdding] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
	const [url, setUrl] = useState("http://127.0.0.1:8317"), [key, setKey] = useState(""), [label, setLabel] = useState("");
	const check = useCallback(async (hub: UsageHub) => {
		if (!api) return;
		setSnapshots(current => ({ ...current, [hub.id]: "checking" }));
		try { const snapshot = await api.usageHubs({ type: "check", id: hub.id }); setSnapshots(current => ({ ...current, [hub.id]: snapshot })); }
		catch (reason) { setSnapshots(current => ({ ...current, [hub.id]: { hubId: hub.id, checkedAt: new Date().toISOString(), accounts: [], skipped: 0, error: errorText(reason) } })); }
	}, [api]);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.usageHubs({ type: "list" }).then(list => { if (!active) return; setHubs(list); for (const hub of list) void check(hub); }, reason => { if (active) setError(errorText(reason)); });
		return () => { active = false; };
	}, [api, check, refresh]);
	async function add() {
		if (!api) return;
		setSaving(true); setError("");
		try {
			const list = await api.usageHubs({ type: "add", url, key, ...label.trim() ? { label: label.trim() } : {} });
			setHubs(list); setAdding(false); setKey(""); setLabel("");
			const added = list.find(hub => !hubs.some(existing => existing.id === hub.id)); if (added) void check(added);
		} catch (reason) { setError(errorText(reason)); } finally { setSaving(false); }
	}
	async function remove(hub: UsageHub) {
		if (!api || !window.confirm(`Remove ${hub.label}? Its management key is deleted from this computer.`)) return;
		try { setHubs(await api.usageHubs({ type: "remove", id: hub.id })); } catch (reason) { setError(errorText(reason)); }
	}
	return <SettingsSection title="Usage hubs" description="Limits for every Codex and Claude account on a CLIProxyAPI hub, read through its management API."
		action={!adding && <SettingsButton onClick={() => { setAdding(true); setError(""); }}><Plus />Add hub</SettingsButton>}>
		{hubs.map(hub => {
			const snapshot = snapshots[hub.id], checking = snapshot === "checking";
			return <div key={hub.id} className="flex flex-col divide-y divide-border">
				<SettingsRow icon={<Server />} title={hub.label} description={hub.url}
					control={<><SettingsButton variant="ghost" disabled={checking} onClick={() => void check(hub)}>{checking ? "Checking…" : "Check"}</SettingsButton><SettingsButton variant="danger" onClick={() => void remove(hub)}>Remove</SettingsButton></>}>
					{snapshot && snapshot !== "checking" && snapshot.error && <p className="text-xs text-destructive" role="alert">{snapshot.error}</p>}
					{snapshot && snapshot !== "checking" && !snapshot.error && !snapshot.accounts.length && <p className="text-xs text-muted-foreground">This hub has no Codex or Claude accounts.</p>}
				</SettingsRow>
				{snapshot && snapshot !== "checking" && snapshot.accounts.map(account => <SettingsRow key={account.id} className="pl-14" icon={<HarnessLogo harness={account.provider} />}
					title={account.email ?? account.id.replace(/\.json$/, "")} description={`${account.provider === "codex" ? "Codex" : "Claude"} · via ${hub.label}`}>
					<UsageMeters status={account.status} />
				</SettingsRow>)}
				{snapshot && snapshot !== "checking" && snapshot.skipped > 0 && <SettingsNote className="pl-14">{snapshot.skipped === 1 ? "1 account" : `${snapshot.skipped} accounts`} for other providers on this hub can't be read yet.</SettingsNote>}
			</div>;
		})}
		{!hubs.length && !adding && <SettingsNote>No hubs yet. Add one to see the limits of every account it manages.</SettingsNote>}
		{adding && <form aria-label="Add usage hub" className="flex flex-col gap-3 p-4" onSubmit={event => { event.preventDefault(); void add(); }}>
			<div className="grid grid-cols-2 gap-3">
				<SettingsField label="Hub address"><input value={url} onChange={event => setUrl(event.target.value)} required placeholder="http://127.0.0.1:8317" className={settingsInput} /></SettingsField>
				<SettingsField label="Management key"><input type="password" value={key} onChange={event => setKey(event.target.value)} required autoComplete="off" className={settingsInput} /></SettingsField>
				<SettingsField label="Name (optional)"><input value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder="Home hub" className={settingsInput} /></SettingsField>
			</div>
			{error && <p className="text-xs text-destructive" role="alert">{error}</p>}
			<div className="flex items-center gap-2">
				<SettingsButton variant="primary" type="submit" disabled={saving || !url.trim() || !key.trim()}>{saving ? "Checking the hub…" : "Add hub"}</SettingsButton>
				<SettingsButton variant="ghost" onClick={() => { setAdding(false); setError(""); }}>Cancel</SettingsButton>
				<span className="text-xs text-muted-foreground">The key is checked once, then kept in your device's secure storage. Five wrong keys block your address on the hub for 30 minutes.</span>
			</div>
		</form>}
		{error && !adding && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</SettingsSection>;
}
