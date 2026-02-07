"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type LeaderboardRange = "today" | "week" | "month" | "trending";

export type ModelLeaderboardEntry = {
	key: string;
	model_id: string;
	model_name: string;
	provider_id?: string | null;
	organisation_id?: string | null;
	organisation_name?: string | null;
	organisation_colour?: string | null;
	tokens: number;
	rank?: number | null;
	prev_rank?: number | null;
	trend?: "up" | "down" | "same" | "new";
	change_value?: number | null;
	change_label?: string | null;
};

type ModelLeaderboardProps = {
	dataByRange: Partial<Record<LeaderboardRange, ModelLeaderboardEntry[]>>;
	defaultRange?: LeaderboardRange;
	showRangeControls?: boolean;
	maxCollapsed?: number;
	maxExpanded?: number;
};

const RANGE_OPTIONS: Array<{ key: LeaderboardRange; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "Last 7d" },
	{ key: "month", label: "Last month" },
	{ key: "trending", label: "Trending" },
];

function formatTokens(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function getChangeDisplay(entry: ModelLeaderboardEntry) {
	const trend = entry.trend ?? "same";
	const fallbackChange =
		Number.isFinite(entry.prev_rank ?? NaN) &&
		Number.isFinite(entry.rank ?? NaN)
			? Number(entry.prev_rank) - Number(entry.rank)
			: 0;
	const rawValue =
		typeof entry.change_value === "number"
			? entry.change_value
			: fallbackChange;

	if (trend === "new") {
		return { text: "New", className: "text-indigo-500" };
	}

	if (!Number.isFinite(rawValue) || rawValue === 0) {
		return { text: "â€”", className: "text-muted-foreground" };
	}

	const label = entry.change_label ? ` ${entry.change_label}` : "";
	const text = `${rawValue > 0 ? "+" : ""}${rawValue}${label}`;
	const className =
		rawValue > 0 ? "text-emerald-600" : "text-rose-500";

	return { text, className };
}

export function ModelLeaderboard({
	dataByRange,
	defaultRange = "week",
	showRangeControls = true,
	maxCollapsed = 10,
	maxExpanded = 20,
}: ModelLeaderboardProps) {
	const availableRanges = useMemo(
		() =>
			RANGE_OPTIONS.filter(
				(option) => dataByRange[option.key]?.length
			),
		[dataByRange]
	);

	const [range, setRange] = useState<LeaderboardRange>(() => {
		if (dataByRange[defaultRange]?.length) return defaultRange;
		return availableRanges[0]?.key ?? "week";
	});
	const [showAll, setShowAll] = useState(false);

	const entries = dataByRange[range] ?? [];
	const visibleEntries = entries.slice(0, maxCollapsed);
	const extraEntries = entries.slice(maxCollapsed, maxExpanded);

	if (!entries.length) {
		return (
			<RankingsEmptyState
				title="No leaderboard data yet"
				description="Leaderboard entries appear once rankings are available."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{showRangeControls ? (
				<div className="flex justify-end">
					<Select
						value={range}
						onValueChange={(value) => {
							setRange(value as LeaderboardRange);
							setShowAll(false);
						}}
					>
						<SelectTrigger className="h-8 w-[150px]">
							<SelectValue placeholder="Range" />
						</SelectTrigger>
						<SelectContent>
							{RANGE_OPTIONS.map((option) => (
								<SelectItem
									key={option.key}
									value={option.key}
									disabled={!dataByRange[option.key]?.length}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : null}

			<div className="grid gap-2 md:grid-cols-2">
				{visibleEntries.map((entry, index) => {
					const change = getChangeDisplay(entry);
					const rankValue =
						typeof entry.rank === "number" ? entry.rank : NaN;
					const rankLabel =
						Number.isFinite(rankValue) &&
						rankValue > 0 &&
						rankValue < 1000
							? `#${rankValue}`
							: `#${index + 1}`;
					const logoId =
						entry.organisation_id ??
						entry.provider_id ??
						entry.model_id;
					return (
						<div
							key={entry.key}
							className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3"
						>
							<div className="w-6 text-xs text-muted-foreground">
								{rankLabel}
							</div>
							<div className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center">
								<div className="relative h-5 w-5">
									<Logo
										id={logoId}
										alt={
											entry.organisation_name ??
											entry.model_name
										}
										className="object-contain"
										fill
									/>
								</div>
							</div>
							<div className="min-w-0 flex-1">
								<Link
									href={`/models/${entry.model_id}`}
									className="font-medium truncate block"
								>
									{entry.model_name}
								</Link>
								{entry.organisation_name ? (
									<span className="text-xs text-muted-foreground truncate block">
										{entry.organisation_name}
									</span>
								) : null}
							</div>
							<div className="text-right">
								<div className="font-mono text-sm">
									{formatTokens(entry.tokens)}
								</div>
								<div className={cn("text-xs", change.className)}>
									{change.text}
								</div>
							</div>
						</div>
					);
				})}
				{showAll
					? extraEntries.map((entry, index) => {
							const change = getChangeDisplay(entry);
							const rankValue =
								typeof entry.rank === "number"
									? entry.rank
									: NaN;
							const rankLabel =
								Number.isFinite(rankValue) &&
								rankValue > 0 &&
								rankValue < 1000
									? `#${rankValue}`
									: `#${index + maxCollapsed + 1}`;
							const logoId =
								entry.organisation_id ??
								entry.provider_id ??
								entry.model_id;
							return (
								<div
									key={`${entry.key}-extra`}
									className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3 animate-in fade-in slide-in-from-top-1"
									style={{
										animationDelay: `${index * 20}ms`,
									}}
								>
									<div className="w-6 text-xs text-muted-foreground">
										{rankLabel}
									</div>
									<div className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center">
										<div className="relative h-5 w-5">
											<Logo
												id={logoId}
												alt={
													entry.organisation_name ??
													entry.model_name
												}
												className="object-contain"
												fill
											/>
										</div>
									</div>
									<div className="min-w-0 flex-1">
										<Link
											href={`/models/${entry.model_id}`}
											className="font-medium truncate block"
										>
											{entry.model_name}
										</Link>
										{entry.organisation_name ? (
											<span className="text-xs text-muted-foreground truncate block">
												{entry.organisation_name}
											</span>
										) : null}
									</div>
									<div className="text-right">
										<div className="font-mono text-sm">
											{formatTokens(entry.tokens)}
										</div>
										<div
											className={cn(
												"text-xs",
												change.className
											)}
										>
											{change.text}
										</div>
									</div>
								</div>
							);
						})
					: null}
			</div>

			{entries.length > maxCollapsed ? (
				<div className="flex justify-center">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setShowAll((prev) => !prev)}
						aria-expanded={showAll}
					>
						<span className="flex items-center gap-2">
							{showAll ? "Show top 10" : "Show top 20"}
							<ChevronDown
								className={cn(
									"h-4 w-4 transition-transform",
									showAll && "rotate-180"
								)}
							/>
						</span>
					</Button>
				</div>
			) : null}
		</div>
	);
}
