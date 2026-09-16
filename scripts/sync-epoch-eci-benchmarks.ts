import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { matchEpochRows, parseEpochEciCsv } from "./epoch-eci/core";

const BENCHMARK_ID = "epoch-capabilities-index";
const SOURCE_URL = "https://epoch.ai/data/eci_scores.csv";

for (const file of ["apps/web/.env.local", ".env.local", ".env"]) {
	if (existsSync(resolve(file))) loadEnvFile(resolve(file));
}

function stableUuid(value: string) {
	const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
	hash[12] = "4";
	hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
	const string = hash.join("");
	return `${string.slice(0, 8)}-${string.slice(8, 12)}-${string.slice(12, 16)}-${string.slice(16, 20)}-${string.slice(20)}`;
}

function writeJson(file: string, value: unknown) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
	const response = await fetch(SOURCE_URL, { headers: { "user-agent": "Phaseo benchmark sync (https://phaseo.app)" } });
	if (!response.ok) throw new Error(`Epoch ECI download failed with ${response.status}.`);
	const sourceRows = parseEpochEciCsv(await response.text());
	if (!sourceRows.length) throw new Error("Epoch ECI source returned no valid scores.");

	const db = createAdminClient();
	const models: Array<{ model_slug: string; name: string }> = [];
	for (let offset = 0; ; offset += 500) {
		const { data, error } = await db.from("v2_models").select("model_slug,name").order("model_slug").range(offset, offset + 499);
		if (error) throw error;
		models.push(...(data ?? []));
		if ((data ?? []).length < 500) break;
	}
	const matches = matchEpochRows(models, sourceRows);
	const matched = matches.filter((match) => match.model);
	const report = {
		source: SOURCE_URL,
		fetchedAt: new Date().toISOString(),
		sourceModels: sourceRows.length,
		matched: matched.length,
		unmatched: matches.filter((match) => !match.model).map(({ row, candidates }) => ({ sourceModel: row.model, displayName: row.displayName, candidates })),
	};
	const reportArg = process.argv.find((argument) => argument.startsWith("--report="));
	if (reportArg) writeJson(resolve(reportArg.slice("--report=".length)), report);
	console.log(`Epoch ECI: ${matched.length}/${sourceRows.length} source models matched.`);
	if (!matched.length) throw new Error("No Epoch ECI models matched; no benchmark data was written.");
	if (!process.argv.includes("--write")) { console.log("Dry run complete. Use --write to update the database catalog."); return; }

	const updatedAt = report.fetchedAt;
	const { error: benchmarkError } = await db.from("v2_benchmarks").upsert({ benchmark_id: BENCHMARK_ID, name: "Epoch Capabilities Index", category: "general", ascending_order: true, benchmark_type: "numerical", link: "https://epoch.ai/eci", total_models: matched.length, updated_at: updatedAt }, { onConflict: "benchmark_id" });
	if (benchmarkError) throw benchmarkError;
	const rows = matched.map(({ row, model }, index) => {
		const resultKey = `${model!.model_slug}:${BENCHMARK_ID}:${row.model}`;
		const interval = Number.isFinite(row.ciLow) && Number.isFinite(row.ciHigh) && row.ciHigh > row.ciLow ? `; 95% CI ${row.ciLow.toFixed(2)}–${row.ciHigh.toFixed(2)}` : "";
		return { result_id: stableUuid(`benchmark-result:${resultKey}`), model_slug: model!.model_slug, benchmark_id: BENCHMARK_ID, score: String(row.score), score_numeric: row.score, is_self_reported: false, other_info: `Epoch AI model ${row.model}${interval}`, source_link: "https://epoch.ai/eci", rank: index + 1, occur_idx: index, variant: null, result_key: resultKey, effective_to: null, updated_at: updatedAt };
	});
	for (let index = 0; index < rows.length; index += 250) {
		const { error } = await db.from("v2_benchmark_results").upsert(rows.slice(index, index + 250), { onConflict: "result_id" });
		if (error) throw error;
	}
	const { data: activeRows, error: activeRowsError } = await db.from("v2_benchmark_results").select("result_id").eq("benchmark_id", BENCHMARK_ID).is("effective_to", null);
	if (activeRowsError) throw activeRowsError;
	const currentResultIds = new Set(rows.map((row) => row.result_id));
	const staleResultIds = (activeRows ?? []).filter((row) => !currentResultIds.has(row.result_id)).map((row) => row.result_id);
	if (staleResultIds.length) {
		const { error } = await db.from("v2_benchmark_results").update({ effective_to: updatedAt, updated_at: updatedAt }).is("effective_to", null).in("result_id", staleResultIds);
		if (error) throw error;
	}
	console.log(`Synchronized ${rows.length} Epoch ECI results. Public caches expire under their normal TTLs.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
