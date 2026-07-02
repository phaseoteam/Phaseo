"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyLeaderboardPreview } from "@/components/(rankings)/EmptyLeaderboardPreview";
import type { TopAppData } from "@/lib/fetchers/rankings/getRankingsData";
import { Check, ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppRange = "today" | "week" | "month";

const RANGE_OPTIONS: Array<{ key: AppRange; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "Last 7d" },
	{ key: "month", label: "Last 30d" },
];

type AppsUsageListProps = {
	data?: TopAppData[];
	dataByRange?: Partial<Record<AppRange, TopAppData[]>>;
	defaultRange?: AppRange;
	showHeader?: boolean;
	title?: string;
	subtitle?: string;
	maxCollapsed?: number;
	maxExpanded?: number;
};

function formatTokens(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
	return value.toLocaleString();
}

function rangeLabel(value: AppRange) {
	return RANGE_OPTIONS.find((option) => option.key === value)?.label ?? value;
}

export function AppsUsageList({
	data,
	dataByRange,
	defaultRange = "week",
	showHeader = false,
	title,
	subtitle,
	maxCollapsed = 10,
	maxExpanded = 20,
}: AppsUsageListProps) {
	const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "A";

	const resolvedDataByRange = useMemo<Partial<Record<AppRange, TopAppData[]>>>(
		() => dataByRange ?? { [defaultRange]: data ?? [] },
		[dataByRange, data, defaultRange]
	);

	const availableRanges = useMemo(
		() =>
			RANGE_OPTIONS.filter(
				(option) => resolvedDataByRange[option.key]?.length
			),
		[resolvedDataByRange]
	);

	const [range, setRange] = useState<AppRange>(() => {
		if (resolvedDataByRange[defaultRange]?.length) return defaultRange;
		return availableRanges[0]?.key ?? defaultRange;
	});
	const [showAll, setShowAll] = useState(false);

	useEffect(() => {
		if (resolvedDataByRange[range]?.length) return;
		if (resolvedDataByRange[defaultRange]?.length) {
			if (range !== defaultRange) setRange(defaultRange);
			return;
		}
		const nextRange = availableRanges[0]?.key ?? defaultRange;
		if (range !== nextRange) setRange(nextRange);
	}, [availableRanges, defaultRange, range, resolvedDataByRange]);

	const entries = resolvedDataByRange[range] ?? [];
	const visibleEntries = entries.slice(0, showAll ? maxExpanded : maxCollapsed);
	const listColumnSplit = Math.ceil(visibleEntries.length / 2);
	const listColumns = [
		visibleEntries.slice(0, listColumnSplit),
		visibleEntries.slice(listColumnSplit),
	].filter((column) => column.length > 0);

	if (!entries.length) {
		return (
			<EmptyLeaderboardPreview
				title="No app usage data yet"
				description="App usage appears once requests are recorded."
			/>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				{showHeader ? (
					<div className="min-w-0 max-w-xl space-y-0.5">
						<h2 className="text-xl font-semibold leading-8">{title ?? "Top Apps"}</h2>
						{subtitle ? (
							<p className="text-sm text-muted-foreground">{subtitle}</p>
						) : null}
					</div>
				) : null}
				{availableRanges.length > 1 ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-9 w-32 justify-between rounded-lg px-4 font-normal text-muted-foreground"
							>
								{rangeLabel(range)}
								<ChevronDown className="ml-2 h-4 w-4 opacity-60" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-32">
							{RANGE_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.key}
									disabled={!resolvedDataByRange[option.key]?.length}
									onSelect={() => {
										setRange(option.key);
										setShowAll(false);
									}}
									className="justify-between gap-6"
								>
									<span>{option.label}</span>
									<span className="flex h-4 w-4 items-center justify-center">
										{range === option.key ? (
											<Check className="h-4 w-4 text-primary" />
										) : null}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</div>

			<div className="grid gap-x-16 gap-y-1 md:grid-cols-2">
				{listColumns.map((column, columnIndex) => (
					<div key={`apps-column-${columnIndex}`} className="space-y-1">
						{column.map((entry, columnRowIndex) => {
							const index =
								columnIndex === 0
									? columnRowIndex
									: listColumnSplit + columnRowIndex;
							return (
								<div
									key={`${entry.app_id ?? entry.app_name}-${index}`}
									className="grid min-h-16 grid-cols-[2.25rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-2"
								>
									<div className="text-base tabular-nums text-muted-foreground">
										{index + 1}.
									</div>
							{entry.app_id ? (
								<Link
									href={`/apps/${encodeURIComponent(entry.app_id)}`}
									aria-label={entry.app_name}
								>
									<Avatar className="h-7 w-7 rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800">
										{entry.image_url ? (
											<AvatarImage
												src={entry.image_url}
												alt={entry.app_name}
												className="object-cover"
											/>
										) : null}
										<AvatarFallback className="rounded-lg bg-transparent text-[11px] font-semibold">
											{getInitial(entry.app_name)}
										</AvatarFallback>
									</Avatar>
								</Link>
							) : (
								<Avatar className="h-7 w-7 rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800">
									{entry.image_url ? (
										<AvatarImage
											src={entry.image_url}
											alt={entry.app_name}
											className="object-cover"
										/>
									) : null}
									<AvatarFallback className="rounded-lg bg-transparent text-[11px] font-semibold">
										{getInitial(entry.app_name)}
									</AvatarFallback>
								</Avatar>
							)}
							<div className="min-w-0">
								{entry.app_id ? (
									<Link
										href={`/apps/${encodeURIComponent(entry.app_id)}`}
										className="block min-w-0 truncate text-base font-semibold underline decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
									>
										{entry.app_name}
									</Link>
								) : (
									<div className="block min-w-0 truncate text-base font-semibold">
										{entry.app_name}
									</div>
								)}
							</div>
							<div className="text-right">
								<div className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
									{formatTokens(entry.tokens)} tokens
								</div>
							</div>
								</div>
							);
						})}
					</div>
				))}
			</div>

			{entries.length > maxCollapsed ? (
				<div className="flex justify-center">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setShowAll((prev) => !prev)}
						aria-expanded={showAll}
						className="text-muted-foreground"
					>
						<span className="flex items-center gap-2">
							{showAll ? "Show less" : "Show more"}
							<ChevronDown
								className={[
									"h-4 w-4 transition-transform",
									showAll ? "rotate-180" : "",
								]
									.filter(Boolean)
									.join(" ")}
							/>
						</span>
					</Button>
				</div>
			) : null}
		</div>
	);
}
