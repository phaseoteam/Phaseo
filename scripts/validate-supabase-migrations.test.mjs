import assert from "node:assert/strict";
import test from "node:test";
import { orderBaseMigrationFiles, validateMigrationOrder } from "./validate-supabase-migrations.mjs";

test("checks order against the target branch tip as well as a stale pull request base", () => {
	const trees = {
		base: ["20261013120000_merged_before_branch_update.sql"],
		"origin/main": ["20261013120000_merged_before_branch_update.sql", "20261013221923_merged_since.sql"],
	};
	const list = (ref) => trees[ref] ?? [];
	const added = ["supabase/migrations/20261013120100_stale_branch.sql"];
	assert.deepEqual(validateMigrationOrder(orderBaseMigrationFiles("base", "", list), added, () => "select 1;"), []);
	assert.match(
		validateMigrationOrder(orderBaseMigrationFiles("base", "origin/main", list), added, () => "select 1;").join("\n"),
		/must be newer than the base branch's latest version 20261013221923/,
	);
});

test("accepts migrations newer than the latest migration on the base branch", () => {
	assert.deepEqual(
		validateMigrationOrder(
			[
				"20260830120000_existing.sql",
				"20260901105106_latest.sql",
			],
			["supabase/migrations/20260901120000_new_change.sql"],
		),
		[],
	);
});

test("rejects an out-of-order migration after another PR has merged", () => {
	assert.match(
		validateMigrationOrder(
			["20260901105106_already_merged.sql"],
			["supabase/migrations/20260901100000_stale_branch.sql"],
			() => "select 1;",
		).join("\n"),
		/must be newer than the base branch's latest version 20260901105106/,
	);
});

test("accepts a documented production history backfill", () => {
	assert.deepEqual(
		validateMigrationOrder(
			["20260901105106_already_merged.sql"],
			["supabase/migrations/20260901100000_production_backfill.sql"],
			() =>
				"-- phaseo:allow-production-history-backfill reason: Restore a migration already recorded in the production ledger.\nselect 1;",
		),
		[],
	);
});

test("rejects an undocumented production history backfill exemption", () => {
	assert.match(
		validateMigrationOrder(
			["20260901105106_already_merged.sql"],
			["supabase/migrations/20260901100000_production_backfill.sql"],
			() => "-- phaseo:allow-production-history-backfill reason: prod\nselect 1;",
		).join("\n"),
		/already-applied production history backfill/,
	);
});

test("accepts the first migration in a repository", () => {
	assert.deepEqual(
		validateMigrationOrder(
			[],
			["supabase/migrations/20260901120000_initial.sql"],
		),
		[],
	);
});
