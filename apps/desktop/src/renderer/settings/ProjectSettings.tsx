import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { defaultPreferences, type WorkspacePreferences } from "../../shared/preferences";
import { settingsProject, type ProjectSettings as Settings } from "../../shared/projectSettings";
import { errorText, useWorkspace } from "../app/workspace";
import { Select } from "../components/Select";
import { ProjectScriptDialog, ScriptIcon, useProjectScripts, type ScriptEditorRequest } from "../components/ProjectScripts";
import { Tip } from "../components/ui/tooltip";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";
import { cn } from "../lib/utils";
import { keyLabel, scriptCommand } from "../../shared/keybindings";
import { useKeybindings } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";

const dayChoices = [1, 2, 3, 5, 7, 14, 30];
const days = (value: number) => value === 1 ? "After 1 day" : `After ${value} days`;

/** The workspace's auto-settle settings, shown as what "Same as General" means. */
function useWorkspacePreferences() {
	const api = window.phaseoDesktop?.workspace;
	const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultPreferences);
	useEffect(() => { let active = true; void api?.preferences().then(value => { if (active) setPreferences(value.preferences); }, () => undefined); return () => { active = false; }; }, [api]);
	return preferences;
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
	return <Tip label={label}><button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5">{children}</button></Tip>;
}

/**
 * T3's Project settings page: the project's name, its own auto-settle settings (each one follows General until
 * changed), and its actions. Worktrees share their project's page.
 */
export function ProjectSettingsPage() {
	const { api, overview, setOverview, settingsProjectId } = useWorkspace();
	const preferences = useWorkspacePreferences();
	const opened = overview.projects.find(value => value.id === settingsProjectId);
	const project = settingsProject(overview.projects, settingsProjectId);
	const { scripts, upsert, remove, move } = useProjectScripts(project?.id);
	const [editor, setEditor] = useState<ScriptEditorRequest>();
	const keybindings = useKeybindings();
	const [busy, setBusy] = useState(false), [error, setError] = useState("");
	if (!project) return <SettingsPageLayout title="Project settings"><p className="text-sm text-muted-foreground">This project is no longer in your workspace.</p></SettingsPageLayout>;
	const settings: Settings = project.settings ?? {};
	const save = async (update: { name?: string; settings?: Settings }) => {
		if (!api) { setError("Open the desktop app to change project settings."); return; }
		setBusy(true); setError("");
		try { setOverview(await api.updateProject({ id: project.id, ...update })); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	const override = <K extends keyof Settings>(key: K, value: Settings[K] | "inherit") => { const next = { ...settings }; if (value === "inherit") delete next[key]; else next[key] = value as Settings[K]; void save({ settings: next }); };
	const toggle = (key: "autoSettleOnMerge" | "keepPullRequests", title: string, description: string) => <SettingsRow title={title} description={description}
		control={<Select label={title} disabled={busy} value={settings[key] === undefined ? "inherit" : settings[key] ? "on" : "off"} onValueChange={value => override(key, value === "inherit" ? "inherit" : value === "on")}
			options={[{ value: "inherit", label: `Same as General (${preferences[key] ? "on" : "off"})` }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} />} />;
	const inheritedDays = preferences.autoSettleAfterDays;
	const shownDays = [...new Set([...dayChoices, ...(typeof settings.autoSettleAfterDays === "number" ? [settings.autoSettleAfterDays] : [])])].sort((a, b) => a - b);
	return <SettingsPageLayout title="Project settings" description={<>Settings for <span className="font-medium text-foreground">{project.name}</span>. Anything left as “Same as General” follows Settings → General.</>}>
		{opened?.worktree && <p role="status" className="-mt-5 text-xs text-muted-foreground">You opened this from the worktree {opened.worktree.branch}. Worktrees use their project's settings.</p>}
		<SettingsSection title="Project">
			<SettingsRow title="Name" description="How this project appears in the sidebar and chat lists."
				control={<input key={`${project.id}:${project.name}`} aria-label="Project name" maxLength={200} defaultValue={project.name} disabled={busy} className={cn(settingsInput, "w-64")}
					onBlur={event => { const name = event.target.value.trim(); if (name && name !== project.name) void save({ name }); else event.target.value = project.name; }}
					onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = project.name; event.currentTarget.blur(); } }} />} />
			<SettingsRow title="Folder" description={<span className="font-mono break-all">{project.directory}</span>} />
		</SettingsSection>
		<SettingsSection title="Code chats" description="When chats in this project settle on their own." label="Project auto-settle">
			{toggle("autoSettleOnMerge", "Auto-settle merged chats", "Settle a chat when its pull request merges. Closed pull requests still settle it.")}
			{toggle("keepPullRequests", "Keep chats with a pull request", "Inactivity does not settle chats with a pull request. Merging and closing still do.")}
			<SettingsRow title="Auto-settle inactive chats" description="Chats with no activity for this long settle automatically."
				control={<Select label="Auto-settle inactive chats" disabled={busy} value={settings.autoSettleAfterDays === undefined ? "inherit" : String(settings.autoSettleAfterDays ?? "never")}
					onValueChange={value => override("autoSettleAfterDays", value === "inherit" ? "inherit" : value === "never" ? null : Number(value))}
					options={[{ value: "inherit", label: `Same as General (${inheritedDays === null ? "never" : days(inheritedDays).toLowerCase()})` }, { value: "never", label: "Never" }, ...shownDays.map(value => ({ value: String(value), label: days(value) }))]} />} />
		</SettingsSection>
		<SettingsSection title="Actions" description="Commands for this project, run from the chat header in a terminal in the chat's checkout." label="Project actions"
			action={<SettingsButton disabled={busy} onClick={() => setEditor({})}><Plus />Add action</SettingsButton>}>
			{scripts.length === 0 && <p className="px-4 py-5 text-center text-xs text-muted-foreground">No actions yet. Add one for a dev server, tests or a clean-up when chats settle.</p>}
			{scripts.map((script, index) => <SettingsRow key={script.id} icon={<ScriptIcon icon={script.icon} />}
				title={<span className="flex items-center gap-2">{script.name}{script.runOnWorktreeCreate && <span className="text-[11px] font-medium text-muted-foreground">Runs on new worktrees</span>}{script.runOnSettle && <span className="text-[11px] font-medium text-info">Runs on settle</span>}</span>}
				description={<span className="block truncate font-mono">{script.command}</span>}
				control={<>
					{(() => { const row = keybindings.rows.find(value => value.command === scriptCommand(project.id, script.id) && value.key); return row ? <span className="mr-1 text-xs text-muted-foreground">{keyLabel(row.key, isMac())}</span> : null; })()}
					<IconButton label="Move up" disabled={busy || index === 0} onClick={() => void move(script.id, -1).catch(reason => setError(errorText(reason)))}><ArrowUp /></IconButton>
					<IconButton label="Move down" disabled={busy || index === scripts.length - 1} onClick={() => void move(script.id, 1).catch(reason => setError(errorText(reason)))}><ArrowDown /></IconButton>
					<IconButton label={`Edit ${script.name}`} disabled={busy} onClick={() => setEditor({ script })}><Pencil /></IconButton>
				</>} />)}
		</SettingsSection>
		{error && <SettingsNote tone="error" role="alert" className="-mt-5 px-0.5">{error}</SettingsNote>}
		<ProjectScriptDialog request={editor} projectId={project.id} onClose={() => setEditor(undefined)} onSave={upsert} onDelete={remove} />
	</SettingsPageLayout>;
}
