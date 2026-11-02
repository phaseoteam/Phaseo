"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type MouseEvent } from "react";
import { BookmarkPlus, Columns3, ExternalLink, GitPullRequest, List, ListTree, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { listWorkItems } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
	EMPTY_FILTERS,
	INBOX_TABS,
	activeFilterCount,
	belongsToTab,
	collectLabels,
	filterItems,
	isWorkItemSource,
	isWorkItemState,
	listCursorReducer,
	listKeyCommand,
	mergeItems,
	type InboxFilters,
	type InboxQuery,
	type InboxTab,
} from "@/lib/work/inbox";
import { EMPTY_SELECTION, isSelected, selectionReducer } from "@/lib/work/selection";
import { slaStatus } from "@/lib/work/sla";
import { filtersToView, viewToFilters } from "@/lib/work/views";
import { WORK_AGENTS, WORK_ITEM_SOURCES, WORK_ITEM_STATES, WORK_PRIORITIES, type WorkCycle, type WorkItem, type WorkMember, type WorkProject, type WorkView, type WorkViewLayout } from "@/lib/work/types";
import { BulkBar } from "./BulkBar";
import { CreateItemDialog } from "./CreateItemDialog";
import { useWorkAction } from "./useWorkAction";
import { WorkBoard } from "./WorkBoard";
import { AssigneeLabel, PriorityIcon, SlaBadge, SourceIcon, StateIcon, TimeAgo, memberName, useWorkCopy } from "./WorkBits";
import { FilterSelect } from "./WorkSelects";
import { SaveViewDialog, ViewsSidebar } from "./WorkViews";

export type WorkInboxProps = {
	/** null when a saved view is open. */
	tab: InboxTab | null;
	items: WorkItem[];
	members: WorkMember[];
	userId: string | null;
	/** Set when the tab is one query with more pages. */
	more: { query: InboxQuery; cursor: string } | null;
	layout?: WorkViewLayout;
	views?: WorkView[];
	view?: WorkView | null;
	projects?: WorkProject[];
	cycles?: WorkCycle[];
};

export function WorkInbox({ tab, items: initialItems, members, userId, more: initialMore, layout = "list", views = [], view = null, projects = [], cycles = [] }: WorkInboxProps) {
	const t = useTranslations("Work.inbox");
	const tItem = useTranslations("Work.item");
	const tViews = useTranslations("Work.views");
	const tPeople = useTranslations("Work.people");
	const copy = useWorkCopy();
	const router = useRouter();
	const pathname = usePathname();
	const { perform, busy } = useWorkAction();
	const [extra, setExtra] = useState<{ items: WorkItem[]; more: WorkInboxProps["more"] }>({ items: [], more: null });
	const [filters, setFilters] = useState<InboxFilters>(() => (view ? viewToFilters(view.filters) : EMPTY_FILTERS));
	const [createOpen, setCreateOpen] = useState(false);
	const [saveOpen, setSaveOpen] = useState(false);
	const [cursor, dispatch] = useReducer(listCursorReducer, { index: -1 });
	const [selection, select] = useReducer(selectionReducer, EMPTY_SELECTION);
	const rows = useRef(new Map<number, HTMLAnchorElement>());

	// New server data replaces pages loaded with "Show more"; a different view resets the filters.
	const [seenItems, setSeenItems] = useState(initialItems);
	if (seenItems !== initialItems) {
		setSeenItems(initialItems);
		setExtra({ items: [], more: null });
	}
	const [seenView, setSeenView] = useState(view?.id ?? null);
	if (seenView !== (view?.id ?? null)) {
		setSeenView(view?.id ?? null);
		setFilters(view ? viewToFilters(view.filters) : EMPTY_FILTERS);
	}
	const more = extra.more ?? (extra.items.length ? null : initialMore);
	const items = useMemo(() => {
		const merged = mergeItems([initialItems, extra.items]);
		return tab ? merged.filter((item) => belongsToTab(tab, item, userId)) : merged;
	}, [initialItems, extra.items, tab, userId]);
	const visible = useMemo(() => filterItems(items, filters), [items, filters]);
	const labels = useMemo(() => collectLabels(items), [items]);
	const filtered = activeFilterCount(filters) > 0;
	const order = useMemo(() => visible.map((item) => item.number), [visible]);

	useEffect(() => { select({ type: "prune", order }); }, [order]);

	const selectedIndex = Math.min(cursor.index, visible.length - 1);
	const board = layout === "board";

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (createOpen || saveOpen || event.defaultPrevented) return;
			const command = listKeyCommand({ key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, target: event.target as HTMLElement | null });
			if (!command) return;
			// Leave keys alone while a menu, select or dialog has focus.
			if ((event.target as HTMLElement | null)?.closest?.("[role=listbox],[role=menu],[role=dialog],[role=toolbar]")) return;
			if (command === "create") {
				event.preventDefault();
				setCreateOpen(true);
			} else if (board) {
				return;
			} else if (command === "next" || command === "previous") {
				event.preventDefault();
				dispatch({ type: command, count: visible.length });
			} else if (command === "select" && selectedIndex >= 0 && visible[selectedIndex]) {
				event.preventDefault();
				select({ type: "toggle", number: visible[selectedIndex].number });
			} else if (command === "open" && selectedIndex >= 0 && visible[selectedIndex]) {
				event.preventDefault();
				router.push(`/work/${visible[selectedIndex].number}`);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [board, createOpen, saveOpen, selectedIndex, router, visible]);

	useEffect(() => {
		const item = visible[selectedIndex];
		if (item) rows.current.get(item.number)?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex, visible]);

	const loadMore = async () => {
		if (!more) return;
		const result = await perform("more", () => listWorkItems(more.query, more.cursor), { refresh: false });
		if (result.ok) setExtra((current) => ({ items: [...current.items, ...result.items], more: result.nextCursor ? { query: more.query, cursor: result.nextCursor } : null }));
	};

	const setLayout = (next: WorkViewLayout) => {
		if (next === layout) return;
		const search = new URLSearchParams();
		if (view) search.set("view", view.id);
		else if (tab && tab !== "triage") search.set("tab", tab);
		if (next === "board") search.set("layout", "board");
		else if (view?.layout === "board") search.set("layout", "list");
		const query = search.toString();
		router.replace(query ? `${pathname}?${query}` : pathname);
	};

	const onRowCheck = (number: number, event: MouseEvent) => {
		if (event.shiftKey) select({ type: "range", number, order });
		else select({ type: "toggle", number });
	};

	const assigneeOptions = [
		{ value: "none", label: tPeople("unassigned") },
		...WORK_AGENTS.map((agent) => ({ value: `agent:${agent}`, label: copy.agent(agent) })),
		...members.map((member) => ({ value: `user:${member.userId}`, label: memberName(member) ?? tPeople("unknown") })),
	];

	return (
		<div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
			<aside className="hidden lg:block">
				<ViewsSidebar views={views} userId={userId} activeViewId={view?.id ?? null} />
			</aside>
			<div className="min-w-0 space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					{view ? (
						<h2 className="text-base font-semibold">{view.name}</h2>
					) : (
						<nav aria-label={t("title")} className="flex flex-wrap gap-1">
							{INBOX_TABS.map((name) => (
								<Link
									key={name}
									href={name === "triage" ? "/work" : `/work?tab=${name}`}
									aria-current={name === tab ? "page" : undefined}
									className={cn("rounded-md px-2.5 py-1 text-sm transition-colors", name === tab ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
								>
									{t(`tabs.${name}`)}
								</Link>
							))}
						</nav>
					)}
					<div className="flex items-center gap-2">
						<div role="group" aria-label={t("layout")} className="flex rounded-md border p-0.5">
							<Button type="button" variant={board ? "ghost" : "secondary"} size="icon-xs" aria-label={tViews("layoutList")} aria-pressed={!board} title={tViews("layoutList")} onClick={() => setLayout("list")}><List aria-hidden="true" /></Button>
							<Button type="button" variant={board ? "secondary" : "ghost"} size="icon-xs" aria-label={tViews("layoutBoard")} aria-pressed={board} title={tViews("layoutBoard")} onClick={() => setLayout("board")}><Columns3 aria-hidden="true" /></Button>
						</div>
						<Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
							<Plus aria-hidden="true" />
							{t("newItem")}
							<Kbd className="ml-1 rounded-md">C</Kbd>
						</Button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-56 flex-1 sm:max-w-xs">
						<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
						<Input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder={t("search")} aria-label={t("search")} className="h-8 rounded-md pl-8 text-sm" />
					</div>
					<FilterSelect size="sm" label={tItem("state")} allLabel={t("allStates")} value={filters.state} onChange={(value) => setFilters({ ...filters, state: isWorkItemState(value) ? value : "all" })}
						options={WORK_ITEM_STATES.map((state) => ({ value: state, label: <><StateIcon state={state} />{copy.state(state)}</> }))} />
					<FilterSelect size="sm" label={tItem("priority")} allLabel={t("allPriorities")} value={filters.priority ?? "all"} onChange={(value) => setFilters({ ...filters, priority: value })}
						options={WORK_PRIORITIES.map((priority) => ({ value: String(priority), label: <><PriorityIcon priority={priority} />{copy.priority(priority)}</> }))} />
					<FilterSelect size="sm" label={tItem("source")} allLabel={t("allSources")} value={filters.source} onChange={(value) => setFilters({ ...filters, source: isWorkItemSource(value) ? value : "all" })}
						options={WORK_ITEM_SOURCES.map((source) => ({ value: source, label: <><SourceIcon source={source} />{copy.source(source)}</> }))} />
					<FilterSelect size="sm" label={tItem("assignee")} allLabel={t("anyone")} value={filters.assignee} onChange={(value) => setFilters({ ...filters, assignee: value })} options={assigneeOptions} />
					{labels.length ? <FilterSelect size="sm" label={tItem("labels")} allLabel={t("allLabels")} value={filters.label} onChange={(value) => setFilters({ ...filters, label: value })} options={labels.map((label) => ({ value: label, label }))} /> : null}
					{projects.length ? <FilterSelect size="sm" label={tItem("project")} allLabel={t("allProjects")} value={filters.project ?? "all"} onChange={(value) => setFilters({ ...filters, project: value })} options={projects.map((project) => ({ value: project.id, label: project.name }))} /> : null}
					{cycles.length ? <FilterSelect size="sm" label={tItem("cycle")} allLabel={t("allCycles")} value={filters.cycle ?? "all"} onChange={(value) => setFilters({ ...filters, cycle: value })} options={cycles.map((cycle) => ({ value: cycle.id, label: cycle.name || tItem("cycleNumber", { number: cycle.number }) }))} /> : null}
					{filtered ? (
						<Button type="button" variant="ghost" size="sm" onClick={() => setFilters(view ? viewToFilters(view.filters) : EMPTY_FILTERS)}>
							<X aria-hidden="true" />
							{view ? t("resetFilters") : t("clearFilters")}
						</Button>
					) : null}
					<Button type="button" variant="ghost" size="sm" onClick={() => setSaveOpen(true)}>
						<BookmarkPlus aria-hidden="true" />
						{tViews("saveAsView")}
					</Button>
				</div>

				{visible.length ? (
					board ? <WorkBoard items={visible} members={members} /> : (
						<ul aria-label={t("listLabel")} className="divide-y rounded-md border">
							{visible.map((item, index) => (
								<InboxRow
									key={item.id}
									item={item}
									members={members}
									selected={index === selectedIndex}
									checked={isSelected(selection, item.number)}
									onCheck={(event) => onRowCheck(item.number, event)}
									rowRef={(node) => { if (node) rows.current.set(item.number, node); else rows.current.delete(item.number); }}
									onFocus={() => dispatch({ type: "set", index, count: visible.length })}
								/>
							))}
						</ul>
					)
				) : (
					<p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{filtered || !tab ? t("emptyFiltered") : t(`empty.${tab}`)}</p>
				)}

				<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
					<span>{t("count", { count: visible.length })}</span>
					<span className="hidden sm:inline">{board ? t("boardShortcuts") : t("shortcutsBulk")}</span>
					{more ? <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={loadMore}>{t("showMore")}</Button> : null}
				</div>

				{/* On small screens the views list sits under the items. */}
				<div className="border-t pt-3 lg:hidden"><ViewsSidebar views={views} userId={userId} activeViewId={view?.id ?? null} /></div>

				{selection.numbers.length && !board ? (
					<BulkBar numbers={selection.numbers} members={members} projects={projects} cycles={cycles} onClear={() => select({ type: "clear" })} />
				) : null}

				<CreateItemDialog open={createOpen} onOpenChange={setCreateOpen} members={members} projects={projects} cycles={cycles} />
				<SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} filters={filtersToView(filters)} layout={layout} />
			</div>
		</div>
	);
}

function InboxRow({ item, members, selected, checked, onCheck, rowRef, onFocus }: {
	item: WorkItem;
	members: WorkMember[];
	selected: boolean;
	checked: boolean;
	onCheck: (event: MouseEvent) => void;
	rowRef: (node: HTMLAnchorElement | null) => void;
	onFocus: () => void;
}) {
	const t = useTranslations("Work.inbox");
	const copy = useWorkCopy();
	const githubUrl = item.githubPrUrl ?? item.githubIssueUrl;
	const githubLabel = item.githubPrUrl ? t("pullRequest") : t("issue", { number: item.githubIssueNumber ?? "" });
	return (
		<li
			aria-current={selected ? "true" : undefined}
			className={cn("group relative flex min-h-10 items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40 has-[a:focus-visible]:bg-muted/60", selected && "bg-muted/60", checked && "bg-muted/50")}
		>
			{/* The checkbox sits above the row link; shift-click selects a range. */}
			<span className={cn("relative z-10 flex shrink-0", !checked && "opacity-40 group-hover:opacity-100 focus-within:opacity-100")}>
				<Checkbox
					checked={checked}
					aria-label={t("selectItem", { number: item.number })}
					onClick={(event) => { event.preventDefault(); onCheck(event); }}
				/>
			</span>
			<PriorityIcon priority={item.priority} label={copy.priority(item.priority)} />
			<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{item.number}</span>
			<StateIcon state={item.state} label={copy.state(item.state)} />
			{/* The title link covers the whole row; the GitHub link sits above it. */}
			<Link ref={rowRef} href={`/work/${item.number}`} onFocus={onFocus} className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0">
				{item.title}
			</Link>
			<SlaBadge status={slaStatus(item)} compact />
			{item.blockedByCount ? <span className="hidden shrink-0 text-[11px] text-amber-700 sm:inline dark:text-amber-300">{t("blocked")}</span> : null}
			{item.childCount ? <span className="hidden shrink-0 text-[11px] text-muted-foreground tabular-nums sm:inline" title={t("subItems", { count: item.childCount })} aria-label={t("subItems", { count: item.childCount })}><ListTree className="mr-0.5 inline size-3" aria-hidden="true" />{item.childCount}</span> : null}
			{item.labels.length ? (
				<span className="hidden max-w-[30%] shrink items-center gap-1 overflow-hidden md:flex">
					{item.labels.slice(0, 3).map((label) => <span key={label} className="truncate rounded-md border px-1.5 py-px text-[11px] text-muted-foreground">{label}</span>)}
					{item.labels.length > 3 ? <span className="text-[11px] text-muted-foreground">+{item.labels.length - 3}</span> : null}
				</span>
			) : null}
			<SourceIcon source={item.source} label={copy.source(item.source)} className="hidden sm:block" />
			{githubUrl ? (
				<a href={githubUrl} target="_blank" rel="noreferrer" title={githubLabel} aria-label={githubLabel} className="relative z-10 hidden shrink-0 rounded-md text-muted-foreground hover:text-foreground sm:block">
					{item.githubPrUrl ? <GitPullRequest className="size-3.5" aria-hidden="true" /> : <ExternalLink className="size-3.5" aria-hidden="true" />}
				</a>
			) : <span className="hidden w-3.5 shrink-0 sm:block" />}
			<span className="hidden w-36 shrink-0 lg:block"><AssigneeLabel agent={item.assigneeAgent} userId={item.assigneeUserId} members={members} /></span>
			<span className="shrink-0 lg:hidden"><AssigneeLabel agent={item.assigneeAgent} userId={item.assigneeUserId} members={members} compact /></span>
			<TimeAgo value={item.updatedAt} className="w-24 shrink-0 text-right text-xs text-muted-foreground" />
		</li>
	);
}
