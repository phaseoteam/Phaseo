import { parameterIds, type CatalogModel } from "./conformance.js";

export type ProviderCatalog = {
  providerId: string;
  models: Array<CatalogModel & {
    internal_model_id?: string | null;
    provider_api_model_id?: string | null;
  }>;
};

export type CrossProviderDeployment = {
  id: string;
  internalModelId: string;
  apiModelId: string;
  providerApiModelId?: string;
  providerId: string;
  providerModelSlug: string;
  capability: string;
  parameters: string[];
};

export type CrossProviderModelGroup = {
  internalModelId: string;
  providers: string[];
  deployments: CrossProviderDeployment[];
};

export type CrossProviderConformanceMatrix = {
  groups: CrossProviderModelGroup[];
  deployments: CrossProviderDeployment[];
  modelCount: number;
  providerCount: number;
};

function activeCapability(model: CatalogModel, capabilityId: string) {
  return model.capabilities?.find((capability) =>
    capability.capability_id === capabilityId && (!capability.status || capability.status === "active"));
}

export function buildCrossProviderConformanceMatrix(
  catalogs: ProviderCatalog[],
  options: { capability?: string; now?: string | number | Date; minProviders?: number } = {},
): CrossProviderConformanceMatrix {
  const capability = options.capability ?? "text.generate";
  const minProviders = Math.max(1, options.minProviders ?? 2);
  const parsedNow = options.now == null ? Date.now() : new Date(options.now).getTime();
  const now = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const grouped = new Map<string, CrossProviderDeployment[]>();
  const seen = new Set<string>();

  for (const catalog of catalogs) {
    for (const model of catalog.models) {
      if (!model.is_active_gateway) continue;
      if (model.effective_from && Date.parse(model.effective_from) > now) continue;
      if (model.effective_to && Date.parse(model.effective_to) < now) continue;
      const declaredCapability = activeCapability(model, capability);
      if (!declaredCapability) continue;
      const internalModelId = model.internal_model_id || model.api_model_id;
      const dedupeKey = `${internalModelId}|${catalog.providerId}|${model.provider_model_slug}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const deployment: CrossProviderDeployment = {
        id: `${internalModelId}:${catalog.providerId}:${model.provider_model_slug}:${capability}`,
        internalModelId,
        apiModelId: model.api_model_id,
        providerApiModelId: model.provider_api_model_id ?? undefined,
        providerId: catalog.providerId,
        providerModelSlug: model.provider_model_slug,
        capability,
        parameters: parameterIds(declaredCapability.params).sort(),
      };
      const deployments = grouped.get(internalModelId) ?? [];
      deployments.push(deployment);
      grouped.set(internalModelId, deployments);
    }
  }

  const groups = [...grouped.entries()].flatMap(([internalModelId, deployments]) => {
    const providers = [...new Set(deployments.map((deployment) => deployment.providerId))].sort();
    if (providers.length < minProviders) return [];
    return [{
      internalModelId,
      providers,
      deployments: deployments.sort((a, b) => a.id.localeCompare(b.id)),
    }];
  }).sort((a, b) => a.internalModelId.localeCompare(b.internalModelId));
  const deployments = groups.flatMap((group) => group.deployments);

  return {
    groups,
    deployments,
    modelCount: groups.length,
    providerCount: new Set(deployments.map((deployment) => deployment.providerId)).size,
  };
}
