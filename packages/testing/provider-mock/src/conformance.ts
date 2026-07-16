export type CatalogParameter = string | {
  param_id?: string;
  provider_min?: number | null;
  provider_max?: number | null;
  provider_default?: unknown;
  values?: unknown[];
  [key: string]: unknown;
};

export type CatalogCapability = {
  capability_id: string;
  status?: string;
  params?: CatalogParameter[] | Record<string, unknown>;
};

export type CatalogModel = {
  api_model_id: string;
  provider_model_slug: string;
  is_active_gateway?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  capabilities?: CatalogCapability[];
};

export type ParameterExpectation = {
  outcome: "forwarded" | "transformed" | "dropped" | "rejected";
  requestValue: unknown;
  upstreamPaths?: string[];
  note?: string;
};

export type ModelConformanceCase = {
  id: string;
  modelId: string;
  providerModelSlug: string;
  capability: string;
  kind: "baseline" | "parameter";
  parameter?: string;
  requestValue?: unknown;
  expected?: ParameterExpectation;
};

export type ConformanceMatrix = {
  cases: ModelConformanceCase[];
  uncoveredParameters: string[];
  activeModels: number;
  capabilities: string[];
};

function isEffective(model: CatalogModel, now: number): boolean {
  if (!model.is_active_gateway) return false;
  if (model.effective_from && Date.parse(model.effective_from) > now) return false;
  if (model.effective_to && Date.parse(model.effective_to) < now) return false;
  return true;
}

export function parameterIds(params: CatalogCapability["params"]): string[] {
  if (!params) return [];
  if (!Array.isArray(params)) return Object.keys(params);
  return params.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    return typeof entry.param_id === "string" && entry.param_id ? [entry.param_id] : [];
  });
}

export function buildModelConformanceMatrix(
  models: CatalogModel[],
  expectations: Record<string, ParameterExpectation>,
  options: { now?: string | number | Date; capabilities?: string[] } = {},
): ConformanceMatrix {
  const parsedNow = options.now == null ? Date.now() : new Date(options.now).getTime();
  const now = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const selectedCapabilities = options.capabilities ? new Set(options.capabilities) : null;
  const active = models.filter((model) => isEffective(model, now));
  const cases: ModelConformanceCase[] = [];
  const uncovered = new Set<string>();
  const capabilities = new Set<string>();

  for (const model of active) {
    for (const capability of model.capabilities ?? []) {
      if (capability.status && capability.status !== "active") continue;
      if (selectedCapabilities && !selectedCapabilities.has(capability.capability_id)) continue;
      capabilities.add(capability.capability_id);
      const prefix = `${model.api_model_id}:${capability.capability_id}`;
      cases.push({
        id: `${prefix}:baseline`,
        modelId: model.api_model_id,
        providerModelSlug: model.provider_model_slug,
        capability: capability.capability_id,
        kind: "baseline",
      });
      for (const parameter of parameterIds(capability.params)) {
        const expected = expectations[parameter];
        if (!expected) uncovered.add(parameter);
        cases.push({
          id: `${prefix}:param:${parameter}`,
          modelId: model.api_model_id,
          providerModelSlug: model.provider_model_slug,
          capability: capability.capability_id,
          kind: "parameter",
          parameter,
          requestValue: expected?.requestValue,
          expected,
        });
      }
    }
  }

  return {
    cases,
    uncoveredParameters: [...uncovered].sort(),
    activeModels: active.length,
    capabilities: [...capabilities].sort(),
  };
}

export function assertConformanceExpectations(matrix: ConformanceMatrix): void {
  if (matrix.uncoveredParameters.length) {
    throw new Error(`missing parameter expectations: ${matrix.uncoveredParameters.join(", ")}`);
  }
}
