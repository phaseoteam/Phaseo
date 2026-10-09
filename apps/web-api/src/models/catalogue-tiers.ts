export type CatalogueTier = "standard" | "flex" | "fast" | "batch" | "ultrafast" | "free";

/** Catalogue service modes, independent of provider account/access tiers. */
export function normalizeCatalogueTier(value: unknown): CatalogueTier {
	const tier = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
	if (tier === "flex") return "flex";
	if (tier === "batch") return "batch";
	if (tier === "ultrafast") return "ultrafast";
	if (tier === "free") return "free";
	if (["fast", "priority", "highspeed"].includes(tier)) return "fast";
	return "standard";
}

export function normalizeCatalogueTiers(values: unknown): CatalogueTier[] {
	return Array.isArray(values)
		? [...new Set(values.map(normalizeCatalogueTier))]
		: [];
}
