// The work command palette: jump to an item by number or title, create, switch views, go to a page.

export type PaletteEntry = {
	id: string;
	group: "items" | "actions" | "views" | "pages";
	label: string;
	/** Extra words that match, such as the item number or a page's other names. */
	keywords?: string[];
	/** Item number, for "#42" and "42" queries. */
	number?: number;
};

function normalise(value: string): string {
	return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** A 0 to 1 score for how well an entry matches; 0 means no match. */
export function paletteScore(entry: PaletteEntry, query: string): number {
	const q = normalise(query);
	if (!q) return entry.group === "items" ? 0.4 : 0.5;
	const number = q.match(/^#?(\d{1,9})$/)?.[1];
	if (number && entry.number !== undefined) {
		if (String(entry.number) === number) return 1;
		if (String(entry.number).startsWith(number)) return 0.7;
	}
	const label = normalise(entry.label);
	if (label === q) return 0.95;
	if (label.startsWith(q)) return 0.9;
	const words = q.split(" ");
	const haystack = [label, ...(entry.keywords ?? []).map(normalise)].join(" ");
	if (words.every((word) => haystack.includes(word))) {
		// Word starts beat matches inside a word.
		return words.every((word) => new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack)) ? 0.75 : 0.6;
	}
	return 0;
}

/** Matching entries, best first; ties keep their original order. */
export function searchPalette(entries: PaletteEntry[], query: string, limitPerGroup = 8): PaletteEntry[] {
	const counts = new Map<string, number>();
	return entries
		.map((entry, index) => ({ entry, index, score: paletteScore(entry, query) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.filter(({ entry }) => {
			const count = counts.get(entry.group) ?? 0;
			counts.set(entry.group, count + 1);
			return count < limitPerGroup;
		})
		.map(({ entry }) => entry);
}

/** Whether a key press opens the palette: Ctrl+K, or Cmd+K on a Mac. */
export function isPaletteShortcut(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): boolean {
	return event.key.toLowerCase() === "k" && Boolean(event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}
