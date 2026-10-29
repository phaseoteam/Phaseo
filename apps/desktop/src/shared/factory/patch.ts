/** One line of a file's diff, numbered on each side the way GitHub numbers them for line comments. */
export interface PatchRow {
	kind: "hunk" | "add" | "remove" | "context";
	text: string;
	/** The line in the base version: removed and unchanged lines. */
	old?: number;
	/** The line in the pull request's version: added and unchanged lines. */
	new?: number;
}

/** GitHub's `patch` for one file (unified diff hunks, no file header) as rows. */
export function parsePatch(patch: string): PatchRow[] {
	const rows: PatchRow[] = [];
	let old = 0;
	let next = 0;
	for (const line of patch.split("\n")) {
		const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
		if (hunk) {
			old = Number(hunk[1]);
			next = Number(hunk[2]);
			rows.push({ kind: "hunk", text: line });
			continue;
		}
		// Git's note about a missing newline at the end of the file belongs to the line before it.
		if (line.startsWith("\\")) continue;
		if (line.startsWith("+")) rows.push({ kind: "add", text: line.slice(1), new: next++ });
		else if (line.startsWith("-")) rows.push({ kind: "remove", text: line.slice(1), old: old++ });
		else if (rows.length) rows.push({ kind: "context", text: line.slice(1), old: old++, new: next++ });
	}
	// A patch ends with a newline, which isn't a line of the file.
	const last = rows.at(-1);
	if (last?.kind === "context" && last.text === "" && patch.endsWith("\n")) rows.pop();
	return rows;
}

/** Where a line comment goes: the new version for added and unchanged lines, the base for removed ones. */
export function commentSide(row: PatchRow): { side: "RIGHT" | "LEFT"; line: number } | null {
	if (row.kind === "hunk") return null;
	return row.kind === "remove" ? { side: "LEFT", line: row.old! } : { side: "RIGHT", line: row.new! };
}
