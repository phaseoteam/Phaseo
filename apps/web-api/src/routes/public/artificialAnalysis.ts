type Score = {
	benchmark_id: string; model_slug: string; score_numeric: number | null;
	other_info: string | null; source_link: string | null; updated_at: string | null;
	variant: string | null; result_key: string | null;
};

export function indexVersion(info: string | null) {
	return info?.match(/Intelligence Index v(\d+(?:\.\d+)*)(?=$|[\s;]|[.!?](?=$|\s))/)?.[1] ?? null;
}

function sourceId(info: string | null) {
	return info?.match(/Artificial Analysis ID ([\w-]+)(?:;|$)/)?.[1] ?? null;
}

/** Standalone manual results cannot replace the version of the imported dataset. */
export function latestIndexVersion(rows: Array<{ other_info: string | null }>) {
	const imported = rows.filter((row) => sourceId(row.other_info));
	return (imported.length ? imported : rows).map((row) => indexVersion(row.other_info))
		.filter((version): version is string => Boolean(version))
		.sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
}

export function intelligenceValueResults(rows: Score[], intelligenceId: string, costId: string) {
	const version = latestIndexVersion(rows.filter((row) => row.benchmark_id === intelligenceId));
	const key = (row: Score) => JSON.stringify([row.model_slug, sourceId(row.other_info), indexVersion(row.other_info), row.variant, row.updated_at]);
	const costs = new Map<string, Score>();
	const conflictingCosts = new Set<string>();
	for (const row of rows.filter((row) => row.benchmark_id === costId && sourceId(row.other_info) && row.updated_at && indexVersion(row.other_info) === version)) {
		const identity = key(row);
		if (costs.has(identity) && costs.get(identity)!.score_numeric !== row.score_numeric) conflictingCosts.add(identity);
		else costs.set(identity, row);
	}
	return rows.flatMap((row) => {
		if (row.benchmark_id !== intelligenceId || !sourceId(row.other_info) || !row.updated_at || indexVersion(row.other_info) !== version) return [];
		const rawCost = conflictingCosts.has(key(row)) ? null : costs.get(key(row))?.score_numeric;
		if (row.score_numeric == null || rawCost == null) return [];
		const cost = Number(rawCost);
		const intelligence = Number(row.score_numeric);
		if (!Number.isFinite(intelligence) || intelligence <= 0 || !Number.isFinite(cost) || cost <= 0) return [];
		const ratio = cost / intelligence;
		if (!Number.isFinite(ratio)) return [];
		return [{ ...row, score_numeric: ratio, intelligence_score: intelligence, evaluation_cost: cost }];
	});
}
