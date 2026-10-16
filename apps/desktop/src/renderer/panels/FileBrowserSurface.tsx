import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, File, Folder, FolderOpen } from "lucide-react";
import type { ProjectFile } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { onProjectChange } from "./events";
import { FileTreeLoading, ipcError, RefreshIcon, SURFACE_HEADER_CLASS, ToolbarButton } from "./surfaceChrome";

const parentOf = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/**
 * T3's file explorer: the project as a lazily loaded tree (Git-ignored files hidden), a search field
 * and Expand all. Choosing a file calls `onOpenFile`.
 */
export function FileBrowserSurface({ projectId, onOpenFile, selectedPath, className }: { projectId: string; onOpenFile: (path: string) => void; selectedPath?: string; className?: string }) {
	const api = window.phaseoDesktop?.workspace;
	const { overview } = useWorkspace();
	const projectName = overview.projects.find(project => project.id === projectId)?.name ?? "Project";
	const [children, setChildren] = useState<ReadonlyMap<string, ProjectFile[]>>(new Map());
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [expandedAll, setExpandedAll] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<{ query: string; entries: ProjectFile[]; truncated: boolean }>();
	const [pending, setPending] = useState(0);
	const [truncated, setTruncated] = useState(false);
	const [error, setError] = useState("");
	const expandedRef = useRef(expanded); expandedRef.current = expanded;

	const track = useCallback(async <T,>(work: Promise<T>) => { setPending(value => value + 1); try { return await work; } finally { setPending(value => value - 1); } }, []);
	const loadDirectory = useCallback(async (directory: string, refresh = false) => {
		if (!api) return;
		try {
			const result = await track(api.projectTree(projectId, { type: "list", directory }, refresh));
			setChildren(current => new Map(current).set(directory, result.entries)); setError("");
		} catch (reason) { setError(ipcError(reason)); }
	}, [api, projectId, track]);
	const reload = useCallback(async (refresh: boolean) => {
		await loadDirectory("", refresh);
		await Promise.all([...expandedRef.current].map(directory => loadDirectory(directory)));
	}, [loadDirectory]);

	useEffect(() => { setChildren(new Map()); setExpanded(new Set()); setExpandedAll(false); void reload(false); }, [reload]);
	useEffect(() => onProjectChange(projectId, () => void reload(true)), [projectId, reload]);
	// Opening a file from elsewhere reveals it in the tree.
	useEffect(() => {
		if (!selectedPath) return;
		const parents: string[] = [];
		for (let parent = parentOf(selectedPath); parent; parent = parentOf(parent)) parents.unshift(parent);
		if (!parents.length) return;
		setExpanded(current => parents.every(parent => current.has(parent)) ? current : new Set([...current, ...parents]));
		for (const parent of parents) if (!children.has(parent)) void loadDirectory(parent);
		// Runs only when the selection moves, not as folders load.
	}, [selectedPath]);
	useEffect(() => {
		const needle = query.trim();
		if (!needle || !api) { setResults(undefined); return; }
		let active = true;
		const timer = setTimeout(() => void track(api.projectTree(projectId, { type: "search", query: needle })).then(result => { if (active) setResults({ query: needle, ...result }); }, reason => { if (active) setError(ipcError(reason)); }), 120);
		return () => { active = false; clearTimeout(timer); };
	}, [query, api, projectId, track]);

	const toggle = (directory: string) => {
		setExpanded(current => { const next = new Set(current); if (!next.delete(directory)) next.add(directory); return next; });
		if (!children.has(directory)) void loadDirectory(directory);
	};
	const revealFolder = (directory: string) => {
		const chain: string[] = [];
		for (let at = directory; at; at = parentOf(at)) chain.unshift(at);
		setExpanded(current => new Set([...current, ...chain]));
		for (const at of chain) if (!children.has(at)) void loadDirectory(at);
	};
	const toggleAll = async () => {
		if (expandedAll || expanded.size) { setExpanded(new Set()); setExpandedAll(false); return; }
		if (!api) return;
		try {
			const result = await track(api.projectTree(projectId, { type: "expand", directory: "" }));
			const grouped = new Map<string, ProjectFile[]>();
			for (const entry of result.entries) { const parent = parentOf(entry.path); grouped.set(parent, [...grouped.get(parent) ?? [], entry]); }
			setChildren(current => new Map([...current, ...grouped]));
			setExpanded(new Set(result.entries.filter(entry => entry.directory).map(entry => entry.path)));
			setExpandedAll(true); setTruncated(result.truncated);
		} catch (reason) { setError(ipcError(reason)); }
	};

	const row = (entry: ProjectFile, depth: number, showPath = false) => {
		const open = expanded.has(entry.path), selected = entry.path === selectedPath;
		return <button key={entry.path} type="button" role="treeitem" aria-expanded={entry.directory ? open : undefined} aria-selected={selected} title={entry.path}
			onClick={() => { if (!entry.directory) onOpenFile(entry.path); else if (showPath) { setQuery(""); revealFolder(entry.path); } else toggle(entry.path); }}
			style={{ paddingLeft: `${depth * 12 + (entry.directory ? 6 : 22)}px` }}
			className={cn("flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs", selected ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60")}>
			{entry.directory && <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />}
			{entry.directory ? open ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : <Folder className="size-3.5 shrink-0 text-muted-foreground" /> : <File className="size-3.5 shrink-0 text-muted-foreground" />}
			<span className="min-w-0 truncate">{entry.name}</span>
			{showPath && parentOf(entry.path) && <span className="min-w-0 truncate text-muted-foreground">{parentOf(entry.path)}</span>}
		</button>;
	};
	const branch = (directory: string, depth: number): ReactNode[] => (children.get(directory) ?? []).flatMap(entry => [row(entry, depth), ...(entry.directory && expanded.has(entry.path) ? branch(entry.path, depth + 1) : [])]);
	const loaded = children.has("");

	return <div className={cn("file-browser flex min-h-0 flex-1 flex-col bg-background", className)} data-file-browser={projectId}>
		<div className={cn(SURFACE_HEADER_CLASS, "gap-1")} data-surface-subheader>
			<ToolbarButton size="sm" label={pending ? "Refreshing…" : "Refresh files"} onClick={() => void reload(true)}><RefreshIcon refreshing={pending > 0} /></ToolbarButton>
			<input type="search" value={query} aria-label={`Search ${projectName} files`} placeholder="Search files" spellCheck={false}
				onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }}
				className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground/80 hover:bg-accent/40 focus:bg-accent/40" />
			{loaded && (children.get("") ?? []).some(entry => entry.directory) && <ToolbarButton size="sm" label={expandedAll || expanded.size ? "Collapse all folders" : "Expand all folders"} onClick={() => void toggleAll()}>{expandedAll || expanded.size ? <ChevronsDownUp /> : <ChevronsUpDown />}</ToolbarButton>}
		</div>
		{error && <button type="button" onClick={() => void reload(true)} className="p-4 text-left text-xs leading-relaxed text-destructive">{error} Click to retry.</button>}
		{results?.truncated && <div className="px-3 py-1 text-xs text-muted-foreground">More matches available. Refine your search.</div>}
		{truncated && expandedAll && !results && <div className="px-3 py-1 text-xs text-muted-foreground">Some folders are too large to expand at once.</div>}
		{loaded && query.trim() && !results && !error && <div role="status" className="px-3 py-1 text-xs text-muted-foreground">Searching files…</div>}
		<ScrollArea className="min-h-0 flex-1" viewportClassName="py-1">
			{!loaded && !error && <FileTreeLoading />}
			<div role="tree" aria-label={`${projectName} files`} className="px-1">
				{results ? results.entries.length ? results.entries.map(entry => row(entry, 0, true)) : <p className="px-2 py-3 text-xs text-muted-foreground/70">No files match “{results.query}”.</p>
					: loaded && !(children.get("") ?? []).length ? <p className="px-2 py-3 text-xs text-muted-foreground/70">This folder is empty.</p> : branch("", 0)}
			</div>
		</ScrollArea>
	</div>;
}
