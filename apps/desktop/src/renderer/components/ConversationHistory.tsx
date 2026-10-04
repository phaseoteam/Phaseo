import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Paperclip } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { MessageContent } from "./MessageContent";

const pageSize = 50;

export function ConversationHistory({ task, onAttachment, children }: { task: Task; onAttachment: (id: string) => void; children: ReactNode }) {
	const host = useRef<HTMLDivElement>(null);
	const anchor = useRef<{ height: number; top: number } | undefined>(undefined);
	const [firstMessage, setFirstMessage] = useState(() => task.messages[Math.max(0, task.messages.length - pageSize)]?.id);
	const [firstActivity, setFirstActivity] = useState(() => task.activities?.[Math.max(0, task.activities.length - pageSize)]?.id);
	const messageStart = Math.max(0, task.messages.findIndex(value => value.id === firstMessage));
	const activityStart = Math.max(0, task.activities?.findIndex(value => value.id === firstActivity) ?? 0);
	useLayoutEffect(() => {
		if (host.current && anchor.current) { host.current.scrollTop = anchor.current.top + host.current.scrollHeight - anchor.current.height; anchor.current = undefined; }
	}, [firstMessage, firstActivity]);
	function rememberPosition() { if (host.current) anchor.current = { height: host.current.scrollHeight, top: host.current.scrollTop }; }
	return <div className="task-messages" ref={host} aria-live="polite">
		{messageStart > 0 && <div className="conversation-history-controls"><button type="button" onClick={() => { rememberPosition(); setFirstMessage(task.messages[Math.max(0, messageStart - pageSize)].id); }}>Load older messages</button><small>{messageStart} earlier messages</small></div>}
		{task.messages.length ? task.messages.slice(messageStart).map(message => <article className={`task-message task-message-${message.role}`} key={message.id}><small>{message.role === "user" ? "You" : message.role === "assistant" ? task.harness : message.role}</small>{message.role === "assistant" ? <MessageContent text={message.text} /> : <div>{message.text}</div>}{message.attachments?.map(attachment => <button type="button" className="attachment-chip" key={attachment.id} onClick={() => onAttachment(attachment.id)}><Paperclip size={12} />{attachment.name}</button>)}</article>) : <p className="task-muted">Send a message to start.</p>}
		{activityStart > 0 && <div className="conversation-history-controls"><button type="button" onClick={() => { rememberPosition(); setFirstActivity(task.activities![Math.max(0, activityStart - pageSize)].id); }}>Load older activities</button><small>{activityStart} earlier activities</small></div>}
		{task.activities?.slice(activityStart).map(activity => <details className="task-activity" key={activity.id}><summary>{activity.title}{activity.status ? ` · ${activity.status}` : ""}</summary><pre>{activity.text}</pre></details>)}
		{children}
	</div>;
}
