import { benchmarkSourceId } from "../benchmark-source-ids";

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

type EpochCatalogModel = { model_slug: string; name: string; metadata?: unknown };

type EpochResultIdentity = { result_id: string; model_slug: string; result_key: string | null };

export function staleEpochResultIds(activeRows: EpochResultIdentity[], currentRows: EpochResultIdentity[]) {
	const currentIds = new Set(currentRows.map((row) => row.result_id));
	const matchedModels = new Set(currentRows.map((row) => row.model_slug));
	const sourceOwners = new Map<string, string>();
	const sourceId = (row: EpochResultIdentity) => {
		const prefix = `${row.model_slug}:epoch-capabilities-index:`;
		return row.result_key?.startsWith(prefix) ? row.result_key.slice(prefix.length) : null;
	};
	for (const row of currentRows) {
		const id = sourceId(row);
		if (id) sourceOwners.set(id, row.model_slug);
	}
	return activeRows.filter((row) => {
		if (currentIds.has(row.result_id)) return false;
		const id = sourceId(row);
		const owner = id ? sourceOwners.get(id) : undefined;
		return matchedModels.has(row.model_slug) || (owner !== undefined && owner !== row.model_slug);
	}).map((row) => row.result_id);
}

export function matchEpochRows(models: EpochCatalogModel[], rows: EpochEciRow[]) {
	const explicit = new Map<string, EpochCatalogModel>();
	const byName = new Map<string, EpochCatalogModel[]>();
	const missingMappings: Array<{ model_slug: string; sourceId: string }> = [];
	let explicitCount = 0;
	const sourceIds = new Set(rows.map((row) => row.model));
	if (sourceIds.size !== rows.length) throw new Error("Duplicate Epoch source IDs; no data was written.");
	for (const model of models) {
		const id = benchmarkSourceId(model.metadata, "epoch_ai", model.model_slug);
		if (id !== undefined) {
			if (id === null) continue;
			explicitCount += 1;
			// Epoch drops rows from its CSV; skip the model and keep its scores, as for a null mapping.
			if (!sourceIds.has(id)) { missingMappings.push({ model_slug: model.model_slug, sourceId: id }); continue; }
			if (explicit.has(id)) throw new Error(`Epoch source ${id} maps to both ${explicit.get(id)!.model_slug} and ${model.model_slug}.`);
			explicit.set(id, model);
			continue;
		}
		const key = normalizeEpochModelName(model.name);
		byName.set(key, [...(byName.get(key) ?? []), model]);
	}
	// Losing most pinned rows at once points to a source format change, not routine removals.
	if (missingMappings.length * 2 > explicitCount) throw new Error(`${missingMappings.length} of ${explicitCount} Epoch mappings refer to missing source IDs; no data was written.`);
	const matches = rows.map((row) => {
		const mapped = explicit.get(row.model);
		if (mapped) return { row, model: mapped, candidates: [mapped] };
		const candidates = [...new Map([
			...(byName.get(normalizeEpochModelName(row.displayName)) ?? []),
			...(byName.get(normalizeEpochModelName(row.model)) ?? []),
		].map((model) => [model.model_slug, model])).values()];
		return { row, model: candidates.length === 1 ? candidates[0] : null, candidates };
	});
	return { matches, missingMappings };
}
