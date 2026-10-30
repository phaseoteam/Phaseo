"use client";

type SendPayloadLike = {
	content: string;
	attachments: File[];
};

export type PreparedAttachment = {
	name: string;
	mimeType: string;
	dataUrl: string;
	isImage: boolean;
	isAudio: boolean;
	isVideo: boolean;
};

export type InlineAttachmentPreview = {
	name: string;
	mimeType: string;
	dataUrl: string;
	isImage: boolean;
	isAudio: boolean;
	isVideo: boolean;
};

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read attachment."));
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Failed to encode attachment."));
		};
		reader.readAsDataURL(file);
	});
}

export async function prepareAttachments(
	files: File[],
): Promise<PreparedAttachment[]> {
	if (!files.length) return [];
	return Promise.all(
		files.map(async (file) => {
			const dataUrl = await readFileAsDataUrl(file);
			const mimeType = file.type || "application/octet-stream";
			return {
				name: file.name,
				mimeType,
				dataUrl,
				isImage: mimeType.startsWith("image/"),
				isAudio: mimeType.startsWith("audio/"),
				isVideo: mimeType.startsWith("video/"),
			};
		}),
	);
}

export async function prepareInlineAttachmentPreviews(
	files: File[],
): Promise<InlineAttachmentPreview[]> {
	const inlinePreviewFiles = files.filter((file) => {
		const mimeType = file.type || "";
		return (
			mimeType.startsWith("image/") ||
			mimeType.startsWith("audio/") ||
			mimeType.startsWith("video/")
		);
	});
	if (!inlinePreviewFiles.length) return [];
	return Promise.all(
		inlinePreviewFiles.map(async (file) => {
			const mimeType = file.type || "application/octet-stream";
			return {
				name: file.name,
				mimeType,
				dataUrl: await readFileAsDataUrl(file),
				isImage: mimeType.startsWith("image/"),
				isAudio: mimeType.startsWith("audio/"),
				isVideo: mimeType.startsWith("video/"),
			};
		}),
	);
}

export function buildUserMessageContent(payload: SendPayloadLike) {
	const text = payload.content.trim();
	if (text) return text;
	if (!payload.attachments.length) return "";
	if (payload.attachments.length === 1) {
		return `[Attachment] ${payload.attachments[0].name}`;
	}
	return `[Attachments] ${payload.attachments.length} files`;
}
