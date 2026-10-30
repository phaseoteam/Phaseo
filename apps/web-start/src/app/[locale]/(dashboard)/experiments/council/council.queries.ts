import { queryOptions } from "@tanstack/react-query";
import { fetchExperimentsCouncilModels } from "@/lib/fetchers/frontend/fetchExperimentsCouncilModels";

export const experimentsCouncilModelsQuery = () =>
	queryOptions({
		queryKey: ["experiments", "council", "models"],
		queryFn: () => fetchExperimentsCouncilModels(),
	});
