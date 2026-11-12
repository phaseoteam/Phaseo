import type { ResponseStreamingMode } from "../../shared/threadPreferences";

/**
 * How much of a running answer to show (Settings → Threads → Response streaming). Live shows every token as it arrives;
 * paragraph shows paragraphs and code blocks once they are complete; turn shows nothing until the turn ends. A pure choice
 * at render time: the stream and its batched flushes are the same in every mode.
 */
export function revealStreamingText(text: string, mode: ResponseStreamingMode) {
	if (mode === "live") return text;
	if (mode === "turn") return "";
	let shown = 0, fence: string | undefined;
	for (let start = 0; start < text.length;) {
		const end = text.indexOf("\n", start);
		// The last line is still arriving.
		if (end < 0) break;
		const line = text.slice(start, end).trim(), marker = /^(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length && line === marker) { fence = undefined; shown = end + 1; } }
		else if (marker) fence = marker;
		else if (!line) shown = end + 1;
		start = end + 1;
	}
	return text.slice(0, shown).trimEnd();
}
