import { useEffect, useState } from "react";
import { Bug, ChevronDown, Download, FlaskConical, Hammer, ListChecks, Play, Plus, Settings, Wrench } from "lucide-react";
import { importableScripts, newScriptId, normalisePreviewUrl, primaryScript, projectScriptIcons, scriptFromProjectFile, scriptMenuLabel, settingsProject, type ProjectScript, type ProjectScriptIcon, type T3ProjectFileState, type T3ProjectScript } from "../../shared/projectSettings";
import type { Project } from "../../shared/workspace";
import { keybindingConflicts, keyLabel, replaceCommandBindings, scriptCommand, type KeybindingEntry } from "../../shared/keybindings";
import { saveKeybindings, useCommands, useKeybindings } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";
import { Conflict, KeyCapture } from "../settings/KeyboardShortcuts";
import { errorText, useWorkspace } from "../app/workspace";
import { createTerminal } from "../lib/terminalSessions";
import { openPreviewWhenReady } from "../lib/actionPreview";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { Tip } from "./ui/tooltip";
import { SettingsButton, SettingsNote, settingsInput } from "../settings/SettingsLayout";

const iconLabels: Record<ProjectScriptIcon, string> = { play: "Play", test: "Test", lint: "Lint", configure: "Configure", build: "Build", debug: "Debug" };

/** T3's script icons. */
export function ScriptIcon({ icon, className = "size-3.5" }: { icon: ProjectScriptIcon; className?: string }) {
	if (icon === "test") return <FlaskConical className={className} />;
	if (icon === "lint") return <ListChecks className={className} />;
	if (icon === "configure") return <Wrench className={className} />;
	if (icon === "build") return <Hammer className={className} />;
	if (icon === "debug") return <Bug className={className} />;
	return <Play className={className} />;
}

/** Saving scripts: they live on the project whose settings apply (a worktree's source project), next to its other settings. */
export function useProjectScripts(projectId?: string) {
	const { api, overview, setOverview } = useWorkspace();
	const project = settingsProject(overview.projects, projectId);
	const scripts = project?.settings?.scripts ?? [];
	const save = async (next: ProjectScript[]) => {
		if (!api || !project) throw new Error("Open the desktop app to change project scripts.");
		// Only one script runs on settle, as in T3: choosing a new one hands the role over.
		setOverview(await api.updateProject({ id: project.id, settings: { ...project.settings, scripts: next } }));
	};
	return {
		project, scripts,
		/** Saves the action and returns its id. */
		upsert: async (input: Omit<ProjectScript, "id">, id?: string) => {
			const script = { ...input, id: id ?? newScriptId(input.name, scripts) };
			const others = input.runOnSettle ? scripts.map(value => value.id === script.id ? value : { ...value, runOnSettle: undefined }) : scripts;
			await save(id ? others.map(value => value.id === id ? script : value) : [...others, script]);
			return script.id;
		},
		/** Deletes the action and its shortcut. */
		remove: async (id: string, entries?: KeybindingEntry[]) => {
			await save(scripts.filter(value => value.id !== id));
			if (project && entries?.some(entry => entry.command === scriptCommand(project.id, id))) await saveKeybindings(replaceCommandBindings(entries, scriptCommand(project.id, id), []));
		},
		move: (id: string, direction: -1 | 1) => { const index = scripts.findIndex(value => value.id === id), next = [...scripts]; if (index < 0 || !next[index + direction]) return Promise.resolve(); [next[index], next[index + direction]] = [next[index + direction], next[index]]; return save(next); },
	};
}

/** Which action to edit; `initial` and `error` reopen an import that failed, filled in, as T3 does. */
export type ScriptEditorRequest = { script?: ProjectScript; initial?: Omit<ProjectScript, "id">; error?: string } | undefined;

/** The scripts in a checkout's t3.json, read when the project changes and whenever `refresh` changes. */
export function useT3ProjectFile(projectId: string | undefined, refresh: unknown = 0) {
	const [state, setState] = useState<T3ProjectFileState>({ status: "missing", scripts: [] });
	useEffect(() => {
		let active = true;
		const api = window.phaseoDesktop?.workspace;
		if (!projectId || !api?.projectFile) { setState({ status: "missing", scripts: [] }); return; }
		void api.projectFile(projectId).then(value => { if (active) setState(value); }, () => { if (active) setState({ status: "missing", scripts: [] }); });
		return () => { active = false; };
	}, [projectId, refresh]);
	return state;
}

/** T3's import: adds a t3.json script as it is, or opens it in the editor with the reason when it cannot be saved. */
export function useImportScript(upsert: (input: Omit<ProjectScript, "id">) => Promise<string>, setEditor: (request: ScriptEditorRequest) => void) {
	return async (file: T3ProjectScript) => {
		const input = scriptFromProjectFile(file);
		try { await upsert(input); } catch (reason) { setEditor({ initial: input, error: errorText(reason) }); }
	};
}

/**
 * T3's Add action / Edit action dialog: an icon and name, a shortcut, the command, and when it runs on its own.
 * The shortcut is saved in keybindings.json as the action's own command, so Keyboard shortcuts lists it too.
 */
export function ProjectScriptDialog({ request, projectId, onClose, onSave, onDelete }: { request: ScriptEditorRequest; projectId?: string; onClose: () => void; onSave: (script: Omit<ProjectScript, "id">, id?: string) => Promise<string>; onDelete?: (id: string, entries?: KeybindingEntry[]) => Promise<void> }) {
	const editing = request?.script;
	const initial = editing ?? request?.initial;
	const keybindings = useKeybindings();
	const shortcutCommand = projectId ? scriptCommand(projectId, editing?.id ?? "new-action") : undefined;
	const savedKey = shortcutCommand && editing ? keybindings.entries.find(entry => entry.command === shortcutCommand && entry.key)?.key ?? "" : "";
	const [key, setKey] = useState("");
	const [icon, setIcon] = useState<ProjectScriptIcon>("play"), [name, setName] = useState(""), [command, setCommand] = useState("");
	const [onWorktree, setOnWorktree] = useState(false), [onSettle, setOnSettle] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(""), [autoOpenPreview, setAutoOpenPreview] = useState(false);
	const [picking, setPicking] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
	useEffect(() => {
		if (!request) return;
		setIcon(initial?.icon ?? "play"); setName(initial?.name ?? ""); setCommand(initial?.command ?? "");
		setOnWorktree(initial?.runOnWorktreeCreate ?? false); setOnSettle(initial?.runOnSettle ?? false); setError(request.error ?? ""); setBusy(false);
		setKey(savedKey); setPreviewUrl(initial?.previewUrl ?? ""); setAutoOpenPreview(initial?.autoOpenPreview ?? false);
		// Only a new request resets the form; a keybindings.json change while editing keeps what was typed.
	}, [request, initial]);
	const conflicts = shortcutCommand && key ? keybindingConflicts(keybindings.rows, { id: "action-editor", command: shortcutCommand, key }) : [];
	/** Writes the shortcut once the action is saved and its id is known. */
	const saveShortcut = async (id: string) => {
		if (!projectId || key === savedKey) return;
		const actionCommand = scriptCommand(projectId, id);
		await saveKeybindings(replaceCommandBindings(keybindings.entries, actionCommand, key ? [{ command: actionCommand, key }] : []));
	};
	const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); onClose(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); } };
	const submit = () => {
		if (!name.trim()) { setError("Give the action a name."); return; }
		if (!command.trim()) { setError("Enter the command to run."); return; }
		let preview: string | undefined;
		if (previewUrl.trim()) { try { preview = normalisePreviewUrl(previewUrl, name.trim()); } catch (reason) { setError(errorText(reason)); return; } }
		void run(async () => { const id = await onSave({ name: name.trim(), command: command.trim(), icon, runOnWorktreeCreate: onWorktree, ...(onSettle ? { runOnSettle: true } : {}), ...(preview ? { previewUrl: preview, ...(autoOpenPreview ? { autoOpenPreview: true } : {}) } : {}) }, editing?.id); await saveShortcut(id); });
	};
	const toggle = (label: string, description: string, checked: boolean, onChange: (value: boolean) => void, disabled = false) => <label className={cn("flex items-center justify-between gap-3 border-t border-border/60 py-2.5 text-[13px]", disabled && "opacity-60")}>
		<span className="min-w-0"><span className="block font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
		<Switch aria-label={label} checked={checked} disabled={busy || disabled} onCheckedChange={onChange} />
	</label>;
	return <Dialog open={Boolean(request)} onOpenChange={open => { if (!open) onClose(); }}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader><DialogTitle>{editing ? "Edit action" : "Add action"}</DialogTitle><DialogDescription>Actions are project commands you can run from the chat header or with a shortcut. Each one opens in a terminal in the chat's checkout.</DialogDescription></DialogHeader>
			<form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); submit(); }}>
				<div className="flex flex-col gap-1.5">
					<label htmlFor="project-script-name" className="text-xs font-semibold">Name</label>
					<div className="flex items-center gap-2">
						<Popover open={picking} onOpenChange={setPicking}>
							<PopoverTrigger render={<button type="button" aria-label="Choose icon" disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-lg border border-input text-foreground hover:bg-accent/60" />}><ScriptIcon icon={icon} className="size-4" /></PopoverTrigger>
							<PopoverContent align="start" className="w-56 p-2">
								<div className="grid grid-cols-3 gap-1">{projectScriptIcons.map(value => <button key={value} type="button" aria-pressed={value === icon} onClick={() => { setIcon(value); setPicking(false); }}
									className={cn("flex flex-col items-center gap-1.5 rounded-md px-2 py-2 text-xs hover:bg-accent/60", value === icon && "bg-primary/10 text-primary")}><ScriptIcon icon={value} className="size-4" />{iconLabels[value]}</button>)}</div>
							</PopoverContent>
						</Popover>
						<input id="project-script-name" autoFocus maxLength={80} placeholder="Test" value={name} disabled={busy} onChange={event => setName(event.target.value)} className={settingsInput} />
					</div>
				</div>
				{projectId && <div className="flex flex-col gap-1.5">
					<label htmlFor="project-script-shortcut" className="text-xs font-semibold">Shortcut</label>
					<div className="flex items-center gap-1.5">
						<KeyCapture id="project-script-shortcut" label={name.trim() || "this action"} value={key} disabled={busy} onCapture={setKey} onCancel={() => setKey(savedKey)} className="h-8 w-full" />
						<Conflict labels={conflicts} />
					</div>
					<p className="text-xs text-muted-foreground">Press a shortcut. Use Backspace to clear. It works while a chat in this project is open.</p>
				</div>}
				<div className="flex flex-col gap-1.5">
					<label htmlFor="project-script-command" className="text-xs font-semibold">Command</label>
					<textarea id="project-script-command" rows={3} maxLength={10_000} placeholder="pnpm test" value={command} disabled={busy} onChange={event => setCommand(event.target.value)} className={cn(settingsInput, "h-auto resize-y py-2 font-mono text-xs leading-relaxed")} />
				</div>
				<div className="flex flex-col gap-1.5">
					<label htmlFor="project-script-preview" className="text-xs font-semibold">Preview URL (optional)</label>
					<input id="project-script-preview" maxLength={2000} placeholder="http://localhost:5173" value={previewUrl} disabled={busy} onChange={event => setPreviewUrl(event.target.value)} className={settingsInput} />
					<p className="text-xs text-muted-foreground">The page this action serves, such as a dev server. It can open in the chat's browser when the action runs.</p>
				</div>
				<div className="flex flex-col">
					{toggle("Open in the browser when this action runs", "Opens the preview URL in the chat's browser once the server answers.", autoOpenPreview && Boolean(previewUrl.trim()), setAutoOpenPreview, !previewUrl.trim())}
					{toggle("Run when a worktree is created", "Starts in its own terminal in each new worktree of this project.", onWorktree, setOnWorktree)}
					{toggle("Run when a chat settles", "Runs in the chat's own worktree, never in a shared checkout. Only one action can do this.", onSettle, setOnSettle)}
				</div>
				{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
				<DialogFooter>
					{editing && onDelete && <span className="mr-auto"><SettingsButton variant="danger" disabled={busy} onClick={() => void run(() => onDelete(editing.id, keybindings.entries))}>Delete</SettingsButton></span>}
					<SettingsButton variant="ghost" disabled={busy} onClick={onClose}>Cancel</SettingsButton>
					<SettingsButton variant="primary" type="submit" disabled={busy}>{editing ? "Save" : "Add action"}</SettingsButton>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}

/**
 * T3's header actions: run the project's main script in one click (it opens in a terminal in this chat's drawer), or
 * pick another, edit one, or add one from the menu. A project with no scripts shows Add action.
 */
export function ProjectScriptsControl({ project, taskId, onRun }: { project: Project; taskId?: string; onRun?: (sessionId: string) => void }) {
	const { setError } = useWorkspace();
	const { project: owner, scripts, upsert, remove } = useProjectScripts(project.id);
	const keybindings = useKeybindings();
	const [editor, setEditor] = useState<ScriptEditorRequest>();
	const [menuOpens, setMenuOpens] = useState(0);
	// t3.json is read from this chat's checkout, and again each time the menu opens.
	const file = useT3ProjectFile(project.id, menuOpens);
	const imports = importableScripts(file.scripts, scripts);
	const importScript = useImportScript(upsert, setEditor);
	const primary = primaryScript(scripts);
	const run = (script: ProjectScript) => void createTerminal({ projectId: project.id, ...(taskId ? { taskId } : {}), scriptId: script.id }).then(session => {
		onRun?.(session.id);
		if (taskId && script.previewUrl && script.autoOpenPreview) openPreviewWhenReady({ taskId, sessionId: session.id, url: script.previewUrl, command: script.command }, setError);
	}, reason => setError(errorText(reason)));
	// Action shortcuts work while this chat is open: the header is mounted only for the open chat.
	const commandOf = (script: ProjectScript) => owner ? scriptCommand(owner.id, script.id) : undefined;
	useCommands(scripts.flatMap(script => commandOf(script) ?? []), command => { const script = scripts.find(value => commandOf(value) === command); if (!script) return false; run(script); });
	const shortcutOf = (script: ProjectScript) => { const command = commandOf(script), row = command && keybindings.rows.find(value => value.command === command && value.key); return row ? keyLabel(row.key, isMac()) : ""; };
	const control = "flex h-7 items-center gap-1 border border-border/80 px-2 text-xs font-medium text-foreground hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-3.5 [&_svg]:shrink-0";
	return <>
		{scripts.length === 0 && imports.length === 0
			? <Tip label="Add action" side="bottom"><button type="button" aria-label="Add action" onClick={() => setEditor({})} className={cn(control, "shrink-0 whitespace-nowrap rounded-md")}><Plus /><span className="hidden xl:inline">Add action</span></button></Tip>
			: <div role="group" aria-label="Project actions" className="flex items-center">
				{primary
					? <Tip label={shortcutOf(primary) ? `Run ${primary.name} (${shortcutOf(primary)})` : `Run ${primary.name}`} side="bottom"><button type="button" aria-label={`Run ${primary.name}`} onClick={() => run(primary)} className={cn(control, "rounded-l-md")}><ScriptIcon icon={primary.icon} /><span className="hidden max-w-32 truncate xl:inline">{primary.name}</span></button></Tip>
					: <Tip label="Project actions" side="bottom"><span className={cn(control, "rounded-l-md text-muted-foreground")}><Wrench /><span className="hidden xl:inline">Actions</span></span></Tip>}
				<DropdownMenu onOpenChange={open => { if (open) setMenuOpens(value => value + 1); }}>
					<DropdownMenuTrigger render={<button type="button" aria-label="Script actions" className={cn(control, "-ml-px rounded-r-md px-1")} />}><ChevronDown /></DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						{scripts.map(script => <DropdownMenuItem key={script.id} onClick={() => run(script)} className="group/script">
							<ScriptIcon icon={script.icon} className="size-4" /><span className="min-w-0 flex-1 truncate">{scriptMenuLabel(script)}</span>
							{/* T3: the shortcut yields its place to the edit button on hover. */}
							<span className="relative ms-auto flex h-6 min-w-6 shrink-0 items-center justify-end">
								{shortcutOf(script) && <DropdownMenuShortcut className="ml-0 tracking-normal transition-opacity group-hover/script:opacity-0 group-focus-visible/script:opacity-0">{shortcutOf(script)}</DropdownMenuShortcut>}
								<button type="button" aria-label={`Edit ${script.name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); setEditor({ script }); }}
									className="absolute top-1/2 right-0 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 group-hover/script:opacity-100 group-focus-visible/script:opacity-100 hover:bg-accent hover:text-foreground"><Settings className="size-3.5" /></button>
							</span>
						</DropdownMenuItem>)}
						{imports.length > 0 && <>
							{scripts.length > 0 && <DropdownMenuSeparator />}
							<DropdownMenuGroup>
								<DropdownMenuLabel>From t3.json</DropdownMenuLabel>
								{imports.map(item => <DropdownMenuItem key={`${item.name} ${item.command}`} onClick={() => void importScript(item)}>
									<ScriptIcon icon={item.icon ?? "play"} className="size-4" /><span className="min-w-0 flex-1 truncate">{item.name}</span><Download aria-label="Import" className="ms-auto size-3.5 text-muted-foreground" />
								</DropdownMenuItem>)}
							</DropdownMenuGroup>
						</>}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => setEditor({})}><Plus />Add action</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>}
		<ProjectScriptDialog request={editor} projectId={owner?.id} onClose={() => setEditor(undefined)} onSave={upsert} onDelete={remove} />
	</>;
}
