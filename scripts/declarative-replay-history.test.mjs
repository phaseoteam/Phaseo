import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareReplayMigration } from "./declarative-replay-history.mjs";

const duplicate = "20261004220029_canonical_routing_capabilities.sql";
const recorded = "20261004221046_canonical_routing_capabilities.sql";
const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("only the known identical routing migration becomes a disposable replay no-op", () => {
	const original = readMigration(duplicate);
	const restored = readMigration(recorded);
	assert.equal(prepareReplayMigration(duplicate, original, readMigration),
		`-- Disposable replay only: identical SQL is applied by ${recorded}.\n`);
	assert.equal(prepareReplayMigration(recorded, restored, readMigration), restored);
	assert.equal(prepareReplayMigration("another.sql", original, () => { throw new Error("unexpected read"); }), original);
	assert.equal(readMigration(duplicate), original);
	assert.equal(readMigration(recorded), restored);
});

test("line-ending differences do not change equivalent SQL", () => {
	assert.match(prepareReplayMigration(duplicate, readMigration(duplicate).replaceAll("\r\n", "\n"),
		(name) => readMigration(name).replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")), /^-- Disposable replay only:/);
});

test("changed SQL or missing recorded history fails closed", () => {
	assert.throws(() => prepareReplayMigration(duplicate, readMigration(duplicate) + "\nselect 1;", readMigration), /migrations differ/);
	assert.throws(() => prepareReplayMigration(duplicate, readMigration(duplicate), () => "select 1;"), /migrations differ/);
	assert.throws(() => prepareReplayMigration(duplicate, readMigration(duplicate), () => { throw new Error("missing recorded migration"); }), /missing recorded migration/);
});
