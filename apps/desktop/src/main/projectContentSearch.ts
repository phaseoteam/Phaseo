import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import path from "node:path";
import { projectFileIndex } from "./projectFileSearch";
import type { ProjectContentMatch, ProjectContentSearch } from "../shared/projectSearch";

const MAX_MATCHES = 300, MAX_LINE = 240, MAX_FILE_BYTES = 1024 * 1024;

/** The line around the match, so a minified file does not send megabytes back. `column` is 1-based, in characters. */
export function clipLine(text: string, column: number) {
	const line = text.replace(/\r$/, "");
	if (line.length <= MAX_LINE) return { text: line, column };
	const start = Math.max(0, Math.min(column - 1 - 60, line.length - MAX_LINE));
	return { text: `${start ? "…" : ""}${line.slice(start, start + MAX_LINE)}…`, column: column - start + (start ? 1 : 0) };
}

/** `git grep -z -n --column` output: path, line and column end in NUL, the text in a newline. */
export function parseGitGrep(output: string, limit = MAX_MATCHES): ProjectContentMatch[] {
	const matches: ProjectContentMatch[] = [];
	for (const record of output.split("\n")) {
		if (matches.length >= limit) break;
		const [file, line, column, ...rest] = record.split("\0");
		if (!file || !line || !column || !rest.length) continue;
		const text = rest.join("\0"), byte = Number(column);
		// Git counts bytes; the renderer marks characters.
		const at = Buffer.from(text, "utf8").subarray(0, Math.max(0, byte - 1)).toString("utf8").length + 1;
		matches.push({ path: file.replaceAll("\\", "/"), line: Number(line), ...clipLine(text, at) });
	}
	return matches;
}

/** Git's own search over tracked and untracked files it does not ignore; stops reading once enough lines arrived. */
function gitGrep(root: string, query: string): Promise<ProjectContentSearch | undefined> {
	return new Promise(resolve => {
		const child = spawn("git", ["-c", "core.fsmonitor=false", "-c", "core.quotepath=false", "grep", "-n", "-I", "-i", "-F", "--untracked", "--column", "--no-color", "-z", "-e", query, "--"], { cwd: root, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
		let output = "", lines = 0, stopped = false;
		const timer = setTimeout(() => { stopped = true; child.kill(); }, 15_000);
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			if (stopped) return;
			output += chunk; lines += chunk.split("\n").length - 1;
			if (lines > MAX_MATCHES) { stopped = true; child.kill(); }
		});
		child.on("error", () => { clearTimeout(timer); resolve(undefined); });
		child.on("close", code => {
			clearTimeout(timer);
			// 1 is "no matches"; anything else that was not our stop means Git could not search here.
			if (!stopped && code !== 0 && code !== 1) { resolve(undefined); return; }
			const matches = parseGitGrep(output);
			resolve({ matches, truncated: stopped });
		});
	});
}

/** Outside a repository: the same bounded file list the file tree uses, read file by file. */
async function scanFiles(root: string, query: string): Promise<ProjectContentSearch> {
	const { files } = await projectFileIndex(root), needle = query.toLowerCase(), matches: ProjectContentMatch[] = [];
	for (const file of files) {
		const handle = await open(path.join(root, file), "r").catch(() => undefined);
		if (!handle) continue;
		try {
			const buffer = Buffer.alloc(Math.min(MAX_FILE_BYTES, (await handle.stat()).size));
			await handle.read(buffer, 0, buffer.length, 0);
			if (buffer.includes(0)) continue;
			const lines = buffer.toString("utf8").split("\n");
			for (const [index, line] of lines.entries()) {
				const at = line.toLowerCase().indexOf(needle);
				if (at < 0) continue;
				matches.push({ path: file, line: index + 1, ...clipLine(line, at + 1) });
				if (matches.length >= MAX_MATCHES) return { matches, truncated: true };
			}
		} finally { await handle.close(); }
	}
	return { matches, truncated: false };
}

/** Search in files: every line containing `query`, case-insensitively. */
export async function searchProjectContents(root: string, query: unknown): Promise<ProjectContentSearch> {
	if (typeof query !== "string" || !query.trim() || query.length > 200 || query.includes("\0")) throw new Error("Invalid content search.");
	return await gitGrep(root, query) ?? scanFiles(root, query);
}
