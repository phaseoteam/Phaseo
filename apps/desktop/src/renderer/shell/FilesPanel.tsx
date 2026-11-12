import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { errorText, useWorkspace } from "../app/workspace";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
// The diff viewer and editor are large; load them when first shown.
const DiffSurface = lazy(() => import("../panels/DiffSurface").then(module => ({ default: module.DiffSurface })));
const FileSurface = lazy(() => import("../panels/FileSurface").then(module => ({ default: module.FileSurface })));
import { GitActions } from "../panels/GitActions";
import { FileBrowserSurface } from "../panels/FileBrowserSurface";
import { OPEN_PROJECT_FILE_EVENT, type OpenProjectFileDetail } from "../panels/events";

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
	return <button type="button" aria-pressed={active} onClick={onClick} className={cn("h-6 rounded-md px-2 text-xs font-medium transition-colors", active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>{children}</button>;
}

/**
 * The current pane's Files surface, composed from the pane surfaces until the pane mounts them as their own tabs:
 * Changes is Git actions over the diff, Files is the explorer and one open file.
 */
export function FilesPanel({ initialProjectId, taskId }: { initialProjectId?: string; taskId?: string }) {
	const { api, overview, setOverview, selectedId } = useWorkspace();
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const [id, setId] = useState(initialProjectId || projects[0]?.id || "");
	const project = projects.find(value => value.id === id);
	const [tab, setTab] = usePersistedState<"changes" | "files">("phaseo.desktop.filesTab", "changes");
	const [openFile, setOpenFile] = useState<string>();
	const [dirty, setDirty] = useState(false);
	const [error, setError] = useState("");
	const chat = taskId ?? (overview.tasks.find(task => task.id === selectedId)?.projectId === id ? selectedId : undefined);

	useEffect(() => { if (!id && projects[0]) setId(projects[0].id); }, [id, projects]);
	useEffect(() => {
		const open = (event: Event) => {
			const detail = (event as CustomEvent<OpenProjectFileDetail>).detail;
			if (detail?.projectId !== id || typeof detail.path !== "string") return;
			setTab("files"); setOpenFile(detail.path);
		};
		window.addEventListener(OPEN_PROJECT_FILE_EVENT, open);
		return () => window.removeEventListener(OPEN_PROJECT_FILE_EVENT, open);
	}, [id, setTab]);
	const switchProject = (value: string) => { if (dirty && !window.confirm("Leave this file? Edits still saving may be lost.")) return; setId(value); setOpenFile(undefined); };
	const chooseFolder = () => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); };

	if (!projects.length) return <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
		<FolderOpen className="size-6 text-muted-foreground" />
		<p className="text-[13px] text-muted-foreground">Open a folder to browse files and review changes.</p>
		<button type="button" onClick={chooseFolder} className="h-7 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85">Open folder</button>
		{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
	</div>;

	return <div className="files-panel flex h-full min-h-0 flex-col">
		<div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-2">
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold hover:bg-accent/60 [&_svg]:size-3.5" />}>
					{project ? <ProjectIcon project={project} /> : <FolderOpen className="text-muted-foreground" />}<span className="truncate">{project?.name ?? "Choose a project"}</span><ChevronDown className="text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					<DropdownMenuRadioGroup value={id} onValueChange={value => switchProject(String(value))}>
						{projects.map(value => <DropdownMenuRadioItem key={value.id} value={value.id}>{value.name}{value.worktree && <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{value.worktree.branch}</span>}</DropdownMenuRadioItem>)}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={chooseFolder}><FolderOpen />Open folder…</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="ml-1 flex items-center gap-0.5">
				<Tab active={tab === "changes"} onClick={() => setTab("changes")}>Changes</Tab>
				<Tab active={tab === "files"} onClick={() => setTab("files")}>Files</Tab>
			</div>
		</div>
		{error && <p role="alert" className="border-b border-border/60 px-3 py-2 text-xs text-destructive">{error}</p>}
		{!project ? null : tab === "changes" ? <>
			<ScrollArea className="max-h-[40%] shrink-0 border-b border-border/60" viewportClassName="px-2 py-2"><GitActions key={id} projectId={id} onProjectCreated={value => { setId(value); setOpenFile(undefined); }} /></ScrollArea>
			<div className="flex min-h-0 flex-1 flex-col"><Suspense fallback={null}><DiffSurface key={id} projectId={id} taskId={chat} /></Suspense></div>
		</> : openFile
			? <Suspense fallback={null}><FileSurface key={`${id}:${openFile}`} projectId={id} path={openFile} onDirtyChange={setDirty} onOpenFile={setOpenFile} /></Suspense>
			: <FileBrowserSurface key={id} projectId={id} onOpenFile={setOpenFile} />}
	</div>;
}
