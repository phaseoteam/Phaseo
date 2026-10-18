// Purpose: Parse a client SSE body into frames and label each frame for order checks.
// Why: Stream expectations (error frames, terminal frames) need the frames in order, independent of dialect.
// How: Splits on blank lines, joins data lines, parses JSON data, and derives a short marker per frame.

export function parseSse(text: string): Array<{ event: string | null; data: unknown }> {
	const frames: Array<{ event: string | null; data: unknown }> = [];
	for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
		if (!block.trim()) continue;
		let event: string | null = null;
		const data: string[] = [];
		for (const line of block.split("\n")) {
			if (line.startsWith("event:")) event = line.slice(6).trim();
			else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
		}
		if (!data.length && !event) continue;
		const raw = data.join("\n");
		let parsed: unknown = raw;
		try {
			parsed = raw === "[DONE]" ? raw : JSON.parse(raw);
		} catch {
			parsed = raw;
		}
		frames.push({ event, data: parsed });
	}
	return frames;
}

/** A short marker per frame: the event name, `type`, or for Chat chunks the finish reason / usage presence. */
export function sseMarker(frame: { event: string | null; data: unknown }): string {
	if (frame.data === "[DONE]") return "[DONE]";
	const data = frame.data as any;
	if (frame.event) return frame.event;
	if (data && typeof data === "object") {
		if (typeof data.type === "string") return data.type;
		if (data.error) return "error";
		const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
		if (choice?.finish_reason) return `chunk:finish:${choice.finish_reason}`;
		if (data.usage && (!data.choices || data.choices.length === 0)) return "chunk:usage";
		if (choice?.delta?.tool_calls) return "chunk:tool_calls";
		if (choice?.delta?.content !== undefined) return "chunk:content";
		return "chunk";
	}
	return "raw";
}
