import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aliases = [
  { id: "aionlabs", parent: "aion-labs", name: "Aion Labs compatibility alias" },
  { id: "alibaba", parent: "alibaba-cloud", name: "Alibaba compatibility alias" },
  { id: "arcee", parent: "arcee-ai", name: "Arcee compatibility alias" },
  { id: "atlas-cloud", parent: "atlascloud", name: "Atlas Cloud compatibility alias" },
  { id: "anthropic-us", parent: "anthropic", name: "Anthropic US" },
  { id: "bytedance-seed", parent: "byteplus", name: "ByteDance Seed" },
  { id: "liquid", parent: "liquid-ai", name: "Liquid AI compatibility alias" },
  { id: "minimax-lightning", parent: "minimax", name: "MiniMax Lightning" },
  { id: "moonshotai", parent: "moonshot-ai", name: "Moonshot AI compatibility alias" },
  { id: "moonshotai-turbo", parent: "moonshot-ai", name: "Moonshot AI Turbo" },
  { id: "moonshot-ai-turbo", parent: "moonshot-ai", name: "Moonshot AI Turbo canonical" },
  { id: "nebius-token-factory-fast", parent: "nebius-token-factory", name: "Nebius Token Factory Fast" },
  { id: "nebius-token-factory-eu-north-1", parent: "nebius-token-factory", name: "Nebius Token Factory EU North" },
  { id: "nebius-token-factory-us-central-1", parent: "nebius-token-factory", name: "Nebius Token Factory US Central" },
  { id: "novitaai", parent: "novita", name: "Novita AI compatibility alias" },
  { id: "openai-eu", parent: "openai", name: "OpenAI EU" },
  { id: "spacex-ai", parent: "x-ai", name: "SpaceX AI" },
  { id: "qwen", parent: "alibaba-cloud", name: "Qwen compatibility alias" },
  { id: "runwayml", parent: "runway", name: "RunwayML compatibility alias" },
  { id: "venice-e2ee", parent: "venice", name: "Venice E2EE" },
  { id: "voyageai", parent: "voyage", name: "Voyage AI compatibility alias" },
  { id: "xai", parent: "x-ai", name: "xAI compatibility alias" },
  { id: "zai", parent: "z-ai", name: "Z.AI compatibility alias" },
];

for (const alias of aliases) {
  const parentDir = path.join(root, "contracts", alias.parent);
  const [parentManifest, document] = await Promise.all([
    readFile(path.join(parentDir, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(parentDir, "openapi.json"), "utf8").then(JSON.parse),
  ]);
  document.info = { ...document.info, title: `${alias.name} inherited provider contract` };
  const output = `${JSON.stringify(document, null, 2)}\n`;
  const manifest = {
    providerId: alias.id,
    displayName: alias.name,
    source: { kind: "phaseo-overlay", url: parentManifest.source.url },
    operations: parentManifest.operations,
    overlays: [`Inherits ${alias.parent}; this enabled ID changes routing, residency, performance tier, or transport policy without changing the request schema.`],
  };
  const provenance = { inheritedFrom: alias.parent, parentSource: parentManifest.source, bundleSha256: createHash("sha256").update(output).digest("hex") };
  const dir = path.join(root, "contracts", alias.id); await mkdir(dir, { recursive: true });
  await Promise.all([writeFile(path.join(dir, "openapi.json"), output), writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`), writeFile(path.join(dir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)]);
  console.log(`${alias.name}: inherited ${manifest.operations.length} operations from ${alias.parent}`);
}
