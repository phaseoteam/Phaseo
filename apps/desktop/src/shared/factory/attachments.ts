import type { Attachment, ImageUpload, WorkItem } from "./types";

/** Images people can add to an issue they write in Factory, and where agents find them. */

export const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** In each run's worktree, next to the proof folder. Git ignores it too. */
export const INPUTS_FOLDER = ".factory/inputs";

/** Why an image can't be added, or null when it can. */
export function imageProblem(image: Pick<ImageUpload, "type"> & { size: number }, count: number): string | null {
	if (!IMAGE_TYPES[image.type]) return "Only PNG, JPEG, GIF and WebP images";
	if (image.size > MAX_IMAGE_BYTES) return "Images can be 10 MB at most";
	if (count >= MAX_IMAGES) return `${MAX_IMAGES} images at most`;
	return null;
}

/** Names are ours, not the uploader's, so they're safe on disk and in a URL. */
export function attachmentsFor(images: Pick<ImageUpload, "type" | "data">[]): Attachment[] {
	return images.map((image, index) => ({ name: `image-${index + 1}.${IMAGE_TYPES[image.type] ?? "png"}`, type: image.type, bytes: image.data.byteLength }));
}

/** The folder an item's attachments are kept in, under Factory's data folder. */
export function attachmentKey(item: Pick<WorkItem, "repo" | "number">): string {
	return `${item.repo.replace(/[^\w.-]/g, "_")}-${item.number}`;
}

export function isAttachmentName(name: string): boolean {
	return /^image-\d+\.(png|jpg|gif|webp)$/.test(name);
}

/** What gh --attach takes, and GitHub's own limits for files added to comments. */
export const ATTACH_EXTENSIONS: Record<string, number> = { png: 10, jpg: 10, jpeg: 10, gif: 10, webp: 10, mp4: 100, mov: 100, webm: 100 };

export function attachable(name: string, bytes: number): boolean {
	const megabytes = ATTACH_EXTENSIONS[name.split(".").at(-1)?.toLowerCase() ?? ""];
	return megabytes !== undefined && bytes <= megabytes * 1024 * 1024;
}

/** gh 2.99.0 added --attach, which uploads images and videos to issues, pull requests and comments. */
export const ATTACH_VERSION = "2.99.0";

export function supportsAttach(version: string | null | undefined): boolean {
	if (!version) return false;
	const have = version.split(".").map(Number);
	const need = ATTACH_VERSION.split(".").map(Number);
	for (let index = 0; index < need.length; index++) {
		if ((have[index] ?? 0) !== need[index]) return (have[index] ?? 0) > need[index];
	}
	return true;
}

/**
 * How a local file is written in Markdown and passed to --attach. gh swaps a reference for the uploaded
 * link when the two match, so both use this one spelling, with forward slashes so Markdown keeps it whole.
 */
export function attachRef(file: string): string {
	return file.replace(/\\/g, "/");
}
