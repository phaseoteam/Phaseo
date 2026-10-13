import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadOpenApi, buildIR } from "../../packages/openapi/oapi-core/dist/index.js";
import { backendJava } from "../../packages/openapi-backends/oapi-backend-java/dist/index.js";
import { backendCpp } from "../../packages/openapi-backends/oapi-backend-cpp/dist/index.js";

const root = new URL("../../", import.meta.url);
const spec = await loadOpenApi(fileURLToPath(new URL("apps/docs/openapi/v1/openapi.yaml", root)));
const { ir, diagnostics } = buildIR(spec, {});
assert.deepEqual(diagnostics.filter(item => item.level === "error"), []);
for (const [language, backend, directory] of [
  ["Java", backendJava, "packages/sdk/sdk-java/src/app/phaseo/gen/"],
  ["C++", backendCpp, "packages/sdk/sdk-cpp/src/gen/"],
]) {
  const files = await backend.generate(ir, { outDir: fileURLToPath(new URL(directory, root)) });
  for (const file of files) {
    const existing = await readFile(new URL(directory + file.path, root), "utf8");
    assert.equal(existing.replaceAll("\r\n", "\n"), file.contents.replaceAll("\r\n", "\n"),
      `${language} generated ${file.path} differs from the canonical OpenAPI backend`);
  }
  console.log(`${language}: ${files.length} generated files match the canonical OpenAPI spec`);
}
