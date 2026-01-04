export function stringifyIR(value: unknown): string {
	return JSON.stringify(sortValue(value), null, 2) + "\n";
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortValue);
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
		);
		const sorted: Record<string, unknown> = {};
		for (const [key, entryValue] of entries) {
			sorted[key] = sortValue(entryValue);
		}
		return sorted;
	}
	return value;
}
