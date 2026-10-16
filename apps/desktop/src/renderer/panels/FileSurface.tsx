import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditProvider, File as PierreFile, Virtualizer } from "@pierre/diffs/react";
import { Editor, type EditorFactory } from "@pierre/diffs/edit";
import type { FileContents } from "@pierre/diffs";
import { ChevronRight, Code2, ExternalLink, Eye, File as FileIcon, Folder, FolderTree, Globe2, Table2, WrapText } from "lucide-react";
import type { FilePreview } from "../../shared/filePreview";
import type { EditorId, EditorInstallation } from "../../shared/editors";
import type { ProjectFile } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { debounceSaves, fileBreadcrumbs, formatBytes, parseDelimitedPreview, renderedModeOf, renderedToggleLabel, tableDelimiter, type Breadcrumb, type RenderedMode } from "../lib/filePreview";
import { MessageContent } from "../components/MessageContent";
import { ScrollArea } from "../components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { FileBrowserSurface } from "./FileBrowserSurface";
import { announceProjectChange, onProjectChange, openProjectFile } from "./events";
import { ipcError, SurfaceError, SurfaceMessage, SurfaceNotice, ToolbarButton, useThemeType } from "./surfaceChrome";

/** One header row for every file surface: crumbs on the left, icon-only actions on the right. */
const FILE_SURFACE_HEADER_CLASS = "flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3";
const FILE_VIEW_CSS = ":host { --code-background: var(--background); } [data-file-info] { display: none !important; }";
const createEditor: EditorFactory<undefined, undefined> = (editorType, options, editStateKey) => new Editor(editorType, options, editStateKey);

/** A folder crumb opens a menu of that folder; folders go deeper in place, files open. */
function DirectoryCrumb({ projectId, crumb, currentPath, onOpenFile }: { projectId: string; crumb: Breadcrumb; currentPath: string; onOpenFile: (path: string) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const [open, setOpen] = useState(false);
	const [directory, setDirectory] = useState(crumb.path);
	const [entries, setEntries] = useState<ProjectFile[]>();
	useEffect(() => {
		if (!open || !api) return;
		let active = true; setEntries(undefined);
		void api.projectTree(projectId, { type: "list", directory }).then(result => { if (active) setEntries(result.entries); }, () => { if (active) setEntries([]); });
		return () => { active = false; };
	}, [open, api, projectId, directory]);
	return <DropdownMenu open={open} onOpenChange={next => { setOpen(next); if (next) setDirectory(crumb.path); }}>
		<DropdownMenuTrigger aria-label={`Browse ${crumb.label}`} title={crumb.path || crumb.label} render={<button type="button" className="relative block max-w-40 cursor-pointer rounded-sm px-0.5 text-left text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-accent data-popup-open:text-foreground" />}>
			<span className="block truncate">{crumb.label}</span>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="max-h-80 w-64">
			{directory !== crumb.path && <DropdownMenuLabel className="truncate text-xs">{directory}</DropdownMenuLabel>}
			{!entries && <DropdownMenuItem disabled className="text-xs">Loading…</DropdownMenuItem>}
			{entries && !entries.length && <DropdownMenuItem disabled className="text-xs">This folder is empty.</DropdownMenuItem>}
			{entries?.map(entry => entry.directory
				? <DropdownMenuItem key={entry.path} closeOnClick={false} onClick={() => setDirectory(entry.path)} className="text-xs"><Folder className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{entry.name}</span><ChevronRight className="text-muted-foreground" /></DropdownMenuItem>
				: <DropdownMenuItem key={entry.path} onClick={() => onOpenFile(entry.path)} aria-current={entry.path === currentPath ? "page" : undefined} className={cn("text-xs", entry.path === currentPath && "bg-accent/60")}><FileIcon className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{entry.name}</span></DropdownMenuItem>)}
		</DropdownMenuContent>
	</DropdownMenu>;
}

function OpenInEditor({ projectId, path }: { projectId: string; path: string }) {
	const api = window.phaseoDesktop?.workspace;
	const [editors, setEditors] = useState<EditorInstallation[]>([]);
	const [preferred, setPreferred] = usePersistedState<EditorId | undefined>("phaseo.desktop.editor", undefined);
	const [error, setError] = useState("");
	useEffect(() => { if (api) void api.editors().then(setEditors, () => undefined); }, [api]);
	const editor = editors.find(value => value.id === preferred && value.available) ?? editors.find(value => value.available);
	const open = (request: Parameters<NonNullable<typeof api>["openProject"]>[1]) => { if (api) void api.openProject(projectId, request).then(() => setError(""), reason => setError(ipcError(reason))); };
	return <DropdownMenu>
		<Tooltip>
			<TooltipTrigger delay={300} render={<DropdownMenuTrigger aria-label="Open in editor" render={<button type="button" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground data-popup-open:bg-accent [&_svg]:size-3.5" />} />}><ExternalLink /></TooltipTrigger>
			<TooltipContent>{error || `Open in ${editor?.name ?? "editor"}`}</TooltipContent>
		</Tooltip>
		<DropdownMenuContent align="end" className="w-56">
			<DropdownMenuItem disabled={!editor} onClick={() => { if (editor) open({ editor: editor.id, filename: path }); }} className="text-xs">Open in {editor?.name ?? "editor"}</DropdownMenuItem>
			<DropdownMenuItem onClick={() => open({ editor: "file-manager", filename: path })} className="text-xs">Show in folder</DropdownMenuItem>
			{editors.length > 1 && <>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs">Editor</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={editor?.id ?? ""} onValueChange={value => setPreferred(value as EditorId)}>
					{editors.map(value => <DropdownMenuRadioItem key={value.id} value={value.id} disabled={!value.available} className="text-xs">{value.name}</DropdownMenuRadioItem>)}
				</DropdownMenuRadioGroup>
			</>}
		</DropdownMenuContent>
	</DropdownMenu>;
}

function DelimitedTable({ name, text, delimiter }: { name: string; text: string; delimiter: "," | "\t" }) {
	const table = useMemo(() => parseDelimitedPreview(text, delimiter), [text, delimiter]);
	const [header, ...body] = table.rows;
	return <div className="flex min-h-0 flex-1 flex-col">
		{table.truncated && <SurfaceNotice tone="warning">Table limited to the first 100 rows and 30 columns. Switch to source for the rest.</SurfaceNotice>}
		<ScrollArea className="min-h-0 flex-1" scrollBarOrientation="both">
			<table className="min-w-full border-separate border-spacing-0 text-xs" aria-label={name}>
				{header && <thead className="sticky top-0 z-10"><tr>{header.map((cell, column) => <th key={column} scope="col" className="max-w-80 border-b border-border bg-muted/60 px-3 py-1.5 text-left align-bottom font-medium break-words whitespace-pre-wrap backdrop-blur">{cell}</th>)}</tr></thead>}
				<tbody>{body.map((row, index) => <tr key={index} className="even:bg-muted/30">{row.map((cell, column) => <td key={column} className="max-w-80 border-b border-border/60 px-3 py-1.5 align-top break-words whitespace-pre-wrap tabular-nums">{cell}</td>)}</tr>)}</tbody>
			</table>
		</ScrollArea>
	</div>;
}

/** Shows plain text when the highlighted viewer or editor fails. */
class SourceBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function PlainSource({ text, wrap }: { text: string; wrap: boolean }) {
	return <ScrollArea className="min-h-0 flex-1" scrollBarOrientation="both"><pre className={cn("p-3 font-mono text-xs leading-relaxed", wrap && "whitespace-pre-wrap break-words")}>{text}</pre></ScrollArea>;
}

type SaveState = { dirty: boolean; error?: string };
/** The highlighted editor. Edits save 500 ms after typing stops, checked against the hash the file was read with. */
function EditableSource({ projectId, path, text, hash, wrap, theme, hashRef, onSaveState }: { projectId: string; path: string; text: string; hash: string; wrap: boolean; theme: "light" | "dark"; hashRef: { current: string }; onSaveState: (state: SaveState) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const [file] = useState<FileContents>(() => ({ name: path, contents: text, cacheKey: `file:${projectId}:${path}:${hash}` }));
	const report = useRef(onSaveState); report.current = onSaveState;
	const saves = useMemo(() => debounceSaves(async contents => {
		if (!api) return;
		try {
			const result = await api.writeDocument(projectId, path, contents, hashRef.current);
			hashRef.current = result.hash;
			if (!saves.pending) report.current({ dirty: false });
			announceProjectChange(projectId);
		} catch (reason) { report.current({ dirty: true, error: ipcError(reason) }); }
		// One save queue for as long as the file is mounted.
	}), []);
	useEffect(() => { hashRef.current = hash; }, [hash, hashRef]);
	useEffect(() => () => { void saves.flush(); }, [saves]);
	const options = useMemo(() => ({ disableFileHeader: true, overflow: wrap ? "wrap" as const : "scroll" as const, theme: { light: "github-light", dark: "github-dark" }, themeType: theme, preferredHighlighter: "shiki-js" as const, unsafeCSS: FILE_VIEW_CSS }), [wrap, theme]);
	return <EditProvider createEditor={createEditor}>
		<Virtualizer className="file-surface-editor min-h-0 flex-1 overflow-auto" config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}>
			<PierreFile file={file} edit options={options} className="min-h-full" onEditChange={event => { report.current({ dirty: true }); saves.schedule(event.file.contents); }} />
		</Virtualizer>
	</EditProvider>;
}

function ReadOnlySource({ path, text, wrap, theme }: { path: string; text: string; wrap: boolean; theme: "light" | "dark" }) {
	const file = useMemo<FileContents>(() => ({ name: path, contents: text }), [path, text]);
	const options = useMemo(() => ({ disableFileHeader: true, overflow: wrap ? "wrap" as const : "scroll" as const, theme: { light: "github-light", dark: "github-dark" }, themeType: theme, preferredHighlighter: "shiki-js" as const, unsafeCSS: FILE_VIEW_CSS }), [wrap, theme]);
	return <Virtualizer className="min-h-0 flex-1 overflow-auto" config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}><PierreFile file={file} options={options} className="min-h-full" /></Virtualizer>;
}

/**
 * One project file, after T3's file panel: breadcrumbs, Open in editor, rendered or source view, wrap and the
 * explorer. Text up to 1 MB is edited in place and saved automatically; `onDirtyChange` reports unsaved edits.
 */
export function FileSurface({ projectId, path, onDirtyChange, onOpenFile }: { projectId: string; path: string; onDirtyChange?: (dirty: boolean) => void; onOpenFile?: (path: string) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const { overview } = useWorkspace();
	const theme = useThemeType();
	const projectName = overview.projects.find(project => project.id === projectId)?.name ?? "Project";
	const [preview, setPreview] = useState<FilePreview>();
	const [error, setError] = useState("");
	const [version, setVersion] = useState(0);
	const [reload, setReload] = useState(0);
	const [rendered, setRendered] = usePersistedState<Partial<Record<RenderedMode, boolean>>>("phaseo.desktop.fileRendered", {});
	const [wrap, setWrap] = usePersistedState("phaseo.desktop.fileWrap", false);
	const [explorerOpen, setExplorerOpen] = usePersistedState("phaseo.desktop.fileExplorerOpen", true);
	const [save, setSave] = useState<SaveState>({ dirty: false });
	const hashRef = useRef("");
	const dirtyRef = useRef(false); dirtyRef.current = save.dirty;
	const notify = useRef(onDirtyChange); notify.current = onDirtyChange;
	useEffect(() => { notify.current?.(save.dirty); }, [save.dirty]);
	useEffect(() => () => notify.current?.(false), []);
	useEffect(() => { hashRef.current = ""; setPreview(undefined); setError(""); setSave({ dirty: false }); }, [projectId, path]);

	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.filePreview(projectId, path).then(next => {
			if (!active) return;
			// Our own saves come back as changes; only a different file on disk replaces the editor.
			if (next.kind === "text" && next.hash && (next.hash === hashRef.current || dirtyRef.current)) return;
			setPreview(next); setError(""); setVersion(value => value + 1);
			if (next.kind === "text" && next.hash) hashRef.current = next.hash;
		}, reason => { if (active) setError(ipcError(reason)); });
		return () => { active = false; };
	}, [api, projectId, path, reload]);
	useEffect(() => onProjectChange(projectId, () => setReload(value => value + 1)), [projectId]);
	useEffect(() => { const focus = () => setReload(value => value + 1); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, []);

	const open = useCallback((next: string) => { if (onOpenFile) onOpenFile(next); else openProjectFile({ projectId, path: next }); }, [onOpenFile, projectId]);
	const mode = preview?.kind === "text" ? renderedModeOf(path) : undefined;
	const showRendered = mode !== undefined && (rendered[mode] ?? true);
	const showsSource = preview?.kind === "text" && !showRendered;
	const editable = preview?.kind === "text" && !preview.truncated && Boolean(preview.hash);
	const discard = () => { hashRef.current = ""; setSave({ dirty: false }); setReload(value => value + 1); };

	const crumbs = fileBreadcrumbs(projectName, path);
	const header = <div className={FILE_SURFACE_HEADER_CLASS} data-surface-subheader>
		<ScrollArea className="min-w-0 flex-1" scrollBarOrientation="horizontal" scrollBarClassName="hidden" data-file-breadcrumbs>
			<nav aria-label="File path" className="flex h-10 w-max min-w-full items-center text-xs">
				{crumbs.map((crumb, index) => <div key={crumb.path || "project"} className="flex min-w-0 shrink-0 items-center">
					{index > 0 && <ChevronRight className="mx-1 size-3.5 shrink-0 text-muted-foreground/60" />}
					{crumb.kind === "file" ? <span aria-current="page" className="block max-w-56 truncate font-medium text-foreground" title={crumb.path}>{crumb.label}{save.dirty && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-foreground/70 align-middle" aria-label="Unsaved changes" />}</span>
						: <DirectoryCrumb projectId={projectId} crumb={crumb} currentPath={path} onOpenFile={open} />}
				</div>)}
			</nav>
		</ScrollArea>
		<div className="flex shrink-0 items-center gap-0.5">
			<OpenInEditor projectId={projectId} path={path} />
			{mode && <ToolbarButton label={renderedToggleLabel(mode, showRendered)} pressed={showRendered} onClick={() => setRendered({ ...rendered, [mode]: !showRendered })}>{showRendered ? <Code2 /> : mode === "table" ? <Table2 /> : mode === "html" ? <Globe2 /> : <Eye />}</ToolbarButton>}
			{showsSource && <ToolbarButton label={wrap ? "Disable word wrap" : "Enable word wrap"} pressed={wrap} onClick={() => setWrap(!wrap)}><WrapText /></ToolbarButton>}
			<ToolbarButton label={explorerOpen ? "Hide file explorer" : "Show file explorer"} pressed={explorerOpen} onClick={() => setExplorerOpen(!explorerOpen)}><FolderTree /></ToolbarButton>
		</div>
	</div>;

	let body: ReactNode;
	if (!api) body = <SurfaceMessage>Open the desktop app to view project files.</SurfaceMessage>;
	else if (error && !preview) body = <SurfaceError message={error} onRetry={() => setReload(value => value + 1)} />;
	else if (!preview) body = <SurfaceMessage><span role="status">Loading file…</span></SurfaceMessage>;
	else if (preview.kind === "image") body = <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"><img src={preview.dataUrl} alt={path} className="max-h-full max-w-full object-contain" /></div>;
	else if (preview.kind === "pdf") body = <div className="flex min-h-0 flex-1 flex-col"><SurfaceNotice>The text of this {preview.pages === 1 ? "1-page" : `${preview.pages}-page`} PDF. Open it in another app to see its layout.</SurfaceNotice><PlainSource text={preview.text || "This PDF has no text to show."} wrap /></div>;
	else if (preview.kind === "binary") body = <SurfaceMessage>This file is binary ({formatBytes(preview.size)}) and cannot be shown as text.</SurfaceMessage>;
	else if (preview.kind === "too-large") body = <SurfaceMessage>This file is too large to preview ({formatBytes(preview.size)}).</SurfaceMessage>;
	else if (showRendered && mode === "markdown") body = <ScrollArea className="min-h-0 flex-1"><div className="file-markdown mx-auto max-w-3xl px-6 py-5 text-sm"><MessageContent text={preview.text} projectId={projectId} repairLocalLinks /></div></ScrollArea>;
	else if (showRendered && mode === "table") body = <DelimitedTable name={path} text={preview.text} delimiter={tableDelimiter(path)} />;
	// Scripts, forms and plugins stay off: the page is shown, never run.
	else if (showRendered && mode === "html") body = <iframe title={path} sandbox="" srcDoc={preview.text} referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border-0 bg-white" />;
	else body = <SourceBoundary key={`${path}:${version}`} fallback={<PlainSource text={preview.text} wrap={wrap} />}>
		{editable && preview.hash ? <EditableSource key={`${path}:${version}`} projectId={projectId} path={path} text={preview.text} hash={preview.hash} wrap={wrap} theme={theme} hashRef={hashRef} onSaveState={setSave} />
			: <ReadOnlySource path={path} text={preview.text} wrap={wrap} theme={theme} />}
	</SourceBoundary>;

	return <div className="file-surface flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background" data-file-path={path}>
		{header}
		{preview?.kind === "text" && preview.truncated && <SurfaceNotice tone="warning">Preview limited to the first 1 MB of a {preview.size.toLocaleString()} byte file. Files over 1 MB are read-only.</SurfaceNotice>}
		{save.error && <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
			<span className="min-w-0 flex-1">{save.error} Your edits are kept until you reload.</span>
			<button type="button" onClick={discard} className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-destructive/15">Reload from disk</button>
		</div>}
		<div className="flex min-h-0 flex-1 overflow-hidden">
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">{body}</div>
			{explorerOpen && <aside className="flex min-h-0 w-[min(22rem,46%)] min-w-64 shrink-0 border-l border-border/60 bg-background"><FileBrowserSurface projectId={projectId} selectedPath={path} onOpenFile={open} /></aside>}
		</div>
	</div>;
}
