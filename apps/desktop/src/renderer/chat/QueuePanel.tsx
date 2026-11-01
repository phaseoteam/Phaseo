import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CornerDownRight, LoaderCircle, Pencil, X } from "lucide-react";
import type { Harness, QueuedMessage, Task } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { shortcut } from "../lib/keybindings";
import { mentionPlainText } from "../lib/mentions";
import { cn } from "../lib/utils";
import { harnessNames } from "./ModelPicker";

/** Harnesses whose adapters take a message mid-turn (`steer` in main/*Adapter.ts). The rest wait for the turn to end. */
const steerable: ReadonlySet<Harness> = new Set(["codex", "cursor", "opencode", "phaseo", "pi"]);
const live = (task: Pick<Task, "status">) => task.status === "running" || task.status === "waiting";
/** Why a message cannot go into the running turn now, or undefined when it can. */
export function steerBlocker(task: Pick<Task, "harness" | "status">) {
	if (!live(task)) return "The turn has finished; queued messages send by themselves.";
	return steerable.has(task.harness) ? undefined : `${harnessNames[task.harness]} can't take messages mid-turn, so queued messages send when the turn finishes.`;
}
/** The person's own queued messages; pull request updates and agent results are the app's. */
export const ownQueue = (task: Pick<Task, "queue">) => task.queue.filter(message => !message.notice && !message.sourceTaskId);
/** Who a queued message is from when it is not the person: Autopilot, a watched pull request or issue, or another chat's agent. */
export function queueSender(message: Pick<QueuedMessage, "autopilot" | "notice" | "sourceTaskId" | "sourceTaskIds">, chatTitle: (id: string) => string | undefined = () => undefined) {
	if (message.notice) return message.notice.kind === "issue" ? "Issue update" : "Pull request update";
	if (message.sourceTaskId) { const others = (message.sourceTaskIds?.length ?? 1) - 1; return `${chatTitle(message.sourceTaskId) || "Agent"}${others > 0 ? ` and ${others} more` : ""}`; }
	return message.autopilot ? "Autopilot" : undefined;
}

function RowButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-3.5">{children}</button>;
}

/**
 * The queue above the composer: queued follow-ups can be edited in the composer, reordered, removed, or sent into
 * the running turn now. Instructions sent mid-turn that the agent refused or never confirmed wait here for a decision.
 */
export function QueuePanel({ task, editingId, onEdit, onSteer }: { task: Task; editingId?: string; onEdit: (id: string) => void; onSteer: (id: string) => void }) {
	const { command, overview } = useWorkspace();
	const queue = task.queue, steering = task.steering ?? [];
	const chatTitle = (id: string) => overview.tasks.find(value => value.id === id)?.title;
	if (!queue.length && !steering.length) return null;
	const blocker = steerBlocker(task), steerKey = shortcut("composer.steer"), firstOwn = ownQueue(task)[0];
	return <section aria-label={`${queue.length} queued message${queue.length === 1 ? "" : "s"}`} className="mb-2 flex flex-col gap-0.5 px-1">
		{steering.map(message => <div key={message.id} className="flex items-center gap-2 py-0.5 text-[13px]">
			{message.status === "sending" ? <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : <CornerDownRight aria-hidden className="size-3.5 shrink-0 text-warning" />}
			<span className="min-w-0 flex-1 truncate" title={mentionPlainText(message.text)}>{mentionPlainText(message.text)}</span>
			{message.status === "sending" ? <span className="shrink-0 text-xs text-muted-foreground">Sending into the turn…</span> : <>
				<span className="max-w-64 shrink truncate text-xs text-muted-foreground" title={message.error}>{message.status === "rejected" ? "Not taken" : "Delivery not confirmed"}{message.error ? `: ${message.error}` : ""}</span>
				<button type="button" onClick={() => void command({ type: "steer-queue", id: task.id, messageId: message.id })} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted">Queue it</button>
				<button type="button" onClick={() => void command({ type: "steer-discard", id: task.id, messageId: message.id })} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Discard</button>
			</>}
		</div>)}
		{queue.length > 0 && <p className="text-[11px] text-muted-foreground">{blocker && live(task) ? `Queued · ${blocker}` : "Queued · sends when the current turn finishes"}</p>}
		<ol className="flex flex-col">{queue.map((message, index) => {
			const editing = message.id === editingId, sender = queueSender(message, chatTitle), text = message.notice?.summary ?? mentionPlainText(message.text);
			// Updates and other agents' results are the app's to deliver as they are; only the person's own can be edited or sent now.
			const own = !message.notice && !message.sourceTaskId;
			return <li key={message.id} aria-label={`Queued message ${index + 1} of ${queue.length}${sender ? ` from ${sender}` : ""}`} aria-current={editing ? "true" : undefined} className="group/queued flex items-center gap-2 py-0.5 text-[13px]">
				{sender && <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground" title={sender}>{sender}</span>}
				<span className={cn("min-w-0 flex-1 truncate", editing ? "text-foreground" : "text-foreground/85")} title={text}>{text || `${message.attachments?.length ?? 0} attachments`}</span>
				{editing ? <span className="shrink-0 text-xs text-muted-foreground">Editing in the composer</span> : <span className="flex shrink-0 items-center opacity-70 group-focus-within/queued:opacity-100 group-hover/queued:opacity-100">
					{own && <button type="button" disabled={Boolean(blocker)} title={blocker ?? `Send into the current turn${message === firstOwn && steerKey ? ` (${steerKey})` : ""}`} onClick={() => onSteer(message.id)} className="mr-1 flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"><ArrowUp className="size-3" />Send now</button>}
					{own && <RowButton label="Edit queued message" onClick={() => onEdit(message.id)}><Pencil /></RowButton>}
					{queue.length > 1 && <RowButton label="Move up" disabled={index === 0} onClick={() => void command({ type: "queue-move", id: task.id, messageId: message.id, direction: "up" })}><ArrowUp /></RowButton>}
					{queue.length > 1 && <RowButton label="Move down" disabled={index === queue.length - 1} onClick={() => void command({ type: "queue-move", id: task.id, messageId: message.id, direction: "down" })}><ArrowDown /></RowButton>}
					<RowButton label="Remove queued message" onClick={() => void command({ type: "queue-remove", id: task.id, messageId: message.id })}><X /></RowButton>
				</span>}
			</li>;
		})}</ol>
	</section>;
}
