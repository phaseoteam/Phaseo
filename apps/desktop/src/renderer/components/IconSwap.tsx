import { cloneElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";

/** How long the outgoing icon stays to morph out (index.css, .icon-swap). */
const morphMs = 340;

/**
 * Icons for the states of one control, in one place: when `show` changes, the old icon shrinks, turns and blurs out as
 * the new one springs in (index.css, .icon-swap). Only the shown icon is in the page, and the outgoing one while it
 * leaves, so a long chat carries one extra node per icon. Nothing moves when it first appears, only on a change.
 */
export function IconSwap({ show, children, className }: { show: string; children: Record<string, ReactNode>; className?: string }) {
	// Worked out while rendering, so the outgoing icon keeps its element (and morphs out) and the incoming one mounts marked.
	const [morph, setMorph] = useState<{ shown: string; from?: string }>({ shown: show });
	if (morph.shown !== show) setMorph({ shown: show, from: morph.shown });
	useEffect(() => {
		if (!morph.from) return;
		const timer = setTimeout(() => setMorph(value => value.from ? { shown: value.shown } : value), morphMs);
		return () => clearTimeout(timer);
	}, [morph]);
	const keys = morph.from && morph.from !== show ? [morph.from, show] : [show];
	return <span className={cn("icon-swap", className)}>
		{keys.map(key => {
			const icon = children[key], on = key === show;
			const marks = { key, "data-on": on || undefined, "data-enter": on && keys.length > 1 || undefined, "aria-hidden": !on || undefined };
			return isValidElement(icon) ? cloneElement(icon, marks) : <span {...marks}>{icon}</span>;
		})}
	</span>;
}
