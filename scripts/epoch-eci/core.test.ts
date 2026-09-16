import assert from "node:assert/strict";
import test from "node:test";
import { matchEpochRows, parseEpochEciCsv } from "./core";

test("parses quoted Epoch ECI rows and orders them by score", () => {
	const rows = parseEpochEciCsv('Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization\n"Model, One",Model One,12.5,11,14,2026-01-01,Lab\nModel Two,Model Two,15,14,16,2026-02-01,Lab\n');
	assert.deepEqual(rows.map((row) => row.displayName), ["Model Two", "Model One"]);
	assert.equal(rows[1].model, "Model, One");
});

test("matches only a unique normalized Phaseo model name", () => {
	const [match] = matchEpochRows([{ model_slug: "lab/model-one", name: "Model One" }], [{ model: "model-one", displayName: "Model One", score: 12, ciLow: 11, ciHigh: 13, releaseDate: "", organisation: "Lab" }]);
	assert.equal(match.model?.model_slug, "lab/model-one");
});
