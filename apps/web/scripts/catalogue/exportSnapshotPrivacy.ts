import { PUBLIC_CATALOG_TABLES } from "./exportSnapshotTables";

type SnapshotRow = Record<string, unknown>;

const PRIVATE_TABLES = new Set(["v2_catalogue_source_overrides"]);

const PRIVATE_KEYS = new Set([
	"account_id",
	"actor_user_id",
	"catalog_preview",
	"catalog_url",
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
	"managed_catalog",
	"managed_updated_by",
	"source_run_id",
	"probe_result",
	"credentials",
	"api_key",
	"access_token",
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
	return hasSelfServeSubmission(row) && (row.routable !== true || row.routing_enabled !== true);
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

export function filterPublicSnapshotRows<T extends string>(snapshots: Map<T, SnapshotRow[]>, now = Date.now()): Map<T, SnapshotRow[]> {
	if (!Number.isFinite(now)) throw new Error("Invalid snapshot cutoff");
	const futureOrInvalid = (value: unknown) => value != null && (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now);
	const isUnreleased = (row: SnapshotRow) => row.hidden === true || row.access_scope === "internal"
		|| [row.status, row.availability, row.provider_availability_status, row.phaseo_status].some((value) => ["not_ready", "coming_soon", "testing", "draft", "pending"].includes(String(value)))
		|| futureOrInvalid(row.available_from) || futureOrInvalid(row.effective_from) || futureOrInvalid(row.released_at);
	const stealthModelSlugs = new Set<string>();
	const stealthRouteIds = new Set<string>();
	const unpublishedVariantIds = new Set<string>();
	const internalBenchmarkIds = new Set<string>();
	const unpublishedProviderSlugs = new Set<string>();
	const unpublishedRouteIds = new Set<string>();
	const unpublishedSkuIds = new Set<string>();
	for (const rows of snapshots.values()) {
		for (const row of rows) {
			if (isInternalBenchmark(row) && typeof row.benchmark_id === "string") internalBenchmarkIds.add(row.benchmark_id);
			if (row.is_stealth === true) {
				if (typeof row.model_slug === "string") stealthModelSlugs.add(row.model_slug);
				if (typeof row.provider_model_id === "string") stealthRouteIds.add(row.provider_model_id);
			}
			if (isUnpublishedSelfServeProvider(row) && typeof row.provider_slug === "string") unpublishedProviderSlugs.add(row.provider_slug);
		}
	}
	for (const row of snapshots.get("v2_models" as T) ?? []) {
		if (isUnreleased(row)) stealthModelSlugs.add(String(row.model_slug));
	}
	for (const row of snapshots.get("v2_model_provider_routes" as T) ?? []) {
		if (isUnreleased(row) || stealthModelSlugs.has(String(row.model_slug)) || unpublishedProviderSlugs.has(String(row.provider_slug))) unpublishedRouteIds.add(String(row.provider_model_id));
	}
	// Deny children by opaque foreign keys as well as model/provider slugs.
	for (const row of snapshots.get("v2_route_variants" as T) ?? []) {
		if (isUnreleased(row) || stealthRouteIds.has(String(row.provider_model_id)) || unpublishedRouteIds.has(String(row.provider_model_id))) unpublishedVariantIds.add(String(row.variant_id));
	}
	for (const [table, rows] of snapshots) {
		if (table !== "v2_pricing_skus") continue;
		for (const row of rows) {
			if (isUnreleased(row) || stealthRouteIds.has(String(row.provider_model_id)) || unpublishedRouteIds.has(String(row.provider_model_id)) || unpublishedVariantIds.has(String(row.route_variant_id))) unpublishedSkuIds.add(String(row.sku_id));
		}
	}
	const filtered = new Map([...snapshots]
		.filter(([table]) => !PRIVATE_TABLES.has(table) && Object.hasOwn(PUBLIC_CATALOG_TABLES, table))
		.map(([table, rows]) => [table, rows
		.filter((row) => row.is_stealth !== true)
		.filter((row) => !isUnreleased(row))
		.filter((row) => !stealthModelSlugs.has(String(row.model_slug ?? "")))
		.filter((row) => !stealthRouteIds.has(String(row.provider_model_id ?? "")))
		.filter((row) => !unpublishedProviderSlugs.has(String(row.provider_slug ?? "")))
		.filter((row) => !unpublishedRouteIds.has(String(row.provider_model_id ?? "")))
		.filter((row) => !unpublishedVariantIds.has(String(row.variant_id ?? "")))
		.filter((row) => !unpublishedVariantIds.has(String(row.route_variant_id ?? "")))
		.filter((row) => !unpublishedSkuIds.has(String(row.sku_id ?? "")))
		.filter((row) => table !== "v2_benchmarks" || !isInternalBenchmark(row))
		.filter((row) => table !== "v2_benchmark_results" || (!isInternalBenchmarkResult(row) && !internalBenchmarkIds.has(String(row.benchmark_id ?? ""))))
		.map((row) => {
			const publicRow = sanitizePublicValue(row) as SnapshotRow;
			// Public versions can reference a hidden predecessor/base. Omit the
			// relationship, not the otherwise-public model or the privacy check.
			for (const key of ["previous_model_slug", "replacement_model_slug", "base_model_slug"]) {
				if (stealthModelSlugs.has(String(publicRow[key] ?? ""))) publicRow[key] = null;
			}
			return publicRow;
		})]));
	// Snapshot reads are not a single transaction. Fail closed on missing parents
	// (including rows inserted/deleted between table reads), and cascade removals.
	const parents = [
		["v2_models", "model_slug", "model_slug"],
		["v2_providers", "provider_slug", "provider_slug"],
		["v2_model_provider_routes", "provider_model_id", "provider_model_id"],
		["v2_route_variants", "variant_id", "route_variant_id"],
		["v2_pricing_skus", "sku_id", "sku_id"],
	] as const;
	let changed: boolean;
	do {
		changed = false;
		for (const [parent, key, foreignKey] of parents) {
			if (!filtered.has(parent as T)) continue;
			const ids = new Set((filtered.get(parent as T) ?? []).map((row) => String(row[key])));
			for (const [table, rows] of filtered) {
				if (table === parent) continue;
				const visible = rows.filter((row) => row[foreignKey] == null || ids.has(String(row[foreignKey])));
				if (visible.length !== rows.length) { filtered.set(table, visible); changed = true; }
			}
		}
	} while (changed);
	const privateParentIds: string[] = [];
	for (const [parent, key, children] of [
		["v2_model_families", "family_slug", ["v2_models"]],
		["v2_labs", "lab_slug", ["v2_models", "v2_providers"]],
	] as const) {
		const allReferences = new Set(children.flatMap((table) => (snapshots.get(table as T) ?? []).map((row) => String(row[key] ?? ""))));
		const publicReferences = new Set(children.flatMap((table) => (filtered.get(table as T) ?? []).map((row) => String(row[key] ?? ""))));
		const visible = (filtered.get(parent as T) ?? []).filter((row) => {
			const id = String(row[key] ?? "");
			if (allReferences.has(id) && !publicReferences.has(id)) { privateParentIds.push(id); return false; }
			return true;
		});
		if (filtered.has(parent as T)) filtered.set(parent as T, visible);
	}
	if (filtered.has("v2_labs" as T)) {
		const labs = new Set((filtered.get("v2_labs" as T) ?? []).map((row) => row.lab_slug));
		const links = filtered.get("v2_lab_links" as T);
		if (links) filtered.set("v2_lab_links" as T, links.filter((row) => labs.has(row.lab_slug)));
	}
	// Public metadata and descriptive strings can also reference private IDs.
	// Abort the entire export instead of publishing a partly-redacted artifact.
	const privateIds = [...stealthModelSlugs, ...unpublishedProviderSlugs, ...stealthRouteIds, ...unpublishedRouteIds, ...unpublishedSkuIds, ...unpublishedVariantIds, ...privateParentIds]
		.filter((id) => id.length > 0 && id !== "undefined");
	const publicIds = new Set([...filtered].flatMap(([table, rows]) => rows.flatMap((row) =>
		(PUBLIC_CATALOG_TABLES[table as keyof typeof PUBLIC_CATALOG_TABLES] as readonly string[]).filter((key) => /_(?:id|slug|key)$/.test(key)).map((key) => String(row[key] ?? "")),
	)));
	for (const row of filtered.get("v2_model_provider_routes" as T) ?? []) {
		if (typeof row.provider_model_slug === "string") publicIds.add(row.provider_model_slug);
	}
	const containsPrivateReference = (value: unknown, field: string): boolean => {
		if (Array.isArray(value)) return value.some((entry) => containsPrivateReference(entry, field));
		if (value && typeof value === "object") return Object.entries(value).some(([key, entry]) => privateIds.includes(key) || containsPrivateReference(entry, key));
		if (typeof value !== "string") return false;
		if (publicIds.has(value)) return false;
		if (privateIds.includes(value)) return true;
		// These fields are complete legacy identifiers, not prose. A public dated
		// variant may legitimately start with the slug of an unreleased base model.
		if (field === "legacy_model_id" || field === "legacy_api_model_id") return privateIds.includes(value);
		const matches = privateIds.filter((id) => value.includes(id));
		if (!matches.length) return false;
		// A public dated identifier can contain a private base identifier as a
		// prefix, including in prose/URLs. Only exempt occurrences fully covered
		// by a complete identifier present in the already-filtered public rows.
		const publicSpans: Array<[number, number]> = [];
		for (const id of publicIds) {
			if (!id) continue;
			for (let start = value.indexOf(id); start >= 0; start = value.indexOf(id, start + 1)) publicSpans.push([start, start + id.length]);
		}
		return matches.some((id) => {
			for (let start = value.indexOf(id); start >= 0; start = value.indexOf(id, start + 1)) {
				if (!publicSpans.some(([left, right]) => left <= start && right >= start + id.length)) return true;
			}
			return false;
		});
	};
	const redactMetadata = (value: unknown, key = "metadata"): unknown => {
		if (Array.isArray(value)) return value.map((entry) => redactMetadata(entry, key)).filter((entry) => entry !== undefined);
		if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
			.filter(([field]) => !privateIds.some((id) => field.includes(id)))
			.map(([field, entry]) => [field, redactMetadata(entry, field)])
			.filter(([, entry]) => entry !== undefined));
		return containsPrivateReference(value, key) ? undefined : value;
	};
	for (const [table, rows] of filtered) {
		for (const row of rows) if (row.metadata) row.metadata = redactMetadata(row.metadata);
		for (const row of rows) for (const [field, value] of Object.entries(row)) {
			if (containsPrivateReference(value, field)) {
				throw new Error(`Snapshot contains a private catalog reference in ${table}.${field}; export aborted before writing.`);
			}
		}
	}
	return filtered;
}

export const excludeStealthRows = filterPublicSnapshotRows;
