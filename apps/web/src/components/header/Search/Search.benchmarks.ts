export function isEpochSearchResult(href: string) {
	return /\/benchmarks\/epoch-capabilities-index(?:[/?#]|$)/.test(href);
}

export function benchmarkSearchAliases(href: string) {
	return isEpochSearchResult(href) ? ["ECI", "Epoch AI", "Epoch Capabilities Index"] : [];
}

export function isExactBenchmarkAlias(href: string, term: string) {
	return benchmarkSearchAliases(href).some((alias) => alias.toLowerCase() === term.trim().toLowerCase());
}
