import { turnUsage } from "../lib/turnUsage";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronRight, Copy, GitBranch, Info, Paperclip } from "lucide-react";
import type { Message, Task } from "../../shared/workspace";
import { HarnessLogo } from "./HarnessLogo";
import { MessageContent } from "./MessageContent";
import { useTextCopy } from "./useTextCopy";

const harnessNames = { phaseo: "Phaseo", codex: "Codex", claude: "Claude Code", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok", antigravity: "Antigravity", acp: "Agent" };
export function ConversationMessage({ message, task, onAttachment, onBranch }: { message: Message; task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void }) {
	const { status, copying, copy } = useTextCopy(message.text);
	const index = task.messages.findIndex(value => value.id === message.id);
	const turn = task.messages.slice(0, index + 1).findLast(value => value.role === "user");
	const usage = task.activities?.filter(value => value.type === "usage" && turn && value.id.startsWith(turn.id + ":")) ?? [];
	const totals = turnUsage(usage);
	const assistant = message.role === "assistant";
	if (message.delivery === "subagent") return <details className="subagent-result"><summary><ChevronRight size={14} /><GitBranch size={14} />Agent result</summary><MessageContent text={message.text} projectId={task.projectId} /></details>;
	return <article data-conversation-id={`message:${message.id}`} className={`task-message task-message-${message.role}`} aria-label={message.role === "user" ? "Your message" : assistant ? "Assistant message" : "System message"}>
		{assistant && <header className="conversation-message-header"><HarnessLogo harness={task.harness} /><span>{task.model === "default" ? harnessNames[task.harness] : task.model}</span></header>}
		<div className="conversation-message-body">{assistant ? <MessageContent text={message.text} projectId={task.projectId} repairLocalLinks /> : <div>{message.text}</div>}
		{message.attachments?.map(attachment => <button type="button" className="attachment-chip" key={attachment.id} onClick={() => onAttachment(attachment.id)}><Paperclip size={12} />{attachment.name}</button>)}</div>
		<footer className="conversation-message-footer"><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time><button type="button" aria-label={status === "copied" ? "Message copied" : "Copy message"} title="Copy message" disabled={copying || !message.text} onClick={() => void copy()}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}</button><button type="button" aria-label="Branch from message" title="Branch from message" disabled={task.status === "running" || task.status === "waiting"} onClick={() => onBranch(message.id)}><GitBranch size={14} /></button><Popover.Root><Popover.Trigger aria-label="Message information" title="Message information"><Info size={14} /></Popover.Trigger><Popover.Portal><Popover.Positioner side="top" sideOffset={8} className="desktop-select-positioner"><Popover.Popup className="message-info-popup"><dl><dt>Model</dt><dd>{task.model}</dd><dt>Sent</dt><dd>{new Date(message.createdAt).toLocaleString()}</dd></dl>{assistant && <><strong>Reported usage</strong>{Object.keys(totals).length > 0 && <dl>{Object.entries(totals).map(([label, value]) => <div className="usage-metric" key={label}><dt>{label} tokens</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>}{!Object.keys(totals).length && <p>Usage not reported.</p>}</>}</Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>{status === "failed" && <span role="status">Copy failed</span>}</footer>
	</article>;
}
