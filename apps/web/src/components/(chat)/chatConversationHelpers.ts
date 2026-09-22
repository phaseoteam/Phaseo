import { getModelDetailsHref } from "@/lib/models/modelHref";
import type {
	ChatMessage,
	ChatReasoningEffort,
} from "@/lib/indexeddb/chats";

const AUDIO_RECORDING_MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
	"audio/ogg",
] as const;

export const DEFAULT_CHAT_PLACEHOLDER = "Ask anything";

export type ReasoningEffortOption = {
	value: ChatReasoningEffort;
	label: string;
};

export const REASONING_OPTIONS: ReasoningEffortOption[] = [
	{ value: "none", label: "None" },
	{ value: "instant", label: "Instant" },
	{ value: "minimal", label: "Minimal" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "Extra High" },
	{ value: "max", label: "Max" },
];

export type InlineAttachmentPreview = {
	name: string;
	mimeType: string | undefined;
	dataUrl: string;
	isImage: boolean;
	isAudio: boolean;
	isVideo: boolean;
};

export function getSupportedRecordingMimeType() {
	if (typeof MediaRecorder === "undefined") return "";
	for (const mimeType of AUDIO_RECORDING_MIME_CANDIDATES) {
		if (MediaRecorder.isTypeSupported(mimeType)) {
			return mimeType;
		}
	}
	return "";
}

export function extensionForAudioMimeType(mimeType: string) {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("mp4")) return "m4a";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("mpeg")) return "mp3";
	if (normalized.includes("wav")) return "wav";
	return "webm";
}

function extensionForMimeType(mimeType: string) {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("png")) return "png";
	if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
	if (normalized.includes("webp")) return "webp";
	if (normalized.includes("gif")) return "gif";
	if (normalized.includes("heic")) return "heic";
	if (normalized.includes("heif")) return "heif";
	if (normalized.includes("avif")) return "avif";
	if (normalized.includes("bmp")) return "bmp";
	if (normalized.includes("tiff")) return "tiff";
	if (normalized.includes("tif")) return "tif";
	if (normalized.includes("mp4")) return "mp4";
	if (normalized.includes("quicktime") || normalized.includes("mov")) return "mov";
	if (normalized.includes("mkv")) return "mkv";
	if (normalized.includes("webm")) return "webm";
	if (normalized.includes("mpeg")) return "mp3";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("wav")) return "wav";
	if (normalized.includes("flac")) return "flac";
	if (normalized.includes("aac")) return "aac";
	return "bin";
}

function mimeTypeForFilename(filename: string) {
	const extension = filename.trim().toLowerCase().split(".").pop();
	if (!extension) return "";
	return (
		{
			avif: "image/avif",
			bmp: "image/bmp",
			heic: "image/heic",
			heif: "image/heif",
			gif: "image/gif",
			jpeg: "image/jpeg",
			jpg: "image/jpeg",
			png: "image/png",
			tif: "image/tiff",
			tiff: "image/tiff",
			webp: "image/webp",
			aac: "audio/aac",
			flac: "audio/flac",
			m4a: "audio/mp4",
			mp3: "audio/mpeg",
			ogg: "audio/ogg",
			wav: "audio/wav",
			avi: "video/x-msvideo",
			mkv: "video/x-matroska",
			mov: "video/quicktime",
			webm: "video/webm",
			mp4: "video/mp4",
			pdf: "application/pdf",
			csv: "text/csv",
			json: "application/json",
			md: "text/markdown",
			txt: "text/plain",
		}[extension] ?? ""
	);
}

/**
 * Browsers can omit the MIME type for files dragged from the OS, especially
 * for HEIC and AVIF images. Preserve the file contents while restoring the
 * type needed by the composer and request builder to treat them as images.
 */
export function normalizeAttachmentFile(file: File) {
	const declaredType = file.type.trim().toLowerCase();
	const inferredType = mimeTypeForFilename(file.name);
	const shouldInferType =
		!declaredType || declaredType === "application/octet-stream";
	if (!shouldInferType || !inferredType || inferredType === declaredType) {
		return file;
	}
	return new File([file], file.name, {
		type: inferredType,
		lastModified: file.lastModified,
	});
}

export function normalizeAttachmentFiles(files: File[]) {
	return files.map(normalizeAttachmentFile);
}

function normalizeClipboardFiles(files: File[]) {
	return files.map((file, index) => {
		const normalizedFile = normalizeAttachmentFile(file);
		if (normalizedFile.name && normalizedFile.name.trim()) return normalizedFile;
		const mimeType = normalizedFile.type || "application/octet-stream";
		const extension = extensionForMimeType(mimeType);
		const category = mimeType.split("/")[0] || "file";
		return new File(
			[normalizedFile],
			`pasted-${category}-${Date.now()}-${index}.${extension}`,
			{
				type: mimeType,
			},
		);
	});
}

export function extractClipboardFiles(clipboardData: DataTransfer | null) {
	if (!clipboardData) return [];
	const files: File[] = [];
	for (const item of Array.from(clipboardData.items ?? [])) {
		if (item.kind !== "file") continue;
		const file = item.getAsFile();
		if (file) files.push(file);
	}
	if (!files.length && clipboardData.files?.length) {
		files.push(...Array.from(clipboardData.files));
	}
	return normalizeClipboardFiles(files);
}

export function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "phaseo";
}

export function formatModelLabel(modelId: string) {
	const parts = modelId.split("/");
	return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

export function isInternalModelId(modelId: string) {
	return modelId.includes("/");
}

export function buildModelLink(modelId: string) {
	if (!modelId) return "#";
	const normalizedModelId = modelId.trim();
	if (!normalizedModelId) return "#";

	const org = getOrgId(normalizedModelId);
	return getModelDetailsHref(org, normalizedModelId) ?? "#";
}

export function extractGeneratedVideoUrl(content: string): string | null {
	const markdownMatch = content.match(
		/\[[^\]]*(generated video|open generated video|video result|open result)[^\]]*\]\((https?:\/\/[^)\s]+)\)/i,
	);
	if (markdownMatch?.[2]) return markdownMatch[2];

	const directUrlMatch = content.match(
		/(https?:\/\/[^\s)]+?\.(mp4|webm|mov|m4v)(\?[^\s)]*)?)/i,
	);
	if (directUrlMatch?.[1]) return directUrlMatch[1];

	return null;
}

export function extractGeneratedAudioUrl(content: string): string | null {
	const markdownMatch = content.match(
		/\[[^\]]*(generated audio|open generated audio|generated music|open generated music|music result|audio result|open result)[^\]]*\]\((https?:\/\/[^)\s]+)\)/i,
	);
	if (markdownMatch?.[2]) return markdownMatch[2];

	const directUrlMatch = content.match(
		/(https?:\/\/[^\s)]+?\.(mp3|wav|ogg|m4a|aac|flac|opus|mpga)(\?[^\s)]*)?)/i,
	);
	if (directUrlMatch?.[1]) return directUrlMatch[1];

	return null;
}

export function extractGeneratedImageUrl(content: string): string | null {
	const markdownImageMatch = content.match(/!\[[^\]]*\]\(([^)\s]+)\)/i);
	if (markdownImageMatch?.[1]) return markdownImageMatch[1];

	const markdownLinkMatch = content.match(
		/\[[^\]]*(generated image|open generated image|image result|open result)[^\]]*\]\((https?:\/\/[^)\s]+)\)/i,
	);
	if (markdownLinkMatch?.[2]) return markdownLinkMatch[2];

	const directUrlMatch = content.match(
		/(https?:\/\/[^\s)]+?\.(png|jpe?g|webp|gif)(\?[^\s)]*)?)/i,
	);
	if (directUrlMatch?.[1]) return directUrlMatch[1];

	return null;
}

export function sanitizeHttpMediaUrl(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

export function sanitizeAttachmentMediaUrl(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("blob:")) return trimmed;
	if (
		/^data:(image|audio|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(
			trimmed,
		)
	) {
		return trimmed;
	}
	return sanitizeHttpMediaUrl(trimmed);
}

export function inferAudioMimeType(url: string) {
	const normalized = url.toLowerCase();
	if (normalized.includes(".wav")) return "audio/wav";
	if (normalized.includes(".ogg")) return "audio/ogg";
	if (normalized.includes(".m4a")) return "audio/mp4";
	if (normalized.includes(".aac")) return "audio/aac";
	if (normalized.includes(".flac")) return "audio/flac";
	if (normalized.includes(".opus")) return "audio/opus";
	return "audio/mpeg";
}

export function stripMarkdownLink(content: string, url: string): string {
	if (!content || !url) return content.trim();
	const target = url.trim();
	if (!target) return content.trim();

	const withoutMarkdown = content.replace(
		/!?\[[^\]]*\]\(([^)\s]+)\)/g,
		(fullMatch, matchedUrl: string) =>
			matchedUrl === target ? "" : fullMatch,
	);
	if (withoutMarkdown !== content) {
		return withoutMarkdown.trim();
	}

	if (content.includes(target)) {
		return content.split(target).join("").trim();
	}

	return content.trim();
}

export function ensureVariants(message: ChatMessage) {
	if (message.variants && message.variants.length > 0) {
		return message.variants;
	}
	return [
		{
			id: message.id,
			content: message.content,
			createdAt: message.createdAt,
			usage: message.usage ?? null,
			meta: message.meta ?? null,
		},
	];
}

export function getInlineAttachmentPreviewsFromMeta(
	meta: ChatMessage["meta"],
): InlineAttachmentPreview[] {
	if (!meta || typeof meta !== "object") return [];
	const previews = (meta as Record<string, unknown>).attachment_previews;
	if (!Array.isArray(previews)) return [];
	return previews
		.map((entry) => {
			if (!entry || typeof entry !== "object") return null;
			const item = entry as Record<string, unknown>;
			const dataUrl =
				typeof item.dataUrl === "string" ? item.dataUrl : null;
			const safeDataUrl = sanitizeAttachmentMediaUrl(dataUrl);
			if (!safeDataUrl) return null;
			const mimeType =
				typeof item.mimeType === "string" && item.mimeType.trim()
					? item.mimeType
					: safeDataUrl.startsWith("data:")
						? (safeDataUrl.slice(5).split(";")[0] ?? undefined)
						: undefined;
			const isImage =
				(typeof item.isImage === "boolean" && item.isImage) ||
				Boolean(mimeType?.startsWith("image/")) ||
				safeDataUrl.startsWith("data:image/");
			const isAudio =
				(typeof item.isAudio === "boolean" && item.isAudio) ||
				Boolean(mimeType?.startsWith("audio/")) ||
				safeDataUrl.startsWith("data:audio/");
			const isVideo =
				(typeof item.isVideo === "boolean" && item.isVideo) ||
				Boolean(mimeType?.startsWith("video/")) ||
				safeDataUrl.startsWith("data:video/");
			if (!isImage && !isAudio && !isVideo) return null;
			return {
				name:
					typeof item.name === "string" && item.name.trim()
						? item.name
						: "image",
				mimeType,
				dataUrl: safeDataUrl,
				isImage,
				isAudio,
				isVideo,
			} satisfies InlineAttachmentPreview;
		})
		.filter((entry): entry is InlineAttachmentPreview => Boolean(entry));
}

export function getRandomPlaceholder() {
	return DEFAULT_CHAT_PLACEHOLDER;
}
