export const PROGRESS_INDEX_ID = "aa-progress-index-v1";
export const PROGRESS_INDEX_URL = "https://artificialanalysis.ai/trends";
// Fixed by the methodology: o3-mini (high) scores 220 and GPT-5.5 (xhigh) 320.
const ANCHORS = [["076f2674-bc4b-4925-be59-50832eb8c090", 220], ["1f054429-397e-4fdb-9e71-67bc92c1735e", 320]] as const;

type TrendsModel = { id?: unknown; name?: unknown; score?: unknown };
export type ProgressIndexRow = { sourceId: string; name: string; score: number; modelSlug: string; variant: string | null };

/** Trends rows carry the Progress Index as `score`; refuse the payload if the scale anchors moved. */
export function progressIndexRows(models: TrendsModel[], owners: Map<string, string>, variants: Map<string, string | null>) {
	const byId = new Map(models.flatMap((model) => typeof model.id === "string" ? [[model.id, model]] : []));
	for (const [id, expected] of ANCHORS) {
		const score = byId.get(id)?.score;
		if (typeof score !== "number" || Math.abs(score - expected) > 0.01) throw new Error(`Progress Index anchor ${id} is ${String(score)}, expected ${expected}; the trends payload may have changed`);
	}
	const rows: ProgressIndexRow[] = [];
	let scored = 0;
	for (const model of byId.values()) {
		if (typeof model.score !== "number" || !Number.isFinite(model.score)) continue;
		scored++;
		const modelSlug = owners.get(model.id as string);
		if (modelSlug) rows.push({ sourceId: model.id as string, name: typeof model.name === "string" ? model.name : String(model.id), score: model.score, modelSlug, variant: variants.get(model.id as string) ?? null });
	}
	return { rows: rows.sort((a, b) => b.score - a.score), scored };
}

/**
 * AA refits every score together, so rows missing from the latest fit are retired rather
 * than mixed with it. A run that would replace less than half the active rows is refused.
 */
export function staleProgressResultIds(activeIds: string[], incomingIds: string[]) {
	if (activeIds.length && incomingIds.length < activeIds.length / 2) throw new Error(`Progress Index sync matched ${incomingIds.length} rows against ${activeIds.length} active; refusing to retire them`);
	const incoming = new Set(incomingIds);
	return activeIds.filter((id) => !incoming.has(id));
}
