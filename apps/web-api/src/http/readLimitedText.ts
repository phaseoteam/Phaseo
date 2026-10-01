/** Bound bytes while streaming, including when Content-Length is absent. */
export async function readLimitedText(request: Request, limit: number): Promise<string> {
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return text + decoder.decode();
			total += value.byteLength;
			if (total > limit) { await reader.cancel(); throw new Error("payload_too_large"); }
			text += decoder.decode(value, { stream: true });
		}
	} finally { reader.releaseLock(); }
}
