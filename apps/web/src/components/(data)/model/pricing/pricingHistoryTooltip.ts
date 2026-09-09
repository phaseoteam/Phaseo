export const PRICING_HISTORY_TOOLTIP_EDGE_COUNT = 6;

export function orderPricingHistoryTooltipItems<T>(
	items: readonly T[],
	seriesKeys: readonly string[],
	getSeriesKey: (item: T) => string,
) {
	const seriesOrder = new Map(seriesKeys.map((key, index) => [key, index]));

	return items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => {
			const orderDifference =
				(seriesOrder.get(getSeriesKey(a.item)) ?? Number.MAX_SAFE_INTEGER) -
				(seriesOrder.get(getSeriesKey(b.item)) ?? Number.MAX_SAFE_INTEGER);
			return orderDifference || a.index - b.index;
		})
		.map(({ item }) => item);
}

export function selectPricingHistoryTooltipItems<T>(items: readonly T[]) {
	const maxVisibleItems = PRICING_HISTORY_TOOLTIP_EDGE_COUNT * 2;

	if (items.length <= maxVisibleItems) {
		return { items: [...items], hiddenCount: 0 };
	}

	return {
		items: [
			...items.slice(0, PRICING_HISTORY_TOOLTIP_EDGE_COUNT),
			...items.slice(-PRICING_HISTORY_TOOLTIP_EDGE_COUNT),
		],
		hiddenCount: items.length - maxVisibleItems,
	};
}
