import { useMemo, type MouseEvent } from "react";
import type { TaskPullRequestLink } from "../../../shared/pullRequestView";
import { currentPullRequest, pullRequestBadge, pullRequestChains, pullRequestListLines, visiblePullRequestLinks, type PullRequestBadge as Badge } from "../../../shared/pullRequestStacks";
import { useWorkspace } from "../../app/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";
import { openPullRequest } from "./events";
import { openPullRequestLink } from "./openPullRequestLink";
import { PULL_REQUEST_STATE_PRESENTATION, PullRequestGlyph, pullRequestStatePresentation } from "./presentation";
import { StackGlyph } from "./StackMenu";
import { useBranchPullRequest } from "./useBranchPullRequest";
import { useProjectRepository } from "./useProjectRepository";

type Single = { number: number; url: string; title?: string; state?: "open" | "closed" | "merged"; draft?: boolean };
/** What the badge shows (T3's resolveThreadPullRequestBadgePresentation): a stack count, "+N" for several, else #N. */
export function badgePresentation(badge: Badge | null, single: Single | undefined) {
	if (badge?.kind === "stack") { const aggregate = PULL_REQUEST_STATE_PRESENTATION[badge.state]; return { Icon: StackGlyph, toneClassName: aggregate.toneClassName, label: `Stack of ${badge.layers} pull requests, ${aggregate.label.toLowerCase()}`, text: String(badge.layers), opensList: true }; }
	if (!single) return null;
	const state = single.state ? pullRequestStatePresentation(single.state, single.draft ?? false) : undefined;
	const tooltip = state ? `PR #${single.number}, ${state.label.toLowerCase()}` : `PR #${single.number}, status pending`;
	if (badge?.kind === "pull-request" && badge.others > 0) { const aggregate = PULL_REQUEST_STATE_PRESENTATION[badge.state]; return { Icon: aggregate.Icon, toneClassName: aggregate.toneClassName, label: `${tooltip}, and ${badge.others} more linked; overall ${aggregate.label.toLowerCase()}`, text: `+${badge.others + 1}`, opensList: true }; }
	return { Icon: state?.Icon ?? PullRequestGlyph.pullRequest, toneClassName: state?.toneClassName ?? "text-muted-foreground", label: tooltip, text: String(single.number), opensList: false };
}

/** The chat's pull requests in the badge's hover card, in the linked list's order (T3's ThreadPullRequestsMiniList). */
function MiniList({ links, single, onOpen }: { links: TaskPullRequestLink[]; single?: Single; onOpen: (event: MouseEvent<HTMLElement>, url: string) => void }) {
	const lines = useMemo(() => pullRequestListLines(pullRequestChains(links)), [links]);
	const item = (key: string, number: number, url: string, title: string, state: { Icon: typeof StackGlyph; toneClassName: string } | undefined, depth = 0, extra?: string) => <li key={key} style={{ paddingLeft: `${Math.min(depth, 3) * 0.75}rem` }}>
		<a href={url} onClick={event => onOpen(event, url)} onAuxClick={event => { if (event.button === 1) onOpen(event, url); }} className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
			{state ? <state.Icon aria-hidden className={cn("size-3 shrink-0", state.toneClassName)} /> : <PullRequestGlyph.pullRequest aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
			<span className="shrink-0 font-mono tabular-nums">#{number}</span><span className="min-w-0 truncate text-foreground/75">{title}</span>
			{extra && <span className="ml-auto shrink-0 pl-1 text-3xs text-muted-foreground">{extra}</span>}
		</a>
	</li>;
	return <ul className="flex flex-col gap-1">
		{lines.length ? lines.map(line => item(`${line.link.repository}#${line.link.number}`, line.link.number, line.link.url, line.link.snapshot?.title ?? line.link.repository, line.link.snapshot ? pullRequestStatePresentation(line.link.snapshot.state, line.link.snapshot.draft) : undefined, line.depth, line.stack ? `${line.stack.kind === "native" ? "stack" : "chain"} · ${line.stack.size}` : undefined))
			: single && item("single", single.number, single.url, single.title ?? `Pull request #${single.number}`, single.state ? pullRequestStatePresentation(single.state, single.draft ?? false) : undefined)}
	</ul>;
}

/**
 * The linked pull request badge on a chat's sidebar row and in its composer (T3's ThreadPullRequestBadgeControl): the
 * state glyph and #N, "+N" for several, or a stack count, in the state's colour. Hovering lists them; clicking opens
 * the pull request, or the linked list when there are several. `branch` lets the composer fall back to the pull
 * request for the checkout's branch when nothing is linked.
 */
export function PullRequestBadge({ taskId, projectId, links, branch = false, className }: { taskId: string; projectId?: string; links?: TaskPullRequestLink[]; branch?: boolean; className?: string }) {
	const { selectedId, select } = useWorkspace();
	const visible = useMemo(() => visiblePullRequestLinks(links), [links]);
	const repository = useProjectRepository(projectId);
	const branchPull = useBranchPullRequest(branch && !visible.length ? projectId : undefined)?.pullRequest;
	const badge = pullRequestBadge(visible), current = currentPullRequest(visible);
	const single: Single | undefined = current ? { number: current.number, url: current.url, title: current.snapshot?.title, state: current.snapshot?.state, draft: current.snapshot?.draft } : branchPull ? { number: branchPull.number, url: branchPull.url, title: branchPull.title, state: branchPull.state === "MERGED" ? "merged" : branchPull.state === "CLOSED" ? "closed" : "open", draft: branchPull.draft } : undefined;
	const presentation = badgePresentation(badge, single);
	if (!presentation) return null;
	// The pane belongs to the open chat, so a badge on another chat's row opens that chat first.
	const inChat = (run: () => void) => { if (selectedId === taskId) run(); else { select(taskId); window.setTimeout(run, 50); } };
	const openUrl = (event: MouseEvent<HTMLElement>, url: string) => { event.stopPropagation(); const detail = { ctrlKey: event.ctrlKey, metaKey: event.metaKey, button: event.button, preventDefault: () => event.preventDefault() }; event.preventDefault(); inChat(() => openPullRequestLink(detail, url, repository)); };
	const onClick = (event: MouseEvent<HTMLElement>) => { if (presentation.opensList) { event.preventDefault(); event.stopPropagation(); inChat(() => openPullRequest({ list: true })); } else if (single) openUrl(event, single.url); };
	return <Popover>
		<PopoverTrigger openOnHover delay={300} nativeButton={false} aria-label={presentation.label} onPointerDown={event => event.stopPropagation()} onClick={onClick} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); onClick(event as unknown as MouseEvent<HTMLElement>); } }}
			render={<span role="button" tabIndex={0} data-pull-request-badge="" className={cn("inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm text-xs font-normal tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40", presentation.toneClassName, className)} />}>
			<presentation.Icon aria-hidden className="size-3 shrink-0" /><span>{presentation.text}</span>
		</PopoverTrigger>
		<PopoverContent side="top" align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-1" onClick={event => event.stopPropagation()}>
			<MiniList links={visible} single={single} onOpen={openUrl} />
		</PopoverContent>
	</Popover>;
}
