// Image, audio and file bytes are never kept in what Phaseo stores (I/O logs and data
// contributions), however small or wherever they sit. Media sent by URL is kept as a URL.

export const REDACTED_DATA_URL = "[REDACTED_DATA_URL]";
export const REDACTED_BASE64 = "[REDACTED_BASE64]";

const MIN_BARE_BASE64_LENGTH = 256;
const BARE_BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const EMBEDDED_DATA_URL = /data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[\w.+-]+)*;base64,[A-Za-z0-9+/=]+/g;
const MEDIA_BYTE_KEYS = new Set(["b64_json", "partial_image_b64"]);

/** A field holding media bytes, judged by its key and the object around it. */
export function isMediaBytesField(key: string, parent: Record<string, unknown>): boolean {
	if (MEDIA_BYTE_KEYS.has(key)) return true;
	if (key === "result" && parent.type === "image_generation_call") return true;
	if (key !== "data") return false;
	return parent.type === "base64" ||
		"mime_type" in parent || "mimeType" in parent || "media_type" in parent || "format" in parent;
}

/**
 * Fields that hold opaque provider tokens rather than media: encrypted reasoning and
 * thinking signatures. They look like base64 but are needed to understand the log.
 */
export function isOpaqueTokenField(key: string, parent: Record<string, unknown>): boolean {
	return key === "encrypted_content" || key === "signature" ||
		(key === "data" && parent.type === "redacted_thinking");
}

/** Replaces media bytes in a string, calling `onRedact` once per replacement. */
export function redactMediaString(value: string, onRedact: () => void = () => {}): string {
	if (value.startsWith("data:")) {
		onRedact();
		return REDACTED_DATA_URL;
	}
	if (value.length >= MIN_BARE_BASE64_LENGTH && BARE_BASE64.test(value)) {
		onRedact();
		return REDACTED_BASE64;
	}
	return value.replace(EMBEDDED_DATA_URL, () => {
		onRedact();
		return REDACTED_DATA_URL;
	});
}

/** A JSON-safe copy of `value` with every media byte string replaced by a placeholder. */
export function stripMediaBytes(value: unknown, depth = 0): unknown {
	if (typeof value === "string") return redactMediaString(value);
	if (!value || typeof value !== "object") return value;
	// Deeper than any real payload; drop it rather than store it unchecked.
	if (depth > 64) return "[TRUNCATED_DEPTH]";
	if (Array.isArray(value)) return value.map((entry) => stripMediaBytes(entry, depth + 1));
	const record = value as Record<string, unknown>;
	return Object.fromEntries(
		Object.entries(record).map(([key, entry]) => [
			key,
			typeof entry === "string" && entry
				? isMediaBytesField(key, record)
					? REDACTED_BASE64
					: isOpaqueTokenField(key, record)
						? entry
						: redactMediaString(entry)
				: stripMediaBytes(entry, depth + 1),
		]),
	);
}
