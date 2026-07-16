import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specs = [
  { id: "openai", capability: "rerank", method: "post", path: "/rerank" },
  { id: "alibaba-cloud", capability: "video.generate", method: "post", path: "/api/v1/services/aigc/video-generation/video-synthesis" },
  { id: "atlascloud", capability: "video.generate", method: "post", path: "/api/v1/model/generateVideo" },
  { id: "byteplus", capability: "video.generate", method: "post", path: "/api/v3/contents/generations/tasks" },
  { id: "google-ai-studio", capability: "embeddings", method: "post", path: "/v1beta/models/{model}:embedContent" },
  { id: "google-ai-studio", capability: "embeddings", method: "post", path: "/v1beta/models/{model}:batchEmbedContents" },
  { id: "google-ai-studio", capability: "music.generate", method: "post", path: "/v1beta/models/{model}:generateContent" },
  { id: "google-ai-studio", capability: "audio.speech", method: "post", path: "/v1beta/models/{model}:generateContent" },
  { id: "x-ai", capability: "video.generate", method: "post", path: "/v1/videos/generations" },
  { id: "minimax", capability: "video.generate", method: "post", path: "/v1/video_generation" },
  { id: "minimax", capability: "music.generate", method: "post", path: "/v1/music_generation" },
  { id: "google-vertex-eu", capability: "video.generate", method: "post", path: "/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:predictLongRunning" },
  { id: "voyage", capability: "text.generate", method: "post", path: "/v1/chat/completions" },
];

for (const spec of specs) {
  const dir = path.join(root, "contracts", spec.id);
  const [manifest, document] = await Promise.all([
    readFile(path.join(dir, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(dir, "openapi.json"), "utf8").then(JSON.parse),
  ]);
  const existing = manifest.operations.find((item) => item.capability === spec.capability && item.method === spec.method && item.path === spec.path);
  const pathOperationId = document.paths?.[spec.path]?.[spec.method]?.operationId;
  const operationId = existing?.operationId ?? pathOperationId ?? `${spec.id.replaceAll("-", "_")}_${spec.capability.replaceAll(".", "_")}_${manifest.operations.filter((item) => item.capability === spec.capability).length + 1}`;
  document.paths[spec.path] ??= {};
  document.paths[spec.path][spec.method] = {
    operationId,
    description: `Phaseo executor-derived ${spec.capability} operation.`,
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
    responses: { "200": { description: "Deterministic mock success" }, "400": { description: "Validation error" }, "429": { description: "Rate limit" } },
  };
  if (!existing) manifest.operations.push({ capability: spec.capability, method: spec.method, path: spec.path, operationId, notes: "Derived from the enabled Phaseo executor URL and provider API reference." });
  manifest.overlays ??= [];
  if (!manifest.overlays.includes("Enabled capability operations derived from Phaseo executor routing.")) manifest.overlays.push("Enabled capability operations derived from Phaseo executor routing.");
  const output = `${JSON.stringify(document, null, 2)}\n`;
  const provenance = await readFile(path.join(dir, "provenance.json"), "utf8").then(JSON.parse).catch(() => ({ sourceUrl: manifest.source.url }));
  await Promise.all([
    writeFile(path.join(dir, "openapi.json"), output),
    writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(dir, "provenance.json"), `${JSON.stringify({ ...provenance, bundleSha256: createHash("sha256").update(output).digest("hex"), capabilityOverlay: true }, null, 2)}\n`),
  ]);
  console.log(`${spec.id}: ${spec.capability} ${spec.method.toUpperCase()} ${spec.path}`);
}
