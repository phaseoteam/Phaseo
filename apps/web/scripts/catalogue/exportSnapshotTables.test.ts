import { PUBLIC_CATALOG_DOMAINS, PUBLIC_CATALOG_TABLE_COLUMNS, PUBLIC_CATALOG_TABLE_NAMES, PUBLIC_CATALOG_TABLES } from "./exportSnapshotTables";

test("snapshot allowlist mirrors the canonical catalog domains", () => {
	expect(Object.keys(PUBLIC_CATALOG_DOMAINS).sort()).toEqual([
		"aliases",
		"api_providers",
		"benchmarks",
		"families",
		"models",
		"organisations",
		"pricing",
		"subscription_plans",
	]);

	const domainTables = Object.values(PUBLIC_CATALOG_DOMAINS).flat();
	expect(new Set(domainTables).size).toBe(domainTables.length);
	expect([...PUBLIC_CATALOG_TABLE_NAMES].sort()).toEqual([...domainTables].sort());
});

test("defines explicit public projections without database-managed fields", () => {
	expect(Object.keys(PUBLIC_CATALOG_TABLE_COLUMNS).sort()).toEqual([...PUBLIC_CATALOG_TABLE_NAMES].sort());
	for (const columns of Object.values(PUBLIC_CATALOG_TABLE_COLUMNS)) {
		expect(columns.length).toBeGreaterThan(0);
		expect(columns).not.toEqual(expect.arrayContaining([
			"created_at", "updated_at", "authored_by", "account_id", "user_id", "workspace_id", "is_stealth",
		]));
	}
	for (const columns of Object.values(PUBLIC_CATALOG_TABLES)) {
		expect(columns.length).toBeGreaterThan(0);
	}
});
