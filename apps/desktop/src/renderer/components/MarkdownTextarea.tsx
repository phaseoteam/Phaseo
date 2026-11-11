import { useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";
import { markdownRanges } from "../chat/composerMarkdown";
import { useWorkspacePreferences } from "../lib/workspacePreferences";

/** Past this length the field stays plain, so a pasted log never slows typing. */
const longestStyled = 40_000;

export type MarkdownSegment = { text: string; className?: string };

/**
 * A draft as runs of text with the Markdown classes that apply to each, for the styled copy drawn over the field.
 * Ranges nest (a bold word in a quote), so each character gets every class that covers it.
 */
export function markdownSegments(text: string): MarkdownSegment[] {
	const lines = text.split("\n");
	const classes = lines.map(line => Array.from({ length: line.length }, () => [] as string[]));
	for (const range of markdownRanges(lines)) for (let at = range.from; at < range.to; at++) classes[range.line]![at]!.push(range.className);
	const out: MarkdownSegment[] = [];
	const push = (piece: string, className: string | undefined) => {
		const last = out[out.length - 1];
		if (last && last.className === className) last.text += piece; else out.push(className ? { text: piece, className } : { text: piece });
	};
	lines.forEach((line, index) => {
		if (index) push("\n", undefined);
		for (let at = 0; at < line.length; at++) push(line[at]!, classes[index]![at]!.join(" ") || undefined);
	});
	return out;
}

/** What the styled copy takes from the field, so every line wraps and sits exactly where the field draws it. */
const copied = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant", "fontFeatureSettings", "fontVariationSettings", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textTransform", "textAlign", "tabSize", "direction", "paddingTop", "paddingLeft", "paddingBottom", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "color", "opacity"] as const;

type Props = ComponentProps<"textarea"> & {
	value: string;
	/** Use the shared Textarea's look; otherwise a bare textarea styled by className. */
	ui?: boolean;
	/** Layout classes for the wrapper the field and its styled copy sit in, such as flex-1 in a row. */
	containerClassName?: string;
};

/**
 * A text field that shows Markdown as it is typed, as the message box does: bold, code, links, headings, quotes and lists
 * are styled and their markers faded. The field stays a real textarea (its value, caret, selection, undo and shortcuts
 * are untouched); only its text is hidden, under a copy that is styled. The copy changes colour and weight without
 * changing any character's width, so the caret always lines up. Settings → Chat → Rich text turns it off everywhere.
 */
export function MarkdownTextarea({ ui, containerClassName, ref, value, className, onScroll, ...props }: Props) {
	const richText = useWorkspacePreferences().chat.richTextComposer;
	const field = useRef<HTMLTextAreaElement | null>(null);
	const copy = useRef<HTMLDivElement>(null);
	const [style, setStyle] = useState<CSSProperties>();
	const styled = richText && value.length <= longestStyled;
	const setRef = (node: HTMLTextAreaElement | null) => {
		field.current = node;
		if (typeof ref === "function") ref(node); else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = node;
	};

	const measure = () => {
		const input = field.current;
		if (!input) return;
		const computed = getComputedStyle(input);
		const next: Record<string, string | number> = { top: input.offsetTop, left: input.offsetLeft, width: input.offsetWidth, height: input.offsetHeight };
		for (const key of copied) next[key] = computed[key];
		// A scrollbar narrows the field's text; the copy has none, so it takes that width as padding instead.
		const scrollbar = input.offsetWidth - input.clientWidth - parseFloat(computed.borderLeftWidth) - parseFloat(computed.borderRightWidth);
		next.paddingRight = `${parseFloat(computed.paddingRight) + Math.max(0, scrollbar)}px`;
		setStyle(previous => previous && Object.keys(next).every(key => (previous as Record<string, unknown>)[key] === next[key]) ? previous : next as CSSProperties);
		if (copy.current) copy.current.scrollTop = input.scrollTop;
	};
	useLayoutEffect(() => { if (styled) measure(); });
	useLayoutEffect(() => {
		const input = field.current;
		if (!styled || !input || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => measure());
		observer.observe(input);
		return () => observer.disconnect();
	}, [styled]);

	const Field = ui ? Textarea : "textarea";
	if (!styled) return <Field ref={setRef} value={value} className={className} onScroll={onScroll} {...props} />;
	return <div className={cn("markdown-field relative", containerClassName)}>
		<Field ref={setRef} value={value} className={cn(className, "markdown-field-input")} onScroll={event => { if (copy.current) copy.current.scrollTop = event.currentTarget.scrollTop; onScroll?.(event); }} {...props} />
		{/* A trailing space keeps a final empty line, as the field shows one after a last line break. */}
		<div ref={copy} aria-hidden className="markdown-field-copy" style={style}>
			{markdownSegments(value).map((segment, index) => segment.className ? <span key={index} className={segment.className}>{segment.text}</span> : segment.text)}{" "}
		</div>
	</div>;
}

