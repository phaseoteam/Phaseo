export type EpochEciRow = {
	model: string;
	displayName: string;
	score: number;
	ciLow: number;
	ciHigh: number;
	releaseDate: string;
	organisation: string;
};

export function normalizeEpochModelName(value: string) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function parseCsv(input: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];
		if (quoted) {
			if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
			else if (character === '"') quoted = false;
			else field += character;
		} else if (character === '"') quoted = true;
		else if (character === ",") { row.push(field); field = ""; }
		else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
		else field += character;
	}
	if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
	return rows;
}

export function parseEpochEciCsv(input: string): EpochEciRow[] {
	const [headers = [], ...rows] = parseCsv(input);
	const column = (name: string) => headers.indexOf(name);
	return rows.flatMap((row) => {
		const score = Number(row[column("eci")]);
		const ciLow = Number(row[column("eci_ci_low")]);
		const ciHigh = Number(row[column("eci_ci_high")]);
		const model = row[column("Model")]?.trim();
		const displayName = row[column("Display name")]?.trim() || model;
		if (!model || !displayName || !Number.isFinite(score)) return [];
		return [{ model, displayName, score, ciLow, ciHigh, releaseDate: row[column("date")]?.trim() ?? "", organisation: row[column("Organization")]?.trim() ?? "" }];
	}).sort((left, right) => right.score - left.score);
}

export function matchEpochRows(models: Array<{ model_slug: string; name: string }>, rows: EpochEciRow[]) {
	const byName = new Map<string, Array<{ model_slug: string; name: string }>>();
	for (const model of models) {
		const key = normalizeEpochModelName(model.name);
		byName.set(key, [...(byName.get(key) ?? []), model]);
	}
	return rows.map((row) => {
		const candidates = [...new Map([
			...(byName.get(normalizeEpochModelName(row.displayName)) ?? []),
			...(byName.get(normalizeEpochModelName(row.model)) ?? []),
		].map((model) => [model.model_slug, model])).values()];
		return { row, model: candidates.length === 1 ? candidates[0] : null, candidates };
	});
}
