import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAPIV3 } from "openapi-types";
import { buildIR } from "../src/builder.js";

test("buildIR sorts models and operations deterministically", () => {
	const doc: OpenAPIV3.Document = {
		openapi: "3.0.3",
		info: { title: "Sort API", version: "1.0.0" },
		paths: {
			"/b": {
				get: {
					operationId: "getB",
					responses: { "200": { description: "ok" } }
				}
			},
			"/a": {
				get: {
					operationId: "getA",
					responses: { "200": { description: "ok" } }
				}
			}
		},
		components: {
			schemas: {
				Zeta: { type: "string" },
				Alpha: { type: "string" }
			}
		}
	};

	const { ir } = buildIR(doc);
	assert.equal(ir.models[0]?.name, "Alpha");
	assert.equal(ir.models[1]?.name, "Zeta");
	assert.equal(ir.operations[0]?.operationId, "getA");
	assert.equal(ir.operations[1]?.operationId, "getB");
});

test("buildIR resolves name collisions with numeric suffix", () => {
	const doc: OpenAPIV3.Document = {
		openapi: "3.0.3",
		info: { title: "Collision API", version: "1.0.0" },
		paths: {},
		components: {
			schemas: {
				"Foo Bar": { type: "string" },
				"Foo-Bar": { type: "string" }
			}
		}
	};

	const { ir } = buildIR(doc);
	assert.equal(ir.models[0]?.name, "FooBar");
	assert.equal(ir.models[1]?.name, "FooBar2");
});

test("buildIR reports diagnostics for unsupported schemas", () => {
	const doc: OpenAPIV3.Document = {
		openapi: "3.0.3",
		info: { title: "Diag API", version: "1.0.0" },
		paths: {},
		components: {
			schemas: {
				Weird: { anyOf: [{ type: "string" }, { type: "number" }] }
			}
		}
	};

	const { diagnostics } = buildIR(doc);
	assert.ok(diagnostics.some((diag) => diag.code === "schema.unsupported"));
});
