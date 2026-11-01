import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { defaultPreferences, type WorkspacePreferences } from "../../shared/preferences";
import { importableScripts, settingsProject, type ProjectSettings as Settings } from "../../shared/projectSettings";
import { errorText, useWorkspace } from "../app/workspace";
import { Select } from "../components/Select";
import { ProjectScriptDialog, ScriptIcon, useImportScript, useProjectScripts, useT3ProjectFile, type ScriptEditorRequest } from "../components/ProjectScripts";
import { ProjectIconGlyph, ProjectIconPickerDialog } from "../components/ProjectIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { useRemoveProject } from "./removeProject";
import { Tip } from "../components/ui/tooltip";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";
import { cn } from "../lib/utils";
import { keyLabel, scriptCommand } from "../../shared/keybindings";
import { useKeybindings } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";
import { mergeMethodLabels } from "../views/pullRequests/pullRequestLogic";
import { Switch } from "../components/ui/switch";
import { ModelPicker, harnessNames } from "../chat/ModelPicker";
import { ModelSettings } from "../chat/ModelSettings";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import type { Harness } from "../../shared/workspace";

const dayChoices = [1, 2, 3, 5, 7, 14, 30];
const days = (value: number) => value === 1 ? "After 1 day" : `After ${value} days`;

/** The workspace's auto-settle settings, shown as what "Same as General" means. */
function useWorkspacePreferences() {
	const api = window.phaseoDesktop?.workspace;
	const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultPreferences);
	useEffect(() => { let active = true; void api?.preferences().then(value => { if (active) setPreferences(value.preferences); }, () => undefined); return () => { active = false; }; }, [api]);
	return preferences;
}

/** Signed-in agents, and any turned off here that are no longer signed in, so they can be turned back on. */
function agentChoices(connected: Set<Harness>, disabled: readonly Harness[] = []) {
	const order = Object.keys(harnessNames) as Harness[];
	return order.filter(harness => connected.has(harness) || disabled.includes(harness));
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
	return <Tip label={label}><button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5">{children}</button></Tip>;
}

/**
 * T3's Project settings page: the project's name and icon, its own auto-settle settings (each one follows General
 * until changed), its actions (with t3.json imports), and Remove project. Worktrees share their project's page.
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
	const [picking, setPicking] = useState(false);
	const file = useT3ProjectFile(project?.id);
	const importScript = useImportScript(upsert, setEditor);
	const removeProject = useRemoveProject();
	const connected = useConnectedHarnesses();
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
	const imports = importableScripts(file.scripts, scripts);
	const iconDescription = settings.icon?.kind === "lucide" ? `${settings.icon.name} · ${settings.icon.color}` : settings.icon?.kind === "monogram" ? `${settings.icon.text} · ${settings.icon.color}` : settings.icon?.kind === "emoji" ? settings.icon.emoji : "Automatic";
	const shownDays = [...new Set([...dayChoices, ...(typeof settings.autoSettleAfterDays === "number" ? [settings.autoSettleAfterDays] : [])])].sort((a, b) => a - b);
	return <SettingsPageLayout title="Project settings" description={<>Settings for <span className="font-medium text-foreground">{project.name}</span>. Anything left as “Same as General” follows Settings → General.</>}>
		{opened?.worktree && <p role="status" className="-mt-5 text-xs text-muted-foreground">You opened this from the worktree {opened.worktree.branch}. Worktrees use their project's settings.</p>}
		<SettingsSection title="Project">
			<SettingsRow title="Name" description="How this project appears in the sidebar and chat lists."
				control={<input key={`${project.id}:${project.name}`} aria-label="Project name" maxLength={200} defaultValue={project.name} disabled={busy} className={cn(settingsInput, "w-64")}
					onBlur={event => { const name = event.target.value.trim(); if (name && name !== project.name) void save({ name }); else event.target.value = project.name; }}
					onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = project.name; event.currentTarget.blur(); } }} />} />
			<SettingsRow title="Project icon" description={iconDescription}
				control={<div className="flex items-center gap-2">
					<ProjectIconGlyph icon={settings.icon} name={project.name} className="size-6" />
					{settings.icon && <SettingsButton variant="ghost" disabled={busy} onClick={() => override("icon", "inherit")}>Reset</SettingsButton>}
					<SettingsButton disabled={busy} onClick={() => setPicking(true)}>Choose icon</SettingsButton>
				</div>} />
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
		<SettingsSection title="New chats" description="What new Code chats in this project start with. Each can still be changed before sending." label="Project new chat defaults">
			<SettingsRow title="Model" description={settings.defaultModel ? "New chats start with this model and its settings." : "New chats start with the model you chose last."}
				control={<>
					{settings.defaultModel && <><SettingsButton variant="ghost" disabled={busy} onClick={() => override("defaultModel", "inherit")}>Reset</SettingsButton><ModelSettings selection={settings.defaultModel} onChange={next => override("defaultModel", next)} disabled={busy} /></>}
					<ModelPicker selections={settings.defaultModel ? [settings.defaultModel] : []} onChange={values => { if (values[0]) override("defaultModel", values[0]); }} agents disabled={busy} hidden={settings.disabledHarnesses} className="border border-border" />
				</>} />
			<SettingsRow title="Permissions" description="How much the agent may do without asking."
				control={<Select label="Project default permissions" disabled={busy} value={settings.defaultPermissionMode ?? "inherit"} onValueChange={value => override("defaultPermissionMode", value === "supervised" || value === "accept-edits" || value === "full-access" ? value : "inherit")}
					options={[{ value: "inherit", label: "Last used" }, { value: "supervised", label: "Ask first" }, { value: "accept-edits", label: "Accept edits" }, { value: "full-access", label: "Full access" }]} />} />
			<SettingsRow title="Workspace" description="Where new chats work: the project's own checkout, or a new worktree on its own branch."
				control={<Select label="Project default workspace" disabled={busy} value={settings.defaultWorkspace ?? "inherit"} onValueChange={value => override("defaultWorkspace", value === "local" || value === "worktree" ? value : "inherit")}
					options={[{ value: "inherit", label: "Last used" }, { value: "local", label: "Local" }, { value: "worktree", label: "New worktree" }]} />} />
		</SettingsSection>
		<SettingsSection title="Agents" description="Turn an agent off to keep it out of this project's model pickers. Chats in the project can't start on it." label="Project agents">
			{agentChoices(connected, settings.disabledHarnesses).map(harness => { const off = settings.disabledHarnesses?.includes(harness) ?? false; return <SettingsRow key={harness} title={harnessNames[harness]} description={off ? "Turned off for this project." : settings.defaultModel?.harness === harness ? "Runs the project's default model. Reset the model to turn it off." : undefined}
				control={<Switch aria-label={`Use ${harnessNames[harness]} in this project`} disabled={busy || (!off && settings.defaultModel?.harness === harness)} checked={!off}
					onCheckedChange={on => { const rest = (settings.disabledHarnesses ?? []).filter(value => value !== harness); override("disabledHarnesses", on ? (rest.length ? rest : "inherit") : [...rest, harness]); }} />} />; })}
		</SettingsSection>
		<SettingsSection title="Pull requests" label="Project pull requests">
			<SettingsRow title="Default merge method" description="Pull requests in this project start with this method."
				control={<Select label="Project default merge method" disabled={busy} value={settings.pullRequestMergeMethod ?? "inherit"} onValueChange={value => override("pullRequestMergeMethod", value === "merge" || value === "squash" || value === "rebase" ? value : "inherit")}
					options={[{ value: "inherit", label: `Same as General (${preferences.pullRequestMergeMethod ? mergeMethodLabels[preferences.pullRequestMergeMethod].toLowerCase() : "last selected"})` }, { value: "merge", label: mergeMethodLabels.merge }, { value: "squash", label: mergeMethodLabels.squash }, { value: "rebase", label: mergeMethodLabels.rebase }]} />} />
		</SettingsSection>
		<SettingsSection title="Actions" description="Commands for this project, run from the chat header in a terminal in the chat's checkout." label="Project actions"
			action={<span className="flex items-center gap-1.5">
				{imports.length > 0 && <DropdownMenu>
					<DropdownMenuTrigger render={<button type="button" disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5" />}>Import scripts<ChevronDown /></DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-72">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Import from t3.json</DropdownMenuLabel>
							<p className="px-2 pb-2 text-xs text-pretty text-muted-foreground">Add actions declared by this checkout without editing them first.</p>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						{imports.map(item => <DropdownMenuItem key={`${item.name} ${item.command}`} onClick={() => void importScript(item)}>
							<ScriptIcon icon={item.icon ?? "play"} className="size-4 shrink-0" />
							<span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.name}</span><span className="block truncate font-mono text-muted-foreground">{item.command}</span></span>
						</DropdownMenuItem>)}
					</DropdownMenuContent>
				</DropdownMenu>}
				<SettingsButton disabled={busy} onClick={() => setEditor({})}><Plus />Add action</SettingsButton>
			</span>}>
			{scripts.length === 0 && <p className="px-4 py-5 text-center text-xs text-muted-foreground">No actions yet. Add one for a dev server, tests or a clean-up when chats settle.</p>}
			{scripts.map((script, index) => <SettingsRow key={script.id} icon={<ScriptIcon icon={script.icon} />}
				title={<span className="flex items-center gap-2">{script.name}{script.runOnWorktreeCreate && <span className="text-[11px] font-medium text-muted-foreground">Runs on new worktrees</span>}{script.runOnSettle && <span className="text-[11px] font-medium text-info">Runs on settle</span>}{script.previewUrl && <span className="truncate text-[11px] font-medium text-muted-foreground">{script.autoOpenPreview ? "Opens" : "Serves"} {script.previewUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}</span>}
				description={<span className="block truncate font-mono">{script.command}</span>}
				control={<>
					{(() => { const row = keybindings.rows.find(value => value.command === scriptCommand(project.id, script.id) && value.key); return row ? <span className="mr-1 text-xs text-muted-foreground">{keyLabel(row.key, isMac())}</span> : null; })()}
					<IconButton label="Move up" disabled={busy || index === 0} onClick={() => void move(script.id, -1).catch(reason => setError(errorText(reason)))}><ArrowUp /></IconButton>
					<IconButton label="Move down" disabled={busy || index === scripts.length - 1} onClick={() => void move(script.id, 1).catch(reason => setError(errorText(reason)))}><ArrowDown /></IconButton>
					<IconButton label={`Edit ${script.name}`} disabled={busy} onClick={() => setEditor({ script })}><Pencil /></IconButton>
				</>} />)}
			{file.status === "invalid" && <SettingsRow title={<span className="text-warning">t3.json is invalid</span>} description="A t3.json exists in this checkout but fails to parse, so every action it declares is ignored. Check the JSON syntax and icon values." />}
		</SettingsSection>
		<SettingsSection title="Danger" label="Remove project">
			<SettingsRow title="Remove project" description={`Deletes the project entry and its chats${overview.projects.some(value => value.worktree?.sourceProjectId === project.id) ? ", with its worktrees' entries and chats" : ""}. Files on disk are not touched.`}
				control={<SettingsButton variant="danger" disabled={busy} onClick={() => void removeProject(project)}><Trash2 />Remove project</SettingsButton>} />
		</SettingsSection>
		{error && <SettingsNote tone="error" role="alert" className="-mt-5 px-0.5">{error}</SettingsNote>}
		<ProjectIconPickerDialog current={settings.icon} projectName={project.name} open={picking} onOpenChange={setPicking} onSelect={icon => override("icon", icon)} />
		<ProjectScriptDialog request={editor} projectId={project.id} onClose={() => setEditor(undefined)} onSave={upsert} onDelete={remove} />
	</SettingsPageLayout>;
}
