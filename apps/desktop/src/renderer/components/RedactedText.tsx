import { useState } from "react";
import { cn } from "../lib/utils";

/** Emails are blurred until clicked, as in T3 Code; click again to hide. */
export function RedactedText({ text, className }: { text: string; className?: string }) {
	const [shown, setShown] = useState(false);
	return <button type="button" onClick={event => { event.stopPropagation(); setShown(value => !value); }} title={shown ? "Click to hide" : "Click to reveal"} aria-label={shown ? text : "Hidden email, click to reveal"}
		className={cn("min-w-0 truncate rounded-sm text-left transition-[filter]", !shown && "blur-[4px] select-none hover:blur-[3px]", className)}>{text}</button>;
}
