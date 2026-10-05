import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { duplicateMigrationPairs, recordedMigrationSql, prepareReplayMigration } from "./declarative-replay-history.mjs";
import { productionDuplicatesToOmit } from "./prepare-production-migrations.mjs";

const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const rows = duplicateMigrationPairs.map(([, recorded]) => ({
	version: recorded.split("_")[0], statements: [recordedMigrationSql(readMigration(recorded))],
}));

test("all three restored migrations match their repository originals and replay once", () => {
	for (const [duplicate, recorded] of duplicateMigrationPairs) {
		assert.equal(readMigration(duplicate).replaceAll("\r\n", "\n").trim(), recordedMigrationSql(readMigration(recorded)));
		assert.match(prepareReplayMigration(duplicate, readMigration(duplicate), readMigration), /^-- Disposable replay only:/);
		assert.equal(prepareReplayMigration(recorded, readMigration(recorded), readMigration), readMigration(recorded));
	}
	assert.deepEqual(productionDuplicatesToOmit(rows, readMigration), duplicateMigrationPairs.map(([name]) => name));
});

test("unapplied replacements and versions already recorded under both timestamps stay intact", () => {
	assert.deepEqual(productionDuplicatesToOmit([], readMigration), []);
	assert.deepEqual(productionDuplicatesToOmit([...rows, ...duplicateMigrationPairs.map(([name]) => ({version: name.split("_")[0]}))], readMigration), []);
});

test("remote or local SQL drift and missing statement evidence stop deployment", () => {
	assert.throws(() => productionDuplicatesToOmit([{...rows[0], statements: ["select 1;"]}], readMigration), /SQL differs/);
	assert.throws(() => productionDuplicatesToOmit([{...rows[0], statements: null}], readMigration), /SQL differs/);
	assert.throws(() => productionDuplicatesToOmit(rows, (name) => readMigration(name) + (name === duplicateMigrationPairs[2][0] ? "\nselect 1;" : "")), /SQL differs/);
});

test("production comparisons normalize only line endings and surrounding whitespace", () => {
	assert.deepEqual(productionDuplicatesToOmit(rows.map((row) => ({...row, statements: row.statements.map((sql) => sql.replaceAll("\n", "\r\n"))})), readMigration), duplicateMigrationPairs.map(([name]) => name));
});
