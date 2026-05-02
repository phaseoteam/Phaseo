export type BenchmarkScoreType = "percentage" | "numerical";

function normalizeText(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeBenchmarkScoreType(
	value: unknown
): BenchmarkScoreType | null {
	const normalized = normalizeText(value);
	if (!normalized) return null;

	if (
		normalized === "percentage" ||
		normalized === "percent" ||
		normalized === "pct" ||
		normalized === "%"
	) {
		return "percentage";
	}

	if (
		normalized === "numerical" ||
		normalized === "numeric" ||
		normalized === "number"
	) {
		return "numerical";
	}

	return null;
}

export function parseBenchmarkScore(
	value: string | number | null | undefined
): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === "string") {
		const match = value.match(/[-+]?[0-9]*\.?[0-9]+/);
		if (!match) return null;
		const parsed = Number.parseFloat(match[0]);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

export function normalizeBenchmarkScoreValue(
	value: number | null | undefined,
	isPercentage: boolean
): number | null {
	if (value == null || !Number.isFinite(value)) return null;
	if (!isPercentage) return value;

	// Some benchmark sources report percentages as fractions (0-1) while
	// others report 0-100. Normalize to 0-100 for consistent display/ranking.
	const abs = Math.abs(value);
	if (abs > 0 && abs <= 1) {
		return value * 100;
	}
	return value;
}

export function resolveBenchmarkIsPercentage(args: {
	benchmarkType?: unknown;
	rawScore?: unknown;
	fallback?: boolean;
}): boolean {
	const normalizedType = normalizeBenchmarkScoreType(args.benchmarkType);
	if (normalizedType) return normalizedType === "percentage";

	if (typeof args.rawScore === "string") {
		return args.rawScore.includes("%");
	}

	return args.fallback ?? false;
}

export function formatBenchmarkScore(args: {
	value: number | null;
	isPercentage: boolean;
	fallback?: string | number | null;
}): string {
	const { value, isPercentage, fallback = null } = args;
	const normalizedValue = normalizeBenchmarkScoreValue(value, isPercentage);

	if (normalizedValue == null || !Number.isFinite(normalizedValue)) {
		if (fallback == null) return "-";
		return typeof fallback === "number" ? fallback.toString() : String(fallback);
	}

	const formatted =
		normalizedValue % 1 === 0 || Math.abs(normalizedValue) >= 100
			? normalizedValue.toFixed(0)
			: normalizedValue.toFixed(2);
	return isPercentage ? `${formatted}%` : formatted;
}

export function benchmarkOrderFromAscending(
	ascendingOrder: boolean | null | undefined
): "higher" | "lower" | null {
	if (ascendingOrder === true) return "higher";
	if (ascendingOrder === false) return "lower";
	return null;
}

export function getLowerIsBetter(
	orderValue: unknown,
	ascendingOrder?: boolean | null
): boolean {
	if (typeof ascendingOrder === "boolean") {
		// In this codebase, ascending_order=true means "higher is better",
		// and ascending_order=false means "lower is better".
		return ascendingOrder === false;
	}

	const order = normalizeText(orderValue);
	if (!order) return false;
	if (order === "lower" || order === "ascending") return true;
	if (order === "higher" || order === "descending") return false;
	return order.includes("lower") || order.includes("ascending");
}

export function compareBenchmarkScores(
	a: number,
	b: number,
	ascendingOrder: boolean | null | undefined
): number {
	if (a === b) return 0;

	// In this codebase, ascending_order=true means "higher is better",
	// and ascending_order=false means "lower is better".
	if (ascendingOrder === true) {
		return b - a;
	}
	if (ascendingOrder === false) {
		return a - b;
	}

	// Fall back to higher-is-better when ordering metadata is missing.
	return b - a;
}

export function compareBenchmarkScoresForBenchmark(
	a: number,
	b: number,
	benchmarkId: string,
	orderingByBenchmark: Map<string, boolean | null | undefined>
): number {
	return compareBenchmarkScores(a, b, orderingByBenchmark.get(benchmarkId));
}
