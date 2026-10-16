import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Eye, EyeOff, Link as LinkIcon, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import type { ProjectPullRequests, PullRequest } from "../../../shared/pullRequests";
import type { TaskPullRequestLink } from "../../../shared/pullRequestView";
import { useWorkspace } from "../../app/workspace";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { TooltipProvider } from "../../components/ui/tooltip";
import { useBackgroundRefresh } from "../../lib/useBackgroundRefresh";
import { cn } from "../../lib/utils";
import { ChecksGlyph, DiffStat, errorMessage, MiddleTruncate, PullRequestGlyph, PullRequestListGhost, PullRequestRowGlyph, ReviewDecisionGlyph, Tip } from "./presentation";
import { relativeTime, summaryChecksRollup } from "./pullRequestLogic";
import { PullRequestSurface } from "./PullRequestSurface";
import { PullRequestNumberMenu } from "./PullRequestNumberMenu";
import { segmentedGroup, segmentedItem } from "./segmented";

/** T3's shared row shape (PullRequestListRow): a status column, then number and title over author and branches. */
export const PULL_REQUEST_ROW_CLASS = "group/pr-row flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left";
const NUMBER_CLASS = "shrink-0 font-mono text-xs tabular-nums text-muted-foreground";
export type OpenPullRequest = { number: number; title: string; state: "OPEN" | "CLOSED" | "MERGED"; draft: boolean };

function RowLines({ number, title, signals, status, meta, updatedAt }: { number: ReactNode; title: ReactNode; signals?: ReactNode; status?: ReactNode; meta?: ReactNode; updatedAt?: string }) {
	return <span className="min-w-0 flex-1">
		<span className="flex min-w-0 items-center gap-1.5">{number}<span className="min-w-0 truncate text-sm">{title}</span>{signals && <span className="flex shrink-0 items-center gap-1 text-2xs">{signals}</span>}{status && <span className="ml-auto flex shrink-0 items-center gap-1.5 text-2xs">{status}</span>}</span>
		<span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground">{meta}{updatedAt && <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{relativeTime(updatedAt)}</span>}</span>
	</span>;
}
const Branches = ({ head, base }: { head: string; base: string }) => <span className="flex min-w-0 items-center gap-1 font-mono"><MiddleTruncate value={head} limit={28} /><span className="shrink-0">→</span><MiddleTruncate value={base} limit={16} className="shrink-0" /></span>;

/** The actions a row offers on hover, out of the row's flow so no row reserves a column for them. */
function RowMenu({ label, children }: { label: string; children: ReactNode }) {
	return <span className={cn("absolute right-0 bottom-0.5 flex items-center rounded-r-md bg-background pr-1 pl-5 [mask-image:linear-gradient(to_right,transparent,black_1rem)]", "pointer-events-none opacity-0 group-hover/pr-row:pointer-events-auto group-hover/pr-row:opacity-100 has-[[data-popup-open]]:pointer-events-auto has-[[data-popup-open]]:opacity-100 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100")}>
		<span aria-hidden className="absolute inset-0 bg-accent/60" />
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} className="relative size-5" />}><MoreHorizontal className="size-3.5" /></DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom" className="w-48">{children}</DropdownMenuContent>
		</DropdownMenu>
	</span>;
}

function LinkRow({ link, openable, onOpen, onExternal, onCopy, onUnlink, onWatch, onNotice }: { link: TaskPullRequestLink; openable: boolean; onOpen: () => void; onExternal: () => void; onCopy: () => void; onUnlink: () => void; onWatch: (watching: boolean) => void; onNotice: (message: string, failed?: boolean) => void }) {
	const snapshot = link.snapshot, open = !snapshot || snapshot.state === "open", rollup = snapshot ? summaryChecksRollup(snapshot.checks) : null;
	return <div className={cn(PULL_REQUEST_ROW_CLASS, "relative pl-2 hover:bg-accent/60")} data-pull-request-row={`${link.repository}#${link.number}`}>
		{snapshot ? <PullRequestRowGlyph state={snapshot.state} draft={snapshot.draft} mergeable={snapshot.mergeable} base={snapshot.base} /> : <PullRequestGlyph.pullRequest aria-label="Waiting for GitHub" className="size-4 shrink-0 text-muted-foreground" />}
		<button type="button" onClick={openable ? onOpen : onExternal} className="flex min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm">
			<RowLines
				number={<PullRequestNumberMenu url={link.url} onCopy={onCopy} onNotice={onNotice} className="shrink-0"><Tip label={`${link.source === "agent" ? "Linked by the agent" : "Linked by you"} · ${relativeTime(link.linkedAt)}`}><span className={NUMBER_CLASS}>#{link.number}</span></Tip></PullRequestNumberMenu>}
				title={snapshot?.title ?? link.repository}
				signals={open ? <>{link.watching && <Tip label="Watching for changes"><span className="inline-flex shrink-0"><Eye role="img" aria-label="Watching" className="size-3.5" /></span></Tip>}{rollup && <ChecksGlyph rollup={rollup} />}{snapshot && <ReviewDecisionGlyph decision={snapshot.review} />}</> : null}
				status={snapshot && <DiffStat additions={snapshot.additions} deletions={snapshot.deletions} className="font-mono" />}
				meta={snapshot ? <><span className="max-w-28 shrink-0 truncate">{snapshot.author}</span><span aria-hidden className="text-muted-foreground/50">·</span><Tip label={link.repository}><span className="flex max-w-32 min-w-0 font-mono"><MiddleTruncate value={link.repository} limit={24} /></span></Tip><span aria-hidden className="text-muted-foreground/50">·</span><Branches head={snapshot.head} base={snapshot.base} /></> : <span className="truncate font-mono">github.com/{link.repository}</span>}
				updatedAt={snapshot?.updatedAt}
			/>
		</button>
		<RowMenu label={`Actions for #${link.number}`}>
			<DropdownMenuItem onClick={onCopy}><LinkIcon className="size-3.5" />Copy link</DropdownMenuItem>
			<DropdownMenuItem onClick={openable ? onOpen : onExternal}><ArrowUpRight className="size-3.5" />Open</DropdownMenuItem>
			{open && <DropdownMenuItem onClick={() => onWatch(!link.watching)}>{link.watching ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{link.watching ? "Stop watching" : "Watch for changes"}</DropdownMenuItem>}
			<DropdownMenuItem onClick={onUnlink}><PullRequestGlyph.unlink className="size-3.5" />Unlink from chat</DropdownMenuItem>
		</RowMenu>
	</div>;
}

function ProjectRow({ request, linked, onOpen, onExternal, onCopy, onLink, onNotice }: { request: PullRequest; linked: boolean; onOpen: () => void; onExternal: () => void; onCopy: () => void; onLink?: () => void; onNotice: (message: string, failed?: boolean) => void }) {
	const rollup = summaryChecksRollup(request.checks);
	return <div className={cn(PULL_REQUEST_ROW_CLASS, "relative pl-2 hover:bg-accent/60")} data-pull-request-row={request.number}>
		<PullRequestRowGlyph state="OPEN" draft={request.draft} />
		<button type="button" onClick={onOpen} className="flex min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
			<RowLines number={<PullRequestNumberMenu url={request.url} onCopy={onCopy} onNotice={onNotice} className="shrink-0"><span className={NUMBER_CLASS}>#{request.number}</span></PullRequestNumberMenu>} title={request.title}
				signals={<>{linked && <Tip label="Linked to this chat"><span className="inline-flex shrink-0"><LinkIcon role="img" aria-label="Linked" className="size-3.5 text-muted-foreground" /></span></Tip>}{rollup && <ChecksGlyph rollup={rollup} />}<ReviewDecisionGlyph decision={request.review} /></>}
				meta={<><span className="max-w-28 shrink-0 truncate">{request.author}</span><span aria-hidden className="text-muted-foreground/50">·</span><Branches head={request.head} base={request.base} /></>}
				updatedAt={request.updatedAt} />
		</button>
		<RowMenu label={`Actions for #${request.number}`}>
			<DropdownMenuItem onClick={onCopy}><LinkIcon className="size-3.5" />Copy link</DropdownMenuItem>
			<DropdownMenuItem onClick={onExternal}><ArrowUpRight className="size-3.5" />Open on GitHub</DropdownMenuItem>
			{onLink && !linked && <DropdownMenuItem onClick={onLink}><PullRequestGlyph.link className="size-3.5" />Link to this chat</DropdownMenuItem>}
		</RowMenu>
	</div>;
}

/** T3's link dialog: a GitHub URL, `owner/repo#42` or `#42` for this project. */
export function LinkPullRequestDialog({ open, onOpenChange, onLink }: { open: boolean; onOpenChange: (open: boolean) => void; onLink: (reference: string) => Promise<string | undefined> }) {
	const [value, setValue] = useState(""), [error, setError] = useState(""), [pending, setPending] = useState(false);
	useEffect(() => { if (open) { setValue(""); setError(""); } }, [open]);
	const submit = async () => { if (!value.trim() || pending) return; setPending(true); const failure = await onLink(value.trim()); setPending(false); if (failure) setError(failure); else onOpenChange(false); };
	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-md gap-4 p-5">
			<DialogHeader><DialogTitle>Link pull request</DialogTitle><DialogDescription className="text-xs">Paste a GitHub pull request URL, or type a number like #42 for this chat's project.</DialogDescription></DialogHeader>
			<form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-2">
				<Input autoFocus value={value} disabled={pending} onChange={event => { setValue(event.target.value); setError(""); }} placeholder="https://github.com/owner/repo/pull/42 or #42" aria-label="Pull request URL or number" className="text-sm" />
				{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
				<DialogFooter><Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" size="sm" disabled={pending || !value.trim()}>{pending ? "Linking…" : "Link"}</Button></DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}

/**
 * The pull requests linked to a chat (T3's ThreadPullRequestsPanel) and the project's open pull
 * requests. Without `onOpen` a row opens in place with a back button; with it, the caller can give
 * each pull request its own pane tab.
 */
export function PullRequestListSurface({ projectId, taskId, onOpen }: { projectId: string; taskId?: string; onOpen?: (pullRequest: OpenPullRequest) => void }) {
	const { api, overview, setOverview } = useWorkspace();
	const task = taskId ? overview.tasks.find(value => value.id === taskId) : undefined;
	const links = useMemo(() => task?.pullRequests ?? [], [task?.pullRequests]);
	const [view, setView] = useState<"linked" | "open">(taskId ? "linked" : "open");
	const [selected, setSelected] = useState<number>();
	const [project, setProject] = useState<{ projectId: string; value: ProjectPullRequests; requests: PullRequest[] }>();
	const [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
	const [linkOpen, setLinkOpen] = useState(false);
	const generation = useRef(0);
	useEffect(() => { setView(taskId ? "linked" : "open"); setSelected(undefined); }, [taskId, projectId]);
	const repository = project?.projectId === projectId ? project.value.repository : undefined;
	const load = useCallback(async (cursor?: string) => {
		if (!api || !projectId) return;
		const current = ++generation.current; setLoading(true); setError("");
		try {
			const value = await api.pullRequests(projectId, cursor);
			if (current === generation.current) setProject(previous => ({ projectId, value, requests: cursor && previous?.projectId === projectId ? [...previous.requests, ...value.requests.filter(request => !previous.requests.some(other => other.number === request.number))] : value.requests }));
		} catch (reason) { if (current === generation.current) setError(errorMessage(reason)); }
		finally { if (current === generation.current) setLoading(false); }
	}, [api, projectId]);
	useEffect(() => { setProject(undefined); void load(); }, [load]);
	// Linked rows draw from what the chat remembers; reading each one refreshes that memory in the main process.
	const linkedKey = links.filter(link => repository && link.repository.toLowerCase() === repository.toLowerCase()).slice(0, 20).map(link => link.number).join(",");
	const refreshLinks = useCallback(() => { if (!api || !linkedKey) return; for (const number of linkedKey.split(",").map(Number)) void api.pullRequest(projectId, number).catch(() => {}); }, [api, projectId, linkedKey]);
	useEffect(() => { refreshLinks(); }, [refreshLinks]);
	useBackgroundRefresh(() => { if (selected === undefined) { void load(); refreshLinks(); } });

	const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(current => current === text ? "" : current), 1500); };
	const external = (url: string) => { void api?.openLink(url).catch(reason => setError(errorMessage(reason))); };
	const copy = (url: string) => { void navigator.clipboard.writeText(url).then(() => flash("Link copied"), () => flash("Copy failed")); };
	const run = async (command: Parameters<NonNullable<typeof api>["command"]>[0]) => { if (!api) return "Open the desktop app to link pull requests."; try { setOverview(await api.command(command)); return undefined; } catch (reason) { return errorMessage(reason); } };
	const openRequest = (request: OpenPullRequest) => { if (onOpen) onOpen(request); else setSelected(request.number); };
	const sameRepository = (link: TaskPullRequestLink) => !!repository && link.repository.toLowerCase() === repository.toLowerCase();

	if (selected !== undefined) return <PullRequestSurface projectId={projectId} number={selected} onBack={() => setSelected(undefined)} />;
	if (!projectId) return <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"><PullRequestGlyph.pullRequest aria-hidden className="size-6 text-muted-foreground/60" /><p className="text-sm font-medium">No project</p><p className="max-w-60 text-xs text-muted-foreground">Open a chat in a GitHub project to see its pull requests.</p></div>;

	const openCount = links.filter(link => !link.snapshot || link.snapshot.state === "open").length;
	const linkedNumbers = new Set(links.filter(sameRepository).map(link => link.number));
	const header = <div className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2">
		{taskId ? <ToggleGroup aria-label="Pull request list" value={view} onValueChange={(value: string) => { if (value === "linked" || value === "open") setView(value); }} spacing={0.5} className={segmentedGroup}>
			<ToggleGroupItem value="linked" className={segmentedItem}>Linked</ToggleGroupItem><ToggleGroupItem value="open" className={segmentedItem}>Open</ToggleGroupItem>
		</ToggleGroup> : <span className="px-1 text-xs font-medium">Open pull requests</span>}
		<span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{repository}</span>
		<Tip label="Refresh"><Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="Refresh pull requests" disabled={loading} onClick={() => { void load(); refreshLinks(); }}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></Button></Tip>
	</div>;
	const feedback = (error || notice) && <p role={error ? "alert" : "status"} className={cn("border-b border-border/60 px-3 py-1.5 text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error || notice}</p>;

	return <TooltipProvider delay={150}><section className="flex h-full min-h-0 flex-col" aria-label="Pull requests" aria-busy={loading}>
		{header}{feedback}
		{view === "linked" && taskId ? (links.length === 0
			? <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
				<PullRequestGlyph.link aria-hidden className="size-6 text-muted-foreground/60" />
				<p className="text-sm font-medium">No linked pull requests</p>
				<p className="max-w-60 text-xs text-muted-foreground">Link a pull request to this chat from a URL or a number, or from the Open list.</p>
				<Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}><Plus className="size-3.5" />Link pull request</Button>
			</div>
			: <>
				<ScrollArea className="min-h-0 flex-1"><div className="flex flex-col p-1.5" aria-label="Linked pull requests">
					{links.map(link => <LinkRow key={`${link.repository}#${link.number}`} link={link} openable={sameRepository(link)}
						onOpen={() => openRequest({ number: link.number, title: link.snapshot?.title ?? `#${link.number}`, state: link.snapshot?.state === "merged" ? "MERGED" : link.snapshot?.state === "closed" ? "CLOSED" : "OPEN", draft: link.snapshot?.draft ?? false })}
						onExternal={() => external(link.url)} onCopy={() => copy(link.url)} onNotice={(message, failed) => failed ? setError(message) : flash(message)}
						onUnlink={() => void run({ type: "unlink-pull-request", id: taskId, repository: link.repository, number: link.number }).then(failure => failure && setError(failure))}
						onWatch={watching => void run({ type: "watch-pull-request", id: taskId, repository: link.repository, number: link.number, watching }).then(failure => failure && setError(failure))} />)}
				</div></ScrollArea>
				<footer className="flex items-center justify-between border-t border-border/60 px-2 py-1.5 text-2xs text-muted-foreground"><span>{openCount} open · {links.length} linked</span><Button size="xs" variant="ghost" onClick={() => setLinkOpen(true)}><Plus className="size-3.5" />Link</Button></footer>
			</>)
			: <ScrollArea className="min-h-0 flex-1"><div className="flex flex-col p-1.5" aria-label="Open pull requests">
				{!project && loading && <PullRequestListGhost />}
				{project?.projectId === projectId && project.requests.map(request => <ProjectRow key={request.number} request={request} linked={linkedNumbers.has(request.number)}
					onOpen={() => openRequest({ number: request.number, title: request.title, state: "OPEN", draft: request.draft })} onExternal={() => external(request.url)} onCopy={() => copy(request.url)} onNotice={(message, failed) => failed ? setError(message) : flash(message)}
					onLink={taskId ? () => void run({ type: "link-pull-request", id: taskId, reference: request.url }).then(failure => failure ? setError(failure) : flash(`Linked #${request.number}`)) : undefined} />)}
				{project?.projectId === projectId && !project.requests.length && !loading && !error && <p className="px-2 py-2 text-xs text-muted-foreground">No open pull requests.</p>}
				{project?.projectId === projectId && project.value.nextCursor && <Button size="sm" variant="ghost" className="mt-1 w-full text-xs" disabled={loading} onClick={() => void load(project.value.nextCursor)}>{loading ? "Loading…" : "Load more"}</Button>}
			</div></ScrollArea>}
		{taskId && <LinkPullRequestDialog open={linkOpen} onOpenChange={setLinkOpen} onLink={reference => run({ type: "link-pull-request", id: taskId, reference })} />}
	</section></TooltipProvider>;
}
