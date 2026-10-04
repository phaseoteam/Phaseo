import { useEffect, useRef, useState } from "react";
import { ArrowLeft, File, Folder, FolderOpen, RefreshCw } from "lucide-react";
import type { GitCommand, GitReview, ProjectFile } from "../../shared/workspace";
import type { EditorId, EditorInstallation, ProjectOpenRequest } from "../../shared/editors";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { CodeBlock } from "../components/MessageContent";
import { usePersistedState } from "../lib/persistedState";

export function Projects() {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [savedEdit, setSavedEdit] = usePersistedState<{ projectId: string; filename: string; text: string; hash: string; draft: string } | undefined>("phaseo.desktop.fileDraft", undefined);
	const [id, setId] = useState(savedEdit?.projectId ?? "");
	const [directory, setDirectory] = useState("");
	const [files, setFiles] = useState<ProjectFile[]>([]);
	const [preview, setPreview] = useState<{ filename: string; text: string; hash: string } | undefined>(savedEdit);
	const [draft, setDraft] = useState(savedEdit?.draft ?? "");
	const [editing, setEditing] = useState(Boolean(savedEdit));
	const [saving, setSaving] = useState(false);
	const [refresh, setRefresh] = useState(0);
	const dirty = Boolean(preview && draft !== preview.text);
	const [review, setReview] = useState<GitReview>();
	const [branches, setBranches] = useState<string[]>([]);
	const [branchName, setBranchName] = useState("");
	const [worktreeBranch, setWorktreeBranch] = useState(""); const [worktreeBase, setWorktreeBase] = useState("HEAD");
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [commitMessage, setCommitMessage] = useState("");
	const [gitBusy, setGitBusy] = useState(false);
	const [tab, setTab] = useState<"files" | "git">("files");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [editors, setEditors] = useState<EditorInstallation[]>([]);
	const [preferredEditor, setPreferredEditor] = usePersistedState<EditorId | undefined>("phaseo.desktop.editor", undefined);
	const [editorRefresh, setEditorRefresh] = useState(0);
	const [editorsLoading, setEditorsLoading] = useState(false);
	const [editorError, setEditorError] = useState("");
	const [editorBusy, setEditorBusy] = useState(false);
	const editorPending = useRef(false);
	const editor = editors.find(value => value.id === preferredEditor && value.available) ?? editors.find(value => value.available);
	useEffect(() => {
		if (!api) return; let active = true; setEditorsLoading(true); setEditorError("");
		void api.editors().then(value => { if (active) setEditors(value); }, reason => { if (active) setEditorError(String(reason)); }).finally(() => { if (active) setEditorsLoading(false); });
		return () => { active = false; };
	}, [api, editorRefresh]);
	const previewRequest = useRef(0);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onOverviewChange(setWorkspace);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	useEffect(() => {
		previewRequest.current += 1;
		if (!api || !id) return;
		let active = true; setLoading(true); setError("");
		const request = tab === "files" ? api.listFiles(id, directory).then(value => { if (active) setFiles(value); }) : Promise.all([api.gitReview(id), api.gitBranches(id)]).then(([value, names]) => { if (active) { setReview(value); setBranches(names); } });
		void request.catch(reason => { if (active) setError(String(reason)); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [api, id, directory, tab, refresh]);
	function canNavigate() {
		if (editorPending.current) { setError("Wait for the editor to open."); return false; }
		if (gitBusy) { setError("Wait for the Git action to finish."); return false; }
		if (saving || dirty) { setError("Save or discard this edit before opening another file or project."); return false; }
		setEditing(false); return true;
	}
	async function openTarget(request: ProjectOpenRequest) {
		if (!api || !id || editorPending.current || !canNavigate()) return;
		editorPending.current = true; setEditorBusy(true); setError("");
		try { await api.openProject(id, request); }
		catch (reason) { setError(String(reason).replace(/^Error: Error invoking remote method '[^']+': (?:Error: )?/, "")); }
		finally { editorPending.current = false; setEditorBusy(false); }
	}
	async function changeGit(command: GitCommand) {
		if (!api || gitBusy) return;
		setGitBusy(true); setError("");
		try { const value = await api.gitCommand(id, command); setReview(value); setBranches(await api.gitBranches(id)); if (command.type === "commit") setCommitMessage(""); if (command.type === "create-branch") setBranchName(""); }
		catch (reason) { setError(String(reason)); }
		finally { setGitBusy(false); }
	}
	async function createWorktree() {
		if (!api || !canNavigate()) return; setGitBusy(true); setError("");
		try { const result = await api.createWorktree(id, worktreeBranch.trim(), worktreeBase.trim()); setWorkspace(result.workspace); setId(result.projectId); setDirectory(""); setPreview(undefined); setReview(undefined); setWorktreeBranch(""); setWorktreeBase("HEAD"); }
		catch (reason) { setError(String(reason)); } finally { setGitBusy(false); }
	}
	async function removeWorktree() {
		if (!api || !canNavigate()) return; setGitBusy(true); setError("");
		try { setWorkspace(await api.removeWorktree(id)); setId(""); setDirectory(""); setPreview(undefined); setReview(undefined); setConfirmRemove(false); } catch (reason) { setError(String(reason)); } finally { setGitBusy(false); }
	}
	async function save() {
		if (!api || !preview || saving) return;
		setSaving(true); setError("");
		try { const { hash } = await api.writeDocument(id, preview.filename, draft, preview.hash); setPreview({ ...preview, text: draft, hash }); setSavedEdit(undefined); }
		catch (reason) { setError(String(reason)); }
		finally { setSaving(false); }
	}
	async function open(file: ProjectFile) {
		if (!canNavigate()) return;
		const request = ++previewRequest.current;
		if (file.directory) { setDirectory(file.path); setPreview(undefined); return; }
		if (!api) return;
		setError("");
		try { const document = await api.readDocument(id, file.path); if (request === previewRequest.current) { setPreview({ filename: file.path, ...document }); setDraft(document.text); } }
		catch (reason) { if (request === previewRequest.current) setError(String(reason)); }
	}
	return <div className="page task-workspace project-page"><section>
		<h1>Projects</h1><div className="project-toolbar"><select aria-label="Project" value={id} onChange={event => { if (!canNavigate()) return; setId(event.target.value); setConfirmRemove(false); setDirectory(""); setPreview(undefined); setReview(undefined); }}><option value="">Choose a project</option>{workspace.projects.filter(project => !project.worktree?.removedAt).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button type="button" onClick={() => { if (api) void api.chooseProject().then(setWorkspace, reason => setError(String(reason))); }}><FolderOpen size={16} /> Open folder</button><button type="button" aria-pressed={tab === "files"} onClick={() => { if (canNavigate()) setTab("files"); }}>Files</button><button type="button" aria-pressed={tab === "git"} onClick={() => { if (canNavigate()) setTab("git"); }}>Git review</button>{workspace.projects.find(project => project.id === id)?.worktree && <button type="button" disabled={gitBusy} onClick={() => { if (canNavigate()) setConfirmRemove(true); }}>Remove worktree</button>}</div>
		{id && <div className="project-toolbar project-editor-actions" aria-label="External editor"><select aria-label="External editor" value={editor?.id ?? ""} disabled={editorsLoading || editorBusy} onChange={event => setPreferredEditor(event.target.value as EditorId)}>{!editor && <option value="">{editorsLoading ? "Finding editors…" : "No editors found"}</option>}{editors.map(value => <option key={value.id} value={value.id} disabled={!value.available}>{value.name}{!value.available ? " (unavailable)" : ""}</option>)}</select><button type="button" disabled={!editor || editorsLoading || editorBusy || gitBusy || saving || dirty} onClick={() => { if (editor) void openTarget({ editor: editor.id }); }}>Open project</button><button type="button" aria-label="Refresh editors" disabled={editorsLoading || editorBusy} onClick={() => setEditorRefresh(value => value + 1)}><RefreshCw size={14} /></button><button type="button" disabled={editorBusy || gitBusy || saving || dirty} onClick={() => void openTarget({ editor: "file-manager" })}>Show folder</button></div>}
		{editorError && <p className="task-error" role="alert">{editorError}</p>}
		{editorBusy && <p className="task-muted" role="status">Opening…</p>}
		{id && !editorsLoading && !editor && !editorError && <p className="task-muted">Install an editor, then refresh the list.</p>}
		{confirmRemove && <section className="task-setup" aria-label="Remove worktree"><p>Remove this checkout and its ignored files? The branch and conversations are retained.</p><button type="button" disabled={gitBusy} onClick={() => void removeWorktree()}>Remove checkout</button><button type="button" disabled={gitBusy} onClick={() => setConfirmRemove(false)}>Cancel</button></section>}
		{error && <p className="task-error" role="alert">{error}</p>}
		{loading && <p className="task-muted" role="status">Loading…</p>}
		{!id && <p className="task-muted">Open a folder to browse files and review changes.</p>}
		{id && tab === "files" && <div className="project-browser"><aside><button type="button" disabled={!directory} onClick={() => { if (!canNavigate()) return; setDirectory(directory.split("/").slice(0, -1).join("/")); setPreview(undefined); }}><ArrowLeft size={14} /> {directory || "Project root"}</button>{files.map(file => <button type="button" key={file.path} onClick={() => void open(file)}>{file.directory ? <Folder size={14} /> : <File size={14} />}{file.name}</button>)}</aside><section>{preview ? <><div className="project-toolbar"><strong>{preview.filename}{dirty ? " • Unsaved" : ""}</strong>{editing ? <><button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button><button type="button" disabled={saving} onClick={() => { setDraft(preview.text); setSavedEdit(undefined); setEditing(false); setError(""); }}>Discard</button></> : <div className="project-preview-actions"><button type="button" disabled={editorBusy} onClick={() => setEditing(true)}>Edit</button><button type="button" disabled={!editor || editorBusy || gitBusy} onClick={() => { if (editor) void openTarget({ editor: editor.id, filename: preview.filename }); }}>Open in {editor?.name ?? "editor"}</button><button type="button" disabled={editorBusy || gitBusy} onClick={() => void openTarget({ editor: "file-manager", filename: preview.filename })}>Reveal file</button></div>}</div>{editing ? <textarea className="project-editor" aria-label={`Edit ${preview.filename}`} spellCheck={false} disabled={saving} value={draft} onChange={event => { setDraft(event.target.value); setSavedEdit(event.target.value === preview.text ? undefined : { projectId: id, ...preview, draft: event.target.value }); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "s") { event.preventDefault(); void save(); } }} /> : <CodeBlock text={preview.text} language={preview.filename.split(".").at(-1)?.toLowerCase()} />}</> : <p className="task-muted">Select a file to preview it.</p>}</section></div>}
		{id && tab === "git" && review && <section className="project-review">
			<form className="project-toolbar" aria-label="Create worktree" onSubmit={event => { event.preventDefault(); void createWorktree(); }}><label>Worktree branch<input aria-label="Worktree branch" value={worktreeBranch} onChange={event => setWorktreeBranch(event.target.value)} maxLength={200} required disabled={gitBusy} /></label><label>Starting ref<input aria-label="Worktree starting ref" list="worktree-refs" value={worktreeBase} onChange={event => setWorktreeBase(event.target.value)} maxLength={1000} required disabled={gitBusy} /><datalist id="worktree-refs"><option value="HEAD" />{branches.map(branch => <option key={branch} value={branch} />)}</datalist></label><button type="submit" disabled={gitBusy || !worktreeBranch.trim() || !worktreeBase.trim()}>Create worktree</button></form>
			<div className="project-toolbar">
				<strong>{review.branch || "Detached HEAD"}</strong>
				<button type="button" aria-label="Refresh Git review" disabled={loading || gitBusy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /></button>
				<select aria-label="Switch branch" value={review.branch} disabled={gitBusy} onChange={event => void changeGit({ type: "switch-branch", name: event.target.value })}>
					{!review.branch && <option value="">Detached HEAD</option>}{[...new Set([review.branch, ...branches])].filter(Boolean).map(name => <option key={name} value={name}>{name}</option>)}
				</select>
				<input aria-label="New branch name" placeholder="New branch" value={branchName} onChange={event => setBranchName(event.target.value)} />
				<button type="button" disabled={gitBusy || !branchName.trim()} onClick={() => void changeGit({ type: "create-branch", name: branchName.trim() })}>Create branch</button>
			</div>
			<h2>Working changes</h2>
			{review.files.length ? <div className="git-file-list">{review.files.map(file => <div className="project-toolbar" key={file.path}>
				<code>{file.indexStatus}{file.worktreeStatus}</code><span>{file.oldPath ? `${file.oldPath} → ` : ""}{file.path}</span>
				{![file.indexStatus, file.worktreeStatus].includes("D") && <button type="button" disabled={!editor || editorBusy || gitBusy} onClick={() => { if (editor) void openTarget({ editor: editor.id, filename: file.path }); }}>Open file</button>}
				{file.worktreeStatus !== " " && <button type="button" disabled={gitBusy} onClick={() => void changeGit({ type: "stage", filename: file.path })}>Stage</button>}
				{![" ", "?"].includes(file.indexStatus) && <button type="button" disabled={gitBusy} onClick={() => void changeGit({ type: "unstage", filename: file.path })}>Unstage</button>}
			</div>)}</div> : <p className="task-muted">Working tree is clean.</p>}
			<h2>Unstaged changes</h2>{review.diff ? <CodeBlock text={review.diff} language="diff" /> : <p className="task-muted">No unstaged changes.</p>}<h2>Staged changes</h2>{review.stagedDiff ? <CodeBlock text={review.stagedDiff} language="diff" /> : <p className="task-muted">No staged changes.</p>}
			<div className="project-toolbar"><input aria-label="Commit message" placeholder="Commit message" value={commitMessage} onChange={event => setCommitMessage(event.target.value)} /><button type="button" disabled={gitBusy || !commitMessage.trim() || !review.stagedDiff} onClick={() => void changeGit({ type: "commit", message: commitMessage })}>Commit staged changes</button></div>
		</section>}
	</section></div>;
}
