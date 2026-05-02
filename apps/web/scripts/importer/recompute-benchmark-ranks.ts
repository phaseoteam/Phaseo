import { promises as fs } from "fs";
import { join } from "path";

import { compareBenchmarkScoresForBenchmark } from "../../src/lib/benchmarks/scoreFormat";
import { DIR_BENCHMARKS, DIR_MODELS } from "./paths";
import { listDirs, readJson } from "./util";

type BenchmarkEntry = {
	benchmark_id: string;
	score: unknown;
	is_self_reported?: boolean;
	other_info?: string | null;
	source_link?: string | null;
	rank?: number | null;
};

type ModelJson = {
	model_id: string;
	organisation_id: string;
	name: string;
	benchmarks?: BenchmarkEntry[];
	[key: string]: unknown;
};

type BenchmarkMetaJson = {
	benchmark_id: string;
	ascending_order?: boolean | null;
};

type ModelFile = {
	path: string;
	data: ModelJson;
};

type RankedBenchmarkRow = {
	modelFile: ModelFile;
	entryIndex: number;
	model_id: string;
	benchmark_id: string;
	score: number | null;
	other_info: string | null;
	source_link: string | null;
};

const getArgValue = (name: string): string | null => {
	const prefixed = `--${name}=`;
	const match = process.argv.find((arg) => arg.startsWith(prefixed));
	return match ? match.slice(prefixed.length) : null;
};

function parseScore(value: unknown): number | null {
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

async function loadBenchmarkMeta(): Promise<Map<string, boolean | null>> {
	const out = new Map<string, boolean | null>();
	const benchmarkDirs = await listDirs(DIR_BENCHMARKS);

	for (const benchmarkDir of benchmarkDirs) {
		const benchmarkPath = join(benchmarkDir, "benchmark.json");
		try {
			const benchmark = await readJson<BenchmarkMetaJson>(benchmarkPath);
			out.set(
				benchmark.benchmark_id,
				typeof benchmark.ascending_order === "boolean" ? benchmark.ascending_order : null,
			);
		} catch {
			continue;
		}
	}

	return out;
}

async function loadModelFiles(modelFilter: string | null): Promise<ModelFile[]> {
	const files: ModelFile[] = [];
	const orgDirs = await listDirs(DIR_MODELS);

	for (const orgDir of orgDirs) {
		const modelDirs = await listDirs(orgDir);
		for (const modelDir of modelDirs) {
			const modelPath = join(modelDir, "model.json");
			try {
				const data = await readJson<ModelJson>(modelPath);
				if (modelFilter && data.model_id !== modelFilter) continue;
				files.push({ path: modelPath, data });
			} catch {
				continue;
			}
		}
	}

	return files;
}

function benchmarkIdsForModel(modelFiles: ModelFile[], modelId: string): string[] {
	const modelFile = modelFiles.find((entry) => entry.data.model_id === modelId);
	if (!modelFile) {
		throw new Error(`Model '${modelId}' not found in catalog`);
	}

	return Array.from(
		new Set(
			(modelFile.data.benchmarks ?? [])
				.map((entry) => entry?.benchmark_id)
				.filter((value): value is string => typeof value === "string" && value.length > 0),
		),
	);
}

function collectRankRows(
	modelFiles: ModelFile[],
	benchmarkIds: Set<string> | null,
): RankedBenchmarkRow[] {
	const rows: RankedBenchmarkRow[] = [];

	for (const modelFile of modelFiles) {
		const benchmarks = modelFile.data.benchmarks ?? [];
		benchmarks.forEach((entry, entryIndex) => {
			if (!entry || typeof entry.benchmark_id !== "string" || !entry.benchmark_id.trim()) {
				return;
			}
			if (benchmarkIds && !benchmarkIds.has(entry.benchmark_id)) return;

			rows.push({
				modelFile,
				entryIndex,
				model_id: modelFile.data.model_id,
				benchmark_id: entry.benchmark_id,
				score: parseScore(entry.score),
				other_info: entry.other_info ?? null,
				source_link: entry.source_link ?? null,
			});
		});
	}

	return rows;
}

function recomputeRanks(
	rows: RankedBenchmarkRow[],
	ascendingByBenchmark: Map<string, boolean | null>,
): Map<ModelFile, Set<number>> {
	const touchedEntries = new Map<ModelFile, Set<number>>();
	const byBenchmark = new Map<string, RankedBenchmarkRow[]>();

	for (const row of rows) {
		const bucket = byBenchmark.get(row.benchmark_id) ?? [];
		bucket.push(row);
		byBenchmark.set(row.benchmark_id, bucket);
	}

	for (const group of byBenchmark.values()) {
		for (const row of group) {
			const benchmark = row.modelFile.data.benchmarks?.[row.entryIndex];
			if (benchmark) benchmark.rank = null;
		}
	}

	for (const [benchmarkId, group] of byBenchmark) {
		const ranked = group
			.filter((row): row is RankedBenchmarkRow & { score: number } => row.score != null)
			.sort((a, b) => {
				if (a.score !== b.score) {
					return compareBenchmarkScoresForBenchmark(
						a.score,
						b.score,
						benchmarkId,
						ascendingByBenchmark,
					);
				}
				if (a.model_id !== b.model_id) return a.model_id.localeCompare(b.model_id);
				const otherInfoCompare = (a.other_info ?? "").localeCompare(b.other_info ?? "");
				if (otherInfoCompare !== 0) return otherInfoCompare;
				const sourceCompare = (a.source_link ?? "").localeCompare(b.source_link ?? "");
				if (sourceCompare !== 0) return sourceCompare;
				return a.entryIndex - b.entryIndex;
			});

		ranked.forEach((row, index) => {
			const benchmark = row.modelFile.data.benchmarks?.[row.entryIndex];
			if (!benchmark) return;
			benchmark.rank = index + 1;
			let touched = touchedEntries.get(row.modelFile);
			if (!touched) {
				touched = new Set<number>();
				touchedEntries.set(row.modelFile, touched);
			}
			touched.add(row.entryIndex);
		});
	}

	return touchedEntries;
}

async function writeModelFiles(modelFiles: ModelFile[]): Promise<void> {
	for (const modelFile of modelFiles) {
		const next = `${JSON.stringify(modelFile.data, null, 2)}\n`;
		await fs.writeFile(modelFile.path, next, "utf-8");
	}
}

async function main() {
	const benchmarkFilter = getArgValue("benchmark");
	const modelFilter = getArgValue("model");

	console.log(">> Recomputing benchmark ranks in catalog");
	if (benchmarkFilter) console.log(`>> Benchmark filter: ${benchmarkFilter}`);
	if (modelFilter) console.log(`>> Model filter: ${modelFilter}`);

	const modelFiles = await loadModelFiles(null);
	const benchmarkIdsInScope = benchmarkFilter
		? new Set([benchmarkFilter])
		: modelFilter
			? new Set(benchmarkIdsForModel(modelFiles, modelFilter))
			: null;

	const rows = collectRankRows(modelFiles, benchmarkIdsInScope);
	const ascendingByBenchmark = await loadBenchmarkMeta();
	const touchedEntries = recomputeRanks(rows, ascendingByBenchmark);

	const filesToWrite = modelFiles.filter((modelFile) =>
		(modelFile.data.benchmarks ?? []).some((entry) =>
			benchmarkIdsInScope ? benchmarkIdsInScope.has(entry.benchmark_id) : true,
		),
	);
	await writeModelFiles(filesToWrite);

	const touchedModels = filesToWrite.length;
	const touchedBenchmarks = new Set(rows.map((row) => row.benchmark_id)).size;
	const rankedEntries = Array.from(touchedEntries.values()).reduce(
		(total, indexes) => total + indexes.size,
		0,
	);

	console.log(
		`>> Done. touched_models=${touchedModels} benchmarks=${touchedBenchmarks} ranked_entries=${rankedEntries}`,
	);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
