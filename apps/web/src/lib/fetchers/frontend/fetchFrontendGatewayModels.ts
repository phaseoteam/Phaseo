import { cacheLife, cacheTag } from "next/cache";
import {
	type GatewaySupportedModel,
	getGatewaySupportedModels,
} from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export async function fetchFrontendGatewayModels(): Promise<GatewaySupportedModel[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("gateway-supported-models");
	cacheTag("frontend:gateway-models");

	return getGatewaySupportedModels(false, { availableOnly: true });
}
