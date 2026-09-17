import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { goModule } from "./sync-dependent-sdk-releases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("Go module paths follow the released major", () => {
  assert.equal(goModule("1.2.0"), "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go");
  assert.equal(goModule("3.0.0"), "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3");
  assert.throws(() => goModule("invalid"));
});

test("release synchronization updates real manifests, dependencies, attribution and Go imports", async () => {
  // Keep generated fixtures inside the ignored workspace directory so the
  // existing generator and tsx resolve the same dependencies as release CI.
  await mkdir(path.join(root, ".tmp"), { recursive: true });
  const fixture = await mkdtemp(path.join(root, ".tmp/release-sync-"));
  for (const relative of [
    "packages/sdk", "apps/docs/v1", "apps/docs/openapi/v1/openapi.yaml",
    "scripts/update-sdk-language-manifest-versions.ts", "scripts/update-pyproject-version.ts", "scripts/sync-dependent-sdk-releases.mjs",
    "scripts/sdk/generate-model-id-constants.mjs",
  ]) {
    await cp(path.join(root, relative), path.join(fixture, relative), {
      recursive: true,
      filter: source => !["node_modules", "dist", "target", "bin", "obj", ".venv", "__pycache__"].includes(path.basename(source)),
    });
  }
  const read = relative => readFile(path.join(fixture, relative), "utf8");
  for (const language of ["ts", "py", "go", "csharp", "java", "php", "ruby", "rust"]) {
    for (const kind of ["sdk", "agent-sdk"]) {
      const relative = `packages/sdk/${kind}-${language}/package.json`;
      const metadata = JSON.parse(await read(relative));
      metadata.version = language === "rust" ? "0.2.0" : kind === "sdk" ? "3.0.0" : "0.3.0";
      await writeFile(path.join(fixture, relative), JSON.stringify(metadata, null, 2) + "\n");
    }
  }
  const sync = () => {
    for (const script of ["update-pyproject-version.ts", "update-sdk-language-manifest-versions.ts"]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", path.join(fixture, "scripts", script)], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  };
  sync();
  const checks = [
    ["sdk-py/pyproject.toml", /version = "3\.0\.0"/],
    ["agent-sdk-py/pyproject.toml", /version = "0\.3\.0"/, /phaseo>=3\.0\.0,<4\.0\.0/],
    ["agent-sdk-py/src/phaseo_agent/__init__.py", /client_source_version="0\.3\.0"/],
    ["agent-sdk-go/VERSION", /^0\.3\.0\s*$/],
    ["agent-sdk-go/go.mod", /sdk-go\/v3 v3\.0\.0/],
    ["agent-sdk-go/agent.go", /sdk-go\/v3/, /X-Phaseo-Client-Version"\] = "0\.3\.0"/, /X-Phaseo-Client-Version", "0\.3\.0"/],
    ["sdk-go/go.mod", /sdk-go\/v3/],
    ["sdk-go/model_ids.go", /sdk-go\/v3\/src\/gen/],
    ["agent-sdk-csharp/Phaseo.AgentSdk.csproj", /<Version>0\.3\.0<\/Version>/, /ProjectReference Include="\.\.\/sdk-csharp\/Phaseo.Sdk.csproj"/],
    ["sdk-csharp/Phaseo.Sdk.csproj", /<Version>3\.0\.0<\/Version>/],
    ["agent-sdk-csharp/AgentSdk.cs", /X-Phaseo-Client-Version", "0\.3\.0"/],
    ["agent-sdk-java/pom.xml", /<version>0\.3\.0<\/version>/, /<phaseo.sdk.version>3\.0\.0/],
    ["agent-sdk-java/src/main/java/app/phaseo/agent/AgentSdk.java", /"phaseo-agent-java", "0\.3\.0"/],
    ["agent-sdk-php/VERSION", /^0\.3\.0\s*$/],
    ["agent-sdk-php/composer.json", /"phaseo\/sdk": "\^3\.0\.0"/],
    ["agent-sdk-ruby/phaseo_agent_sdk.gemspec", /spec.version\s*=\s*"0\.3\.0"/, /">= 3\.0\.0", "< 4\.0\.0"/],
    ["agent-sdk-ruby/lib/phaseo_agent_sdk.rb", /client_source_version: "0\.3\.0"/],
    ["sdk-rust/Cargo.toml", /version = "0\.2\.0"/],
    ["agent-sdk-rust/Cargo.toml", /version = "0\.2\.0"/, /phaseo = \{[^\n]*version = "0\.2\.0"/],
    ["agent-sdk-rust/Cargo.lock", /name = "phaseo"\s+version = "0\.2\.0"/, /name = "phaseo-agent"\s+version = "0\.2\.0"/],
  ];
  for (const [file, ...patterns] of checks) {
    const content = await read(`packages/sdk/${file}`);
    for (const pattern of patterns) assert.match(content, pattern, file);
  }
  async function digest(directory) {
    const hash = createHash("sha256");
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      hash.update(entry.name);
      hash.update(entry.isDirectory() ? await digest(file) : await readFile(file));
    }
    return hash.digest("hex");
  }
  const before = await digest(fixture);
  sync();
  assert.equal(await digest(fixture), before, "Version synchronization must be idempotent");
  console.log(`Validated release fixture: ${fixture}`);
});
