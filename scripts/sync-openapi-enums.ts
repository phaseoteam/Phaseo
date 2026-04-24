import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = path.join(__dirname, "..");
const OPENAPI_PATH = path.join(ROOT, "apps", "docs", "openapi", "v1", "openapi.yaml");
const DATA_ROOT = path.join(ROOT, "packages", "data", "catalog", "src", "data");
const MANIFEST_PATH = path.join(DATA_ROOT, "manifest.json");
const BENCHMARKS_DIR = path.join(DATA_ROOT, "benchmarks");
const API_PROVIDERS_DIR = path.join(DATA_ROOT, "api_providers");

function readYaml(file: string): any {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function uniqSorted(list: string[]): string[] {
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}

function loadModelIds(): string[] {
  const manifest = readJson(MANIFEST_PATH);
  const models = manifest.models ?? {};
  const modelIds = Object.values(models).flat().filter(Boolean) as string[];
  return uniqSorted(modelIds);
}

function withinEffectiveWindow(
  effectiveFrom: unknown,
  effectiveTo: unknown,
  now: Date
): boolean {
  const from =
    typeof effectiveFrom === "string" && effectiveFrom.trim()
      ? new Date(effectiveFrom)
      : null;
  const to =
    typeof effectiveTo === "string" && effectiveTo.trim()
      ? new Date(effectiveTo)
      : null;
  if (from && Number.isFinite(from.getTime()) && now < from) return false;
  if (to && Number.isFinite(to.getTime()) && now >= to) return false;
  return true;
}

function loadCallableModelIds(): string[] {
  if (!fs.existsSync(API_PROVIDERS_DIR)) return [];
  const now = new Date();
  const modelIds = new Set<string>();

  for (const entry of fs.readdirSync(API_PROVIDERS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(API_PROVIDERS_DIR, entry.name, "models.json");
    if (!fs.existsSync(file)) continue;

    const items = readJson(file);
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (item.is_active_gateway !== true) continue;
      if (!withinEffectiveWindow(item.effective_from, item.effective_to, now)) continue;

      const modelId =
        typeof item.api_model_id === "string" && item.api_model_id.trim()
          ? item.api_model_id.trim()
          : typeof item.internal_model_id === "string" && item.internal_model_id.trim()
            ? item.internal_model_id.trim()
            : null;

      if (modelId) modelIds.add(modelId);
    }
  }

  return uniqSorted(Array.from(modelIds));
}

function loadOrganisationIds(): string[] {
  const manifest = readJson(MANIFEST_PATH);
  const organisations = manifest.organisations ?? [];
  return uniqSorted(organisations as string[]);
}

function loadBenchmarkIds(): string[] {
  if (!fs.existsSync(BENCHMARKS_DIR)) return [];
  const entries = fs.readdirSync(BENCHMARKS_DIR, { withFileTypes: true });
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(BENCHMARKS_DIR, entry.name, "benchmark.json");
    if (!fs.existsSync(file)) continue;
    try {
      const data = readJson(file);
      if (data?.benchmark_id) ids.push(String(data.benchmark_id));
    } catch (err: any) {
      console.warn(`Skipping benchmark ${entry.name}: ${err.message}`);
    }
  }
  return uniqSorted(ids);
}

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
