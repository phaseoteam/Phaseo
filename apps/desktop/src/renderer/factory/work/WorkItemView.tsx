import { ArrowUpRight, ChevronDown, FastForward, FolderGit2, GitBranch, MessageSquare, MessagesSquare, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { autopilot, autopilotFits, lastRun, linkedItem, nextActions, stageAgent } from "../../../shared/factory/actions";
import { matchingRule } from "../../../shared/factory/intake";
import { RISK_LABEL } from "../../../shared/factory/report";
import { currentStage, stageLabel, stagesFor } from "../../../shared/factory/stages";
import type { FactorySnapshot, Run, RunOutcomeKind, SimilarItem, StageId, TimelineEntry, WorkItem } from "../../../shared/factory/types";
import { AgentPicker, agentName, billingLabel } from "../components/AgentPicker";
import { AttachmentsView } from "../components/Attachments";
import { AgentMark, ItemMark, MERGED, PersonMark, StatusMark, harnessName } from "../components/Marks";
import { InlineMarkdown, Markdown } from "../components/Markdown";
import { ProofView } from "../components/Proof";
import { RunLog } from "../components/RunLog";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Tip } from "../../components/ui/tooltip";
import { duration, since, tokens } from "../lib/format";
import { factory, openExternal, useFactoryNav, useItemBody, useMarkSeen, useNow, useOpenItemThread, type FactoryRoute } from "../lib/useFactory";
import { FactoryLink } from "../components/FactoryLink";
import { cn } from "../../lib/utils";
import { DescriptionEditor, LabelsDetail, PeopleDetail, TitleEditor } from "./EditItem";
import { LabelChip } from "../components/LabelChip";
import { FilesView } from "./FilesView";
import { ChecksBox, CommentBox, GithubMenu, MergeBox } from "./GithubActions";
import { CommentEntry, TimelineView, useTimeline } from "./Timeline";
import { ActionButton, Composer, NextSteps, runAction } from "./NextSteps";
import { Pipeline } from "./Pipeline";
import { errorText } from "../components/AddRepo";

const PRIORITY = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" } as const;

function stateLabel(item: WorkItem) {
	if (item.state === "merged") return "Merged";
	if (item.state === "closed") return item.kind === "pull" ? "Closed" : "Completed";
	if (item.state === "draft") return "Draft";
	return "Open";
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return <div className="grid grid-cols-[96px_1fr] items-start gap-3 py-1.5 text-sm">
		<dt className="text-muted-foreground">{label}</dt>
		<dd className="min-w-0">{children}</dd>
	</div>;
}

/** How a run ended, when that's more than its status says. A success needs no tag. */
const OUTCOME: Record<Exclude<RunOutcomeKind, "success">, { label: string; className: string }> = {
	blocked: { label: "Blocked", className: "text-warning" },
	failed: { label: "Failed", className: "text-destructive" },
	flawed: { label: "Flawed", className: "text-destructive" },
	manual: { label: "Passed by hand", className: "text-muted-foreground" },
	stopped: { label: "Stopped", className: "text-muted-foreground" },
};

/** Issues in the same repository that read like this one, worked out on this computer when the issue opens. */
function useSimilar(item: WorkItem): SimilarItem[] {
	const [similar, setSimilar] = useState<SimilarItem[]>([]);
	useEffect(() => {
		setSimilar([]);
		if (item.kind !== "issue") return;
		let current = true;
		void factory().similarItems(item.id).then((found) => current && setSimilar(found)).catch(() => undefined);
		return () => {
			current = false;
		};
	}, [item.id, item.kind]);
	return similar;
}

/** Bot accounts end in [bot]; their comments don't count as someone replying. */
const isBot = (login: string) => login.endsWith("[bot]");

/** The GitHub checks on a pull request Factory worked on. */
function ChecksDetail({ item }: { item: WorkItem }) {
	const ci = item.ci;
	if (!ci || ci.state === "none") return <span className="text-muted-foreground">{ci ? "None on this branch" : "Not read yet"}</span>;
	if (ci.state === "pending") return <span className="text-muted-foreground">Running on GitHub</span>;
	if (ci.state === "passed") return <span className="text-success">All passed</span>;
	return <>
		<span className="text-destructive">{ci.failed.length === 1 ? "1 failed" : `${ci.failed.length} failed`}</span>
		{ci.failed.map((check) => <span key={check.name} className="mt-0.5 block truncate text-xs">
			{check.link ? <button type="button" className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" onClick={() => openExternal(check.link!)}>{check.name}</button> : <span className="text-muted-foreground">{check.name}</span>}
		</span>)}
	</>;
}

/**
 * Each stage's latest proof, in order, so the item reads as evidence from report to fix. An issue
 * carries on into its pull request, so its proof ends with Review and Verify.
 */
function ProofSection({ item, snapshot }: { item: WorkItem; snapshot: FactorySnapshot }) {
	const pull = item.kind === "issue" ? linkedItem(item, snapshot.items) : undefined;
	const owners = pull ? [item, pull] : [item];
	const runs = owners.flatMap((owner) => stagesFor(owner).map((stage) => ({ owner, run: lastRun(owner, stage.id, snapshot.runs) })))
		.filter((entry): entry is { owner: WorkItem; run: Run } => Boolean(entry.run?.report && entry.run.status !== "running" && (entry.run.report.files.length || entry.run.report.notes.length)));
	if (!runs.length) return null;
	return <section className="mb-8">
		<h2 className="mb-3 text-sm font-semibold">Proof</h2>
		<div className="space-y-6">
			{runs.map(({ owner, run }) => {
				const agent = snapshot.agents.find((candidate) => candidate.id === run.agentId);
				return <div key={run.id}>
					<div className="mb-2 flex items-center gap-2 text-xs">
						<StatusMark status={owner.stages[run.stage].status} className="size-3.5" />
						<span className="font-semibold">{stageLabel(run.stage)}</span>
						{owner !== item && <FactoryLink to={{ item: owner.id }} className="text-muted-foreground hover:text-foreground hover:underline">#{owner.number}</FactoryLink>}
						{run.report?.verdict && <span className="text-foreground/80">{run.report.verdict}</span>}
						<span className="text-muted-foreground">{agent?.label ?? run.agentId}</span>
					</div>
					<ProofView run={run} />
				</div>;
			})}
		</div>
	</section>;
}

function RunsTable({ runs, snapshot, selected, onSelect }: { runs: Run[]; snapshot: FactorySnapshot; selected?: string; onSelect: (run: Run) => void }) {
	const now = useNow();
	if (runs.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No runs yet. Pick a stage above to start one.</p>;
	return <div>
		<div className="grid grid-cols-[20px_96px_1fr_88px_80px_96px] gap-3 px-3 pb-2 text-2xs text-muted-foreground">
			<span /><span>Stage</span><span>Agent and outcome</span><span className="text-right">Duration</span><span className="text-right">Tokens</span><span className="text-right">Started</span>
		</div>
		{runs.map((run) => {
			const agent = snapshot.agents.find((candidate) => candidate.id === run.agentId);
			// A run Factory carried on by itself is a pause in the work, not a failure of it.
			const carried = run.interrupted && runs.some((other) => other.resumes === run.id);
			const status = run.status === "running" ? "running" : run.status === "succeeded" ? "done" : run.status === "failed" && !carried ? "failed" : "skipped";
			return <button key={run.id} type="button" onClick={() => onSelect(run)} className={cn("grid w-full grid-cols-[20px_96px_1fr_88px_80px_96px] items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent/60", selected === run.id && "bg-accent hover:bg-accent")}>
				<StatusMark status={status} />
				<span className="font-medium">{stageLabel(run.stage)}</span>
				<span className="flex min-w-0 items-center gap-2">
					<AgentMark agent={agent} className="size-4" />
					<span className="shrink-0 text-muted-foreground">{agent?.label ?? run.agentId}</span>
					{run.interrupted && <span className="shrink-0 text-xs font-medium text-warning">{carried ? "Interrupted, carried on" : "Interrupted"}</span>}
					{run.outcome && run.outcome.kind !== "success" && <span title={run.outcome.why} className={cn("shrink-0 text-xs font-medium", OUTCOME[run.outcome.kind].className)}>{OUTCOME[run.outcome.kind].label}</span>}
					<span className="truncate text-xs text-muted-foreground/80" title={run.outcome?.why}>{run.outcome?.kind === "flawed" ? run.outcome.why : run.summary ? <InlineMarkdown source={run.summary} /> : (run.status === "running" ? run.log.at(-1)?.text : "")}</span>
				</span>
				<span className="text-right text-xs text-muted-foreground tabular-nums">{duration((run.finishedAt ?? now) - run.startedAt)}</span>
				<span className="text-right text-xs text-muted-foreground tabular-nums">{run.usage ? tokens(run.usage.inputTokens + run.usage.outputTokens) : "—"}</span>
				<span className="text-right text-xs text-muted-foreground tabular-nums">{since(run.startedAt, now)}</span>
			</button>;
		})}
	</div>;
}

/** Autopilot is taking the issue to a pull request: where it's got to, and a way to stop it. */
function AutopilotBar({ item, running }: { item: WorkItem; running?: StageId }) {
	const now = useNow(15_000);
	const stage = running ?? currentStage(item)?.id;
	return <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-info/40 bg-info/[0.04] px-3.5 py-2.5 text-sm">
		<FastForward className="size-4 shrink-0 text-info" />
		<span className="min-w-0 flex-1">
			<span className="font-medium">Autopilot</span>
			<span className="text-muted-foreground"> · {stage ? `${stageLabel(stage)} ${running ? "is running" : "is next"}` : "Opening the pull request"}, then the rest up to a draft pull request. It stops as soon as anything needs you. Started {since(item.autopilot!.startedAt, now)}.</span>
		</span>
		<Button variant="outline" size="sm" onClick={() => void factory().act(item.id, { id: "stop-autopilot", label: "Stop autopilot" })}>Stop autopilot</Button>
	</div>;
}

/** Height of the bar that takes the title's place once it scrolls away. */
const BAR_HEIGHT = 44;
/** Height of the tabs, which stay under the bar. */
const TABS_HEIGHT = 40;
/** Where the details column stays: under the bar and the tabs, with the same gap as above it. */
const DETAILS_TOP = BAR_HEIGHT + TABS_HEIGHT + 24;

/** True while `element` fits in `viewport` below `top`, so keeping it on screen hides none of it. */
function useFitsBelow(viewport: RefObject<HTMLElement | null>, element: RefObject<HTMLElement | null>, top: number, key: string) {
	const [fits, setFits] = useState(false);
	useEffect(() => {
		const root = viewport.current;
		const target = element.current;
		if (!root || !target) return;
		const measure = () => setFits(target.offsetHeight + top + 16 <= root.clientHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		observer.observe(target);
		return () => observer.disconnect();
	}, [viewport, element, top, key]);
	return fits;
}

/** True once `target` has scrolled up under the top of `viewport`, where the bar covers it. */
function useScrolledPast(viewport: RefObject<HTMLElement | null>, target: RefObject<HTMLElement | null>, key: string) {
	const [past, setPast] = useState(false);
	useEffect(() => {
		const root = viewport.current;
		const element = target.current;
		if (!root || !element) return;
		setPast(false);
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry) return;
			// Gone below the fold doesn't count, only gone above.
			setPast(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0));
		}, { root, rootMargin: `-${BAR_HEIGHT}px 0px 0px 0px` });
		observer.observe(element);
		return () => observer.disconnect();
	}, [viewport, target, key]);
	return past;
}

export function WorkItemView({ item, snapshot, route }: { item: WorkItem; snapshot: FactorySnapshot; route: FactoryRoute }) {
	const nav = useFactoryNav();
	const thread = useOpenItemThread();
	const [error, setError] = useState<string | null>(null);
	const viewport = useRef<HTMLDivElement>(null);
	const titleRef = useRef<HTMLDivElement>(null);
	const scrolled = useScrolledPast(viewport, titleRef, item.id);
	const detailsRef = useRef<HTMLDListElement>(null);
	const detailsFit = useFitsBelow(viewport, detailsRef, DETAILS_TOP, `${item.id}:${route.tab ?? "overview"}`);
	const [openRunId, setOpenRunId] = useState<string | undefined>();
	const tab = route.tab ?? "overview";
	const body = useItemBody(item);
	// The issue a pull request fixes, or the pull request an issue's fix became.
	const related = linkedItem(item, snapshot.items);
	const runs = snapshot.runs.filter((run) => run.itemId === item.id).sort((a, b) => b.startedAt - a.startedAt);
	const liveRun = runs.find((run) => run.status === "running");
	const liveAgent = snapshot.agents.find((agent) => agent.id === liveRun?.agentId);
	const openRun = runs.find((run) => run.id === openRunId) ?? liveRun ?? runs[0];
	const assignee = snapshot.agents.find((agent) => agent.id === item.assigneeId);
	const lead = nextActions(item, snapshot).find((action) => action.primary);
	const next = currentStage(item);
	const spent = runs.reduce((sum, run) => sum + (run.usage ? run.usage.inputTokens + run.usage.outputTokens : 0), 0);

	const playbook = snapshot.settings.playbooks[item.kind];
	const rule = matchingRule(item, playbook);
	const similar = useSimilar(item);
	const { entries, comments, error: commentsError } = useTimeline(item);
	// The newest comment from a person, so a reply shows without opening Activity.
	const latest = comments?.filter((comment) => !comment.factory && !isBot(comment.author)).at(-1);
	const latestEntry = entries?.filter((entry): entry is Extract<TimelineEntry, { kind: "comment" }> => entry.kind === "comment" && !entry.factory && !isBot(entry.author)).at(-1);
	useMarkSeen(item, snapshot.runs);
	const risk = item.kind === "pull" ? lastRun(item, "review", snapshot.runs)?.report?.risk : undefined;
	const duplicateOf = item.duplicateOf ? snapshot.items.find((candidate) => candidate.repo === item.repo && candidate.number === item.duplicateOf && candidate.kind === "issue") : undefined;
	const run = async (stage: StageId, agentId = stageAgent(item, stage, snapshot)) => {
		setError(null);
		if (!agentId) return setError("Assign an agent first.");
		try {
			const started = await factory().startRun({ itemId: item.id, stage, agentId });
			setOpenRunId(started.id);
		} catch (cause) {
			setError(errorText(cause));
		}
	};
	const showRun = (target: Run) => {
		setOpenRunId(target.id);
		nav.go({ item: item.id, tab: "runs" });
	};

	const tabs = [
		{ id: "overview", label: "Overview" },
		{ id: "runs", label: "Runs", count: runs.length },
		{ id: "activity", label: "Activity", count: comments?.length ?? item.comments },
		...(item.kind === "pull" ? [{ id: "files", label: "Files changed", count: item.diff?.files }] : []),
	];

	/** Who works on it and how hard it thinks, GitHub, and the next stage with every other stage under it: in the header, and in the bar once it's scrolled away. */
	const controls = (size: "sm" | "default") => <>
		{/* In the bar, the agent goes first when there isn't room for it and the title. */}
		<span className={size === "sm" ? "hidden @2xl:contents" : "contents"}>
			<AgentPicker snapshot={snapshot} value={item.assigneeId} allowNone effort={{ value: item.effort, onChange: (effort) => void factory().setEffort(item.id, effort).catch((cause: unknown) => setError(errorText(cause))) }} onChange={(agentId) => void factory().assign(item.id, agentId)} />
		</span>
		<Tip label={snapshot.threads[item.id] ? "Open this item's thread in Code" : "Start this item's thread in Code, in its worktree"}>
			<Button variant="outline" size={size} disabled={thread.busy} onClick={() => void thread.open(item.id)}><MessagesSquare className="size-3.5" />{thread.busy ? "Opening…" : "Open thread"}</Button>
		</Tip>
		<GithubMenu item={item} />
		<div className="flex">
			{lead && !liveRun
				? <ActionButton item={item} action={lead} size={size} onError={setError} />
				: <Button variant="outline" size={size} disabled>{liveRun ? `${item.autopilot ? "Autopilot: " : ""}${stageLabel(liveRun.stage)} is running` : next ? "Waiting" : "Nothing to run"}</Button>}
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" size={size} aria-label="Run a stage" className="ml-1 px-2"><ChevronDown className="size-3.5" /></Button>} />
				<DropdownMenuContent align="end" className="w-64">
					{liveRun && <>
						<DropdownMenuItem onClick={() => void factory().cancelRun(liveRun.id)}>
							<Square className="size-3.5" />
							<span className="flex-1">Stop {stageLabel(liveRun.stage)}</span>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>}
					<DropdownMenuGroup>
						<DropdownMenuLabel>Run a stage{assignee ? ` with ${assignee.label}` : ""}</DropdownMenuLabel>
						{stagesFor(item).map((stage) => <DropdownMenuItem key={stage.id} onClick={() => void run(stage.id)}>
							<StatusMark status={item.stages[stage.id].status} className="size-3.5" />
							<span className="flex-1">{stage.label}</span>
							<span className="text-2xs text-muted-foreground">{stage.output}</span>
						</DropdownMenuItem>)}
					</DropdownMenuGroup>
					{autopilotFits(item) && <>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => void runAction(item, autopilot(item)).catch((cause: unknown) => setError(errorText(cause)))}>
							<FastForward className="size-3.5" />
							<span className="min-w-0 flex-1">
								<span className="block">Autopilot to a pull request</span>
								<span className="block text-2xs text-muted-foreground">Every stage in turn, then a draft pull request</span>
							</span>
						</DropdownMenuItem>
					</>}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</>;

	return <ScrollArea className="min-h-0 min-w-0 flex-1" viewportRef={viewport}>
		<div className="@container px-4 pt-6 pb-16 @xl:px-6 @3xl:px-8">
			{/* Takes no room: the bar floats over the top of the view once the title has scrolled away. */}
			<div className="sticky top-0 z-20 h-0">
				<div inert={!scrolled} style={{ height: BAR_HEIGHT }} className={cn("absolute inset-x-0 -mx-4 flex items-center gap-2.5 border-b bg-background/95 px-4 backdrop-blur transition-all duration-200 @xl:-mx-6 @xl:px-6 @3xl:-mx-8 @3xl:px-8", scrolled ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0")}>
					<button type="button" onClick={() => viewport.current?.scrollTo({ top: 0, behavior: "smooth" })} className="-ml-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/60" aria-label="Back to the top">
						<ItemMark item={item} className="size-4 shrink-0" />
						<span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">#{item.number}</span>
						<span className="min-w-0 truncate text-sm font-semibold">{item.title}</span>
					</button>
					<div className="flex shrink-0 items-center gap-2">{controls("sm")}</div>
					{/* The page's own error line is scrolled away, so the bar says what went wrong. */}
					{error && <p className="absolute inset-x-0 top-full truncate border-b bg-background/95 px-4 py-1.5 text-xs text-destructive backdrop-blur @xl:px-6 @3xl:px-8">{error}</p>}
				</div>
			</div>
			{/* The controls drop to their own line when the breadcrumb and they don't fit side by side. */}
			<div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-xs text-muted-foreground">
				<div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
				<Tip label={`Show only ${item.repo}`}>
					<button type="button" onClick={() => void factory().updateSettings({ showRepo: item.repo })} className="-ml-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-accent/60">
						<FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{item.repo}</span>
					</button>
				</Tip>
				<span className="text-muted-foreground/40">/</span>
				<ItemMark item={item} className="size-3.5" />
				<span>{item.kind === "pull" ? "Pull request" : "Issue"} #{item.number}</span>
				</div>
				<div className="ml-auto flex flex-wrap items-center justify-end gap-2">
					{controls("default")}
				</div>
			</div>

			{/* Watched for the bar: a wrapper that stays, since editing the title swaps the heading out. */}
			<div ref={titleRef}>
			<TitleEditor item={item}>
				<h1 data-selectable className="min-w-0 text-[26px] leading-tight font-bold tracking-tight">
					<span className="mr-2.5 font-medium text-muted-foreground/70 tabular-nums">{item.number}</span>{item.title}
				</h1>
			</TitleEditor>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
				<span className={cn("flex items-center gap-1.5 font-medium", item.state === "open" ? "text-success" : item.state === "merged" || (item.kind === "issue" && item.state === "closed") ? MERGED : "text-muted-foreground")}>
					<ItemMark item={item} className="size-3.5" />{stateLabel(item)}
				</span>
				<span className="flex items-center gap-1.5"><PersonMark login={item.author.login} avatar={item.author.avatar} className="size-4" />{item.author.login} opened {since(item.createdAt)}</span>
				{item.comments > 0 && <span className="flex items-center gap-1"><MessageSquare className="size-3.5" />{item.comments}</span>}
				{related && <FactoryLink to={{ item: related.id }} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-foreground/90 hover:bg-accent/60 hover:text-foreground">
					<span className="shrink-0 text-muted-foreground">{item.kind === "pull" ? "Fixes" : "Fixed by"}</span>
					<ItemMark item={related} className="size-3.5 shrink-0" />
					<span className="shrink-0 font-medium tabular-nums">#{related.number}</span>
					<span className="min-w-0 truncate">{related.title}</span>
				</FactoryLink>}
				{item.duplicateOf && <FactoryLink to={{ item: `${item.repo}#${item.duplicateOf}` }} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-warning/40 px-2 py-0.5 text-foreground/90 hover:bg-accent/60 hover:text-foreground">
					<span className="shrink-0 text-muted-foreground">Duplicate of</span>
					<span className="shrink-0 font-medium tabular-nums">#{item.duplicateOf}</span>
					{duplicateOf && <span className="min-w-0 truncate">{duplicateOf.title}</span>}
				</FactoryLink>}
				{risk && <Tip label={risk.why ?? "Review's rating"}><span className={cn("rounded-[4px] border px-1.5 py-px text-2xs font-medium", risk.level === "high" ? "border-destructive/40 text-destructive" : risk.level === "medium" ? "border-warning/40 text-warning" : "text-success")}>{RISK_LABEL[risk.level]}</span></Tip>}
				{item.labels.map((label) => <LabelChip key={label} name={label} color={item.labelColors?.[label]} />)}
				<button type="button" onClick={() => openExternal(item.url)} className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm hover:bg-accent/60 hover:text-foreground">Open on GitHub<ArrowUpRight className="size-3.5" /></button>
			</div>

			{error && <p className="mt-4 border-l-2 border-destructive pl-3 text-sm text-destructive">{error}</p>}

			{item.autopilot && <AutopilotBar item={item} running={liveRun?.stage} />}

			<div className="mt-6">
				<Pipeline item={item} snapshot={snapshot} onRun={(stage) => void run(stage)} onCancel={(target) => void factory().cancelRun(target.id)} onOpenRun={showRun} />
			</div>

			{/* Stays under the bar once scrolled to, covering the page edge to edge so nothing shows behind it. */}
			<nav style={{ top: BAR_HEIGHT, height: TABS_HEIGHT }} className="sticky z-10 -mx-4 mt-6 flex items-end bg-background px-4 @xl:-mx-6 @xl:px-6 @3xl:-mx-8 @3xl:px-8">
				<div className="flex flex-1 gap-5 border-b">
				{tabs.map((entry) => <FactoryLink key={entry.id} to={{ item: item.id, tab: entry.id }} className={cn("relative -mb-px flex items-center gap-1.5 pb-2.5 text-sm", tab === entry.id ? "border-b-2 border-foreground font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
					{entry.label}{entry.count ? <span className="text-xs text-muted-foreground tabular-nums">{entry.count}</span> : null}
				</FactoryLink>)}
				</div>
			</nav>

			{tab === "overview" && <div className="mt-6 grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_288px]">
				<div className="min-w-0">
					<NextSteps item={item} snapshot={snapshot} />
					{liveRun && <section className="mb-8">
						<div className="mb-2 flex items-center gap-2">
							<StatusMark status="running" />
							<h2 className="text-sm font-semibold">{stageLabel(liveRun.stage)} is running</h2>
							<span className="text-xs text-muted-foreground">{liveAgent ? agentName(liveAgent) : liveRun.agentId}</span>
							<span className="flex-1" />
							{liveRun.threadId && <Button variant="ghost" size="xs" onClick={() => nav.openThread(liveRun.threadId!)}>Open thread</Button>}
							<Button variant="ghost" size="xs" onClick={() => showRun(liveRun)}>Full log</Button>
						</div>
						<div className="border-l-2 border-info/50 py-1">
							<RunLog lines={liveRun.log} live limit={9} />
						</div>
						<div className="mt-3"><Composer item={item} snapshot={snapshot} /></div>
					</section>}
					{!liveRun && runs.length > 0 && <div className="-mt-4 mb-8"><Composer item={item} snapshot={snapshot} /></div>}
					{latest && <section className="mb-8">
						<div className="mb-1 flex items-center gap-2">
							<h2 className="text-sm font-semibold">Latest comment</h2>
							<span className="flex-1" />
							<FactoryLink to={{ item: item.id, tab: "activity" }} className="text-xs text-muted-foreground hover:text-foreground hover:underline">All {comments!.length} in Activity</FactoryLink>
						</div>
						{latestEntry && <div className="border-l-2 pl-4"><CommentEntry comment={latestEntry} item={item} /></div>}
					</section>}
					<ProofSection item={item} snapshot={snapshot} />
					<AttachmentsView item={item} />
					<DescriptionEditor item={item} body={body}>
						{body === null ? <p className="text-sm text-muted-foreground">Loading…</p> : <Markdown source={body || "_No description._"} repo={item.repo} />}
					</DescriptionEditor>
				</div>
				{/* Beside the content, it stays in view while the content scrolls, unless it's too tall to show whole. */}
				<dl ref={detailsRef} style={detailsFit ? { top: DETAILS_TOP } : undefined} className={cn("self-start border-t pt-6 @4xl:border-t-0 @4xl:pt-0", detailsFit && "@4xl:sticky")}>
					<h2 className="mb-2 text-sm font-semibold">Details</h2>
					<Detail label="Agent">{assignee ? <>
						<span className="flex items-center gap-2"><AgentMark agent={assignee} className="size-4" />{assignee.label}</span>
						<span className="mt-0.5 block text-xs text-muted-foreground">{harnessName(assignee)} · {billingLabel(assignee)}</span>
					</> : <span className="text-muted-foreground">Unassigned</span>}</Detail>
					{rule && <Detail label="Rule"><button type="button" onClick={() => nav.settings(item.kind === "pull" ? "factory-pulls" : "factory-issues")} className="text-left hover:underline">{rule.name}</button><span className="mt-0.5 block text-xs text-muted-foreground">{item.kind === "pull" ? "Pull request" : "Issue"} playbook</span></Detail>}
					{item.loggedHere && <Detail label="Logged">In Factory</Detail>}
					{risk && <Detail label="Risk"><span className={risk.level === "high" ? "text-destructive" : risk.level === "medium" ? "text-warning" : "text-success"}>{RISK_LABEL[risk.level]}</span>{risk.why && <span className="mt-0.5 block text-xs text-muted-foreground">{risk.why}</span>}</Detail>}
					<Detail label="Proof">{snapshot.settings.playbooks[item.kind].requireProof ? "Required at every stage" : <span className="text-muted-foreground">Not required</span>}</Detail>
					{item.source === "github" && <>
						<LabelsDetail item={item} />
						<PeopleDetail item={item} what="assignees" />
						{item.kind === "pull" && <PeopleDetail item={item} what="reviewers" />}
					</>}
					<Detail label="Priority">{PRIORITY[item.priority]}</Detail>
					{item.branch && <Detail label="Branch"><span className="flex items-center gap-1.5 font-mono text-xs"><GitBranch className="size-3.5 text-muted-foreground" /><span className="truncate">{item.branch}</span></span></Detail>}
					{item.linked && <Detail label={item.kind === "pull" ? "Closes" : "Fixed by"}><FactoryLink to={{ item: `${item.repo}#${item.linked}` }} className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground">#{item.linked}{related ? ` ${related.title}` : ""}</FactoryLink></Detail>}
					{item.diff && <Detail label="Changes"><span className="tabular-nums">{item.diff.files} files <span className="text-success">+{item.diff.additions}</span> <span className="text-destructive">−{item.diff.deletions}</span></span></Detail>}
					{item.kind === "pull" && item.ci && <Detail label="Checks"><ChecksDetail item={item} /></Detail>}
					{!item.ci && item.checks && <Detail label="Checks"><span className="tabular-nums">{item.checks.passed} passed{item.checks.failed ? <span className="text-destructive">, {item.checks.failed} failed</span> : null}{item.checks.pending ? <span className="text-muted-foreground">, {item.checks.pending} pending</span> : null}</span></Detail>}
					<Detail label="Spent">{spent ? <span className="tabular-nums">{tokens(spent)} tokens over {runs.length} {runs.length === 1 ? "run" : "runs"}</span> : <span className="text-muted-foreground">Nothing yet</span>}</Detail>
					<Detail label="Updated">{since(item.updatedAt)}</Detail>
					{similar.length > 0 && <div className="mt-5 border-t pt-5">
						<h2 className="mb-1 text-sm font-semibold">Similar issues</h2>
						<p className="mb-2 text-xs text-muted-foreground">They share most of their words. Triage checks whether one is the same problem.</p>
						{similar.map((entry) => <FactoryLink key={entry.id} to={{ item: entry.id }} className="-mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60">
							<span className="shrink-0 text-muted-foreground tabular-nums">#{entry.number}</span>
							<span className="min-w-0 flex-1 line-clamp-2">{entry.title}</span>
							<span className="shrink-0 pt-0.5 text-2xs text-muted-foreground tabular-nums">{Math.round(entry.score * 100)}%</span>
						</FactoryLink>)}
					</div>}
				</dl>
			</div>}

			{tab === "runs" && <div className="mt-4 space-y-6">
				<RunsTable runs={runs} snapshot={snapshot} selected={openRun?.id} onSelect={(target) => setOpenRunId(target.id)} />
				{openRun && <section>
					<div className="mb-2 flex items-center gap-2 px-3">
						<h2 className="text-sm font-semibold">{stageLabel(openRun.stage)} log</h2>
						{openRun.branch && <span className="font-mono text-2xs text-muted-foreground">{openRun.branch}</span>}
						<span className="flex-1" />
						{openRun.threadId && <Button variant="ghost" size="xs" onClick={() => nav.openThread(openRun.threadId!)}><MessagesSquare className="size-3" />Open thread</Button>}
						{openRun.status === "running" && <Button variant="outline" size="xs" onClick={() => void factory().cancelRun(openRun.id)}>Stop run</Button>}
					</div>
					<div className="rounded-md border bg-muted/30 py-2">
						{openRun.log.length ? <RunLog lines={openRun.log} live={openRun.status === "running"} className="max-h-[520px] overflow-y-auto" /> : <p className="px-3 py-2 text-xs text-muted-foreground">{openRun.summary ?? "This run didn't log anything."}</p>}
					</div>
					{openRun.report && <div className="mt-5 px-3">
						<h3 className="mb-2 text-xs font-semibold">Proof{openRun.report.verdict ? ` · ${openRun.report.verdict}` : ""}</h3>
						<ProofView run={openRun} />
					</div>}
					<div className="mt-5 px-3"><Composer item={item} snapshot={snapshot} /></div>
				</section>}
			</div>}

			{tab === "files" && item.kind === "pull" && <FilesView item={item} />}

			{tab === "activity" && <div className="mt-4 max-w-[820px]">
				{item.kind === "pull" && <div className="mb-3 space-y-3"><MergeBox item={item} /><ChecksBox item={item} /></div>}
				<CommentBox key={item.id} item={item} login={snapshot.github.login} people={[{ login: item.author.login, avatar: item.author.avatar }, ...[...(comments ?? [])].reverse().map((comment) => ({ login: comment.author, avatar: comment.avatar }))].filter((person) => !person.login.endsWith("[bot]") && person.login !== "ghost")} />
				{commentsError && <p className="py-4 text-sm text-destructive">Couldn&apos;t read the activity: {commentsError}</p>}
				{!commentsError && entries === null && <p className="py-10 text-center text-sm text-muted-foreground">Reading the activity from GitHub…</p>}
				{entries && <div className="mt-2"><TimelineView entries={entries} item={item} snapshot={snapshot} /></div>}
			</div>}
		</div>
	</ScrollArea>;
}
