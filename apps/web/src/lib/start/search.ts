// The router's search format: every value is a raw string, and a repeated key
// becomes a string[]. Pages parse numbers, flags and lists themselves.

export function parseSearchAsStrings(searchStr: string): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {};
	for (const [key, value] of new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr)) {
		const existing = out[key];
		if (existing === undefined) out[key] = value;
		else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
	}
	return out;
}

export function stringifySearchFromStrings(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
		else params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

/** A route's search as plain strings (the shape `parseSearchAsStrings` produces). */
export type StringSearch = Record<string, string | string[] | undefined>;
