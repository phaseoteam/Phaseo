import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, ArrowLeft, ArrowUpRight, BookOpen, Check, CircleDot, Copy, ExternalLink, FileDiff, GitBranch, GitCommitHorizontal, Hammer, Link as LinkIcon, MessageCircleQuestion, MessageSquare, MoreHorizontal, Pencil, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import type { PullRequestMergeMethod, PullRequestReactionContent } from "../../../shared/pullRequestView";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { TooltipProvider } from "../../components/ui/tooltip";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { ChecksPopover } from "./ChecksPopover";
import { CodeTab } from "./CodeTab";
import { Composer } from "./Composer";
import { ActorLabel, DiffStat, errorMessage, MetaLine, MiddleTruncate, PullRequestGlyph, pullRequestStatePresentation, ReviewOutcomeIcon, REVIEW_OUTCOME_PRESENTATION, Tip } from "./presentation";
import { approvalCount, checksRollup, mergeMethodLabels, primaryAction, relativeTime, summarizeChecks } from "./pullRequestLogic";
import { segmentedGroup, segmentedItem } from "./segmented";
import { ReactContext, SummaryTab } from "./SummaryTab";
import { TimelineTab } from "./TimelineTab";
import { useInlineActionConfirm } from "./useInlineActionConfirm";
import { usePullRequest } from "./usePullRequest";
import { usePullRequestHandoff } from "./usePullRequestHandoff";

type Tab = "summary" | "timeline" | "code";
const tabs: { value: Tab; label: string }[] = [{ value: "summary", label: "Summary" }, { value: "timeline", label: "Timeline" }, { value: "code", label: "Code" }];

function useCopied() {
	const [copied, setCopied] = useState<string>();
	const timer = useRef<number>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	return { copied, copy: (text: string, what: string) => { void navigator.clipboard.writeText(text).then(() => { setCopied(what); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(undefined), 1500); }, () => setCopied(`${what} failed`)); } };
}
function CopyableCode({ value, label, className }: { value: string; label: string; className?: string }) {
	const { copied, copy } = useCopied();
	return <Tip label={copied ? "Copied" : label}><button type="button" onClick={() => copy(value, label)} aria-label={copied ? "Copied" : label} className={cn("inline-flex min-w-0 items-center gap-1 rounded-sm font-mono text-xs text-muted-foreground hover:text-foreground", className)}><span className="truncate">{value}</span>{copied ? <Check aria-hidden className="size-3 shrink-0" /> : <Copy aria-hidden className="size-3 shrink-0 opacity-60" />}</button></Tip>;
}

/**
 * One pull request, laid out like T3 Code's detail panel: a header that condenses to `#N title` on
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
	const [storedMethod, setStoredMethod] = usePersistedState<PullRequestMergeMethod>("phaseo.desktop.pullRequestMergeMethod", "squash");
	const confirm = useInlineActionConfirm(`${projectId}#${number}`);
	const { copied, copy } = useCopied();
	const [openError, setOpenError] = useState("");
	const handoff = usePullRequestHandoff(projectId);
	useEffect(() => { setTab("summary"); setMounted(new Set(["summary"])); setCondensed(false); setTitleDraft(null); }, [projectId, number]);
	const open = (url: string) => { setOpenError(""); void api?.openLink(url).catch(reason => setOpenError(errorMessage(reason))); };
	const react = useCallback((subjectId: string, content: PullRequestReactionContent, reacted: boolean) => perform({ type: "react", subjectId, content, reacted }), [perform]);
	const selectTab = (next: Tab) => { setTab(next); setMounted(current => new Set([...current, next])); setCondensed(false); };

	if (!view) return <div className="flex h-full min-h-0 flex-col bg-background" aria-label={`Pull request #${number}`} aria-busy={pull.refreshing}>
		<div className="flex h-10 min-h-10 shrink-0 items-center gap-1 border-b border-border/60 px-4 text-xs text-muted-foreground">
			{onBack && <BackButton onBack={onBack} />}<span className="font-medium">#{number}</span>
		</div>
		{pull.error ? <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
			<PullRequestGlyph.pullRequest aria-hidden className="size-6 text-muted-foreground/60" />
			<p className="text-sm font-medium">Pull request #{number} unavailable</p>
			<p role="alert" className="max-w-72 text-xs text-muted-foreground">{pull.error}</p>
			<Button size="sm" variant="outline" disabled={pull.refreshing} onClick={() => void pull.refresh()}>{pull.refreshing ? "Retrying…" : "Retry"}</Button>
		</div> : <p role="status" className="px-4 py-3 text-xs text-muted-foreground">Loading pull request #{number}…</p>}
	</div>;

	const presentation = pullRequestStatePresentation(view.state, view.draft);
	const primary = primaryAction(view), conflicting = view.state === "OPEN" && view.mergeable === "CONFLICTING";
	const method = view.autoMerge?.method ?? (view.mergeMethods.includes(storedMethod) ? storedMethod : view.mergeMethods[0] ?? "merge");
	const autoMergeArmed = view.state === "OPEN" && Boolean(view.autoMerge);
	const armedLabel = view.autoMerge ? `Auto-merge (${mergeMethodLabels[view.autoMerge.method].toLowerCase()})` : "Auto-merge", pendingAutoMergeLabel = `Auto-merge (${mergeMethodLabels[method].toLowerCase()})`;
	const armedBadge = <Tip label={`${armedLabel}: GitHub will merge this on its own once its requirements are met${view.autoMerge?.enabledBy ? ` (turned on by ${view.autoMerge.enabledBy})` : ""}`}><Badge variant="outline" role="img" aria-label={armedLabel} data-auto-merge="" className="h-6 px-2 text-sky-700 dark:text-sky-300"><PullRequestGlyph.merged aria-hidden className="size-3.5" /><span className="@max-[30rem]/pr-header:hidden">{armedLabel}</span></Badge></Tip>;
	const pending = pull.pending, busy = pending !== undefined;
	const rollup = checksRollup(view.checkRuns), approvals = approvalCount(view);
	const repositoryUrl = `https://github.com/${view.repository}`;
	const canMergeNow = view.state === "OPEN" && !view.draft && !conflicting && view.viewer.canMerge && view.mergeMethods.length > 0 && (primary === "enable-auto-merge" || primary === "auto-merge-armed");
	const canDisableAutoMerge = autoMergeArmed && view.viewer.canDisableAutoMerge;
	const canEnableAutoMerge = view.state === "OPEN" && !autoMergeArmed && primary !== "enable-auto-merge" && !view.draft && !conflicting && view.autoMergeAllowed && view.viewer.canEnableAutoMerge && view.mergeMethods.length > 0;
	const canDeleteBranch = view.state !== "OPEN" && view.headRefExists && view.viewer.canDeleteBranch && view.headRepository?.toLowerCase() === view.repository.toLowerCase();
	const saveTitle = async () => { if (titleDraft === null || !titleDraft.trim()) return; if (titleDraft.trim() === view.title || await pull.perform({ type: "title", title: titleDraft })) setTitleDraft(null); };
	const number$ = (tabIndex?: number) => <Tip label="Open on GitHub"><button type="button" tabIndex={tabIndex} onClick={() => open(view.url)} onAuxClick={event => { if (event.button === 1) open(view.url); }} aria-label={`Open pull request #${view.number} on GitHub`} className={cn("inline-flex shrink-0 cursor-pointer items-center gap-0.5 font-medium underline-offset-2 hover:underline", presentation.toneClassName)}>#{view.number}<ExternalLink aria-hidden className="size-2.5" /></button></Tip>;
	const branchLine = (small: boolean) => <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 font-mono", small ? "text-2xs text-muted-foreground/65" : "text-xs text-muted-foreground/70")}>
		{view.behind && view.state === "OPEN" ? <Popover>
			<PopoverTrigger openOnHover delay={0} aria-label={`This branch is out of date with ${view.base}.`} className="inline-flex max-w-[40%] min-w-0 shrink-0 cursor-help items-center gap-1 rounded-sm text-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"><code className="flex min-w-0"><MiddleTruncate value={view.base} /></code><TriangleAlert aria-hidden className={small ? "size-3 shrink-0" : "size-3.5 shrink-0"} /></PopoverTrigger>
			<PopoverContent align="start" side="bottom" className="w-auto max-w-80 gap-0 p-3">
				<p className="text-xs text-foreground">This branch is out of date with {view.base}.</p>
				{view.viewer.canUpdate && <span className="mt-2 flex"><Button size="xs" variant="outline" disabled={busy} onClick={() => void pull.perform({ type: "update-branch" })}><PullRequestGlyph.merged aria-hidden className="size-3" />{pending === "update-branch" ? "Updating…" : "Update branch"}</Button></span>}
			</PopoverContent>
		</Popover> : <Tip label={view.base}><span className="inline-flex max-w-[40%] min-w-0 shrink-0 items-center gap-1"><code className="flex min-w-0"><MiddleTruncate value={view.base} /></code></span></Tip>}
		<ArrowLeft aria-label="receives changes from" className={cn("shrink-0 opacity-60", small ? "size-3" : "size-3.5")} />
		{small ? <Tip label={view.head}><code className="flex min-w-0 flex-1"><MiddleTruncate value={view.head} /></code></Tip> : <CopyableCode value={view.head} label="Copy pull request branch" className="min-w-0" />}
	</span>;

	let primaryControl: ReactNode = null;
	if (primary === "merged" || primary === "closed") primaryControl = <Badge variant="outline" className="h-6 px-2"><span className={cn("flex items-center gap-1", presentation.toneClassName)}><presentation.Icon className="size-3.5" />{presentation.label}</span></Badge>;
	else if (primary === "resolve") primaryControl = <Tip label="Resolve conflicts on GitHub"><Button size="xs" variant="destructive" onClick={() => open(`${view.url}/conflicts`)} aria-label="Resolve conflicts"><TriangleAlert aria-hidden className="size-3.5" /><span className="@max-[30rem]/pr-header:hidden">Resolve conflicts</span></Button></Tip>;
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

	const menu = <DropdownMenu>
		<Tip label={pull.refreshing ? "Refreshing pull request" : "More pull request actions"}><DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label={pull.refreshing ? "Refreshing pull request" : "More pull request actions"} />}>{pull.refreshing ? <RefreshCw className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-4" />}</DropdownMenuTrigger></Tip>
		<DropdownMenuContent align="end" className="w-56">
			<DropdownMenuItem disabled={pull.refreshing} onClick={() => void pull.refresh()}><RefreshCw className={cn("size-3.5", pull.refreshing && "animate-spin")} />Refresh</DropdownMenuItem>
			<DropdownMenuItem disabled={handoff.pending !== undefined} onClick={() => void handoff.run("ask", view)}><MessageCircleQuestion className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>Ask a question</span><span className="text-xs text-muted-foreground">Opens a chat that knows which pull request you mean.</span></span></DropdownMenuItem>
			<DropdownMenuItem disabled={handoff.pending !== undefined} onClick={() => void handoff.run("explain", view)}><BookOpen className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>Explain this PR</span><span className="text-xs text-muted-foreground">A walk through the diff and what to read closely.</span></span></DropdownMenuItem>
			<DropdownMenuItem disabled={handoff.pending !== undefined || view.state !== "OPEN"} onClick={() => void handoff.run("fix", view)}><Hammer className="size-3.5" />{handoff.pending === "fix" ? "Preparing…" : "Fix findings in a chat"}</DropdownMenuItem>
			{view.state === "OPEN" && view.viewer.canUpdate && primary !== "ready" && <DropdownMenuItem disabled={busy} onClick={() => void pull.perform({ type: view.draft ? "ready" : "draft" })}>{view.draft ? <PullRequestGlyph.pullRequest className="size-3.5" /> : <PullRequestGlyph.draft className="size-3.5" />}{view.draft ? "Ready for review" : "Convert to draft"}</DropdownMenuItem>}
			{canDisableAutoMerge && <DropdownMenuItem disabled={busy} onClick={() => void pull.perform({ type: "disable-auto-merge" })}><X className="size-3.5" />Disable auto-merge</DropdownMenuItem>}
			{canEnableAutoMerge && <DropdownMenuItem closeOnClick={confirm.isArmed("enable-auto-merge-menu")} disabled={busy} aria-label={confirm.isArmed("enable-auto-merge-menu") ? "Confirm auto-merge?" : "Enable auto-merge"} {...confirm.props("enable-auto-merge-menu", () => void pull.perform({ type: "enable-auto-merge", method }))}><PullRequestGlyph.merged className="size-3.5" />{confirm.isArmed("enable-auto-merge-menu") ? "Confirm auto-merge?" : "Enable auto-merge"}</DropdownMenuItem>}
			{canMergeNow && <DropdownMenuItem closeOnClick={confirm.isArmed("merge-now")} disabled={busy} aria-label={confirm.isArmed("merge-now") ? "Confirm merge?" : "Merge now"} {...confirm.props("merge-now", () => void pull.perform({ type: "merge", method }))}><PullRequestGlyph.merged className="size-3.5" />{confirm.isArmed("merge-now") ? "Confirm merge?" : "Merge now"}</DropdownMenuItem>}
			{view.state === "OPEN" && !conflicting && !autoMergeArmed && view.viewer.canMerge && view.mergeMethods.length > 0 && <><DropdownMenuSeparator /><DropdownMenuRadioGroup value={method} onValueChange={value => setStoredMethod(value as PullRequestMergeMethod)}>
				{view.mergeMethods.map(value => <DropdownMenuRadioItem key={value} value={value} disabled={busy} closeOnClick><PullRequestGlyph.merged className="size-3.5" />{mergeMethodLabels[value]}</DropdownMenuRadioItem>)}
			</DropdownMenuRadioGroup></>}
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={() => open(view.url)}><ArrowUpRight className="size-3.5" />Open on GitHub</DropdownMenuItem>
			<DropdownMenuItem onClick={() => copy(view.url, "Link")}><LinkIcon className="size-3.5" />Copy link</DropdownMenuItem>
			<DropdownMenuItem onClick={() => copy(`#${view.number}`, "Number")}><Copy className="size-3.5" />Copy PR number</DropdownMenuItem>
			{view.state === "OPEN" && view.viewer.canUpdate && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" closeOnClick={confirm.isArmed("close")} disabled={busy} aria-label={confirm.isArmed("close") ? "Confirm close?" : "Close pull request"} {...confirm.props("close", () => void pull.perform({ type: "close" }))}><PullRequestGlyph.closed className="size-3.5" />{confirm.isArmed("close") ? "Confirm close?" : "Close pull request"}</DropdownMenuItem></>}
			{view.state === "CLOSED" && view.viewer.canUpdate && <><DropdownMenuSeparator /><DropdownMenuItem disabled={busy} onClick={() => void pull.perform({ type: "reopen" })}><PullRequestGlyph.reopen className="size-3.5" />Reopen pull request</DropdownMenuItem></>}
			{canDeleteBranch && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" closeOnClick={confirm.isArmed("delete-branch")} disabled={busy} aria-label={confirm.isArmed("delete-branch") ? "Confirm delete?" : "Delete branch"} {...confirm.props("delete-branch", () => void pull.perform({ type: "delete-branch" }))}>
				<Trash2 className="mt-1 size-3.5 shrink-0 self-start" /><span className="flex min-w-0 flex-col"><span>{pending === "delete-branch" ? "Deleting branch…" : confirm.isArmed("delete-branch") ? "Confirm delete?" : "Delete branch"}</span><span className="truncate text-xs text-muted-foreground">{view.head}</span></span>
			</DropdownMenuItem></>}
		</DropdownMenuContent>
	</DropdownMenu>;

	const notice = pull.actionError?.message ?? (handoff.error || openError || (copied ? (copied.endsWith("failed") ? `Copy failed` : `${copied} copied`) : ""));
	return <TooltipProvider delay={150}><ReactContext.Provider value={react}><div className="relative flex h-full min-h-0 w-full flex-col bg-background" aria-label={`Pull request #${view.number}`} data-pull-request={view.number}>
		<div className="@container/pr-header grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border/60">
			<div className="grid h-10 min-w-0 items-center overflow-hidden pl-4">
				<div aria-hidden={condensed} inert={condensed} className={cn("col-start-1 row-start-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-[opacity,transform] ease-out motion-reduce:transition-none", condensed ? "pointer-events-none -translate-y-1 opacity-0 duration-100" : "translate-y-0 opacity-100 delay-50 duration-150")}>
					{onBack && <BackButton onBack={onBack} />}
					<Tip label={`Open ${view.repository} on GitHub`}><button type="button" onClick={() => open(repositoryUrl)} className="min-w-0 cursor-pointer truncate text-left font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{view.repository}</button></Tip>
					{number$()}
				</div>
				<div aria-hidden={!condensed} inert={!condensed} className={cn("col-start-1 row-start-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-[opacity,transform] ease-out motion-reduce:transition-none", condensed ? "translate-y-0 opacity-100 delay-50 duration-150" : "pointer-events-none translate-y-1 opacity-0 duration-100")}>
					{onBack && <BackButton onBack={onBack} />}{number$(condensed ? 0 : -1)}
					<Tip label={view.title}><span className="min-w-0 truncate font-medium text-foreground">{view.title}</span></Tip>
				</div>
			</div>
			<div className="mr-4 flex h-10 shrink-0 items-center justify-end gap-1">{autoMergeArmed && primary !== "auto-merge-armed" && armedBadge}{primaryControl}{menu}</div>
			<div className={cn("col-span-2 grid", condensed ? "grid-rows-[1fr]" : "grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none")}>
				<div className={cn("min-h-0 overflow-hidden transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none", condensed ? "translate-y-0 opacity-100 delay-50" : "translate-y-1 opacity-0 duration-100")} inert={!condensed}>
					<div className="flex min-w-0 items-center gap-2 px-4 pt-1 pb-2 text-xs text-muted-foreground">
						<span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden"><ActorLabel actor={view.authorActor} variant="avatar" className="shrink-0" /><span className="shrink-0">{relativeTime(view.updatedAt)}</span></span>
						<span aria-hidden className="h-3 w-px shrink-0 bg-border/70" />
						{branchLine(true)}
						<span className="ml-auto inline-flex shrink-0 items-center justify-end gap-2 text-2xs"><span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${view.changedFiles} changed ${view.changedFiles === 1 ? "file" : "files"}`}><FileDiff aria-hidden className="size-3" />{view.changedFiles}</span><DiffStat additions={view.additions} deletions={view.deletions} className="shrink-0 font-mono text-2xs" /></span>
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
							<MetaLine className="min-w-0 whitespace-nowrap"><ActorLabel key="author" actor={view.authorActor} /><span key="updated">updated {relativeTime(view.updatedAt)}</span></MetaLine>
							{view.state === "OPEN" && <span className="ml-auto flex min-w-0 items-center gap-2"><CopyableCode value={`gh pr checkout ${view.number}`} label="Copy checkout command" />
									<Tip label="Check out in a separate worktree: its own folder and chat. Nothing you have open moves."><Button size="xs" variant="outline" disabled={handoff.pending !== undefined} onClick={() => void handoff.run("checkout", view)} aria-label={handoff.pending === "checkout" ? "Checking out…" : "Check out in a worktree"} data-pull-request-checkout=""><GitBranch aria-hidden className="size-3.5" /><span className="@max-[35rem]/pr-header:hidden">{handoff.pending === "checkout" ? "Checking out…" : "Check out"}</span></Button></Tip></span>}
						</div>
						<div className="mt-4 flex min-h-5 min-w-0 items-center gap-2 text-xs text-muted-foreground">
							{branchLine(false)}
							<span className="ml-auto inline-flex shrink-0 items-center justify-end gap-2"><span className="inline-flex min-w-16 items-center justify-end gap-1.5 tabular-nums"><FileDiff aria-hidden className="size-3.5" />{view.changedFiles} {view.changedFiles === 1 ? "file" : "files"}</span><DiffStat additions={view.additions} deletions={view.deletions} className="shrink-0 font-mono text-xs" /></span>
						</div>
					</div>
				</div>
			</div>
			<nav className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2" aria-label="Pull request tabs">
				<ToggleGroup aria-label="Pull request tabs" value={tab} onValueChange={(value: string) => { const next = tabs.find(item => item.value === value)?.value; if (next) selectTab(next); }} spacing={0.5} className={cn("shrink-0", segmentedGroup)}>
					{tabs.map(item => <ToggleGroupItem key={item.value} value={item.value} className={segmentedItem}>{item.label}</ToggleGroupItem>)}
				</ToggleGroup>
				{tab === "summary" && <span className="ml-auto flex h-4 min-w-0 flex-1 items-center justify-end gap-x-1.5 overflow-hidden text-xs text-muted-foreground" aria-label={`Checks: ${summarizeChecks(view.checkRuns)}`}>
					{rollup ? <ChecksPopover rollup={rollup} checks={view.checkRuns} onOpen={open} /> : <CircleDot aria-hidden className="size-3.5" />}<span className="whitespace-nowrap">{summarizeChecks(view.checkRuns)}</span>
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
		{notice && <div className={cn("flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-1.5 text-xs", pull.actionError || openError || handoff.error ? "text-destructive" : "text-muted-foreground")} role={pull.actionError || openError || handoff.error ? "alert" : "status"}>
			<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{notice}</span>
			{(pull.actionError || openError || handoff.error) && <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => { pull.clearActionError(); setOpenError(""); handoff.clearError(); }}><X className="size-3" /></Button>}
		</div>}
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" onScrollCapture={event => {
			const target = event.target as HTMLElement;
			if (!target.classList?.contains("pr-scroller")) return;
			const top = target.scrollTop;
			setCondensed(previous => previous ? top >= 4 : top > 64);
		}}>
			{mounted.has("summary") && <div className={cn("absolute inset-0", tab !== "summary" && "invisible")}><SummaryTab view={view} projectId={projectId} onOpen={open} onAction={perform} /></div>}
			{mounted.has("timeline") && <div className={cn("absolute inset-0", tab !== "timeline" && "invisible")}><TimelineTab view={view} projectId={projectId} order={order} onOpen={open} /></div>}
			{mounted.has("code") && <div className={cn("absolute inset-0", tab !== "code" && "invisible")}><CodeTab view={view} projectId={projectId} pending={busy} onAction={pull.perform} onOpen={open} /></div>}
		</div>
		{tab !== "code" && <div className="absolute right-4 bottom-3 z-20"><Composer key={`${projectId}#${view.number}`} view={view} pending={pending} error={pull.actionError && ["comment", "review"].includes(pull.actionError.action) ? pull.actionError.message : undefined} onAction={pull.perform} /></div>}
	</div></ReactContext.Provider></TooltipProvider>;
}

function BackButton({ onBack }: { onBack: () => void }) {
	return <Tip label="Back to pull requests"><Button size="icon-xs" variant="ghost" onClick={onBack} className="-ml-1.5 text-muted-foreground" aria-label="Back to pull requests"><ArrowLeft aria-hidden className="size-3.5" /></Button></Tip>;
}
