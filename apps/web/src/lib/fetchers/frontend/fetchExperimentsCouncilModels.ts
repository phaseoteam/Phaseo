import { filterModelsForRoom } from "@/lib/chat/rooms";
import { cacheLife, cacheTag } from "next/cache";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchFrontendGatewayModels } from "./fetchFrontendGatewayModels";

export async function fetchExperimentsCouncilModels(): Promise<GatewaySupportedModel[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("gateway-supported-models");
	cacheTag("experiments-council-models");

	const models = await fetchFrontendGatewayModels();
	const textModels = filterModelsForRoom(models, "text").filter(
		(model) => model.isAvailable,
	);

	const byModelId = new Map<string, GatewaySupportedModel>();
	const score = (model: GatewaySupportedModel) =>
		(model.modelName ? 2 : 0) +
		(model.organisationName ? 2 : 0) +
		(model.providerName ? 1 : 0);

	for (const model of textModels) {
		const existing = byModelId.get(model.modelId);
		if (!existing || score(model) > score(existing)) {
			byModelId.set(model.modelId, model);
		}
	}

	const deduped = Array.from(byModelId.values());
	deduped.sort((a, b) => {
		const orgA = a.organisationName ?? a.providerName ?? a.providerId;
		const orgB = b.organisationName ?? b.providerName ?? b.providerId;
		const byOrg = orgA.localeCompare(orgB);
		if (byOrg !== 0) return byOrg;
		const nameA = a.modelName ?? a.modelId;
		const nameB = b.modelName ?? b.modelId;
		return nameA.localeCompare(nameB);
	});
	return deduped;
}

