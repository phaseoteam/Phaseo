import { queryOptions } from "@tanstack/react-query";
import { loadCompareData, loadComparePairs } from "@/components/(data)/compare/loadCompare";
import type { CompareView, CompareViewUsageByModel } from "@/components/(data)/compare/view/types";

const EMPTY_VIEW: CompareView = { models: [], benchmarks: [] };

/** With nothing selected, the page lists the curated head-to-head pages instead. */
export const compareSelectionQuery = (ids: string[]) =>
	queryOptions({
		queryKey: ["public-catalog", "compare-selection", ...ids],
		queryFn: async () => {
			const [{ view, usage }, pairs] = await Promise.all([
				ids.length ? loadCompareData(ids) : { view: EMPTY_VIEW, usage: {} as CompareViewUsageByModel },
				ids.length ? [] : loadComparePairs(),
			]);
			return { view, usage, pairs };
		},
	});
