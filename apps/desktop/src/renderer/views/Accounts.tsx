import { useEffect, useState } from "react";
import type { AccountStatus as NativeAccountStatus, Workspace, WorkspaceCommand } from "../../shared/workspace";
import { emptyWorkspace } from "../../shared/workspace";
import { AccountStatus } from "../components/AccountStatus";
import { AccountEditor } from "../components/AccountEditor";

export function Accounts() {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	const [name, setName] = useState("");
	const [provider, setProvider] = useState<"codex" | "claude" | "phaseo" | "cursor" | "grok">("codex");
	const [cursorKind, setCursorKind] = useState<"native" | "api">("native");
	const [endpoint, setEndpoint] = useState("https://api.phaseo.app/v1");
	const [apiKey, setApiKey] = useState("");
	const [error, setError] = useState("");
	const [signingIn, setSigningIn] = useState<string>();
	const [saving, setSaving] = useState(false);
	const [statuses, setStatuses] = useState<Record<string, NativeAccountStatus>>({});
	const [checking, setChecking] = useState<string>();
	const [editing, setEditing] = useState<string>(); const [showArchived, setShowArchived] = useState(false);
	useEffect(() => {
		if (!api) return;
		void api.get().then(setWorkspace, reason => setError(String(reason)));
		return api.onChange(setWorkspace);
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
	return <div className="page accounts-page">
		<header className="page-heading"><div><h1>Accounts</h1><p>Connect subscriptions or an API provider.</p></div></header>
		{error && <div className="task-error" role="alert">{error}</div>}
		<section className="panel"><div className="panel-heading"><h2>Connected accounts</h2><button type="button" onClick={() => { setShowArchived(value => !value); setEditing(undefined); }}>{showArchived ? "Active accounts" : "Archived accounts"}</button></div>
		{(["codex", "claude"] as const).map(harness => <article key={harness}><div className="account-row"><div><strong>{harness === "codex" ? "Codex" : "Claude Code"} local login</strong><small>Existing native profile</small></div><button type="button" disabled={!!checking} onClick={() => void check(harness)}>{checking === harness ? "Checking…" : "Check status"}</button></div>{statuses[harness] && <AccountStatus status={statuses[harness]} />}</article>)}
		{workspace.accounts.filter(account => Boolean(account.archived) === showArchived).map(account => <article key={account.id}><div className="account-row"><div><strong>{account.name}</strong><small>{account.harness} · {account.kind === "api" ? account.harness === "cursor" ? "Cursor API key" : account.endpoint : account.configured ? "Signed in" : "Sign-in required"}</small></div>{account.kind === "api" && account.harness === "cursor" && <button type="button" disabled={!!checking} onClick={() => void check("cursor", account.id)}>Check status</button>}{account.kind === "native" && <><button type="button" disabled={!!checking || signingIn === account.id} onClick={() => void check(account.harness as "codex" | "claude" | "cursor" | "grok", account.id)}>{checking === account.id ? "Checking…" : "Check status"}</button><button type="button" disabled={(!!signingIn && signingIn !== account.id) || checking === account.id} onClick={() => { if (signingIn === account.id) void api?.cancelSignIn(account.id); else void signIn(account.id); }}>{signingIn === account.id ? "Cancel sign-in" : "Sign in"}</button></>}<button type="button" disabled={signingIn === account.id || checking === account.id} onClick={() => setEditing(account.id)}>Edit</button><button type="button" disabled={signingIn === account.id || checking === account.id} onClick={() => { setEditing(undefined); void update({ type: "update-account", id: account.id, archived: !account.archived }); }}>{account.archived ? "Restore" : "Archive"}</button></div>{editing === account.id && <AccountEditor account={account} onSave={update} onCancel={() => setEditing(undefined)} />}{statuses[account.id] && <AccountStatus status={statuses[account.id]} />}</article>)}
		</section>
		<section className="panel"><div className="panel-heading"><h2>Add account</h2></div>
		<form className="account-form" onSubmit={event => { event.preventDefault(); void add(); }}>
			<label>Name<input value={name} onChange={event => setName(event.target.value)} required placeholder="Personal account" /></label>
			<label>Provider<select value={provider} onChange={event => setProvider(event.target.value as typeof provider)}><option value="codex">OpenAI / Codex subscription</option><option value="claude">Anthropic / Claude subscription</option><option value="cursor">Cursor</option><option value="grok">Grok subscription</option><option value="phaseo">Phaseo / compatible API</option></select></label>
			{provider === "cursor" && <label>Connection<select value={cursorKind} onChange={event => setCursorKind(event.target.value as typeof cursorKind)}><option value="native">Browser sign-in</option><option value="api">API key</option></select></label>}
			{provider === "cursor" && cursorKind === "api" && <label>API key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" required /></label>}
			{provider === "phaseo" && <><label>API endpoint<input value={endpoint} onChange={event => setEndpoint(event.target.value)} required /></label><label>API key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" required /></label></>}
			<button className="task-primary" type="submit" disabled={saving || !name.trim()}>{saving ? "Connecting…" : "Add account"}</button>
		</form>
		<p className="task-muted">Native accounts use separate local profiles. API keys are encrypted using your device’s secure storage.</p>
		</section>
	</div>;
}
