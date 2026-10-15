import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type FileDiffContentsLoader, type FileDiffMetadata } from "@pierre/diffs";
import { ArrowRight, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns2, Copy, FolderTree, Pilcrow, Rows3, TextWrap } from "lucide-react";
import type { GitDiffRequest, GitDiffResult, GitRefs } from "../../shared/gitDiff";
import type { Task } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { allCollapsed, diffFileTree, diffLineStat, diffTurns, fileDiffKey, resolveFileDiffPath, scopeLabel, sectionOf, selectedTurn, changeTone, toggleAll, toggleOne, type DiffSelection } from "../lib/diffSurface";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ScrollArea } from "../components/ui/scroll-area";
import { DiffCodeView, type DiffViewFile, type DiffViewHandle } from "./DiffCodeView";
import { DiffFileTree } from "./DiffFileTree";
import { onProjectChange, openProjectFile } from "./events";
import { DiffLoadingState, ipcError, RefreshIcon, SURFACE_HEADER_CLASS, SurfaceMessage, SurfaceNotice, ToolbarButton, useThemeType } from "./surfaceChrome";

type Loaded = { key: string; result: GitDiffResult };
const AUTOMATIC = "";
const noKeys: ReadonlySet<string> = new Set();

function requestFor(selection: DiffSelection, turns: ReturnType<typeof diffTurns>, ignoreWhitespace: boolean): GitDiffRequest | undefined {
	if (selection.kind === "uncommitted") return { scope: "uncommitted", ignoreWhitespace };
	if (selection.kind === "branch") return { scope: "branch", ...(selection.baseRef ? { baseRef: selection.baseRef } : {}), ignoreWhitespace };
	const turn = selectedTurn(selection, turns);
	return turn ? { scope: "turn", from: turn.from, to: turn.to, ignoreWhitespace } : undefined;
}

function parseFiles(patch: string, cacheKey: string): { files: FileDiffMetadata[]; skipped: number } | undefined {
	try {
		const all = parsePatchFiles(patch, cacheKey, true).flatMap(value => value.files);
		const files = all.filter(file => file.hunks.length > 0);
		return { files, skipped: all.length - files.length };
	} catch { return; }
}

function CopyPathButton({ path }: { path: string }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer); }, [copied]);
	return <ToolbarButton size="sm" label={copied ? "Copied" : "Copy path"} className="size-5" onClick={() => void navigator.clipboard.writeText(path).then(() => setCopied(true), () => undefined)}>
		{copied ? <Check className="size-3! text-success" /> : <Copy className="size-3!" />}
	</ToolbarButton>;
}

/** T3's comparison picker: Automatic, then local and remote branches, searchable. */
function BaseRefPicker({ projectId, value, resolved, onChange }: { projectId: string; value?: string; resolved?: string; onChange: (ref?: string) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [refs, setRefs] = useState<GitRefs>();
	useEffect(() => { if (open && api) void api.gitRefs(projectId).then(setRefs, () => setRefs({ local: [], remote: [], current: "" })); }, [open, api, projectId]);
	const needle = query.trim().toLowerCase();
	const local = (refs?.local ?? []).filter(name => name !== refs?.current && name.toLowerCase().includes(needle));
	const remote = (refs?.remote ?? []).filter(name => name.toLowerCase().includes(needle));
	const choose = (ref?: string) => { onChange(ref); setOpen(false); setQuery(""); };
	const item = (ref: string | undefined, label: string, hint?: string) => <button key={ref ?? AUTOMATIC} type="button" role="option" aria-selected={(value ?? AUTOMATIC) === (ref ?? AUTOMATIC)} onClick={() => choose(ref)}
		className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
		<Check className={cn("size-3.5 shrink-0", (value ?? AUTOMATIC) !== (ref ?? AUTOMATIC) && "invisible")} />
		<span className="min-w-0 flex-1 truncate">{label}</span>{hint && <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>}
	</button>;
	return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
		<PopoverTrigger render={<button type="button" aria-label={`Change comparison target. Currently ${resolved ?? "none"}`} className="flex h-6 min-w-0 max-w-48 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground data-popup-open:bg-accent" />}>
			<span className="min-w-0 truncate">{resolved ?? "Choose a branch"}</span><ChevronDown className="size-3.5 shrink-0 opacity-70" />
		</PopoverTrigger>
		<PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
			<input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search branches…" aria-label="Search branches"
				className="h-9 w-full border-b border-border/70 bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground" />
			<ScrollArea className="max-h-64" viewportClassName="max-h-64">
				<div role="listbox" aria-label="Comparison target" className="p-1">
					{!needle && item(undefined, "Automatic")}
					{local.map(name => item(name, name))}
					{remote.map(name => item(name, name, "Remote"))}
					{refs && !local.length && !remote.length && needle && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching branches.</p>}
					{!refs && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Loading branches…</p>}
				</div>
			</ScrollArea>
		</PopoverContent>
	</Popover>;
}

/**
 * T3's diff panel: the branch against its base, uncommitted work, or one turn, as one scrolling list of
 * files with sticky headers, a file tree, and line comments that go to the chat as review context.
 */
export function DiffSurface({ projectId, taskId, onOpenFile }: { projectId: string; taskId?: string; onOpenFile?: (path: string) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const { overview } = useWorkspace();
	const theme = useThemeType();
	const scopeKey = taskId ?? `project:${projectId}`;
	const [selections, setSelections] = usePersistedState<Record<string, DiffSelection>>("phaseo.desktop.diffSelection", {});
	const selection: DiffSelection = selections[scopeKey] ?? { kind: "branch" };
	const select = (next: DiffSelection) => setSelections(current => Object.fromEntries(Object.entries({ ...current, [scopeKey]: next }).slice(-200)));
	const [layout, setLayout] = usePersistedState<"unified" | "split">("phaseo.desktop.diffLayout", "unified");
	const [wrap, setWrap] = usePersistedState("phaseo.desktop.diffWrap", false);
	const [ignoreWhitespace, setIgnoreWhitespace] = usePersistedState("phaseo.desktop.diffIgnoreWhitespace", false);
	const [treeOpen, setTreeOpen] = usePersistedState("phaseo.desktop.diffFileTree", false);
	const [task, setTask] = useState<Task>();
	const [loaded, setLoaded] = useState<Loaded>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [refresh, setRefresh] = useState(0);
	const [collapsed, setCollapsed] = useState<{ section: string; keys: ReadonlySet<string> }>({ section: "", keys: new Set() });
	const [selectedPath, setSelectedPath] = useState<string>();
	const viewer = useRef<DiffViewHandle | null>(null);

	// A finished turn (or its snapshot arriving) refreshes the diff straight away.
	const summary = overview.tasks.find(value => value.id === taskId);
	const turnSignal = summary ? `${summary.status}:${summary.lastCompletedAt ?? ""}:${summary.revision ?? summary.updatedAt}` : "";
	const running = summary?.status === "running";
	useEffect(() => {
		if (!api || !taskId) { setTask(undefined); return; }
		let active = true;
		void api.task(taskId).then(value => { if (active) setTask(value); }, () => undefined);
		return () => { active = false; };
	}, [api, taskId, turnSignal]);
	const wasRunning = useRef(running);
	useEffect(() => { if (wasRunning.current && !running) setRefresh(value => value + 1); wasRunning.current = running; }, [running]);
	useEffect(() => onProjectChange(projectId, () => setRefresh(value => value + 1)), [projectId]);
	useEffect(() => { const focus = () => setRefresh(value => value + 1); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, []);

	const turns = useMemo(() => diffTurns(task?.messages ?? []), [task]);
	const request = requestFor(selection, turns, ignoreWhitespace);
	const requestKey = request ? JSON.stringify([projectId, request]) : "";
	useEffect(() => {
		if (!api || !request) return;
		let active = true;
		setLoading(true);
		void api.gitDiff(projectId, request).then(result => { if (!active) return; setLoaded({ key: requestKey, result }); setError(""); }, reason => { if (active) setError(ipcError(reason)); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
		// requestKey stands for the request, which is rebuilt every render.
	}, [api, projectId, requestKey, refresh]);

	const result = loaded?.key === requestKey ? loaded.result : undefined;
	const parsed = useMemo(() => result?.patch ? parseFiles(result.patch, `diff:${result.hash.slice(0, 16)}`) : undefined, [result]);
	const section = sectionOf(selection, turns);
	const collapsedKeys = useMemo(() => collapsed.section === section.id ? collapsed.keys : noKeys, [collapsed, section.id]);
	const files = useMemo<DiffViewFile[]>(() => (parsed?.files ?? []).map((fileDiff, index) => ({ fileDiff, filePath: resolveFileDiffPath(fileDiff), fileKey: fileDiffKey(fileDiff), fileVersion: index + parseInt(result?.hash.slice(0, 8) || "0", 16), collapsed: collapsedKeys.has(fileDiffKey(fileDiff)) })), [parsed, result, collapsedKeys]);
	const keys = files.map(file => file.fileKey);
	const stat = useMemo(() => diffLineStat(parsed?.files ?? []), [parsed]);
	const tree = useMemo(() => diffFileTree(parsed?.files ?? []), [parsed]);
	const everyCollapsed = allCollapsed(keys, collapsedKeys);
	const setKeys = (next: ReadonlySet<string>) => setCollapsed({ section: section.id, keys: next });

	const resultRef = useRef({ request, hash: result?.hash });
	resultRef.current = { request, hash: result?.hash };
	const loadDiffFiles = useCallback<FileDiffContentsLoader>(async fileDiff => {
		const current = resultRef.current;
		if (!api || !current.request || !current.hash) throw new Error("Refresh to expand unchanged lines.");
		return api.gitDiffFile(projectId, { diff: current.request, filename: resolveFileDiffPath(fileDiff), ...(fileDiff.prevName ? { oldFilename: resolveFileDiffPath({ name: fileDiff.prevName }) } : {}), hash: current.hash });
	}, [api, projectId]);

	const openFile = (path: string) => { if (onOpenFile) onOpenFile(path); else openProjectFile({ projectId, path }); };
	const reveal = (path: string) => {
		setSelectedPath(path);
		const file = files.find(value => value.filePath === path);
		if (!file) return;
		if (collapsedKeys.has(file.fileKey)) setKeys(toggleOne(collapsedKeys, file.fileKey));
		requestAnimationFrame(() => viewer.current?.scrollTo({ type: "item", id: file.fileKey, align: "start" }));
	};

	const label = scopeLabel(selection, turns);
	const scopeValue = selection.kind === "turn" ? (selectedTurn(selection, turns) === turns[0] ? "latest" : `turn:${selectedTurn(selection, turns)?.messageId}`) : selection.kind;
	const chooseScope = (value: unknown) => {
		if (value === "branch") select({ kind: "branch" });
		else if (value === "uncommitted") select({ kind: "uncommitted" });
		else if (value === "latest") select({ kind: "turn" });
		else if (typeof value === "string" && value.startsWith("turn:")) select({ kind: "turn", messageId: value.slice(5) });
	};
	const timeOf = (iso?: string) => iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";

	const header = <div className={cn(SURFACE_HEADER_CLASS, "justify-between gap-2")} data-surface-subheader>
		<div className="flex min-w-0 flex-1 items-center gap-3">
			<DropdownMenu>
				<DropdownMenuTrigger aria-label={`Diff scope: ${label}`} render={<button type="button" className="flex h-6 max-w-full shrink-0 items-center gap-1 rounded-md bg-secondary px-2 text-xs font-medium text-secondary-foreground hover:bg-accent" />}>
					<span className="truncate">{label}</span><ChevronDown className="size-3.5 shrink-0 opacity-70" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-48">
					<DropdownMenuRadioGroup value={scopeValue} onValueChange={chooseScope}>
						<DropdownMenuRadioItem value="branch" className="text-xs">Changes</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="uncommitted" className="text-xs">Uncommitted</DropdownMenuRadioItem>
						{taskId && <DropdownMenuRadioItem value="latest" className="text-xs">Latest turn</DropdownMenuRadioItem>}
					</DropdownMenuRadioGroup>
					{taskId && <DropdownMenuSub>
						<DropdownMenuSubTrigger className="text-xs">Turn</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-48">
							{turns.length ? <DropdownMenuRadioGroup value={selection.kind === "turn" ? `turn:${selectedTurn(selection, turns)?.messageId}` : ""} onValueChange={chooseScope}>
								{turns.map(turn => <DropdownMenuRadioItem key={turn.messageId} value={`turn:${turn.messageId}`} className="text-xs">
									<span className="flex flex-1 items-center gap-2"><span>Turn {turn.number}</span><span className="ml-auto text-xs text-muted-foreground tabular-nums">{timeOf(turn.completedAt)}</span></span>
								</DropdownMenuRadioItem>)}
							</DropdownMenuRadioGroup> : <p className="px-2 py-1.5 text-xs text-muted-foreground">No completed turns yet.</p>}
						</DropdownMenuSubContent>
					</DropdownMenuSub>}
				</DropdownMenuContent>
			</DropdownMenu>
			{selection.kind === "branch" && result?.repository && <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground" aria-label={`Comparing ${result.headRef ?? "HEAD"} against ${result.baseRef ?? "nothing"}`}>
				<span className="min-w-0 max-w-48 truncate" title={result.headRef}>{result.headRef ?? "HEAD"}</span>
				<ArrowRight className="size-3.5 shrink-0 opacity-70" />
				<BaseRefPicker projectId={projectId} value={selection.baseRef} resolved={result.baseRef} onChange={baseRef => select({ kind: "branch", ...(baseRef ? { baseRef } : {}) })} />
			</div>}
		</div>
		<div className="flex shrink-0 items-center gap-1">
			{files.length > 0 && <span className="mr-1 flex items-center gap-1 font-mono text-[11px] tabular-nums" aria-label={`${stat.additions} lines added, ${stat.deletions} removed`}>
				<span className="text-success">+{stat.additions}</span><span className="text-destructive">−{stat.deletions}</span>
			</span>}
			{selection.kind !== "turn" && <ToolbarButton label={loading ? "Refreshing diff" : "Refresh diff"} onClick={() => setRefresh(value => value + 1)}><RefreshIcon refreshing={loading} /></ToolbarButton>}
			{files.length > 0 && <ToolbarButton label={everyCollapsed ? "Expand all files" : "Collapse all files"} onClick={() => setKeys(toggleAll(keys, collapsedKeys))}>{everyCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}</ToolbarButton>}
			<div role="radiogroup" aria-label="Diff layout" className="flex shrink-0 items-center rounded-md bg-muted/70 p-0.5">
				{([["unified", "Stacked diff view", <Rows3 key="u" />], ["split", "Split diff view", <Columns2 key="s" />]] as const).map(([value, name, icon]) =>
					<button key={value} type="button" role="radio" aria-checked={layout === value} aria-label={name} title={name} onClick={() => setLayout(value)}
						className={cn("grid h-5 w-6 place-items-center rounded-[5px] text-muted-foreground transition-colors [&_svg]:size-3.5", layout === value ? "bg-background text-foreground shadow-xs" : "hover:text-foreground")}>{icon}</button>)}
			</div>
			<ToolbarButton label={wrap ? "Disable line wrapping" : "Enable line wrapping"} pressed={wrap} onClick={() => setWrap(!wrap)}><TextWrap /></ToolbarButton>
			<ToolbarButton label={ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"} pressed={ignoreWhitespace} onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}><Pilcrow /></ToolbarButton>
			{files.length > 0 && <ToolbarButton label={treeOpen ? "Hide file tree" : "Show file tree"} pressed={treeOpen} onClick={() => setTreeOpen(!treeOpen)}><FolderTree /></ToolbarButton>}
		</div>
	</div>;

	let body;
	if (!api) body = <SurfaceMessage>Open the desktop app to review changes.</SurfaceMessage>;
	else if (selection.kind === "turn" && !turns.length) body = <SurfaceMessage>{taskId ? running ? "The first turn is still running." : "No completed turns yet." : "Open a chat to review its turns."}</SurfaceMessage>;
	else if (result && !result.repository) body = <SurfaceMessage>Diffs are unavailable because this project is not a Git repository.</SurfaceMessage>;
	else if (!result) body = error ? <SurfaceMessage className="text-destructive/80">{error}</SurfaceMessage> : <DiffLoadingState label={selection.kind === "turn" ? "Loading turn diff…" : selection.kind === "uncommitted" ? "Loading uncommitted changes…" : "Loading changes…"} />;
	else if (!result.patch.trim()) body = <SurfaceMessage>No net changes in this selection.</SurfaceMessage>;
	else if (!parsed) body = <ScrollArea className="min-h-0 flex-1" scrollBarOrientation="both" viewportClassName="p-2">
		<p className="mb-2 text-[11px] text-muted-foreground/75">This patch could not be shown as a diff, so here is the raw text.</p>
		<pre className={cn("rounded-md border border-border/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90", wrap && "whitespace-pre-wrap break-words")}>{result.patch}</pre>
	</ScrollArea>;
	else body = <div className="flex min-h-0 flex-1 overflow-hidden">
		<div className="min-h-0 min-w-0 flex-1"
			onClickCapture={event => {
				const path = event.nativeEvent.composedPath();
				if (path.some(node => node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement)) return;
				const title = path.find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-title"));
				if (title?.textContent) { openFile(title.textContent.trim()); return; }
				const headerNode = path.find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-diffs-header"));
				const name = headerNode?.querySelector("[data-title]")?.textContent?.trim();
				const file = name ? files.find(value => value.filePath === name) : undefined;
				if (file) setKeys(toggleOne(collapsedKeys, file.fileKey));
			}}>
			<DiffCodeView key={`${scopeKey}:${section.id}`} viewerRef={viewer} className="h-full min-h-0 overflow-auto" files={files} commentTarget={taskId ?? `project:${projectId}`} sectionId={section.id} sectionTitle={section.title}
				layout={layout} wrap={wrap} theme={theme} loadDiffFiles={loadDiffFiles}
				renderHeaderPrefix={file => <ToolbarButton size="sm" className="-ms-0.5 size-5" label={file.collapsed ? `Expand ${file.filePath}` : `Collapse ${file.filePath}`} onClick={() => setKeys(toggleOne(collapsedKeys, file.fileKey))}>
					{file.collapsed ? <ChevronRight className={cn("size-4!", changeTone(file.fileDiff.type))} /> : <ChevronDown className={cn("size-4!", changeTone(file.fileDiff.type))} />}
				</ToolbarButton>}
				renderHeaderSuffix={file => <CopyPathButton path={file.filePath} />} />
		</div>
		{treeOpen && <aside className="flex w-[min(16rem,40%)] min-w-40 shrink-0 border-l border-border/60"><DiffFileTree label={`${section.title} files`} nodes={tree} selectedPath={selectedPath} onSelect={reveal} /></aside>}
	</div>;

	return <div className="diff-surface flex h-full min-h-0 min-w-0 flex-col bg-background" data-diff-scope={selection.kind}>
		{header}
		{result?.truncated && <SurfaceNotice>This preview exceeds the size limit. Changes shown are incomplete.</SurfaceNotice>}
		{parsed && parsed.skipped > 0 && <SurfaceNotice>{parsed.skipped === 1 ? "1 binary or mode-only change is" : `${parsed.skipped} binary or mode-only changes are`} not shown.</SurfaceNotice>}
		{error && result && <p role="alert" className="shrink-0 border-b border-border/60 px-3 py-1.5 text-[11px] text-destructive/80">{error}</p>}
		{body}
	</div>;
}
