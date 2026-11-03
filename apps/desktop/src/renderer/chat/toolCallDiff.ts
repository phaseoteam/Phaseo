import type { AgentActivity } from "../../shared/workspace";

/** A path as the project knows it: relative, with forward slashes. Undefined when it lies outside the project. */
export function projectRelative(path: string, directory?: string) {
	const file = path.replaceAll("\\", "/");
	if (!/^(?:[A-Za-z]:)?\//.test(file)) return file.replace(/^\.\//, "");
	if (!directory) return;
	const root = directory.replaceAll("\\", "/").replace(/\/+$/, "");
	// Windows paths compare without case.
	const windows = /^[A-Za-z]:/.test(root), same = (a: string, b: string) => windows ? a.toLowerCase() === b.toLowerCase() : a === b;
	return same(file.slice(0, root.length + 1), `${root}/`) ? file.slice(root.length + 1) : undefined;
}

type CodexChange = { path?: unknown; diff?: unknown; kind?: { type?: unknown; move_path?: unknown } };

/** One file's patch with headers, from a recorded change: a full patch, bare hunks, or a whole file added or deleted. */
function filePatch(path: string, diff: string, kind: "add" | "delete" | "update", movedTo?: string) {
	if (/^(?:diff --git |--- )/.test(diff)) return diff;
	let body = diff;
	if (kind !== "update" || !diff.trimStart().startsWith("@@ ")) {
		if (kind === "update") return undefined;
		const lines = diff.split("\n"), finalNewline = diff.endsWith("\n");
		if (finalNewline) lines.pop();
		const added = kind === "add", range = `1,${lines.length}`;
		body = `@@ -${added ? "0,0" : range} +${added ? range : "0,0"} @@\n${lines.map(line => `${added ? "+" : "-"}${line}`).join("\n")}\n${finalNewline ? "" : "\\ No newline at end of file\n"}`;
	}
	const target = movedTo ?? path;
	return `diff --git a/${path} b/${target}\n--- ${kind === "add" ? "/dev/null" : `a/${path}`}\n+++ ${kind === "delete" ? "/dev/null" : `b/${target}`}\n${body.trimStart()}`;
}

const editTools = /^(?:edit_file|write_file|delete_file|Edit|MultiEdit|Write|NotebookEdit|apply_patch|fileChange)$/;

/**
 * The files an edit tool call changed, project-relative, and its own patch when the agent recorded one (Codex). Phaseo's
 * tools name the file in their result; Claude's name it in their input, which shows until the result replaces it.
 */
export function toolCallEdits(activity: Pick<AgentActivity, "type" | "title" | "text">, directory?: string): { files: string[]; patch?: string } | undefined {
	if (activity.type !== "tool" || !editTools.test(activity.title)) return;
	const files: string[] = [], patches: string[] = [];
	const add = (path: string | undefined) => { if (path && !files.includes(path)) files.push(path); };
	const named = /^(?:Edited|Wrote|Created|Deleted) (.+?)(?::| \(|$)/m.exec(activity.text);
	if (named) add(projectRelative(named[1], directory));
	let value: unknown;
	try { value = JSON.parse(activity.text); } catch { /* A result in words. */ }
	if (value && typeof value === "object") {
		const record = value as { file_path?: unknown; notebook_path?: unknown; changes?: unknown };
		for (const key of [record.file_path, record.notebook_path]) if (typeof key === "string") add(projectRelative(key, directory));
		if (Array.isArray(record.changes)) for (const change of record.changes as CodexChange[]) {
			if (typeof change?.path !== "string") continue;
			const path = projectRelative(change.path, directory), kind = change.kind?.type === "add" || change.kind?.type === "delete" ? change.kind.type : "update";
			const movedTo = typeof change.kind?.move_path === "string" ? projectRelative(change.kind.move_path, directory) : undefined;
			add(path); add(movedTo);
			const patch = path && typeof change.diff === "string" ? filePatch(path, change.diff, kind, movedTo) : undefined;
			if (patch) patches.push(patch.endsWith("\n") ? patch : `${patch}\n`);
		}
	}
	if (!files.length) return;
	return patches.length ? { files, patch: patches.join("") } : { files };
}
