import { formatDateParts } from "@phaseo/app-kit/format";
import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import type { MessageSearchHit } from "../../shared/conversationSearch";
import { CommandGroup, CommandItem } from "../components/ui/command";

/** Message search runs from two characters, after a pause in typing. */
export function useMessageSearch(query: string, open: boolean) {
	const [state, setState] = useState<{ query: string; hits: MessageSearchHit[] }>();
	const text = query.trim();
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!open || text.length < 2 || !api) return;
		let active = true;
		const timer = setTimeout(() => void api.searchMessages({ query: text, limit: 20 }).then(hits => { if (active) setState({ query: text, hits }); }, () => { if (active) setState({ query: text, hits: [] }); }), 200);
		return () => { active = false; clearTimeout(timer); };
	}, [text, open]);
	const current = text.length >= 2 && state?.query === text ? state.hits : undefined;
	return { hits: current ?? [], searching: text.length >= 2 && !current };
}

/** The snippet with each occurrence of the query in bold. */
export function snippetParts(snippet: string, query: string) {
	const needle = query.trim().toLowerCase(), lower = snippet.toLowerCase(), parts: { text: string; match: boolean }[] = [];
	let at = 0;
	for (let found = needle ? lower.indexOf(needle) : -1; found >= 0; found = lower.indexOf(needle, found + needle.length)) {
		if (found > at) parts.push({ text: snippet.slice(at, found), match: false });
		parts.push({ text: snippet.slice(found, found + needle.length), match: true });
		at = found + needle.length;
	}
	if (at < snippet.length) parts.push({ text: snippet.slice(at), match: false });
	return parts;
}

const when = (iso?: string) => iso ? formatDateParts(iso, { month: "short", day: "numeric" }) : "";

/** "In messages": chats whose messages match, each with its latest match; choosing one opens it with find on the word. */
export function MessageSearchResults({ query, hits, searching, onOpen }: { query: string; hits: MessageSearchHit[]; searching: boolean; onOpen: (hit: MessageSearchHit) => void }) {
	if (!hits.length && !searching) return null;
	return <CommandGroup heading="In messages" forceMount>
		{searching && !hits.length && <CommandItem forceMount disabled value="searching messages"><span className="text-muted-foreground">Searching messages…</span></CommandItem>}
		{hits.map(hit => <CommandItem key={hit.taskId} forceMount value={`message ${hit.taskId} ${hit.messageId}`} onSelect={() => onOpen(hit)} className="items-start">
			<MessageSquareText className="mt-0.5" />
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{hit.title}</span><span className="shrink-0 text-xs text-muted-foreground">{hit.matches > 1 ? `${hit.matches} messages · ` : ""}{when(hit.createdAt)}</span></span>
				<span className="line-clamp-2 text-xs text-muted-foreground">{hit.role === "user" ? "You: " : ""}{snippetParts(hit.snippet, query).map((part, index) => part.match ? <mark key={index} className="bg-transparent font-semibold text-foreground">{part.text}</mark> : <span key={index}>{part.text}</span>)}</span>
			</span>
		</CommandItem>)}
	</CommandGroup>;
}
