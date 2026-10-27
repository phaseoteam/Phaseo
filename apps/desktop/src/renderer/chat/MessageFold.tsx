import { useEffect, useRef, useState, type ReactNode } from "react";

/** Find in chat asks a fold to open with this event when a match is inside it. */
export const revealEvent = "phaseo:reveal";

/** T3's thresholds: a pasted prompt over 600 characters or 8 lines folds. */
export const shouldFold = (text: string) => text.length > 600 || text.split("\n").length > 8;

/** Opens for find: the element listens for revealEvent, which `revealFolds` sends to every fold around a match. */
export function useReveal(open: () => void) {
	const element = useRef<HTMLDivElement>(null);
	const latest = useRef(open); latest.current = open;
	useEffect(() => {
		const node = element.current;
		if (!node) return;
		const reveal = () => latest.current();
		node.addEventListener(revealEvent, reveal);
		return () => node.removeEventListener(revealEvent, reveal);
	}, []);
	return element;
}

/** A long user message shows its first lines with a fade, and "Show full message" opens the rest. */
export function MessageFold({ text, children }: { text: string; children: ReactNode }) {
	const [expanded, setExpanded] = useState(false);
	const reveal = useReveal(() => setExpanded(true));
	const foldable = shouldFold(text), folded = foldable && !expanded;
	return <div ref={reveal} data-fold={folded ? "" : undefined}>
		<div className={folded ? "max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-1.75rem),transparent)]" : undefined}>{children}</div>
		{foldable && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground">{expanded ? "Show less" : "Show full message"}</button>}
	</div>;
}
