type Op = { type: " " | "-" | "+"; text: string; a: number; b: number; eof: boolean };

function splitLines(text: string) {
	if (!text) return { lines: [] as string[], newline: true };
	const lines = text.split("\n"), newline = lines.at(-1) === "";
	if (newline) lines.pop();
	return { lines, newline };
}

/** Myers' O(ND) edit script over line ids, or undefined when more than `maxD` edits are needed. */
function myers(a: number[], b: number[], maxD: number): (" " | "-" | "+")[] | undefined {
	const n = a.length, m = b.length, limit = Math.min(maxD, n + m), trace: Int32Array[] = [];
	let v = new Int32Array(3); v[2] = 0;
	for (let d = 0; d <= limit; d++) {
		// v holds x for diagonals -d-1..d+1 (index k + d + 1) from the previous round.
		trace.push(v);
		const next = new Int32Array(2 * d + 5), get = (k: number) => v[k + d + 1];
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? get(k + 1) : get(k - 1) + 1, y = x - k;
			while (x < n && y < m && a[x] === b[y]) { x++; y++; }
			next[k + d + 2] = x;
			if (x >= n && y >= m) {
				const script: (" " | "-" | "+")[] = [];
				let cx = n, cy = m;
				for (let step = d; step >= 0; step--) {
					const previous = trace[step], at = (key: number) => previous[key + step + 1], key = cx - cy;
					const prevK = key === -step || (key !== step && at(key - 1) < at(key + 1)) ? key + 1 : key - 1;
					const prevX = step === 0 ? 0 : at(prevK), prevY = step === 0 ? 0 : prevX - prevK;
					while (cx > prevX && cy > prevY) { script.push(" "); cx--; cy--; }
					if (step > 0) script.push(cx === prevX ? "+" : "-");
					cx = prevX; cy = prevY;
				}
				return script.reverse();
			}
		}
		v = next;
	}
}

/** Edit operations between two texts: common ends trimmed, Myers in between, or delete-all/insert-all when the middle differs too much. */
function diffOps(before: string, after: string): Op[] {
	const left = splitLines(before), right = splitLines(after), ids = new Map<string, number>();
	// A last line without a newline differs from the same line with one.
	const key = (lines: string[], newline: boolean, index: number) => { const value = index === lines.length - 1 && !newline ? `${lines[index]}\0` : lines[index]; let id = ids.get(value); if (id === undefined) ids.set(value, id = ids.size); return id; };
	const a = left.lines.map((_, index) => key(left.lines, left.newline, index)), b = right.lines.map((_, index) => key(right.lines, right.newline, index));
	let prefix = 0; while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	let suffix = 0; while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
	const middleA = a.slice(prefix, a.length - suffix), middleB = b.slice(prefix, b.length - suffix);
	const script = myers(middleA, middleB, Math.min(1000, Math.floor(2e7 / (middleA.length + middleB.length + 1))))
		?? [...middleA.map(() => "-" as const), ...middleB.map(() => "+" as const)];
	const types = [...Array(prefix).fill(" "), ...script, ...Array(suffix).fill(" ")] as (" " | "-" | "+")[];
	const ops: Op[] = []; let ai = 0, bi = 0;
	for (const type of types) {
		if (type === "+") { ops.push({ type, text: right.lines[bi], a: ai, b: bi, eof: bi === right.lines.length - 1 && !right.newline }); bi++; }
		else { ops.push({ type, text: left.lines[ai], a: ai, b: bi, eof: ai === left.lines.length - 1 && !left.newline }); ai++; if (type === " ") bi++; }
	}
	return ops;
}

const display = (text: string) => { const line = text.endsWith("\r") ? text.slice(0, -1) : text; return line.length > 500 ? `${line.slice(0, 500)}… [${line.length - 500} more characters]` : line; };

/** A unified diff (`--- a/` `+++ b/`, `@@` hunks) capped at `maxLines` body lines. Empty when the texts are equal. */
export function unifiedDiff(before: string | undefined, after: string | undefined, options: { path: string; context?: number; maxLines?: number }): string {
	const context = options.context ?? 3, maxLines = options.maxLines ?? 400, ops = diffOps(before ?? "", after ?? "");
	if (!ops.some(op => op.type !== " ")) return "";
	const hunks: Op[][] = [];
	for (let index = 0; index < ops.length;) {
		if (ops[index].type === " ") { index++; continue; }
		let end = index, scan = index;
		while (scan < ops.length) {
			if (ops[scan].type !== " ") { end = scan++; continue; }
			let run = scan; while (run < ops.length && ops[run].type === " ") run++;
			if (run < ops.length && run - scan <= 2 * context) { scan = run; continue; }
			break;
		}
		const stop = Math.min(ops.length, end + context + 1);
		hunks.push(ops.slice(Math.max(0, index - context), stop)); index = stop;
	}
	const output = [`--- ${before === undefined ? "/dev/null" : `a/${options.path}`}`, `+++ ${after === undefined ? "/dev/null" : `b/${options.path}`}`];
	let shown = 0, omitted = 0;
	for (const hunk of hunks) {
		const oldCount = hunk.filter(op => op.type !== "+").length, newCount = hunk.filter(op => op.type !== "-").length;
		const body = [`@@ -${oldCount ? hunk[0].a + 1 : hunk[0].a},${oldCount} +${newCount ? hunk[0].b + 1 : hunk[0].b},${newCount} @@`];
		for (const op of hunk) { body.push(`${op.type}${display(op.text)}`); if (op.eof) body.push("\\ No newline at end of file"); }
		const room = maxLines - shown;
		if (room <= 0) { omitted += body.length; continue; }
		output.push(...body.slice(0, room)); shown += Math.min(room, body.length); omitted += Math.max(0, body.length - room);
	}
	if (omitted) output.push(`[${omitted} more diff lines not shown]`);
	return output.join("\n");
}
