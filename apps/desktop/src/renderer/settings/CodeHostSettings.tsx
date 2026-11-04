import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { codeHostNames, type CustomCodeHost } from "../../shared/codeHosts";
import { fixedCodeHost, type CodeHostSettings as Settings, type CodeHostTokenRequest } from "../../shared/codeHostSettings";
import { showToast } from "../components/ui/toast";
import { errorText } from "../app/workspace";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

type Kind = CodeHostTokenRequest["kind"];
const hosts: { kind: Kind; cli?: keyof Settings["clis"]; signIn: string; token: string; placeholder?: string }[] = [
	{ kind: "gitlab", cli: "glab", signIn: "Install GitLab CLI and run glab auth login (add --hostname for your own server).", token: "Or save a personal access token with the api scope.", placeholder: "gitlab.com" },
	{ kind: "forgejo", cli: "tea", signIn: "Install Gitea CLI and run tea login add for each server, including Codeberg.", token: "Or save an access token with read and write access to repositories and issues.", placeholder: "codeberg.org" },
	{ kind: "bitbucket", signIn: "Bitbucket has no CLI sign-in.", token: "Save a repository, project or workspace access token, or your Atlassian email with an API token that can read and write pull requests." },
	{ kind: "azure", cli: "az", signIn: "Install Azure CLI with the azure-devops extension and run az login.", token: "Or save a personal access token with Code read and write." },
];

/** Settings ▸ Code hosts: how Phaseo reaches GitLab, Forgejo or Gitea, Bitbucket and Azure DevOps. GitHub keeps using GitHub CLI. */
export function CodeHostSettings() {
	const api = window.phaseoDesktop?.workspace;
	const [settings, setSettings] = useState<Settings>();
	const [error, setError] = useState<string>();
	useEffect(() => { if (api) void api.codeHosts().then(setSettings, reason => setError(errorText(reason))); }, [api]);
	const apply = async (work: Promise<Settings>, done: string) => {
		try { setSettings(await work); setError(undefined); showToast("success", done); return true; } catch (reason) { setError(errorText(reason)); return false; }
	};
	return <SettingsPageLayout title="Code hosts" description="Pull and merge requests from projects whose origin is on GitLab, Forgejo or Gitea, Bitbucket or Azure DevOps. GitHub projects use GitHub CLI.">
		{error && <SettingsNote role="alert" tone="error" className="px-0.5 py-0">{error}</SettingsNote>}
		{hosts.map(host => <HostSection key={host.kind} {...host} settings={settings} onSave={request => api ? apply(api.saveCodeHostToken(request), "Token saved") : Promise.resolve(false)} onRemove={name => api && void apply(api.removeCodeHostToken(host.kind, name), "Token removed")} />)}
		<Servers settings={settings} onSave={servers => api ? apply(api.saveCodeHostServers(servers), "Servers saved") : Promise.resolve(false)} />
	</SettingsPageLayout>;
}

function HostSection({ kind, cli, signIn, token, placeholder, settings, onSave, onRemove }: (typeof hosts)[number] & { settings?: Settings; onSave: (request: CodeHostTokenRequest) => Promise<boolean>; onRemove: (host: string) => void }) {
	const fixed = fixedCodeHost[kind];
	const [host, setHost] = useState(""), [secret, setSecret] = useState(""), [email, setEmail] = useState(""), [busy, setBusy] = useState(false);
	const saved = settings?.tokens.filter(entry => entry.kind === kind) ?? [];
	const installed = cli && settings ? settings.clis[cli] : undefined;
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (busy || !secret.trim()) return;
		setBusy(true);
		if (await onSave({ kind, host: fixed ?? host, token: secret, ...(email.trim() ? { email } : {}) })) { setSecret(""); setEmail(""); setHost(""); }
		setBusy(false);
	};
	return <SettingsSection title={codeHostNames[kind]} description={`${signIn} ${token}`}>
		{cli && <SettingsRow title={cli === "az" ? "Azure CLI" : cli === "glab" ? "GitLab CLI" : "Gitea CLI"} description={installed === undefined ? "Checking…" : installed ? `${cli} is installed. Phaseo uses its sign-in when no token is saved for a server.` : `${cli} wasn't found on this computer.`} />}
		{saved.map(entry => <SettingsRow key={entry.host} title={entry.host} description={`Token saved ${new Date(entry.savedAt).toLocaleDateString()}. It can't be shown again; save a new one to replace it.`} control={<SettingsButton variant="danger" onClick={() => onRemove(entry.host)}><Trash2 />Remove</SettingsButton>} />)}
		<form onSubmit={event => void submit(event)} className="flex flex-col gap-3 px-4 py-3.5">
			<div className="grid gap-3 sm:grid-cols-2">
				{!fixed && <SettingsField label="Server"><input value={host} onChange={event => setHost(event.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" className={settingsInput} /></SettingsField>}
				{kind === "bitbucket" && <SettingsField label="Atlassian email" hint="Leave empty for an access token."><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="off" className={settingsInput} /></SettingsField>}
				<SettingsField label={kind === "azure" ? "Personal access token" : kind === "bitbucket" && email.trim() ? "API token" : "Access token"}><input type="password" value={secret} onChange={event => setSecret(event.target.value)} spellCheck={false} autoComplete="off" className={settingsInput} /></SettingsField>
			</div>
			<div className="flex justify-end"><SettingsButton type="submit" variant="primary" disabled={busy || !secret.trim() || (!fixed && !host.trim())}>{busy ? "Saving…" : "Save token"}</SettingsButton></div>
		</form>
	</SettingsSection>;
}

/** Self-hosted servers whose names don't say what runs there: git.example.com could be GitLab or Forgejo. */
function Servers({ settings, onSave }: { settings?: Settings; onSave: (servers: CustomCodeHost[]) => Promise<boolean> }) {
	const [host, setHost] = useState(""), [kind, setKind] = useState<CustomCodeHost["kind"]>("gitlab");
	const servers = settings?.custom ?? [];
	const add = async (event: FormEvent) => { event.preventDefault(); if (host.trim() && await onSave([...servers, { host: host.trim(), kind }])) setHost(""); };
	return <SettingsSection title="Your own servers" description="Phaseo recognises gitlab.com, codeberg.org, gitea.com, bitbucket.org, Azure DevOps and servers with gitlab, gitea or forgejo in their name. Add any other server here.">
		{servers.map(server => <SettingsRow key={server.host} title={server.host} description={codeHostNames[server.kind]} control={<SettingsButton variant="danger" onClick={() => void onSave(servers.filter(entry => entry.host !== server.host))}><Trash2 />Remove</SettingsButton>} />)}
		<form onSubmit={event => void add(event)} className="flex items-end gap-3 px-4 py-3.5">
			<div className="min-w-0 flex-1"><SettingsField label="Server"><input value={host} onChange={event => setHost(event.target.value)} placeholder="git.example.com" spellCheck={false} autoComplete="off" className={settingsInput} /></SettingsField></div>
			<SettingsField label="Runs"><select value={kind} onChange={event => setKind(event.target.value as CustomCodeHost["kind"])} className={settingsInput}><option value="gitlab">GitLab</option><option value="forgejo">Forgejo or Gitea</option></select></SettingsField>
			<SettingsButton type="submit" disabled={!host.trim()}><Plus />Add</SettingsButton>
		</form>
	</SettingsSection>;
}
