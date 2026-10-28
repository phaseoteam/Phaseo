import { useEffect, useState } from "react";
import { FileText, Folder, TextSearch } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { useCommand } from "../lib/keybindings";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../components/ui/command";
import { ScrollArea } from "../components/ui/scroll-area";
import { openProjectFile } from "../panels/events";
import type { ProjectFile } from "../../shared/workspace";
import type { ProjectContentMatch, ProjectContentSearch } from "../../shared/projectSearch";
import { snippetParts } from "./MessageSearch";

type Mode = "files" | "contents";
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

/** Matches grouped by file, in the order Git listed them. */
export function groupByFile(matches: readonly ProjectContentMatch[]) {
	const groups = new Map<string, ProjectContentMatch[]>();
	for (const match of matches) groups.set(match.path, [...groups.get(match.path) ?? [], match]);
	return [...groups].map(([path, lines]) => ({ path, lines }));
}

function useSearch<T>(mode: Mode | undefined, wanted: Mode, query: string, run: (query: string) => Promise<T>, delay: number) {
	const [state, setState] = useState<{ query: string; value?: T; error?: string }>();
	useEffect(() => {
		if (mode !== wanted || (wanted === "contents" && query.trim().length < 2)) return;
		let active = true;
		const timer = setTimeout(() => void run(query).then(value => { if (active) setState({ query, value }); }, reason => { if (active) setState({ query, error: errorText(reason) }); }), delay);
		return () => { active = false; clearTimeout(timer); };
	}, [mode, query]); // run reads the open project, which a mode change already restarts.
	return state?.query === query ? state : undefined;
}

/**
 * T3's Go to file (Mod+P) and Search in files (Mod+Shift+F) for the open chat's project. Results open in the Files
 * pane. Go to file ranks with the index the file tree and @ mentions use; Search in files asks Git.
 */
export function ProjectSearchDialog() {
	const { selectedId, taskById, overview } = useWorkspace();
	const projectId = selectedId ? taskById(selectedId)?.projectId : undefined, project = overview.projects.find(value => value.id === projectId);
	const [mode, setMode] = useState<Mode>();
	const [query, setQuery] = useState("");
	const api = window.phaseoDesktop?.workspace;
	const toggle = (next: Mode) => { if (!projectId || !api) return false; setQuery(""); setMode(current => current === next ? undefined : next); };
	useCommand("filePicker.toggle", () => toggle("files"));
	useCommand("projectSearch.toggle", () => toggle("contents"));
	const files = useSearch<ProjectFile[]>(mode, "files", query, value => api!.searchFiles(projectId!, value), 60);
	const contents = useSearch<ProjectContentSearch>(mode, "contents", query, value => api!.searchContents(projectId!, value), 200);
	const open = (path: string) => { setMode(undefined); if (projectId) openProjectFile({ projectId, path }); };
	const loading = mode === "files" ? !files : query.trim().length >= 2 && !contents;
	const error = mode === "files" ? files?.error : contents?.error;
	return <CommandDialog open={Boolean(mode)} onOpenChange={value => { if (!value) setMode(undefined); }} title={mode === "contents" ? "Search in files" : "Go to file"} description={project ? `Files in ${project.name}` : "Project files"} commandProps={{ shouldFilter: false }} className="max-w-2xl rounded-md! sm:max-w-2xl">
		<CommandInput autoFocus value={query} onValueChange={setQuery} placeholder={mode === "contents" ? `Search in ${project?.name ?? "the project"}…` : `Go to a file in ${project?.name ?? "the project"}…`} wrapperClassName="p-2" />
		<ScrollArea className="max-h-[440px]" viewportClassName="max-h-[440px]"><CommandList className="max-h-none overflow-visible p-1">
			{error ? <p role="alert" className="px-3 py-4 text-xs text-destructive">{error}</p>
				: loading ? <p role="status" className="px-3 py-4 text-xs text-muted-foreground">{mode === "contents" ? "Searching…" : "Loading files…"}</p>
				: mode === "contents" && query.trim().length < 2 ? <p className="px-3 py-4 text-xs text-muted-foreground">Type at least two characters to search file contents.</p>
				: <CommandEmpty>{mode === "contents" ? "No lines contain that text." : "No files match."}</CommandEmpty>}
			{mode === "files" && files?.value?.map(file => <CommandItem key={file.path} value={file.path} onSelect={() => open(file.path)}>
				{file.directory ? <Folder /> : <FileText />}<span className="truncate">{file.name}</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""}</span>
			</CommandItem>)}
			{mode === "contents" && contents?.value && groupByFile(contents.value.matches).map(group => <CommandGroup key={group.path} heading={group.path}>
				{group.lines.map(match => <CommandItem key={`${match.path}:${match.line}`} value={`${match.path}:${match.line}`} onSelect={() => open(match.path)} className="items-start font-mono text-xs">
					<span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">{match.line}</span>
					<span className="min-w-0 flex-1 truncate whitespace-pre">{snippetParts(match.text.trimStart(), query).map((part, index) => part.match ? <mark key={index} className="bg-warning/25 text-foreground">{part.text}</mark> : <span key={index}>{part.text}</span>)}</span>
				</CommandItem>)}
			</CommandGroup>)}
			{mode === "contents" && contents?.value?.truncated && <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground"><TextSearch className="size-3.5" />Showing the first {contents.value.matches.length} lines. Search for something more specific to see the rest.</p>}
		</CommandList></ScrollArea>
	</CommandDialog>;
}
