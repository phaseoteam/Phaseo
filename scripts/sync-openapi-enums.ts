import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = path.join(__dirname, "..");
const OPENAPI_PATH = path.join(ROOT, "apps", "docs", "openapi", "v1", "openapi.yaml");
const SNAPSHOT_PATH = path.join(ROOT, "packages/data/catalog/generated/database-v2/enum-catalog.json");
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as { models: string[]; callableModels: string[]; organisations: string[]; benchmarks: string[] };
const VIRTUAL_CALLABLE_MODEL_IDS = ["phaseo/auto", "phaseo/free"];
// Preserve released SDK helper IDs after their last gateway route expires.
// Runtime model IDs remain open strings; this snapshot must not break patch releases.
const LEGACY_CALLABLE_MODEL_IDS = [
  "ai21/jamba-1.5-large",
  "ai21/jamba-1.5-mini",
  "anthropic/claude-3.5-haiku",
  "bytedance/seed-1.6",
  "bytedance/seed-1.6-250915",
  "bytedance/seed-1.6-flash",
  "bytedance/seed-1.6-flash-250715",
  "bytedance/seed-2.0-lite-260428",
  "bytedance/seed-2.0-mini-260428",
  "bytedance/seedance-2.0-fast",
  "bytedance/seedance-2.0-mini-260615",
  "bytedance/ui-tars-1.5-7b",
  "cohere/command-r7b",
  "deepseek/deepseek-r1-0528",
  "deepseek/deepseek-v3-0324",
  "deepseek/deepseek-v4.1-flash-preview",
  "google/gemma-3-27b-it",
  "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b-it",
  "ibm/granite-4.1-8b",
  "jetbrains/mellum2-12b-a2.5b",
  "ltx-2-3-fast",
  "ltx-2-3-pro",
  "ltx-2-5-fast",
  "ltx-2-5-pro",
  "meta/llama-3.3-70b-instruct",
  "minimax/h3",
  "minimax/m2-her",
  "minimax/minimax-m2.5-highspeed",
  "minimax/music-3.0",
  "minimax/speech-2.8-hd",
  "minimax/speech-2.8-turbo",
  "mistral/devstral-2",
  "mistral/ministral-3-14b",
  "mistral/ministral-3-3b",
  "mistral/ministral-3-8b",
  "mistral/mistral-large-3",
  "mistral/mistral-small-3.2-24b-instruct",
  "moonshotai/kimi-k2-0905",
  "moonshotai/kimi-k2.7-code-highspeed",
  "moonshotai/kimi-k3-fast",
  "nex-agi/deepseek-v3.1-nex-n1",
  "nousresearch/hermes-3-llama-3.1-70b",
  "nousresearch/hermes-4-405b",
  "nvidia/nvidia-nemotron-3-nano-30b-a3b",
  "nvidia/nvidia-nemotron-nano-12b-v2-vl",
  "openai/gpt-3.5-turbo-16k",
  "openai/gpt-3.5-turbo-2023-03-21",
  "openai/gpt-4-2023-06-13",
  "openai/gpt-4o-2024-11-20",
  "openai/gpt-realtime",
  "openai/gpt-transcribe",
  "qwen/qvq-max",
  "qwen/qwen-image-edit-2025-10-30",
  "qwen/qwen-image-edit-2025-12-15",
  "qwen/qwen2.5-14b-1m",
  "qwen/qwen2.5-7b-1m",
  "qwen/qwen2.5-coder-7b",
  "qwen/qwen2.5-vl-32b-instruct",
  "qwen/qwen2.5-vl-72b-instruct",
  "qwen/qwen3-235b-a22b-instruct-2507",
  "qwen/qwen3-coder-flash",
  "qwen/qwen3-coder-plus-2025-07-22",
  "qwen/qwen3-coder-plus-2025-09-23",
  "qwen/qwen3-reranker",
  "qwen/wan2.7-t2v",
  "reka-edge",
  "reka-edge-2603",
  "reka-flash",
  "reka-flash-research",
  "spacex-ai/grok-4.20-multi-agent-beta-0309",
  "thedrummer/cydonia-24b-v4.1",
  "thedrummer/skyfall-36b-v2",
  "x-ai/grok-voice-think-fast-2.0",
  "zai-org/glm-4.5-air",
  "zai/glm-5"
];

function readYaml(file: string): any {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

function uniqSorted(list: string[]): string[] {
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}

function loadModelIds(): string[] { return uniqSorted(snapshot.models); }
function loadCallableModelIds(): string[] { return uniqSorted([...snapshot.callableModels, ...VIRTUAL_CALLABLE_MODEL_IDS, ...LEGACY_CALLABLE_MODEL_IDS]); }
function loadOrganisationIds(): string[] { return uniqSorted(snapshot.organisations); }
function loadBenchmarkIds(): string[] { return uniqSorted(snapshot.benchmarks); }

function applyOrganisationSchema(target: any) {
  if (!target) return;
  const description = target.description;
  target.oneOf = [{ $ref: "#/components/schemas/OrganisationId" }, { type: "null" }];
  delete target.type;
  delete target.enum;
  delete target.nullable;
  if (description) target.description = description;
}

function main() {
  const modelIds = loadModelIds();
  const callableModelIds = loadCallableModelIds();
  const organisationIds = loadOrganisationIds();
  const benchmarkIds = loadBenchmarkIds();

  const openapi = readYaml(OPENAPI_PATH);
  const schemas = openapi.components?.schemas;
  if (!schemas) {
    throw new Error("Schemas not found in OpenAPI document");
  }

  schemas.ModelId = {
    type: "string",
    description:
      "Model identifier. This is a runtime string so newly released models can be used without waiting for an SDK update.",
    example: callableModelIds[0] ?? "openai/gpt-5",
  };

  schemas.KnownModelId = {
    type: "string",
    description:
      "Known callable model identifier snapshot used for SDK helper constants and autocomplete.",
    enum: callableModelIds,
  };

  schemas.OrganisationId = { type: "string", description: "Organisation identifier.", enum: organisationIds };
  applyOrganisationSchema(schemas.GatewayModel?.properties?.organisation);
  applyOrganisationSchema(schemas.GatewayOrganisation?.properties?.organisation_id);

  schemas.BenchmarkId = { type: "string", description: "Benchmark identifier.", enum: benchmarkIds };

  for (const [, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "delete", "patch", "options", "head"]) {
      const op: any = (pathItem as any)?.[method];
      if (!op?.parameters) continue;
      for (const param of op.parameters) {
        if (param?.name === "model" && param.schema) {
          param.schema = { $ref: "#/components/schemas/ModelId" };
        }
        if (param?.name === "organisation" && param.schema) {
          const desc = param.description;
          param.schema = {
            oneOf: [
              { $ref: "#/components/schemas/OrganisationId" },
              { type: "array", items: { $ref: "#/components/schemas/OrganisationId" } },
            ],
          };
          if (desc) param.description = desc;
        }
      }
    }
  }

  fs.writeFileSync(OPENAPI_PATH, yaml.dump(openapi, { indent: 2 }), "utf8");
  console.log(
    `Synced schemas -> catalog models: ${modelIds.length}, callable helper models: ${callableModelIds.length}, organisations: ${organisationIds.length}, benchmarks: ${benchmarkIds.length}`
  );
}

main();
