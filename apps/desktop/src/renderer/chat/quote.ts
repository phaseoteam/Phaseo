/** Longest passage Quote takes before "Selection is too long to cite". */
export const quoteLimit = 4000;

/** A selected passage as Markdown quote lines; blank lines stay inside the quote and runs of them collapse. */
export function quoteLines(passage: string) {
	return passage.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n").split("\n").map(line => line.trim() ? `> ${line.trimEnd()}` : ">");
}

/** Hands a passage to the open composer as a quote, followed by an empty line to reply on. False when no composer took it. */
export function quoteInComposer(passage: string) {
	const detail = { quote: quoteLines(passage), handled: false };
	window.dispatchEvent(new CustomEvent("phaseo:composer-attach", { detail }));
	return detail.handled;
}
