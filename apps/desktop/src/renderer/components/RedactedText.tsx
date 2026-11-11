import { Fragment, useState } from "react";
import { cn } from "../lib/utils";

/** Emails are blurred until clicked; click again to hide. */
export function RedactedText({ text, className }: { text: string; className?: string }) {
	const [shown, setShown] = useState(false);
	return <button type="button" onClick={event => { event.stopPropagation(); setShown(value => !value); }} title={shown ? "Click to hide" : "Click to reveal"} aria-label={shown ? text : "Hidden email, click to reveal"}
		className={cn("min-w-0 truncate rounded-sm text-left transition-[filter]", !shown && "blur-[4px] select-none hover:blur-[3px]", className)}>{text}</button>;
}

const emailPattern = /[^\s@<>()[\]·,;:"]+@[^\s@<>()[\]·,;:"]+\.[^\s@<>()[\]·,;:"]+/g;

/** Text such as "Signed in as someone@example.com" with each email in it blurred as RedactedText does. */
export function RedactedEmails({ text }: { text: string }) {
	const parts: (string | { email: string })[] = [];
	let last = 0;
	for (const match of text.matchAll(emailPattern)) {
		if (match.index > last) parts.push(text.slice(last, match.index));
		parts.push({ email: match[0] });
		last = match.index + match[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts.map((part, index) => <Fragment key={index}>{typeof part === "string" ? part : <RedactedText text={part.email} className="inline-block max-w-full align-bottom" />}</Fragment>)}</>;
}
