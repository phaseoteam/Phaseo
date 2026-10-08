import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web-api/package.json"));
const ts = require("typescript");
const yaml = require("js-yaml");
const policyPath = path.join(root, "apps/api/src/pipeline/before/textParamPolicy.ts");
const source = ts.createSourceFile(policyPath, fs.readFileSync(policyPath, "utf8"), ts.ScriptTarget.Latest, true);
let registry;
function find(node) {
	if (ts.isVariableDeclaration(node) && node.name.getText(source) === "TEXT_ENDPOINT_REGISTRY") registry = node.initializer;
	ts.forEachChild(node, find);
}
find(source);
if (!registry || !ts.isObjectLiteralExpression(registry)) throw new Error("Text parameter registry was not found.");
const options = {};
for (const endpoint of registry.properties) {
	const id = endpoint.name.getText(source).replace(/^['"]|['"]$/g, "");
	const mapping = endpoint.initializer.properties.find((item) => item.name.getText(source) === "keyToCanonicalParam").initializer;
	options[id] = Array.from(new Set(mapping.properties.flatMap((item) => [item.name.getText(source).replace(/^['"]|['"]$/g, ""), item.initializer.text]))).sort();
}
options["text.generate"] = Array.from(new Set(Object.values(options).flat())).sort();

const spec = yaml.load(fs.readFileSync(path.join(root, "apps/docs/openapi/v1/openapi.yaml"), "utf8"));
function resolve(value) {
	if (!value?.$ref) return value;
	if (!value.$ref.startsWith("#/")) throw new Error("External request-schema references are not supported.");
	return resolve(value.$ref.slice(2).split("/").reduce((item, key) => item[key.replaceAll("~1", "/").replaceAll("~0", "~")], spec));
}
function properties(schema) {
	schema = resolve(schema);
	if (!schema) return {};
	return Object.assign({}, schema.properties, ...[...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].map(properties));
}
const endpoints = {
	embeddings: "/embeddings", "text.embed": "/embeddings", rerank: "/rerank",
	"decisions.make": "/decisions", "images.generations": "/images/generations",
	"images.edits": "/images/edits", "audio.speech": "/audio/speech",
	"audio.transcription": "/audio/transcriptions", "audio.translations": "/audio/translations",
	"video.generation": "/videos", moderation: "/moderations", batch: "/batches",
	ocr: "/ocr", parse: "/parse", "music.generate": "/music/generations",
};
const gatewayFields = new Set(["model", "models", "input", "messages", "prompt", "text", "file", "image", "images", "provider", "provider_options", "providerOptions", "preset", "presets", "plugins", "debug", "meta", "metadata", "user", "user_id", "session_id", "webhook", "webhook_url", "custom_id"]);
for (const [id, route] of Object.entries(endpoints)) {
	const operation = spec.paths[route]?.post;
	if (!operation?.requestBody) continue;
	const content = resolve(operation.requestBody).content;
	const schema = content?.["application/json"]?.schema ?? content?.["multipart/form-data"]?.schema;
	options[id] = Object.keys(properties(schema)).filter((key) => !gatewayFields.has(key)).sort();
}
const result = `${JSON.stringify(options, null, 2)}\n`;
const output = path.join(root, "apps/web-api/src/routes/account/provider-catalog-parameters.json");
if (process.argv.includes("--check")) {
	if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== result) throw new Error("Provider parameter choices are stale. Run node scripts/generate-provider-catalog-parameters.mjs.");
} else fs.writeFileSync(output, result);
console.log(`Provider parameter choices verified for ${Object.keys(options).length} capabilities.`);
