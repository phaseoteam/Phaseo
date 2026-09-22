import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../packages/data/catalog/src/data");

const correctedNames = {
  "ai21/jamba-1.5-large-instruct": "Jamba 1.5 Large Instruct",
  "bytedance/seed-2.0-code": "Seed 2.0 Code",
  "deepseek/deepseek-coder-6.7b-instruct": "DeepSeek Coder 6.7B Instruct",
  "google/codegemma-1.1-7b": "CodeGemma 1.1 7B",
  "meta/llama-3.1-8b-instruct": "Llama 3.1 8B Instruct",
  "meta/llama-3.2-11b-vision-instruct": "Llama 3.2 11B Vision Instruct",
  "meta/llama-3.2-90b-vision-instruct": "Llama 3.2 90B Vision Instruct",
  "meta/llama-3.3-70b-instruct": "Llama 3.3 70B Instruct",
  "meta/llama-3.3-70b-instruct-turbo": "Llama 3.3 70B Instruct Turbo",
  "meta/meta-llama-3.1-405b-instruct": "Meta Llama 3.1 405B Instruct",
  "meta/meta-llama-3.1-70b-instruct": "Meta Llama 3.1 70B Instruct",
  "meta/meta-llama-3.1-8b-instruct-turbo": "Meta Llama 3.1 8B Instruct Turbo",
  "mistral/codestral-22b-instruct-v0.1": "Codestral 22B Instruct v0.1",
  "mistral/mistral-7b-instruct-v0.3": "Mistral 7B Instruct v0.3",
  "mistral/mixtral-8x22b-v0.1": "Mixtral 8x22B v0.1",
  "nvidia/ising-calibration-1.5-31b": "Ising Calibration 1.5 31B",
  "nvidia/llama-3.1-nemoguard-8b-content-safety": "Llama 3.1 NemoGuard 8B Content Safety",
  "nvidia/llama-3.1-nemoguard-8b-topic-control": "Llama 3.1 NemoGuard 8B Topic Control",
  "nvidia/llama-3.1-nemotron-51b-instruct": "Llama 3.1 Nemotron 51B Instruct",
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": "Llama 3.1 Nemotron Nano VL 8B v1",
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3": "Llama 3.1 Nemotron Safety Guard 8B v3",
  "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1": "Llama 3.2 NeMo Retriever 1B VLM Embed v1",
  "nvidia/llama-3.2-nv-embedqa-1b-v1": "Llama 3.2 NV-EmbedQA 1B v1",
  "nvidia/llama3-chatqa-1.5-70b": "Llama 3 ChatQA 1.5 70B",
  "nvidia/nemotron-3.5-content-safety": "Nemotron 3.5 Content Safety",
  "nvidia/nemotron-lightning-3.5-30b-a3b": "Nemotron Lightning 3.5 30B A3B",
  "nvidia/riva-translate-4b-instruct-v1.1": "Riva Translate 4B Instruct v1.1",
  "qwen/qwen2.5-72b-instruct": "Qwen2.5 72B Instruct",
  "qwen/qwen2.5-coder-32b-instruct": "Qwen2.5 Coder 32B Instruct",
  "spacex-ai/grok-4.2-beta": "Grok 4.2 Beta",
  "z-ai/glm-5.2-fast": "GLM 5.2 Fast",
};

const duplicateModels = {
  "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "bytedance/seedance-1-5-pro": "bytedance/seedance-1.5-pro",
  "deepseek/deepseek_v3": "deepseek/deepseek-v3",
  "mistral/mistral-medium-3-5": "mistral/mistral-medium-3.5",
  "qwen/qwen-2.5-72b-instruct": "qwen/qwen2.5-72b-instruct",
  "qwen/qwen-2.5-coder-32b-instruct": "qwen/qwen2.5-coder-32b-instruct",
  "qwen/qwen3.5-plus-20260420": "qwen/qwen3.5-plus-2026-04-20",
  "tencent/hy3-free": "tencent/hy3:free",
  "upstage/solar-pro4": "upstage/solar-pro-4",
  "z-ai/glm-4.7-flash-free": "z-ai/glm-4.7-flash:free",
};

const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const modelFile = id => path.join(root, "models", ...id.split("/"), "model.json");

for (const [id, name] of Object.entries(correctedNames)) {
  const file = modelFile(id);
  const model = JSON.parse(await readFile(file, "utf8"));
  model.name = name;
  await writeJson(file, model);
}

for (const [id, replacement] of Object.entries(duplicateModels)) {
  const file = modelFile(id);
  const model = JSON.parse(await readFile(file, "utf8"));
  model.status = "Retired";
  model.retirement_date = "2026-09-22T00:00:00Z";
  model.removal_date = "2026-09-22T00:00:00Z";
  model.replacement_model_id = replacement;
  model.page_notice = {
    tone: "info",
    markdown: `This duplicate catalogue ID was retired after an import canonicalization error. Use \`${replacement}\`.`,
  };
  await writeJson(file, model);
}

const routesFile = path.join(root, "api_providers/requesty/models.json");
const routes = JSON.parse(await readFile(routesFile, "utf8"));
let updatedRoutes = 0;
for (const route of routes) {
  const replacement = duplicateModels[route.api_model_id] ?? duplicateModels[route.internal_model_id];
  if (!replacement) continue;
  route.api_model_id = replacement;
  route.internal_model_id = replacement;
  updatedRoutes += 1;
}
await writeJson(routesFile, routes);

console.log(JSON.stringify({
  correctedNames: Object.keys(correctedNames).length,
  retiredDuplicates: Object.keys(duplicateModels).length,
  updatedRoutes,
}));
