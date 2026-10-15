import { useEffect, useRef, useState } from "react";
import { defaultPreferences, type WorkspacePreferences } from "../../shared/preferences";
import { cn } from "../lib/utils";
import type { InstructionDocument } from "../../shared/instructions";
import { errorText } from "../app/workspace";
import { setDefaultModel, useModelPreferences, type ModelSelection } from "../lib/modelPreferences";
import { useBackgroundRefresh } from "../lib/useBackgroundRefresh";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { ModelPicker } from "../chat/ModelPicker";
import { ModelSettings } from "../chat/ModelSettings";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

/** Workspace preferences, loaded once and saved one change at a time. */
function usePreferences() {
	const api = window.phaseoDesktop?.workspace;
	const [preferences, setPreferences] = useState(defaultPreferences);
	const [supported, setSupported] = useState<boolean>();
	const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
	const pending = useRef(false);
	useEffect(() => {
		if (!api) { setLoading(false); setError("Open the desktop application to load settings."); return; }
		let active = true;
		void api.preferences().then(value => { if (active) { setPreferences(value.preferences); setSupported(value.notificationsSupported); } }, reason => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [api]);
	async function save(value: WorkspacePreferences) {
		if (!api || pending.current || loading || supported === undefined) return;
		pending.current = true; setBusy(true); setError("");
		try { setPreferences(await api.savePreferences(value)); }
		catch (reason) { setError(errorText(reason)); }
		finally { pending.current = false; setBusy(false); }
	}
	return { preferences, supported, loading, busy, error, save, ready: !loading && supported !== undefined };
}

function DefaultModel() {
	const preferences = useModelPreferences();
	const [fixed, setFixed] = useState(!!preferences.defaultSelection);
	const selection: ModelSelection | undefined = preferences.defaultSelection ?? preferences.recentSelection;
	const choose = (next: ModelSelection) => setDefaultModel(next);
	return <>
		<SettingsRow title="Model for new chats" description={fixed ? "New chats start with this model and its settings." : "New chats start with the model you used last."}
			control={<Select label="New chat model selection" value={fixed ? "fixed" : "recent"} onValueChange={value => { const next = value === "fixed"; setFixed(next); if (next && selection) choose(selection); if (!next) setDefaultModel(undefined); }}
				options={[{ value: "recent", label: "Last used" }, { value: "fixed", label: "Always the same" }]} />} />
		{fixed && <SettingsRow title="Default model" description="Used for every new chat until you change it here."
			control={<>{selection ? <ModelSettings selection={selection} onChange={choose} /> : null}<ModelPicker selections={selection ? [selection] : []} onChange={values => { if (values[0]) choose(values[0]); }} className="border border-border" /></>} />}
	</>;
}

function GlobalInstructions() {
	const api = window.phaseoDesktop?.workspace;
	const [document, setDocument] = useState<InstructionDocument>(); const [content, setContent] = useState("");
	const [busy, setBusy] = useState(true), [error, setError] = useState(""), [saved, setSaved] = useState(false), [attempt, setAttempt] = useState(0);
	const pending = useRef(false);
	useEffect(() => {
		let active = true; setBusy(true); setError(""); pending.current = true;
		if (!api) { setBusy(false); setError("Open the desktop app to edit instructions."); pending.current = false; return; }
		void api.globalInstructions().then(value => { if (active) { setDocument(value); setContent(value.content); } }, reason => { if (active) setError(errorText(reason)); }).finally(() => { if (active) { setBusy(false); pending.current = false; } });
		return () => { active = false; };
	}, [api, attempt]);
	useBackgroundRefresh(() => { if (api && !pending.current && (!document || content === document.content)) setAttempt(value => value + 1); });
	async function save() {
		if (!api || !document || pending.current) return;
		pending.current = true; setBusy(true); setError(""); setSaved(false);
		try { const value = await api.saveGlobalInstructions({ content, expectedHash: document.hash }); setDocument(value); setContent(value.content); setSaved(true); }
		catch (reason) { setError(errorText(reason)); }
		finally { pending.current = false; setBusy(false); }
	}
	return <SettingsSection title="Instructions" description="Apply to every Phaseo chat. A project's own instructions take precedence." label="Global instructions">
		<SettingsRow title="Global instructions" description="Written to AGENTS.md in your Phaseo profile." control={<SettingsButton variant="primary" disabled={busy || !document || content === document.content} onClick={() => void save()}>Save instructions</SettingsButton>}>
			<textarea aria-label="Global instructions text" value={content} disabled={busy || !document} rows={8} placeholder="For example: answer in British English, and keep explanations short."
				onChange={event => { setContent(event.target.value); setSaved(false); }} className={cn(settingsInput, "h-auto min-h-32 resize-y py-2 leading-relaxed")} />
		</SettingsRow>
		{saved && <SettingsNote role="status">Instructions saved.</SettingsNote>}
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</SettingsSection>;
}

export function GeneralSettings() {
	const { preferences, loading, busy, error, save, ready } = usePreferences();
	return <SettingsPageLayout title="General">
		<SettingsSection title="New chats"><DefaultModel /></SettingsSection>
		<SettingsSection title="Agents" description="Agents are chats your chats start to work in parallel." label="Agents">
			<SettingsRow title="Agents running at once" description="The most agents working at the same time across the workspace. Each one is a separate model call, billed to your account."
				control={<input type="number" min={1} max={256} step={1} aria-label="Agents running at once" key={preferences.maxActiveAgents} defaultValue={preferences.maxActiveAgents} disabled={!ready || busy}
					onBlur={event => { const value = Math.round(Number(event.target.value)); if (Number.isFinite(value) && value >= 1 && value <= 256 && value !== preferences.maxActiveAgents) void save({ ...preferences, maxActiveAgents: value }); else event.target.value = String(preferences.maxActiveAgents); }}
					onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
					className={cn(settingsInput, "w-20 text-right")} />} />
			{(loading || error) && <SettingsNote tone={error ? "error" : "muted"} role={error ? "alert" : "status"}>{error || "Loading settings…"}</SettingsNote>}
		</SettingsSection>
		<SettingsSection title="Code chats" description="Settle a chat when you are done with it; it moves to Settled at the bottom of the sidebar." label="Code chats">
			<SettingsRow title="Auto-settle inactive chats" description="Code chats with no activity for this long settle automatically. Any new activity un-settles a chat."
				control={<Select label="Auto-settle inactive chats" disabled={!ready || busy} value={String(preferences.autoSettleAfterDays ?? "never")}
					onValueChange={value => void save({ ...preferences, autoSettleAfterDays: value === "never" ? null : Number(value) })}
					options={[{ value: "never", label: "Never" }, ...[...new Set([1, 2, 3, 5, 7, 14, 30, ...(preferences.autoSettleAfterDays ? [preferences.autoSettleAfterDays] : [])])].sort((a, b) => a - b).map(days => ({ value: String(days), label: days === 1 ? "After 1 day" : `After ${days} days` }))]} />} />
		</SettingsSection>
		<GlobalInstructions />
	</SettingsPageLayout>;
}

export function NotificationSettings() {
	const { preferences, supported, loading, busy, error, save, ready } = usePreferences();
	return <SettingsPageLayout title="Notifications">
		<SettingsSection title="Desktop alerts" label="Notifications">
			<SettingsRow title="Desktop alerts" description="Hear about chats while Phaseo is in the background."
				control={<Select label="Desktop alerts" disabled={!ready || busy} value={preferences.notifications} onValueChange={value => void save({ ...preferences, notifications: value as WorkspacePreferences["notifications"] })}
					options={[{ value: "off", label: "Off" }, { value: "attention", label: "Needs attention" }, { value: "all", label: "Every update" }]} />} />
			<SettingsRow title="Show chat titles" description="Alerts name the chat. What was said always stays private."
				control={<Switch aria-label="Show task titles" checked={preferences.notificationTitles} disabled={!ready || busy} onCheckedChange={checked => void save({ ...preferences, notificationTitles: checked })} />} />
			{supported === false && <SettingsNote role="status">Desktop notifications are unavailable on this system.</SettingsNote>}
			{(loading || busy || error) && <SettingsNote tone={error ? "error" : "muted"} role={error ? "alert" : "status"}>{error || (loading ? "Loading settings…" : "Saving…")}</SettingsNote>}
		</SettingsSection>
	</SettingsPageLayout>;
}
