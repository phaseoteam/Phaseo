import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ArtificialAnalysisMetricCharts from "./ArtificialAnalysisMetricCharts";
import BenchmarkProgressChart from "./BenchmarkProgressChart";
import ModelsUsingBenchmark from "./ModelsUsingBenchmark";

function formatDate(value: string | null | undefined) {
	return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
}

export function EpochCapabilitiesOverview({ benchmark }: { benchmark: BenchmarkPage }) {
	const results = (benchmark.results ?? []).filter((result) => result.score !== null && Number.isFinite(Number(result.score)));
	const sorted = [...results].sort((a, b) => Number(b.score) - Number(a.score));
	const best = sorted[0];
	const updated = results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
	const modelCount = new Set(results.map((result) => result.model_id)).size;
	const ranking: PublicBenchmarkRanking = {
		benchmark_id: benchmark.id,
		name: benchmark.name ?? benchmark.id,
		category: benchmark.category,
		benchmark_type: benchmark.type ?? null,
		lower_is_better: false,
		total_models: results.length,
		entries: sorted.map((result, index) => ({
			model_id: result.model_id,
			model_name: result.model?.name ?? result.model_id,
			organisation_id: result.model?.organisation?.organisation_id ?? null,
			organisation_name: result.model?.organisation?.display_name ?? result.model?.organisation?.name ?? null,
			organisation_colour: result.model?.organisation?.colour ?? null,
			release_date: result.model?.release_date ?? result.model?.announcement_date ?? null,
			other_info: typeof result.other_info === "string" ? result.other_info : null,
			source_link: result.source_link ?? null,
			updated_at: result.updated_at ?? result.created_at ?? null,
			score: Number(result.score),
			rank: result.rank ?? index + 1,
		})),
	};

	return <div className="space-y-12 pb-12">
		<section id="summary" className="scroll-mt-36 space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="max-w-3xl text-sm text-muted-foreground">An independent measure of frontier AI capabilities, presented with the latest published results from Epoch AI.</p>
				<span className="text-xs font-medium text-[#24bca5]">Higher is better</span>
			</div>
			<div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4">
				{[
					{ label: "Models with results", value: modelCount.toLocaleString() },
					{ label: "Highest score", value: best ? Number(best.score).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—" },
					{ label: "Leading model", value: best?.model?.name ?? best?.model_id ?? "—" },
					{ label: "Last synced", value: formatDate(updated) },
				].map((item) => <div key={item.label} className="space-y-2 border-b p-5 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="truncate text-lg font-semibold tabular-nums" title={item.value}>{item.value}</p></div>)}
			</div>
			<p className="text-xs text-muted-foreground">Source: <a href="https://epoch.ai/eci" target="_blank" rel="noreferrer" className="underline underline-offset-2">Epoch AI</a>. Scores and confidence intervals reflect the latest published ECI results.</p>
		</section>

		<ArtificialAnalysisMetricCharts rankings={[ranking]} variant="epoch" />

		<section id="progress" className="scroll-mt-36 space-y-4">
			<div><h2 className="text-xl font-semibold">Progress</h2><p className="mt-1 text-sm text-muted-foreground">See how the Capabilities Index has moved as new models have been released.</p></div>
			<BenchmarkProgressChart benchmark={{ ...benchmark, results }} />
		</section>

		<section id="model-results" className="scroll-mt-36"><ModelsUsingBenchmark benchmark={{ ...benchmark, results }} /></section>
	</div>;
}
