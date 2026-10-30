import { Logo } from "@/components/Logo";

export type HorizontalRankingChartEntry = {
	key: string;
	label: string;
	value: number;
	valueLabel: React.ReactNode;
	logoId?: string | null;
};

export function HorizontalRankingChart({
	entries,
	lowerIsBetter = false,
}: {
	entries: HorizontalRankingChartEntry[];
	lowerIsBetter?: boolean;
}) {
	if (!entries.length) return null;
	const bestValue = lowerIsBetter
		? Math.min(...entries.map((entry) => entry.value))
		: Math.max(...entries.map((entry) => entry.value));

	return (
		<div className="space-y-2 border-y border-border/70 py-4">
			{entries.map((entry) => {
				const relativeValue = lowerIsBetter
					? bestValue / Math.max(entry.value, Number.EPSILON)
					: entry.value / Math.max(bestValue, Number.EPSILON);
				const width = `${Math.max(2, Math.min(100, relativeValue * 100))}%`;

				return (
					<div
						key={entry.key}
						className="grid grid-cols-[minmax(7rem,11rem)_minmax(5rem,1fr)_4.75rem] items-center gap-3 sm:grid-cols-[minmax(10rem,15rem)_minmax(6rem,1fr)_5.25rem]"
						aria-label={`${entry.label}: ${entry.value}`}
					>
						<div className="flex min-w-0 items-center gap-2">
							{entry.logoId ? (
								<span className="relative size-4 shrink-0">
									<Logo id={entry.logoId} alt="" fill className="object-contain" />
								</span>
							) : null}
							<span className="truncate text-xs text-muted-foreground" title={entry.label}>
								{entry.label}
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
							<div className="h-full rounded-sm bg-primary" style={{ width }} />
						</div>
						<span className="text-right text-xs font-medium tabular-nums">{entry.valueLabel}</span>
					</div>
				);
			})}
		</div>
	);
}
