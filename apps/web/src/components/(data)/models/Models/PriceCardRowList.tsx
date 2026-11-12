import type { DescribedPriceCardRow } from "./priceCardRows";

/**
 * The price card's two-column list: the label (with an optional muted note
 * under it) on the left, the price on the right. Prices never wrap.
 */
export function PriceCardRowList({ rows }: { rows: ReadonlyArray<DescribedPriceCardRow> }) {
	if (rows.length === 0) return null;
	return (
		<dl
			data-slot="price-card-rows"
			className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5 text-xs"
		>
			{rows.map((row) => (
				<div key={row.key} className="contents">
					<dt className="min-w-0 text-muted-foreground">
						<span className="block">{row.label}</span>
						{row.note ? (
							<span className="block text-[11px] leading-snug text-muted-foreground/80">{row.note}</span>
						) : null}
					</dt>
					<dd className="whitespace-nowrap text-right font-medium tabular-nums text-foreground">
						{row.value}
					</dd>
				</div>
			))}
		</dl>
	);
}
