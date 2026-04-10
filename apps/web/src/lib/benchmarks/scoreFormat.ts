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
	isPercentage: boolean,
	rawScore?: unknown
): number | null {
	if (value == null || !Number.isFinite(value)) return null;
	if (!isPercentage) return value;
	// Keep percentage values in their provided unit. Inferring 0-1 fractions
	// from numeric magnitude can corrupt legitimate low percentages.
	if (typeof rawScore === "string" && rawScore.includes("%")) return value;
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
