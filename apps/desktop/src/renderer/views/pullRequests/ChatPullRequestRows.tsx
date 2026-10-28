import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, Eye, EyeOff, FileDiff, GitBranch, Minus, Plus, TriangleAlert } from "lucide-react";
import type { PullRequestMergeMethod, PullRequestView, TaskPullRequestLink } from "../../../shared/pullRequestView";
import { currentPullRequest, pullRequestChains, pullRequestListLines, visiblePullRequestLinks } from "../../../shared/pullRequestStacks";
import { useWorkspace } from "../../app/workspace";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { toastManager } from "../../components/ui/toast";
import { Tip, Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { handNewChatDraft } from "../../lib/newChatDraft";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { chatRowAction, checksState, describeChecks, resolveConflictsPrompt } from "./chatRowLogic";
import { openPullRequestLink } from "./openPullRequestLink";
import { CheckStatusIcon, DiffStat, errorMessage, PullRequestGlyph, pullRequestStatePresentation } from "./presentation";
import { checksRollup, mergeMethodLabels } from "./pullRequestLogic";
import { RowChecksPopover } from "./RowChecksPopover";
import { useBranchPullRequest } from "./useBranchPullRequest";
import { usePullRequestHandoff } from "./usePullRequestHandoff";
import { useProjectRepository } from "./useProjectRepository";

type RowTarget = { repository: string; number: number; url: string; title?: string; state?: "open" | "closed" | "merged"; draft?: boolean; link?: TaskPullRequestLink };
const ROW_CLASS = "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** One pull request read in full while the row is shown, so the row can rank its next step. */
function useRowView(projectId: string, number: number, enabled: boolean) {
	const [view, setView] = useState<PullRequestView>();
	const [generation, setGeneration] = useState(0);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !enabled) return;
		let active = true;
		void api.pullRequestView(projectId, number).then(value => { if (active) setView(value); }, () => undefined);
		return () => { active = false; };
	}, [projectId, number, enabled, generation]);
	return { view, refresh: useCallback(() => setGeneration(value => value + 1), []) };
}

/** Everything GitHub reported, at a glance (T3's row tooltip): title over state, branches, checks, conflicts and size. */
function RowTooltip({ view }: { view: PullRequestView }) {
	const state = pullRequestStatePresentation(view.state, view.draft), checks = checksState(view.checkRuns);
	const line = (icon: ReactNode, text: ReactNode, className?: string) => <div className={cn("flex min-w-0 items-center gap-2", className)}>{icon}<div className="min-w-0 truncate">{text}</div></div>;
	return <div className="flex max-w-80 min-w-0 flex-col gap-2 py-1 text-left">
		<div className="flex min-w-0 items-baseline gap-1.5 leading-none"><span className="min-w-0 truncate font-medium">{view.title}</span><span className="shrink-0 opacity-70">#{view.number}</span></div>
		<div className="grid gap-1.5 pl-0.5 opacity-90">
			{line(<state.Icon aria-hidden className="size-3 shrink-0" />, state.label)}
			{line(<GitBranch aria-hidden className="size-3 shrink-0" />, `${view.base} ← ${view.head}`)}
			{view.state === "OPEN" && checks !== "none" && line(<CheckStatusIcon status={checks === "failing" ? "failure" : checks === "pending" ? "pending" : "success"} />, describeChecks(view.checkRuns))}
			{view.state === "OPEN" && view.mergeable === "CONFLICTING" && line(<TriangleAlert aria-hidden className="size-3 shrink-0" />, `Merge conflicts with ${view.base}`)}
			{line(<FileDiff aria-hidden className="size-3 shrink-0" />, <span className="inline-flex items-baseline gap-1">{view.changedFiles.toLocaleString()} {view.changedFiles === 1 ? "file" : "files"}<DiffStat additions={view.additions} deletions={view.deletions} /></span>)}
		</div>
	</div>;
}

function ChatPullRequestRow({ projectId, target, openable, onStopWatching }: { projectId: string; target: RowTarget; openable: boolean; onStopWatching?: () => void }) {
	const api = window.phaseoDesktop?.workspace;
	const { setNewChatProjectId, setMode, select, setOverview } = useWorkspace();
	const { view, refresh } = useRowView(projectId, target.number, openable);
	const handoff = usePullRequestHandoff(projectId);
	const [storedMethod] = usePersistedState<PullRequestMergeMethod>("phaseo.desktop.pullRequestMergeMethod", "squash");
	const [confirmingMerge, setConfirmingMerge] = useState(false), [pending, setPending] = useState<"ready" | "merge" | "resolve">();
	const action = chatRowAction(view);
	const method = view ? view.mergeMethods.includes(storedMethod) ? storedMethod : view.mergeMethods[0] ?? "merge" : "merge";
	const presentation = view ? pullRequestStatePresentation(view.state, view.draft) : target.state ? pullRequestStatePresentation(target.state, target.draft ?? false) : undefined;
	const icon = presentation ? <presentation.Icon aria-hidden className={cn("size-4 shrink-0", presentation.toneClassName)} /> : <PullRequestGlyph.pullRequest aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
	const title = view?.title ?? target.title;
	const open = (event: MouseEvent<HTMLElement>) => { if (event.type === "auxclick" && event.button !== 1) return; openPullRequestLink(event, target.url, openable ? target.number : undefined); };
	const perform = async (type: "ready" | "merge") => {
		if (!api || !view) return;
		setPending(type);
		try { await api.pullRequestAction(projectId, { number: view.number, headOid: view.headOid, action: type === "merge" ? { type: "merge", method } : { type: "ready" } }); refresh(); }
		catch (reason) { toastManager.add({ type: "error", title: type === "merge" ? "Could not merge" : "Could not mark ready for review", description: errorMessage(reason) }); }
		finally { setPending(undefined); }
	};
	const resolve = async () => {
		if (!api || !view) return;
		setPending("resolve");
		try { const result = await api.pullRequestWorktree(projectId, view.number); setOverview(result.workspace); setNewChatProjectId(result.projectId); setMode("code"); select(undefined); handNewChatDraft(resolveConflictsPrompt(view)); }
		catch (reason) { toastManager.add({ type: "error", title: "Could not check out the pull request", description: errorMessage(reason) }); }
		finally { setPending(undefined); }
	};
	const trailing = action === "resolve" ? { label: "Resolve", pendingLabel: "Preparing…", busy: pending === "resolve", destructive: true, external: true, tooltip: "Check the branch out and resolve the conflicts in a new chat", onClick: () => void resolve() }
		: action === "ready" ? { label: "Ready", pendingLabel: "Marking…", busy: pending === "ready", destructive: false, external: false, tooltip: "Mark this pull request as ready for review", onClick: () => void perform("ready") }
		: action === "fix" ? { label: "Fix", pendingLabel: "Preparing…", busy: handoff.pending === "fix", destructive: true, external: true, tooltip: "Fix the failing checks in a new chat", onClick: () => { if (view) void handoff.run("fix", view); } }
		: action === "merge" ? { label: "Merge", pendingLabel: "Merging…", busy: pending === "merge", destructive: false, external: false, tooltip: `Merge this pull request (${mergeMethodLabels[method].toLowerCase()})`, onClick: () => setConfirmingMerge(true) }
		: null;
	const watching = Boolean(onStopWatching) && (view?.state ?? target.state?.toUpperCase() ?? "OPEN") === "OPEN";
	const rollup = view ? checksRollup(view.checkRuns) : null;
	const showChecks = Boolean(view && rollup && view.mergeable !== "CONFLICTING" && !view.draft);
	const watchControl = watching && <Tip label="Watching: the agent wakes when checks finish, someone comments, or the branch conflicts. Click to stop."><Button size="icon-xs" variant="ghost" aria-label={`Stop watching #${target.number}`} className="group/watch size-6 text-muted-foreground" onClick={onStopWatching}><Eye aria-hidden className="size-3.5 group-hover/watch:hidden" /><EyeOff aria-hidden className="hidden size-3.5 group-hover/watch:block" /></Button></Tip>;
	const openRow = (text: string) => {
		const button = <button type="button" aria-label={target.url} onClick={open} onAuxClick={open} className={ROW_CLASS}>{icon}<span className="min-w-0 flex-1 truncate">{text}</span></button>;
		return view ? <Tooltip><TooltipTrigger delay={300} render={button} /><TooltipContent side="top" align="start" className="max-w-80">{<RowTooltip view={view} />}</TooltipContent></Tooltip> : <Tip label={`Pull request #${target.number}`}>{button}</Tip>;
	};
	return <div data-chat-pull-request={target.number}>
		{view && (showChecks || trailing || watching) ? <div className="pb-1.5">
			{openRow(view.title)}
			<div className="-mt-0.5 flex h-6 min-w-0 items-center gap-0.5 ps-8 pe-1 text-xs text-muted-foreground">
				<span className="me-1 shrink-0 tabular-nums">#{target.number}</span>
				{showChecks && rollup && <RowChecksPopover rollup={rollup} projectId={projectId} number={target.number} checks={view.checkRuns} variant="count" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" />}
				{watchControl}
				<span className="flex-1" />
				{trailing && <Tip label={trailing.tooltip}><Button size="xs" variant="ghost" disabled={pending !== undefined || handoff.pending !== undefined} onClick={trailing.onClick} className={cn("h-6 px-1.5", trailing.destructive ? "text-destructive hover:text-destructive" : "text-primary")}>{trailing.busy ? trailing.pendingLabel : trailing.label}{trailing.external && <ArrowUpRight aria-hidden className="size-3 shrink-0" />}</Button></Tip>}
			</div>
		</div> : <div className="flex min-w-0 items-center">{openRow(`#${target.number}${title ? `: ${title}` : ""}`)}{watchControl}</div>}
		{action === "merge" && <Dialog open={confirmingMerge} onOpenChange={setConfirmingMerge}>
			<DialogContent className="max-w-md gap-4 p-5">
				<DialogHeader><DialogTitle>Merge pull request?</DialogTitle><DialogDescription className="text-xs">This merges #{target.number} using {mergeMethodLabels[method].toLowerCase()}.</DialogDescription></DialogHeader>
				<DialogFooter><Button size="sm" variant="outline" onClick={() => setConfirmingMerge(false)}>Cancel</Button><Button size="sm" disabled={pending !== undefined} onClick={() => { setConfirmingMerge(false); void perform("merge"); }}>Merge</Button></DialogFooter>
			</DialogContent>
		</Dialog>}
	</div>;
}

/**
 * A chat's pull requests in its details card (T3's ThreadDetailsPrRows): the current one, then "Show N more" for the
 * rest in the linked list's order. Without links, the pull request for the checkout's branch stands in.
 */
export function ChatPullRequestRows({ projectId, taskId }: { projectId: string; taskId: string }) {
	const { overview, setOverview } = useWorkspace();
	const [expanded, setExpanded] = useState(false);
	const task = overview.tasks.find(value => value.id === taskId);
	const links = useMemo(() => visiblePullRequestLinks(task?.pullRequests), [task?.pullRequests]);
	const repository = useProjectRepository(projectId);
	const branch = useBranchPullRequest(links.length ? undefined : projectId);
	const same = (value: { repository: string }) => Boolean(repository) && value.repository.toLowerCase() === repository!.toLowerCase();
	const current = currentPullRequest(links);
	const rest = current ? pullRequestListLines(pullRequestChains(links)).map(line => line.link).filter(link => link !== current) : [];
	const stopWatching = (link: TaskPullRequestLink) => link.watching ? () => { const api = window.phaseoDesktop?.workspace; void api?.command({ type: "watch-pull-request", id: taskId, repository: link.repository, number: link.number, watching: false }).then(setOverview, reason => toastManager.add({ type: "error", title: "Could not stop watching", description: errorMessage(reason) })); } : undefined;
	const target = (link: TaskPullRequestLink): RowTarget => ({ repository: link.repository, number: link.number, url: link.url, title: link.snapshot?.title, state: link.snapshot?.state, draft: link.snapshot?.draft, link });
	const branchPull = branch?.pullRequest;
	if (!current && !branchPull) return null;
	return <div className="flex flex-col" aria-label="Chat pull requests">
		{current ? <ChatPullRequestRow key={`${current.repository}#${current.number}`} projectId={projectId} target={target(current)} openable={same(current)} onStopWatching={stopWatching(current)} />
			: branchPull && <ChatPullRequestRow key={`branch:${branchPull.number}`} projectId={projectId} target={{ repository: branchPull.repository, number: branchPull.number, url: branchPull.url, title: branchPull.title, state: branchPull.state === "MERGED" ? "merged" : branchPull.state === "CLOSED" ? "closed" : "open", draft: branchPull.draft }} openable={same(branchPull)} />}
		{expanded && rest.map(link => <ChatPullRequestRow key={`${link.repository}#${link.number}`} projectId={projectId} target={target(link)} openable={same(link)} onStopWatching={stopWatching(link)} />)}
		{rest.length > 0 && <button type="button" onClick={() => setExpanded(!expanded)} className={cn(ROW_CLASS, "text-muted-foreground")}>{expanded ? <Minus aria-hidden className="size-4 shrink-0" /> : <Plus aria-hidden className="size-4 shrink-0" />}{expanded ? "Show less" : `Show ${rest.length} more`}</button>}
	</div>;
}
