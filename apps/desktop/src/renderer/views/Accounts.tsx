import { useEffect, useState } from "react";
import { PhaseoSignIn } from "../components/PhaseoSignIn";
import { PhaseoSignInForm } from "../components/PhaseoSignInForm";
import { Select } from "../components/Select";
import { HarnessLogo } from "../components/HarnessLogo";
import type { AccountStatus as NativeAccountStatus, WorkspaceCommand } from "../../shared/workspace";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { UsageMeters } from "../settings/UsageMeters";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "../settings/SettingsLayout";

const harnessLabel: Record<string, string> = { codex: "Codex", claude: "Claude Code", phaseo: "Phaseo API", cursor: "Cursor", grok: "Grok", opencode: "OpenCode", pi: "Pi" };
import { AccountEditor } from "../components/AccountEditor";

export function Accounts() {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [name, setName] = useState("");
	const [provider, setProvider] = useState<"codex" | "claude" | "phaseo" | "cursor" | "grok">("codex");
	const [cursorKind, setCursorKind] = useState<"native" | "api">("native");
	const [endpoint, setEndpoint] = useState("https://api.phaseo.app/v1");
	const [apiKey, setApiKey] = useState("");
	const [error, setError] = useState("");
	const [signingIn, setSigningIn] = useState<string>();
	/** The Phaseo account whose sign-in form is open beneath it, to sign in again. */
	const [phaseoAgain, setPhaseoAgain] = useState<string>();
	const [saving, setSaving] = useState(false);
	const [statuses, setStatuses] = useState<Record<string, NativeAccountStatus>>({});
	const [checking, setChecking] = useState<string>();
	const [editing, setEditing] = useState<string>(); const [showArchived, setShowArchived] = useState(false);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onOverviewChange(setWorkspace);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	async function add() {
		if (!api) { setError("Open the desktop application to connect an account."); return; }
		setSaving(true); setError("");
		try {
			setWorkspace(await api.command({ type: "add-account", name, harness: provider, kind: provider === "phaseo" ? "api" : provider === "cursor" ? cursorKind : "native", ...(provider === "phaseo" ? { endpoint, apiKey } : provider === "cursor" && cursorKind === "api" ? { apiKey } : {}) }));
			setName(""); setApiKey("");
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setSaving(false); }
	}
	async function signIn(id: string) {
		if (!api) return;
		setSigningIn(id); setError("");
		try { setWorkspace(await api.signIn(id)); }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setSigningIn(undefined); }
	}
	async function check(harness: "codex" | "claude" | "cursor" | "grok", id?: string) {
		if (!api || checking) return; const key = id ?? harness; setChecking(key); setError("");
		try { const status = await api.accountStatus(harness, id); setStatuses(current => ({ ...current, [key]: status })); }
		catch (reason) { setError(String(reason)); } finally { setChecking(undefined); }
	}
	async function update(command: Extract<WorkspaceCommand, { type: "update-account" }>) {
		if (!api) return false; setError("");
		try { setWorkspace(await api.command(command)); return true; }
		catch (reason) { setError(String(reason)); return false; }
	}
	const visible = workspace.accounts.filter(account => Boolean(account.archived) === showArchived);
	const state = (account: (typeof visible)[number]) => account.oauthExpiresAt ? Date.parse(account.oauthExpiresAt) <= Date.now() ? "Sign-in expired" : account.profile?.email ? `Signed in as ${account.profile.email}` : "Signed in" : account.kind === "api" ? account.harness === "cursor" ? "Cursor API key" : account.endpoint : account.configured ? "Signed in" : "Sign-in required";
	return <SettingsPageLayout title="Accounts" description="Subscriptions and API keys your chats run on." className="accounts-page">
		{error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
		<SettingsSection title="Logins on this computer" description="Codex and Claude Code use the login you already have in their own apps.">
			{(["codex", "claude"] as const).map(harness => <article key={harness}>
				<SettingsRow icon={<HarnessLogo harness={harness} />} title={`${harness === "codex" ? "Codex" : "Claude Code"} login`} description="Your existing sign-in"
					control={<SettingsButton disabled={!!checking} onClick={() => void check(harness)}>{checking === harness ? "Checking…" : "Check status"}</SettingsButton>}>
					{statuses[harness] && <UsageMeters status={statuses[harness]} />}
				</SettingsRow>
			</article>)}
		</SettingsSection>
		<SettingsSection title="Connected accounts" action={<SettingsButton variant="ghost" onClick={() => { setShowArchived(value => !value); setEditing(undefined); }}>{showArchived ? "Active accounts" : "Archived accounts"}</SettingsButton>}>
			{visible.map(account => <article key={account.id}>
				<SettingsRow icon={<HarnessLogo harness={account.harness} />} title={account.name} description={<>{harnessLabel[account.harness] ?? account.harness} · {state(account)}</>}
					control={<>
						{account.oauthExpiresAt && !account.archived && phaseoAgain !== account.id && <SettingsButton onClick={() => { setEditing(undefined); setPhaseoAgain(account.id); }}>Sign in again</SettingsButton>}
						{account.kind === "api" && account.harness === "cursor" && <SettingsButton disabled={!!checking} onClick={() => void check("cursor", account.id)}>Check status</SettingsButton>}
						{account.kind === "native" && <>
							<SettingsButton disabled={!!checking || signingIn === account.id} onClick={() => void check(account.harness as "codex" | "claude" | "cursor" | "grok", account.id)}>{checking === account.id ? "Checking…" : "Check status"}</SettingsButton>
							<SettingsButton disabled={(!!signingIn && signingIn !== account.id) || checking === account.id} onClick={() => { if (signingIn === account.id) void api?.cancelSignIn(account.id); else void signIn(account.id); }}>{signingIn === account.id ? "Cancel sign-in" : "Sign in"}</SettingsButton>
						</>}
						<SettingsButton variant="ghost" disabled={signingIn === account.id || checking === account.id} onClick={() => setEditing(account.id)}>Edit</SettingsButton>
						<SettingsButton variant="ghost" disabled={signingIn === account.id || checking === account.id} onClick={() => { setEditing(undefined); void update({ type: "update-account", id: account.id, archived: !account.archived }); }}>{account.archived ? "Restore" : "Archive"}</SettingsButton>
					</>}>
					{phaseoAgain === account.id && <div className="max-w-sm px-4 pb-4"><PhaseoSignInForm accountId={account.id} onCancel={() => setPhaseoAgain(undefined)} onConnected={next => { setPhaseoAgain(undefined); setWorkspace(next); }} /></div>}
					{editing === account.id && <AccountEditor account={account} onSave={update} onCancel={() => setEditing(undefined)} />}
					{statuses[account.id] && <UsageMeters status={statuses[account.id]} />}
				</SettingsRow>
			</article>)}
			{!visible.length && <SettingsNote>{showArchived ? "No archived accounts." : "No accounts connected yet. Add one below."}</SettingsNote>}
		</SettingsSection>
		<SettingsSection title="Add an account">
			<div className="flex flex-col gap-4 p-4">
				<PhaseoSignIn disabled={saving} onConnected={next => setWorkspace(next)} />
				<form className="flex flex-col gap-3" aria-label="Add account" onSubmit={event => { event.preventDefault(); void add(); }}>
					<div className="grid grid-cols-2 gap-3">
						<SettingsField label="Name"><input value={name} onChange={event => setName(event.target.value)} required placeholder="Personal account" className={settingsInput} /></SettingsField>
						<SettingsField label="Provider"><Select label="Account provider" value={provider} onValueChange={value => setProvider(value as typeof provider)} options={([["codex", "OpenAI / Codex subscription"], ["claude", "Anthropic / Claude subscription"], ["cursor", "Cursor"], ["grok", "Grok subscription"], ["phaseo", "Phaseo / compatible API"]] as const).map(([value, label]) => ({ value, label, icon: <HarnessLogo harness={value} /> }))} /></SettingsField>
						{provider === "cursor" && <SettingsField label="Connection"><Select label="Account connection" value={cursorKind} onValueChange={value => setCursorKind(value as typeof cursorKind)} options={[{ value: "native", label: "Browser sign-in" }, { value: "api", label: "API key" }]} /></SettingsField>}
						{provider === "cursor" && cursorKind === "api" && <SettingsField label="API key"><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" required className={settingsInput} /></SettingsField>}
						{provider === "phaseo" && <>
							<SettingsField label="API endpoint"><input value={endpoint} onChange={event => setEndpoint(event.target.value)} required className={settingsInput} /></SettingsField>
							<SettingsField label="API key"><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" required className={settingsInput} /></SettingsField>
						</>}
					</div>
					<div className="flex items-center gap-3">
						<SettingsButton variant="primary" type="submit" disabled={saving || !name.trim()}>{saving ? "Connecting…" : "Add account"}</SettingsButton>
						<span className="text-xs text-muted-foreground">Native accounts use separate local profiles. API keys are encrypted with your device's secure storage.</span>
					</div>
				</form>
			</div>
		</SettingsSection>
	</SettingsPageLayout>;
}
