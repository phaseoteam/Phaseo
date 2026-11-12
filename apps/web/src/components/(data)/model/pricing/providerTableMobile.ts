import type { ProviderTablePriceColumn } from "@/components/(data)/model/pricing/pricingHelpers";

// Below `sm`, the provider table turns into stacked cards: the provider on its own
// line, then the key numbers in a three-column grid with small labels. Tapping a card
// still opens the provider inspector, which holds the full detail (cache prices too).
// The column headers are hidden on phones; each number carries its own label.

/** The table and body stop behaving as a table on phones. */
export const MOBILE_TABLE_BLOCK = "max-sm:block";

/** Provider row: one card per provider. */
export const MOBILE_ROW =
	"max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-3 max-sm:py-2.5";
export const MOBILE_NAME_CELL = "max-sm:col-span-3 max-sm:min-w-0 max-sm:p-0";
export const MOBILE_FULL_CELL = "max-sm:col-span-3 max-sm:p-0 max-sm:text-left";

/** A number in the card grid; its label comes from the cell's `data-label`. */
export const MOBILE_STAT_CELL =
	"max-sm:min-w-0 max-sm:p-0 max-sm:text-left max-sm:before:block max-sm:before:whitespace-normal max-sm:before:text-[11px] max-sm:before:font-normal max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";

/** Latency, Throughput and Uptime always start their own row under the prices. */
export const MOBILE_PERF_ROW_START = "max-sm:col-start-1";

/** Separator rows span the full card width. */
export const MOBILE_BLOCK_ROW = "max-sm:block";

export const MOBILE_MAX_PRICE_COLUMNS = 3;

const MEDIA_MODALITIES = new Set(["image", "video", "audio"]);

/**
 * Phones show at most three prices per card, in this order, so prices fill one row.
 * Text models get Input, Output and Cache read. Image, video and audio generation
 * models lead with their main output price (the first non-text output), then input,
 * so a video model shows its per-video price before any text prices. Spare slots
 * take the next prices, with cache writes last. Everything else stays in the inspector.
 */
export function getMobilePriceColumnKeys(
	columns: ReadonlyArray<Pick<ProviderTablePriceColumn, "key" | "direction" | "modality">>,
): string[] {
	const firstOf = (direction: ProviderTablePriceColumn["direction"]) =>
		columns.find((column) => column.direction === direction);
	const mediaOutput = columns.find(
		(column) => column.direction === "output" && MEDIA_MODALITIES.has(column.modality),
	);
	const preferred = mediaOutput
		? [mediaOutput, firstOf("input"), firstOf("output"), firstOf("cached")]
		: [firstOf("input"), firstOf("output"), firstOf("cached")];
	const picked: string[] = [];
	for (const column of [
		...preferred,
		...columns.filter((column) => column.direction !== "cachewrite"),
		...columns.filter((column) => column.direction === "cachewrite"),
	]) {
		if (picked.length >= MOBILE_MAX_PRICE_COLUMNS) break;
		if (column && !picked.includes(column.key)) picked.push(column.key);
	}
	return picked;
}

/** Card order for a price on phones; hidden when it isn't one of the picked prices. */
export function getMobilePriceCellClass(mobileKeys: readonly string[], columnKey: string): string {
	const index = mobileKeys.indexOf(columnKey);
	if (index < 0) return "max-sm:hidden";
	return ["max-sm:order-1", "max-sm:order-2", "max-sm:order-3"][index] ?? "";
}

/** Latency, Throughput and Uptime sit after the prices on phones. */
export const MOBILE_PERF_ORDER = "max-sm:order-4";

export function getPriceColumnMobileLabel(column: Pick<ProviderTablePriceColumn, "label" | "headerUnitLabel">): string {
	return column.headerUnitLabel ? `${column.label} ${column.headerUnitLabel}` : column.label;
}
