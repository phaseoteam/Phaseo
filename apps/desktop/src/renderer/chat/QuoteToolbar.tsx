import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Quote } from "lucide-react";
import { showToast } from "../components/ui/toast";
import { quoteInComposer, quoteLimit } from "./quote";

/**
 * The selection toolbar: selecting text in a reply offers Quote, which puts the passage in the message box as a
 * Markdown quote to reply under. Only replies (elements marked data-quote) offer it.
 */
export function QuoteToolbar({ root }: { root: RefObject<HTMLElement | null> }) {
	const [selection, setSelection] = useState<{ top: number; left: number; text: string }>();
	useEffect(() => {
		const update = () => {
			const current = document.getSelection(), range = current && current.rangeCount && !current.isCollapsed ? current.getRangeAt(0) : undefined;
			const reply = (node?: Node) => (node instanceof Element ? node : node?.parentElement)?.closest("[data-quote]");
			const start = reply(range?.startContainer), end = reply(range?.endContainer), text = current?.toString().trim();
			if (!range || !start || !end || !text || !root.current?.contains(start) || !root.current.contains(end)) { setSelection(undefined); return; }
			const bounds = range.getBoundingClientRect();
			setSelection({ top: bounds.top, left: bounds.left + bounds.width / 2, text });
		};
		document.addEventListener("selectionchange", update);
		// The toolbar follows the passage as the conversation scrolls.
		document.addEventListener("scroll", update, true);
		return () => { document.removeEventListener("selectionchange", update); document.removeEventListener("scroll", update, true); };
	}, [root]);
	if (!selection) return null;
	const quote = () => {
		if (selection.text.length > quoteLimit) { showToast("info", "That passage is too long to quote", `Select up to ${quoteLimit.toLocaleString("en-GB")} characters.`); return; }
		if (quoteInComposer(selection.text)) document.getSelection()?.removeAllRanges();
	};
	return createPortal(<div role="toolbar" aria-label="Selected text" style={{ top: Math.max(8, selection.top - 40), left: selection.left }}
		className="fixed z-50 flex -translate-x-1/2 items-center rounded-md border border-border bg-popover p-0.5 text-popover-foreground shadow-md">
		{/* Keeps the selection: the button takes no focus on press. */}
		<button type="button" onMouseDown={event => event.preventDefault()} onClick={quote} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted"><Quote className="size-3.5" />Quote</button>
	</div>, document.body);
}
