import { queryOptions } from "@tanstack/react-query";
import {
	buildHomeModelPrices,
	HOME_MODEL_ID_LIST,
	type HomeModelPrices,
} from "@/components/landingPage/Home/homeModelIntel";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const homeModelPricesQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "home-model-prices"],
		queryFn: (): Promise<HomeModelPrices> =>
			fetchFrontendGatewayModels({ ids: HOME_MODEL_ID_LIST })
				.then(buildHomeModelPrices)
				.catch((error) => {
					console.warn("[Homepage] failed to load gateway model prices", error);
					return {};
				}),
	});
