import { join } from "path";
import { DIR_BENCHMARKS } from "../paths";
import { listDirs, readJsonWithHash } from "../util";
import { client, isDryRun, logWrite, assertOk, pruneRowsByColumn } from "../supa";
import { ChangeTracker } from "../state";

export async function loadBenchmarks(tracker: ChangeTracker) {
    tracker.touchPrefix(DIR_BENCHMARKS);
    const dirs = await listDirs(DIR_BENCHMARKS);
    const supa = client();
    const benchmarkIds = new Set<string>();
    let touched = false;
    for (const d of dirs) {
        const fp = join(d, "benchmark.json");
        const { data: j, hash } = await readJsonWithHash<any>(fp);
        const change = tracker.track(fp, hash, { benchmark_id: j.benchmark_id });

        const row = {
            id: j.benchmark_id,
            name: j.benchmark_name,
            category: j.category ?? null,
            ascending_order:
                typeof j.ascending_order === "boolean" ? j.ascending_order : null,
            type: j.type ?? null,
            link: j.link ?? null,
            total_models: j.total_models ?? 0,
        };

        if (row.id) benchmarkIds.add(row.id);
        if (change.status === "unchanged") continue;
        touched = true;

        if (isDryRun()) {
            logWrite("public.data_benchmarks", "UPSERT", row, { onConflict: "id" });
            continue;
        }

        const res = await supa.from("data_benchmarks").upsert(row, { onConflict: "id" });
        assertOk(res, "upsert data_benchmarks");
    }

    const deletions = tracker.getDeleted(DIR_BENCHMARKS);
    touched = touched || deletions.length > 0;
    if (!touched) return;

    await pruneRowsByColumn(supa, "data_benchmarks", "id", benchmarkIds, "data_benchmarks");
}
