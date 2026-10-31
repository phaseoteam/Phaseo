// Public catalogue queries shared by the Chat rooms. These fetchers call the
// public web API, so they run during SSR and in the browser alike.
import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { fetchExperimentsCouncilModels } from "@/lib/fetchers/frontend/fetchExperimentsCouncilModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export const chatGatewayModelsQuery = () =>
	queryOptions({
		queryKey: ["chat", "gateway-models"],
		queryFn: () => fetchFrontendGatewayModels(),
	});

/** Same catalogue, but a failed load resolves to `{ models: [], failed: true }` instead of throwing. */
export const chatGatewayModelsOrFailureQuery = () =>
	queryOptions({
		queryKey: ["chat", "gateway-models", "or-failure"],
		queryFn: async (): Promise<{ models: GatewaySupportedModel[]; failed: boolean }> => {
			try {
				return { models: await fetchFrontendGatewayModels(), failed: false };
			} catch {
				return { models: [], failed: true };
			}
		},
	});

export const chatCouncilModelsQuery = () =>
	queryOptions({
		queryKey: ["chat", "council-models"],
		queryFn: () => fetchExperimentsCouncilModels(),
	});
