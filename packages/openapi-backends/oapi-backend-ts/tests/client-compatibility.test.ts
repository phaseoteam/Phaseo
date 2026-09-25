import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Backend, IR } from "@phaseo/oapi-core";
import go from "../../oapi-backend-go/src/index.js";
import csharp from "../../oapi-backend-csharp/src/index.js";
import java from "../../oapi-backend-java/src/index.js";
import php from "../../oapi-backend-php/src/index.js";
import ruby from "../../oapi-backend-ruby/src/index.js";
import cpp from "../../oapi-backend-cpp/src/index.js";
import python from "../../oapi-backend-python/src/index.js";
import rust from "../../oapi-backend-rust/src/index.js";

const empty: IR = { version: 1, info: { title: "Compatibility", version: "1" }, models: [], operations: [] };
const contracts = JSON.parse(await readFile(new URL("../../../sdk/core-contract.json", import.meta.url), "utf8"));
const cases: [string, Backend, string, string][] = [
	["go", go, "client.go", "func (e *HTTPError) SupportURL()"],
	["csharp", csharp, "Client.cs", "SupportUrl"],
	["java", java, "Client.java", "getSupportUrl"],
	["php", php, "Client.php", "getSupportUrl"],
	["ruby", ruby, "client.rb", "support_url"],
	["cpp", cpp, "client.hpp", "retry_after_seconds"],
];

test("Rust generation emits response headers exactly once", async () => {
	const generated = await rust.generate(empty, { outDir: "ignored" });
	const client = generated.find((entry) => entry.path === "client.rs")!.contents;
	const response = client.match(/pub struct Response \{([^}]+)\}/)![1];
	assert.equal(response.match(/pub headers:/g)?.length, 1);
});

for (const [language, backend, file, errorHelper] of cases) {
	test(`${language} generation preserves the transport contract and error helpers`, async () => {
		const generated = await backend.generate(empty, { outDir: "ignored" });
		const client = generated.find((entry) => entry.path === file)?.contents;
		assert.ok(client);
		const contract = Object.entries(contracts.surfaces[language]).find(([path]) => path.endsWith(`/gen/${file}`));
		assert.ok(contract, `missing ${language} client contract`);
		for (const token of contract[1] as string[]) assert.ok(client.includes(token), `${language}: missing ${token}`);
		assert.ok(client.includes(errorHelper), `${language}: missing ${errorHelper}`);
	});
}

test("Python generation preserves keyword and wire-name fields", async () => {
	const generated = await python.generate({ ...empty, models: [{ name: "Tool", schema: {
		kind: "object", properties: { async: { kind: "primitive", type: "boolean" }, "vendor/name": { kind: "primitive", type: "string" } }, required: ["async"],
	} }] }, { outDir: "ignored" });
	const models = generated.find((entry) => entry.path === "models.py")!.contents;
	assert.ok(models.includes('Tool = TypedDict("Tool", {'));
	assert.ok(models.includes('"async": bool'));
	assert.ok(models.includes('"vendor/name": NotRequired[str]'));
	const client = generated.find((entry) => entry.path === "client.py")!.contents;
	assert.ok(client.includes('resp.headers.get_content_type() == "application/x-ndjson"'));
	assert.ok(client.includes("raise PhaseoAPIError.from_urllib(error) from error"));
});

test("PHP generation preserves raw NDJSON operations and streaming error headers", async () => {
	const generated = await php.generate({ ...empty, operations: [{
		operationId: "downloadResults", method: "get", path: "/results", tags: [], params: [],
		responses: [{ status: "200", kind: "text", contentType: "application/x-ndjson", schema: { kind: "primitive", type: "string" } }],
	}] }, { outDir: "ignored" });
	assert.ok(generated.find((entry) => entry.path === "Operations.php")!.contents.includes('$client->requestRaw("GET"'));
	assert.ok(generated.find((entry) => entry.path === "Client.php")!.contents.includes('new RequestException((int) $match[1], $raw === false ? "" : $raw, $responseHeaders)'));
});
