import "dotenv/config";

import { compareBenchmarkScoresForBenchmark } from "../../src/lib/benchmarks/scoreFormat";
import { assertOk, client, isDryRun, logWrite } from "./supa";
import { chunk } from "./util";

type BenchmarkResultRow = {
	id: string;
	result_key: string | null;
	model_id: string;
	benchmark_id: string;
	score: string | number | null;
	is_self_reported: boolean | null;
	other_info: string | null;
	source_link: string | null;
	occur_idx: number | null;
	variant: string | null;
	rank: number | null;
};

type BenchmarkMetaRow = {
	id: string;
	ascending_order: boolean | null;
};

const PAGE_SIZE = 1000;

const getArgValue = (name: string): string | null => {
	const prefixed = `--${name}=`;
	const match = process.argv.find((arg) => arg.startsWith(prefixed));
	return match ? match.slice(prefixed.length) : null;
};

function parseScore(value: string | number | null): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const numeric = Number(trimmed);
		return Number.isFinite(numeric) ? numeric : null;
	}
	return null;
}

async function fetchAllBenchmarkRows(
	benchmarkIds: string[] | null,
): Promise<BenchmarkResultRow[]> {
	const supa = client();
	const out: BenchmarkResultRow[] = [];

	if (benchmarkIds && benchmarkIds.length === 0) return out;

	const idGroups =
		benchmarkIds && benchmarkIds.length
			? chunk(Array.from(new Set(benchmarkIds)), 200)
			: [null];

	for (const ids of idGroups) {
		for (let offset = 0; ; offset += PAGE_SIZE) {
			let query = supa
				.from("data_benchmark_results")
				.select(
					"id,result_key,model_id,benchmark_id,score,is_self_reported,other_info,source_link,occur_idx,variant,rank",
				)
				.order("benchmark_id", { ascending: true })
				.order("id", { ascending: true })
				.range(offset, offset + PAGE_SIZE - 1);

			if (ids) {
				query = query.in("benchmark_id", ids);
			}

			const rows = assertOk(
				await query,
				"select data_benchmark_results for rank recompute",
			) as BenchmarkResultRow[];

			if (!rows.length) break;
			out.push(...rows);
			if (rows.length < PAGE_SIZE) break;
		}
	}

	return out;
}

async function fetchBenchmarkMeta(
	benchmarkIds: string[],
): Promise<Map<string, boolean | null>> {
	const supa = client();
	const out = new Map<string, boolean | null>();
	if (!benchmarkIds.length) return out;

	for (const ids of chunk(Array.from(new Set(benchmarkIds)), 200)) {
		const rows = assertOk(
			await supa
				.from("data_benchmarks")
				.select("id,ascending_order")
				.in("id", ids),
			"select data_benchmarks for rank recompute",
		) as BenchmarkMetaRow[];

		for (const row of rows) {
			out.set(row.id, typeof row.ascending_order === "boolean" ? row.ascending_order : null);
		}
	}

	return out;
}

async function benchmarkIdsForModel(modelId: string): Promise<string[]> {
	const supa = client();
	const rows: Array<{ benchmark_id: string | null }> = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const page = assertOk(
			await supa
				.from("data_benchmark_results")
				.select("id,benchmark_id")
				.eq("model_id", modelId)
				.order("benchmark_id", { ascending: true })
				.order("id", { ascending: true })
				.range(offset, offset + PAGE_SIZE - 1),
			`select benchmark ids for model ${modelId}`,
		) as Array<{ benchmark_id: string | null }>;

		if (!page.length) break;
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}

	return Array.from(
		new Set(
			rows
				.map((row) => row.benchmark_id)
				.filter((value): value is string => typeof value === "string" && value.length > 0),
		),
	);
}

function buildRankedRows(
	rows: BenchmarkResultRow[],
	ascendingByBenchmark: Map<string, boolean | null>,
): BenchmarkResultRow[] {
	const byBenchmark = new Map<string, BenchmarkResultRow[]>();

	for (const row of rows) {
		const bucket = byBenchmark.get(row.benchmark_id) ?? [];
		bucket.push(row);
		byBenchmark.set(row.benchmark_id, bucket);
	}

	const ranked: BenchmarkResultRow[] = [];

	for (const [benchmarkId, group] of byBenchmark) {
		const numeric = group
			.map((row) => ({ row, numericScore: parseScore(row.score) }))
			.filter(
				(item): item is { row: BenchmarkResultRow; numericScore: number } =>
					item.numericScore != null,
			)
			.sort((a, b) => {
				if (a.numericScore !== b.numericScore) {
					return compareBenchmarkScoresForBenchmark(
						a.numericScore,
						b.numericScore,
						benchmarkId,
						ascendingByBenchmark,
					);
				}
				const resultKeyCompare = (a.row.result_key ?? "").localeCompare(
					b.row.result_key ?? "",
				);
				if (resultKeyCompare !== 0) return resultKeyCompare;
				return a.row.id.localeCompare(b.row.id);
			});

		const rankById = new Map<string, number>();
		numeric.forEach((item, index) => {
			rankById.set(item.row.id, index + 1);
		});

		for (const row of group) {
			ranked.push({
				...row,
				rank: rankById.get(row.id) ?? null,
			});
		}
	}

	return ranked;
}

async function writeRankedRows(rows: BenchmarkResultRow[]): Promise<void> {
	if (!rows.length) return;

	if (isDryRun()) {
		for (const row of rows) {
			logWrite("public.data_benchmark_results", "UPSERT", row, {
				onConflict: "id",
			});
		}
		return;
	}

	const supa = client();
	for (const batch of chunk(rows, 500)) {
		assertOk(
			await supa.from("data_benchmark_results").upsert(batch, {
				onConflict: "id",
			}),
			"upsert ranked data_benchmark_results",
		);
	}
}

async function main() {
	const benchmarkFilter = getArgValue("benchmark");
	const modelFilter = getArgValue("model");

	let benchmarkIds: string[] | null = null;
	if (benchmarkFilter) {
		benchmarkIds = [benchmarkFilter];
	}
	if (modelFilter) {
		const modelBenchmarkIds = await benchmarkIdsForModel(modelFilter);
		benchmarkIds = benchmarkIds
			? benchmarkIds.filter((id) => modelBenchmarkIds.includes(id))
			: modelBenchmarkIds;
	}

	console.log(">> Recomputing benchmark ranks in DB");
	if (benchmarkFilter) console.log(`>> Benchmark filter: ${benchmarkFilter}`);
	if (modelFilter) console.log(`>> Model filter: ${modelFilter}`);
	if (isDryRun()) console.log(">> Dry run enabled");

	const rows = await fetchAllBenchmarkRows(benchmarkIds);
	const touchedBenchmarkIds = Array.from(new Set(rows.map((row) => row.benchmark_id)));
	const benchmarkMeta = await fetchBenchmarkMeta(touchedBenchmarkIds);
	const rankedRows = buildRankedRows(rows, benchmarkMeta);

	await writeRankedRows(rankedRows);

	console.log(
		`>> Done. recomputed_rows=${rankedRows.length} benchmarks=${touchedBenchmarkIds.length}`,
	);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
