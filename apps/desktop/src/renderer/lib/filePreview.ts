import { extensionOf } from "../../shared/filePreview";

/** How a text file can be shown besides its source. */
export type RenderedMode = "markdown" | "table" | "html";
export function renderedModeOf(path: string): RenderedMode | undefined {
	const extension = extensionOf(path);
	if (extension === "md" || extension === "mdx" || extension === "markdown") return "markdown";
	if (extension === "csv" || extension === "tsv") return "table";
	if (extension === "html" || extension === "htm") return "html";
}
export const tableDelimiter = (path: string): "," | "\t" => extensionOf(path) === "tsv" ? "\t" : ",";
export const renderedToggleLabel = (mode: RenderedMode, rendered: boolean) => rendered ? "Show source" : mode === "table" ? "Show table" : mode === "html" ? "Show page" : "Show preview";

export const TABLE_ROW_LIMIT = 100, TABLE_COLUMN_LIMIT = 30;
/** A bounded table from CSV or TSV text: quoted fields, escaped quotes and line breaks inside quotes. */
export function parseDelimitedPreview(text: string, delimiter: "," | "\t", rowLimit = TABLE_ROW_LIMIT, columnLimit = TABLE_COLUMN_LIMIT) {
	const rows: string[][] = [];
	let row: string[] = [], field = "", quoted = false, truncated = false, index = 0;
	const endField = () => { if (row.length < columnLimit) row.push(field); else truncated = true; field = ""; };
	const endRow = () => { endField(); rows.push(row); row = []; };
	if (text.charCodeAt(0) === 0xfeff) index = 1;
	for (; index < text.length; index++) {
		const character = text[index];
		if (quoted) {
			if (character === "\"") { if (text[index + 1] === "\"") { field += "\""; index++; } else quoted = false; }
			else field += character;
			continue;
		}
		if (character === "\"" && field === "") quoted = true;
		else if (character === delimiter) endField();
		else if (character === "\n" || character === "\r") {
			if (character === "\r" && text[index + 1] === "\n") index++;
			endRow();
			if (rows.length >= rowLimit + 1) { truncated = index < text.length - 1; break; }
		} else field += character;
	}
	if (rows.length < rowLimit + 1 && (field || row.length)) endRow();
	return { rows, truncated };
}

export type Breadcrumb = { label: string; path: string; kind: "project" | "directory" | "file" };
export function fileBreadcrumbs(projectName: string, path: string): Breadcrumb[] {
	const parts = path.split("/").filter(Boolean);
	return [{ label: projectName, path: "", kind: "project" as const }, ...parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join("/"), kind: index === parts.length - 1 ? "file" as const : "directory" as const }))];
}

export const formatBytes = (size: number) => size < 1024 ? `${size} bytes` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

/** Turns a sequence of edits into one save after a quiet period; `flush` saves now, as when the surface closes. */
export function debounceSaves(save: (text: string) => Promise<void>, delay = 500) {
	let pending: string | undefined, timer: ReturnType<typeof setTimeout> | undefined, running: Promise<void> = Promise.resolve();
	const run = () => { timer = undefined; if (pending === undefined) return running; const text = pending; pending = undefined; running = running.then(() => save(text)); return running; };
	return {
		schedule(text: string) { pending = text; if (timer) clearTimeout(timer); timer = setTimeout(() => void run().catch(() => undefined), delay); },
		flush() { if (timer) clearTimeout(timer); return run(); },
		cancel() { if (timer) clearTimeout(timer); timer = undefined; pending = undefined; },
		get pending() { return pending !== undefined; },
	};
}
