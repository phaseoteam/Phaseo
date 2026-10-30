import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchPublicWebApi } from "@/lib/web-api/client";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

function withProviderDisplayName(model: GatewaySupportedModel): GatewaySupportedModel {
	return { ...model, providerName: resolveProviderDisplayName({ providerId: model.providerId, providerName: model.providerName || model.providerId, offerLabel: model.providerOfferLabel, offerScope: model.providerOfferScope }) };
}

/** `ids` limits the catalogue to those `modelId`s, for pages that show a few models. */
export async function fetchFrontendGatewayModels({ ids, ...options }: { credentials?: RequestCredentials; ids?: readonly string[] } = {}): Promise<GatewaySupportedModel[]> {
	const filter = ids ? `&ids=${encodeURIComponent([...new Set(ids)].sort().join(","))}` : "";
	return (await fetchPublicWebApi<{ models: GatewaySupportedModel[] }>(
		`/api/_web/gateway/models?available_only=true${filter}`,
		options,
	)).models.map(withProviderDisplayName);
}

export async function fetchFrontendGatewayModelAliases(
	baseModels?: GatewaySupportedModel[],
): Promise<GatewaySupportedModel[]> {
	void baseModels;
	return (await fetchPublicWebApi<{ aliases: GatewaySupportedModel[] }>(
		"/api/_web/gateway/model-aliases",
	)).aliases.map(withProviderDisplayName);
}
