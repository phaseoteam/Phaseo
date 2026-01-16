"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
	EventType,
	ModelEvent,
} from "@/lib/fetchers/updates/getModelUpdates";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const STACKED_TYPES: EventType[] = [
	"Announced",
	"Released",
	"Deprecated",
	"Retired",
];

const TYPE_COLORS: Record<EventType, string> = {
	Announced: "bg-sky-500",
	Released: "bg-emerald-500",
	Deprecated: "bg-red-500",
	Retired: "bg-zinc-500",
};

function padTwo(value: number) {
	return `${value}`.padStart(2, "0");
}

type ChartEntry = {
	key: string;
	label: string;
	counts: Record<EventType, number>;
	total: number;
	modelList: Record<EventType, { names: string[]; total: number }>;
};

type ModelCalendarChartProps = {
	events: ModelEvent[];
	monthsWindow?: number;
};

export default function ModelCalendarChart({
	events,
	monthsWindow = 12,
}: ModelCalendarChartProps) {
	const now = useMemo(() => new Date(), []);

	const chartData = useMemo<ChartEntry[]>(() => {
		const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
		windowStart.setMonth(windowStart.getMonth() - (monthsWindow - 1));

		const months = Array.from({ length: monthsWindow }, (_, index) => {
			const monthDate = new Date(windowStart);
			monthDate.setMonth(windowStart.getMonth() + index);
			const key = `${monthDate.getFullYear()}-${padTwo(
				monthDate.getMonth() + 1
			)}`;
			return {
				key,
				label: monthDate.toLocaleString("en-US", {
					month: "short",
					year: "numeric",
				}),
				counts: {
					Announced: 0,
					Released: 0,
					Deprecated: 0,
					Retired: 0,
				} satisfies Record<EventType, number>,
				models: {
					Announced: new Set<string>(),
					Released: new Set<string>(),
					Deprecated: new Set<string>(),
					Retired: new Set<string>(),
				} satisfies Record<EventType, Set<string>>,
			};
		});

		const byKey = new Map(months.map((entry) => [entry.key, entry]));

		for (const event of events) {
			const parsed = new Date(event.date);
			if (Number.isNaN(parsed.getTime())) continue;
			const key = `${parsed.getFullYear()}-${padTwo(
				parsed.getMonth() + 1
			)}`;
			const entry = byKey.get(key);
			if (!entry) continue;
			const type = (event.types[0] ?? "Announced") as EventType;
			entry.counts[type] = (entry.counts[type] ?? 0) + 1;
			const name =
				event.model.name?.trim() ||
				event.model.model_id ||
				"Unknown model";
			entry.models[type].add(name);
		}

		return months.map((entry) => ({
			...entry,
			total: STACKED_TYPES.reduce(
				(sum, type) => sum + (entry.counts[type] ?? 0),
				0
			),
			modelList: Object.fromEntries(
				STACKED_TYPES.map((type) => {
					const allModels = Array.from(entry.models[type]);
					return [
						type,
						{
							names: allModels.slice(0, 6),
							total: allModels.length,
						},
					];
				})
			) as Record<EventType, { names: string[]; total: number }>,
		}));
	}, [events, now, monthsWindow]);

	return (
		<section className="space-y-4 py-6">
			<div className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
						Model event cadence (last 12 months)
					</h2>
					<span className="text-xs text-zinc-500 dark:text-zinc-400">
						Rolling 12 mo.
					</span>
				</div>
				<div className="flex flex-wrap gap-3 pb-3 pt-4">
					{STACKED_TYPES.map((type) => (
						<div
							key={type}
							className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400"
						>
							<span
								className={cn(
									"h-2 w-2 rounded-full",
									TYPE_COLORS[type]
								)}
								aria-hidden="true"
							/>
							{type}
						</div>
					))}
				</div>
				<div className="space-y-2">
					{chartData.map((entry) => (
						<div
							key={entry.key}
							className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400"
						>
							<span className="w-[70px] font-semibold text-zinc-700 dark:text-zinc-200">
								{entry.label}
							</span>
							<div className="flex-1 overflow-hidden rounded-full bg-white/80 dark:bg-zinc-900/80">
								<div className="flex h-4">
									{STACKED_TYPES.map((type) => {
										const count = entry.counts[type] ?? 0;
										if (count === 0) return null;
										const width =
											entry.total === 0
												? 0
												: (count / entry.total) * 100;
										const modelsInfo =
											entry.modelList[type];
										const remaining =
											modelsInfo.total -
											modelsInfo.names.length;
										const tooltipText =
											modelsInfo.names.length > 0
												? `${modelsInfo.names.join(
														", "
												  )}${
														remaining > 0
															? ` +${remaining} more`
															: ""
												  }`
												: "No models recorded yet";

										return (
											<Tooltip
												key={`${entry.key}-${type}`}
											>
												<TooltipTrigger asChild>
													<span
														className={cn(
															"h-full",
															TYPE_COLORS[type]
														)}
														style={{
															width: `${width}%`,
														}}
														aria-label={`${type}: ${count}`}
													/>
												</TooltipTrigger>
												<TooltipContent side="top">
													<p className="font-semibold">
														{type} ({count})
													</p>
													<p className="text-[11px] text-zinc-300 dark:text-zinc-400">
														{tooltipText}
													</p>
												</TooltipContent>
											</Tooltip>
										);
									})}
								</div>
							</div>
							<span className="w-8 text-right font-semibold text-zinc-700 dark:text-zinc-200">
								{entry.total}
							</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
