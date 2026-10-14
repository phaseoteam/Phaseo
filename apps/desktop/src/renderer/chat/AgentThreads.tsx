import { useEffect, useState } from "react";
import { ChevronRight, LoaderCircle, Network, Square, SquareArrowOutUpRight } from "lucide-react";
import type { Message } from "../../shared/workspace";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { MessageContent } from "../components/MessageContent";
import { StatusDot } from "../shell/Sidebar";
import { ModelStack, modelName } from "./ModelPicker";

const working = (task: TaskOverview) => task.status === "running" || task.status === "waiting" || !!task.approvalsCount || !!task.answersCount;
const statusLabel = (task: TaskOverview) => task.approvalsCount || task.answersCount ? "Needs input" : task.status === "running" ? "Working" : task.status === "waiting" ? "Waiting" : task.status === "completed" ? "Done" : task.status === "failed" ? "Failed" : task.status === "interrupted" ? "Stopped" : task.status === "limited" ? "Usage limit" : "Idle";

function elapsed(task: TaskOverview, now: number) {
	const seconds = Math.max(0, Math.round(((working(task) ? now : Date.parse(task.updatedAt)) - Date.parse(task.createdAt)) / 1000));
	return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
}

/** Agents this chat started, live: open one, or stop the ones still working. Mirrors T3 Code's subagent cards. */
export function AgentThreads({ taskId }: { taskId: string }) {
	const { overview, select, command } = useWorkspace();
	const sorted = overview.tasks.filter(task => task.delegation?.parentTaskId === taskId || task.launch?.byTaskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	// Agents report back to this chat; launched chats are independent top-level chats it started.
	const children = sorted.filter(task => task.delegation?.parentTaskId === taskId), launched = sorted.filter(task => task.launch?.byTaskId === taskId);
	const active = children.filter(working).length, live = active + launched.filter(working).length;
	const [now, setNow] = useState(Date.now());
	useEffect(() => { if (!live) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [live]);
	if (!children.length && !launched.length) return null;
	const row = (child: TaskOverview) => <div key={child.id} role="button" tabIndex={0} onClick={() => select(child.id)} onKeyDown={event => { if (event.key === "Enter") select(child.id); }}
		className="group/agent flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-muted/60">
		<ModelStack models={[child]} size="sm" ringClassName="ring-transparent" />
		<span className="min-w-0 truncate font-medium">{child.title}</span>
		<span className="shrink-0 truncate text-xs text-muted-foreground">{modelName(child)}{child.delegation?.role ? ` · ${child.delegation.role}` : ""}</span>
		<span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			<StatusDot task={child} />{statusLabel(child)} · {elapsed(child, now)}
		</span>
		{working(child) && <button type="button" aria-label={`Stop ${child.title}`} title="Stop" onClick={event => { event.stopPropagation(); void command({ type: "cancel", id: child.id }); }}
			className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 group-hover/agent:opacity-100 hover:bg-muted hover:text-foreground"><Square className="size-3 fill-current" /></button>}
		<ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
	</div>;
	return <section aria-label="Agents started by this chat" className="flex flex-col gap-2">
		{children.length > 0 && <div className="flex flex-col gap-0.5">
			<div className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground">
				{active ? <LoaderCircle className="size-3.5 animate-spin text-primary" /> : <Network className="size-3.5" />}
				<span className="font-medium">{children.length === 1 ? "Started 1 agent" : `Started ${children.length} agents`}{active ? ` · ${active} working` : ""}</span>
				{active > 0 && <button type="button" title="Stop every agent this chat started, and the agents they started" onClick={() => { for (const child of children.filter(working)) void command({ type: "cancel", id: child.id }); }}
					className="ml-1 flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Square className="size-2.5 fill-current" />Stop all</button>}
			</div>
			<div className="ml-[7px] flex flex-col gap-0.5 border-l border-border pl-1.5">{children.map(row)}</div>
		</div>}
		{launched.length > 0 && <div className="flex flex-col gap-0.5">
			<div className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground"><SquareArrowOutUpRight className="size-3.5" /><span className="font-medium">{launched.length === 1 ? "Launched 1 chat" : `Launched ${launched.length} chats`}</span></div>
			<div className="ml-[7px] flex flex-col gap-0.5 border-l border-border pl-1.5">{launched.map(row)}</div>
		</div>}
	</section>;
}

/** A delegated agent's result delivered back to this chat, shown in place of a user message. */
export function AgentResult({ message, projectId }: { message: Message; projectId?: string }) {
	const [open, setOpen] = useState(false);
	const agents = (message.text.match(/^Delegated agent/gm) ?? []).length || 1;
	return <div data-conversation-id={`message:${message.id}`}>
		<button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground hover:text-foreground">
			<ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
			<Network className="size-3.5" />
			<span className="font-medium">{agents === 1 ? "Agent result" : `Results from ${agents} agents`}</span>
			<span>· {new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
		</button>
		{open && <div data-selectable className="mt-1 ml-[7px] border-l border-border py-0.5 pl-4 text-[13px] text-foreground/85"><MessageContent text={message.text} projectId={projectId} /></div>}
	</div>;
}
