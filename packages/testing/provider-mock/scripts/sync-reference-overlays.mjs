import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openai = JSON.parse(await readFile(path.join(root, "contracts", "openai", "openapi.json"), "utf8"));

// These providers document OpenAI-compatible request surfaces but do not publish a
// stable, downloadable OpenAPI artifact for the hosted service. Keep these clearly
// labelled as official-docs-derived overlays rather than vendor OpenAPI snapshots.
const providers = [
  { id: "ai21", name: "AI21", prefix: "/studio/v1", docs: "https://docs.ai21.com/reference/chat-completions-api" },
  { id: "aion-labs", name: "Aion Labs", prefix: "/v1", docs: "https://docs.aionlabs.ai/" },
  { id: "akashml", name: "AkashML", prefix: "/v1", docs: "https://akash.network/docs/api-documentation/" },
  { id: "alibaba-cloud", name: "Alibaba Cloud Model Studio", prefix: "/compatible-mode/v1", docs: "https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope" },
  { id: "arcee-ai", name: "Arcee AI", prefix: "/api/v1", docs: "https://docs.arcee.ai/" },
  { id: "atlascloud", name: "Atlas Cloud", prefix: "/v1", docs: "https://docs.atlascloud.ai/" },
  { id: "avian", name: "Avian", prefix: "/v1", docs: "https://docs.avian.io/" },
  { id: "byteplus", name: "BytePlus ModelArk", prefix: "/api/v3", docs: "https://docs.byteplus.com/en/docs/ModelArk/ChatCompletions" },
  { id: "cerebras", name: "Cerebras", prefix: "/v1", docs: "https://inference-docs.cerebras.ai/api-reference/chat-completions" },
  { id: "chutes", name: "Chutes", prefix: "/v1", docs: "https://chutes.ai/docs" },
  { id: "clarifai", name: "Clarifai", prefix: "/v1", docs: "https://docs.clarifai.com/compute/inference/openai/" },
  { id: "cloudflare", name: "Cloudflare AI Gateway", prefix: "", docs: "https://developers.cloudflare.com/ai-gateway/usage/providers/openai-compatible/" },
  { id: "cohere", name: "Cohere", prefix: "/compatibility/v1", docs: "https://docs.cohere.com/docs/compatibility-api" },
  { id: "crofai", name: "CrofAI", prefix: "/v1", docs: "https://docs.crof.ai/" },
  { id: "crusoe", name: "Crusoe Cloud", prefix: "/v1", docs: "https://docs.crusoecloud.com/ai/" },
  { id: "darkbloom", name: "Darkbloom", prefix: "/v1", docs: "https://docs.darkbloom.dev/" },
  { id: "deepseek", name: "DeepSeek", prefix: "/v1", docs: "https://api-docs.deepseek.com/api/create-chat-completion" },
  { id: "featherless", name: "Featherless AI", prefix: "/v1", docs: "https://featherless.ai/docs" },
  { id: "gmicloud", name: "GMI Cloud", prefix: "/v1", docs: "https://docs.gmicloud.ai/" },
  { id: "groq", name: "Groq", prefix: "/openai/v1", docs: "https://console.groq.com/docs/api-reference" , responses: true },
  { id: "hyperbolic", name: "Hyperbolic", prefix: "/v1", docs: "https://docs.hyperbolic.xyz/docs/getting-started" },
  { id: "inception", name: "Inception Labs", prefix: "/v1", docs: "https://docs.inceptionlabs.ai/" },
  { id: "inference-net", name: "Inference.net", prefix: "/v1", docs: "https://docs.inference.net/" },
  { id: "infermatic", name: "Infermatic", prefix: "/v1", docs: "https://infermatic.ai/docs" },
  { id: "inflection", name: "Inflection AI", prefix: "/v1", docs: "https://developers.inflection.ai/docs" },
  { id: "ionrouter", name: "IonRouter", prefix: "/v1", docs: "https://docs.ionrouter.io/" },
  { id: "longcat", name: "LongCat", prefix: "/openai/v1", docs: "https://longcat.chat/platform/docs" },
  { id: "liquid-ai", name: "Liquid AI", prefix: "/v1", docs: "https://docs.liquid.ai/api-reference" },
  { id: "mancer", name: "Mancer", prefix: "/oai/v1", docs: "https://mancer.tech/docs" },
  { id: "mara", name: "Mara", prefix: "/v1", docs: "https://docs.mara.com/" },
  { id: "meta", name: "Meta Llama API", prefix: "/v1", docs: "https://llama.developer.meta.com/docs/api" },
  { id: "minimax", name: "MiniMax", prefix: "/v1", docs: "https://platform.minimax.io/docs/api-reference/text-openai-api" },
  { id: "moonshot-ai", name: "Moonshot AI", prefix: "/v1", docs: "https://platform.moonshot.ai/docs/api/chat" },
  { id: "morph", name: "Morph", prefix: "/v1", docs: "https://docs.morphllm.com/api-reference" },
  { id: "morpheus", name: "Morpheus", prefix: "/v1", docs: "https://gitbook.mor.org/developers/api-documentation" },
  { id: "nebius-token-factory", name: "Nebius Token Factory", prefix: "/v1", docs: "https://docs.nebius.com/studio/inference/quickstart" },
  { id: "nvidia", name: "NVIDIA NIM", prefix: "/v1", docs: "https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html", responses: true },
  { id: "ovhcloud", name: "OVHcloud AI Endpoints", prefix: "/v1", docs: "https://help.ovhcloud.com/csm/en-public-cloud-ai-endpoints-openai-compatibility?id=kb_article_view&sysparm_article=KB0065400" },
  { id: "parasail", name: "Parasail", prefix: "/v1", docs: "https://docs.parasail.io/" },
  { id: "phala", name: "Phala AI", prefix: "/v1", docs: "https://docs.phala.com/" },
  { id: "perplexity", name: "Perplexity", prefix: "/v1", docs: "https://docs.perplexity.ai/api-reference/chat-completions-post" },
  { id: "poolside", name: "Poolside", prefix: "/v1", docs: "https://docs.poolside.ai/" },
  { id: "reka", name: "Reka", prefix: "/v1", docs: "https://docs.reka.ai/api-reference/chat" },
  { id: "relace", name: "Relace", prefix: "/v1", docs: "https://docs.relace.ai/api-reference" },
  { id: "sakana", name: "Sakana AI", prefix: "/v1", docs: "https://docs.sakana.ai/" },
  { id: "sambanova", name: "SambaNova Cloud", prefix: "/v1", docs: "https://docs.sambanova.ai/cloud/docs/api-reference" },
  { id: "scaleway", name: "Scaleway Generative APIs", prefix: "/v1", docs: "https://www.scaleway.com/en/docs/generative-apis/api-cli/openai-compatibility/" },
  { id: "sourceful", name: "Sourceful", prefix: "/v1", docs: "https://docs.sourceful.ai/" },
  { id: "stepfun", name: "StepFun", prefix: "/v1", docs: "https://platform.stepfun.com/docs" },
  { id: "tensorix", name: "Tensorix", prefix: "/v1", docs: "https://tensorix.ai/docs" },
  { id: "thinking-machines", name: "Thinking Machines Tinker", prefix: "", docs: "https://tinker-docs.thinkingmachines.ai/" },
  { id: "upstage", name: "Upstage", prefix: "/v1/solar", docs: "https://console.upstage.ai/docs/capabilities/chat" },
  { id: "weights-and-biases", name: "Weights & Biases Inference", prefix: "/v1", docs: "https://docs.wandb.ai/inference/api-reference" },
  { id: "xiaomi", name: "Xiaomi MiMo", prefix: "/v1", docs: "https://platform.xiaomimimo.com/docs" },
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
  const operationDefinitions = [
    { capability: "chat", sourcePath: "/chat/completions", path: `${provider.prefix}/chat/completions` },
    ...(provider.responses ? [{ capability: "responses", sourcePath: "/responses", path: `${provider.prefix}/responses` }] : []),
  ];
  const paths = {};
  const operations = [];
  for (const definition of operationDefinitions) {
    const sourceOperation = structuredClone(openai.paths[definition.sourcePath].post);
    sourceOperation.operationId = `${provider.id.replaceAll("-", "_")}_${definition.capability}`;
    sourceOperation.description = `Reference-derived ${provider.name} ${definition.capability} contract. See manifest provenance.`;
    paths[definition.path] = { post: sourceOperation };
    operations.push({ capability: definition.capability, method: "post", path: definition.path, operationId: sourceOperation.operationId, notes: "Reconstructed from the provider's documented OpenAI-compatible API surface; provider-specific restrictions belong in overlays." });
  }
  const refs = new Set(); collectRefs(paths, refs);
  const components = {}; const copied = new Set();
  while (true) {
    const ref = [...refs].find((candidate) => !copied.has(candidate)); if (!ref) break;
    copied.add(ref); const [, , group, ...parts] = ref.split("/"); const name = parts.join("/");
    const value = openai.components?.[group]?.[name]; if (!value) throw new Error(`OpenAI base contract is missing ${ref}`);
    components[group] ??= {}; components[group][name] = value; collectRefs(value, refs);
  }
  const document = { openapi: "3.1.0", info: { title: `${provider.name} Phaseo reference overlay`, version: "1.0.0" }, paths, components };
  const output = `${JSON.stringify(document, null, 2)}\n`;
  const manifest = { providerId: provider.id, displayName: provider.name, source: { kind: "official-docs", url: provider.docs }, operations, overlays: ["OpenAI-compatible request schema baseline; narrowed and extended by deterministic provider scenarios as documented behavior is identified."] };
  const provenance = { sourceUrl: provider.docs, reconstruction: "openai-compatible-reference-overlay", baseContract: "openai", bundleSha256: createHash("sha256").update(output).digest("hex"), gatewayPathPrefix: provider.prefix };
  const dir = path.join(root, "contracts", provider.id); await mkdir(dir, { recursive: true });
  await Promise.all([writeFile(path.join(dir, "openapi.json"), output), writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`), writeFile(path.join(dir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)]);
  console.log(`${provider.name}: ${operations.length} reference-derived operations, ${copied.size} components`);
}
