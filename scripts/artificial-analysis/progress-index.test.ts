import assert from "node:assert/strict";
import test from "node:test";
import { progressIndexRows, staleProgressResultIds } from "./progress-index";

const anchors = [
	{ id: "076f2674-bc4b-4925-be59-50832eb8c090", name: "o3-mini (High)", score: 220 },
	{ id: "1f054429-397e-4fdb-9e71-67bc92c1735e", name: "GPT-5.5 (Xhigh)", score: 320 },
];

test("keeps matched configurations with their variant, highest first", () => {
	const models = [...anchors, { id: "a", name: "Model (Max)", score: 350.5 }, { id: "b", name: "Model (Low)", score: 325 }, { id: "c", name: "Unmatched", score: 300 }, { id: "d", name: "Unscored", score: null }];
	const owners = new Map([["a", "lab/model"], ["b", "lab/model"], ["d", "lab/other"]]);
	const { rows, scored } = progressIndexRows(models, owners, new Map([["a", "max"], ["b", "low"]]));
	assert.equal(scored, 5);
	assert.deepEqual(rows.map((row) => [row.modelSlug, row.variant, row.score]), [["lab/model", "max", 350.5], ["lab/model", "low", 325]]);
});

test("refuses a payload whose scale anchors moved", () => {
	assert.throws(() => progressIndexRows([anchors[0], { ...anchors[1], score: 57 }], new Map(), new Map()), /anchor/);
	assert.throws(() => progressIndexRows([anchors[0]], new Map(), new Map()), /anchor/);
});

test("retires rows absent from the latest fit but refuses a collapsed run", () => {
	assert.deepEqual(staleProgressResultIds(["1", "2", "3"], ["1", "2", "4"]), ["3"]);
	assert.deepEqual(staleProgressResultIds([], ["1"]), []);
	assert.throws(() => staleProgressResultIds(["1", "2", "3"], ["1"]), /refusing/);
});
