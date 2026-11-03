import { formatRelativeTime } from "@phaseo/app-kit/format";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronDown, CircleDot, Copy, ExternalLink, FileDiff, FolderGit2, GitBranch, GitCommitHorizontal, Hammer, Link as LinkIcon, MessageCircleQuestion, MessageSquare, MoreHorizontal, Pencil, PlayCircle, RefreshCw, Sparkles, Trash2, TriangleAlert, Undo2, Unlink, X } from "lucide-react";
import { samePullRequest, type PullRequestMergeMethod, type PullRequestReactionContent, type PullRequestUpdateMethod, type PullRequestView } from "../../../shared/pullRequestView";
import { useWorkspace } from "../../app/workspace";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { shortcut, useCommand } from "../../lib/keybindings";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { TooltipProvider } from "../../components/ui/tooltip";
import { showToast } from "../../components/ui/toast";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { ChecksPopover } from "./ChecksPopover";
import { CodeTab } from "./CodeTab";
import { GuideTab } from "./GuideTab";
import { Composer } from "./Composer";
import { ActorLabel, DiffStat, errorMessage, MetaLine, MiddleTruncate, PullRequestGlyph, pullRequestStatePresentation, ReviewOutcomeIcon, REVIEW_OUTCOME_PRESENTATION, Tip } from "./presentation";
import { approvalCount, baseFreshness, behindSummary, checksRollup, checksStale, isWorkflowApproval, mergeMethodLabels, primaryAction, summarizeChecks } from "./pullRequestLogic";
import { PullRequestDetailGhost, UnavailableState } from "./PullRequestGhosts";
import { segmentedGroup, segmentedItem } from "./segmented";
import { StackedBaseGlyph, StackMenu } from "./StackMenu";
import { useRequestedPullRequestTab } from "./tabRequest";
import { ReactContext, SummaryTab } from "./SummaryTab";
import { TimelineTab } from "./TimelineTab";
import { useInlineActionConfirm } from "./useInlineActionConfirm";
import { usePullRequest } from "./usePullRequest";
import { usePullRequestHandoff } from "./usePullRequestHandoff";
import { PullRequestNumberMenu } from "./PullRequestNumberMenu";
import { lastMergeMethodKey, resolvePullRequestMergeMethod, useDefaultMergeMethod } from "./mergeMethod";

type Tab = "summary" | "guide" | "timeline" | "code";
const tabs: { value: Tab; label: string }[] = [{ value: "summary", label: "Summary" }, { value: "guide", label: "Guide" }, { value: "timeline", label: "Timeline" }, { value: "code", label: "Code" }];

/** Copies, then says so in a toast; a refused clipboard says that instead. */
export function copyWithToast(text: string, what: string) {
	void navigator.clipboard.writeText(text).then(() => showToast("success", `${what} copied`), () => showToast("error", `Could not copy the ${what.toLowerCase()}`));
}
/** Copyable code: no icon, the text fades to "Copied" in place on a hover pill. */
export function CopyableCode({ value, label, className }: { value: string; label: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	const copy = () => void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(false), 1600); }, () => showToast("error", `Could not copy the ${label.replace(/^Copy /, "")}`));
	return <Tip label={`${copied ? "Copied" : label}: ${value}`}><button type="button" onClick={copy} aria-label={copied ? "Copied" : label} className={cn("relative grid w-fit max-w-full min-w-0 shrink cursor-pointer rounded px-1 py-0.5 text-left font-mono text-xs text-muted-foreground outline-none transition-colors hover:bg-accent/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", className)}>
		<code className={cn("col-start-1 row-start-1 min-w-0 truncate transition-opacity duration-150 motion-reduce:transition-none", copied ? "opacity-0" : "opacity-100")}>{value}</code>
		<span aria-hidden className={cn("col-start-1 row-start-1 truncate text-center font-sans transition-opacity duration-150 motion-reduce:transition-none", copied ? "opacity-100" : "opacity-0")}>Copied</span>
	</button></Tip>;
}

/**
 * One pull request, as a detail panel: a header that condenses to `#N title` on
 * scroll, one primary control chosen by state with click-twice confirmation, a More menu, and the
 * Summary, Timeline and Code tabs. Meant to fill its own pane tab titled `#N`.
 */
export function PullRequestSurface({ projectId, number, onBack }: { projectId: string; number: number; onBack?: () => void }) {
	const api = window.phaseoDesktop?.workspace;
	const pull = usePullRequest(projectId, number), { view, perform } = pull;
	const [tab, setTab] = useState<Tab>("summary");
	const [mounted, setMounted] = useState<Set<Tab>>(() => new Set(["summary"]));
	const [condensed, setCondensed] = useState(false);
	const [order, setOrder] = useState<"newest" | "oldest">("newest");
	const [titleDraft, setTitleDraft] = useState<string | null>(null);
	const [storedMethod, setStoredMethod] = usePersistedState<PullRequestMergeMethod>(lastMergeMethodKey, "squash");
	// The method picked in this pull request's menu wins; until then, the project's or workspace default, then the last one picked.
	const [chosenMethod, setChosenMethod] = useState<PullRequestMergeMethod | null>(null);
	const defaultMergeMethod = useDefaultMergeMethod();
	const confirm = useInlineActionConfirm(`${projectId}#${number}`);
	const handoff = usePullRequestHandoff(projectId);
	const [reviewRequest, setReviewRequest] = useState(0), [guideRequest, setGuideRequest] = useState(0), [guideWritten, setGuideWritten] = useState(false);
	const guideAsked = useRef<string>(undefined);
	// The More menu names "Write" or "Rewrite"; before the Guide tab has been opened, the stored guide is read when it opens.
	const readGuideState = () => {
		if (!api || !view || mounted.has("guide") || guideAsked.current === view.headOid) return;
		guideAsked.current = view.headOid;
		void api.pullRequestGuide(projectId, view.number).then(result => setGuideWritten(Boolean(result.guide)), () => { guideAsked.current = undefined; });
	};
	const [commit, setCommit] = useState<string | null>(null), [reveal, setReveal] = useState<{ path: string; nonce: number }>();
	const { overview, selectedId, setOverview } = useWorkspace();
	const chat = selectedId ? overview.tasks.find(task => task.id === selectedId) : undefined;
	const seedLinks = (chat?.pullRequests ?? []).filter(link => link.number === number), seed = seedLinks.length === 1 ? seedLinks[0] : undefined;
	useEffect(() => { setTab("summary"); setMounted(new Set(["summary"])); setCondensed(false); setTitleDraft(null); setCommit(null); setReveal(undefined); setChosenMethod(null); }, [projectId, number]);
	const open = (url: string) => { void api?.openLink(url).catch(reason => showToast("error", "Could not open the link", errorMessage(reason))); };
	const root = useRef<HTMLDivElement>(null);
	// Shortcuts act on the pull request on screen: a hidden pane tab, or a second surface while focus is in another, lets the key through.
	const onScreen = () => { const element = root.current; if (!element?.isConnected || !element.checkVisibility({ checkVisibilityCSS: true })) return false; const focused = document.activeElement?.closest("[data-pull-request-surface]"); return !focused || focused === element; };
	const url = view?.url ?? "";
	useCommand("pullRequest.copyNumber", () => { if (!onScreen()) return false; copyWithToast(`#${number}`, "Pull request number"); });
	useCommand("pullRequest.copyLink", () => { if (!onScreen() || !url) return false; copyWithToast(url, "Link"); });
	useCommand("pullRequest.back", () => { if (!onBack || !onScreen() || document.querySelector("[role=dialog], [role=menu], [role=listbox]")) return false; onBack(); }, Boolean(onBack));
	const react = useCallback((subjectId: string, content: PullRequestReactionContent, reacted: boolean) => perform({ type: "react", subjectId, content, reacted }), [perform]);
	const selectTab = (next: Tab) => { setTab(next); setMounted(current => new Set([...current, next])); setCondensed(false); };
	const openCode = (path?: string, oid?: string | null) => { if (oid !== undefined) setCommit(oid); if (path) setReveal({ path, nonce: Date.now() }); selectTab("code"); };
	const linkCommand = async (linked: boolean, target: PullRequestView) => {
		if (!api || !chat) return;
		try { setOverview(await api.command(linked ? { type: "unlink-pull-request", id: chat.id, repository: target.repository, number: target.number } : { type: "link-pull-request", id: chat.id, reference: target.url })); showToast("success", linked ? `Unlinked #${target.number} from this chat` : `Linked #${target.number} to this chat`); }
		catch (reason) { showToast("error", linked ? "Could not unlink this pull request" : "Could not link this pull request", errorMessage(reason)); }
	};
	useRequestedPullRequestTab(projectId, number, selectTab);

	if (!view) return <div ref={root} data-pull-request-surface="" className="flex h-full min-h-0 flex-col bg-background" aria-label={`Pull request #${number}`} aria-busy={pull.refreshing}>
		{pull.error ? <>
			<div className="flex h-7 min-h-7 shrink-0 items-center gap-1 border-b border-border/60 px-4 text-sm text-muted-foreground sm:text-xs">{onBack && <BackButton onBack={onBack} />}{seed && <span className="min-w-0 truncate font-medium">{seed.repository}</span>}<span className="font-medium">#{number}</span></div>
			<UnavailableState number={number} error={pull.error} refreshing={pull.refreshing} onRetry={() => void pull.refresh()} {...(seed ? { onOpen: () => open(seed.url) } : {})} />
		</> : <PullRequestDetailGhost number={number} {...(seed ? { repository: seed.repository, onOpen: () => open(seed.url) } : {})} {...(seed?.snapshot ? { seed: seed.snapshot } : {})} {...(onBack ? { onBack: <BackButton onBack={onBack} /> } : {})} />}
	</div>;

	const presentation = pullRequestStatePresentation(view.state, view.draft);
	const primary = primaryAction(view), conflicting = view.state === "OPEN" && view.mergeable === "CONFLICTING";
	const method = view.autoMerge?.method ?? resolvePullRequestMergeMethod(view.mergeMethods, chosenMethod, defaultMergeMethod(projectId), storedMethod);
	const autoMergeArmed = view.state === "OPEN" && Boolean(view.autoMerge);
	const armedLabel = view.autoMerge ? `Auto-merge (${mergeMethodLabels[view.autoMerge.method].toLowerCase()})` : "Auto-merge", pendingAutoMergeLabel = `Auto-merge (${mergeMethodLabels[method].toLowerCase()})`;
	const armedBadge = <Tip label={`${armedLabel}: GitHub will merge this on its own once its requirements are met${view.autoMerge?.enabledBy ? ` (turned on by ${view.autoMerge.enabledBy})` : ""}`}><Badge variant="outline" role="img" aria-label={armedLabel} data-auto-merge="" className="h-6 px-2 text-sky-700 dark:text-sky-300"><PullRequestGlyph.merged aria-hidden className="size-3.5" /><span className="@max-[30rem]/pr-header:hidden">{armedLabel}</span></Badge></Tip>;
	const pending = pull.pending, busy = pending !== undefined;
	const rollup = checksRollup(view.checkRuns), approvals = approvalCount(view);
	const repositoryUrl = view.codeHost?.repositoryUrl ?? `https://github.com/${view.repository}`, hostName = view.codeHost?.name ?? "GitHub";
	// Azure DevOps reports no totals at all; GitLab reports files but not lines.
	const filesKnown = !view.statsUnknown || view.changedFiles > 0;
	const freshness = baseFreshness(view), staleChecks = checksStale(view);
	const workflowApprovals = view.checkRuns.filter(isWorkflowApproval).length, canApproveWorkflows = view.state === "OPEN" && workflowApprovals > 0 && view.viewer.canMerge && !staleChecks;
	const linked = Boolean(chat?.pullRequests?.some(link => samePullRequest(link, view))), canRevert = view.state === "MERGED" && view.viewer.canMerge;
	const canMergeNow = view.state === "OPEN" && !view.draft && !conflicting && view.viewer.canMerge && view.mergeMethods.length > 0 && (primary === "enable-auto-merge" || primary === "auto-merge-armed");
	const canDisableAutoMerge = autoMergeArmed && view.viewer.canDisableAutoMerge;
	const canEnableAutoMerge = view.state === "OPEN" && !autoMergeArmed && primary !== "enable-auto-merge" && !view.draft && !conflicting && view.autoMergeAllowed && view.viewer.canEnableAutoMerge && view.mergeMethods.length > 0;
	const canDeleteBranch = view.state !== "OPEN" && view.headRefExists && view.viewer.canDeleteBranch && view.headRepository?.toLowerCase() === view.repository.toLowerCase();
	const saveTitle = async () => { if (titleDraft === null || !titleDraft.trim()) return; if (titleDraft.trim() === view.title || await pull.perform({ type: "title", title: titleDraft })) setTitleDraft(null); };
	const number$ = (tabIndex?: number) => <PullRequestNumberMenu url={view.url} onCopy={url => copyWithToast(url, "Link")} onNotice={(message, failed) => { if (failed) showToast("error", message); }} className="shrink-0"><Tip label={`Open on ${hostName}`}><button type="button" tabIndex={tabIndex} onClick={() => open(view.url)} onAuxClick={event => { if (event.button === 1) open(view.url); }} aria-label={`Open pull request #${view.number} on ${hostName}`} className={cn("inline-flex shrink-0 cursor-pointer items-center gap-0.5 font-medium underline-offset-2 hover:underline", presentation.toneClassName)}>#{view.number}<ExternalLink aria-hidden className="size-2.5" /></button></Tip></PullRequestNumberMenu>;
	const branchLine = (small: boolean) => <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 font-mono", small ? "text-2xs text-muted-foreground/65" : "text-xs text-muted-foreground/70")}>
		<StackedBaseGlyph projectId={projectId} view={view} />
		{freshness ? <BaseFreshnessWarning view={view} projectId={projectId} small={small} freshness={freshness} pending={busy} updating={pending === "update-branch"} onUpdate={method => void pull.perform({ type: "update-branch", ...(method === "rebase" ? { method } : {}) })} /> : <Tip label={view.base}><span className="inline-flex max-w-[40%] min-w-0 shrink-0 items-center gap-1"><code className="flex min-w-0"><MiddleTruncate value={view.base} /></code></span></Tip>}
		<ArrowLeft aria-label="receives changes from" className={cn("shrink-0 opacity-60", small ? "size-3" : "size-3.5")} />
		{small ? <Tip label={view.head}><code className="flex min-w-0 flex-1"><MiddleTruncate value={view.head} /></code></Tip> : <CopyableCode value={view.head} label="Copy pull request branch" className="min-w-0" />}
	</span>;

	let primaryControl: ReactNode = null;
	if (primary === "merged" || primary === "closed") primaryControl = <Badge variant="outline" className="h-6 px-2"><span className={cn("flex items-center gap-1", presentation.toneClassName)}><presentation.Icon className="size-3.5" />{presentation.label}</span></Badge>;
	else if (primary === "resolve") primaryControl = <Tip label="Resolve the conflicts in a chat on this branch"><Button size="xs" variant="destructive" disabled={handoff.pending !== undefined} onClick={() => void handoff.run("resolve-conflicts", view)} aria-label="Resolve conflicts"><TriangleAlert aria-hidden className="size-3.5" /><span className="@max-[30rem]/pr-header:hidden">{handoff.pending === "resolve-conflicts" ? "Preparing…" : "Resolve conflicts"}</span></Button></Tip>;
	else if (primary === "ready") primaryControl = <Tip label="Ready for review"><Button size="xs" disabled={busy} onClick={() => void pull.perform({ type: "ready" })} aria-label="Ready for review"><PullRequestGlyph.pullRequest aria-hidden className="size-3.5" /><span className="@max-[30rem]/pr-header:hidden">{pending === "ready" ? "Marking…" : "Ready for review"}</span></Button></Tip>;
	else if (primary === "auto-merge-armed") primaryControl = armedBadge;
	else if (primary === "enable-auto-merge") {
		const label = pending === "enable-auto-merge" ? "Turning on…" : confirm.isArmed("enable-auto-merge") ? "Confirm auto-merge?" : pendingAutoMergeLabel;
		primaryControl = <Tip label={label}><Button size="xs" disabled={busy} {...confirm.props("enable-auto-merge", () => void pull.perform({ type: "enable-auto-merge", method }))} aria-label={label} data-auto-merge-button="">
			{confirm.isArmed("enable-auto-merge") ? <Check aria-hidden className="size-3.5" /> : <PullRequestGlyph.merged aria-hidden className="size-3.5" />}
			<span className="grid @max-[30rem]/pr-header:hidden"><span aria-hidden className="invisible col-start-1 row-start-1">{pendingAutoMergeLabel}</span><span className="col-start-1 row-start-1">{label}</span></span>
		</Button></Tip>;
	}
	else if (primary === "merge") {
		const label = pending === "merge" ? "Merging…" : confirm.isArmed("merge") ? "Confirm merge?" : mergeMethodLabels[method];
		primaryControl = <Tip label={label}><Button size="xs" disabled={busy} {...confirm.props("merge", () => void pull.perform({ type: "merge", method }))} aria-label={label} data-merge-button="">
			{confirm.isArmed("merge") ? <Check aria-hidden className="size-3.5" /> : <PullRequestGlyph.merged aria-hidden className="size-3.5" />}
			<span className="grid @max-[30rem]/pr-header:hidden"><span aria-hidden className="invisible col-start-1 row-start-1">{mergeMethodLabels[method]}</span><span className="col-start-1 row-start-1">{label}</span></span>
		</Button></Tip>;
	}

	const menu = <DropdownMenu onOpenChange={next => { if (next) readGuideState(); }}>
		<Tip label={pull.refreshing ? "Refreshing pull request" : "More pull request actions"}><DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label={pull.refreshing ? "Refreshing pull request" : "More pull request actions"} />}>{pull.refreshing ? <RefreshCw className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-4" />}</DropdownMenuTrigger></Tip>
		<DropdownMenuContent align="end" className="w-56">
			<DropdownMenuItem disabled={pull.refreshing} onClick={() => void pull.refresh()}><RefreshCw className={cn("size-3.5", pull.refreshing && "animate-spin")} />Refresh</DropdownMenuItem>
			<DropdownMenuItem disabled={handoff.pending !== undefined} onClick={() => void handoff.run("ask", view)}><MessageCircleQuestion className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>Ask a question</span><span className="text-xs text-muted-foreground">Opens a chat that knows which pull request you mean.</span></span></DropdownMenuItem>
			<DropdownMenuItem disabled={handoff.pending !== undefined} onClick={() => void handoff.run("explain", view)}><BookOpen className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>Explain this PR</span><span className="text-xs text-muted-foreground">A walk through the diff and what to read closely.</span></span></DropdownMenuItem>
			<DropdownMenuItem disabled={handoff.pending !== undefined || view.state !== "OPEN"} onClick={() => void handoff.run("fix", view)}><Hammer className="size-3.5" />{handoff.pending === "fix" ? "Preparing…" : "Fix findings in a chat"}</DropdownMenuItem>
				<DropdownMenuItem onClick={() => { setGuideRequest(value => value + 1); selectTab("guide"); }}><Sparkles className="size-3.5" />{guideWritten ? "Rewrite guide" : "Write guide"}</DropdownMenuItem>
				{conflicting && !view.codeHost && <DropdownMenuItem onClick={() => open(`${view.url}/conflicts`)}><TriangleAlert className="size-3.5" />Resolve conflicts on GitHub</DropdownMenuItem>}
			{view.state === "OPEN" && view.viewer.canUpdate && primary !== "ready" && <DropdownMenuItem disabled={busy} onClick={() => void pull.perform({ type: view.draft ? "ready" : "draft" })}>{view.draft ? <PullRequestGlyph.pullRequest className="size-3.5" /> : <PullRequestGlyph.draft className="size-3.5" />}{view.draft ? "Ready for review" : "Convert to draft"}</DropdownMenuItem>}
			{canDisableAutoMerge && <DropdownMenuItem disabled={busy} onClick={() => void pull.perform({ type: "disable-auto-merge" })}><X className="size-3.5" />Disable auto-merge</DropdownMenuItem>}
			{canEnableAutoMerge && <DropdownMenuItem closeOnClick={confirm.isArmed("enable-auto-merge-menu")} disabled={busy} aria-label={confirm.isArmed("enable-auto-merge-menu") ? "Confirm auto-merge?" : "Enable auto-merge"} {...confirm.props("enable-auto-merge-menu", () => void pull.perform({ type: "enable-auto-merge", method }))}><PullRequestGlyph.merged className="size-3.5" />{confirm.isArmed("enable-auto-merge-menu") ? "Confirm auto-merge?" : "Enable auto-merge"}</DropdownMenuItem>}
			{canMergeNow && <DropdownMenuItem closeOnClick={confirm.isArmed("merge-now")} disabled={busy} aria-label={confirm.isArmed("merge-now") ? "Confirm merge?" : "Merge now"} {...confirm.props("merge-now", () => void pull.perform({ type: "merge", method }))}><PullRequestGlyph.merged className="size-3.5" />{confirm.isArmed("merge-now") ? "Confirm merge?" : "Merge now"}</DropdownMenuItem>}
			{view.state === "OPEN" && !conflicting && !autoMergeArmed && view.viewer.canMerge && view.mergeMethods.length > 0 && <><DropdownMenuSeparator /><DropdownMenuRadioGroup value={method} onValueChange={value => { setChosenMethod(value as PullRequestMergeMethod); setStoredMethod(value as PullRequestMergeMethod); }}>
				{view.mergeMethods.map(value => <DropdownMenuRadioItem key={value} value={value} disabled={busy} closeOnClick><PullRequestGlyph.merged className="size-3.5" />{mergeMethodLabels[value]}</DropdownMenuRadioItem>)}
			</DropdownMenuRadioGroup></>}
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={() => open(view.url)}><ArrowUpRight className="size-3.5" />Open on {hostName}</DropdownMenuItem>
			<DropdownMenuItem onClick={() => copyWithToast(view.url, "Link")}><LinkIcon className="size-3.5" />Copy link{shortcut("pullRequest.copyLink") && <DropdownMenuShortcut>{shortcut("pullRequest.copyLink")}</DropdownMenuShortcut>}</DropdownMenuItem>
			<DropdownMenuItem onClick={() => copyWithToast(`#${view.number}`, "Pull request number")}><Copy className="size-3.5" />Copy PR number{shortcut("pullRequest.copyNumber") && <DropdownMenuShortcut>{shortcut("pullRequest.copyNumber")}</DropdownMenuShortcut>}</DropdownMenuItem>
				{chat && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void linkCommand(linked, view)}>{linked ? <Unlink className="size-3.5" /> : <LinkIcon className="size-3.5" />}{linked ? "Unlink from this chat" : "Link to this chat"}</DropdownMenuItem></>}
			{view.state === "OPEN" && view.viewer.canUpdate && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" closeOnClick={confirm.isArmed("close")} disabled={busy} aria-label={confirm.isArmed("close") ? "Confirm close?" : "Close pull request"} {...confirm.props("close", () => void pull.perform({ type: "close" }))}><PullRequestGlyph.closed className="size-3.5" />{confirm.isArmed("close") ? "Confirm close?" : "Close pull request"}</DropdownMenuItem></>}
			{view.state === "CLOSED" && view.viewer.canUpdate && <><DropdownMenuSeparator /><DropdownMenuItem disabled={busy} onClick={() => void pull.perform({ type: "reopen" })}><PullRequestGlyph.reopen className="size-3.5" />Reopen pull request</DropdownMenuItem></>}
			{canRevert && <><DropdownMenuSeparator /><DropdownMenuItem closeOnClick={confirm.isArmed("revert")} disabled={busy} aria-label={confirm.isArmed("revert") ? "Confirm revert?" : "Revert changes"} {...confirm.props("revert", () => void pull.perform({ type: "revert" }))}>
				<Undo2 className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>{pending === "revert" ? "Opening a revert…" : confirm.isArmed("revert") ? "Confirm revert?" : "Revert changes"}</span><span className="text-xs text-muted-foreground">Opens a pull request that undoes this one.</span></span>
			</DropdownMenuItem></>}
			{canDeleteBranch && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" closeOnClick={confirm.isArmed("delete-branch")} disabled={busy} aria-label={confirm.isArmed("delete-branch") ? "Confirm delete?" : "Delete branch"} {...confirm.props("delete-branch", () => void pull.perform({ type: "delete-branch" }))}>
				<Trash2 className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>{pending === "delete-branch" ? "Deleting branch…" : confirm.isArmed("delete-branch") ? "Confirm delete?" : "Delete branch"}</span><span className="truncate text-xs text-muted-foreground">{view.head}</span></span>
			</DropdownMenuItem></>}
		</DropdownMenuContent>
	</DropdownMenu>;

	return <TooltipProvider delay={150}><ReactContext.Provider value={react}><div ref={root} data-pull-request-surface="" className="relative flex h-full min-h-0 w-full flex-col bg-background" aria-label={`Pull request #${view.number}`} data-pull-request={view.number}>
		<div className="@container/pr-header grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border/60">
			<div className="grid h-7 min-w-0 items-center overflow-hidden pl-4">
				<div aria-hidden={condensed} inert={condensed} className={cn("col-start-1 row-start-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground sm:text-xs transition-[opacity,transform] ease-out motion-reduce:transition-none", condensed ? "pointer-events-none -translate-y-1 opacity-0 duration-100" : "translate-y-0 opacity-100 delay-50 duration-150")}>
					{onBack && <BackButton onBack={onBack} />}
					<Tip label={`Open ${view.repository} on ${hostName}`}><button type="button" onClick={() => open(repositoryUrl)} className="min-w-0 cursor-pointer truncate text-left font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{view.repository}</button></Tip>
					{number$()}
				</div>
				<div aria-hidden={!condensed} inert={!condensed} className={cn("col-start-1 row-start-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground sm:text-xs transition-[opacity,transform] ease-out motion-reduce:transition-none", condensed ? "translate-y-0 opacity-100 delay-50 duration-150" : "pointer-events-none translate-y-1 opacity-0 duration-100")}>
					{onBack && <BackButton onBack={onBack} />}{number$(condensed ? 0 : -1)}
					<Tip label={view.title}><span className="min-w-0 truncate font-medium text-foreground">{view.title}</span></Tip>
				</div>
			</div>
			{/* Header actions, left to right: the auto-merge badge, other per-pull-request controls, the primary control, More. */}
			<div className="mr-4 flex h-7 shrink-0 items-center justify-end gap-1" data-pull-request-header-actions="">
				<StackMenu projectId={projectId} view={view} onActed={() => void pull.refresh()} />
				{autoMergeArmed && primary !== "auto-merge-armed" && armedBadge}
				{primaryControl}
				{menu}
			</div>
			<div className={cn("col-span-2 grid", condensed ? "grid-rows-[1fr]" : "grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none")}>
				<div className={cn("min-h-0 overflow-hidden transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none", condensed ? "translate-y-0 opacity-100 delay-50" : "translate-y-1 opacity-0 duration-100")} inert={!condensed}>
					<div className="flex min-w-0 items-center gap-2 px-4 pt-1 pb-2 text-xs text-muted-foreground">
						<span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden"><ActorLabel actor={view.authorActor} variant="avatar" className="shrink-0" /><span className="shrink-0">{formatRelativeTime(view.updatedAt)}</span></span>
						<span aria-hidden className="h-3 w-px shrink-0 bg-border/70" />
						{branchLine(true)}
						<span className="ml-auto inline-flex shrink-0 items-center justify-end gap-2 text-2xs">{filesKnown && <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${view.changedFiles} changed ${view.changedFiles === 1 ? "file" : "files"}`}><FileDiff aria-hidden className="size-3" />{view.changedFiles}</span>}{!view.statsUnknown && <DiffStat additions={view.additions} deletions={view.deletions} className="shrink-0 font-mono text-2xs" />}</span>
					</div>
				</div>
			</div>
			<div className={cn("col-span-2 grid", condensed ? "grid-rows-[0fr]" : "grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none")}>
				<div className={cn("min-h-0 overflow-hidden transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none", condensed ? "-translate-y-1 opacity-0 duration-100" : "translate-y-0 opacity-100 delay-50")} inert={condensed}>
					<div className="col-span-2 mt-1 min-w-0 px-4 pb-4">
						{titleDraft === null ? <div className="group flex min-h-6 min-w-0 items-center gap-1">
							<Tip label={view.title}><h1 className="min-w-0 flex-1 truncate text-base leading-snug font-semibold">{view.title}</h1></Tip>
							{view.viewer.canUpdate && <Tip label="Edit title"><Button size="icon-xs" variant="ghost" aria-label="Edit title" className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setTitleDraft(view.title)}><Pencil className="size-3" /></Button></Tip>}
						</div> : <div className="space-y-2">
							<Input autoFocus disabled={pending === "title"} value={titleDraft} aria-label="Pull request title" className="h-7 text-sm" onChange={event => setTitleDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void saveTitle(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTitleDraft(null); } }} />
							<div className="flex justify-end gap-2"><Button size="xs" variant="ghost" disabled={pending === "title"} onClick={() => setTitleDraft(null)}>Cancel</Button><Button size="xs" variant="outline" disabled={busy || !titleDraft.trim()} onClick={() => void saveTitle()}>{pending === "title" ? "Saving…" : "Save"}</Button></div>
						</div>}
						<div className="mt-2 flex min-h-5 min-w-0 items-center gap-2 text-xs text-muted-foreground">
							<MetaLine className="min-w-0 whitespace-nowrap"><ActorLabel key="author" actor={view.authorActor} /><span key="updated">updated {formatRelativeTime(view.updatedAt)}</span></MetaLine>
							{view.state === "OPEN" && <span className="ml-auto flex min-w-0 items-center gap-2"><CopyableCode value={`gh pr checkout ${view.number}`} label="Copy checkout command" />
									<DropdownMenu>
										<Tip label="Check out this pull request"><DropdownMenuTrigger disabled={handoff.pending !== undefined} render={<Button size="xs" variant="outline" aria-label={handoff.pending?.startsWith("checkout") ? "Checking out…" : "Check out"} data-pull-request-checkout="" />}>
											<GitBranch aria-hidden className="size-3.5" /><span className="@max-[35rem]/pr-header:hidden">{handoff.pending?.startsWith("checkout") ? "Checking out…" : "Check out"}</span><ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
										</DropdownMenuTrigger></Tip>
										<DropdownMenuContent align="end" className="w-72">
											<DropdownMenuItem onClick={() => void handoff.run("checkout", view)} className="items-start"><GitBranch className="mt-0.5 size-3.5 shrink-0" /><span className="flex min-w-0 flex-col"><span>In a separate worktree</span><span className="text-xs text-muted-foreground">Its own folder and chat. Nothing you have open moves.</span></span></DropdownMenuItem>
											<DropdownMenuItem onClick={() => void handoff.run("checkout-here", view)} className="items-start"><FolderGit2 className="mt-0.5 size-3.5 shrink-0" /><span className="flex min-w-0 flex-col"><span>In this repository</span><span className="text-xs text-muted-foreground">Switches the branch you are working in, like <code className="font-mono">gh pr checkout</code>.</span></span></DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu></span>}
						</div>
						<div className="mt-4 flex min-h-5 min-w-0 items-center gap-2 text-xs text-muted-foreground">
							{branchLine(false)}
							<span className="ml-auto inline-flex shrink-0 items-center justify-end gap-2">{filesKnown && <span className="inline-flex min-w-16 items-center justify-end gap-1.5 tabular-nums"><FileDiff aria-hidden className="size-3.5" />{view.changedFiles} {view.changedFiles === 1 ? "file" : "files"}</span>}{!view.statsUnknown && <DiffStat additions={view.additions} deletions={view.deletions} className="shrink-0 font-mono text-xs" />}</span>
						</div>
					</div>
				</div>
			</div>
			<nav className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2" aria-label="Pull request tabs">
				<ToggleGroup aria-label="Pull request tabs" value={tab} onValueChange={(value: string) => { const next = tabs.find(item => item.value === value)?.value; if (next) selectTab(next); }} spacing={0.5} className={cn("shrink-0", segmentedGroup)}>
					{/* Guide and Code read the diff through GitHub; other hosts get Summary and Timeline. */}
					{tabs.filter(item => !view.codeHost || item.value === "summary" || item.value === "timeline").map(item => <ToggleGroupItem key={item.value} value={item.value} className={segmentedItem}>{item.label}</ToggleGroupItem>)}
				</ToggleGroup>
				{canApproveWorkflows && <Tip label="GitHub is holding these workflows until someone with write access lets them run, as it does for pull requests from forks."><Button size="xs" variant="outline" className="shrink-0 border-warning/40 text-warning hover:text-warning" disabled={busy} onClick={() => void pull.perform({ type: "approve-workflows" })}><PlayCircle aria-hidden className="size-3.5" />{pending === "approve-workflows" ? "Approving…" : "Approve workflows to run"}</Button></Tip>}
				{tab === "summary" && <span className="ml-auto flex h-4 min-w-0 flex-1 items-center justify-end gap-x-1.5 overflow-hidden text-xs text-muted-foreground" aria-label={`Checks: ${staleChecks ? "Check details are out of date" : summarizeChecks(view.checkRuns)}`}>
					{rollup ? <ChecksPopover rollup={rollup} checks={view.checkRuns} onOpen={open} stale={staleChecks} /> : <CircleDot aria-hidden className="size-3.5" />}<span className="whitespace-nowrap">{staleChecks ? "Check details are out of date" : summarizeChecks(view.checkRuns)}</span>
				</span>}
				{tab === "timeline" && <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
					<MetaLine className="text-2xs whitespace-nowrap">
						<span key="comments" className="inline-flex items-center gap-1" aria-label={`${view.commentCount} ${view.commentCount === 1 ? "comment" : "comments"}`}><MessageSquare aria-hidden className="size-3" />{view.commentCount}</span>
						<span key="commits" className="inline-flex items-center gap-1" aria-label={`${view.commitCount} ${view.commitCount === 1 ? "commit" : "commits"}`}><GitCommitHorizontal aria-hidden className="size-3" />{view.commitCount}</span>
						{approvals > 0 && <span key="approvals" className={cn("inline-flex items-center gap-1", REVIEW_OUTCOME_PRESENTATION.approved.toneClassName)}><ReviewOutcomeIcon outcome="approved" className="size-3" />{approvals}<span className="sr-only">{approvals === 1 ? "approval" : "approvals"}</span></span>}
					</MetaLine>
					<Button size="xs" variant="ghost" className="text-muted-foreground" aria-label={order === "newest" ? "Show oldest activity first" : "Show newest activity first"} onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}><ArrowDownUp aria-hidden className="size-3" />{order === "newest" ? "Newest first" : "Oldest first"}</Button>
				</div>}
			</nav>
		</div>
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" onScrollCapture={event => {
			const target = event.target as HTMLElement;
			if (!target.classList?.contains("pr-scroller")) return;
			const top = target.scrollTop;
			setCondensed(previous => previous ? top >= 4 : top > 64);
		}}>
			{mounted.has("summary") && <div className={cn("absolute inset-0", tab !== "summary" && "invisible")}><SummaryTab view={view} projectId={projectId} onOpen={open} onAction={perform} pending={pending} handoff={handoff} checksStale={staleChecks} onRefresh={() => void pull.refresh()} /></div>}
			{mounted.has("guide") && <div className={cn("absolute inset-0", tab !== "guide" && "invisible")}><GuideTab view={view} projectId={projectId} active={tab === "guide"} onOpenCode={path => openCode(path, null)} onFinishReview={() => setReviewRequest(value => value + 1)} onAsk={handoff.ask} writeRequest={guideRequest} onGuideState={setGuideWritten} /></div>}
			{mounted.has("timeline") && <div className={cn("absolute inset-0", tab !== "timeline" && "invisible")}><TimelineTab view={view} projectId={projectId} order={order} onOpen={open} onAction={perform} pending={pending} onViewCommit={oid => openCode(undefined, oid)} /></div>}
			{mounted.has("code") && <div className={cn("absolute inset-0", tab !== "code" && "invisible")}><CodeTab view={view} projectId={projectId} pending={busy} onAction={pull.perform} onOpen={open} handoff={handoff} commit={commit} onCommitChange={setCommit} {...(reveal ? { reveal } : {})} /></div>}
		</div>
		{/* Mounted on every tab: the Code tab's line comments feed it, and an open draft must not vanish with a tab switch. */}
		<div className="absolute right-4 bottom-3 z-20"><Composer key={`${projectId}#${view.number}`} view={view} projectId={projectId} pending={pending} onAction={pull.perform} openReviewRequest={reviewRequest} /></div>
	</div></ReactContext.Provider></TooltipProvider>;
}

/**
 * The base freshness warning, beside the base branch it is about: "out of date … by N commits" (read when it
 * opens), "Changes can be cleanly merged." when GitHub says so, and one button per way the branch can be brought up.
 */
function BaseFreshnessWarning({ view, projectId, small, freshness, pending, updating, onUpdate }: { view: PullRequestView; projectId: string; small: boolean; freshness: NonNullable<ReturnType<typeof baseFreshness>>; pending: boolean; updating: boolean; onUpdate: (method: PullRequestUpdateMethod) => void }) {
	const [behindBy, setBehindBy] = useState<{ head: string; count: number }>();
	const asked = useRef<string>(undefined);
	const read = () => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || asked.current === view.headOid) return;
		asked.current = view.headOid;
		void api.pullRequestBehind(projectId, { base: view.base, headOid: view.headOid }).then(value => setBehindBy({ head: view.headOid, count: value.behindBy }), () => { asked.current = undefined; });
	};
	const summary = behindSummary(view.base, behindBy?.head === view.headOid ? behindBy.count : undefined);
	return <Popover onOpenChange={next => { if (next) read(); }}>
		<PopoverTrigger openOnHover delay={0} closeDelay={120} aria-label={summary} className="inline-flex max-w-[40%] min-w-0 shrink-0 cursor-help items-center gap-1 rounded-sm text-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:text-amber-400"><code className="flex min-w-0"><MiddleTruncate value={view.base} /></code><TriangleAlert aria-hidden className={small ? "size-3 shrink-0" : "size-3.5 shrink-0"} /></PopoverTrigger>
		<PopoverContent align="start" side="bottom" className="w-auto max-w-80 gap-0 p-3">
			<p className="text-xs text-foreground">{summary}</p>
			{freshness.clean && <p className="mt-0.5 text-xs text-muted-foreground">Changes can be cleanly merged.</p>}
			{freshness.methods.length > 0 && <span className="mt-2 flex flex-wrap items-center gap-1.5">{freshness.methods.map(method => <Button key={method} size="xs" variant="outline" disabled={pending} onClick={() => onUpdate(method)}><PullRequestGlyph.merged aria-hidden className="size-3" />{updating ? "Updating…" : method === "rebase" ? "Update with rebase" : "Update branch"}</Button>)}</span>}
		</PopoverContent>
	</Popover>;
}

function BackButton({ onBack }: { onBack: () => void }) {
	return <Tip label={shortcut("pullRequest.back") ? `Back to pull requests (${shortcut("pullRequest.back")})` : "Back to pull requests"}><Button size="icon-xs" variant="ghost" onClick={onBack} className="-ml-1.5 text-muted-foreground" aria-label="Back to pull requests"><ArrowLeft aria-hidden className="size-3.5" /></Button></Tip>;
}
