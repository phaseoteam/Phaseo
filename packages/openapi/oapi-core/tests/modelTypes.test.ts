import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIR } from "../src/builder.js";
import { loadOpenApi } from "../src/loadOpenApi.js";
import { createModelTypeResolver } from "../src/modelTypes.js";
import type { IRSchema } from "../src/ir.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The loader inlines $refs, so a list of failures arrives as an inline object schema. The resolver must
// find the named model again, including one with a nested error object.
test("finds the named model behind an inlined $ref, including nested objects", async () => {
	const dir = mkdtempSync(join(tmpdir(), "oapi-model-types-"));
	const spec = join(dir, "spec.json");
	writeFileSync(spec, JSON.stringify({
		openapi: "3.0.3",
		info: { title: "Members", version: "1" },
		paths: {},
		components: { schemas: {
			Failure: {
				type: "object",
				required: ["user_id", "error"],
				properties: {
					user_id: { type: "string" },
					error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", enum: ["conflict"] }, message: { type: "string" } }, additionalProperties: false },
				},
				additionalProperties: false,
			},
			AddResponse: {
				type: "object",
				required: ["failed"],
				properties: {
					failed: { type: "array", items: { $ref: "#/components/schemas/Failure" } },
					metadata: { type: "object", additionalProperties: true },
				},
				additionalProperties: false,
			},
			Empty: { type: "object", additionalProperties: true },
		} },
	}));
	const { ir } = buildIR(await loadOpenApi(spec), {});
	const response = ir.models.find((model) => model.name === "AddResponse")?.schema;
	assert.equal(response?.kind, "object");
	if (response?.kind !== "object") return;
	const failed = response.properties.failed as Extract<IRSchema, { kind: "array" }>;
	assert.equal(failed.items.kind, "object", "the loader inlines the reference");

	const modelType = createModelTypeResolver(ir.models);
	assert.equal(modelType(failed.items, "AddResponse"), "Failure");
	const failure = ir.models.find((model) => model.name === "Failure")?.schema;
	assert.ok(failure?.kind === "object");
	assert.equal(modelType(failure.properties.error as IRSchema, "Failure"), undefined, "an inline object no model has stays unnamed");
	// A free-form object matches an empty model by structure; backends that need a holder of arbitrary
	// values (the Rust backend) skip naming objects without properties.
	assert.equal(modelType(response.properties.metadata as IRSchema, "AddResponse"), "Empty");
});
