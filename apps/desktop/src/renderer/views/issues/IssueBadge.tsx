import type { MouseEvent } from "react";
import { CircleDot, ExternalLink, Eye, Unlink2 } from "lucide-react";
import type { TaskIssueLink } from "../../../shared/issueView";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { toastManager } from "../../components/ui/toast";
import { cn } from "../../lib/utils";
import { issueStatePresentation } from "./presentation";

const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : String(reason);

/** What the badge shows: the one issue's state and #N, or "+N" for several with open ones setting the tone. */
export function issueBadgePresentation(links: TaskIssueLink[]) {
	if (!links.length) return null;
	const open = links.some(link => link.snapshot?.state !== "closed"), first = links[0];
	const state = links.length === 1 ? first.snapshot ? issueStatePresentation(first.snapshot.state) : undefined : issueStatePresentation(open ? "open" : "closed");
	const label = links.length === 1 ? `Issue #${first.number}${first.snapshot ? `, ${first.snapshot.state}` : ""}` : `${links.length} linked issues`;
	return { Icon: state?.Icon ?? CircleDot, toneClassName: state?.toneClassName ?? "text-muted-foreground", label, text: links.length === 1 ? String(first.number) : `+${links.length}` };
}

/**
 * The linked issue badge beside the pull request badge on a Code chat's row and header. Hovering lists the issues; each
 * opens on GitHub or can be unlinked from the chat.
 */
export function IssueBadge({ taskId, links, className }: { taskId: string; links?: TaskIssueLink[]; className?: string }) {
	const presentation = issueBadgePresentation(links ?? []);
	if (!presentation || !links) return null;
	const open = (event: MouseEvent<HTMLElement>, url: string) => { event.preventDefault(); event.stopPropagation(); void window.phaseoDesktop?.workspace.openLink(url); };
	const unlink = (event: MouseEvent<HTMLElement>, link: TaskIssueLink) => {
		event.preventDefault(); event.stopPropagation();
		void window.phaseoDesktop?.workspace.command({ type: "unlink-issue", id: taskId, repository: link.repository, number: link.number }).catch(reason => toastManager.add({ type: "error", title: "Could not unlink the issue", description: errorMessage(reason) }));
	};
	const onClick = (event: MouseEvent<HTMLElement>) => { if (links.length === 1) open(event, links[0].url); else event.stopPropagation(); };
	return <Popover>
		<PopoverTrigger openOnHover delay={300} nativeButton={false} aria-label={presentation.label} onPointerDown={event => event.stopPropagation()} onClick={onClick} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); onClick(event as unknown as MouseEvent<HTMLElement>); } }}
			render={<span role="button" tabIndex={0} data-issue-badge="" className={cn("inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md text-xs font-normal tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40", presentation.toneClassName, className)} />}>
			<presentation.Icon aria-hidden className="size-3 shrink-0" /><span>{presentation.text}</span>
		</PopoverTrigger>
		<PopoverContent side="top" align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-1" onClick={event => event.stopPropagation()}>
			<ul className="flex flex-col gap-1">
				{links.map(link => {
					const state = link.snapshot ? issueStatePresentation(link.snapshot.state) : undefined, Icon = state?.Icon ?? CircleDot;
					return <li key={`${link.repository}#${link.number}`} className="group flex min-w-0 items-center gap-1 rounded-md px-1 py-1 text-xs hover:bg-accent">
						<a href={link.url} onClick={event => open(event, link.url)} title="Open on GitHub" className="flex min-w-0 flex-1 items-center gap-2 outline-none focus-visible:underline">
							<Icon aria-hidden className={cn("size-3 shrink-0", state?.toneClassName ?? "text-muted-foreground")} />
							<span className="shrink-0 font-mono tabular-nums">#{link.number}</span><span className="min-w-0 truncate text-foreground/75">{link.snapshot?.title ?? link.repository}</span>
							{link.watching && <Eye aria-label="Watching" className="size-3 shrink-0 text-muted-foreground" />}
							<ExternalLink aria-hidden className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
						</a>
						<button type="button" aria-label={`Unlink issue #${link.number}`} title="Unlink from this chat" onClick={event => unlink(event, link)} className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground"><Unlink2 className="size-3" /></button>
					</li>;
				})}
			</ul>
		</PopoverContent>
	</Popover>;
}
