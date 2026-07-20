import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_BASE = "https://novita.ai/docs";
const operations = [
  ["text.generate", "model-apis-llm-create-chat-completion", "createChatCompletion"],
  ["text.generate", "model-apis-llm-create-completion", "createCompletion"],
  ["embeddings", "model-apis-llm-create-embeddings", "createEmbedding"],
  ["rerank", "model-apis-llm-create-rerank", "createRerank"],
  ["models.list", "model-apis-llm-list-models", "listModels"],
  ["models.retrieve", "model-apis-llm-retrieve-model", "retrieveModel"],
];

function extractEndpoint(html) {
  const flight = /self\.__next_f\.push\((\[.*?\])\)<\/script>/gs;
  let decoded = "";
  for (const match of html.matchAll(flight)) {
    try {
      const frame = JSON.parse(match[1]);
      if (typeof frame[1] === "string") decoded += `${frame[1]}\n`;
    } catch {}
  }
  const marker = '"endpoint":';
  const markerIndex = decoded.indexOf(marker);
  if (markerIndex < 0) throw new Error("Mintlify endpoint payload not found");
  const start = decoded.indexOf("{", markerIndex);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < decoded.length; index += 1) {
    const char = decoded[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(decoded.slice(start, index + 1));
  }
  throw new Error("Mintlify endpoint payload was incomplete");
}

function convertSchemaArray(value) {
  if (!Array.isArray(value) || value.length === 0) return {};
  const variants = value.map(convertSchema);
  return variants.length === 1 ? variants[0] : { oneOf: variants };
}

function convertSchema(value) {
  if (!value || typeof value !== "object") return {};
  const schema = {};
  if (typeof value.type === "string") schema.type = value.type;
  if (typeof value.description === "string") schema.description = value.description;
  if (Array.isArray(value.enum)) schema.enum = value.enum;
  if (value.items) schema.items = convertSchemaArray(value.items);
  if (value.properties && typeof value.properties === "object") {
    schema.type = "object";
    schema.properties = {};
    const required = [];
    for (const [name, variants] of Object.entries(value.properties)) {
      schema.properties[name] = convertSchemaArray(variants);
      if (Array.isArray(variants) && variants.some((variant) => variant?.required === true)) required.push(name);
    }
    if (required.length) schema.required = required;
  }
  return schema;
}

const documentedScalarTypes = {
  stream: "boolean", n: "integer", seed: "integer", frequency_penalty: "number",
  presence_penalty: "number", repetition_penalty: "number", temperature: "number",
  top_p: "number", top_k: "integer", min_p: "number", logprobs: "boolean",
  top_logprobs: "integer", separate_reasoning: "boolean", enable_thinking: "boolean",
};

function applyLlmOverlays(schema) {
  const properties = schema?.properties;
  if (!properties) return schema;
  for (const [name, type] of Object.entries(documentedScalarTypes)) {
    if (properties[name]) properties[name] = { ...properties[name], type, properties: undefined };
  }
  if (properties.messages) properties.messages = { type: "array", items: { type: "object" } };
  if (properties.tools) {
    const tool = properties.tools;
    const fn = tool.properties?.function;
    if (fn?.properties?.description) fn.properties.description = { type: "string" };
    if (fn?.properties?.parameters) fn.properties.parameters = { type: "object" };
    properties.tools = { type: "array", items: tool };
  }
  const jsonSchema = properties.response_format?.properties?.json_schema;
  if (jsonSchema?.properties?.description) jsonSchema.properties.description = { type: "string" };
  if (jsonSchema?.properties?.schema) jsonSchema.properties.schema = { type: "object" };
  if (properties.stop) properties.stop = { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] };
  return schema;
}

function convertParameters(endpoint) {
  const parameters = [];
  for (const location of ["query", "header", "path", "cookie"]) {
    for (const [name, variants] of Object.entries(endpoint.request?.parameters?.[location] ?? {})) {
      const schema = convertSchemaArray(variants?.schema ?? variants);
      const required = Array.isArray(variants?.schema) && variants.schema.some((variant) => variant?.required === true);
      parameters.push({ name, in: location, required: location === "path" || required, schema });
    }
  }
  return parameters;
}

function convertContent(content, overlay = false) {
  return Object.fromEntries(Object.entries(content ?? {}).map(([mediaType, entry]) => {
    const schema = convertSchemaArray(entry?.schemaArray ?? entry?.schema);
    return [mediaType, { schema: overlay ? applyLlmOverlays(schema) : schema }];
  }));
}

const pages = [];
const paths = {};
for (const [capability, slug, operationId] of operations) {
  const url = `${DOCS_BASE}/api-reference/${slug}`;
  const response = await fetch(url, { headers: { "user-agent": "Phaseo provider-contract sync" } });
  if (!response.ok) throw new Error(`Novita docs fetch failed (${response.status}): ${url}`);
  const html = await response.text();
  const endpoint = extractEndpoint(html);
  const method = String(endpoint.method).toLowerCase();
  const operation = {
    operationId,
    summary: endpoint.title,
    parameters: convertParameters(endpoint),
    responses: Object.fromEntries(Object.entries(endpoint.response ?? {}).map(([status, responseValue]) => [status, {
      description: responseValue?.description ?? "Documented response",
      content: convertContent(responseValue?.body),
    }])),
  };
  const requestContent = convertContent(endpoint.request?.body, endpoint.path.includes("/openai/v1/"));
  if (Object.keys(requestContent).length) operation.requestBody = { required: true, content: requestContent };
  paths[endpoint.path] ??= {};
  paths[endpoint.path][method] = operation;
  pages.push({ capability, method, path: endpoint.path, operationId, url, sha256: createHash("sha256").update(html).digest("hex") });
}

const document = {
  openapi: "3.1.0",
  info: { title: "Novita AI Mintlify-compiled API contract", version: new Date().toISOString().slice(0, 10) },
  servers: [{ url: "https://api.novita.ai" }],
  paths,
};
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "contracts", "novita");
await mkdir(outputDir, { recursive: true });
const serialized = `${JSON.stringify(document, null, 2)}\n`;
await writeFile(path.join(outputDir, "openapi.json"), serialized);
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify({
  providerId: "novita",
  displayName: "Novita AI",
  source: { kind: "official-mintlify", url: `${DOCS_BASE}/api-reference/api-reference-overview` },
  operations: pages.map(({ capability, method, path: operationPath, operationId }) => ({ capability, method, path: operationPath, operationId })),
  overlays: [
    "Novita publishes per-endpoint OpenAPI JSON for some APIs, but its LLM pages use Mintlify api: sources. This bundle is reproducibly compiled from Mintlify's structured endpoint payloads.",
    "Scalar fields emitted as empty object schemas and the OpenAI-compatible tools/stop shapes are normalized to their documented wire types.",
  ],
}, null, 2)}\n`);
await writeFile(path.join(outputDir, "provenance.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  pages,
  bundleSha256: createHash("sha256").update(serialized).digest("hex"),
}, null, 2)}\n`);
console.log(`Synced ${pages.length} Novita endpoints to ${outputDir}`);
