import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MessageContent } from "./MessageContent";

/** Markdown longer than this is split into pieces of about this many characters. */
export const markdownChunkSize = 8_000;
/** How much is drawn straight away; the rest follows as it is scrolled to. */
const firstCharacters = 16_000;

const fence = /^ {0,3}(`{3,}|~{3,})/;
// A reference definition or footnote may be used in another piece, and HTML blocks can hold blank lines: keep those whole.
const keepWhole = /^ {0,3}\[[^\]\n]+\]:|<(details|div|table|pre)\b/im;

/**
 * Splits Markdown into pieces of about `size` characters, each parsed on its own. A piece ends only at a blank line
 * that is followed by a block starting at column 0, outside code fences and `$$` math, so nothing in a list item, code
 * block or formula is cut. Pieces depend only on the text before them, so appending text (a streamed answer) changes
 * only the last one. Text that splitting could change is returned whole.
 */
export function markdownChunks(text: string, size = markdownChunkSize): string[] {
	if (text.length <= size * 2 || keepWhole.test(text)) return [text];
	const lines = text.split("\n"), chunks: string[] = [];
	let start = 0, length = 0, open: string | undefined, math = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		length += line.length + 1;
		const marker = fence.exec(line)?.[1];
		if (open) { if (marker && marker[0] === open[0] && marker.length >= open.length && !line.slice(line.indexOf(marker) + marker.length).trim()) open = undefined; continue; }
		if (marker) { open = marker; continue; }
		const trimmed = line.trim();
		if (trimmed.startsWith("$$") && !(trimmed.length > 4 && trimmed.endsWith("$$"))) { math = !math; continue; }
		if (math) continue;
		const next = lines[index + 1];
		if (length >= size && !trimmed && next !== undefined && /^\S/.test(next)) { chunks.push(lines.slice(start, index).join("\n")); start = index + 1; length = 0; }
	}
	chunks.push(lines.slice(start).join("\n"));
	return chunks;
}

const initialCount = (chunks: string[]) => { let total = 0, count = 0; while (count < chunks.length && total < firstCharacters) total += chunks[count++].length; return Math.max(1, count); };

/**
 * Long Markdown, such as a model's reasoning, drawn a piece at a time: the first pieces at once and the next ones as
 * the reader scrolls to them, so opening 200 KB of reasoning doesn't hold the window. Each piece is memoised, so a
 * streamed update re-parses only the last one. `all` draws every piece (still memoised), for text that is still
 * streaming in, which is read from its end.
 */
export const LongMarkdown = memo(function LongMarkdown({ text, all = false }: { text: string; all?: boolean }) {
	const chunks = useMemo(() => markdownChunks(text), [text]);
	const [shown, setShown] = useState(() => initialCount(chunks));
	const sentinel = useRef<HTMLDivElement>(null);
	const count = all || typeof IntersectionObserver === "undefined" ? chunks.length : Math.min(shown, chunks.length), more = count < chunks.length;
	useEffect(() => {
		const node = sentinel.current;
		if (!node || !more) return;
		// The marker sits at the end of what is drawn; measured against the box that scrolls it, the next pieces load once the
		// reader is within 800 px of that end, and straight away when a jump to the bottom lands on it.
		let root: HTMLElement | null = node.parentElement;
		while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
		const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setShown(value => value + 2); }, { root, rootMargin: "0px 0px 800px 0px" });
		observer.observe(node);
		return () => observer.disconnect();
	}, [more, count]);
	if (chunks.length === 1) return <MessageContent text={text} />;
	return <div className="flex flex-col gap-4">
		{chunks.slice(0, count).map((chunk, index) => <div key={index} className="relative">
			<MessageContent text={chunk} />
			{more && index === count - 1 && <div ref={sentinel} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px" />}
		</div>)}
	</div>;
});
