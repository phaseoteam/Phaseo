import { ArrowDownWideNarrow, Check, ChevronRight, CircleAlert, CircleCheck, CircleDashed, Circle, CircleX, Clock, Copy, FastForward, LoaderCircle, MessageCircleQuestion, MessageSquare, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LANES, currentStage, laneFor, type Lane } from "../../../shared/stages";
import type { FactorySnapshot, RepoStatus, Run, WorkItem } from "../../../shared/types";
import { AgentMark, ItemMark, StatusMark, statusLabel } from "../../components/Marks";
import { AddRepo } from "../../components/AddRepo";
import { repoName } from "../../components/RepoPicker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Tip } from "../../components/ui/tooltip";
import { ago } from "../../lib/format";
import { factory, href, lastActivity, useNow, useSeen } from "../../lib/useFactory";
import { cn } from "../../lib/utils";

/** When GitHub was last read, as a button that reads it again. */
function Checked({ snapshot }: { snapshot: FactorySnapshot }) {
	const now = useNow(15_000);
	const [busy, setBusy] = useState(false);
	const minutes = snapshot.settings.pollMinutes;
	const when = snapshot.loadedAt ? ago(snapshot.loadedAt, now) : null;
	return <Tip label={`Factory checks GitHub every ${minutes === 1 ? "minute" : `${minutes} minutes`}, and when you come back to the window. Click to check now.`}>
		<button type="button" disabled={busy} onClick={() => {
			setBusy(true);
			void factory().refresh().finally(() => setBusy(false));
		}} className="flex min-w-0 items-center gap-1.5 hover:text-foreground">
			<RefreshCw className={cn("size-3 shrink-0", busy && "animate-spin")} />
			<span className="truncate">{busy ? "Checking GitHub…" : !when ? "Not checked yet" : when === "now" ? "Checked just now" : `Checked ${when} ago`}</span>
		</button>
	</Tip>;
}

/** Nothing runs on its own, so the footer says what's running now. */
function runningLabel(snapshot: FactorySnapshot) {
	const running = snapshot.runs.filter((run) => run.status === "running").length;
	return running ? `${running} running` : "Nothing running";
}

type Filter = "all" | "issue" | "pull";

const LANE_ICON: Record<Lane, { icon: typeof Circle; className: string }> = {
	"needs-you": { icon: CircleAlert, className: "text-warning" },
	running: { icon: LoaderCircle, className: "text-info" },
	queued: { icon: CircleDashed, className: "text-muted-foreground" },
	waiting: { icon: MessageCircleQuestion, className: "text-info" },
	ready: { icon: Circle, className: "text-muted-foreground" },
	done: { icon: CircleCheck, className: "text-success" },
};

function matches(item: WorkItem, query: string) {
	if (!query) return true;
	const text = `${item.number} ${item.title} ${item.labels.join(" ")} ${item.author.login} ${item.repo}`.toLowerCase();
	return query.toLowerCase().split(/\s+/).every((word) => text.includes(word.replace(/^#/, "")));
}

/** Lanes from most to least urgent, so a pair sits wherever its more urgent half is. */
const LANE_ORDER = LANES.map((lane) => lane.id);

/** A row and the pull requests that fix it, which show indented under it. */
interface Entry {
	item: WorkItem;
	children: WorkItem[];
	lane: Lane;
	/** The latest change to the item or a pull request under it. */
	activity: number;
}

/** Stage groups, or one list with whatever changed last at the top. */
type Order = "stage" | "recent";
const ORDER_KEY = "factory.listOrder";

/** Pull requests that fix an issue in the list go under that issue; the rest stand alone. Latest activity first. */
function entries(items: WorkItem[], runs: Run[]): Entry[] {
	const issues = new Map(items.filter((item) => item.kind === "issue").map((item) => [`${item.repo}#${item.number}`, item]));
	const parentOf = (pull: WorkItem) => (pull.kind === "pull" && pull.linked ? issues.get(`${pull.repo}#${pull.linked}`) : undefined);
	const childrenOf = new Map<string, WorkItem[]>();
	for (const item of items) {
		const parent = parentOf(item);
		if (parent) childrenOf.set(parent.id, [...(childrenOf.get(parent.id) ?? []), item]);
	}
	return items.filter((item) => !parentOf(item)).map((item) => {
		const children = childrenOf.get(item.id) ?? [];
		const lane = [item, ...children].map(laneFor).sort((a, b) => LANE_ORDER.indexOf(a) - LANE_ORDER.indexOf(b))[0]!;
		return { item, children, lane, activity: Math.max(...[item, ...children].map((entry) => lastActivity(entry, runs))) };
	}).sort((a, b) => b.activity - a.activity);
}

interface Group {
	id: Lane | "recent";
	label: string;
	entries: Entry[];
	count: number;
}

/** One line of the list: a group's header, or an item (a pull request under its issue is a child). */
type Line = { kind: "group"; group: Group } | { kind: "item"; item: WorkItem; child?: boolean };

function GroupHeader({ group, first, showDone, onToggle }: { group: Group; first: boolean; showDone: boolean; onToggle: () => void }) {
	const { icon: Icon, className } = group.id === "recent" ? { icon: Clock, className: "text-muted-foreground" } : LANE_ICON[group.id];
	const done = group.id === "done";
	return <button type="button" onClick={() => done && onToggle()} className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-xs", !first && "mt-2", !done && "cursor-default")}>
		{done && <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", showDone && "rotate-90")} />}
		<Icon className={cn("size-3.5", className)} />
		<span className="font-semibold">{group.label}</span>
		<span className="text-muted-foreground tabular-nums">{group.count}</span>
		<span className="h-px flex-1 bg-border" />
	</button>;
}

function Row({ item, snapshot, selected, showRepo, child, isNew, replies = 0 }: { item: WorkItem; snapshot: FactorySnapshot; selected: boolean; showRepo: boolean; child?: boolean; isNew: boolean; replies?: number }) {
	const stage = currentStage(item);
	const state = stage ? item.stages[stage.id] : undefined;
	const agent = snapshot.agents.find((candidate) => candidate.id === (state?.agentId ?? item.assigneeId));
	return <a href={href({ page: "work", item: item.id })} data-selected={selected || undefined} className={cn("group relative flex items-start gap-2.5 rounded-md px-3 py-2 hover:bg-accent/60", selected && "bg-accent hover:bg-accent", child && "ml-6 before:absolute before:-top-1 before:-left-3 before:h-5 before:w-2.5 before:rounded-bl-[4px] before:border-b before:border-l before:border-muted-foreground/30")}>
		<ItemMark item={item} className="mt-px" />
		<div className="min-w-0 flex-1">
			<div className="flex items-center gap-2">
				<span className={cn("truncate text-sm", isNew && "font-semibold")}>{item.title}</span>
			</div>
			<div className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
				{showRepo && <Tip label={item.repo}><span className="max-w-28 shrink-0 truncate font-medium text-foreground/70">{repoName(item.repo)}</span></Tip>}
				<span className="font-mono tabular-nums">{item.number}</span>
				<span className="text-muted-foreground/40">·</span>
				{state && stage ? <>
					<StatusMark status={state.status} className="size-3" />
					<span className="truncate">{stage.label} {statusLabel(state.status).toLowerCase()}</span>
				</> : <span>{item.kind === "issue" && item.linked ? `Fixed in #${item.linked}` : "All stages passed"}</span>}
				{item.ci?.state === "failed" && <Tip label="GitHub checks failed"><CircleX className="size-3 shrink-0 text-destructive" /></Tip>}
				{item.duplicateOf && <Tip label={`Duplicate of #${item.duplicateOf}`}><Copy className="size-3 shrink-0 text-warning" /></Tip>}
				{item.autopilot && <Tip label="Autopilot is taking this to a pull request"><FastForward className="size-3 shrink-0 text-info" /></Tip>}
				{replies > 0 && <Tip label={`${replies === 1 ? "A new comment" : `${replies} new comments`} since you last opened it`}><span className="flex shrink-0 items-center gap-0.5 font-medium text-info"><MessageSquare className="size-3" />{replies}</span></Tip>}
			</div>
		</div>
		<div className="flex shrink-0 flex-col items-end gap-1">
			<span className={cn("flex items-center gap-1.5 text-2xs tabular-nums", isNew ? "font-medium text-info" : "text-muted-foreground")}>
				{isNew && <Tip label="Changed since you last opened it"><span className="size-1.5 rounded-[2px] bg-info" /></Tip>}
				{ago(lastActivity(item, snapshot.runs))}
			</span>
			{agent && <Tip label={`${agent.label}${state?.status === "running" ? " is working on this" : ""}`}><span><AgentMark agent={agent} className="size-4" /></span></Tip>}
		</div>
	</a>;
}

const WIDTH_KEY = "factory.workListWidth";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 260;
const MAX_WIDTH = 640;
/** The item page keeps at least this much of the window. */
const PAGE_MIN = 520;

const clampWidth = (width: number) => Math.round(Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH, window.innerWidth - PAGE_MIN)));

/** The work list's width: dragged from its right edge, remembered on this computer, reset with a double-click. */
function useListWidth() {
	const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_WIDTH);
	const [, setWindowWidth] = useState(window.innerWidth);
	useEffect(() => {
		const onResize = () => setWindowWidth(window.innerWidth);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	const save = (next: number) => {
		setWidth(next);
		localStorage.setItem(WIDTH_KEY, String(next));
	};
	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		const handle = event.currentTarget;
		const startX = event.clientX;
		const start = clampWidth(width);
		handle.setPointerCapture(event.pointerId);
		document.body.style.cursor = "col-resize";
		const move = (next: PointerEvent) => setWidth(clampWidth(start + next.clientX - startX));
		const up = (next: PointerEvent) => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", up);
			document.body.style.cursor = "";
			save(clampWidth(start + next.clientX - startX));
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", up);
	};
	// A narrower window squeezes the list too, without forgetting the width that was chosen.
	return { width: clampWidth(width), onPointerDown, reset: () => save(DEFAULT_WIDTH) };
}

/** `fill`: a narrow window, where the list takes the whole width and can't be resized. */
export function WorkList({ snapshot, items: shown, selected, fill }: { snapshot: FactorySnapshot; items: WorkItem[]; selected?: string; fill?: boolean }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const [showDone, setShowDone] = useState(false);
	const [order, setOrder] = useState<Order>(() => (localStorage.getItem(ORDER_KEY) === "recent" ? "recent" : "stage"));
	const chooseOrder = (next: Order) => {
		setOrder(next);
		localStorage.setItem(ORDER_KEY, next);
	};
	const list = useListWidth();
	const seen = useSeen(shown, snapshot.runs);

	const groups = useMemo((): Group[] => {
		const items = shown.filter((item) => (filter === "all" || item.kind === filter) && matches(item, query));
		const all = entries(items, snapshot.runs);
		const count = (rows: Entry[]) => rows.reduce((sum, entry) => sum + 1 + entry.children.length, 0);
		// Most recent first still keeps finished work out of the way, under Done.
		if (order === "recent") {
			const open = all.filter((entry) => entry.lane !== "done");
			const done = all.filter((entry) => entry.lane === "done");
			return [
				{ id: "recent" as const, label: "Most recent first", entries: open, count: count(open) },
				{ id: "done" as const, label: "Done", entries: done, count: count(done) },
			].filter((group) => group.entries.length > 0);
		}
		return LANES.map((lane) => {
			const rows = all.filter((entry) => entry.lane === lane.id);
			return { ...lane, entries: rows, count: count(rows) };
		}).filter((group) => group.entries.length > 0);
	}, [shown, filter, query, order, snapshot.runs]);

	// The groups as one flat list of headers and rows, for the virtualiser.
	const lines = useMemo(() => groups.flatMap((group): Line[] => [
		{ kind: "group", group },
		...(group.id === "done" && !showDone ? [] : group.entries.flatMap((entry): Line[] => [{ kind: "item", item: entry.item }, ...entry.children.map((pull): Line => ({ kind: "item", item: pull, child: true }))])),
	]), [groups, showDone]);
	const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
	const virtualizer = useVirtualizer({
		count: lines.length,
		getScrollElement: () => viewport,
		estimateSize: (index) => (lines[index]?.kind === "group" ? (index === 0 ? 28 : 36) : 54),
		getItemKey: (index) => {
			const line = lines[index]!;
			return line.kind === "group" ? `group:${line.group.id}` : line.item.id;
		},
		overscan: 8,
	});

	const counts = { all: shown.length, issue: shown.filter((item) => item.kind === "issue").length, pull: shown.filter((item) => item.kind === "pull").length };
	// With every repository in one list, each row says which one it's from.
	const showRepo = !snapshot.settings.showRepo && snapshot.settings.repos.length > 1;
	const importing = snapshot.repos.filter((repo) => repo.importing && (!snapshot.settings.showRepo || repo.repo === snapshot.settings.showRepo));

	return <aside className={cn("relative flex flex-col bg-sidebar", fill ? "min-w-0 flex-1" : "shrink-0 border-r")} style={fill ? undefined : { width: list.width }}>
		{!fill && <div role="separator" aria-orientation="vertical" aria-label="Resize the work list" title="Drag to resize. Double-click to reset." onPointerDown={list.onPointerDown} onDoubleClick={list.reset} className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-ring active:after:bg-ring" />}
		<div className="flex items-center gap-1.5 p-3 pb-2">
			<label className="flex h-8 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:border-ring">
				<Search className="size-4 text-muted-foreground" />
				<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by title, number or label" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
			</label>
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" aria-label="Sort" title="Sort" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"><ArrowDownWideNarrow className="size-4" /></button>} />
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Sort</DropdownMenuLabel>
						{([["stage", "By stage", "Needs you first, then running, then the rest"], ["recent", "Most recent first", "New comments and updates at the top"]] as const).map(([value, label, detail]) => <DropdownMenuItem key={value} onClick={() => chooseOrder(value)}>
							<span className="min-w-0 flex-1">
								<span className="block">{label}</span>
								<span className="block text-2xs text-muted-foreground">{detail}</span>
							</span>
							{order === value ? <Check className="size-3.5" /> : <span className="size-3.5" />}
						</DropdownMenuItem>)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Tip label="New issue (Ctrl N)"><a href={href({ page: "new" })} aria-label="New issue" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"><Plus className="size-4" /></a></Tip>
		</div>
		<div className="flex gap-1 px-3 pb-2">
			{(["all", "issue", "pull"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs", filter === value ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
				{value === "all" ? "All" : value === "issue" ? "Issues" : "PRs"}
				<span className="text-muted-foreground tabular-nums">{counts[value]}</span>
			</button>)}
		</div>
		{importing.map((repo) => <ImportProgress key={repo.repo} status={repo} />)}
		<ScrollArea className="min-h-0 flex-1" viewportRef={setViewport}>
			{/* Only the rows in view are drawn, so a repository with thousands of issues scrolls as smoothly as one with ten. */}
			<div className="relative mx-2 mb-3" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((virtual) => {
					const line = lines[virtual.index]!;
					return <div key={virtual.key} data-index={virtual.index} ref={virtualizer.measureElement} className="absolute inset-x-0 top-0" style={{ transform: `translateY(${virtual.start}px)` }}>
						{line.kind === "group"
							? <GroupHeader group={line.group} first={virtual.index === 0} showDone={showDone} onToggle={() => setShowDone(!showDone)} />
							: <Row item={line.item} snapshot={snapshot} selected={line.item.id === selected} showRepo={showRepo} child={line.child} isNew={seen.isNew(line.item)} replies={seen.newComments(line.item)} />}
					</div>;
				})}
			</div>
			{groups.length === 0 && importing.length === 0 && snapshot.repos.length > 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{query ? "Nothing matches that filter." : "No open issues or pull requests."}</p>}
		</ScrollArea>
		<div className="flex items-center gap-2 border-t px-4 py-2.5 text-2xs text-muted-foreground">
			<Checked snapshot={snapshot} />
			<span className="flex-1" />
			<span className="shrink-0">{runningLabel(snapshot)}</span>
		</div>
	</aside>;
}


/** A repository being read in full, with how far it has got. */
function ImportProgress({ status }: { status: RepoStatus }) {
	const { done = 0, total = 0 } = status.importing ?? {};
	return <div className="mx-3 mb-2 rounded-md border bg-background px-3 py-2">
		<div className="flex items-baseline justify-between gap-2 text-xs">
			<span className="truncate font-medium">Importing {status.repo}</span>
			<span className="shrink-0 text-muted-foreground tabular-nums">{total ? `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : "Counting…"}</span>
		</div>
		<div className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-muted">
			<div className={cn("h-full bg-info transition-[width]", !done && "animate-pulse")} style={{ width: `${Math.max(4, total ? Math.min(100, (done / total) * 100) : 0)}%` }} />
		</div>
	</div>;
}

/** What the work page shows with nothing selected: a first repository to add, or why the list is empty. */
export function EmptyWork({ snapshot }: { snapshot: FactorySnapshot }) {
	if (snapshot.repos.length === 0) {
		return <div className="flex flex-1 items-start justify-center overflow-auto px-8 pt-24">
			<div className="w-full max-w-[560px]">
				<h1 className="text-[26px] font-bold tracking-tight">Add a repository</h1>
				<p className="mt-2 text-sm text-muted-foreground">Factory reads every open issue and pull request with the GitHub CLI, then keeps up with changes. Agents work in a local clone; Factory looks for yours, or type owner/name to just read the repository for now. You can add as many as you like.</p>
				<AddRepo className="mt-6" />
			</div>
		</div>;
	}
	const importing = snapshot.repos.some((repo) => repo.importing);
	return <div className="grid flex-1 place-items-center text-sm text-muted-foreground">{importing ? "Reading open issues and pull requests…" : "No open issues or pull requests here."}</div>;
}
