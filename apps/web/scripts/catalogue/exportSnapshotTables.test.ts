import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_CATALOG_DOMAINS, PUBLIC_CATALOG_TABLE_NAMES } from "./exportSnapshotTables";

test("snapshot allowlist mirrors the canonical catalog domains", () => {
	assert.deepEqual(Object.keys(PUBLIC_CATALOG_DOMAINS).sort(), [
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
	assert.equal(new Set(domainTables).size, domainTables.length);
	assert.deepEqual([...PUBLIC_CATALOG_TABLE_NAMES].sort(), [...domainTables].sort());
});
