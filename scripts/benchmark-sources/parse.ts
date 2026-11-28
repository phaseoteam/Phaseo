/** Small, dependency-free parsers shared by sources. */

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF. Returns rows keyed by the header line. */
export function parseCsv(input: string): Array<Record<string, string>> {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (quoted) {
			if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
			else if (char === '"') quoted = false;
			else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ",") { row.push(field); field = ""; }
		else if (char === "\n" || char === "\r") {
			if (char === "\r" && input[index + 1] === "\n") index += 1;
			row.push(field); field = "";
			if (row.some((cell) => cell !== "")) rows.push(row);
			row = [];
		} else field += char;
	}
	row.push(field);
	if (row.some((cell) => cell !== "")) rows.push(row);
	const [header, ...body] = rows;
	if (!header) return [];
	const keys = header.map((key) => key.trim());
	return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? "").trim()])));
}

/** A number from a leaderboard cell: "72.4%", "1,234", "−3.1", "n/a" → null. */
export function parseNumber(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string") return null;
	const cleaned = value.replace(/[−–]/g, "-").replace(/[,%$\s]/g, "");
	if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(cleaned)) return null;
	const number = Number(cleaned);
	return Number.isFinite(number) ? number : null;
}

/** The JSON in a Next.js pages-router `__NEXT_DATA__` script tag. */
export function nextData<T = unknown>(html: string): T {
	const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
	if (!match) throw new Error("Page has no __NEXT_DATA__ payload.");
	return JSON.parse(match[1]) as T;
}

/**
 * The text of an App Router page's flight payload: every `self.__next_f.push([1,"…"])` chunk, unescaped and joined.
 * Sources then search it for the JSON array or object that holds their rows.
 */
export function nextFlight(html: string): string {
	const chunks: string[] = [];
	for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
		chunks.push(JSON.parse(match[1]) as string);
	}
	if (!chunks.length) throw new Error("Page has no Next.js flight payload.");
	return chunks.join("");
}

/** The first balanced JSON value (object or array) in `text` that starts at or after the first match of `anchor`. */
export function jsonAfter<T = unknown>(text: string, anchor: string | RegExp): T {
	const at = typeof anchor === "string" ? text.indexOf(anchor) : text.search(anchor);
	if (at < 0) throw new Error(`Anchor ${String(anchor)} not found.`);
	const start = text.slice(at).search(/[[{]/);
	if (start < 0) throw new Error(`No JSON after ${String(anchor)}.`);
	const begin = at + start;
	let depth = 0;
	let inString = false;
	for (let index = begin; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (char === "\\") index += 1;
			else if (char === '"') inString = false;
		} else if (char === '"') inString = true;
		else if (char === "[" || char === "{") depth += 1;
		else if (char === "]" || char === "}") {
			depth -= 1;
			if (depth === 0) return JSON.parse(text.slice(begin, index + 1)) as T;
		}
	}
	throw new Error(`Unbalanced JSON after ${String(anchor)}.`);
}

/** Cells of every row of the first `<table>` (or the one matching `tableIndex`), tags stripped and entities decoded. */
export function htmlTable(html: string, tableIndex = 0): string[][] {
	const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)];
	const table = tables[tableIndex]?.[0];
	if (!table) throw new Error(`Page has no table ${tableIndex}.`);
	return [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
		.map((row) => [...row[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => htmlText(cell[1])))
		.filter((cells) => cells.length);
}

const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodes each entity once, in a single pass, so "&amp;lt;" becomes "&lt;" and not "<". */
export function decodeEntities(text: string): string {
	return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
		const code = decimal ? Number(decimal) : hex ? Number.parseInt(hex, 16) : null;
		if (code !== null) return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
		return NAMED_ENTITIES[name!.toLowerCase()] ?? entity;
	});
}

export function htmlText(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}
