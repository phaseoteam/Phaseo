import { useEffect, useState, type RefObject } from "react";
import { GitBranch, X } from "lucide-react";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { HarnessLogo } from "./HarnessLogo";

export function ThreadReferences({ ids, tasks, onRemove }: { ids: string[]; tasks: TaskOverview[]; onRemove: (id: string) => void }) {
	if (!ids.length) return null;
	return <div className="attachment-drafts">{ids.map(id => <span key={id} className="attachment-chip"><GitBranch size={12} />{tasks.find(task => task.id === id)?.title ?? "Referenced chat"}<button type="button" aria-label="Remove chat reference" onClick={() => onRemove(id)}><X size={12} /></button></span>)}</div>;
}
export function ThreadReferenceMenu({ tasks, query, onChoose, input }: { tasks: TaskOverview[]; query: string; input: RefObject<HTMLTextAreaElement | null>; onChoose: (id: string) => void }) {
	const matches = tasks.filter(task => !task.archived && task.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
	const [selection, setSelection] = useState({ query, index: 0 });
	const [dismissed, setDismissed] = useState<string>();
	const index = selection.query === query ? Math.min(selection.index, Math.max(0, matches.length - 1)) : 0;
	useEffect(() => {
		const element = input.current;
		const handle = (event: KeyboardEvent) => {
			if (dismissed === query || event.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
			if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
			event.preventDefault(); event.stopImmediatePropagation();
			if (event.key === "Escape") setDismissed(query);
			else if (event.key === "Enter") { if (matches[index]) onChoose(matches[index].id); }
			else if (matches.length) setSelection({ query, index: (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length });
		};
		element?.addEventListener("keydown", handle, true); return () => element?.removeEventListener("keydown", handle, true);
	}, [input, query, dismissed, index, matches, onChoose]);
	if (dismissed === query) return null;
	return <div className="thread-reference-menu" aria-label="Reference a chat">{matches.length ? matches.map((task, position) => <button type="button" key={task.id} className={`delegated-thread ${position === index ? "highlighted" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => onChoose(task.id)}><HarnessLogo harness={task.harness} /><span className="delegated-thread-title">{task.title}</span></button>) : <span>No matching chats</span>}</div>;
}
