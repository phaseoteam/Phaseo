import { test } from "node:test";
import assert from "node:assert/strict";
import { backendGo } from "../../packages/openapi-backends/oapi-backend-go/src/index.js";
import { backendCsharp } from "../../packages/openapi-backends/oapi-backend-csharp/src/index.js";
import type { IR, IRSchema } from "@phaseo/oapi-core";

const object: IRSchema = { kind: "object", properties: {}, required: [] };

for (const [backend, filename, objectType, mixedType] of [
	[backendGo, "operations.go", "map[string]interface{}", "interface{}"],
	[backendCsharp, "Operations.cs", "Task<Dictionary<string, object>?>", "Task<object?>"],
] as const) {
	test(`${backend.id} preserves dictionary responses for object unions`, async () => {
		for (const [variants, expected] of [
			[[object, object], objectType],
			[[object, { kind: "primitive", type: "string" }], mixedType],
		] as const) {
			const ir: IR = {
				version: 1,
				info: { title: "Models", version: "1" },
				models: [],
				operations: [{
					operationId: "listModels", method: "get", path: "/models",
					tags: [], params: [],
					responses: [{ status: "200", schema: { kind: "union", variants: [...variants] } }],
				}],
			};
			const files = await backend.generate(ir, { outDir: "unused" });
			const signature = files.find(file => file.path === filename)?.contents
				.split("\n").find(line => line.includes(backend.id === "go" ? "func ListModels(" : " ListModelsAsync("));
			assert.ok(signature?.includes(backend.id === "go" ? `(${expected}, error)` : expected));
		}
	});
}
