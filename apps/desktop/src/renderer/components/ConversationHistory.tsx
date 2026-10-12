import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import type { AgentActivity, Message, Task } from "../../shared/workspace";
import { ConversationTurn } from "./ConversationTurn";
import { ScrollArea } from "./ScrollArea";
import { useConversationPage } from "../lib/useConversationPage";
import { conversationTurns } from "../lib/conversationTurns";

export function ConversationHistory({ task, onAttachment, onBranch, children }: { task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; children: ReactNode }) {
	const host = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const followingLatest = useRef(true);
	const [showLatest, setShowLatest] = useState(false);
	const anchor = useRef<{ id?: string; top: number; scroll: number } | undefined>(undefined);
	const messages = useConversationPage(task, "messages", followingLatest, rememberPosition);
	const activities = useConversationPage(task, "activities", followingLatest, rememberPosition);
	const turns = conversationTurns(messages.page.entries as Message[], activities.page.entries as AgentActivity[]);
	const activeTurn = task.messages.findLast(message => message.role === "user")?.id;
	useLayoutEffect(() => {
		if (!host.current) return;
		if (anchor.current) { const saved = anchor.current; const entry = saved.id ? host.current.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(saved.id)}"]`) : undefined; host.current.scrollTop = entry ? host.current.scrollTop + entry.getBoundingClientRect().top - saved.top : saved.scroll; anchor.current = undefined; updatePosition(); }
		else if (followingLatest.current) host.current.scrollTop = host.current.scrollHeight;
	}, [task, messages.page, activities.page, messages.loading, activities.loading, messages.error, activities.error]);
	useEffect(() => {
		if (!content.current || !host.current) return;
		const detail = host.current.closest<HTMLElement>(".task-detail");
		const observer = new ResizeObserver(() => {
			if (!host.current) return;
			// Reserve the native scrollbar gutter in the sibling composer as well.
			detail?.style.setProperty("--conversation-scrollbar", `${host.current.offsetWidth - host.current.clientWidth}px`);
			if (followingLatest.current && !anchor.current) host.current.scrollTop = host.current.scrollHeight;
		});
		observer.observe(content.current); observer.observe(host.current);
		return () => { observer.disconnect(); detail?.style.removeProperty("--conversation-scrollbar"); };
	}, []);
	function updatePosition() { if (!host.current) return; const latest = !messages.page.later && !activities.page.later && host.current.scrollHeight - host.current.clientHeight - host.current.scrollTop <= 48; followingLatest.current = latest; setShowLatest(!latest); }
	function rememberPosition() { if (host.current) { followingLatest.current = false; const top = host.current.getBoundingClientRect().top; const entry = Array.from(host.current.querySelectorAll<HTMLElement>("[data-conversation-id]")).find(value => value.getBoundingClientRect().bottom >= top); anchor.current = { id: entry?.dataset.conversationId, top: entry?.getBoundingClientRect().top ?? top, scroll: host.current.scrollTop }; } }
	function jumpToLatest() { followingLatest.current = true; messages.latest(); activities.latest(); if (host.current) host.current.scrollTop = host.current.scrollHeight; setShowLatest(false); }
	return <div className="conversation-scroll-region"><ScrollArea className="conversation-history-scroll" viewportClassName="task-messages" viewportRef={host} viewportProps={{ onScroll: updatePosition, "aria-live": "polite" }}><div ref={content}>
		{messages.page.earlier > 0 && <div className="conversation-history-controls"><button type="button" disabled={messages.loading} onClick={messages.older}>Load older messages</button><small>{messages.page.earlier} earlier messages</small></div>}
		{messages.loading && !messages.page.entries.length && <p className="task-muted" role="status">Loading messages…</p>}
		{messages.error && <div className="conversation-history-controls" role="alert"><span>{messages.error}</span><button type="button" disabled={messages.loading} onClick={messages.retry}>Retry messages</button></div>}
		{turns.map((turn, index) => <ConversationTurn key={turn.id} user={turn.user} entries={turn.entries} live={["running", "waiting"].includes(task.status) && (turn.user?.id === activeTurn || (!turn.user && index === turns.length - 1 && !messages.page.later))} complete={Boolean(turn.user?.completedAt) || index < turns.length - 1 || (!messages.page.later && !activities.page.later && !["running", "waiting"].includes(task.status))} task={{ ...task, messages: messages.page.entries as Message[], activities: activities.page.entries as AgentActivity[] }} onAttachment={onAttachment} onBranch={onBranch} />)}
		{!messages.page.entries.length && <p className="task-muted">Send a message to start.</p>}
		{messages.page.later > 0 && <div className="conversation-history-controls"><button type="button" disabled={messages.loading} onClick={messages.newer}>Load newer messages</button><small>{messages.page.later} newer messages</small></div>}
		{activities.page.earlier > 0 && <div className="conversation-history-controls"><button type="button" disabled={activities.loading} onClick={activities.older}>Load older activities</button><small>{activities.page.earlier} earlier activities</small></div>}
		{activities.loading && !activities.page.entries.length && <p className="task-muted" role="status">Loading activities…</p>}
		{activities.error && <div className="conversation-history-controls" role="alert"><span>{activities.error}</span><button type="button" disabled={activities.loading} onClick={activities.retry}>Retry activities</button></div>}
		{activities.page.later > 0 && <div className="conversation-history-controls"><button type="button" disabled={activities.loading} onClick={activities.newer}>Load newer activities</button><small>{activities.page.later} newer activities</small></div>}
		{children}
		{task.status === "running" && !messages.page.later && !activities.page.later && <div className="conversation-working" role="status"><LoaderCircle size={14} aria-hidden="true" /><span className="live-shimmer">Working…</span></div>}
	</div></ScrollArea>{(showLatest || messages.page.later > 0 || activities.page.later > 0) && <button type="button" className="conversation-latest" disabled={messages.loading || activities.loading} onClick={jumpToLatest}><ArrowDown size={14} />Jump to latest</button>}</div>;
}
