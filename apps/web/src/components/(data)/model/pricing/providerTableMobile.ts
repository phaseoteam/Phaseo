import type { ProviderTablePriceColumn } from "@/components/(data)/model/pricing/pricingHelpers";

// Below `sm`, the provider table turns into stacked cards: the provider on its own
// line, then the key numbers in a three-column grid with small labels. Tapping a card
// still opens the provider inspector, which holds the full detail (cache prices too).

/** The table, body and header stop behaving as a table on phones. */
export const MOBILE_TABLE_BLOCK = "max-sm:block";

/** Header row: the sort buttons wrap as a compact row instead of fixed-width columns. */
export const MOBILE_HEAD_ROW =
	"max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1 max-sm:px-3 max-sm:py-1.5";
export const MOBILE_HEAD_CELL = "max-sm:block max-sm:h-auto max-sm:w-auto max-sm:min-w-0 max-sm:p-0";

/** Provider row: one card per provider. */
export const MOBILE_ROW =
	"max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-3 max-sm:py-2.5";
export const MOBILE_NAME_CELL = "max-sm:col-span-3 max-sm:min-w-0 max-sm:p-0";
export const MOBILE_FULL_CELL = "max-sm:col-span-3 max-sm:p-0 max-sm:text-left";

/** A number in the card grid; its label comes from the cell's `data-label`. */
export const MOBILE_STAT_CELL =
	"max-sm:min-w-0 max-sm:p-0 max-sm:text-left max-sm:before:block max-sm:before:text-[11px] max-sm:before:font-normal max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";

/** Separator rows span the full card width. */
export const MOBILE_BLOCK_ROW = "max-sm:block";

/** Cache prices stay in the inspector on phones, to keep each card short. */
export function isMobileHiddenPriceColumn(column: Pick<ProviderTablePriceColumn, "direction">): boolean {
	return column.direction === "cached" || column.direction === "cachewrite";
}

export function getPriceColumnMobileLabel(column: Pick<ProviderTablePriceColumn, "label" | "headerUnitLabel">): string {
	return column.headerUnitLabel ? `${column.label} ${column.headerUnitLabel}` : column.label;
}
