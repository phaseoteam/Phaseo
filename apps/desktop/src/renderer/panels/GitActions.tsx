import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, CloudUpload, FolderPlus, GitBranch, GitPullRequestArrow, LoaderCircle, Minus, Plus, Trash2, WandSparkles } from "lucide-react";
import type { GitCommand, GitFile, GitReview } from "../../shared/workspace";
import type { BranchPullRequest } from "../../shared/pullRequests";
import { toastManager } from "../components/ui/toast";
import { Tip } from "../components/ui/tooltip";
import { openPullRequest } from "../views/pullRequests/events";
import { pullRequestStatePresentation } from "../views/pullRequests/presentation";
import { CheckoutPullRequestDialog } from "../views/pullRequests/CheckoutPullRequestDialog";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { announceProjectChange, onProjectChange, openProjectFile } from "./events";
import { ipcError, ToolbarButton } from "./surfaceChrome";
import { PublishRepositoryForm } from "./PublishRepository";

const statusTone: Record<string, string> = { M: "text-warning", A: "text-success", "?": "text-success", D: "text-destructive", R: "text-info", U: "text-destructive" };
const statusLabel = (file: GitFile) => (file.indexStatus === "?" ? "U" : [file.indexStatus, file.worktreeStatus].find(value => value.trim()) ?? "M");
const isStaged = (file: GitFile) => ![" ", "?"].includes(file.indexStatus);
const isUnstaged = (file: GitFile) => file.worktreeStatus !== " ";

function FileRow({ file, busy, onOpen, onCommand }: { file: GitFile; busy: boolean; onOpen: () => void; onCommand: (command: GitCommand) => void }) {
	const slash = file.path.lastIndexOf("/"), status = statusLabel(file);
	return <div className="group/file flex h-7 items-center gap-2 rounded-md px-1.5 text-xs hover:bg-accent/60">
		<button type="button" onClick={onOpen} title={file.path} className="min-w-0 flex-1 truncate text-left">{file.path.slice(slash + 1)}<span className="ml-1.5 text-muted-foreground">{slash > 0 ? file.path.slice(0, slash) : ""}</span></button>
		<span className="hidden items-center group-has-[:focus-visible]/file:flex group-hover/file:flex">
			{isUnstaged(file) && <ToolbarButton size="sm" label={`Stage ${file.path}`} disabled={busy} onClick={() => onCommand({ type: "stage", filename: file.path })}><Plus /></ToolbarButton>}
			{isStaged(file) && <ToolbarButton size="sm" label={`Unstage ${file.path}`} disabled={busy} onClick={() => onCommand({ type: "unstage", filename: file.path })}><Minus /></ToolbarButton>}
		</span>
		<span className={cn("w-3 shrink-0 text-center font-mono text-[11px] font-semibold", statusTone[status] ?? "text-muted-foreground")}>{status}</span>
	</div>;
}

/**
 * Branch, staging, commit and push for a project, kept out of the diff as T3 does.
 * Flat rows meant for a chat's details; `onProjectCreated` follows a new worktree. With `taskId`, a pull request
 * created here is linked to that chat (T3's create_pr).
 */
export function GitActions({ projectId, taskId, onProjectCreated }: { projectId: string; taskId?: string; onProjectCreated?: (projectId: string) => void }) {
	const { api, overview, setOverview } = useWorkspace();
	const project = overview.projects.find(value => value.id === projectId);
	const [review, setReview] = useState<GitReview>();
	const [branches, setBranches] = useState<string[]>([]);
	const [message, setMessage] = useState("");
	const [newBranch, setNewBranch] = useState<string>();
	const [branchKind, setBranchKind] = useState<"branch" | "worktree">("branch");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [refresh, setRefresh] = useState(0);
	const [repository, setRepository] = useState(true);
	const [branchPull, setBranchPull] = useState<BranchPullRequest>();
	const [checkoutOpen, setCheckoutOpen] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [generating, setGenerating] = useState(false);
	// Agents finishing in this project change its files, so their completion refreshes the list.
	const activity = overview.tasks.filter(task => task.projectId === projectId).map(task => `${task.id}:${task.status}:${task.lastCompletedAt ?? ""}`).join("|");

	useEffect(() => onProjectChange(projectId, () => setRefresh(value => value + 1)), [projectId]);
	useEffect(() => { const focus = () => setRefresh(value => value + 1); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, []);
	useEffect(() => {
		if (!api || !projectId) return;
		let active = true;
		void api.branchPullRequest(projectId).then(value => { if (active) setBranchPull(value); }, () => { if (active) setBranchPull(undefined); });
		void Promise.all([api.gitReview(projectId), api.gitBranches(projectId)]).then(([value, names]) => { if (active) { setReview(value); setBranches(names); setError(""); setRepository(true); } }, reason => { if (!active) return; const message = ipcError(reason); if (/not a git repository/i.test(message)) setRepository(false); else setError(message); });
		return () => { active = false; };
	}, [api, projectId, refresh, activity]);

	const run = async (action: () => Promise<void>) => {
		if (busy || !api) return;
		setBusy(true); setError("");
		try { await action(); } catch (reason) { setError(ipcError(reason)); } finally { setBusy(false); }
	};
	const git = (command: GitCommand) => run(async () => {
		setReview(await api!.gitCommand(projectId, command)); setBranches(await api!.gitBranches(projectId));
		if (command.type === "commit") setMessage("");
		if (command.type === "pull") toastManager.add({ type: "success", title: "Pulled the latest commits", timeout: 4000 });
		if (command.type === "create-branch") setNewBranch(undefined);
		announceProjectChange(projectId);
	});
	const createWorktree = (branch: string) => run(async () => {
		const result = await api!.createWorktree(projectId, branch, review?.branch || "HEAD");
		setOverview(result.workspace); setNewBranch(undefined); onProjectCreated?.(result.projectId);
	});
	const removeWorktree = () => {
		if (!window.confirm("Remove this checkout and its ignored files? The branch and chats are kept.")) return;
		void run(async () => { setOverview(await api!.removeWorktree(projectId)); });
	};
	const createPullRequest = (push: boolean) => run(async () => {
		const id = toastManager.add({ type: "loading", title: push ? "Pushing and creating pull request…" : "Creating pull request…", timeout: 0 });
		try {
			const result = await api!.createPullRequest(projectId, taskId);
			setOverview(result.workspace); setRefresh(value => value + 1); announceProjectChange(projectId);
			toastManager.update(id, { type: "success", title: result.status === "created" ? `Created pull request #${result.number}` : `Pull request #${result.number} is already open`, description: taskId ? "Linked to this chat." : undefined, timeout: 6000, actionProps: { children: "Open", onClick: () => openPullRequest({ number: result.number }) } });
		} catch (reason) { toastManager.update(id, { type: "error", title: "Could not create the pull request", description: ipcError(reason), timeout: 8000 }); }
	});
	/** T3: the title model writes the message from the changes; an empty message is written this way on commit. */
	const generateMessage = async () => {
		setGenerating(true);
		try { return await api!.gitCommitMessage(projectId); } finally { setGenerating(false); }
	};
	const commit = (push: boolean) => run(async () => {
		const text = message.trim() ? message : await generateMessage();
		setMessage(text);
		setReview(await api!.gitCommand(projectId, { type: "commit", message: text, all: !staged.length, push })); setBranches(await api!.gitBranches(projectId));
		setMessage(""); announceProjectChange(projectId);
		if (push) toastManager.add({ type: "success", title: "Committed and pushed", timeout: 4000 });
	});
	const initialise = () => run(async () => { setReview(await api!.gitInit(projectId)); setRepository(true); setRefresh(value => value + 1); announceProjectChange(projectId); });
	const stageAll = (files: GitFile[], type: "stage" | "unstage") => run(async () => {
		for (const file of files) await api!.gitCommand(projectId, { type, filename: file.path });
		setRefresh(value => value + 1); announceProjectChange(projectId);
	});

	const staged = review?.files.filter(isStaged) ?? [];
	const changed = review?.files.filter(isUnstaged) ?? [];
	const ahead = review?.upstream?.ahead ?? 0;
	const canPush = Boolean(review?.branch) && (review?.upstream ? ahead > 0 : Boolean(review?.hasRemote));
	const pushLabel = review?.upstream ? `Push ${ahead} ${ahead === 1 ? "commit" : "commits"}` : "Publish branch";
	// T3 offers Create PR on a feature branch with no open pull request; an open one shows as its own row instead.
	const openPull = branchPull?.branch === review?.branch && branchPull?.pullRequest?.state === "OPEN" ? branchPull.pullRequest : undefined;
	const canCreatePull = Boolean(review?.branch) && Boolean(review?.hasRemote || review?.upstream) && !openPull && branchPull?.branch === review?.branch && branchPull?.defaultBranch !== review?.branch;
	const pullPresentation = openPull ? pullRequestStatePresentation(openPull.state, openPull.draft) : undefined;
	const heading = (label: string, count: number, action: { label: string; icon: ReactNode; files: GitFile[]; type: "stage" | "unstage" }) => <div className="flex h-7 items-center justify-between px-1.5 text-xs font-semibold text-foreground/80">
		<span>{label} <span className="font-normal text-muted-foreground">{count}</span></span>
		<ToolbarButton size="sm" label={action.label} disabled={busy} onClick={() => void stageAll(action.files, action.type)}>{action.icon}</ToolbarButton>
	</div>;

	if (!repository) return <section className="git-actions flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70" aria-label="Git" aria-busy={busy}>
		This project is not a Git repository.
		<button type="button" disabled={busy} onClick={() => void initialise()} className="ml-auto h-7 shrink-0 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent/60 disabled:opacity-50">Initialise Git</button>
		{error && <p role="alert" className="w-full text-destructive">{error}</p>}
	</section>;
	// T3 offers Publish repository when nothing tells the branch where to go.
	const canPublish = Boolean(review) && !review?.hasRemote && !review?.upstream;
	const canCommitPush = Boolean(review?.branch) && Boolean(review?.hasRemote || review?.upstream);
	const commitCount = staged.length || changed.length;
	const commitLabel = staged.length ? `Commit ${staged.length} ${staged.length === 1 ? "file" : "files"}` : `Commit all ${commitCount} ${commitCount === 1 ? "file" : "files"}`;
	const folder = (project?.worktree ? overview.projects.find(value => value.id === project.worktree?.sourceProjectId) ?? project : project)?.directory.split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
	return <section className="git-actions flex min-w-0 flex-col gap-1 text-xs" aria-label="Git" aria-busy={busy}>
		<div className="flex items-center gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger disabled={busy || !review} render={<button type="button" className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 font-mono text-xs hover:bg-accent/60 [&_svg]:size-3.5" />}>
					<GitBranch className="text-muted-foreground" /><span className="truncate">{review?.branch || "Detached HEAD"}</span><ChevronDown className="text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="max-h-80 w-64">
					<DropdownMenuItem onClick={() => { setBranchKind("branch"); setNewBranch(""); }}><Plus />New branch…</DropdownMenuItem>
					<DropdownMenuItem onClick={() => { setBranchKind("worktree"); setNewBranch(""); }}><FolderPlus />New worktree…</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setCheckoutOpen(true)}><GitPullRequestArrow />Check out a pull request…</DropdownMenuItem>
					{project?.worktree && <DropdownMenuItem variant="destructive" onClick={removeWorktree}><Trash2 />Remove this worktree</DropdownMenuItem>}
					<DropdownMenuSeparator />
					{[...new Set([review?.branch ?? "", ...branches])].filter(Boolean).map(name => <DropdownMenuItem key={name} onClick={() => { if (name !== review?.branch) void git({ type: "switch-branch", name }); }} className="font-mono text-xs">
						<Check className={cn(name !== review?.branch && "invisible")} />{name}
					</DropdownMenuItem>)}
				</DropdownMenuContent>
			</DropdownMenu>
			{review?.upstream && review.upstream.behind > 0 && <Tip label={review.upstream.ahead > 0 ? `${review.upstream.name} and this branch have diverged; rebase or merge in a terminal` : `Fast-forward from ${review.upstream.name}, which has ${review.upstream.behind} newer ${review.upstream.behind === 1 ? "commit" : "commits"}`}>
				<button type="button" disabled={busy || review.upstream.ahead > 0} onClick={() => void git({ type: "pull" })} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-foreground hover:bg-accent/60 disabled:opacity-50 [&_svg]:size-3.5"><ArrowDown />Pull {review.upstream.behind}</button>
			</Tip>}
			{canPublish && !publishing && <button type="button" disabled={busy} onClick={() => setPublishing(true)} className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent/60 disabled:opacity-50 [&_svg]:size-3.5"><CloudUpload />Publish repository</button>}
			{canCreatePull && <Tip label={canPush ? "Push this branch and open a pull request for it" : "Open a pull request for this branch"}><button type="button" disabled={busy} onClick={() => void createPullRequest(canPush)} className={cn("flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent/60 disabled:opacity-50 [&_svg]:size-3.5", !canPush && "ml-auto")}><GitPullRequestArrow />{canPush ? "Push & create PR" : "Create PR"}</button></Tip>}
			{canPush && !canCreatePull && <button type="button" disabled={busy} onClick={() => void git({ type: "push" })} className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent/60 disabled:opacity-50 [&_svg]:size-3.5"><ArrowUp />{pushLabel}</button>}
		</div>
		{openPull && pullPresentation && <button type="button" onClick={() => openPullRequest({ number: openPull.number })} aria-label={`Open pull request #${openPull.number}`} className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs hover:bg-accent/60">
			<pullPresentation.Icon aria-hidden className={cn("size-3.5 shrink-0", pullPresentation.toneClassName)} /><span className="shrink-0 font-mono text-muted-foreground">#{openPull.number}</span><span className="min-w-0 truncate">{openPull.title}</span>
		</button>}
		{newBranch !== undefined && <form className="flex items-center gap-1.5" onSubmit={event => { event.preventDefault(); if (!newBranch.trim()) return; if (branchKind === "branch") void git({ type: "create-branch", name: newBranch.trim() }); else void createWorktree(newBranch.trim()); }}>
			<input autoFocus aria-label="New branch name" placeholder={branchKind === "branch" ? "Branch name" : "Worktree branch name"} value={newBranch} onChange={event => setNewBranch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setNewBranch(undefined); }}
				className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus:border-ring" />
			<button type="submit" disabled={busy || !newBranch.trim()} className="h-7 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Create</button>
		</form>}
		{publishing && <PublishRepositoryForm projectId={projectId} folder={folder} onCancel={() => setPublishing(false)} onDone={value => { setReview(value); setPublishing(false); setRefresh(current => current + 1); announceProjectChange(projectId); }} />}
		{error && <p role="alert" className="px-1.5 text-xs text-destructive">{error}</p>}
		<CheckoutPullRequestDialog projectId={projectId} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
		{review && !review.files.length && <p className="px-1.5 py-1 text-xs text-muted-foreground/70">No changes. The working tree is clean.</p>}
		{staged.length > 0 && <div>
			{heading("Staged", staged.length, { label: "Unstage all", icon: <Minus />, files: staged, type: "unstage" })}
			{staged.map(file => <FileRow key={`staged:${file.path}`} file={{ ...file, worktreeStatus: " " }} busy={busy} onOpen={() => openProjectFile({ projectId, path: file.path })} onCommand={command => void git(command)} />)}
		</div>}
		{changed.length > 0 && <div>
			{heading("Changes", changed.length, { label: "Stage all", icon: <Plus />, files: changed, type: "stage" })}
			{changed.map(file => <FileRow key={`changed:${file.path}`} file={{ ...file, indexStatus: file.indexStatus === "?" ? "?" : " " }} busy={busy} onOpen={() => openProjectFile({ projectId, path: file.path })} onCommand={command => void git(command)} />)}
		</div>}
		{review && review.files.length > 0 && <form className="pt-1" onSubmit={event => { event.preventDefault(); void commit(false); }}>
			<div className="relative">
				<textarea aria-label="Commit message" rows={2} placeholder={generating ? "Writing a commit message…" : "Commit message, or leave empty to generate one"} value={message} onChange={event => setMessage(event.target.value)} readOnly={generating}
					onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
					className="block w-full resize-none rounded-md border border-input bg-transparent py-1.5 pr-8 pl-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring" />
				<span className="absolute top-1 right-1"><ToolbarButton size="sm" label="Generate a commit message" disabled={busy || generating} onClick={() => void run(async () => setMessage(await generateMessage()))}>{generating ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}</ToolbarButton></span>
			</div>
			<div className="mt-1.5 flex gap-1.5">
				<button type="submit" disabled={busy || generating} className="h-7 min-w-0 flex-1 truncate rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50">{commitLabel}</button>
				{canCommitPush && <button type="button" disabled={busy || generating} onClick={() => void commit(true)} className="h-7 shrink-0 rounded-md px-2.5 text-xs font-semibold text-foreground hover:bg-accent/60 disabled:opacity-50">Commit & push</button>}
			</div>
		</form>}
	</section>;
}
