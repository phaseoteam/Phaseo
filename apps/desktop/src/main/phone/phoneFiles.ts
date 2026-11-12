import { stat } from "node:fs/promises";
import { phoneLimits, type PhoneFilePreview, type PhoneResults } from "@phaseo/phone-protocol";
import { extensionOf, imageTypes } from "../../shared/filePreview";
import type { ProjectTreeResult } from "../../shared/projectTree";
import { projectRelativePath, readFilePreview, resolveProjectPath } from "../projectFiles";

/** Room left in a frame for its other fields and encryption. */
const fileBudget = phoneLimits.frameBytes - 64 * 1024;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value)) + 1;

/** The window's file tree answer, cut where a frame runs out of room (a folder of thousands of long names). */
export function phoneFileList(result: ProjectTreeResult): PhoneResults["list_files"] {
	const entries: PhoneResults["list_files"]["entries"] = [];
	let used = 64;
	for (const { name, path, directory } of result.entries) {
		const entry = { name, path, directory }, size = bytes(entry);
		if (used + size > fileBudget) return { entries, truncated: true };
		entries.push(entry); used += size;
	}
	return { entries, truncated: result.truncated };
}

/** Text up to `limit` UTF-8 bytes, cut after the last whole line in it (or mid-line when one line is longer). */
function head(text: string, limit: number) {
	const cut = Buffer.from(text).subarray(0, limit).toString("utf8").replace(/�$/, "");
	const line = cut.lastIndexOf("\n");
	return line > 0 ? cut.slice(0, line + 1) : cut;
}

/**
 * A project file as a phone shows it, through the window's preview (readFilePreview), whose realpath check refuses
 * anything outside the project, through `..` or a link. Text past phoneLimits.fileBytes, or whose escaped JSON would
 * not fit a frame, is cut at a line. An image past the cap and a PDF are answered from their size, never read.
 */
export async function phoneFilePreview(root: string, value: string): Promise<PhoneFilePreview> {
	const relative = await projectRelativePath(root, value);
	if (!relative) throw new Error("Choose a file inside this project.");
	const metadata = await stat(await resolveProjectPath(root, relative));
	if (!metadata.isFile()) throw new Error("This is a folder or special file, not a file.");
	const extension = extensionOf(relative);
	if (extension === "pdf") return { kind: "unsupported", size: metadata.size };
	if (imageTypes[extension] && metadata.size > phoneLimits.fileBytes) return { kind: "too-large", size: metadata.size };
	const preview = await readFilePreview(root, relative, () => Promise.reject(new Error("A phone doesn't preview PDFs.")));
	switch (preview.kind) {
		case "image": return preview.size > phoneLimits.fileBytes ? { kind: "too-large", size: preview.size } : { kind: "image", mimeType: preview.mimeType, dataUrl: preview.dataUrl, size: preview.size };
		case "text": {
			let text = preview.text, truncated = preview.truncated;
			for (let limit = phoneLimits.fileBytes; ; limit = Math.floor(limit / 2)) {
				if (Buffer.byteLength(text) > limit) { text = head(text, limit); truncated = true; }
				if (bytes(text) + 128 <= fileBudget) break;
			}
			return { kind: "text", text, size: preview.size, truncated };
		}
		case "too-large": return { kind: "too-large", size: preview.size };
		default: return { kind: "unsupported", size: preview.size };
	}
}
