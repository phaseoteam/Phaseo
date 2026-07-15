import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providers = [
  { id: "baseten", name: "Baseten", url: "https://docs.baseten.co/reference/inference-api/llm-openapi-spec.json", operations: [["post", "/v1/chat/completions", "/v1/chat/completions", "chat"]] },
  { id: "deepinfra", name: "DeepInfra", url: "https://api.deepinfra.com/openapi.json", operations: [["post", "/v1/chat/completions", "/v1/openai/chat/completions", "chat"], ["post", "/v1/embeddings", "/v1/openai/embeddings", "embeddings"], ["get", "/v1/models", "/v1/openai/models", "models"]] },
  { id: "fireworks", name: "Fireworks AI", url: "https://docs.fireworks.ai/merged.openapi.yaml", operations: [["post", "/v1/chat/completions", "/inference/v1/chat/completions", "chat"], ["post", "/v1/responses", "/inference/v1/responses", "responses"], ["post", "/v1/messages", "/inference/v1/messages", "messages"]] },
  { id: "friendli", name: "FriendliAI", url: "https://raw.githubusercontent.com/friendliai/friendli-openapi/refs/heads/main/openapi.yaml", repository: "https://github.com/friendliai/friendli-openapi", operations: [["post", "/serverless/v1/chat/completions", "/serverless/v1/chat/completions", "chat"], ["post", "/serverless/v1/responses", "/serverless/v1/responses", "responses"], ["post", "/serverless/v1/messages", "/serverless/v1/messages", "messages"], ["get", "/serverless/v1/models", "/serverless/v1/models", "models"]] },
  { id: "mistral", name: "Mistral AI", url: "https://docs.mistral.ai/openapi.yaml", operations: [["post", "/v1/chat/completions", "/v1/chat/completions", "chat"], ["post", "/v1/embeddings", "/v1/embeddings", "embeddings"], ["get", "/v1/models", "/v1/models", "models"], ["post", "/v1/ocr", "/v1/ocr", "ocr"], ["post", "/v1/audio/transcriptions", "/v1/audio/transcriptions", "audio-transcription"]] },
  { id: "siliconflow", name: "SiliconFlow", url: "https://docs.siliconflow.com/cn/api-reference/openapi.yaml", operations: [["post", "/chat/completions", "/v1/chat/completions", "chat"], ["post", "/embeddings", "/v1/embeddings", "embeddings"], ["post", "/rerank", "/v1/rerank", "rerank"], ["post", "/messages", "/v1/messages", "messages"], ["get", "/models", "/v1/models", "models"]] },
  { id: "together", name: "Together AI", url: "https://docs.together.ai/openapi.yaml", operations: [["post", "/chat/completions", "/v1/chat/completions", "chat"], ["post", "/embeddings", "/v1/embeddings", "embeddings"], ["post", "/rerank", "/v1/rerank", "rerank"], ["get", "/models", "/v1/models", "models"]] },
  { id: "venice", name: "Venice", url: "https://docs.venice.ai/swagger.yaml", operations: [["post", "/chat/completions", "/api/v1/chat/completions", "chat"], ["post", "/responses", "/api/v1/responses", "responses"], ["post", "/embeddings", "/api/v1/embeddings", "embeddings"], ["get", "/models", "/api/v1/models", "models"]] },
  { id: "z-ai", name: "Z.AI", url: "https://docs.z.ai/openapi.json", operations: [["post", "/paas/v4/chat/completions", "/api/paas/v4/chat/completions", "chat"]] },
];

function collectRefs(value, refs) {
  if (Array.isArray(value)) return value.forEach((child) => collectRefs(child, refs));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && child.startsWith("#/components/")) refs.add(child);
    else collectRefs(child, refs);
  }
}

for (const provider of providers) {
  const response = await fetch(provider.url, { headers: { "user-agent": "phaseo-provider-contract-sync/1.0" } });
  if (!response.ok) throw new Error(`${provider.name} contract download failed: ${response.status}`);
  const sourceText = await response.text();
  const source = parse(sourceText);
  const paths = {};
  const manifestOperations = [];
  for (const [method, sourcePath, gatewayPath, capability] of provider.operations) {
    const operation = source.paths?.[sourcePath]?.[method];
    if (!operation) throw new Error(`${provider.name} spec is missing ${method.toUpperCase()} ${sourcePath}`);
    paths[gatewayPath] ??= {};
    paths[gatewayPath][method] = operation;
    manifestOperations.push({ capability, method, path: gatewayPath, operationId: operation.operationId });
  }
  const refs = new Set(); collectRefs(paths, refs);
  const components = {}; const copied = new Set();
  while (true) {
    const ref = [...refs].find((candidate) => !copied.has(candidate)); if (!ref) break;
    copied.add(ref); const [, , group, ...parts] = ref.split("/"); const name = parts.join("/");
    const value = source.components?.[group]?.[name];
    if (!value) throw new Error(`${provider.name} has unresolved reference ${ref}`);
    components[group] ??= {}; components[group][name] = value; collectRefs(value, refs);
  }
  const document = { openapi: source.openapi, info: source.info, paths, components };
  const output = `${JSON.stringify(document, null, 2)}\n`;
  const dir = path.join(root, "contracts", provider.id); await mkdir(dir, { recursive: true });
  const manifest = { providerId: provider.id, displayName: provider.name, source: { kind: "official-openapi", url: provider.url, ...(provider.repository ? { repository: provider.repository } : {}) }, operations: manifestOperations };
  const provenance = { sourceUrl: provider.url, sourceSha256: createHash("sha256").update(sourceText).digest("hex"), bundleSha256: createHash("sha256").update(output).digest("hex"), openapiVersion: source.openapi, apiVersion: source.info?.version, gatewayPathMappings: provider.operations.map(([, sourcePath, gatewayPath]) => ({ sourcePath, gatewayPath })) };
  await Promise.all([writeFile(path.join(dir, "openapi.json"), output), writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`), writeFile(path.join(dir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)]);
  console.log(`${provider.name}: ${manifestOperations.length} operations, ${copied.size} components`);
}
