import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchPublicWebApi } from "@/lib/web-api/client";

export async function fetchFrontendGatewayModels(): Promise<GatewaySupportedModel[]> {
	return (await fetchPublicWebApi<{ models: GatewaySupportedModel[] }>(
		"/api/_web/gateway/models?available_only=true",
	)).models;
}

export async function fetchFrontendGatewayModelAliases(
	baseModels?: GatewaySupportedModel[],
): Promise<GatewaySupportedModel[]> {
	void baseModels;
	return (await fetchPublicWebApi<{ aliases: GatewaySupportedModel[] }>(
		"/api/_web/gateway/model-aliases",
	)).aliases;
}
