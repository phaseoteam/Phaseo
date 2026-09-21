import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";

export type VerticalRankingChartEntry = {
	key: string;
	label: string;
	value: number;
	valueLabel: React.ReactNode;
	logoId?: string | null;
};

export function VerticalRankingChart({
	entries,
	lowerIsBetter = false,
}: {
	entries: VerticalRankingChartEntry[];
	lowerIsBetter?: boolean;
}) {
	if (!entries.length) return null;
	const best = lowerIsBetter
		? Math.min(...entries.map((entry) => entry.value))
		: Math.max(...entries.map((entry) => entry.value));
	const minimumWidth = Math.max(360, entries.length * 54);

	return (
		<ScrollArea
			className="border-y border-border"
			viewportClassName="pb-3"
			scrollBarOrientation="horizontal"
		>
			<div
				className="grid h-64 items-end gap-2 px-1 pb-2 pt-5"
				style={{
					gridTemplateColumns: `repeat(${entries.length}, minmax(46px, 1fr))`,
					minWidth: `${minimumWidth}px`,
				}}
			>
				{entries.map((entry) => {
					const height = lowerIsBetter
						? (best / entry.value) * 100
						: (entry.value / best) * 100;
					return (
						<div
							key={entry.key}
							className="grid h-full min-w-0 grid-rows-[1.25rem_1fr_1.75rem] gap-1.5"
							aria-label={`${entry.label}: ${entry.value}`}
						>
							<span className="truncate text-center text-[10px] font-medium tabular-nums text-muted-foreground">
								{entry.valueLabel}
							</span>
							<div className="flex min-h-0 items-end justify-center">
								<div className="relative h-full w-7 overflow-hidden rounded-sm bg-muted">
									<div
										className="absolute inset-x-0 bottom-0 rounded-sm bg-primary transition-[height] duration-500 ease-out"
										style={{ height: `${Math.max(2, height)}%` }}
									/>
								</div>
							</div>
							<div className="flex min-w-0 items-center justify-center gap-1">
								{entry.logoId ? (
									<span className="relative size-4 shrink-0">
										<Logo id={entry.logoId} alt="" fill className="object-contain" />
									</span>
								) : null}
								<span className="truncate text-center text-[10px] text-muted-foreground" title={entry.label}>
									{entry.label}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</ScrollArea>
	);
}
