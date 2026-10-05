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

test("desired routing function bodies match the latest recorded migration", () => {
	const latest = readMigration("20261004222339_tighten_canonical_capability_boundaries.sql").replaceAll("\r\n", "\n");
	for (const name of ["canonical_routing_capability_id", "enforce_canonical_routing_capability", "normalize_routing_pricing_operation"]) {
		const desired = readFileSync(new URL(`../supabase/schemas/public/functions/${name}.sql`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
		const body = desired.slice(desired.indexOf("as $$") + 5, desired.indexOf("$$;", desired.indexOf("as $$") + 5));
		const start = latest.indexOf(`function public.${name}(`);
		const delimiter = latest.indexOf("as $$", start) + 5;
		assert.equal(body, latest.slice(delimiter, latest.indexOf("$$;", delimiter)), name);
	}
});
