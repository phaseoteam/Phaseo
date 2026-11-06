import { queryOptions } from "@tanstack/react-query";
import { sortPair } from "@/components/(data)/compare/comparePairs";
import { loadComparePairData } from "@/components/(data)/compare/loadCompare";

export const comparePairDataQuery = (ids: [string, string]) => {
	const sorted = sortPair(ids);
	return queryOptions({
		queryKey: ["public-catalog", "compare-pair", ...sorted],
		queryFn: () => loadComparePairData(sorted),
	});
};

/** A pair page exists when both models resolve, in either URL order. */
export function comparePairExists(ids: [string, string], data: Awaited<ReturnType<typeof loadComparePairData>>): boolean {
	if (data.view.models.length !== 2) return false;
	return ids.every((id) => data.view.models.some((model) => model.id === id));
}
