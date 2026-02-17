// Purpose: Shared uploadable helpers for OpenAI multipart endpoints.
// Why: OpenAI audio/image edit endpoints require file uploads, while gateway inputs can be URL/base64.
// How: Converts URL/data URL/base64 strings into Blob + filename for FormData.

type ResolveUploadableOptions = {
	defaultMimeType: string;
	fallbackFilename: string;
	maxBytes?: number;
};

export type ResolvedUploadable = {
	blob: Blob;
	filename: string;
};

function normalizeBase64(value: string): string {
	const compact = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
	const padding = compact.length % 4;
	if (padding === 0) return compact;
	return `${compact}${"=".repeat(4 - padding)}`;
}

function decodeBase64ToBytes(value: string): Uint8Array {
	const normalized = normalizeBase64(value);
	const binary = atob(normalized);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertMaxBytes(byteLength: number, maxBytes?: number): void {
	if (typeof maxBytes !== "number" || !Number.isFinite(maxBytes) || maxBytes <= 0) return;
	if (byteLength > maxBytes) {
		throw new Error(`uploadable_too_large_${byteLength}_${maxBytes}`);
	}
}

function parseDataUrl(input: string): { mimeType: string; base64: string } | null {
	const match = input.match(/^data:([^;,]+)?;base64,(.+)$/i);
	if (!match) return null;
	return {
		mimeType: match[1] || "application/octet-stream",
		base64: match[2] || "",
	};
}

function fileExtensionForMimeType(mimeType: string): string {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("jpeg")) return "jpg";
	if (normalized.includes("png")) return "png";
	if (normalized.includes("webp")) return "webp";
	if (normalized.includes("gif")) return "gif";
	if (normalized.includes("mp3")) return "mp3";
	if (normalized.includes("mpeg")) return "mp3";
	if (normalized.includes("wav")) return "wav";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("flac")) return "flac";
	if (normalized.includes("webm")) return "webm";
	if (normalized.includes("m4a") || normalized.includes("mp4")) return "m4a";
	return "bin";
}

function withExtension(filename: string, mimeType: string): string {
	if (/\.[a-z0-9]+$/i.test(filename)) return filename;
	const extension = fileExtensionForMimeType(mimeType);
	return `${filename}.${extension}`;
}

function filenameFromUrl(url: string): string {
	try {
		const pathname = new URL(url).pathname;
		const parts = pathname.split("/").filter(Boolean);
		return parts[parts.length - 1] || "upload";
	} catch {
		const parts = url.split("?")[0].split("/").filter(Boolean);
		return parts[parts.length - 1] || "upload";
	}
}

export async function resolveUploadableFromString(
	source: string,
	options: ResolveUploadableOptions,
): Promise<ResolvedUploadable> {
	const input = String(source ?? "").trim();
	if (!input) {
		throw new Error("uploadable_source_empty");
	}

	const dataUrl = parseDataUrl(input);
	if (dataUrl) {
		const bytes = decodeBase64ToBytes(dataUrl.base64);
		assertMaxBytes(bytes.byteLength, options.maxBytes);
		const mimeType = dataUrl.mimeType || options.defaultMimeType;
		return {
			blob: new Blob([bytesToArrayBuffer(bytes)], { type: mimeType }),
			filename: withExtension(options.fallbackFilename, mimeType),
		};
	}

	if (input.startsWith("http://") || input.startsWith("https://")) {
		const fetched = await fetch(input);
		if (!fetched.ok) {
			throw new Error(`uploadable_fetch_failed_${fetched.status}`);
		}
		const contentLength = Number(fetched.headers.get("content-length") ?? "0");
		if (Number.isFinite(contentLength) && contentLength > 0) {
			assertMaxBytes(contentLength, options.maxBytes);
		}
		const blob = await fetched.blob();
		assertMaxBytes(blob.size, options.maxBytes);
		const mimeType = blob.type || options.defaultMimeType;
		const filename = withExtension(filenameFromUrl(input), mimeType);
		return {
			blob: blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: mimeType }),
			filename,
		};
	}

	const bytes = decodeBase64ToBytes(input);
	assertMaxBytes(bytes.byteLength, options.maxBytes);
	return {
		blob: new Blob([bytesToArrayBuffer(bytes)], { type: options.defaultMimeType }),
		filename: withExtension(options.fallbackFilename, options.defaultMimeType),
	};
}
