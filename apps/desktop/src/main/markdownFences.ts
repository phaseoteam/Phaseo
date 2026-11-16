/** Where streamed Markdown stands: the fenced code block it is inside, if any, and the line it has not finished yet. */
export type FenceState = { fence?: string; line: string };

const fenceLine = /^ {0,3}(`{3,}|~{3,})/;
const closingLine = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/;

/**
 * Feeds the next streamed chunk of a Markdown answer through `state`, line by line, following CommonMark's fenced code
 * blocks. With `stopAtClose`, it stops at the first line that closes the open block and returns the index in `text` just
 * after that line, so the caller can start a new entry there; otherwise, and when no block closes, it returns undefined.
 */
export function feedFences(state: FenceState, text: string, stopAtClose = false): number | undefined {
	let start = 0;
	for (let end = text.indexOf("\n"); end !== -1; start = end + 1, end = text.indexOf("\n", start)) {
		const line = state.line + text.slice(start, end); state.line = "";
		if (state.fence === undefined) {
			const match = fenceLine.exec(line);
			// A backtick fence's info string cannot contain a backtick; such a line is inline code, not a fence.
			if (match && !(match[1][0] === "`" && line.slice(match[0].length).includes("`"))) state.fence = match[1];
			continue;
		}
		const match = closingLine.exec(line);
		if (match && match[1][0] === state.fence[0] && match[1].length >= state.fence.length) {
			state.fence = undefined;
			if (stopAtClose) return end + 1;
		}
	}
	state.line += text.slice(start);
	return undefined;
}
