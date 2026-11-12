/** Chat tags: short labels a person or the chat's own agent sets, used to group and filter the sidebar. */
export const tagLimits = { perChat: 8, length: 24 };

/** Trims, collapses spaces, drops empties and case-insensitive repeats; keeps the first spelling. Throws on anything unusable. */
export function normalizeTags(value: unknown): string[] {
	if (!Array.isArray(value)) throw new Error("Tags must be a list.");
	const seen = new Set<string>(); const tags: string[] = [];
	for (const raw of value) {
		if (typeof raw !== "string") throw new Error("Each tag must be text.");
		const tag = raw.replace(/\s+/g, " ").trim().replace(/^#/, "");
		if (!tag) continue;
		if (tag.length > tagLimits.length || [...tag].some(character => character.charCodeAt(0) < 32)) throw new Error(`Tags are up to ${tagLimits.length} characters.`);
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key); tags.push(tag);
	}
	if (tags.length > tagLimits.perChat) throw new Error(`A chat can have up to ${tagLimits.perChat} tags.`);
	return tags;
}

/** Every tag in use, most used first, with the spelling first seen. */
export function tagsInUse(tasks: { tags?: string[]; archived?: boolean }[]) {
	const counts = new Map<string, { tag: string; count: number }>();
	for (const task of tasks) if (!task.archived) for (const tag of task.tags ?? []) {
		const entry = counts.get(tag.toLowerCase()) ?? { tag, count: 0 };
		entry.count++; counts.set(tag.toLowerCase(), entry);
	}
	return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).map(entry => entry.tag);
}

/** A stable hue per tag, so a tag looks the same everywhere. */
export function tagHue(tag: string) {
	let hash = 0;
	for (const character of tag.toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	return hash % 360;
}
