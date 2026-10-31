import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const modelTestPlaygroundModelsQuery = () =>
	queryOptions({
		queryKey: ["internal", "model-test-playground", "gateway-models"],
		queryFn: () => fetchFrontendGatewayModels(),
	});
