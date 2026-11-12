import { useEffect, useState, type ReactElement } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import type { PullRequestView } from "../../../shared/pullRequestView";
import { parsePullRequestReference } from "../../../shared/pullRequestView";
import { useOptionalWorkspace } from "../../app/workspace";
import { ActorAvatar, pullRequestStatePresentation } from "./presentation";
import { formatRelativeTime } from "@phaseo/app-kit/format";
import { useProjectRepository } from "./useProjectRepository";

/** The open chat's project (or the new chat's), whose repository decides which pull request links can be read. */
export function useLinkProject() {
	const workspace = useOptionalWorkspace();
	if (!workspace) return undefined;
	const task = workspace.overview.tasks.find(value => value.id === workspace.selectedId);
	return task?.projectId ?? (workspace.selectedId ? undefined : workspace.newChatProjectId || undefined);
}

function PreviewBody({ projectId, number }: { projectId: string; number: number }) {
	const [state, setState] = useState<{ view?: PullRequestView; failed?: boolean }>({});
	useEffect(() => {
		let active = true;
		void window.phaseoDesktop?.workspace.pullRequestView(projectId, number).then(view => { if (active) setState({ view }); }, () => { if (active) setState({ failed: true }); });
		return () => { active = false; };
	}, [projectId, number]);
	const view = state.view;
	if (!view) return <p className="text-xs text-muted-foreground">{state.failed ? "Could not read this pull request." : "Loading pull request…"}</p>;
	const presentation = pullRequestStatePresentation(view.state, view.draft), author = view.authorActor?.login ?? "ghost";
	return <div className="min-w-0">
		<div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
			<span className="min-w-0 truncate">{view.repository}</span><span className="shrink-0">#{view.number}</span><span aria-hidden>·</span>
			<span className="inline-flex shrink-0 items-center gap-1"><presentation.Icon aria-hidden className={`size-3 ${presentation.toneClassName}`} />{presentation.label}</span>
		</div>
		<p className="mt-1 text-sm leading-snug font-medium text-pretty text-foreground">{view.title}</p>
		<div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			<ActorAvatar actor={view.authorActor} className="size-4" /><span className="min-w-0 truncate">{author}</span><span aria-hidden>·</span><span className="shrink-0">opened {formatRelativeTime(view.createdAt)}</span>
		</div>
	</div>;
}

/**
 * Hovering a pull request link (in a message, or a `#` chip in the composer) shows its
 * repository, number, state, title and author. Only pull requests in the chat project's repository can be read; others
 * show their address.
 */
export function PullRequestLinkPreview({ url, children }: { url: string; children: ReactElement }) {
	const projectId = useLinkProject();
	const repository = useProjectRepository(projectId);
	const reference = parsePullRequestReference(url);
	const [open, setOpen] = useState(false);
	const readable = Boolean(projectId && repository && reference?.repository && reference.repository.toLowerCase() === repository.toLowerCase());
	return <PreviewCard.Root open={open} onOpenChange={setOpen}>
		{/* A span, so the chip inside keeps its own click and the card gets the hover. */}
		<PreviewCard.Trigger delay={350} closeDelay={120} render={<span className="inline" />}>{children}</PreviewCard.Trigger>
		<PreviewCard.Portal>
			<PreviewCard.Positioner side="top" align="center" sideOffset={6} className="z-50">
				<PreviewCard.Popup className="w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
					{readable && reference && projectId ? open && <PreviewBody projectId={projectId} number={reference.number} /> : <p className="truncate text-xs text-muted-foreground">{url}</p>}
				</PreviewCard.Popup>
			</PreviewCard.Positioner>
		</PreviewCard.Portal>
	</PreviewCard.Root>;
}
