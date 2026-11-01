import { useEffect, useState, type FormEvent } from "react";
import { Copy, Trash2 } from "lucide-react";
import { claudeCodeCommand, outsideAgentAccessLabels, type OutsideAgentAccess, type OutsideAgentSettings as Settings } from "../../shared/outsideAgents";
import { Switch } from "../components/ui/switch";
import { showToast } from "../components/ui/toast";
import { errorText } from "../app/workspace";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => showToast("success", `${what} copied`), () => showToast("error", `Could not copy the ${what.toLowerCase()}`));

/** Settings ▸ Outside agents: lets Claude Code, Codex or another MCP client on this computer list, read, start and message chats. */
export function OutsideAgentSettings() {
	const api = window.phaseoDesktop?.workspace;
	const [settings, setSettings] = useState<Settings>();
	const [error, setError] = useState<string>();
	const [name, setName] = useState(""), [access, setAccess] = useState<OutsideAgentAccess>("read"), [port, setPort] = useState("");
	const [created, setCreated] = useState<{ name: string; token: string }>();
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!api) return;
		void api.outsideAgents().then(setSettings, reason => setError(errorText(reason)));
		return api.onOutsideAgentsChanged(setSettings);
	}, [api]);
	const run = async (work: () => Promise<Settings | undefined>) => {
		if (busy) return; setBusy(true);
		try { const next = await work(); if (next) setSettings(next); setError(undefined); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	const create = (event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await api!.createOutsideAgentToken({ name, access }); setCreated({ name: name.trim(), token: result.token }); setName(""); return result.settings; }); };
	const savePort = () => { const value = Number(port); if (!port.trim() || !settings || value === settings.port) { setPort(""); return; } void run(async () => { const next = await api!.setOutsideAgentsEnabled(settings.enabled, value); setPort(""); return next; }); };
	if (!api) return null;
	return <SettingsPageLayout title="Outside agents" description="Let an agent you run yourself, such as Claude Code or Codex in a terminal, use Phaseo's chats through an MCP server on this computer. It can list and read chats, and with a token that allows it, start chats and message them.">
		{error && <SettingsNote role="alert" tone="error" className="px-0.5 py-0">{error}</SettingsNote>}
		<SettingsSection title="Server">
			<SettingsRow title="Allow outside agents" description={!settings ? "Checking…" : settings.enabled ? settings.running ? `Listening on ${settings.url}, reachable only from this computer.` : settings.error ?? "Starting…" : "Off. Nothing listens until you turn it on."}
				control={<Switch aria-label="Allow outside agents" checked={settings?.enabled ?? false} disabled={!settings || busy} onCheckedChange={(checked: boolean) => void run(() => api.setOutsideAgentsEnabled(checked))} />} />
			<SettingsRow title="Port" description="Agents connect to 127.0.0.1 on this port. Change it if another program uses it."
				control={<input aria-label="Port" inputMode="numeric" value={port || String(settings?.port ?? "")} onChange={event => setPort(event.target.value.replace(/\D/g, "").slice(0, 5))} onBlur={savePort} onKeyDown={event => { if (event.key === "Enter") savePort(); }} className={`${settingsInput} w-24 text-right font-mono`} />} />
		</SettingsSection>
		<SettingsSection title="Tokens" description="Each agent signs in with a token. Chats an agent starts run supervised, so you approve their actions here, and what it sends shows in the chat with its name.">
			{created && settings && <div className="flex flex-col gap-2 px-4 py-3.5">
				<p role="status" className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Copy the token for {created.name} now.</span> It won't be shown again. To add it to Claude Code, run this in a terminal:</p>
				<div className="flex items-center gap-2">
					<code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{claudeCodeCommand(settings.url, created.token)}</code>
					<SettingsButton onClick={() => copy(claudeCodeCommand(settings.url, created.token), "Command")}><Copy />Copy command</SettingsButton>
					<SettingsButton onClick={() => copy(created.token, "Token")}><Copy />Copy token</SettingsButton>
				</div>
			</div>}
			{settings?.tokens.map(token => <SettingsRow key={token.id} title={token.name} description={`${outsideAgentAccessLabels[token.access]}. Made ${new Date(token.createdAt).toLocaleDateString()}${token.lastUsedAt ? `, last used ${new Date(token.lastUsedAt).toLocaleString()}` : ", not used yet"}.`}
				control={<SettingsButton variant="danger" disabled={busy} onClick={() => void run(async () => { const next = await api.revokeOutsideAgentToken(token.id); if (created) setCreated(undefined); return next; })}><Trash2 />Revoke</SettingsButton>} />)}
			{settings && !settings.tokens.length && <SettingsNote>No tokens yet.</SettingsNote>}
			<form onSubmit={create} className="flex items-end gap-3 px-4 py-3.5">
				<div className="min-w-0 flex-1"><SettingsField label="Name"><input value={name} onChange={event => setName(event.target.value)} placeholder="Claude Code in a terminal" maxLength={60} autoComplete="off" className={settingsInput} /></SettingsField></div>
				<SettingsField label="Can"><select value={access} onChange={event => setAccess(event.target.value as OutsideAgentAccess)} className={settingsInput}><option value="read">{outsideAgentAccessLabels.read}</option><option value="start">{outsideAgentAccessLabels.start}</option></select></SettingsField>
				<SettingsButton type="submit" variant="primary" disabled={busy || !name.trim()}>Make token</SettingsButton>
			</form>
		</SettingsSection>
	</SettingsPageLayout>;
}
