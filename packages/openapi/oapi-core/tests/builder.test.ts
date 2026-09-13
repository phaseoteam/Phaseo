import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAPIV3 } from "openapi-types";
import { buildIR } from "../src/builder.js";

test("classifies JSONL downloads as text rather than a single JSON value", () => {
	const { ir } = buildIR({
		openapi: "3.0.3",
		info: { title: "Results", version: "1" },
		paths: { "/results": { get: { operationId: "results", responses: {
			"200": { description: "JSONL", content: { "application/x-ndjson": { schema: { type: "string" } } } }
		} } } },
	});
	assert.equal(ir.operations[0]?.responses[0]?.kind, "text");
	assert.deepEqual(ir.operations[0]?.responses[0]?.schema, { kind: "primitive", type: "string" });
});

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

test("buildIR excludes internal paths and operations", () => {
	const doc: OpenAPIV3.Document = {
		openapi: "3.0.3",
		info: { title: "Public API", version: "1.0.0" },
		paths: {
			"/public": {
				get: {
					operationId: "getPublic",
					responses: { "200": { description: "ok" } }
				},
				post: {
					"x-internal": true,
					operationId: "createInternal",
					responses: { "200": { description: "ok" } }
				} as OpenAPIV3.OperationObject
			},
			"/websocket": {
				get: {
					operationId: "openWebSocket",
					responses: { "101": { description: "switching protocols" } }
				}
			},
			"/internal": {
				"x-internal": true,
				get: {
					operationId: "getInternal",
					responses: { "200": { description: "ok" } }
				}
			} as OpenAPIV3.PathItemObject
		},
		components: { schemas: {} }
	};

	const { ir } = buildIR(doc);
	assert.deepEqual(ir.operations.map((operation) => operation.operationId), ["getPublic"]);
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
