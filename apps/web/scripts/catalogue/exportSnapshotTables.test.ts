import { PUBLIC_CATALOG_DOMAINS, PUBLIC_CATALOG_TABLE_NAMES } from "./exportSnapshotTables";

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
