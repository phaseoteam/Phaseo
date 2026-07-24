import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import BenchmarkMetrics from "./BenchmarkMetrics";
import BenchmarkProgressChart from "./BenchmarkProgressChart";
import ModelsUsingBenchmark from "./ModelsUsingBenchmark";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import {
	getLowerIsBetter,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

function getCategoryColor(category: string): string {
	// Simple hash function for consistent color assignment
	let hash = 0;
	for (let i = 0; i < category.length; i++) {
		const char = category.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}

	const colors = [
		// Blues
		"bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100",
		"bg-blue-200 text-blue-900 dark:bg-blue-800/60 dark:text-blue-200",
		"bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-100",
		"bg-sky-200 text-sky-900 dark:bg-sky-800/60 dark:text-sky-200",
		"bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-100",
		"bg-cyan-200 text-cyan-900 dark:bg-cyan-800/60 dark:text-cyan-200",

		// Greens
		"bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-100",
		"bg-green-200 text-green-900 dark:bg-green-800/60 dark:text-green-200",
		"bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100",
		"bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-200",
		"bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-100",
		"bg-teal-200 text-teal-900 dark:bg-teal-800/60 dark:text-teal-200",

		// Purples/Pinks
		"bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-100",
		"bg-purple-200 text-purple-900 dark:bg-purple-800/60 dark:text-purple-200",
		"bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-100",
		"bg-violet-200 text-violet-900 dark:bg-violet-800/60 dark:text-violet-200",
		"bg-pink-100 text-pink-800 dark:bg-pink-900/60 dark:text-pink-100",
		"bg-pink-200 text-pink-900 dark:bg-pink-800/60 dark:text-pink-200",
		"bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100",
		"bg-rose-200 text-rose-900 dark:bg-rose-800/60 dark:text-rose-200",

		// Oranges/Reds
		"bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-100",
		"bg-orange-200 text-orange-900 dark:bg-orange-800/60 dark:text-orange-200",
		"bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-100",
		"bg-red-200 text-red-900 dark:bg-red-800/60 dark:text-red-200",
		"bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
		"bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200",

		// Yellows/Limes
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-100",
		"bg-yellow-200 text-yellow-900 dark:bg-yellow-800/60 dark:text-yellow-200",
		"bg-lime-100 text-lime-800 dark:bg-lime-900/60 dark:text-lime-100",
		"bg-lime-200 text-lime-900 dark:bg-lime-800/60 dark:text-lime-200",

		// Indigos/Slates
		"bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-100",
		"bg-indigo-200 text-indigo-900 dark:bg-indigo-800/60 dark:text-indigo-200",
		"bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-100",
		"bg-slate-200 text-slate-900 dark:bg-slate-800/60 dark:text-slate-200",
		"bg-gray-100 text-gray-800 dark:bg-gray-900/60 dark:text-gray-100",
		"bg-gray-200 text-gray-900 dark:bg-gray-800/60 dark:text-gray-200",
		"bg-zinc-100 text-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100",
		"bg-zinc-200 text-zinc-900 dark:bg-zinc-800/60 dark:text-zinc-200",
		"bg-neutral-100 text-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-100",
		"bg-neutral-200 text-neutral-900 dark:bg-neutral-800/60 dark:text-neutral-200",
		"bg-stone-100 text-stone-800 dark:bg-stone-900/60 dark:text-stone-100",
		"bg-stone-200 text-stone-900 dark:bg-stone-800/60 dark:text-stone-200",

		// Additional variations for more uniqueness
		"bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-50",
		"bg-green-50 text-green-900 dark:bg-green-950/60 dark:text-green-50",
		"bg-purple-50 text-purple-900 dark:bg-purple-950/60 dark:text-purple-50",
		"bg-pink-50 text-pink-900 dark:bg-pink-950/60 dark:text-pink-50",
		"bg-orange-50 text-orange-900 dark:bg-orange-950/60 dark:text-orange-50",
		"bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-50",
		"bg-yellow-50 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-50",
		"bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-50",
		"bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:text-teal-50",
		"bg-cyan-50 text-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-50",
		"bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-50",
		"bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-50",
		"bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-50",
		"bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-50",
		"bg-lime-50 text-lime-900 dark:bg-lime-950/60 dark:text-lime-50",
		"bg-slate-50 text-slate-900 dark:bg-slate-950/60 dark:text-slate-50",
		"bg-gray-50 text-gray-900 dark:bg-gray-950/60 dark:text-gray-50",
		"bg-zinc-50 text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-50",
		"bg-neutral-50 text-neutral-900 dark:bg-neutral-950/60 dark:text-neutral-50",
		"bg-stone-50 text-stone-900 dark:bg-stone-950/60 dark:text-stone-50",

		// Even more variations with different shades
		"bg-blue-300 text-blue-900 dark:bg-blue-700/60 dark:text-blue-300",
		"bg-green-300 text-green-900 dark:bg-green-700/60 dark:text-green-300",
		"bg-purple-300 text-purple-900 dark:bg-purple-700/60 dark:text-purple-300",
		"bg-pink-300 text-pink-900 dark:bg-pink-700/60 dark:text-pink-300",
		"bg-orange-300 text-orange-900 dark:bg-orange-700/60 dark:text-orange-300",
		"bg-red-300 text-red-900 dark:bg-red-700/60 dark:text-red-300",
		"bg-yellow-300 text-yellow-900 dark:bg-yellow-700/60 dark:text-yellow-300",
		"bg-indigo-300 text-indigo-900 dark:bg-indigo-700/60 dark:text-indigo-300",
		"bg-teal-300 text-teal-900 dark:bg-teal-700/60 dark:text-teal-300",
		"bg-cyan-300 text-cyan-900 dark:bg-cyan-700/60 dark:text-cyan-300",
	];

	return colors[Math.abs(hash) % colors.length];
}

export default function BenchmarkOverview({
	benchmark,
}: {
	benchmark: BenchmarkPage;
}) {
	const results = benchmark.results ?? [];

	const orderHints = results
		.map(
			(result: any) => result?.benchmark?.order ?? result?.benchmark_order
		)
		.filter((value: unknown): value is string => typeof value === "string");
	const isLowerBetter = getLowerIsBetter(
		orderHints[0],
		benchmark?.ascending_order ?? null
	);
	const isPercentage = resolveBenchmarkIsPercentage({
		benchmarkType: benchmark.type,
		fallback: results.some(
			(result) =>
				typeof result?.score === "string" &&
				String(result.score).trim().endsWith("%")
		),
	});

	const uniqueModelIds = new Set<string>();
	let latestTimestamp: Date | null = null;
	let earliestTimestamp: Date | null = null;
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
				if (!earliestTimestamp || current < earliestTimestamp)
					earliestTimestamp = current;
			}
		}

		const numericScore = normalizeBenchmarkScoreValue(
			parseBenchmarkScore(result.score as any),
			isPercentage
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

	const renderCategories = () => {
		const rawCategories =
			(benchmark as any).categories ?? (benchmark as any).category;
		if (!rawCategories) return null;
		const normalized = Array.isArray(rawCategories)
			? rawCategories
			: String(rawCategories)
					.split(/[,\s]+/)
					.filter(Boolean);
		const toTitle = (s: string) =>
			s
				.replace(/[-_]+/g, " ")
				.split(" ")
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" ");
		const mapped = normalized
			.map((c: unknown) => String(c).trim())
			.filter(Boolean);
		if (mapped.length === 0) return null;
		const visible = mapped.slice(0, 3); // Show up to 3 categories
		const remaining = Math.max(0, mapped.length - visible.length);
		return (
			<>
				{visible.map((category) => (
					<span
						key={category}
						className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${getCategoryColor(
							category
						)}`}
					>
						{toTitle(category)}
					</span>
				))}
				{remaining > 0 ? (
					<span className="inline-flex items-center rounded-md bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100">
						+{remaining}
					</span>
				) : null}
			</>
		);
	};

	return (
		<div className="space-y-6 pb-12">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				{/* Left: badges */}
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						{benchmark.type ? (
							<Badge variant="outline">
								Type: {benchmark.type}
							</Badge>
						) : null}
						{renderCategories()}
					</div>
				</div>

				{/* Right: view link */}
				<div className="flex md:items-start md:justify-end">
					{benchmark.link ? (
						<Button
							asChild
							variant="outline"
							size="sm"
							className="w-fit"
						>
							<Link
								href={benchmark.link}
								target="_blank"
								rel="noopener noreferrer"
							>
								View benchmark source
								<ExternalLink className="ml-2 h-4 w-4" />
							</Link>
						</Button>
					) : null}
				</div>
			</div>

			<BenchmarkMetrics benchmark={benchmark} />
			<BenchmarkProgressChart benchmark={benchmark} />
			<ModelsUsingBenchmark benchmark={benchmark} />
		</div>
	);
}
