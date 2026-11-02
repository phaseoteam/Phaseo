// CSV import helpers: parse an export (RFC 4180: quoted fields, doubled quotes, line breaks inside
// quotes, CRLF or LF), guess which columns hold what, and split rows into request-sized batches.

export function parseCsv(text: string, maxRows = 5000): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index]!;
		if (quoted) {
			if (char === '"') {
				if (source[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
			} else field += char;
			continue;
		}
		if (char === '"' && field === "") { quoted = true; continue; }
		if (char === ",") { row.push(field); field = ""; continue; }
		if (char === "\r" || char === "\n") {
			if (char === "\r" && source[index + 1] === "\n") index += 1;
			row.push(field); field = "";
			if (row.some((cell) => cell !== "")) rows.push(row);
			row = [];
			if (rows.length > maxRows) break;
			continue;
		}
		field += char;
	}
	if (field !== "" || row.length) { row.push(field); if (row.some((cell) => cell !== "")) rows.push(row); }
	return rows.slice(0, maxRows + 1);
}

export const IMPORT_FIELDS = ["title", "description", "state", "priority", "labels", "estimate", "externalId"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportMapping = Partial<Record<ImportField, number>>;

const HEADER_GUESSES: Record<ImportField, string[]> = {
	title: ["title", "name", "summary", "subject", "issue"],
	description: ["description", "body", "details", "content"],
	state: ["status", "state", "workflow state"],
	priority: ["priority"],
	labels: ["labels", "label", "tags", "tag"],
	estimate: ["estimate", "points", "story points", "story point estimate"],
	externalId: ["id", "key", "identifier", "issue key", "issue id", "number"],
};

/** Which column each field most likely comes from, by header name. */
export function guessMapping(header: string[]): ImportMapping {
	const normalised = header.map((cell) => cell.trim().toLowerCase());
	const mapping: ImportMapping = {};
	const used = new Set<number>();
	for (const field of IMPORT_FIELDS) {
		for (const guess of HEADER_GUESSES[field]) {
			const index = normalised.findIndex((cell, position) => !used.has(position) && cell === guess);
			if (index >= 0) { mapping[field] = index; used.add(index); break; }
		}
	}
	return mapping;
}

export type ImportRowInput = Partial<Record<ImportField, string>>;

/** The rows as the import API takes them (without the header row), skipping rows with no title. */
export function mapRows(rows: string[][], mapping: ImportMapping): ImportRowInput[] {
	if (mapping.title === undefined) return [];
	return rows.flatMap((row) => {
		const out: ImportRowInput = {};
		for (const field of IMPORT_FIELDS) {
			const index = mapping[field];
			if (index !== undefined && row[index] !== undefined) out[field] = field === "description" ? row[index]!.slice(0, 20_000) : row[index]!.trim();
		}
		return out.title ? [out] : [];
	});
}

/** Batches of at most maxRows rows and roughly maxBytes of JSON each. */
export function batchRows<T>(rows: T[], maxRows = 100, maxBytes = 700_000): T[][] {
	const batches: T[][] = [];
	let current: T[] = [];
	let bytes = 0;
	for (const row of rows) {
		const size = JSON.stringify(row).length;
		if (current.length && (current.length >= maxRows || bytes + size > maxBytes)) { batches.push(current); current = []; bytes = 0; }
		current.push(row);
		bytes += size;
	}
	if (current.length) batches.push(current);
	return batches;
}
