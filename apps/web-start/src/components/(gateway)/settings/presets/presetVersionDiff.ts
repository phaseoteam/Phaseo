// Purpose: Say how a published preset version differs from the default one
// Why: The versions list showed only numbers and dates, so choosing where to
//      point a label meant guessing what each version ran
// How: Compares the models (set and order) and the template messages by
//      position, with a small line diff of each changed message. No dependency.

import type { PresetVersionContent } from "@/app/(dashboard)/settings/presets/actions";

export type VersionMessage = { role: string; text: string };
export type LineChange = { kind: "same" | "added" | "removed"; text: string };
export type MessageComparison = {
	index: number;
	role: string;
	/** The default version's role for this message, when it differs. */
	previousRole: string | null;
	status: "same" | "changed" | "added" | "removed";
	lines: LineChange[];
};
export type VersionComparison = {
	identical: boolean;
	models: { added: string[]; removed: string[]; reordered: boolean };
	messages: MessageComparison[];
	/** Variables, tools or response format differ; they are not shown line by line. */
	otherTemplateChanged: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The template's messages as plain text; image variables read as [image: name]. */
export function versionMessages(prompt: unknown): VersionMessage[] {
	if (!isPlainObject(prompt) || !Array.isArray(prompt.messages)) return [];
	return prompt.messages.map((message: any) => {
		const role = typeof message?.role === "string" ? message.role : "user";
		if (typeof message?.content === "string") return { role, text: message.content };
		const parts = Array.isArray(message?.content) ? message.content : [];
		const text = parts
			.map((part: any) => (part?.type === "variable" ? `[image: ${String(part.name ?? "")}]` : typeof part?.text === "string" ? part.text : ""))
			.join("\n");
		return { role, text };
	});
}

/** Lines past this are compared as a whole, which keeps the table small. */
const MAX_DIFF_LINES = 400;

/** A line-level diff (longest common subsequence) of two texts. */
export function diffLines(before: string, after: string): LineChange[] {
	const a = before === "" ? [] : before.split(/\r?\n/);
	const b = after === "" ? [] : after.split(/\r?\n/);
	if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
		if (before === after) return a.map((text) => ({ kind: "same", text }));
		return [...a.map((text): LineChange => ({ kind: "removed", text })), ...b.map((text): LineChange => ({ kind: "added", text }))];
	}
	// lengths[i][j] = longest common subsequence of a[i..] and b[j..]
	const lengths: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
		}
	}
	const changes: LineChange[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			changes.push({ kind: "same", text: a[i] });
			i += 1;
			j += 1;
		} else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
			changes.push({ kind: "removed", text: a[i] });
			i += 1;
		} else {
			changes.push({ kind: "added", text: b[j] });
			j += 1;
		}
	}
	while (i < a.length) changes.push({ kind: "removed", text: a[i++] });
	while (j < b.length) changes.push({ kind: "added", text: b[j++] });
	return changes;
}

/** JSON with sorted keys, so key order does not count as a change. */
function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (isPlainObject(value)) {
		return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
	}
	return JSON.stringify(value ?? null);
}

function templateWithoutMessages(prompt: unknown): string {
	if (!isPlainObject(prompt)) return "null";
	const { messages: _messages, ...rest } = prompt;
	return stableJson(rest);
}

/** How `target` differs from `base` (the default version): models, then template messages by position. */
export function compareVersions(
	base: PresetVersionContent | null | undefined,
	target: PresetVersionContent | null | undefined,
): VersionComparison {
	const baseModels = base?.models ?? [];
	const targetModels = target?.models ?? [];
	const added = targetModels.filter((model) => !baseModels.includes(model));
	const removed = baseModels.filter((model) => !targetModels.includes(model));
	const shared = targetModels.filter((model) => baseModels.includes(model));
	const reordered = shared.join("\n") !== baseModels.filter((model) => targetModels.includes(model)).join("\n");

	const before = versionMessages(base?.prompt);
	const after = versionMessages(target?.prompt);
	const messages: MessageComparison[] = [];
	for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
		const previous = before[index];
		const next = after[index];
		if (!previous && next) {
			messages.push({ index, role: next.role, previousRole: null, status: "added", lines: diffLines("", next.text) });
		} else if (previous && !next) {
			messages.push({ index, role: previous.role, previousRole: null, status: "removed", lines: diffLines(previous.text, "") });
		} else if (previous && next) {
			const same = previous.role === next.role && previous.text === next.text;
			messages.push({
				index,
				role: next.role,
				previousRole: previous.role === next.role ? null : previous.role,
				status: same ? "same" : "changed",
				lines: same ? diffLines(next.text, next.text) : diffLines(previous.text, next.text),
			});
		}
	}

	const otherTemplateChanged = templateWithoutMessages(base?.prompt) !== templateWithoutMessages(target?.prompt);
	return {
		identical: !added.length && !removed.length && !reordered && !otherTemplateChanged && messages.every((message) => message.status === "same"),
		models: { added, removed, reordered },
		messages,
		otherTemplateChanged,
	};
}
