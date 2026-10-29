import { ArrowUp, ChevronRight, CircleAlert, Square, SquarePen, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatMessage, FactorySnapshot, WorkItem } from "../../../shared/types";
import { AgentPicker } from "../../components/AgentPicker";
import { AgentMark } from "../../components/Marks";
import { Markdown } from "../../components/Markdown";
import { Button } from "../../components/ui/button";
import { clock } from "../../lib/format";
import { factory } from "../../lib/useFactory";
import { cn } from "../../lib/utils";
import { errorText } from "../../components/AddRepo";


/** Steps the agent took between two answers, folded into one line until opened. */
function Steps({ steps }: { steps: ChatMessage[] }) {
	const [open, setOpen] = useState(false);
	return <div className="text-xs text-muted-foreground">
		<button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-md py-0.5 hover:text-foreground">
			<ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
			<Wrench className="size-3" />{steps.length === 1 ? steps[0]!.text.slice(0, 90) : `${steps.length} steps`}
		</button>
		{open && <ul className="mt-1 space-y-0.5 border-l pl-3 font-mono text-2xs">{steps.map((step, index) => <li key={index} className="break-all">{step.text}</li>)}</ul>}
	</div>;
}

/** Messages, with each run of tool steps grouped. */
function groups(messages: ChatMessage[]): (ChatMessage | ChatMessage[])[] {
	const out: (ChatMessage | ChatMessage[])[] = [];
	for (const message of messages) {
		const last = out.at(-1);
		if (message.role === "tool" && Array.isArray(last)) last.push(message);
		else out.push(message.role === "tool" ? [message] : message);
	}
	return out;
}

const SUGGESTIONS: Record<WorkItem["kind"], string[]> = {
	issue: ["What's the likely cause?", "Which files would a fix touch?", "Is this a duplicate of anything?"],
	pull: ["Summarise what this changes", "What's the riskiest part of this diff?", "What should I test before merging?"],
};

/**
 * Talk to an agent about the item, or about anything. It reads the item's worktree to answer and never
 * changes files; runs are for that. The conversation carries on across messages and app restarts.
 */
export function ChatView({ item, snapshot }: { item: WorkItem; snapshot: FactorySnapshot }) {
	const chat = snapshot.chats.find((candidate) => candidate.itemId === item.id);
	const agent = snapshot.agents.find((candidate) => candidate.id === (chat?.agentId ?? item.assigneeId)) ?? snapshot.agents[0];
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const end = useRef<HTMLDivElement>(null);
	const box = useRef<HTMLTextAreaElement>(null);
	const count = chat?.messages.length ?? 0;
	useEffect(() => end.current?.scrollIntoView({ block: "end" }), [count, chat?.thinking]);
	useEffect(() => box.current?.focus(), []);

	const send = (message = text) => {
		const value = message.trim();
		if (!value) return;
		setError(null);
		setText("");
		void factory().chatSend(item.id, value).catch((cause: unknown) => {
			setText(value);
			setError(errorText(cause));
		});
	};
	const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	};

	return <div className="mt-4 flex max-w-[820px] flex-col">
		<div className="flex items-center gap-2 pb-3">
			<AgentPicker snapshot={snapshot} value={agent?.id} onChange={(agentId) => agentId && void factory().chatAgent(item.id, agentId)} />
			<span className="text-xs text-muted-foreground">Reads the code, never changes it</span>
			<span className="flex-1" />
			{chat && count > 0 && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void factory().chatClear(item.id)}><SquarePen className="size-3.5" />New chat</Button>}
		</div>

		<div className="space-y-4">
			{count === 0 && <div className="rounded-md border border-dashed px-4 py-6 text-center">
				<p className="text-sm font-medium">Ask {agent?.label ?? "an agent"} anything</p>
				<p className="mt-1 text-xs text-muted-foreground">About this {item.kind === "pull" ? "pull request" : "issue"}, the code behind it, or anything else. It knows what Factory knows about it and can read the repository.</p>
				<div className="mt-4 flex flex-wrap justify-center gap-2">
					{SUGGESTIONS[item.kind].map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent/60">{suggestion}</button>)}
				</div>
			</div>}
			{chat && groups(chat.messages).map((entry, index) => {
				if (Array.isArray(entry)) return <Steps key={index} steps={entry} />;
				if (entry.role === "you") return <div key={index} className="flex justify-end">
					<div data-selectable className="max-w-[80%] rounded-md bg-accent px-3 py-2 text-sm whitespace-pre-wrap">{entry.text}</div>
				</div>;
				if (entry.role === "error") return <p key={index} className="flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{entry.text}</p>;
				return <div key={index} className="flex gap-3">
					<AgentMark agent={snapshot.agents.find((candidate) => candidate.id === chat.agentId) ?? agent} className="mt-0.5 size-5" />
					<div className="min-w-0 flex-1">
						<Markdown source={entry.text} repo={item.repo} />
						<p className="mt-1 text-2xs text-muted-foreground tabular-nums">{clock(entry.at)}</p>
					</div>
				</div>;
			})}
			{chat?.thinking && <div className="flex items-center gap-3 text-sm text-muted-foreground">
				<AgentMark agent={agent} className="size-5" />
				<span className="flex gap-1">{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-pulse rounded-[2px] bg-muted-foreground/60" style={{ animationDelay: `${dot * 150}ms` }} />)}</span>
				<span className="text-xs">{agent?.label ?? "The agent"} is thinking</span>
			</div>}
		</div>

		<div className="sticky bottom-0 mt-5 bg-background pt-2 pb-1">
			<div className="flex items-end gap-2 rounded-md border bg-background py-1.5 pr-1.5 pl-3 focus-within:border-ring">
				<textarea ref={box} value={text} rows={Math.min(8, Math.max(2, text.split("\n").length))} onChange={(event) => setText(event.target.value)} onKeyDown={onKey}
					placeholder={chat?.thinking ? (agent?.harness === "codex" ? "Codex reads this when it finishes answering" : "Add to what you asked") : `Message ${agent?.label ?? "the agent"}`}
					className="min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground" />
				{chat?.thinking && !text.trim()
					? <Button size="icon-sm" variant="outline" aria-label="Stop" onClick={() => void factory().chatStop(item.id)}><Square className="size-3.5 fill-current" /></Button>
					: <Button size="icon-sm" aria-label="Send" disabled={!text.trim()} onClick={() => send()}><ArrowUp className="size-4" /></Button>}
			</div>
			{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
			<p className="mt-1.5 text-2xs text-muted-foreground">Enter sends, Shift Enter for a new line.{chat?.usage ? ` ${Math.round((chat.usage.inputTokens + chat.usage.outputTokens) / 1000)}k tokens so far.` : ""}</p>
		</div>
		{/* Below the sticky box: a target inside it would always count as visible. */}
		<div ref={end} />
	</div>;
}
