/** Text files up to this size can be edited; larger ones show their first part read-only. */
export const FILE_EDIT_LIMIT = 1024 * 1024;
export const FILE_IMAGE_LIMIT = 10 * 1024 * 1024;
export const FILE_PDF_LIMIT = 20 * 1024 * 1024;

export type FilePreview =
	/** `hash` is set only when the whole file was read, which is when it can be saved. */
	| { kind: "text"; text: string; size: number; truncated: boolean; hash?: string }
	| { kind: "image"; mimeType: string; dataUrl: string; size: number }
	| { kind: "pdf"; text: string; pages: number; size: number }
	| { kind: "binary"; size: number }
	| { kind: "too-large"; size: number };

export const imageTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml" };
export const extensionOf = (filename: string) => { const name = filename.slice(filename.lastIndexOf("/") + 1); const dot = name.lastIndexOf("."); return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""; };
