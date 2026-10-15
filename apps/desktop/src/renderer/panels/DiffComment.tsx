import { useLayoutEffect, useRef } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";

/** T3's inline comment: a saved comment is a left-ruled row; a draft is a small form under the lines. */
export function DiffComment({ kind, rangeLabel, text, onTextChange, onCancel, onComment, onDelete }: { kind: "draft" | "comment"; rangeLabel: string; text: string; onTextChange?: (text: string) => void; onCancel: () => void; onComment: (text: string) => void; onDelete?: () => void }) {
	const input = useRef<HTMLTextAreaElement>(null);
	const trimmed = text.trim();
	useLayoutEffect(() => {
		if (kind !== "draft") return;
		const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
		return () => cancelAnimationFrame(frame);
	}, [kind]);
	if (kind === "comment") return <div data-diff-comment className="group/comment flex min-w-0 items-start gap-2.5 border-s-2 border-primary/55 bg-primary/[0.045] px-3 py-2.5 font-sans text-foreground" contentEditable={false} onPointerDown={event => event.stopPropagation()}>
		<MessageCircle className="mt-0.5 size-3.5 shrink-0 text-primary/70" aria-hidden />
		<p className="min-w-0 flex-1 text-sm leading-5 whitespace-pre-wrap">{text}</p>
		{onDelete && <span className="-my-1 -mr-1 flex shrink-0 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100">
			<Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete} className="text-muted-foreground"><Trash2 className="size-3" /></Button>
		</span>}
	</div>;
	return <div data-diff-comment className="px-3 py-2 font-sans text-foreground" contentEditable={false} onPointerDown={event => event.stopPropagation()}>
		<textarea ref={input} rows={2} value={text} placeholder="Add a comment…" aria-label={`Comment on lines ${rangeLabel}`} onChange={event => onTextChange?.(event.target.value)}
			onKeyDown={event => {
				if (event.key === "Escape") { event.preventDefault(); onCancel(); }
				if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && trimmed) { event.preventDefault(); onComment(trimmed); }
			}}
			className="block min-h-14 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
		<div className="mt-1.5 flex items-center gap-1">
			<span className="mr-auto text-[10px] text-muted-foreground/70">Ctrl Enter to add to the chat</span>
			<Button variant="ghost" size="xs" onClick={onCancel}>Cancel</Button>
			<Button size="xs" disabled={!trimmed} onClick={() => onComment(trimmed)}>Comment</Button>
		</div>
	</div>;
}
