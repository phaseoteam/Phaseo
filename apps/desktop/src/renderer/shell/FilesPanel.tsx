import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Columns2, ExternalLink, File, Folder, FolderOpen, FolderPlus, GitBranch, Minus, Pencil, Plus, Rows2, Trash2 } from "lucide-react";
import type { GitCommand, GitFile, GitReview, ProjectFile } from "../../shared/workspace";
import type { EditorId, EditorInstallation, ProjectOpenRequest } from "../../shared/editors";
import { errorText, useWorkspace } from "../app/workspace";
import { useBackgroundRefresh } from "../lib/useBackgroundRefresh";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { CodeBlock } from "../components/MessageContent";
import { DiffView } from "../components/DiffView";
import { GitHunkPanel } from "../components/GitHunkPanel";
import type { DiffLayout } from "../components/diffRendering";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";

const statusTone: Record<string, string> = { M: "text-warning", A: "text-success", "?": "text-success", D: "text-destructive", R: "text-info", U: "text-destructive" };
const statusLabel = (file: GitFile) => (file.indexStatus === "?" ? "U" : [file.indexStatus, file.worktreeStatus].find(value => value.trim()) ?? "M");
const staged = (file: GitFile) => ![" ", "?"].includes(file.indexStatus);
const unstaged = (file: GitFile) => file.worktreeStatus !== " ";

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
	return <button type="button" aria-pressed={active} onClick={onClick} className={cn("h-7 rounded-md px-2 text-xs font-semibold transition-colors", active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{children}</button>;
}

function Ghost({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={event => { event.stopPropagation(); onClick(); }} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5">{children}</button>;
}

function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return <div className="flex h-8 items-center justify-between px-3 pt-2 text-xs font-bold text-foreground/70">{children}{action}</div>;
}

function FileRow({ file, selected, busy, onSelect, onCommand }: { file: GitFile; selected: boolean; busy: boolean; onSelect: () => void; onCommand: (command: GitCommand) => void }) {
	const slash = file.path.lastIndexOf("/");
	const status = statusLabel(file);
	return <div role="button" tabIndex={0} aria-current={selected ? "true" : undefined} onClick={onSelect} onKeyDown={event => { if (event.key === "Enter") onSelect(); }}
		className={cn("group/file mx-1.5 flex h-7 items-center gap-2 rounded-md px-1.5 text-[12.5px] hover:bg-muted/60", selected && "bg-muted")}>
		<span className="min-w-0 flex-1 truncate">{file.path.slice(slash + 1)}<span className="ml-1.5 text-muted-foreground">{slash > 0 ? file.path.slice(0, slash) : ""}</span></span>
		<span className="hidden items-center group-hover/file:flex">
			{unstaged(file) && <Ghost label={`Stage ${file.path}`} disabled={busy} onClick={() => onCommand({ type: "stage", filename: file.path })}><Plus /></Ghost>}
			{staged(file) && <Ghost label={`Unstage ${file.path}`} disabled={busy} onClick={() => onCommand({ type: "unstage", filename: file.path })}><Minus /></Ghost>}
		</span>
		<span className={cn("w-3 shrink-0 text-center font-mono text-[11px] font-semibold", statusTone[status] ?? "text-muted-foreground")}>{status}</span>
	</div>;
}

export function FilesPanel({ initialProjectId }: { initialProjectId?: string }) {
	const { api, overview, setOverview } = useWorkspace();
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const [id, setId] = useState(initialProjectId || projects[0]?.id || "");
	const project = projects.find(value => value.id === id);
	const [tab, setTab] = usePersistedState<"changes" | "files">("phaseo.desktop.filesTab", "changes");
	const [layout, setLayout] = usePersistedState<DiffLayout>("phaseo.desktop.diffLayout", "unified");
	const [editors, setEditors] = useState<EditorInstallation[]>([]);
	const [preferredEditor, setPreferredEditor] = usePersistedState<EditorId | undefined>("phaseo.desktop.editor", undefined);
	const editor = editors.find(value => value.id === preferredEditor && value.available) ?? editors.find(value => value.available);
	const [review, setReview] = useState<GitReview>();
	const [branches, setBranches] = useState<string[]>([]);
	const [selectedFile, setSelectedFile] = useState<string>();
	const [message, setMessage] = useState("");
	const [newBranch, setNewBranch] = useState<string>();
	const [branchKind, setBranchKind] = useState<"branch" | "worktree">("branch");
	const [directory, setDirectory] = useState("");
	const [files, setFiles] = useState<ProjectFile[]>([]);
	const [preview, setPreview] = useState<{ filename: string; text: string; hash: string }>();
	const [draft, setDraft] = useState<string>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [refresh, setRefresh] = useState(0);
	const previewRequest = useRef(0);
	const dirty = preview !== undefined && draft !== undefined && draft !== preview.text;

	useEffect(() => { if (!id && projects[0]) setId(projects[0].id); }, [id, projects]);
	useEffect(() => { if (api) void api.editors().then(setEditors, () => undefined); }, [api]);
	useBackgroundRefresh(() => { if (!busy && !dirty) setRefresh(value => value + 1); });
	useEffect(() => {
		if (!api || !id) return;
		let active = true;
		const request = tab === "changes"
			? Promise.all([api.gitReview(id), api.gitBranches(id)]).then(([value, names]) => { if (active) { setReview(value); setBranches(names); } })
			: api.listFiles(id, directory).then(value => { if (active) setFiles(value); });
		void request.then(() => { if (active) setError(""); }, reason => { if (active) setError(errorText(reason)); });
		return () => { active = false; };
	}, [api, id, tab, directory, refresh]);

	const guard = () => { if (dirty) { setError("Save or discard your edit first."); return false; } return true; };
	const switchProject = (value: string) => { if (!guard()) return; setId(value); setDirectory(""); setPreview(undefined); setDraft(undefined); setReview(undefined); setSelectedFile(undefined); };
	const run = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true); setError("");
		try { await action(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	const git = (command: GitCommand) => run(async () => {
		setReview(await api!.gitCommand(id, command)); setBranches(await api!.gitBranches(id));
		if (command.type === "commit") setMessage("");
		if (command.type === "create-branch") setNewBranch(undefined);
	});
	const open = (request: ProjectOpenRequest) => run(() => api!.openProject(id, request));
	const createWorktree = (branch: string) => run(async () => {
		const result = await api!.createWorktree(id, branch, review?.branch || "HEAD");
		setOverview(result.workspace); setNewBranch(undefined); switchProject(result.projectId);
	});
	const removeWorktree = () => {
		if (!guard() || !window.confirm("Remove this checkout and its ignored files? The branch and chats are kept.")) return;
		void run(async () => { setOverview(await api!.removeWorktree(id)); setId(""); setReview(undefined); });
	};
	const openFile = (file: ProjectFile) => {
		if (!guard()) return;
		const request = ++previewRequest.current;
		if (file.directory) { setDirectory(file.path); return; }
		void api?.readDocument(id, file.path).then(document => { if (request === previewRequest.current) { setPreview({ filename: file.path, ...document }); setDraft(undefined); } }, reason => setError(errorText(reason)));
	};
	const save = () => { if (preview && draft !== undefined) void run(async () => { const { hash } = await api!.writeDocument(id, preview.filename, draft, preview.hash); setPreview({ ...preview, text: draft, hash }); setDraft(undefined); }); };

	if (!projects.length) return <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
		<FolderOpen className="size-6 text-muted-foreground" />
		<p className="text-[13px] text-muted-foreground">Open a folder to browse files and review changes.</p>
		<button type="button" onClick={() => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); }} className="h-7 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85">Open folder</button>
	</div>;

	const stagedFiles = review?.files.filter(staged) ?? [];
	const changedFiles = review?.files.filter(unstaged) ?? [];
	const changeCount = review?.files.length ?? 0;
	return <div className="files-panel flex h-full min-h-0 flex-col">
		<div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold hover:bg-muted [&_svg]:size-3.5" />}>
					<FolderOpen className="text-muted-foreground" /><span className="truncate">{project?.name ?? "Choose a project"}</span><ChevronDown className="text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					<DropdownMenuRadioGroup value={id} onValueChange={value => switchProject(String(value))}>
						{projects.map(value => <DropdownMenuRadioItem key={value.id} value={value.id}>{value.name}{value.worktree && <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{value.worktree.branch}</span>}</DropdownMenuRadioItem>)}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); }}><FolderOpen />Open folder…</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="ml-1 flex items-center gap-0.5">
				<Tab active={tab === "changes"} onClick={() => { if (guard()) setTab("changes"); }}>Changes{changeCount > 0 && <span className="ml-1 text-muted-foreground">{changeCount}</span>}</Tab>
				<Tab active={tab === "files"} onClick={() => setTab("files")}>Files</Tab>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" aria-label="Open in editor" title="Open in editor" className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4" />}><ExternalLink /></DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuItem disabled={!editor || busy} onClick={() => { if (editor) void open({ editor: editor.id }); }}>Open in {editor?.name ?? "editor"}</DropdownMenuItem>
					<DropdownMenuItem disabled={busy} onClick={() => void open({ editor: "file-manager" })}>Show in folder</DropdownMenuItem>
					{editors.length > 1 && <>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>Editor</DropdownMenuLabel>
						<DropdownMenuRadioGroup value={editor?.id ?? ""} onValueChange={value => setPreferredEditor(value as EditorId)}>
							{editors.map(value => <DropdownMenuRadioItem key={value.id} value={value.id} disabled={!value.available}>{value.name}</DropdownMenuRadioItem>)}
						</DropdownMenuRadioGroup>
					</>}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
		{error && <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</p>}

		{tab === "changes" && <>
			<div className="flex h-9 shrink-0 items-center gap-1 px-2">
				<DropdownMenu>
					<DropdownMenuTrigger disabled={busy || !review} render={<button type="button" className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 font-mono text-xs hover:bg-muted [&_svg]:size-3.5" />}>
						<GitBranch className="text-muted-foreground" /><span className="truncate">{review?.branch || "Detached HEAD"}</span><ChevronDown className="text-muted-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="max-h-80 w-64">
						<DropdownMenuItem onClick={() => { setBranchKind("branch"); setNewBranch(""); }}><Plus />New branch…</DropdownMenuItem>
						<DropdownMenuItem onClick={() => { setBranchKind("worktree"); setNewBranch(""); }}><FolderPlus />New worktree…</DropdownMenuItem>
						{project?.worktree && <DropdownMenuItem variant="destructive" onClick={removeWorktree}><Trash2 />Remove this worktree</DropdownMenuItem>}
						<DropdownMenuSeparator />
						{[...new Set([review?.branch ?? "", ...branches])].filter(Boolean).map(name => <DropdownMenuItem key={name} onClick={() => { if (name !== review?.branch) void git({ type: "switch-branch", name }); }} className="font-mono text-xs">
							<Check className={cn(name !== review?.branch && "invisible")} />{name}
						</DropdownMenuItem>)}
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="ml-auto flex items-center">
					<Ghost label="Unified diff" onClick={() => setLayout("unified")}><Rows2 className={cn(layout === "unified" && "text-foreground")} /></Ghost>
					<Ghost label="Side-by-side diff" onClick={() => setLayout("split")}><Columns2 className={cn(layout === "split" && "text-foreground")} /></Ghost>
				</div>
			</div>
			{newBranch !== undefined && <form className="flex items-center gap-1.5 px-3 pb-2" onSubmit={event => { event.preventDefault(); if (!newBranch.trim()) return; if (branchKind === "branch") void git({ type: "create-branch", name: newBranch.trim() }); else void createWorktree(newBranch.trim()); }}>
				<input autoFocus aria-label="New branch name" placeholder={branchKind === "branch" ? "Branch name" : "Worktree branch name"} value={newBranch} onChange={event => setNewBranch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setNewBranch(undefined); }}
					className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus:border-ring" />
				<button type="submit" disabled={busy || !newBranch.trim()} className="h-7 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Create</button>
			</form>}
			<div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
				{review && !review.files.length && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No changes. The working tree is clean.</p>}
				{stagedFiles.length > 0 && <><Heading action={<Ghost label="Unstage all" disabled={busy} onClick={() => void run(async () => { for (const file of stagedFiles) await api!.gitCommand(id, { type: "unstage", filename: file.path }); setRefresh(value => value + 1); })}><Minus /></Ghost>}>Staged</Heading>
					{stagedFiles.map(file => <FileRow key={`staged:${file.path}`} file={{ ...file, worktreeStatus: " " }} selected={selectedFile === file.path} busy={busy} onSelect={() => setSelectedFile(value => value === file.path ? undefined : file.path)} onCommand={command => void git(command)} />)}</>}
				{changedFiles.length > 0 && <><Heading action={<Ghost label="Stage all" disabled={busy} onClick={() => void run(async () => { for (const file of changedFiles) await api!.gitCommand(id, { type: "stage", filename: file.path }); setRefresh(value => value + 1); })}><Plus /></Ghost>}>Changes</Heading>
					{changedFiles.map(file => <FileRow key={`changed:${file.path}`} file={{ ...file, indexStatus: file.indexStatus === "?" ? "?" : " " }} selected={selectedFile === file.path} busy={busy} onSelect={() => setSelectedFile(value => value === file.path ? undefined : file.path)} onCommand={command => void git(command)} />)}</>}
				{review && review.files.length > 0 && <div className="mt-3 border-t border-border">
					{selectedFile && review.files.some(file => file.path === selectedFile)
						? <GitHunkPanel key={`${id}:${selectedFile}`} projectId={id} filename={selectedFile} revision={review} busy={busy} layout={layout} onCommand={git} />
						: <div className="flex flex-col">
							{review.stagedDiff && <DiffView patch={review.stagedDiff} layout={layout} context={{ projectId: id, staged: true, hash: review.stagedDiffHash }} onRefresh={() => setRefresh(value => value + 1)} />}
							{review.diff && <DiffView patch={review.diff} layout={layout} context={{ projectId: id, staged: false, hash: review.diffHash }} onRefresh={() => setRefresh(value => value + 1)} />}
						</div>}
				</div>}
			</div>
			{review && review.files.length > 0 && <form className="shrink-0 border-t border-border p-2" onSubmit={event => { event.preventDefault(); if (message.trim()) void git({ type: "commit", message }); }}>
				<textarea aria-label="Commit message" rows={2} placeholder={stagedFiles.length ? "Commit message" : "Stage changes to commit"} value={message} onChange={event => setMessage(event.target.value)}
					onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
					className="block w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring" />
				<button type="submit" disabled={busy || !message.trim() || !stagedFiles.length} className="mt-1.5 h-7 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50">Commit {stagedFiles.length ? `${stagedFiles.length} ${stagedFiles.length === 1 ? "file" : "files"}` : ""}</button>
			</form>}
		</>}

		{tab === "files" && (preview
			? <div className="flex min-h-0 flex-1 flex-col">
				<div className="flex h-9 shrink-0 items-center gap-1 px-1.5">
					<Ghost label="Back to files" onClick={() => { if (guard()) setPreview(undefined); }}><ArrowLeft /></Ghost>
					<span className="min-w-0 flex-1 truncate font-mono text-xs">{preview.filename}{dirty && <span className="ml-1.5 font-sans text-muted-foreground">Edited</span>}</span>
					{draft === undefined
						? <><Ghost label="Edit" onClick={() => setDraft(preview.text)}><Pencil /></Ghost>
							<Ghost label={`Open in ${editor?.name ?? "editor"}`} disabled={!editor || busy} onClick={() => { if (editor) void open({ editor: editor.id, filename: preview.filename }); }}><ExternalLink /></Ghost></>
						: <><button type="button" disabled={busy} onClick={() => setDraft(undefined)} className="h-6 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Discard</button>
							<button type="button" disabled={busy || !dirty} onClick={save} className="h-6 rounded bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">Save</button></>}
				</div>
				<div className="scrollbar-thin min-h-0 flex-1 overflow-auto border-t border-border">
					{draft === undefined
						? <CodeBlock text={preview.text} language={preview.filename.split(".").at(-1)?.toLowerCase()} />
						: <textarea aria-label={`Edit ${preview.filename}`} spellCheck={false} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "s") { event.preventDefault(); save(); } }}
							className="block h-full min-h-80 w-full resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none" />}
				</div>
			</div>
			: <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1">
				<nav aria-label="Folder" className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 text-xs text-muted-foreground">
					<button type="button" onClick={() => setDirectory("")} className="hover:text-foreground">{project?.name ?? "Project"}</button>
					{directory.split("/").filter(Boolean).map((part, index, parts) => <span key={index} className="flex items-center gap-0.5">/<button type="button" onClick={() => setDirectory(parts.slice(0, index + 1).join("/"))} className="hover:text-foreground">{part}</button></span>)}
				</nav>
				{directory && <button type="button" onClick={() => setDirectory(directory.split("/").slice(0, -1).join("/"))} className="mx-1.5 flex h-7 w-[calc(100%-12px)] items-center gap-2 rounded-md px-1.5 text-[12.5px] text-muted-foreground hover:bg-muted/60"><ArrowLeft className="size-3.5" />..</button>}
				{files.map(file => <button key={file.path} type="button" onClick={() => openFile(file)} className="mx-1.5 flex h-7 w-[calc(100%-12px)] items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] hover:bg-muted/60">
					{file.directory ? <Folder className="size-3.5 shrink-0 text-muted-foreground" /> : <File className="size-3.5 shrink-0 text-muted-foreground" />}<span className="truncate">{file.name}</span>
				</button>)}
			</div>)}
	</div>;
}
