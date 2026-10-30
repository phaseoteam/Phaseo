function normalizeBenchmarkName(name: string): string {
	return name.trim().replace(/\s+/g, " ") || "AI";
}

export function buildBenchmarkMetadataTitle(name: string): string {
	const benchmarkName = normalizeBenchmarkName(name);
	return /\bbenchmark\b/i.test(benchmarkName)
		? `${benchmarkName} Leaderboard`
		: `${benchmarkName} Benchmark Leaderboard`;
}

export function buildBenchmarkMetadataDescription(
	name: string,
	modelCount: number,
): string {
	const benchmarkName = normalizeBenchmarkName(name);
	const leaderboardName = /\bbenchmark\b/i.test(benchmarkName)
		? benchmarkName
		: `${benchmarkName} benchmark`;
	const countText = modelCount > 0
		? `${modelCount.toLocaleString("en-US")} model scores`
		: "AI model scores";

	return `Compare ${countText} on the ${leaderboardName} leaderboard. Review rankings, historical results, evaluation methodology, and available sources on Phaseo.`;
}
