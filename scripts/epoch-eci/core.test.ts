import assert from "node:assert/strict";
import test from "node:test";
import { matchEpochRows, parseEpochEciCsv, staleEpochResultIds } from "./core";

const epochRow = { model: "epoch-stable-id", displayName: "Ambiguous Name", score: 12, ciLow: 11, ciHigh: 13, releaseDate: "", organisation: "Lab" };

test("remapping an Epoch source retires its former owner's result while preserving unclaimed scores", () => {
	const result = (result_id: string, model_slug: string, source: string) => ({ result_id, model_slug, result_key: `${model_slug}:epoch-capabilities-index:${source}` });
	const previous = result("previous", "lab/old-owner", "Epoch: Model (high)");
	const current = result("current", "lab/new-owner", "Epoch: Model (high)");
	const unclaimed = result("unclaimed", "lab/unmatched", "Other Epoch Model");
	const replaced = result("replaced", "lab/new-owner", "Old configuration");
	assert.deepEqual(staleEpochResultIds([previous, current, unclaimed, replaced], [current]), ["previous", "replaced"]);
	assert.deepEqual(staleEpochResultIds([unclaimed], []), []);
});

test("explicit database IDs override ambiguous display names", () => {
	const models = [{ model_slug: "lab/renamed", name: "Different Name", metadata: { external_ids: { epoch_ai: epochRow.model } } }, { model_slug: "lab/alias", name: epochRow.displayName }];
	assert.equal(matchEpochRows(models, [epochRow])[0].model?.model_slug, "lab/renamed");
});

test("mapped and opted-out models never match another Epoch configuration by name", () => {
	const models = [{ model_slug: "lab/model", name: "Other configuration", metadata: { external_ids: { epoch_ai: epochRow.model } } }, { model_slug: "lab/excluded", name: "Other configuration", metadata: { external_ids: { epoch_ai: null } } }];
	const rows = [epochRow, { ...epochRow, model: "other-id", displayName: "Other configuration" }];
	assert.equal(matchEpochRows(models, rows)[1].model, null);
});

test("missing and duplicate explicit Epoch IDs fail closed", () => {
	assert.throws(() => matchEpochRows([{ model_slug: "lab/model", name: "Model", metadata: { external_ids: { epoch_ai: "missing" } } }], [epochRow]), /missing source ID/);
	const models = ["one", "two"].map((name) => ({ model_slug: `lab/${name}`, name, metadata: { external_ids: { epoch_ai: epochRow.model } } }));
	assert.throws(() => matchEpochRows(models, [epochRow]), /maps to both/);
	assert.throws(() => matchEpochRows([], [epochRow, epochRow]), /Duplicate Epoch/);
});

test("parses quoted Epoch ECI rows and orders them by score", () => {
	const rows = parseEpochEciCsv('Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization\n"Model, One",Model One,12.5,11,14,2026-01-01,Lab\nModel Two,Model Two,15,14,16,2026-02-01,Lab\n');
	assert.deepEqual(rows.map((row) => row.displayName), ["Model Two", "Model One"]);
	assert.equal(rows[1].model, "Model, One");
});

test("matches only a unique normalized Phaseo model name", () => {
	const [match] = matchEpochRows([{ model_slug: "lab/model-one", name: "Model One" }], [{ model: "model-one", displayName: "Model One", score: 12, ciLow: 11, ciHigh: 13, releaseDate: "", organisation: "Lab" }]);
	assert.equal(match.model?.model_slug, "lab/model-one");
});
