// Build the OpenAPI backends before running this test. Runtime probes use only local files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { backendGo } from "../../packages/openapi-backends/oapi-backend-go/dist/index.js";
import { backendPhp } from "../../packages/openapi-backends/oapi-backend-php/dist/index.js";
import { backendRuby } from "../../packages/openapi-backends/oapi-backend-ruby/dist/index.js";

const base = JSON.parse(readFileSync(new URL("../../packages/openapi/oapi-cli/ir.json", import.meta.url), "utf8"));
function fixture(path, params) {
	return { ...base, operations: [{ ...base.operations[0], operationId: "pathProbe", method: "get", path, params }] };
}
async function generated(backend, ir, probe) {
	const directory = mkdtempSync(join(tmpdir(), "phaseo-generator-path-"));
	try {
		for (const file of await backend.generate(ir, {})) {
			mkdirSync(dirname(join(directory, file.path)), { recursive: true });
			writeFileSync(join(directory, file.path), file.contents);
		}
		await probe(directory);
	} finally { rmSync(directory, { recursive: true, force: true }); }
}
function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
}
test("Go operations without path parameters compile without unused imports", async () => {
	await generated(backendGo, fixture("/models", []), directory => {
		writeFileSync(join(directory, "go.mod"), "module pathprobe\n\ngo 1.22\n");
		run("go", ["test", "./..."], directory);
	});
});
const parameter = { ...base.operations.flatMap(operation => operation.params).find(param => param.in === "path"), name: "model-id" };
test("PHP sanitized path keys reject dot segments before the client runs", async () => {
	await generated(backendPhp, fixture("/models/{model-id}", [parameter]), directory => {
		writeFileSync(join(directory, "probe.php"), `<?php
namespace Phaseo\\Gen;
class Client { public function request($method, $path, ...$rest) { return $path; } }
require 'Operations.php';
foreach (['.', '..'] as $segment) {
  try { pathProbe(new Client(), ['model_id' => $segment]); exit(1); }
  catch (\\InvalidArgumentException $error) {}
}
if (pathProbe(new Client(), ['model_id' => 'safe/name']) !== '/models/safe%2Fname') exit(2);
`);
		run("php", ["probe.php"], directory);
	});
});
test("Ruby sanitized path keys reject dot segments before the client runs", async () => {
	await generated(backendRuby, fixture("/models/{model-id}", [parameter]), directory => {
		writeFileSync(join(directory, "probe.rb"), `require_relative 'operations'
client = Object.new
def client.request(**args); args[:path]; end
['.', '..'].each do |segment|
  begin
    Phaseo::Gen::Operations.pathProbe(client, path: {'model_id' => segment})
    exit(1)
  rescue ArgumentError
  end
end
exit(2) unless Phaseo::Gen::Operations.pathProbe(client, path: {'model_id' => 'safe/name'}) == '/models/safe%2Fname'
`);
		run("ruby", ["probe.rb"], directory);
	});
});
