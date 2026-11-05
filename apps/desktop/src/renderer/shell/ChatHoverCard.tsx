import { useEffect, useState, type ReactElement } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { formatAgoShort, formatDateTime } from "@phaseo/app-kit/format";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { formatSpend } from "../../shared/usageAmounts";
import { visiblePullRequestLinks } from "../../shared/pullRequestStacks";
import { useWorkspace } from "../app/workspace";
import { cachedTask } from "../lib/useSelectedTask";
import { harnessNames, ModelStack, modelName } from "../chat/ModelPicker";

const statusText: Record<TaskOverview["status"], string> = { idle: "Ready", running: "Working", waiting: "Waiting", completed: "Done", failed: "Failed", interrupted: "Interrupted", limited: "Hit a usage limit" };

/** The latest reply, as one plain line: Markdown markers and links reduced to their words. */
export function replyPreview(text: string) {
	return text.replace(/```[\s\S]*?(```|$)/g, " ").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_~`>#|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
}

/** "5m ago", or "just now" under a minute. */
const ago = (iso: string) => { const value = formatAgoShort(iso); return value === "now" ? "just now" : value ? `${value} ago` : ""; };

function Body({ task }: { task: TaskOverview }) {
	const { overview } = useWorkspace();
	const [reply, setReply] = useState<string>();
	useEffect(() => {
		let active = true;
		const cached = cachedTask(task.id, task.revision);
		void (cached ? Promise.resolve(cached) : window.phaseoDesktop?.workspace.task(task.id))?.then(full => {
			const last = full.messages.findLast(message => message.role === "assistant" && message.delivery !== "subagent" && message.text.trim());
			if (active) setReply(last ? replyPreview(last.text) : "");
		}, () => { if (active) setReply(""); });
		return () => { active = false; };
	}, [task.id, task.revision]);
	const project = overview.projects.find(value => value.id === task.projectId);
	const needs = task.approvalsCount ? "Needs an approval" : task.answersCount ? "Needs an answer" : undefined;
	const pulls = visiblePullRequestLinks(task.pullRequests).length;
	const facts = [project?.name, task.usageTotals?.costNanos ? formatSpend(task.usageTotals.costNanos) : undefined, pulls ? (pulls === 1 ? "1 pull request" : `${pulls} pull requests`) : undefined].filter(Boolean);
	return <div className="flex min-w-0 flex-col gap-1.5">
		<p className="text-sm leading-snug font-medium text-pretty text-foreground">{task.title}</p>
		<p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			<span className="shrink-0"><ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /></span>
			<span className="min-w-0 truncate">{task.model === "default" ? harnessNames[task.harness] : modelName(task)}</span><span aria-hidden>·</span>
			<span className={needs ? "shrink-0 text-warning" : "shrink-0"}>{needs ?? statusText[task.status]}</span>
		</p>
		{facts.length > 0 && <p className="truncate text-xs text-muted-foreground">{facts.join(" · ")}</p>}
		{reply === undefined ? <p className="text-xs text-muted-foreground">Loading the latest reply…</p> : reply && <p className="line-clamp-3 text-xs leading-relaxed text-foreground/80">{reply}</p>}
		<p className="text-2xs text-muted-foreground" title={formatDateTime(task.createdAt)}>Started {ago(task.createdAt)} · updated {ago(task.updatedAt)}</p>
	</div>;
}

/** Hovering a chat in the sidebar shows what it is, where it stands and its latest reply, without opening it. */
export function ChatHoverCard({ task, disabled, children }: { task: TaskOverview; disabled?: boolean; children: ReactElement }) {
	const [open, setOpen] = useState(false);
	if (disabled) return children;
	return <PreviewCard.Root open={open} onOpenChange={setOpen}>
		<PreviewCard.Trigger delay={700} closeDelay={80} render={<div />}>{children}</PreviewCard.Trigger>
		<PreviewCard.Portal>
			<PreviewCard.Positioner side="right" align="start" sideOffset={10} className="z-50">
				<PreviewCard.Popup data-chat-hover-card={task.id} className="w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
					{open && <Body task={task} />}
				</PreviewCard.Popup>
			</PreviewCard.Positioner>
		</PreviewCard.Portal>
	</PreviewCard.Root>;
}
