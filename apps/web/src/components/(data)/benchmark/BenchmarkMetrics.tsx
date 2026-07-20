import { Card } from "@/components/ui/card";
import {
	BarChart3,
	TrendingUp,
	Users,
	Calendar,
	UserCheck,
	Target,
	Minimize2,
	Maximize2,
	Crown,
	Database,
} from "lucide-react";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import {
	formatBenchmarkScore,
	getLowerIsBetter,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

interface BenchmarkMetricsProps {
	benchmark: BenchmarkPage;
}

function formatDate(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

export default function BenchmarkMetrics({ benchmark }: BenchmarkMetricsProps) {
	const results: any[] = benchmark?.results ?? [];

	const orderHints = results
		.map((result) => result?.benchmark?.order ?? result?.benchmark_order)
		.filter((value: unknown): value is string => typeof value === "string");
	const isLowerBetter = getLowerIsBetter(
		orderHints[0],
		benchmark?.ascending_order ?? null
	);

	const hasPercentage = resolveBenchmarkIsPercentage({
		benchmarkType: benchmark?.type,
		fallback: results.some(
			(result) =>
				typeof result?.score === "string" && result.score.includes("%")
		),
	});

	const scores = results
		.map((result) =>
			normalizeBenchmarkScoreValue(
				parseBenchmarkScore(result?.score),
				hasPercentage
			)
		)
		.filter((score): score is number => score != null)
		.sort((a, b) => a - b);

	const uniqueModels = new Set(
		results.map(
			(result) =>
				result.model?.model_id ?? result.model_id ?? result.id ?? null
		)
	);

	const averageScore =
		scores.length > 0
			? scores.reduce((total, value) => total + value, 0) / scores.length
			: null;

	const medianScore =
		scores.length > 0
			? scores.length % 2 === 1
				? scores[Math.floor(scores.length / 2)]
				: (scores[scores.length / 2 - 1] + scores[scores.length / 2]) /
				  2
			: null;

	const minScore = scores.length > 0 ? scores[0] : null;
	const maxScore = scores.length > 0 ? scores[scores.length - 1] : null;

	const benchmarkedModels =
		results.length > 0
			? results.reduce<Record<string, any>>((acc, result) => {
					const modelId =
						result.model?.model_id ?? result.model_id ?? "";
					if (!modelId) return acc;
					const numericScore = normalizeBenchmarkScoreValue(
						parseBenchmarkScore(result.score),
						hasPercentage
					);
					if (numericScore == null) return acc;

					const existing = acc[modelId];
					const shouldReplace =
						!existing ||
						(isLowerBetter
							? numericScore < existing.numericScore
							: numericScore > existing.numericScore);

					if (shouldReplace) {
						acc[modelId] = {
							numericScore,
							modelName:
								result.model?.name ??
								result.model_id ??
								"Unknown model",
						};
					}
					return acc;
			  }, {})
			: {};

	const topModel = Object.values(benchmarkedModels).reduce<{
		numericScore: number;
		modelName: string;
	} | null>((best, current) => {
		if (!current) return best;
		if (!best) return current as any;
		return isLowerBetter
			? current.numericScore < best.numericScore
				? (current as any)
				: best
			: current.numericScore > best.numericScore
			? (current as any)
			: best;
	}, null);

	const selfReportedCount = results.filter(
		(result) => !!result?.is_self_reported
	).length;

	// Calculate additional stats from the original top card
	const uniqueModelIds = new Set<string>();
	let latestTimestamp: Date | null = null;
	let bestScore: { value: number; modelName: string } | null = null;

	for (const result of results) {
		const modelId =
			result.model?.model_id ?? result.model_id ?? result.id ?? "";
		if (modelId) uniqueModelIds.add(modelId);

		const timestamp = result.updated_at ?? result.created_at ?? null;
		if (timestamp) {
			const current = new Date(timestamp);
			if (!Number.isNaN(current.getTime())) {
				if (!latestTimestamp || current > latestTimestamp)
					latestTimestamp = current;
			}
		}

		const numericScore = normalizeBenchmarkScoreValue(
			parseBenchmarkScore(result.score as any),
			hasPercentage
		);
		if (numericScore != null) {
			const shouldReplace =
				!bestScore ||
				(isLowerBetter
					? numericScore < bestScore.value
					: numericScore > bestScore.value);
			if (shouldReplace) {
				bestScore = {
					value: numericScore,
					modelName:
						result.model?.name ??
						result.model_id ??
						"Unknown model",
				};
			}
		}
	}

	const metrics = [
		{
			label: "Recorded Results",
			value: results.length.toString(),
			helper: "Total benchmark submissions",
			icon: Database,
			color: "text-purple-600 dark:text-purple-400",
			bgColor: "bg-purple-50 dark:bg-purple-950/30",
		},
		{
			label: "Average Score",
			value: formatBenchmarkScore({
				value: averageScore,
				isPercentage: hasPercentage,
			}),
			helper:
				scores.length > 0
					? `${scores.length} recorded scores`
					: "No numeric scores yet",
			icon: BarChart3,
			color: "text-indigo-600 dark:text-indigo-400",
			bgColor: "bg-indigo-50 dark:bg-indigo-950/30",
		},
		{
			label: "Score Range",
			value:
				minScore != null && maxScore != null
					? `${formatBenchmarkScore({
							value: minScore,
							isPercentage: hasPercentage,
					  })} - ${formatBenchmarkScore({
							value: maxScore,
							isPercentage: hasPercentage,
					  })}`
					: "-",
			helper: "Lowest to highest score recorded",
			icon: Minimize2,
			color: "text-red-600 dark:text-red-400",
			bgColor: "bg-red-50 dark:bg-red-950/30",
		},
		{
			label: isLowerBetter
				? "Leading Model (lowest score)"
				: "Leading Model",
			value: topModel
				? `${formatBenchmarkScore({
						value: topModel.numericScore,
						isPercentage: hasPercentage,
				  })} - ${topModel.modelName}`
				: bestScore
				? `${formatBenchmarkScore({
						value: bestScore.value,
						isPercentage: hasPercentage,
				  })} - ${bestScore.modelName}`
				: "-",
			helper: "Best performing model",
			icon: Crown,
			color: "text-amber-600 dark:text-amber-400",
			bgColor: "bg-amber-50 dark:bg-amber-950/30",
		},
	];

	return (
		<section className="grid gap-4 grid-cols-2 md:grid-cols-4">
			{metrics.map((metric) => {
				const IconComponent = metric.icon;
				return (
					<Card
						key={metric.label}
						className="group p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 dark:from-gray-900 dark:to-gray-800/50"
					>
						<div>
							{/* Icon and label */}
							<div className="flex items-center gap-2 mb-3">
								<div
									className={`p-1.5 rounded-md ${metric.bgColor} ${metric.color} transition-colors duration-300`}
								>
									<IconComponent className="w-4 h-4" />
								</div>
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									{metric.label}
								</h3>
							</div>

							{/* Value */}
							<div className="mb-2">
								<span className="text-2xl font-bold text-foreground">
									{metric.value}
								</span>
							</div>
						</div>
					</Card>
				);
			})}
		</section>
	);
}
