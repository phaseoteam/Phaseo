import { useEffect, useState } from "react";
import { defaultWorkSettings } from "../../../shared/factory/phaseoWork";
import type { FactorySnapshot, PhaseoWorkOptions, PhaseoWorkSettings as Settings } from "../../../shared/factory/types";
import { Button } from "../../components/ui/button";
import { Choice, Field, Group, Row, SettingsPage, Toggle } from "../components/Settings";
import { since } from "../lib/format";
import { factory, useNow } from "../lib/useFactory";

/**
 * Phaseo Work as a Factory source: on or off, the Phaseo sign-in and workspace it reads, and which items it takes.
 * The sign-in's token stays in the main process; this page only sees names and ids.
 */
export function PhaseoWorkSettings({ snapshot }: { snapshot: FactorySnapshot }) {
	const now = useNow(15_000);
	const settings = snapshot.settings.phaseoWork ?? defaultWorkSettings();
	const [options, setOptions] = useState<PhaseoWorkOptions | null>(null);
	const [checking, setChecking] = useState(false);
	const update = (patch: Partial<Settings>) => void factory().updateSettings({ phaseoWork: { ...settings, ...patch } });

	useEffect(() => {
		let live = true;
		setOptions(null);
		void factory().phaseoWorkOptions(settings.accountId).then((found) => {
			if (!live) return;
			setOptions(found);
			// The first time, the workspace the sign-in's key is for.
			const account = found.accounts.find((entry) => entry.id === settings.accountId) ?? found.accounts[0];
			if (!settings.workspaceId && account?.workspaceId) {
				const workspace = found.workspaces.find((entry) => entry.id === account.workspaceId);
				if (workspace) update({ workspaceId: workspace.id, workspaceName: workspace.name });
			}
		}, (cause: unknown) => live && setOptions({ accounts: [], workspaces: [], error: cause instanceof Error ? cause.message : String(cause) }));
		return () => { live = false; };
		// Read again only when the sign-in changes.
	}, [settings.accountId]);

	const status = snapshot.phaseoWork;
	const accounts = options?.accounts ?? [];
	const workspaces = options?.workspaces ?? [];
	const workspaceChoices = settings.workspaceId && !workspaces.some((entry) => entry.id === settings.workspaceId)
		? [{ value: settings.workspaceId, label: settings.workspaceName ?? settings.workspaceId }, ...workspaces.map((entry) => ({ value: entry.id, label: entry.name }))]
		: workspaces.map((entry) => ({ value: entry.id, label: entry.name }));

	return <SettingsPage title="Phaseo Work" description="Factory can take items from your workspace's Phaseo Work tracker as well as GitHub. Runs on them are reported back to the item, so the workspace sees what the engineer agent did. Customer requests on an item are never read here.">
		<Group title="Source">
			<Row title="Take items from Phaseo Work" description="Factory reads the items on the same schedule as GitHub, when you come back to the app and when you press Check now.">
				<Toggle label="Take items from Phaseo Work" on={settings.enabled} onChange={(enabled) => update({ enabled })} />
			</Row>
			{settings.enabled && <>
				<Row title="Phaseo sign-in" description={accounts.length ? "The Phaseo account Factory reads with. Add one in Settings → Accounts." : options ? options.error ?? "Sign in to Phaseo in Settings → Accounts first." : "Reading your Phaseo sign-ins…"}>
					{accounts.length > 1 && <Choice label="Phaseo sign-in" value={settings.accountId ?? accounts[0]!.id} options={accounts.map((entry) => ({ value: entry.id, label: entry.email ? `${entry.name} (${entry.email})` : entry.name }))} onChange={(accountId) => update({ accountId, workspaceId: undefined, workspaceName: undefined })} />}
					{accounts.length === 1 && <span className="text-sm text-muted-foreground">{accounts[0]!.email ?? accounts[0]!.name}</span>}
				</Row>
				<Row title="Workspace" description={options?.error && accounts.length ? options.error : "Whose Phaseo Work items Factory takes."}>
					{workspaceChoices.length > 0
						? <Choice label="Workspace" value={settings.workspaceId ?? ""} options={[...(settings.workspaceId ? [] : [{ value: "", label: "Choose a workspace" }]), ...workspaceChoices]} onChange={(workspaceId) => update({ workspaceId: workspaceId || undefined, workspaceName: workspaces.find((entry) => entry.id === workspaceId)?.name })} />
						: <span className="text-sm text-muted-foreground">{options ? "None found" : "Loading…"}</span>}
				</Row>
			</>}
		</Group>
		{settings.enabled && <Group title="Which items" description="Open items that match any of these.">
			<Row title="Assigned to the engineer agent" description="Items triage or a person handed to the engineer agent.">
				<Toggle label="Assigned to the engineer agent" on={settings.engineer} onChange={(engineer) => update({ engineer })} />
			</Row>
			<Row title="Assigned to you" description="Items assigned to the person this sign-in belongs to.">
				<Toggle label="Assigned to you" on={settings.mine} onChange={(mine) => update({ mine })} />
			</Row>
			<Row title="With a label" description="Items with this label, whoever they're assigned to. Clear it to take none by label.">
				<Field value={settings.label} placeholder="No label" mono className="w-48" onSave={(label) => update({ label })} />
			</Row>
		</Group>}
		{settings.enabled && <Group title="Last check">
			<Row title={status?.error ? "Couldn't read Phaseo Work" : status?.syncedAt ? `${status.items === 1 ? "1 item" : `${status.items} items`}` : "Not read yet"} description={status?.error ?? (status?.syncedAt ? `Read ${since(status.syncedAt, now)}.` : "Factory reads Phaseo Work at its next check.")}>
				<Button variant="outline" size="sm" disabled={checking} onClick={() => {
					setChecking(true);
					void factory().refresh().finally(() => setChecking(false));
				}}>{checking ? "Checking…" : "Check now"}</Button>
			</Row>
		</Group>}
	</SettingsPage>;
}
