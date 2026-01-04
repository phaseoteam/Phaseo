import { test } from "node:test";
import assert from "node:assert/strict";
import { backendTs } from "../src/index.js";
import type { IR } from "@ai-stats/oapi-core";

test("backend-ts emits stable file set", async () => {
	const ir: IR = {
		version: 1,
		info: { title: "Example", version: "1.0.0" },
		models: [
			{
				name: "Widget",
				schema: {
					kind: "object",
					properties: { id: { kind: "primitive", type: "string" } },
					required: ["id"]
				}
			}
		],
		operations: [
			{
				operationId: "getWidget",
				method: "get",
				path: "/widgets/{id}",
				tags: ["widgets"],
				params: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { kind: "primitive", type: "string" }
					}
				],
				responses: [
					{
						status: "200",
						schema: { kind: "ref", name: "Widget" }
					}
				]
			}
		]
	};

	const files = await backendTs.generate(ir, { outDir: "ignored" });
	const paths = files.map((file) => file.path);
	assert.deepEqual(paths, [
		"client/index.ts",
		"client/widgets.ts",
		"index.ts",
		"models/Widget.ts",
		"models/index.ts"
	]);
	const widgetModel = files.find((file) => file.path === "models/Widget.ts");
	assert.ok(widgetModel?.contents.includes("export interface Widget"));
	const clientFile = files.find((file) => file.path === "client/widgets.ts");
	assert.ok(clientFile?.contents.includes("getWidget"));
});
