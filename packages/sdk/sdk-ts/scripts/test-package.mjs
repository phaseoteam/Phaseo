import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), "phaseo-package-"));
const require = createRequire(import.meta.url);
const npm = process.platform === "win32" ? process.execPath : "npm";
const npmPrefix = process.platform === "win32" ? [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")] : [];
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const packed = JSON.parse(run(npm, [...npmPrefix, "pack", "--ignore-scripts", "--json", "--pack-destination", temp], root))[0];
const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
for (const entry of Object.values(metadata.exports)) {
  for (const condition of ["import", "require"]) {
    for (const file of Object.values(entry[condition])) {
      assert(packed.files.some(item => item.path === file.replace(/^\.\//, "")), `Missing packed export ${file}`);
    }
  }
}
await mkdir(path.join(temp, "consumer"));
const consumer = path.join(temp, "consumer");
await writeFile(path.join(consumer, "package.json"), '{"private":true}\n');
// Install the exact tarball without a registry or provider request.
run(npm, [...npmPrefix, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", path.join(temp, packed.filename)], consumer);
const imports = [];
for (const subpath of Object.keys(metadata.exports)) {
  const specifier = "@phaseo/sdk" + (subpath === "." ? "" : subpath.slice(1));
  imports.push(`import * as entry${imports.length} from ${JSON.stringify(specifier)};`);
  run(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(specifier)})`], consumer);
  run(process.execPath, ["-e", `require(${JSON.stringify(specifier)})`], consumer);
}
const failureTypes = `
import { JobFailedError } from "@phaseo/sdk";
declare const error: unknown;
if (error instanceof JobFailedError) {
  if (error.isKind("batch")) {
    const failed: number | undefined = error.response.request_counts?.failed;
    const state: "pending" | "estimated" | "settled" | "void" | undefined = error.response.billing?.state;
  }
  if (error.isKind("video")) {
    const response: import("@phaseo/sdk").VideoStatusResponse = error.response;
  }
  if (error.isKind("music")) {
    const url: string | undefined = error.response.audio_url;
  }
}
`;
for (const extension of ["mts", "cts"]) await writeFile(path.join(consumer, `consumer.${extension}`), imports.join("\n") + failureTypes);
run(process.execPath, [require.resolve("typescript/bin/tsc"), "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--strict", "--skipLibCheck", "--types", "node", "--typeRoots", path.join(root, "node_modules/@types"), "consumer.mts", "consumer.cts"], consumer);
console.log("Packed SDK: all ESM and CommonJS entrypoints load and typecheck from an offline consumer install.");
