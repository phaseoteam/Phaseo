import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";

export type DiffLayout = "unified" | "split";

export function parseReviewPatch(patch: string): FileDiffMetadata[] | undefined {
	// Keep oversized or unsupported patches readable without expensive tokenization.
	if (patch.length > 1_000_000 || patch.split("\n").length > 10_000) return;
	try {
		const files = parsePatchFiles(patch, undefined, true).flatMap(value => value.files);
		if (!files.length || files.some(file => !file.hunks.length)) return;
		return files;
	} catch { return; }
}
