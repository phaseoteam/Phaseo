import { useState, type ReactNode } from "react";
import { useFindTarget } from "./ChatFind";

/** Thresholds: a pasted prompt over 600 characters or 8 lines folds. */
export const shouldFold = (text: string) => text.length > 600 || text.split("\n").length > 8;

/** A long user message shows its first lines with a fade, and "Show full message" opens the rest. Find opens it too. */
export function MessageFold({ id, text, children }: { id: string; text: string; children: ReactNode }) {
	const [expanded, setExpanded] = useState(false);
	const found = useFindTarget(id);
	const foldable = shouldFold(text), folded = foldable && !expanded && !found;
	return <>
		<div className={folded ? "max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-1.75rem),transparent)]" : undefined}>{children}</div>
		{foldable && !found && <button type="button" data-find-ignore aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-1 block text-xs font-medium text-muted-foreground hover:text-foreground">{expanded ? "Show less" : "Show full message"}</button>}
	</>;
}
