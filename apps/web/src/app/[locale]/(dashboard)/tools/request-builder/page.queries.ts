import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const requestBuilderModelsQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "gateway-models", "request-builder"],
		queryFn: () => fetchFrontendGatewayModels(),
	});
