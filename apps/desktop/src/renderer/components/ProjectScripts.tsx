import { useEffect, useState } from "react";
import { Bug, ChevronDown, FlaskConical, Hammer, ListChecks, Play, Plus, Settings, Wrench } from "lucide-react";
import { newScriptId, primaryScript, projectScriptIcons, scriptMenuLabel, settingsProject, type ProjectScript, type ProjectScriptIcon } from "../../shared/projectSettings";
import type { Project } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { createTerminal } from "../lib/terminalSessions";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
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
		upsert: (input: Omit<ProjectScript, "id">, id?: string) => {
			const script = { ...input, id: id ?? newScriptId(input.name, scripts) };
			const others = input.runOnSettle ? scripts.map(value => value.id === script.id ? value : { ...value, runOnSettle: undefined }) : scripts;
			return save(id ? others.map(value => value.id === id ? script : value) : [...others, script]);
		},
		remove: (id: string) => save(scripts.filter(value => value.id !== id)),
		move: (id: string, direction: -1 | 1) => { const index = scripts.findIndex(value => value.id === id), next = [...scripts]; if (index < 0 || !next[index + direction]) return Promise.resolve(); [next[index], next[index + direction]] = [next[index + direction], next[index]]; return save(next); },
	};
}

export type ScriptEditorRequest = { script?: ProjectScript } | undefined;

/** T3's Add action / Edit action dialog: an icon and name, the command, and when it runs on its own. */
export function ProjectScriptDialog({ request, onClose, onSave, onDelete }: { request: ScriptEditorRequest; onClose: () => void; onSave: (script: Omit<ProjectScript, "id">, id?: string) => Promise<void>; onDelete?: (id: string) => Promise<void> }) {
	const editing = request?.script;
	const [icon, setIcon] = useState<ProjectScriptIcon>("play"), [name, setName] = useState(""), [command, setCommand] = useState("");
	const [onWorktree, setOnWorktree] = useState(false), [onSettle, setOnSettle] = useState(false);
	const [picking, setPicking] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
	useEffect(() => {
		if (!request) return;
		setIcon(editing?.icon ?? "play"); setName(editing?.name ?? ""); setCommand(editing?.command ?? "");
		setOnWorktree(editing?.runOnWorktreeCreate ?? false); setOnSettle(editing?.runOnSettle ?? false); setError(""); setBusy(false);
	}, [request, editing]);
	const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); onClose(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); } };
	const submit = () => {
		if (!name.trim()) { setError("Give the action a name."); return; }
		if (!command.trim()) { setError("Enter the command to run."); return; }
		void run(() => onSave({ name: name.trim(), command: command.trim(), icon, runOnWorktreeCreate: onWorktree, ...(onSettle ? { runOnSettle: true } : {}) }, editing?.id));
	};
	const toggle = (label: string, description: string, checked: boolean, onChange: (value: boolean) => void) => <label className="flex items-center justify-between gap-3 border-t border-border/60 py-2.5 text-[13px]">
		<span className="min-w-0"><span className="block font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
		<Switch aria-label={label} checked={checked} disabled={busy} onCheckedChange={onChange} />
	</label>;
	return <Dialog open={Boolean(request)} onOpenChange={open => { if (!open) onClose(); }}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader><DialogTitle>{editing ? "Edit action" : "Add action"}</DialogTitle><DialogDescription>Actions are project commands you can run from the chat header. Each one opens in a terminal in the chat's checkout.</DialogDescription></DialogHeader>
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
				<div className="flex flex-col gap-1.5">
					<label htmlFor="project-script-command" className="text-xs font-semibold">Command</label>
					<textarea id="project-script-command" rows={3} maxLength={10_000} placeholder="pnpm test" value={command} disabled={busy} onChange={event => setCommand(event.target.value)} className={cn(settingsInput, "h-auto resize-y py-2 font-mono text-xs leading-relaxed")} />
				</div>
				<div className="flex flex-col">
					{toggle("Run when a worktree is created", "Starts in its own terminal in each new worktree of this project.", onWorktree, setOnWorktree)}
					{toggle("Run when a chat settles", "Runs in the chat's own worktree, never in a shared checkout. Only one action can do this.", onSettle, setOnSettle)}
				</div>
				{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
				<DialogFooter>
					{editing && onDelete && <span className="mr-auto"><SettingsButton variant="danger" disabled={busy} onClick={() => void run(() => onDelete(editing.id))}>Delete</SettingsButton></span>}
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
	const { scripts, upsert, remove } = useProjectScripts(project.id);
	const [editor, setEditor] = useState<ScriptEditorRequest>();
	const primary = primaryScript(scripts);
	const run = (script: ProjectScript) => void createTerminal({ projectId: project.id, ...(taskId ? { taskId } : {}), scriptId: script.id }).then(session => onRun?.(session.id), reason => setError(errorText(reason)));
	const control = "flex h-7 items-center gap-1 border border-border/80 px-2 text-xs font-medium text-foreground hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-3.5 [&_svg]:shrink-0";
	return <>
		{scripts.length === 0
			? <Tip label="Add action" side="bottom"><button type="button" aria-label="Add action" onClick={() => setEditor({})} className={cn(control, "rounded-md")}><Plus /><span className="hidden xl:inline">Add action</span></button></Tip>
			: <div role="group" aria-label="Project actions" className="flex items-center">
				{primary
					? <Tip label={`Run ${primary.name}`} side="bottom"><button type="button" aria-label={`Run ${primary.name}`} onClick={() => run(primary)} className={cn(control, "rounded-l-md")}><ScriptIcon icon={primary.icon} /><span className="hidden max-w-32 truncate xl:inline">{primary.name}</span></button></Tip>
					: <Tip label="Project actions" side="bottom"><span className={cn(control, "rounded-l-md text-muted-foreground")}><Wrench /><span className="hidden xl:inline">Actions</span></span></Tip>}
				<DropdownMenu>
					<DropdownMenuTrigger render={<button type="button" aria-label="Script actions" className={cn(control, "-ml-px rounded-r-md px-1")} />}><ChevronDown /></DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						{scripts.map(script => <DropdownMenuItem key={script.id} onClick={() => run(script)} className="group/script">
							<ScriptIcon icon={script.icon} className="size-4" /><span className="min-w-0 flex-1 truncate">{scriptMenuLabel(script)}</span>
							<button type="button" aria-label={`Edit ${script.name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); setEditor({ script }); }}
								className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 group-hover/script:opacity-100 group-focus-visible/script:opacity-100 hover:bg-accent hover:text-foreground"><Settings className="size-3.5" /></button>
						</DropdownMenuItem>)}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => setEditor({})}><Plus />Add action</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>}
		<ProjectScriptDialog request={editor} onClose={() => setEditor(undefined)} onSave={upsert} onDelete={remove} />
	</>;
}
