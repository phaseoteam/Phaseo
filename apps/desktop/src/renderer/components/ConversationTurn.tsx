import { useLayoutEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { AgentActivity, Message, Task } from "../../shared/workspace";
import { turnDuration, type TurnEntry } from "../lib/conversationTurns";
import { ConversationMessage } from "./ConversationMessage";
import { ActivityResult } from "./ActivityResult";
import { ActivityGroup } from "./ActivityGroup";

export function ConversationTurn({ user, entries, live, complete, task, onAttachment, onBranch }: { user?: Message; entries: TurnEntry[]; live: boolean; complete: boolean; task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void }) {
	const disclosure = useRef<HTMLDetailsElement>(null);
	useLayoutEffect(() => { if (disclosure.current) disclosure.current.open = live; }, [live]);
	const final = complete && !live ? entries.findLast(entry => entry.kind === "message" && entry.value.role === "assistant") : undefined;
	const work = entries.filter(entry => entry !== final);
	const groups: (TurnEntry | { kind: "tools"; values: AgentActivity[] })[] = [];
	for (const entry of work) {
		if (entry.kind === "activity" && entry.value.type === "tool") { const previous = groups.at(-1); if (previous?.kind === "tools") previous.values.push(entry.value); else groups.push({ kind: "tools", values: [entry.value] }); }
		else groups.push(entry);
	}
	const renderMessage = (message: Message) => <ConversationMessage key={`message:${message.id}`} message={message} task={task} onAttachment={onAttachment} onBranch={onBranch} />;
	const body = groups.map(entry => entry.kind === "message" ? renderMessage(entry.value) : entry.kind === "tools" ? <ActivityGroup key={entry.values[0].id} activities={entry.values} /> : <ActivityResult key={entry.value.id} activity={entry.value} live={live} />);
	return <>{user && renderMessage(user)}{work.length > 0 && (live || !complete ? <div className="turn-work-live">{body}</div> : <details ref={disclosure} className="turn-work" data-conversation-id={`turn:${user?.id ?? work[0].value.id}`}><summary>{turnDuration(user)}<ChevronRight size={13} /></summary><div className="turn-work-content">{body}</div></details>)}{final?.kind === "message" && <div className="turn-final">{renderMessage(final.value)}</div>}</>;
}
