import {
	compareTokenTiers,
	fmtUSD,
	tokenRangeFromConditions,
	type TokenTier,
} from "./pricingHelpers";

type CacheWriteGroup = {
	meter: string;
	duration: number;
	unit: "minute" | "hour";
	tiers: TokenTier[];
};

export function groupCacheWriteTiers(tiers: TokenTier[]): CacheWriteGroup[] | null {
	if (!tiers.length) return null;
	const groups = new Map<string, CacheWriteGroup>();
	for (const tier of tiers) {
		const match = tier.meter?.match(/^cached_write_text_tokens_(5m|1h|30m|12h)$/);
		if (!match || !tier.meter) return null;
		const duration = Number.parseInt(match[1], 10);
		const unit = match[1].endsWith("h") ? "hour" : "minute";
		const group: CacheWriteGroup = groups.get(tier.meter) ?? { meter: tier.meter, duration, unit, tiers: [] };
		group.tiers.push(tier);
		groups.set(tier.meter, group);
	}
	return [...groups.values()]
		.sort((a, b) => a.duration * (a.unit === "hour" ? 60 : 1) - b.duration * (b.unit === "hour" ? 60 : 1))
		.map((group) => ({ ...group, tiers: [...group.tiers].sort(compareTokenTiers) }));
}

export function CacheWritePricing({
	label,
	groups,
	unitLabel,
	valueClassName,
	freeLabel,
	locale,
	localizeLabel,
}: {
	label: string;
	groups: CacheWriteGroup[];
	unitLabel?: string;
	valueClassName?: string;
	freeLabel: string;
	locale: string;
	localizeLabel: (value: string | null | undefined) => string;
}) {
	return (
		<section className="@container space-y-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-800" aria-label={localizeLabel(label)}>
			<div className="flex items-baseline justify-between gap-3">
				<h4 className="text-xs font-semibold text-foreground">{localizeLabel(label)}</h4>
				<span className="text-[10px] text-muted-foreground">{localizeLabel(unitLabel)}</span>
			</div>
			<div className="grid grid-cols-1 gap-4 @min-[420px]:grid-cols-2 @min-[420px]:gap-5">
				{groups.map((group, index) => (
					<div key={group.meter} className={index > 0 ? "min-w-0 border-t border-zinc-200/80 pt-4 @min-[420px]:border-l @min-[420px]:border-t-0 @min-[420px]:pl-5 @min-[420px]:pt-0 dark:border-zinc-800" : "min-w-0"}>
						<h5 className="mb-3 text-xs font-semibold text-foreground">
							{new Intl.NumberFormat(locale, { style: "unit", unit: group.unit, unitDisplay: "long" }).format(group.duration)}
						</h5>
						<dl className="space-y-2">
							{group.tiers.map((tier, tierIndex) => {
								const range = tokenRangeFromConditions(tier.conditions);
								const hasComparison = tier.basePer1M != null && Number.isFinite(tier.basePer1M) && Math.abs(tier.basePer1M - tier.per1M) > 1e-9;
								return (
									<div key={tier.ruleId ?? tierIndex} className="flex items-baseline justify-between gap-3">
										<dt className={range ? "min-w-0 text-[11px] text-muted-foreground" : "sr-only"}>
											{localizeLabel(range ? `${range} input tokens` : "All usage")}
										</dt>
										<dd className="flex shrink-0 flex-wrap justify-end gap-x-1.5 text-xs tabular-nums">
											{hasComparison ? <s className="text-muted-foreground">{fmtUSD(tier.basePer1M!)}</s> : null}
											<span className={`font-semibold ${valueClassName ?? "text-foreground"}`}>{tier.per1M === 0 ? freeLabel : fmtUSD(tier.per1M)}</span>
										</dd>
									</div>
								);
							})}
						</dl>
					</div>
				))}
			</div>
		</section>
	);
}
