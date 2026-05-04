"use client";

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "slate" | "emerald" | "violet" | "sky" | "rose" | "amber";

const toneClassName: Record<Tone, string> = {
	slate: "bg-slate-600/10 text-slate-700 dark:text-slate-200",
	emerald: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
	violet: "bg-violet-600/10 text-violet-700 dark:text-violet-300",
	sky: "bg-sky-600/10 text-sky-700 dark:text-sky-300",
	rose: "bg-rose-600/10 text-rose-700 dark:text-rose-300",
	amber: "bg-amber-600/10 text-amber-700 dark:text-amber-300",
};

export function DetailMetricTile({
	icon: Icon,
	label,
	value,
	sub,
	tone = "slate",
	className,
	compact = false,
}: {
	icon: LucideIcon;
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	tone?: Tone;
	className?: string;
	compact?: boolean;
}) {
	if (compact) {
		return (
			<div className={cn("rounded-2xl border bg-card p-3", className)}>
				<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
					<Icon className="h-3.5 w-3.5" />
					<span>{label}</span>
				</div>
				<div className="mt-1 text-base font-semibold tracking-tight">{value}</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"rounded-2xl border bg-card",
				"p-4",
				className,
			)}
		>
			<div className="flex items-center justify-between">
				<div
					className={cn(
						"flex items-center justify-center",
						"h-9 w-9 rounded-xl",
						toneClassName[tone],
					)}
				>
					<Icon className="h-4 w-4" />
				</div>
			</div>
			<div className="mt-3 text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
			{sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
		</div>
	);
}

export function DetailSection({
	title,
	children,
	className,
}: {
	title: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("rounded-2xl border bg-card p-4", className)}>
			<div className="mb-3 text-sm font-medium">{title}</div>
			{children}
		</div>
	);
}

export function DetailKeyValueGrid({
	items,
	columns = 2,
}: {
	items: Array<{
		label: string;
		value: React.ReactNode;
		className?: string;
	}>;
	columns?: 1 | 2 | 3;
}) {
	return (
		<div
			className={cn(
				"grid gap-3 text-sm",
				columns === 1 && "grid-cols-1",
				columns === 2 && "grid-cols-1 sm:grid-cols-2",
				columns === 3 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
			)}
		>
			{items.map((item) => (
				<div key={item.label} className={item.className}>
					<div className="text-xs text-muted-foreground">{item.label}</div>
					<div className="mt-1 min-w-0 break-words font-medium">{item.value}</div>
				</div>
			))}
		</div>
	);
}

export function DetailTimingBar({
	items,
}: {
	items: Array<{
		key: string;
		label: React.ReactNode;
		duration: number;
		colorClass: string;
	}>;
}) {
	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms} ms`;
		if (ms < 60_000) {
			const seconds = ms / 1000;
			return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
		}
		const minutes = Math.floor(ms / 60_000);
		const seconds = Math.round((ms % 60_000) / 1000);
		return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
	}

	const safeItems = items
		.map((item) => ({
			...item,
			duration: Math.max(0, Math.round(item.duration || 0)),
		}))
		.filter((item) => item.duration > 0);
	const total = safeItems.reduce((sum, item) => sum + item.duration, 0);

	if (!safeItems.length || total <= 0) {
		return (
			<div className="text-sm text-muted-foreground">
				No timing metrics available for this request.
			</div>
		);
	}

	return (
		<div className="space-y-1">
			<div className="grid gap-2">
				{safeItems.map((item, index) => {
					const consumedBefore = safeItems
						.slice(0, index)
						.reduce((sum, current) => sum + current.duration, 0);
					const leftPct = (consumedBefore / total) * 100;
					const widthPct = Math.max((item.duration / total) * 100, 3);
					const isFirst = index === 0;
					const isLast = index === safeItems.length - 1;
					const radiusClass =
						isFirst && isLast
							? "rounded-sm"
							: isFirst
								? "rounded-l-sm rounded-r-[2px]"
								: isLast
									? "rounded-l-[2px] rounded-r-sm"
									: "rounded-[2px]";
					return (
						<div
							key={item.key}
							className="grid grid-cols-[168px_minmax(0,1fr)_72px] items-center gap-3 text-xs"
						>
							<div className="min-w-0 leading-tight text-muted-foreground">
								{item.label}
							</div>
							<div className="h-4 overflow-hidden rounded-sm bg-muted">
								<div
									className={cn("h-4", item.colorClass, radiusClass)}
									style={{
										marginLeft: `${leftPct}%`,
										width: `${Math.min(widthPct, 100 - leftPct)}%`,
									}}
								/>
							</div>
							<div className="text-right font-mono text-muted-foreground">
								{formatDuration(item.duration)}
							</div>
						</div>
					);
				})}
			</div>
			<div className="grid grid-cols-[168px_minmax(0,1fr)_72px] items-start gap-3 pt-2 text-xs">
				<div />
				<div />
				<div className="pt-0 text-right font-mono text-muted-foreground">
					<div className="mb-1 border-t" />
					<div>{formatDuration(total)}</div>
				</div>
			</div>
		</div>
	);
}
