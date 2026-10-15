import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import type { Message } from "../../shared/workspace";

/** What the diff surface shows. A turn is named by the message that started it. */
export type DiffSelection = { kind: "branch"; baseRef?: string } | { kind: "uncommitted" } | { kind: "turn"; messageId?: string };
export type DiffTurn = { messageId: string; number: number; completedAt?: string; from: string; to: string };

/** Turns with both snapshots, newest first. Numbers count every turn the chat has run, as T3 does. */
export function diffTurns(messages: readonly Pick<Message, "id" | "role" | "startedAt" | "completedAt" | "checkpoint" | "delivery">[]): DiffTurn[] {
	const turns: DiffTurn[] = [];
	let number = 0;
	for (const message of messages) {
		if (message.role !== "user" || !message.startedAt) continue;
		number++;
		if (message.checkpoint?.after) turns.push({ messageId: message.id, number, completedAt: message.completedAt, from: message.checkpoint.before, to: message.checkpoint.after });
	}
	return turns.reverse();
}

/** The turn a selection points at: the latest when none is named or the named one is gone. */
export const selectedTurn = (selection: DiffSelection, turns: readonly DiffTurn[]) => selection.kind !== "turn" ? undefined : turns.find(turn => turn.messageId === selection.messageId) ?? turns[0];

export function scopeLabel(selection: DiffSelection, turns: readonly DiffTurn[]) {
	if (selection.kind === "branch") return "Changes";
	if (selection.kind === "uncommitted") return "Uncommitted";
	const turn = selectedTurn(selection, turns);
	return !turn || turn === turns[0] ? "Latest turn" : `Turn ${turn.number}`;
}
/** Comments and collapsed files belong to one view: a comment on "Changes" does not appear on "Turn 2". */
export function sectionOf(selection: DiffSelection, turns: readonly DiffTurn[]) {
	const turn = selectedTurn(selection, turns);
	return turn ? { id: `turn:${turn.messageId}`, title: `Turn ${turn.number}` } : selection.kind === "uncommitted" ? { id: "uncommitted", title: "Uncommitted" } : { id: "branch", title: "Changes" };
}

export const resolveFileDiffPath = (file: Pick<FileDiffMetadata, "name">) => file.name.replace(/^[ab]\//, "");
export const fileDiffKey = (file: Pick<FileDiffMetadata, "name" | "prevName">) => `${file.prevName ?? ""}\0${file.name}`;

export function diffLineStat(files: readonly Pick<FileDiffMetadata, "hunks">[]) {
	let additions = 0, deletions = 0;
	for (const file of files) for (const hunk of file.hunks) { additions += hunk.additionLines; deletions += hunk.deletionLines; }
	return { additions, deletions };
}

/** T3's chevron colour per change type. */
export function changeTone(type: FileDiffMetadata["type"]) {
	return type === "new" ? "text-success" : type === "deleted" ? "text-destructive" : type === "change" || type === "rename-pure" || type === "rename-changed" ? "text-warning" : "text-muted-foreground/80";
}

export const allCollapsed = (keys: readonly string[], collapsed: ReadonlySet<string>) => keys.length > 0 && keys.every(key => collapsed.has(key));
export const toggleAll = (keys: readonly string[], collapsed: ReadonlySet<string>) => allCollapsed(keys, collapsed) ? new Set<string>() : new Set(keys);
export function toggleOne(collapsed: ReadonlySet<string>, key: string) { const next = new Set(collapsed); if (!next.delete(key)) next.add(key); return next; }

export type DiffTreeNode = { name: string; path: string; children: DiffTreeNode[]; file?: { type: FileDiffMetadata["type"]; additions: number; deletions: number } };
/** The changed files as folders and files, with single-child folder chains joined ("src/lib"). */
export function diffFileTree(files: readonly Pick<FileDiffMetadata, "name" | "type" | "hunks">[]): DiffTreeNode[] {
	const root: DiffTreeNode = { name: "", path: "", children: [] };
	for (const file of files) {
		const path = resolveFileDiffPath(file), parts = path.split("/");
		let node = root;
		parts.forEach((part, index) => {
			const at = parts.slice(0, index + 1).join("/");
			let child = node.children.find(value => value.path === at && (index === parts.length - 1) === Boolean(value.file));
			if (!child) { child = { name: part, path: at, children: [] }; node.children.push(child); }
			if (index === parts.length - 1) child.file = { type: file.type, ...diffLineStat([file]) };
			node = child;
		});
	}
	const compact = (node: DiffTreeNode): DiffTreeNode => {
		let current = node;
		while (!current.file && current.children.length === 1 && !current.children[0].file) { const only = current.children[0]; current = { ...only, name: `${current.name}/${only.name}` }; }
		return { ...current, children: current.children.map(compact).sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name)) };
	};
	return root.children.map(compact).sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name));
}

const stripEnd = (line: string | undefined) => (line ?? "").replace(/\r?\n$/, "");
/** The commented lines with +, - or space markers, so the agent sees exactly what was selected. */
export function diffExcerpt(file: Pick<FileDiffMetadata, "hunks" | "additionLines" | "deletionLines">, range: SelectedLineRange, limit = 200) {
	const startSide = range.side ?? "additions", endSide = range.endSide ?? startSide;
	const low = Math.min(range.start, range.end), high = Math.max(range.start, range.end);
	const includes = (side: "additions" | "deletions", line: number) => startSide === endSide ? side === startSide && line >= low && line <= high
		: (side === startSide && line >= range.start) || (side === endSide && line <= range.end);
	const lines: string[] = [];
	for (const hunk of file.hunks) {
		let oldLine = hunk.deletionStart, newLine = hunk.additionStart;
		for (const content of hunk.hunkContent) {
			if (content.type === "context") {
				for (let index = 0; index < content.lines; index++) if (includes("additions", newLine + index) || includes("deletions", oldLine + index)) lines.push(` ${stripEnd(file.additionLines[content.additionLineIndex + index])}`);
				oldLine += content.lines; newLine += content.lines;
			} else {
				for (let index = 0; index < content.deletions; index++) if (includes("deletions", oldLine + index)) lines.push(`-${stripEnd(file.deletionLines[content.deletionLineIndex + index])}`);
				for (let index = 0; index < content.additions; index++) if (includes("additions", newLine + index)) lines.push(`+${stripEnd(file.additionLines[content.additionLineIndex + index])}`);
				oldLine += content.deletions; newLine += content.additions;
			}
		}
	}
	return lines.slice(0, limit).join("\n");
}
