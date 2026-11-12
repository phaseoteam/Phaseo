import type { ProjectFile } from "./workspace";

/** One folder's children, every folder and file below one (for Expand all), or a search across the project. */
export type ProjectTreeRequest = { type: "list" | "expand"; directory: string } | { type: "search"; query: string };
export type ProjectTreeResult = { entries: ProjectFile[]; truncated: boolean };
export const PROJECT_TREE_EXPAND_LIMIT = 5000;
export const PROJECT_TREE_SEARCH_LIMIT = 200;

/** A project-relative folder: forward slashes, no leading or trailing slash, no `.`/`..` segments. */
export function isRelativeDirectory(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 4096 || value.includes("\0") || value.includes("\\")) return false;
	if (value === "") return true;
	if (value.startsWith("/") || value.endsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
	return value.split("/").every(segment => segment !== "" && segment !== "." && segment !== "..");
}

export function validateProjectTreeRequest(value: unknown): ProjectTreeRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid file tree request.");
	const request = value as Record<string, unknown>;
	if (request.type === "search") {
		if (typeof request.query !== "string" || request.query.length > 500 || request.query.includes("\0")) throw new Error("Invalid file search.");
		return { type: "search", query: request.query };
	}
	if (request.type === "list" || request.type === "expand") {
		if (!isRelativeDirectory(request.directory)) throw new Error("Choose a folder inside this project.");
		return { type: request.type, directory: request.directory };
	}
	throw new Error("Invalid file tree request.");
}

/** Builds folder listings from the project's file index: folders first, then files, each by name. */
export function projectTreeEntries(files: readonly string[], request: Exclude<ProjectTreeRequest, { type: "search" }>, limit = PROJECT_TREE_EXPAND_LIMIT): ProjectTreeResult {
	const prefix = request.directory ? `${request.directory}/` : "";
	const directories = new Set<string>(), leaves = new Set<string>();
	for (const file of files) {
		if (!file.startsWith(prefix)) continue;
		const rest = file.slice(prefix.length);
		if (!rest) continue;
		if (request.type === "list") {
			const slash = rest.indexOf("/");
			if (slash < 0) leaves.add(file); else directories.add(prefix + rest.slice(0, slash));
		} else {
			for (let slash = rest.indexOf("/"); slash >= 0; slash = rest.indexOf("/", slash + 1)) directories.add(prefix + rest.slice(0, slash));
			leaves.add(file);
		}
	}
	const entry = (path: string, directory: boolean): ProjectFile => ({ name: path.slice(path.lastIndexOf("/") + 1), path, directory });
	const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
	const entries = [...[...directories].sort(byName).map(path => entry(path, true)), ...[...leaves].sort(byName).map(path => entry(path, false))];
	return { entries: entries.slice(0, limit), truncated: entries.length > limit };
}
