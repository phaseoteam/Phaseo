import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiagnosticCollector } from "../src/diagnostics.js";
import { toIRSchema } from "../src/schema.js";

test("treats valid unconstrained schemas as intentional unknown values", () => {
	for (const schema of [{}, { description: "Arbitrary JSON value" }, { nullable: true }]) {
		const diagnostics = createDiagnosticCollector();
		assert.deepEqual(toIRSchema(schema, { diagnostics, pointer: "#/value" }), {
			kind: schema.nullable ? "nullable" : "unknown",
			...(schema.nullable ? { inner: { kind: "unknown" } } : {}),
		});
		assert.deepEqual(diagnostics.diagnostics, []);
	}
});
