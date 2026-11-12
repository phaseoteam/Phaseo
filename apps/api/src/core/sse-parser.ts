// Purpose: Incremental Server-Sent Events frame parser shared by stream adapters.
// Why: Re-splitting an accumulated buffer on every chunk rescans the whole
//      buffer, which is quadratic for large frames (base64 image deltas, big
//      response.completed snapshots), and ad-hoc "\n\n" splitters miss CRLF/CR
//      framing.
// How: Only newly received text is scanned for line terminators. A partial line
//      is carried as a list of pieces and joined once when its terminator
//      arrives. A frame is dispatched on each blank line (WHATWG SSE rules:
//      LF, CRLF, or lone CR line endings; multi-line `data:`; comments ignored).

export type SseFrame = {
	/** Value of the last `event:` field (trimmed), or null when the frame has none. */
	event: string | null;
	/** `data:` field values joined with "\n" (one leading space stripped per line). */
	data: string;
	/** Number of `data:` lines in the frame. */
	dataLines: number;
	/**
	 * Frame lines (including comment lines) joined with "\n", without the
	 * terminating blank line. Computed lazily; only fallbacks that forward
	 * unparseable frames verbatim need it.
	 */
	readonly raw: string;
};

const LINE_TERMINATOR = /[\r\n]/g;
const CHAR_LF = 10;
const CHAR_CR = 13;
const CHAR_SPACE = 32;
const CHAR_COLON = 58;

export class SseParser {
	private decoder: TextDecoder | null = null;
	/** Pieces of the current, not yet terminated line. */
	private partial: string[] = [];
	/** The previous chunk ended in CR; a leading LF in the next chunk completes CRLF. */
	private skipLeadingLf = false;
	private lines: string[] = [];
	private event: string | null = null;
	private data: string[] = [];
	private hasField = false;

	/** Decode a byte chunk (UTF-8, streaming-safe) and return completed frames. */
	pushBytes(chunk: Uint8Array | undefined): SseFrame[] {
		if (!chunk || chunk.byteLength === 0) return [];
		this.decoder ??= new TextDecoder();
		return this.push(this.decoder.decode(chunk, { stream: true }));
	}

	/** Feed decoded text and return the frames completed by it. */
	push(text: string): SseFrame[] {
		const frames: SseFrame[] = [];
		if (!text) return frames;
		let start = 0;
		if (this.skipLeadingLf) {
			this.skipLeadingLf = false;
			if (text.charCodeAt(0) === CHAR_LF) start = 1;
		}
		const re = LINE_TERMINATOR;
		re.lastIndex = start;
		let match: RegExpExecArray | null;
		while ((match = re.exec(text)) !== null) {
			const end = match.index;
			let line = text.slice(start, end);
			if (this.partial.length > 0) {
				this.partial.push(line);
				line = this.partial.join("");
				this.partial = [];
			}
			let next = end + 1;
			if (text.charCodeAt(end) === CHAR_CR) {
				if (next < text.length) {
					if (text.charCodeAt(next) === CHAR_LF) next += 1;
				} else {
					this.skipLeadingLf = true;
				}
			}
			this.processLine(line, frames);
			start = next;
			re.lastIndex = next;
		}
		re.lastIndex = 0;
		if (start < text.length) this.partial.push(start === 0 ? text : text.slice(start));
		return frames;
	}

	/**
	 * Text of the frame that has not been dispatched yet (its completed lines
	 * plus any unterminated line), joined with "\n". Lets callers fall back to
	 * parsing a non-SSE body (e.g. plain JSON from a provider that ignored
	 * `stream: true`). Call before flush().
	 */
	pendingText(): string {
		const partial = this.partial.join("");
		if (this.lines.length === 0) return partial;
		const lines = this.lines.join("\n");
		return partial ? `${lines}\n${partial}` : lines;
	}

	/**
	 * End of stream: flush the decoder, treat an unterminated last line as
	 * complete, and dispatch a pending frame that lacks its blank line.
	 * Callers that historically discarded the trailing frame should simply not
	 * call this.
	 */
	flush(): SseFrame[] {
		const frames: SseFrame[] = [];
		if (this.decoder) {
			const tail = this.decoder.decode();
			if (tail) frames.push(...this.push(tail));
		}
		if (this.partial.length > 0) {
			const line = this.partial.join("");
			this.partial = [];
			this.processLine(line, frames);
		}
		this.dispatch(frames);
		this.skipLeadingLf = false;
		return frames;
	}

	private processLine(line: string, frames: SseFrame[]): void {
		if (line.length === 0) {
			this.dispatch(frames);
			return;
		}
		this.lines.push(line);
		if (line.charCodeAt(0) === CHAR_COLON) return; // comment
		this.hasField = true;
		const colon = line.indexOf(":");
		let field: string;
		let value: string;
		if (colon === -1) {
			field = line;
			value = "";
		} else {
			field = line.slice(0, colon);
			value = line.charCodeAt(colon + 1) === CHAR_SPACE
				? line.slice(colon + 2)
				: line.slice(colon + 1);
		}
		if (field === "data") {
			this.data.push(value);
		} else if (field === "event") {
			this.event = value.trim();
		}
	}

	private dispatch(frames: SseFrame[]): void {
		if (this.hasField) {
			const lines = this.lines;
			const dataLines = this.data.length;
			let raw: string | undefined;
			frames.push({
				event: this.event,
				data: dataLines === 1 ? this.data[0] : this.data.join("\n"),
				dataLines,
				get raw() {
					raw ??= lines.length === 1 ? lines[0] : lines.join("\n");
					return raw;
				},
			});
		}
		if (this.lines.length > 0) this.lines = [];
		if (this.data.length > 0) this.data = [];
		this.event = null;
		this.hasField = false;
	}
}

/** Convenience: parse a complete SSE text body (including a trailing frame). */
export function parseSseText(text: string): SseFrame[] {
	const parser = new SseParser();
	return [...parser.push(text), ...parser.flush()];
}
