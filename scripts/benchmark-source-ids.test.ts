import assert from "node:assert/strict";
import test from "node:test";
import { benchmarkSourceId } from "./benchmark-source-ids";

test("absent IDs allow matching while explicit null disables a source", () => {
	assert.equal(benchmarkSourceId({}, "epoch_ai", "lab/model"), undefined);
	assert.equal(benchmarkSourceId({ external_ids: { epoch_ai: null } }, "epoch_ai", "lab/model"), null);
	assert.equal(benchmarkSourceId({ external_ids: { epoch_ai: "Model (high)" } }, "epoch_ai", "lab/model"), "Model (high)");
});

test("rejects malformed mappings before imports write data", () => {
	for (const external_ids of [null, [], "id", { epoch_ai: "" }, { epoch_ai: 1 }, { epoch_ai: " Model " }]) {
		assert.throws(() => benchmarkSourceId({ external_ids }, "epoch_ai", "lab/model"), /Invalid/);
	}
	assert.throws(() => benchmarkSourceId({ external_ids: { artificial_analysis: "model-name" } }, "artificial_analysis", "lab/model"), /UUID/);
});
