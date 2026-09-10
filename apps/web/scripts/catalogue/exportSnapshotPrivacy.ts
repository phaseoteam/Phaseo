type SnapshotRow = Record<string, unknown>;

const PRIVATE_TABLES = new Set(["v2_catalogue_source_overrides"]);

const PRIVATE_KEYS = new Set([
	"account_id",
	"actor_user_id",
	"catalog_preview",
	"created_by",
	"deleted_by",
	"email",
	"last_submitted_by",
	"linked_by",
	"owner_user_id",
	"phone",
	"requested_by",
	"self_serve",
	"submitted_by",
	"updated_by",
	"user_id",
	"validation_summary",
	"webhook_secret_ciphertext",
	"webhook_secret_hash",
	"webhook_secret_iv",
	"workspace_id",
]);

function isPrivateKey(key: string): boolean {
	return PRIVATE_KEYS.has(key) || /(?:^|_)(?:actor|owner|created|updated|deleted|submitted|requested|linked)_?by$/i.test(key) || /(?:^|_)user_id$/i.test(key);
}

function sanitizePublicValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sanitizePublicValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([key]) => !isPrivateKey(key))
			.map(([key, entry]) => [key, sanitizePublicValue(entry)]),
	);
}

function hasSelfServeSubmission(row: SnapshotRow): boolean {
	const metadata = row.metadata;
	return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && "self_serve" in metadata);
}

function isUnpublishedSelfServeProvider(row: SnapshotRow): boolean {
	return hasSelfServeSubmission(row) && row.routable !== true && row.routing_enabled !== true;
}

function isInternalBenchmarkResult(row: SnapshotRow): boolean {
	return [row.benchmark_id, row.result_key, row.other_info]
		.filter((value): value is string => typeof value === "string")
		.some((value) => /\binternal\b/i.test(value));
}

function isInternalBenchmark(row: SnapshotRow): boolean {
	return [row.benchmark_id, row.name]
		.filter((value): value is string => typeof value === "string")
		.some((value) => /\binternal\b/i.test(value));
}

export function filterPublicSnapshotRows<T extends string>(snapshots: Map<T, SnapshotRow[]>): Map<T, SnapshotRow[]> {
	const stealthModelSlugs = new Set<string>();
	const stealthRouteIds = new Set<string>();
	const stealthSkuIds = new Set<string>();
	const unpublishedProviderSlugs = new Set<string>();
	const unpublishedRouteIds = new Set<string>();
	const unpublishedSkuIds = new Set<string>();
	for (const rows of snapshots.values()) {
		for (const row of rows) {
			if (row.is_stealth === true) {
				if (typeof row.model_slug === "string") stealthModelSlugs.add(row.model_slug);
				if (typeof row.provider_model_id === "string") stealthRouteIds.add(row.provider_model_id);
			}
			if (isUnpublishedSelfServeProvider(row) && typeof row.provider_slug === "string") unpublishedProviderSlugs.add(row.provider_slug);
		}
	}
	for (const row of snapshots.get("v2_model_provider_routes" as T) ?? []) {
		if (typeof row.provider_slug === "string" && unpublishedProviderSlugs.has(row.provider_slug) && typeof row.provider_model_id === "string") unpublishedRouteIds.add(row.provider_model_id);
	}
	for (const [table, rows] of snapshots) {
		if (table !== "v2_pricing_skus") continue;
		for (const row of rows) {
			if ((stealthRouteIds.has(String(row.provider_model_id)) || unpublishedRouteIds.has(String(row.provider_model_id))) && typeof row.sku_id === "string") unpublishedSkuIds.add(String(row.sku_id));
		}
	}
	return new Map([...snapshots]
		.filter(([table]) => !PRIVATE_TABLES.has(table))
		.map(([table, rows]) => [table, rows
		.filter((row) => row.is_stealth !== true)
		.filter((row) => !stealthModelSlugs.has(String(row.model_slug ?? "")))
		.filter((row) => !stealthRouteIds.has(String(row.provider_model_id ?? "")))
		.filter((row) => !unpublishedProviderSlugs.has(String(row.provider_slug ?? "")))
		.filter((row) => !unpublishedRouteIds.has(String(row.provider_model_id ?? "")))
		.filter((row) => !stealthSkuIds.has(String(row.sku_id ?? "")))
		.filter((row) => !unpublishedSkuIds.has(String(row.sku_id ?? "")))
		.filter((row) => table !== "v2_benchmarks" || !isInternalBenchmark(row))
		.filter((row) => table !== "v2_benchmark_results" || !isInternalBenchmarkResult(row))
		.map((row) => sanitizePublicValue(row) as SnapshotRow)]));
}

export const excludeStealthRows = filterPublicSnapshotRows;
