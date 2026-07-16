import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractDir = path.join(root, "contracts", "openai");
const manifest = JSON.parse(await readFile(path.join(contractDir, "manifest.json"), "utf8"));

const response = await fetch(manifest.source.url, { headers: { "user-agent": "phaseo-provider-contract-sync/1.0" } });
if (!response.ok) throw new Error(`OpenAI contract download failed: ${response.status} ${response.statusText}`);
const sourceText = await response.text();
const source = parse(sourceText);

function stripDocumentation(value) {
  if (Array.isArray(value)) return value.map(stripDocumentation);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith("x-oaiMeta"))
    .map(([key, child]) => [key, stripDocumentation(child)]));
}

const paths = {};
for (const expected of manifest.operations) {
  const upstream = source.paths?.[expected.path]?.[expected.method.toLowerCase()];
  if (!upstream) throw new Error(`OpenAI spec is missing ${expected.method.toUpperCase()} ${expected.path}`);
  paths[expected.path] ??= {};
  paths[expected.path][expected.method.toLowerCase()] = stripDocumentation(upstream);
}

const refs = new Set();
function collectRefs(value) {
  if (Array.isArray(value)) return value.forEach(collectRefs);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && child.startsWith("#/components/")) refs.add(child);
    else collectRefs(child);
  }
}
collectRefs(paths);

const components = {};
const copied = new Set();
while (true) {
  const next = [...refs].find((ref) => !copied.has(ref));
  if (!next) break;
  copied.add(next);
  const [, , group, ...nameParts] = next.split("/");
  const name = nameParts.join("/");
  const value = source.components?.[group]?.[name];
  if (!value) throw new Error(`OpenAI spec has an unresolved local reference: ${next}`);
  components[group] ??= {};
  components[group][name] = stripDocumentation(value);
  collectRefs(value);
}

const bundled = {
  openapi: source.openapi,
  info: source.info,
  servers: source.servers,
  paths,
  components,
};
const output = `${JSON.stringify(bundled, null, 2)}\n`;
const sourceSha256 = createHash("sha256").update(sourceText).digest("hex");
const bundleSha256 = createHash("sha256").update(output).digest("hex");
await writeFile(path.join(contractDir, "openapi.json"), output);
await writeFile(path.join(contractDir, "provenance.json"), `${JSON.stringify({
  sourceUrl: manifest.source.url,
  sourceRepository: manifest.source.repository,
  sourceSha256,
  bundleSha256,
  openapiVersion: source.openapi,
  apiVersion: source.info?.version,
}, null, 2)}\n`);
console.log(`OpenAI contract synced: ${manifest.operations.length} operations, ${copied.size} referenced components, ${output.length} bytes`);
