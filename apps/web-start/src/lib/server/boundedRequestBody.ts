export type BoundedTextBodyResult =
	| { ok: true; text: string }
	| { ok: false; reason: "body_too_large" };

export async function readBoundedTextBody(
	request: Request,
	maxBytes: number,
): Promise<BoundedTextBodyResult> {
	const declaredLength = Number(request.headers.get("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		return { ok: false, reason: "body_too_large" };
	}

	if (!request.body) return { ok: true, text: "" };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				await reader.cancel("request_body_too_large");
				return { ok: false, reason: "body_too_large" };
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { ok: true, text: new TextDecoder().decode(bytes) };
}
