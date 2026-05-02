import { compareBenchmarkScores } from "../../../src/lib/benchmarks/scoreFormat";

type Row = { model_id: string; benchmark_id: string; score: string; ascending_order: boolean };

function toNum(s: string) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Returns:
 *   model_id -> {
 *     benchmarks: {
 *       [benchmark_id]: {
 *         rank: number,
 *         total: number,
 *         graphData: [ [model_id, score], ... ] // includes current model, ±5 neighbours (or fewer at edges)
 *       }
 *     }
 *   }
 */
export function computeBenchMap(all: Row[], window = 5) {
    const byBench: Record<string, { asc: boolean; rows: { mid: string; f: number }[] }> = {};
    for (const r of all) {
        const f = toNum(r.score);
        if (f == null) continue;
        const b = (byBench[r.benchmark_id] ??= { asc: r.ascending_order, rows: [] });
        b.rows.push({ mid: r.model_id, f });
    }

    // Sort each benchmark according to its ascending flag
    for (const b of Object.values(byBench)) {
        b.rows.sort((a, b2) => compareBenchmarkScores(a.f, b2.f, b.asc));
    }

    const out: Record<string, any> = {};

    for (const [bid, b] of Object.entries(byBench)) {
        const rows = b.rows;
        const total = rows.length;

        // Build index for quick locating
        const index: Record<string, number> = {};
        rows.forEach((r, i) => (index[r.mid] = i));

        for (let i = 0; i < rows.length; i++) {
            const mid = rows[i].mid;

            const start = Math.max(0, i - window);
            const end = Math.min(total, i + window + 1);

            // graphData includes the current row and neighbours, in sorted order
            const graphData: [string, number][] = rows.slice(start, end).map(r => [r.mid, r.f]);

            const bucket = (out[mid] ??= { benchmarks: {} });
            bucket.benchmarks[bid] = {
                rank: i + 1,
                total,
                graphData,
            };
        }
    }
    return out;
}
