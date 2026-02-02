import {
    getGatewaySupportedModels,
    type GatewaySupportedModel,
} from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export async function fetchFrontendGatewayModels(): Promise<GatewaySupportedModel[]> {
    return getGatewaySupportedModels(false);
}
