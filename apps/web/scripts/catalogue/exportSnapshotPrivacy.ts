type SnapshotRow = Record<string, unknown>;

export function excludeStealthRows<T extends string>(snapshots: Map<T, SnapshotRow[]>): Map<T, SnapshotRow[]> {
	const stealthModelSlugs = new Set<string>();
	const stealthRouteIds = new Set<string>();
	const stealthSkuIds = new Set<string>();
	for (const rows of snapshots.values()) {
		for (const row of rows) {
			if (row.is_stealth !== true) continue;
			if (typeof row.model_slug === "string") stealthModelSlugs.add(row.model_slug);
			if (typeof row.provider_model_id === "string") stealthRouteIds.add(row.provider_model_id);
		}
	}
	for (const [table, rows] of snapshots) {
		if (table !== "v2_pricing_skus") continue;
		for (const row of rows) {
			if (stealthRouteIds.has(String(row.provider_model_id))) stealthSkuIds.add(String(row.sku_id));
		}
	}
	return new Map([...snapshots].map(([table, rows]) => [table, rows
		.filter((row) => row.is_stealth !== true)
		.filter((row) => !stealthModelSlugs.has(String(row.model_slug ?? "")))
		.filter((row) => !stealthRouteIds.has(String(row.provider_model_id ?? "")))
		.filter((row) => !stealthSkuIds.has(String(row.sku_id ?? "")))
		.filter((row) => table !== "v2_catalogue_source_overrides" || (row.disposition !== "stealth" && !stealthModelSlugs.has(String(row.source_key ?? "")) && !stealthRouteIds.has(String(row.source_key ?? ""))))]));
}
