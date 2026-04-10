import ModelsUsingBenchmarkClient from "./ModelsUsingBenchmarkTable";
import {
	getLowerIsBetter,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

interface ModelsUsingBenchmarkProps {
	benchmark: any; // BenchmarkPage from getBenchmark
}

export default function ModelsUsingBenchmark({
	benchmark,
}: ModelsUsingBenchmarkProps) {
	const results = benchmark?.results ?? [];

	// Build server-serializable modelsByProvider structure
	const map = new Map<string, any>();
	for (const r of results) {
		const modelId =
			r.model?.model_id ?? r.model_id ?? String(Math.random());
		let m = map.get(modelId);
		if (!m) {
			// Map organisation fields into the model.organisation object for the client
			const org = r.model?.organisation ?? null;
			m = {
				id: modelId,
				name: r.model?.name ?? modelId,
				organisation: org
					? {
							organisation_id: org.organisation_id ?? null,
							display_name:
								org.display_name ?? org.name ?? "Unknown",
							name: org.name ?? null,
							logo: org.logo ?? null,
							logo_url: org.logo_url ?? null,
					  }
					: { organisation_id: null, display_name: "Unknown" },
				release_date: r.model?.release_date ?? null,
				announcement_date: r.model?.announcement_date ?? null,
				benchmark_results: [],
			};
			map.set(modelId, m);
		}
		m.benchmark_results.push({
			id: r.id ?? String(Math.random()),
			benchmark_id: benchmark.id,
			benchmark: {
				id: benchmark.id,
				name: benchmark.name ?? undefined,
				order: r.benchmark_order ?? null,
				type: benchmark.type ?? null,
			},
			name: benchmark.name ?? undefined,
			score: r.score,
			other_info: r.other_info ?? null,
			source_link: r.source_link ?? null,
			is_self_reported: !!r.is_self_reported,
			created_at: r.created_at ?? null,
			updated_at: r.updated_at ?? null,
			rank: r.rank ?? null,
		});
	}

	const modelsWithBenchmark = Array.from(map.values());

	const isLowerBetter = getLowerIsBetter(
		null,
		typeof benchmark?.ascending_order === "boolean"
			? benchmark.ascending_order
			: null
	);
	const isPercentage = resolveBenchmarkIsPercentage({
		benchmarkType: benchmark?.type,
		fallback: results.some(
			(result: any) =>
				typeof result?.score === "string" && result.score.includes("%")
		),
	});

	// Build flat models array and compute top score per model
	const models = modelsWithBenchmark.map((m: any) => {
		const scores = (m.benchmark_results || []).map((r: any) => ({
			...r,
			parsed_score: normalizeBenchmarkScoreValue(
				parseBenchmarkScore(r.score),
				isPercentage
			),
		}));
		const sortedScores = scores.slice().sort((a: any, b: any) => {
			if (a.rank != null && b.rank != null) {
				const diff = a.rank - b.rank;
				if (diff !== 0) return diff;
			}
			if (a.parsed_score != null && b.parsed_score != null)
				return isLowerBetter
					? a.parsed_score - b.parsed_score
					: b.parsed_score - a.parsed_score;
			return (a.score || "")
				.toString()
				.localeCompare((b.score || "").toString());
		});
		const top = sortedScores[0] || null;
		const reportedDate = m.release_date ?? m.announcement_date ?? null;
		return {
			...m,
			benchmark_results: sortedScores,
			top_score: top,
			reported_date: reportedDate,
		};
	});

	// Global sort of models by top_score
	models.sort((a: any, b: any) => {
		const pa = a.top_score?.parsed_score ?? null;
		const pb = b.top_score?.parsed_score ?? null;
		if (pa != null && pb != null) return isLowerBetter ? pa - pb : pb - pa;
		return (a.name || "")
			.toString()
			.localeCompare((b.name || "").toString());
	});

	return (
		<ModelsUsingBenchmarkClient
			models={models}
			benchmarkId={benchmark?.id}
			benchmarkType={benchmark?.type ?? null}
			isLowerBetter={isLowerBetter}
		/>
	);
}
