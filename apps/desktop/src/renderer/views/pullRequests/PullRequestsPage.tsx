import { formatAgoShort } from "@phaseo/app-kit/format";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowDownUp, CalendarArrowDown, CalendarArrowUp, ChevronDown, CircleCheck, CircleDashed, CircleSlash, CircleX, Clock, EyeOff, Eye, FolderGit2, Layers, ListChecks, ListFilter, Maximize2, Minimize2, PenLine, Plus, RefreshCw, Search, Tag, UserLock, UserRound, Users, X } from "lucide-react";
import { pullRequestPageSize, maximumPullRequestPageSize, type PullRequestDirectoryEntry, type PullRequestDirectoryQuery, type PullRequestDirectoryResult, type PullRequestInvolvement, type PullRequestListFilters, type PullRequestListState } from "../../../shared/pullRequestDirectory";
import { errorText, useWorkspace } from "../../app/workspace";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../components/ui/input-group";
import { ScrollArea } from "../../components/ui/scroll-area";
import { TooltipProvider } from "../../components/ui/tooltip";
import { useCommand } from "../../lib/keybindings";
import { useBackgroundRefresh } from "../../lib/useBackgroundRefresh";
import { cn } from "../../lib/utils";
import { ActorAvatar, ChecksGlyph, DiffStat, PullRequestGlyph, PullRequestListGhost, PullRequestRowGlyph, ReviewDecisionGlyph, Tip } from "./presentation";
import { PullRequestNumberMenu } from "./PullRequestNumberMenu";
import { PullRequestSurface } from "./PullRequestSurface";
import { summaryChecksRollup } from "./pullRequestLogic";
import { useMergeMethodResolver } from "./mergeMethod";
import { activeFilterCount, applyPullRequestOverrides, collectPullRequestFacets, filterPullRequestsByInvolvement, groupPullRequestsByInvolvement, matchedElsewhereScore, matchesPullRequestFilters, matchesPullRequestQuery, menuFilters, narrowPullRequests, parsePullRequestQuery, pullRequestEntryKey, pullRequestLabelColor, pullRequestOverrideAfterAction, pullRequestQuickActions, rankPullRequestMatches, readPullRequestListPreferences, scorePullRequestMatch, settlePullRequestOverrides, sortPullRequestGroups, sweepKeys, writePullRequestListPreferences, type PullRequestAuthorFacet, type PullRequestGroupKey, type PullRequestLabelFacet, type PullRequestListPreferences, type PullRequestListSort, type PullRequestOverride, type PullRequestQuickAction } from "./pullRequestDirectory.logic";

type Option<Value extends string> = { value: Value; label: string; Icon: ComponentType<{ className?: string }>; unavailable?: string };
const stateOptions: Option<PullRequestListState>[] = [{ value: "all", label: "All", Icon: Layers }, { value: "open", label: "Open", Icon: PullRequestGlyph.pullRequest }, { value: "closed", label: "Closed", Icon: PullRequestGlyph.closed }, { value: "merged", label: "Merged", Icon: PullRequestGlyph.merged }];
const involvementOptions: Option<PullRequestInvolvement>[] = [{ value: "all", label: "All", Icon: Layers }, { value: "reviewing", label: "Reviewing", Icon: Eye }, { value: "authored", label: "Authored", Icon: PenLine }];
const sortOptions: Option<PullRequestListSort>[] = [{ value: "ready", label: "Merge readiness", Icon: ListChecks }, { value: "blocked", label: "Blocked on me", Icon: UserLock }, { value: "updated", label: "Recently updated", Icon: Clock }, { value: "newest", label: "Newest shown", Icon: CalendarArrowDown }, { value: "oldest", label: "Oldest shown", Icon: CalendarArrowUp }, { value: "largest", label: "Largest shown", Icon: Maximize2 }, { value: "smallest", label: "Smallest shown", Icon: Minimize2 }];
const draftOptions: Option<string>[] = [{ value: "all", label: "All", Icon: Layers }, { value: "only", label: "Drafts only", Icon: PullRequestGlyph.draft }, { value: "hide", label: "Hide drafts", Icon: EyeOff }];
const reviewOptions: Option<string>[] = [{ value: "all", label: "All", Icon: Layers }, { value: "approved", label: "Approved", Icon: CircleCheck }, { value: "changes-requested", label: "Changes requested", Icon: CircleX }, { value: "review-required", label: "Review required", Icon: CircleDashed }, { value: "none", label: "No reviews", Icon: CircleSlash }];
const checksOptions: Option<string>[] = [{ value: "all", label: "All", Icon: Layers }, { value: "passing", label: "Passing", Icon: CircleCheck }, { value: "failing", label: "Failing", Icon: CircleX }];
const groupIcons: Record<PullRequestGroupKey, ComponentType<{ className?: string }>> = { authored: PenLine, reviewRequested: Eye, others: Users };
const quickActionLabels: Record<PullRequestQuickAction, { label: string; Icon: ComponentType<{ className?: string }> }> = { close: { label: "Close", Icon: PullRequestGlyph.closed }, merge: { label: "Merge", Icon: PullRequestGlyph.merged }, ready: { label: "Ready for review", Icon: PullRequestGlyph.pullRequest }, reopen: { label: "Reopen", Icon: PullRequestGlyph.reopen } };
/** Long enough that a keystroke does not become a request, short enough to feel answered. */
const searchDebounceMs = 250;
const truncate = (value: string) => value.length > 48 ? `${value.slice(0, 48)}…` : value;

function useDebounced<T>(value: T, delay: number) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
	return debounced;
}

/** Shift held on its own turns on the rows' quick actions (speed mode); this tracks a modifier, it binds no command. */
function useShiftHeld() {
	const [held, setHeld] = useState(false);
	useEffect(() => {
		const update = (event: KeyboardEvent) => setHeld(event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey);
		const clear = () => setHeld(false);
		window.addEventListener("keydown", update); window.addEventListener("keyup", update); window.addEventListener("blur", clear);
		return () => { window.removeEventListener("keydown", update); window.removeEventListener("keyup", update); window.removeEventListener("blur", clear); };
	}, []);
	return held;
}

/** Answers kept for the session, so coming back to the page draws the last list at once while it reads again. */
const answers = new Map<string, PullRequestDirectoryResult>();
function useDirectory(request: PullRequestDirectoryQuery) {
	const api = window.phaseoDesktop?.workspace;
	const key = JSON.stringify(request);
	const [state, setState] = useState<{ key: string; data?: PullRequestDirectoryResult; error?: string; loading: boolean }>(() => ({ key, data: answers.get(key), loading: true }));
	const generation = useRef(0);
	const load = useCallback(async () => {
		if (!api) { setState(current => ({ ...current, key, loading: false, error: "Open the desktop app to see pull requests." })); return; }
		const current = ++generation.current;
		setState(previous => ({ key, data: answers.get(key) ?? previous.data, loading: true, error: undefined }));
		try { const data = await api.pullRequestDirectory(JSON.parse(key) as PullRequestDirectoryQuery); answers.set(key, data); if (current === generation.current) setState({ key, data, loading: false }); }
		catch (reason) { if (current === generation.current) setState(previous => ({ ...previous, key, loading: false, error: errorText(reason) })); }
	}, [api, key]);
	useEffect(() => { void load(); }, [load]);
	// Rows from another question stay up while this one is answered: narrowed locally, never blanked.
	const carried = state.key !== key || (state.loading && !answers.has(key));
	return { data: state.data, error: state.key === key ? state.error : undefined, loading: state.loading || state.key !== key, carried, refresh: load };
}

function LabelChip({ label, className, children }: { label: { name: string; color?: string }; className?: string; children?: ReactNode }) {
	const color = pullRequestLabelColor(label.color);
	return <span className={cn("inline-flex h-4 max-w-40 min-w-0 shrink items-center gap-1 rounded px-1 text-[10px] leading-none font-medium", !color && "bg-secondary text-secondary-foreground", className)} style={color ? { background: `color-mix(in srgb, ${color} 18%, transparent)`, color: `color-mix(in srgb, ${color} 40%, var(--foreground))` } : undefined}><span className="truncate">{label.name}</span>{children}</span>;
}
/** One label on a narrow row and a "+N"; up to three as the meta line widens. */
function RowLabels({ labels }: { labels: PullRequestDirectoryEntry["labels"] }) {
	const overflow = ["@xl/pr-row-meta:hidden", "@3xl/pr-row-meta:hidden", ""];
	return <span className="flex min-w-0 items-center gap-1">{labels.slice(0, 3).map((label, index) => {
		const remaining = labels.length - index - 1;
		return <LabelChip key={label.name} label={label} className={index === 1 ? "hidden @xl/pr-row-meta:inline-flex" : index === 2 ? "hidden @3xl/pr-row-meta:inline-flex" : ""}>{remaining > 0 && <span className={cn("shrink-0", overflow[index])}>+{remaining}</span>}</LabelChip>;
	})}</span>;
}

type RowProps = { entry: PullRequestDirectoryEntry; selected: boolean; matchedElsewhere: boolean; speedMode: boolean; busy: boolean; sweeping: boolean; onSelect: (entry: PullRequestDirectoryEntry) => void; onAction: (entry: PullRequestDirectoryEntry, action: PullRequestQuickAction) => void; onSweepStart: (entry: PullRequestDirectoryEntry, event: React.PointerEvent) => void; onNotice: (message: string, failed?: boolean) => void };
/** A page row: status column, number and title over author, repository and labels, quick actions outside the button. */
const PageRow = memo(function PageRow({ entry, selected, matchedElsewhere, speedMode, busy, sweeping, onSelect, onAction, onSweepStart, onNotice }: RowProps) {
	const rollup = entry.state === "open" ? summaryChecksRollup(entry.checks) : null, actions = pullRequestQuickActions(entry), key = pullRequestEntryKey(entry);
	return <div data-pull-request-key={key} className={cn("flex items-center rounded-md [contain-intrinsic-block-size:56px] [content-visibility:auto]", selected ? "bg-accent" : "hover:bg-accent/60", sweeping && "bg-destructive/10")}>
		<button type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelect(entry)} className="group/pr-row flex w-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
			<span className="mt-0.75 self-start"><PullRequestRowGlyph state={entry.state} draft={entry.draft} mergeable={entry.mergeable} base={entry.base} /></span>
			<span className="min-w-0 flex-1">
				<span className="flex min-w-0 items-center gap-1.5">
					<PullRequestNumberMenu url={entry.url} onNotice={onNotice}><span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{entry.number}</span></PullRequestNumberMenu>
					<span className="min-w-0 truncate text-sm">{entry.title}</span>
					<span className="flex shrink-0 items-center gap-1 text-2xs">{rollup && <ChecksGlyph rollup={rollup} />}<ReviewDecisionGlyph decision={entry.review} /></span>
					<span className="ml-auto flex shrink-0 items-center gap-1.5 text-2xs"><DiffStat additions={entry.additions} deletions={entry.deletions} className="font-mono" /></span>
				</span>
				<span className="@container/pr-row-meta flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground">
					{matchedElsewhere && <Tip label="Matched in the description"><span className="flex min-w-6 items-center gap-1 overflow-hidden rounded-full border border-border/60 px-1 text-[10px]"><span className="sr-only">matched in the description</span><Search aria-hidden className="size-3 shrink-0" /><span aria-hidden className="hidden truncate @xs/pr-row-meta:block">matched in the description</span></span></Tip>}
					<Tip label={entry.author?.login ?? "ghost"}><span className="inline-flex max-w-40 min-w-3.5 items-center gap-1"><ActorAvatar actor={entry.author} className="size-3.5" /><span className="sr-only @xs/pr-row-meta:not-sr-only @xs/pr-row-meta:truncate">{entry.author?.login ?? "ghost"}</span></span></Tip>
					<span className="truncate">{entry.repository}</span>
					{entry.labels.length > 0 && <RowLabels labels={entry.labels} />}
					<span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{formatAgoShort(entry.updatedAt)}</span>
				</span>
			</span>
		</button>
		{actions.length > 0 && <div role="group" aria-label={`Quick actions for pull request #${entry.number}`} data-pull-request-action-pending={busy || undefined} className="shrink-0 items-center gap-1 pr-3" style={{ display: speedMode || busy || sweeping ? "flex" : "none" }}>
			{actions.map(action => { const { label, Icon } = quickActionLabels[action]; return <Tip key={action} label={action === "close" ? "Close immediately, or drag across rows to close several" : `${label} immediately`}>
				<Button size="xs" variant={action === "close" ? "destructive" : "outline"} disabled={busy} aria-label={`${label} #${entry.number}`} onClick={() => onAction(entry, action)} onPointerDown={event => { if (action === "close" && event.isPrimary && event.button === 0) onSweepStart(entry, event); }}>
					{busy ? <RefreshCw aria-hidden className="size-3 animate-spin" /> : <Icon aria-hidden className="size-3" />}{label}
				</Button>
			</Tip>; })}
		</div>}
	</div>;
});

function GroupHeader({ groupKey, label, count }: { groupKey: PullRequestGroupKey; label: string; count: number }) {
	const Icon = groupIcons[groupKey];
	return <div className="flex items-center gap-2 px-3 pb-1 text-xs font-medium text-muted-foreground/70"><Icon aria-hidden className="size-3.5 shrink-0" /><h2 className="shrink-0">{label}</h2><span className="shrink-0 text-muted-foreground/50 tabular-nums">{count}</span><span aria-hidden className="h-px min-w-2 flex-1 bg-border/60" /></div>;
}

/** The empty page's own drawing: a branch leaving the base line and stopping short of rejoining it. */
function BranchMark() {
	return <svg aria-hidden viewBox="0 0 120 72" className="h-20 w-32 text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
		<path d="M10 58h100" className="text-muted-foreground/30" stroke="currentColor" />
		<circle cx="10" cy="58" r="5" fill="currentColor" fillOpacity={0.25} /><circle cx="110" cy="58" r="5" fill="currentColor" fillOpacity={0.25} />
		<path d="M30 58c0-18 8-26 24-26h4" /><path d="M90 58c0-18-8-26-24-26h-4" strokeDasharray="2 7" className="text-muted-foreground/50" />
		<circle cx="60" cy="32" r={4} fill="none" className="text-muted-foreground/45" />
	</svg>;
}
function Empty({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
	return <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center"><BranchMark /><div className="space-y-1"><p className="text-sm font-medium">{title}</p><p className="mx-auto max-w-80 text-xs text-muted-foreground">{description}</p></div>{children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}</div>;
}
function CheckAgain({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
	return <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}><RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />{refreshing ? "Checking..." : "Check again"}</Button>;
}

function OptionIcon<Value extends string>({ option }: { option: Option<Value> }) { return <option.Icon aria-hidden className="size-3.5" />; }
function RadioOptions<Value extends string>({ label, value, options, onChange }: { label?: string; value: Value; options: Option<Value>[]; onChange: (value: Value) => void }) {
	return <DropdownMenuRadioGroup value={value} onValueChange={next => { if (next !== value) onChange(next as Value); }}>
		{label && <DropdownMenuLabel>{label}</DropdownMenuLabel>}
		{options.map(option => {
			const item = <DropdownMenuRadioItem key={option.value} value={option.value} disabled={option.unavailable !== undefined} className={cn("text-xs", option.unavailable && "data-disabled:pointer-events-auto")}><span className="flex min-w-0 items-center gap-2"><OptionIcon option={option} /><span className="min-w-0 flex-1 truncate">{option.label}</span>{option.unavailable && <span className="shrink-0 text-muted-foreground">· Unavailable</span>}</span></DropdownMenuRadioItem>;
			return option.unavailable ? <Tip key={option.value} label={option.unavailable}>{item}</Tip> : item;
		})}
	</DropdownMenuRadioGroup>;
}
function RadioSubmenu<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: Option<Value>[]; onChange: (value: Value) => void }) {
	const current = options.find(option => option.value === value) ?? options[0];
	return <DropdownMenuSub>
		<DropdownMenuSubTrigger className="text-xs"><OptionIcon option={current} /><span className="flex-1">{label}</span><span className="max-w-32 min-w-0 truncate text-xs text-muted-foreground">{current.label}</span></DropdownMenuSubTrigger>
		<DropdownMenuSubContent className="min-w-48"><RadioOptions label={label} value={value} options={options} onChange={onChange} /></DropdownMenuSubContent>
	</DropdownMenuSub>;
}

function AuthorFilter({ value, options, onChange }: { value?: string; options: PullRequestAuthorFacet[]; onChange: (author?: string) => void }) {
	const [query, setQuery] = useState(""), needle = query.trim().toLowerCase(), login = value?.toLowerCase() ?? "";
	const selected = options.find(option => option.login.toLowerCase() === login);
	const visible = [...selected ? [selected] : [], ...options.filter(option => option !== selected && (!needle || option.login.toLowerCase().includes(needle)))].slice(0, 10);
	return <DropdownMenuSub>
		<DropdownMenuSubTrigger className="text-xs"><UserRound className="size-3.5" /><span className="flex-1">Author</span><span className="max-w-32 min-w-0 truncate text-xs text-muted-foreground">{value ?? "Anyone"}</span></DropdownMenuSubTrigger>
		<DropdownMenuSubContent className="min-w-56">
			<div className="p-1 pb-2"><InputGroup className="h-7"><InputGroupAddon><Search className="size-3.5" /></InputGroupAddon><InputGroupInput autoFocus value={query} onChange={event => setQuery(event.currentTarget.value)} onKeyDown={event => { if (event.key !== "ArrowDown" && event.key !== "Escape") event.stopPropagation(); }} placeholder="Search authors" aria-label="Search authors" className="text-xs" /></InputGroup></div>
			<DropdownMenuRadioGroup value={selected?.login ?? value ?? ""} onValueChange={next => { if (String(next).toLowerCase() !== login) onChange(next ? String(next) : undefined); }}>
				<DropdownMenuRadioItem value="" className="text-xs"><span className="flex min-w-0 items-center gap-2"><Layers className="size-3.5" />Anyone</span></DropdownMenuRadioItem>
				{visible.map(option => <DropdownMenuRadioItem key={option.login.toLowerCase()} value={option.login} className="text-xs"><span className="flex min-w-0 items-center gap-2"><ActorAvatar actor={{ login: option.login, ...(option.avatarUrl ? { avatarUrl: option.avatarUrl } : {}) }} className="size-3.5" /><span className="min-w-0 flex-1 truncate">{option.login}</span><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{option.mergedCount} merges loaded</span></span></DropdownMenuRadioItem>)}
				{!visible.length && <DropdownMenuItem disabled className="text-xs">No authors found</DropdownMenuItem>}
			</DropdownMenuRadioGroup>
		</DropdownMenuSubContent>
	</DropdownMenuSub>;
}
function LabelFilter({ value, options, onChange }: { value: string[]; options: PullRequestLabelFacet[]; onChange: (labels: string[]) => void }) {
	const selected = new Set(value.map(name => name.toLowerCase()));
	const visible: PullRequestLabelFacet[] = [...value.filter(name => !options.some(option => option.name.toLowerCase() === name.toLowerCase())).map(name => ({ name, count: 0 })), ...options];
	return <DropdownMenuSub>
		<DropdownMenuSubTrigger className="text-xs"><Tag className="size-3.5" /><span className="flex-1">Labels</span><span className="text-xs text-muted-foreground">{value.length ? `${value.length} selected` : "Any"}</span></DropdownMenuSubTrigger>
		<DropdownMenuSubContent className="min-w-52">
			{!visible.length ? <DropdownMenuItem disabled className="text-xs">No labels in this view</DropdownMenuItem> : visible.map(option => {
				const color = pullRequestLabelColor(option.color);
				return <DropdownMenuCheckboxItem key={option.name.toLowerCase()} className="text-xs" checked={selected.has(option.name.toLowerCase())} onCheckedChange={next => onChange(next ? [...value, option.name].slice(0, 10) : value.filter(name => name.toLowerCase() !== option.name.toLowerCase()))}>
					<span className="flex min-w-0 items-center gap-2"><span aria-hidden className="size-2.5 shrink-0 rounded-full bg-muted-foreground" style={color ? { backgroundColor: color } : undefined} /><span className="min-w-0 flex-1 truncate">{option.name}</span><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{option.count}</span></span>
				</DropdownMenuCheckboxItem>;
			})}
		</DropdownMenuSubContent>
	</DropdownMenuSub>;
}

function FiltersMenu({ preferences, update, authors, labels, projects }: { preferences: PullRequestListPreferences; update: (patch: Partial<PullRequestListPreferences>) => void; authors: PullRequestAuthorFacet[]; labels: PullRequestLabelFacet[]; projects: Option<string>[] }) {
	const count = activeFilterCount(preferences);
	const scalar = (value: string) => value === "all" ? undefined : value;
	return <DropdownMenu>
		<DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label={count ? `Filters, ${count} on` : "Filters"} />}><ListFilter className="size-4" /><span>Filters</span>{count > 0 && <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>}</DropdownMenuTrigger>
		<DropdownMenuContent align="end" className="w-60">
			<RadioSubmenu label="State" value={preferences.state} options={stateOptions} onChange={state => update({ state })} />
			<RadioSubmenu label="Involvement" value={preferences.involvement} options={involvementOptions} onChange={involvement => update({ involvement })} />
			<DropdownMenuSeparator />
			<AuthorFilter value={preferences.author} options={authors} onChange={author => update({ author })} />
			<LabelFilter value={preferences.labels ?? []} options={labels} onChange={next => update({ labels: next.length ? next : undefined })} />
			<RadioSubmenu label="Draft" value={preferences.draft ?? "all"} options={draftOptions} onChange={draft => update({ draft: scalar(draft) as PullRequestListPreferences["draft"] })} />
			<RadioSubmenu label="Review" value={preferences.review ?? "all"} options={reviewOptions} onChange={review => update({ review: scalar(review) as PullRequestListPreferences["review"] })} />
			<RadioSubmenu label="Checks" value={preferences.checks ?? "all"} options={checksOptions} onChange={checks => update({ checks: scalar(checks) as PullRequestListPreferences["checks"] })} />
			<DropdownMenuSeparator />
			<RadioSubmenu label="Project" value={preferences.projectId ?? "all"} options={projects} onChange={projectId => update({ projectId: projectId === "all" ? undefined : projectId })} />
		</DropdownMenuContent>
	</DropdownMenu>;
}

/** A compact menu for one control: an outlined trigger with its own label, or a ghost one naming the current choice. */
function CompactMenu<Value extends string>({ label, value, options, onChange, trigger }: { label: string; value: Value; options: Option<Value>[]; onChange: (value: Value) => void; trigger?: ReactNode }) {
	const current = options.find(option => option.value === value) ?? options[0];
	return <DropdownMenu>
		<DropdownMenuTrigger aria-label={`${label}: ${current.label}`} render={trigger ? <Button variant="outline" size="sm" /> : <Button variant="ghost" size="xs" className="min-w-0 text-muted-foreground hover:text-foreground" />}>
			{trigger ?? <><span className="truncate">{current.label}</span><ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground/70" /></>}
		</DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="w-52"><RadioOptions value={value} options={options} onChange={onChange} /></DropdownMenuContent>
	</DropdownMenu>;
}

function SearchInput({ value, busy, onChange, inputRef, className }: { value: string; busy: boolean; onChange: (value: string) => void; inputRef?: React.Ref<HTMLInputElement>; className?: string }) {
	return <InputGroup className={cn("min-w-0 flex-1", className)}>
		<InputGroupAddon>{busy ? <RefreshCw aria-hidden className="size-3.5 animate-spin" /> : <Search aria-hidden className="size-3.5" />}</InputGroupAddon>
		<InputGroupInput ref={inputRef} type="search" value={value} onChange={event => onChange(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Escape" && value) { event.preventDefault(); event.stopPropagation(); onChange(""); } }} placeholder="Search pull requests, or label:bug" aria-label="Search pull requests" className="text-xs" />
	</InputGroup>;
}

/**
 * The Pull requests page: every project's pull requests in one list, grouped into
 * Authored, Review requested and Others, with search, filters and sorts that are remembered. A row opens its pull
 * request in a column beside the list; Shift shows quick actions, and dragging Close across rows closes several.
 */
export function PullRequestsPage() {
	const { api, overview, setOverview, setError } = useWorkspace();
	const [preferences, setPreferences] = useState(() => readPullRequestListPreferences());
	const update = useCallback((patch: Partial<PullRequestListPreferences>) => setPreferences(current => { const next = { ...current, ...patch }; for (const key of Object.keys(next) as (keyof PullRequestListPreferences)[]) if (next[key] === undefined) delete next[key]; writePullRequestListPreferences(next); return next; }), []);
	const [limit, setLimit] = useState(pullRequestPageSize);
	const [selected, setSelected] = useState<{ projectId: string; number: number }>();
	const [notice, setNotice] = useState<{ text: string; failed?: boolean }>();
	const [overrides, setOverrides] = useState<ReadonlyMap<string, PullRequestOverride>>(new Map());
	const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
	const [sweep, setSweep] = useState<ReadonlySet<string>>(new Set());
	const [condensed, setCondensed] = useState(false), [searchOpen, setSearchOpen] = useState(false);
	const speedMode = useShiftHeld();
	const resolveMergeMethod = useMergeMethodResolver();
	const viewportRef = useRef<HTMLDivElement>(null), markerRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), topSearchRef = useRef<HTMLInputElement>(null);
	const noticeTimer = useRef<number>(undefined);
	const say = useCallback((text: string, failed?: boolean) => { setNotice({ text, failed }); window.clearTimeout(noticeTimer.current); if (!failed) noticeTimer.current = window.setTimeout(() => setNotice(undefined), 2500); }, []);
	useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

	const projects = useMemo(() => overview.projects.filter(project => !project.worktree), [overview.projects]);
	const projectId = preferences.projectId && projects.some(project => project.id === preferences.projectId) ? preferences.projectId : undefined;
	const typedQuery = (preferences.q ?? "").trim();
	const sentQuery = useDebounced(typedQuery, searchDebounceMs);
	const typed = useMemo(() => parsePullRequestQuery(typedQuery), [typedQuery]), sent = useMemo(() => parsePullRequestQuery(sentQuery), [sentQuery]);
	const menu = useMemo(() => menuFilters(preferences), [preferences]);
	const request = useMemo((): PullRequestDirectoryQuery => ({ state: preferences.state, text: sent.text, filters: { ...menu, ...sent.filters }, ...(projectId ? { projectId } : {}), limit }), [preferences.state, sent, menu, projectId, limit]);
	const localFilters: PullRequestListFilters = useMemo(() => ({ ...menu, ...typed.filters }), [menu, typed.filters]);
	const directory = useDirectory(request);
	const { data } = directory;
	const scopeKey = JSON.stringify([preferences.state, sentQuery, menu, projectId]);
	useEffect(() => setLimit(pullRequestPageSize), [scopeKey]);
	useEffect(() => { if (!directory.loading && data) setOverrides(current => settlePullRequestOverrides(current, data.entries, Date.now())); }, [directory.loading, data]);
	useBackgroundRefresh(() => void directory.refresh());

	const viewer = data?.viewer, sort = preferences.sort ?? "ready";
	const settled = typedQuery === sentQuery && !directory.carried;
	const entries = useMemo(() => {
		const scoped = applyPullRequestOverrides(narrowPullRequests(data?.entries ?? [], { state: preferences.state, ...(projectId ? { projectId } : {}) }), overrides, preferences.state);
		const involved = filterPullRequestsByInvolvement(scoped, viewer, preferences.involvement);
		const narrowed = Object.keys(localFilters).length ? involved.filter(entry => matchesPullRequestFilters(entry, localFilters, viewer)) : involved;
		if (!typed.text) return narrowed.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
		// GitHub searched descriptions too: once its answer is in, its matches stand; until then the rows on screen are narrowed here.
		return rankPullRequestMatches(settled ? narrowed : narrowed.filter(entry => matchesPullRequestQuery(entry, typed.text)), typed.text);
	}, [data, preferences.state, preferences.involvement, projectId, overrides, viewer, localFilters, typed.text, settled]);
	const groups = useMemo(() => sortPullRequestGroups(preferences.involvement === "all" ? groupPullRequestsByInvolvement(entries, viewer) : [{ key: "others" as const, label: "", entries }], sort, typed.text, preferences.involvement), [entries, viewer, sort, typed.text, preferences.involvement]);
	const facets = useMemo(() => collectPullRequestFacets(data?.entries ?? [], preferences.state), [data, preferences.state]);
	const unavailable = useMemo(() => new Map((data?.errors ?? []).map(error => [error.projectId, error.message])), [data]);
	const projectOptions: Option<string>[] = useMemo(() => [{ value: "all", label: "All projects", Icon: Layers }, ...[...projects].sort((left, right) => Number(unavailable.has(left.id)) - Number(unavailable.has(right.id)) || left.name.localeCompare(right.name)).map(project => ({ value: project.id, label: project.name, Icon: FolderGit2, ...(unavailable.has(project.id) ? { unavailable: unavailable.get(project.id) } : {}) }))], [projects, unavailable]);

	// Condensed once the in-flow controls scroll away: the title becomes the scope itself, with a folded search.
	useEffect(() => {
		const marker = markerRef.current;
		if (!marker) return;
		const observer = new IntersectionObserver(([entry]) => setCondensed(entry ? !entry.isIntersecting : false), { root: viewportRef.current });
		observer.observe(marker);
		return () => observer.disconnect();
	}, []);
	useEffect(() => { if (!condensed) setSearchOpen(false); }, [condensed]);
	useEffect(() => { if (searchOpen) topSearchRef.current?.focus(); }, [searchOpen]);
	useCommand("pullRequests.focusSearch", () => {
		if (condensed) { setSearchOpen(true); requestAnimationFrame(() => { topSearchRef.current?.focus(); topSearchRef.current?.select(); }); return; }
		searchRef.current?.focus(); searchRef.current?.select();
	});

	const select = useCallback((entry: PullRequestDirectoryEntry) => setSelected({ projectId: entry.projectId, number: entry.number }), []);
	const run = useCallback(async (batch: PullRequestDirectoryEntry[], action: PullRequestQuickAction) => {
		if (!api || !batch.length) return;
		const keys = batch.map(pullRequestEntryKey);
		setPending(current => new Set([...current, ...keys]));
		setOverrides(current => new Map([...current, ...batch.map(entry => [pullRequestEntryKey(entry), pullRequestOverrideAfterAction(entry, action, new Date())] as const)]));
		const failures: string[] = [];
		await Promise.all(batch.map(async entry => {
			try {
				if (action === "merge") {
					const view = await api.pullRequestView(entry.projectId, entry.number);
					if (!view.mergeMethods.length) throw new Error("No merge method is available for this repository.");
					await api.pullRequestAction(entry.projectId, { number: entry.number, headOid: view.headOid, action: { type: "merge", method: resolveMergeMethod(entry.projectId, view.mergeMethods) } });
				} else await api.pullRequestAction(entry.projectId, { number: entry.number, headOid: entry.headOid, action: { type: action } });
			} catch (reason) {
				failures.push(`#${entry.number}: ${errorText(reason)}`);
				setOverrides(current => { const next = new Map(current); next.delete(pullRequestEntryKey(entry)); return next; });
			}
		}));
		setPending(current => { const next = new Set(current); for (const key of keys) next.delete(key); return next; });
		const verb = { close: "Closed", merge: "Merged", ready: "Marked ready", reopen: "Reopened" }[action];
		if (failures.length) say(`Could not ${quickActionLabels[action].label.toLowerCase()} ${failures.join("; ")}`, true);
		else say(batch.length === 1 ? `${verb} #${batch[0].number}` : `${verb} ${batch.length} pull requests`);
		void directory.refresh();
	}, [api, directory, resolveMergeMethod, say]);

	// Dragging from a Close button across rows closes every open row it passes in that group, on release.
	const suppressClick = useRef(false);
	const act = useCallback((entry: PullRequestDirectoryEntry, action: PullRequestQuickAction) => { if (suppressClick.current) { suppressClick.current = false; return; } void run([entry], action); }, [run]);
	const shown = useRef(groups); shown.current = groups;
	const pendingRef = useRef(pending); pendingRef.current = pending;
	const startSweep = useCallback((origin: PullRequestDirectoryEntry, event: React.PointerEvent) => {
		const originKey = pullRequestEntryKey(origin), startY = event.clientY;
		const group = shown.current.find(candidate => candidate.entries.some(entry => pullRequestEntryKey(entry) === originKey));
		if (!group) return;
		const byKey = new Map(group.entries.map(entry => [pullRequestEntryKey(entry), entry]));
		const keys = group.entries.map(pullRequestEntryKey), canClose = (key: string) => byKey.get(key)?.state === "open" && !pendingRef.current.has(key);
		let started = false, swept: string[] = [];
		const move = (next: PointerEvent) => {
			if (!started && Math.abs(next.clientY - startY) < 6) return;
			started = true;
			const viewport = viewportRef.current; if (!viewport) return;
			const bounds = viewport.getBoundingClientRect(), y = Math.min(Math.max(next.clientY, bounds.top), bounds.bottom - 1);
			let target: string | null = null;
			for (const row of viewport.querySelectorAll<HTMLElement>("[data-pull-request-key]")) { if (target !== null && row.getBoundingClientRect().top > y) break; if (byKey.has(row.dataset.pullRequestKey ?? "")) target = row.dataset.pullRequestKey ?? null; }
			swept = target ? sweepKeys(keys, originKey, target, canClose) : [];
			setSweep(new Set(swept));
		};
		const stop = (commit: boolean) => {
			window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape, true);
			setSweep(new Set());
			if (!started) return;
			suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 0);
			if (commit) void run(swept.flatMap(key => byKey.get(key) ?? []), "close");
		};
		const end = () => stop(true), cancel = () => stop(false);
		// Escape abandons a sweep in progress; it is part of the drag, not a shortcut.
		const escape = (key: KeyboardEvent) => { if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); stop(false); } };
		window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape, true);
	}, [run]);

	const hasProjects = projects.length > 0;
	const refreshing = directory.loading && !directory.carried;
	const failures = (data?.errors ?? []).filter(error => !/origin remote/.test(error.message));
	const filtered = Object.keys(menu).length > 0 || preferences.state !== "open" || preferences.involvement !== "all" || projectId !== undefined;
	const searching = typedQuery.length > 0 && !settled;
	const canLoadMore = Boolean(data?.truncated) && limit < maximumPullRequestPageSize;
	const loadMore = () => setLimit(current => Math.min(maximumPullRequestPageSize, current + pullRequestPageSize));
	const addProject = () => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); };
	const refreshButton = (compact: boolean) => <Tip label="Refresh pull requests"><Button size={compact ? "icon-xs" : "icon-sm"} variant={compact ? "ghost" : "outline"} aria-label="Refresh pull requests" disabled={refreshing} onClick={() => void directory.refresh()} className={compact ? "text-muted-foreground" : undefined}><RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /></Button></Tip>;
	const searchExpanded = searchOpen || typedQuery.length > 0;

	let body: ReactNode;
	if (!hasProjects) body = <Empty title="No projects in this workspace" description="Add a project, and the pull requests from its repository appear here."><Button size="sm" onClick={addProject}><Plus className="size-3.5" />Add project</Button></Empty>;
	else if (!data && directory.loading) body = <PullRequestListGhost rows={7} />;
	else if (directory.error && !entries.length) body = <Empty title="Pull requests unavailable" description={directory.error}><Button size="sm" variant="outline" disabled={directory.loading} onClick={() => void directory.refresh()}>{directory.loading ? "Retrying…" : "Retry"}</Button></Empty>;
	else if (directory.carried && !entries.length && !typedQuery) body = <PullRequestListGhost rows={7} />;
	// A project without a GitHub origin simply has no pull requests; any other failure is why the list is empty, so say so.
	else if (!entries.length && failures.length) body = <Empty title="Could not read pull requests" description={failures.length > 1 ? `${failures[0].message} (and ${failures.length - 1} more)` : failures[0].message}><CheckAgain refreshing={refreshing} onRefresh={() => void directory.refresh()} /></Empty>;
	else if (!entries.length) {
		if (searching) body = <div className="space-y-1"><p className="px-3 pb-1 text-xs font-medium text-muted-foreground/70">Searching GitHub for “{truncate(typedQuery)}”</p><PullRequestListGhost rows={5} /></div>;
		else if (typedQuery) body = <Empty title={`Nothing matches “${truncate(typedQuery)}”`} description="GitHub was searched for it. Try fewer words, or search by number, author or branch.">
			<Button size="sm" variant="outline" onClick={() => update({ q: undefined })}><Search className="size-3.5" />Clear search</Button><CheckAgain refreshing={refreshing} onRefresh={() => void directory.refresh()} />
		</Empty>;
		else body = <Empty title={filtered ? "Nothing under these filters" : "No pull requests"} description={filtered ? "Widen the state, involvement or project filter to see more." : "Pull requests from every project in this workspace appear here."}>
			{canLoadMore && <Button size="sm" variant="outline" disabled={directory.loading} onClick={loadMore}>{directory.loading ? "Loading..." : "Load more pull requests"}</Button>}<CheckAgain refreshing={refreshing} onRefresh={() => void directory.refresh()} />
		</Empty>;
	} else body = <div className={cn("space-y-3", sweep.size > 0 && "**:pointer-events-none")} aria-label="All pull requests">
		{groups.map(group => <section key={group.key} aria-label={group.label || "Matching pull requests"} className="space-y-0.5">
			{group.label && <GroupHeader groupKey={group.key} label={group.label} count={group.entries.length} />}
			{group.entries.map(entry => { const key = pullRequestEntryKey(entry); return <PageRow key={key} entry={entry} selected={selected?.projectId === entry.projectId && selected.number === entry.number} matchedElsewhere={typed.text.length > 0 && scorePullRequestMatch(entry, typed.text) <= matchedElsewhereScore} speedMode={speedMode} busy={pending.has(key)} sweeping={sweep.has(key)} onSelect={select} onAction={act} onSweepStart={startSweep} onNotice={say} />; })}
		</section>)}
	</div>;

	return <TooltipProvider delay={150}><div className="flex h-full min-h-0 w-full bg-background" aria-label="Pull requests page" data-pull-requests-page="">
		<div className={cn("@container/pr-list flex min-h-0 min-w-0 flex-col", selected ? "w-[min(44rem,45%)] shrink-0 border-r border-border/60" : "flex-1")}>
			<header className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-4">
				{condensed ? <nav aria-label="Pull request scope" className="flex min-w-0 items-center gap-1 overflow-hidden text-xs">
					<h1 className={cn("shrink-0 font-medium", searchExpanded && "sr-only")}>Pull requests</h1>
					{!searchExpanded && <span aria-hidden className="text-muted-foreground/50">/</span>}
					<CompactMenu label="Filter by state" value={preferences.state} options={stateOptions} onChange={state => update({ state })} />
					<CompactMenu label="Filter by involvement" value={preferences.involvement} options={involvementOptions} onChange={involvement => update({ involvement })} />
				</nav> : <h1 className="truncate text-xs font-medium">Pull requests</h1>}
				<div className="min-w-0 flex-1" />
				{condensed && <div className="flex shrink items-center gap-1">
					{searchExpanded ? <div className="w-56 min-w-24 shrink" onBlur={event => { if (!typedQuery && !event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchOpen(false); }}><SearchInput className="h-7" value={preferences.q ?? ""} busy={searching} onChange={q => update({ q: q || undefined })} inputRef={topSearchRef} /></div>
						: <Tip label="Search pull requests"><Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="Search pull requests" onClick={() => setSearchOpen(true)}><Search className="size-3.5" /></Button></Tip>}
					{refreshButton(true)}
				</div>}
			</header>
			{notice && <p role={notice.failed ? "alert" : "status"} className={cn("flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-1.5 text-xs", notice.failed ? "text-destructive" : "text-muted-foreground")}><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{notice.text}</span>{notice.failed && <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setNotice(undefined)}><X className="size-3" /></Button>}</p>}
			<ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
				<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-8">
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<div className="min-w-0 basis-full @lg/pr-list:flex-1 @lg/pr-list:basis-0"><SearchInput value={preferences.q ?? ""} busy={searching} onChange={q => update({ q: q || undefined })} inputRef={searchRef} /></div>
							<CompactMenu label="Sort pull requests" value={sort} options={sortOptions} onChange={next => update({ sort: next === "ready" ? undefined : next })} trigger={<><ArrowDownUp className="size-4" /><span>Sort</span></>} />
							<FiltersMenu preferences={projectId ? preferences : { ...preferences, projectId: undefined }} update={update} authors={facets.authors} labels={facets.labels} projects={projectOptions} />
							{!condensed && refreshButton(false)}
						</div>
						<div ref={markerRef} aria-hidden className="-mt-3 h-px w-full" />
					</div>
					{body}
					{directory.error && entries.length > 0 && <div role="alert" className="flex items-center justify-between gap-3 border-l-2 border-warning py-1 pl-3 text-xs"><span>{directory.error} Showing the last pull requests loaded.</span><Button size="xs" variant="outline" onClick={() => void directory.refresh()}>Retry</Button></div>}
					{data?.truncated && entries.length > 0 && <div className="flex justify-center py-3 text-xs text-muted-foreground">
						{directory.loading && limit > pullRequestPageSize ? <span className="flex items-center gap-2"><RefreshCw aria-hidden className="size-3.5 animate-spin" />Loading more</span>
							: canLoadMore ? <Button size="sm" variant="outline" onClick={loadMore} disabled={directory.loading}>Load more pull requests</Button>
								: <span>Narrow your search to find more pull requests.</span>}
					</div>}
				</div>
			</ScrollArea>
		</div>
		{selected && <div className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Pull request">
			<PullRequestSurface key={`${selected.projectId}#${selected.number}`} projectId={selected.projectId} number={selected.number} onBack={() => setSelected(undefined)} />
		</div>}
	</div></TooltipProvider>;
}
