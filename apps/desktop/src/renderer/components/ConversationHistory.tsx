import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Paperclip } from "lucide-react";
import type { AgentActivity, Message, Task } from "../../shared/workspace";
import { ActivityResult } from "./ActivityResult";
import { MessageContent } from "./MessageContent";
import { useConversationPage } from "../lib/useConversationPage";

export function ConversationHistory({ task, onAttachment, children }: { task: Task; onAttachment: (id: string) => void; children: ReactNode }) {
	const host = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const followingLatest = useRef(true);
	const [showLatest, setShowLatest] = useState(false);
	const anchor = useRef<{ id?: string; top: number; scroll: number } | undefined>(undefined);
	const messages = useConversationPage(task, "messages", followingLatest, rememberPosition);
	const activities = useConversationPage(task, "activities", followingLatest, rememberPosition);
	useLayoutEffect(() => {
		if (!host.current) return;
		if (anchor.current) { const saved = anchor.current; const entry = saved.id ? host.current.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(saved.id)}"]`) : undefined; host.current.scrollTop = entry ? host.current.scrollTop + entry.getBoundingClientRect().top - saved.top : saved.scroll; anchor.current = undefined; updatePosition(); }
		else if (followingLatest.current) host.current.scrollTop = host.current.scrollHeight;
	}, [task, messages.page, activities.page, messages.loading, activities.loading, messages.error, activities.error]);
	useEffect(() => {
		if (!content.current) return;
		const observer = new ResizeObserver(() => { if (host.current && followingLatest.current && !anchor.current) host.current.scrollTop = host.current.scrollHeight; });
		observer.observe(content.current); return () => observer.disconnect();
	}, []);
	function updatePosition() { if (!host.current) return; const latest = !messages.page.later && !activities.page.later && host.current.scrollHeight - host.current.clientHeight - host.current.scrollTop <= 48; followingLatest.current = latest; setShowLatest(!latest); }
	function rememberPosition() { if (host.current) { followingLatest.current = false; const top = host.current.getBoundingClientRect().top; const entry = Array.from(host.current.querySelectorAll<HTMLElement>("[data-conversation-id]")).find(value => value.getBoundingClientRect().bottom >= top); anchor.current = { id: entry?.dataset.conversationId, top: entry?.getBoundingClientRect().top ?? top, scroll: host.current.scrollTop }; } }
	function jumpToLatest() { followingLatest.current = true; messages.latest(); activities.latest(); if (host.current) host.current.scrollTop = host.current.scrollHeight; setShowLatest(false); }
	return <div className="conversation-scroll-region"><div className="task-messages" ref={host} onScroll={updatePosition} aria-live="polite"><div ref={content}>
		{messages.page.earlier > 0 && <div className="conversation-history-controls"><button type="button" disabled={messages.loading} onClick={messages.older}>Load older messages</button><small>{messages.page.earlier} earlier messages</small></div>}
		{messages.loading && <p className="task-muted" role="status">Loading messages…</p>}
		{messages.error && <div className="conversation-history-controls" role="alert"><span>{messages.error}</span><button type="button" disabled={messages.loading} onClick={messages.retry}>Retry messages</button></div>}
		{messages.page.entries.length ? (messages.page.entries as Message[]).map(message => <article data-conversation-id={`message:${message.id}`} className={`task-message task-message-${message.role}`} key={message.id}><small>{message.role === "user" ? "You" : message.role === "assistant" ? task.harness : message.role}</small>{message.role === "assistant" ? <MessageContent text={message.text} projectId={task.projectId} /> : <div>{message.text}</div>}{message.attachments?.map(attachment => <button type="button" className="attachment-chip" key={attachment.id} onClick={() => onAttachment(attachment.id)}><Paperclip size={12} />{attachment.name}</button>)}</article>) : <p className="task-muted">Send a message to start.</p>}
		{messages.page.later > 0 && <div className="conversation-history-controls"><button type="button" disabled={messages.loading} onClick={messages.newer}>Load newer messages</button><small>{messages.page.later} newer messages</small></div>}
		{activities.page.earlier > 0 && <div className="conversation-history-controls"><button type="button" disabled={activities.loading} onClick={activities.older}>Load older activities</button><small>{activities.page.earlier} earlier activities</small></div>}
		{activities.loading && <p className="task-muted" role="status">Loading activities…</p>}
		{activities.error && <div className="conversation-history-controls" role="alert"><span>{activities.error}</span><button type="button" disabled={activities.loading} onClick={activities.retry}>Retry activities</button></div>}
		{(activities.page.entries as AgentActivity[]).map(activity => <ActivityResult key={activity.id} activity={activity} />)}
		{activities.page.later > 0 && <div className="conversation-history-controls"><button type="button" disabled={activities.loading} onClick={activities.newer}>Load newer activities</button><small>{activities.page.later} newer activities</small></div>}
		{children}
	</div></div>{(showLatest || messages.page.later > 0 || activities.page.later > 0) && <button type="button" className="conversation-latest" disabled={messages.loading || activities.loading} onClick={jumpToLatest}><ArrowDown size={14} />Jump to latest</button>}</div>;
}
