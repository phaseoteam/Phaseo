import { cacheLife, cacheTag } from "next/cache";
import {
	type GatewaySupportedModel,
	getGatewaySupportedModels,
} from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";

function isProductionBuild() {
	return process.env.NEXT_PHASE === "phase-production-build";
}

export async function fetchFrontendGatewayModels(): Promise<GatewaySupportedModel[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("gateway-supported-models");
	cacheTag("frontend:gateway-models");

	try {
		const models = await fetchFrontendModels();
		return models
			.flatMap((model) => model.gateway_supported_models ?? [])
			.filter((model) => model.isAvailable);
	} catch (error) {
		if (!isProductionBuild()) throw error;
		const models = await getGatewaySupportedModels(false);
		return models.filter((model) => model.isAvailable);
	}
}
