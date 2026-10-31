import { cacheLife } from "next/cache";
import { buildEpochDashboard, epochNumber, type EpochDashboardData } from "./epochDashboard";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

async function sourceFile(file: string) {
	const response = await fetch(`https://epoch.ai/data/${file}`, { signal: AbortSignal.timeout(12_000) });
	if (!response.ok) throw new Error(`Epoch ${file}: ${response.status}`);
	return { text: await response.text(), modified: response.headers.get("last-modified") };
}

async function fetchEpochSource() {
	"use cache";
	cacheLife("hours");
	const [scores, domain] = await Promise.all([
		sourceFile("eci_scores.csv"),
		Promise.all([sourceFile("processed_data_for_eci.csv"), sourceFile("edi_scores.csv"), sourceFile("benchmarks.json")]).catch(() => null),
	]);
	return { scores, domain, fetchedAt: new Date().toISOString() };
}

export async function fetchEpochDashboard(benchmark: BenchmarkPage): Promise<EpochDashboardData> {
	try {
		const { scores, domain, fetchedAt } = await fetchEpochSource();
		let rows;
		try {
			rows = buildEpochDashboard(scores.text, domain?.[0].text ?? null, domain?.[1].text ?? null, domain ? JSON.parse(domain[2].text) : null, benchmark);
		} catch {
			// An invalid domain bundle must not hide an otherwise valid general publication.
			rows = buildEpochDashboard(scores.text, null, null, null, benchmark);
		}
		if (!rows.length) throw new Error("Empty Epoch publication");
		return { rows, source: "epoch", sourceDate: fetchedAt, domainsAvailable: rows.some((row) => row.scores.coding !== null || row.scores.maths !== null) };
	} catch (error) {
		// eslint-disable-next-line no-console -- Keep upstream publication failures visible while serving catalogue fallback.
		console.warn("[benchmarks] Epoch publication unavailable; displaying imported results", error instanceof Error ? error.message : "Unknown error");
		return { source: "catalogue", sourceDate: benchmark.results.map((r) => r.updated_at).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null, domainsAvailable: false,
			rows: benchmark.results.flatMap((r) => { const score = epochNumber(r.score); return score === null ? [] : [{ id: r.id, name: r.model?.name ?? r.model_id, organisation: r.model?.organisation?.display_name ?? r.model?.organisation?.name ?? "", access: "unknown" as const, date: r.model?.release_date ?? r.model?.announcement_date ?? null, modelId: r.model_id, scores: { overall: score, coding: null, maths: null }, interval: null, counts: { coding: 0, maths: 0 } }]; }) };
	}
}
