// Bordered grid with shared dividers, used wherever model cards are listed.
// Borders are set per column count so row-end cards never get a stray right
// edge. One column uses divide-y. Two and three columns each get their own
// range, so their rules never compete: cards not starting a row get a left
// border, and cards after the first row get a top border.
export const MODEL_CARD_GRID_CLASS_NAME = [
	"grid grid-cols-1 divide-y divide-border/70 overflow-hidden rounded-md border border-border/70 [&>*]:border-border/70",
	"sm:grid-cols-2 sm:divide-y-0 sm:max-2xl:[&>*:nth-child(even)]:border-l sm:max-2xl:[&>*:nth-child(n+3)]:border-t",
	"2xl:grid-cols-3 2xl:[&>*]:border-l 2xl:[&>*:nth-child(3n+1)]:border-l-0 2xl:[&>*:nth-child(n+4)]:border-t",
].join(" ");
