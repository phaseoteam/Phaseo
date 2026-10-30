/** Preserve existing tier URLs while matching the normalized catalogue facets. */
export function parseCatalogueTierFilters(value: string): string[] {
	return [...new Set(value.split(",").map((raw) => {
		const tier = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
		if (!tier) return "";
		if (["fast", "priority", "highspeed"].includes(tier)) return "fast";
		// Private selects workspace models added by the authenticated catalogue.
		if (["standard", "flex", "batch", "ultrafast", "free", "private"].includes(tier)) return tier;
		return "standard";
	}).filter(Boolean))];
}
