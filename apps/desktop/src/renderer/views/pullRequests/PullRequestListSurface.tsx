import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, Link as LinkIcon, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import type { ProjectPullRequests, PullRequest } from "../../../shared/pullRequests";
import type { PullRequestLinkSource, TaskPullRequestLink } from "../../../shared/pullRequestView";
import { pullRequestChains, pullRequestListLines, visiblePullRequestLinks, type PullRequestListLine } from "../../../shared/pullRequestStacks";
import { useWorkspace } from "../../app/workspace";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
import { TooltipProvider } from "../../components/ui/tooltip";
import { useBackgroundRefresh } from "../../lib/useBackgroundRefresh";
import { cn } from "../../lib/utils";
import { linkValidation, resolveLinkInput } from "./linkLogic";
import { ActorAvatar, ChecksGlyph, DiffStat, errorMessage, MiddleTruncate, PullRequestGlyph, PullRequestListGhost, PullRequestRowGlyph, ReviewDecisionGlyph, Tip } from "./presentation";
import { relativeTime, summaryChecksRollup } from "./pullRequestLogic";
import { PullRequestSurface } from "./PullRequestSurface";
import { StackGlyph, StackPopover } from "./StackMenu";
import { useProjectRepository } from "./useProjectRepository";

/** T3's shared row shape (PullRequestListRow): a status column, then number and title over author and branches. */
export const PULL_REQUEST_ROW_CLASS = "group/pr-row flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left";
const NUMBER_CLASS = "shrink-0 font-mono text-xs tabular-nums text-muted-foreground";
export type OpenPullRequest = { number: number; title: string; state: "OPEN" | "CLOSED" | "MERGED"; draft: boolean };
/** Who made each link, as the number's tooltip says it (T3's SOURCE_LABELS). */
export const PULL_REQUEST_SOURCE_LABELS: Record<PullRequestLinkSource, string> = { manual: "Linked by you", created: "Created from this chat", agent: "Linked by the agent", stack: "Found in the stack", "stack-dismissed": "Dismissed" };
export const WATCHING_LABEL = "Watching: the agent wakes when checks finish, someone comments, or the branch conflicts";

function RowLines({ number, title, signals, status, meta, updatedAt }: { number: ReactNode; title: ReactNode; signals?: ReactNode; status?: ReactNode; meta?: ReactNode; updatedAt?: string }) {
	return <span className="min-w-0 flex-1">
		<span className="flex min-w-0 items-center gap-1.5">{number}<span className="min-w-0 truncate text-sm">{title}</span>{signals && <span className="flex shrink-0 items-center gap-1 text-2xs">{signals}</span>}{status && <span className="ml-auto flex shrink-0 items-center gap-1.5 text-2xs">{status}</span>}</span>
		<span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground">{meta}{updatedAt && <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{relativeTime(updatedAt)}</span>}</span>
	</span>;
}
const Branches = ({ head, base }: { head: string; base: string }) => <span className="flex min-w-0 items-center gap-1 font-mono"><MiddleTruncate value={head} limit={28} /><span className="shrink-0">→</span><MiddleTruncate value={base} limit={16} className="shrink-0" /></span>;
/** T3's PullRequestRowAuthor: avatar and login. */
function RowAuthor({ login, avatarUrl }: { login: string; avatarUrl?: string }) {
	return <Tip label={login}><span className="inline-flex min-w-0 shrink-0 items-center gap-1"><ActorAvatar actor={{ login, avatarUrl }} className="size-3.5" /><span className="max-w-28 truncate">{login}</span></span></Tip>;
}

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
/** A row whose menu also opens where it is right-clicked (T3). */
function ContextRow({ className, style, data, menu, children }: { className: string; style?: CSSProperties; data: Record<string, string | number | undefined>; menu: ReactNode; children: ReactNode }) {
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<div className={className} style={style} {...data} />}>{children}</ContextMenu.Trigger>
		<DropdownMenuContent className="w-48">{menu}</DropdownMenuContent>
	</ContextMenu.Root>;
}

function LinkRow({ line, openable, onOpen, onExternal, onCopy, onUnlink, onWatch }: { line: PullRequestListLine; openable: boolean; onOpen: () => void; onExternal: () => void; onCopy: () => void; onUnlink: () => void; onWatch: (watching: boolean) => void }) {
	const { link, depth, stack } = line;
	const snapshot = link.snapshot, open = !snapshot || snapshot.state === "open", rollup = snapshot ? summaryChecksRollup(snapshot.checks) : null;
	const items = <>
		<DropdownMenuItem onClick={onCopy}><LinkIcon className="size-3.5" />Copy link</DropdownMenuItem>
		<DropdownMenuItem onClick={openable ? onOpen : onExternal}><ArrowUpRight className="size-3.5" />Open</DropdownMenuItem>
		{open && <DropdownMenuItem onClick={() => onWatch(!link.watching)}>{link.watching ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{link.watching ? "Stop watching" : "Watch for changes"}</DropdownMenuItem>}
		<DropdownMenuItem onClick={onUnlink}><PullRequestGlyph.unlink className="size-3.5" />{link.source === "stack" ? "Dismiss from chat" : "Unlink from chat"}</DropdownMenuItem>
	</>;
	// Each layer steps in under the one it targets, capped so a tall stack does not stair-step off the edge (T3).
	return <ContextRow className={cn(PULL_REQUEST_ROW_CLASS, "relative hover:bg-accent/60")} style={{ paddingLeft: `${0.5 + Math.min(depth, 3) * 1.25}rem` }} data={{ "data-pull-request-row": `${link.repository}#${link.number}`, "data-stack-depth": depth || undefined }} menu={items}>
		{depth > 0 && <span aria-hidden className="-ml-2 h-6 w-px shrink-0 bg-border/70" />}
		{snapshot ? <PullRequestRowGlyph state={snapshot.state} draft={snapshot.draft} mergeable={snapshot.mergeable} base={snapshot.base} /> : <PullRequestGlyph.pullRequest aria-label="Waiting for GitHub" className="size-4 shrink-0 text-muted-foreground" />}
		<button type="button" onClick={openable ? onOpen : onExternal} className="flex min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
			<RowLines
				number={<Tip label={`${PULL_REQUEST_SOURCE_LABELS[link.source]} · ${relativeTime(link.linkedAt)}`}><span className={NUMBER_CLASS}>#{link.number}</span></Tip>}
				title={snapshot?.title ?? link.repository}
				signals={open ? <>{link.watching && <Tip label={WATCHING_LABEL}><span className="inline-flex shrink-0"><Eye role="img" aria-label="Watching" className="size-3.5" /></span></Tip>}{rollup && <ChecksGlyph rollup={rollup} />}{snapshot && <ReviewDecisionGlyph decision={snapshot.review} />}</> : null}
				status={snapshot && <DiffStat additions={snapshot.additions} deletions={snapshot.deletions} className="font-mono" />}
				meta={snapshot ? <>
					{stack && <Tip label={stack.kind === "native" ? `GitHub stack of ${stack.size}: merging a layer lands the ones below it.` : `${stack.size} pull requests chained by base branch.`}><span className="inline-flex shrink-0 items-center gap-0.5 text-foreground/70"><StackGlyph aria-hidden className="size-3" />{stack.size}</span></Tip>}
					<RowAuthor login={snapshot.author} avatarUrl={snapshot.authorAvatarUrl} />
					<Tip label={link.repository}><span className="flex max-w-32 min-w-0 font-mono"><MiddleTruncate value={link.repository} limit={24} /></span></Tip>
					<Branches head={snapshot.head} base={snapshot.base} />
				</> : <span className="truncate font-mono">github.com/{link.repository}</span>}
				updatedAt={snapshot?.updatedAt}
			/>
		</button>
		<RowMenu label={`Actions for #${link.number}`}>{items}</RowMenu>
	</ContextRow>;
}

function ProjectRow({ projectId, request, linked, onOpen, onExternal, onCopy, onLink }: { projectId: string; request: PullRequest; linked: boolean; onOpen: () => void; onExternal: () => void; onCopy: () => void; onLink?: () => void }) {
	const rollup = summaryChecksRollup(request.checks);
	const items = <>
		<DropdownMenuItem onClick={onCopy}><LinkIcon className="size-3.5" />Copy link</DropdownMenuItem>
		<DropdownMenuItem onClick={onExternal}><ArrowUpRight className="size-3.5" />Open on GitHub</DropdownMenuItem>
		{onLink && !linked && <DropdownMenuItem onClick={onLink}><PullRequestGlyph.link className="size-3.5" />Link to this chat</DropdownMenuItem>}
	</>;
	return <ContextRow className={cn(PULL_REQUEST_ROW_CLASS, "relative pl-2 hover:bg-accent/60")} data={{ "data-pull-request-row": request.number }} menu={items}>
		<PullRequestRowGlyph state="OPEN" draft={request.draft} />
		<button type="button" onClick={onOpen} className="flex min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
			<RowLines number={<span className={NUMBER_CLASS}>#{request.number}</span>} title={request.title}
				signals={<>{linked && <Tip label="Linked to this chat"><span className="inline-flex shrink-0"><LinkIcon role="img" aria-label="Linked" className="size-3.5 text-muted-foreground" /></span></Tip>}{rollup && <ChecksGlyph rollup={rollup} />}<ReviewDecisionGlyph decision={request.review} /></>}
				meta={<>{request.stack && <StackPopover projectId={projectId} number={request.number} membership={request.stack} />}<RowAuthor login={request.author} avatarUrl={request.authorAvatarUrl} /><Branches head={request.head} base={request.base} /></>}
				updatedAt={request.updatedAt} />
		</button>
		<RowMenu label={`Actions for #${request.number}`}>{items}</RowMenu>
	</ContextRow>;
}

/**
 * T3's link dialog: a GitHub URL, `owner/repo#42`, or `#42` for the chat's repository, checked as you type with the
 * pull request it names shown under the input. It cannot be closed while a link is being made.
 */
export function LinkPullRequestDialog({ open, onOpenChange, onLink, repository }: { open: boolean; onOpenChange: (open: boolean) => void; onLink: (reference: string) => Promise<string | undefined>; repository?: string | null }) {
	const [value, setValue] = useState(""), [dirty, setDirty] = useState(false), [error, setError] = useState(""), [pending, setPending] = useState(false);
	useEffect(() => { if (open) { setValue(""); setDirty(false); setError(""); } }, [open]);
	const resolved = useMemo(() => resolveLinkInput(value, repository), [value, repository]);
	const validation = dirty ? linkValidation(value, resolved) : null;
	const submit = async () => {
		setDirty(true);
		if (!resolved || "error" in resolved || pending) return;
		setPending(true); setError("");
		const failure = await onLink(resolved.link.url);
		setPending(false);
		if (failure) setError(failure); else onOpenChange(false);
	};
	return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}>
		<DialogContent className="max-w-xl gap-4 p-5">
			<DialogHeader><DialogTitle>Link pull request</DialogTitle><DialogDescription className="text-xs">Attach a pull request to this chat by its URL, or by its number for this chat's repository.</DialogDescription></DialogHeader>
			<form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-2">
				<Input autoFocus value={value} onChange={event => { setDirty(true); setValue(event.target.value); setError(""); }} placeholder="Pull request URL or #42" aria-label="Pull request URL or number" className="text-sm" />
				{resolved && "link" in resolved && <p className="truncate text-xs text-muted-foreground" data-link-preview="">{resolved.link.host}/{resolved.link.repository} #{resolved.link.number}</p>}
				{(validation ?? error) && <p role="alert" className="text-xs text-destructive">{validation ?? error}</p>}
				<DialogFooter><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" size="sm" disabled={pending || !resolved || "error" in resolved}>{pending ? "Linking…" : "Link"}</Button></DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}

/**
 * The pull requests linked to a chat (T3's ThreadPullRequestsPanel: rows start at the top, a footer counts them) and
 * the project's open pull requests, a step away. Without `onOpen` a row opens in place with a back button; with it,
 * the caller can give each pull request its own pane tab.
 */
export function PullRequestListSurface({ projectId, taskId, onOpen }: { projectId: string; taskId?: string; onOpen?: (pullRequest: OpenPullRequest) => void }) {
	const { api, overview, setOverview } = useWorkspace();
	const task = taskId ? overview.tasks.find(value => value.id === taskId) : undefined;
	const links = useMemo(() => visiblePullRequestLinks(task?.pullRequests), [task?.pullRequests]);
	const lines = useMemo(() => pullRequestListLines(pullRequestChains(links)), [links]);
	const [view, setView] = useState<"linked" | "open">(taskId ? "linked" : "open");
	const [selected, setSelected] = useState<number>();
	const [project, setProject] = useState<{ projectId: string; value: ProjectPullRequests; requests: PullRequest[] }>();
	const [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
	const [linkOpen, setLinkOpen] = useState(false);
	const generation = useRef(0);
	const ownRepository = useProjectRepository(projectId || undefined);
	useEffect(() => { setView(taskId ? "linked" : "open"); setSelected(undefined); }, [taskId, projectId]);
	const repository = project?.projectId === projectId ? project.value.repository : ownRepository ?? undefined;
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
	// As T3's sync does, a linked pull request whose stack GitHub reports differently from the saved one has its stack
	// read, so the stack's other layers join the chat and a layer that left drops its stack.
	const stackKey = project?.projectId === projectId ? links.filter(link => link.repository.toLowerCase() === project.value.repository.toLowerCase()).flatMap(link => { const row = project.requests.find(request => request.number === link.number); return row && (row.stack?.number ?? null) !== (link.stack?.number ?? null) ? [link.number] : []; }).slice(0, 10).join(",") : "";
	useEffect(() => { if (api && stackKey) for (const number of stackKey.split(",").map(Number)) void api.pullRequestStack(projectId, number).catch(() => {}); }, [api, projectId, stackKey]);
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
	const lastSynced = links.reduce<string | undefined>((latest, link) => { const at = link.snapshot?.syncedAt; return at && (!latest || at > latest) ? at : latest; }, undefined);
	const linkedNumbers = new Set(links.filter(sameRepository).map(link => link.number));
	const showOpen = <Button size="xs" variant="ghost" aria-label="Show open pull requests" onClick={() => setView("open")}><PullRequestGlyph.pullRequest className="size-3.5" />Open pull requests</Button>;
	const feedback = (error || notice) && <p role={error ? "alert" : "status"} className={cn("border-b border-border/60 px-3 py-1.5 text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error || notice}</p>;
	const linkedView = view === "linked" && taskId;

	return <TooltipProvider delay={150}><section className="flex h-full min-h-0 flex-col" aria-label="Pull requests" aria-busy={loading}>
		{!linkedView && <div className="flex h-10 min-h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2">
			{taskId && <Tip label="Back to linked pull requests"><Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="Show linked pull requests" onClick={() => setView("linked")}><ArrowLeft className="size-3.5" /></Button></Tip>}
			<span className="px-1 text-xs font-medium">Open pull requests</span>
			<span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{repository}</span>
			<Tip label="Refresh"><Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="Refresh pull requests" disabled={loading} onClick={() => { void load(); refreshLinks(); }}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></Button></Tip>
		</div>}
		{feedback}
		{linkedView ? (links.length === 0
			? <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
				<PullRequestGlyph.link aria-hidden className="size-6 text-muted-foreground/60" />
				<p className="text-sm font-medium">No linked pull requests</p>
				<p className="max-w-60 text-xs text-muted-foreground">Pull requests the agent opens from this chat land here. Link one yourself from a URL or a number.</p>
				<Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}><Plus className="size-3.5" />Link pull request</Button>
				{showOpen}
			</div>
			: <>
				<ScrollArea className="min-h-0 flex-1"><div className="flex flex-col p-1.5" aria-label="Linked pull requests">
					{lines.map(line => { const link = line.link; return <LinkRow key={`${link.repository}#${link.number}`} line={line} openable={sameRepository(link)}
						onOpen={() => openRequest({ number: link.number, title: link.snapshot?.title ?? `#${link.number}`, state: link.snapshot?.state === "merged" ? "MERGED" : link.snapshot?.state === "closed" ? "CLOSED" : "OPEN", draft: link.snapshot?.draft ?? false })}
						onExternal={() => external(link.url)} onCopy={() => copy(link.url)}
						onUnlink={() => void run({ type: "unlink-pull-request", id: taskId, repository: link.repository, number: link.number }).then(failure => failure && setError(failure))}
						onWatch={watching => void run({ type: "watch-pull-request", id: taskId, repository: link.repository, number: link.number, watching }).then(failure => failure && setError(failure))} />; })}
				</div></ScrollArea>
				<footer className="flex items-center gap-1 border-t border-border/60 px-2 py-1.5 text-2xs text-muted-foreground">
					<span className="min-w-0 flex-1 truncate">{openCount} open · {links.length} linked{lastSynced ? ` · synced ${relativeTime(lastSynced)}` : ""}</span>
					{showOpen}
					<Button size="xs" variant="ghost" onClick={() => setLinkOpen(true)}><Plus className="size-3.5" />Link</Button>
				</footer>
			</>)
			: <ScrollArea className="min-h-0 flex-1"><div className="flex flex-col p-1.5" aria-label="Open pull requests">
				{!project && loading && <PullRequestListGhost />}
				{project?.projectId === projectId && project.requests.map(request => <ProjectRow key={request.number} projectId={projectId} request={request} linked={linkedNumbers.has(request.number)}
					onOpen={() => openRequest({ number: request.number, title: request.title, state: "OPEN", draft: request.draft })} onExternal={() => external(request.url)} onCopy={() => copy(request.url)}
					onLink={taskId ? () => void run({ type: "link-pull-request", id: taskId, reference: request.url }).then(failure => failure ? setError(failure) : flash(`Linked #${request.number}`)) : undefined} />)}
				{project?.projectId === projectId && !project.requests.length && !loading && !error && <p className="px-2 py-2 text-xs text-muted-foreground">No open pull requests.</p>}
				{project?.projectId === projectId && project.value.nextCursor && <Button size="sm" variant="ghost" className="mt-1 w-full text-xs" disabled={loading} onClick={() => void load(project.value.nextCursor)}>{loading ? "Loading…" : "Load more"}</Button>}
			</div></ScrollArea>}
		{taskId && <LinkPullRequestDialog open={linkOpen} onOpenChange={setLinkOpen} repository={repository} onLink={reference => run({ type: "link-pull-request", id: taskId, reference })} />}
	</section></TooltipProvider>;
}
