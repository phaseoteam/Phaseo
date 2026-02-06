"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Sparkles } from "lucide-react";
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
	prev_tokens?: number | null;
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
	showHeader?: boolean;
	title?: string;
	icon?: ReactNode;
	maxCollapsed?: number;
	maxExpanded?: number;
};

const RANGE_OPTIONS: Array<{ key: LeaderboardRange; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "This week" },
	{ key: "month", label: "This month" },
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
	const prevTokens = Number(entry.prev_tokens ?? NaN);
	const rawValue =
		typeof entry.change_value === "number"
			? entry.change_value
			: Number.isFinite(prevTokens) && prevTokens > 0
			? ((entry.tokens - prevTokens) / prevTokens) * 100
			: NaN;

	if (
		!Number.isFinite(rawValue) &&
		(!Number.isFinite(prevTokens) || prevTokens <= 0)
	) {
		return { text: "New", className: "text-indigo-500", Icon: Sparkles };
	}

	if (!Number.isFinite(rawValue) || Math.abs(rawValue) < 0.05) {
		return { text: "0%", className: "text-muted-foreground", Icon: Minus };
	}

	const precision = Math.abs(rawValue) < 10 ? 1 : 0;
	const text = `${rawValue > 0 ? "+" : ""}${rawValue.toFixed(precision)}%`;
	if (rawValue > 0) {
		return { text, className: "text-emerald-600", Icon: ArrowUpRight };
	}
	return { text, className: "text-rose-500", Icon: ArrowDownRight };
}

export function ModelLeaderboard({
	dataByRange,
	defaultRange = "week",
	showRangeControls = true,
	showHeader = false,
	title = "Leaderboard",
	icon,
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
			{showHeader ? (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						{icon ? (
							<span className="text-muted-foreground">{icon}</span>
						) : null}
						<h3 className="text-xl font-semibold">{title}</h3>
					</div>
					{showRangeControls ? (
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
					) : null}
				</div>
			) : showRangeControls ? (
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
					const ChangeIcon = change.Icon;
					const rankValue =
						typeof entry.rank === "number" ? entry.rank : NaN;
					const rankLabel =
						range === "trending"
							? `#${index + 1}`
							: Number.isFinite(rankValue) &&
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
							<Link
								href={`/models/${entry.model_id}`}
								aria-label={entry.model_name}
								className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center"
							>
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
							</Link>
							<div className="min-w-0 flex-1">
								<Link
									href={`/models/${entry.model_id}`}
									className="font-medium truncate block"
								>
									{entry.model_name}
								</Link>
								{entry.organisation_name ? (
									entry.organisation_id ? (
										<Link
											href={`/organisations/${entry.organisation_id}`}
											className="text-xs text-muted-foreground truncate block"
										>
											{entry.organisation_name}
										</Link>
									) : (
										<span className="text-xs text-muted-foreground truncate block">
											{entry.organisation_name}
										</span>
									)
								) : null}
							</div>
							<div className="text-right">
								<div className="font-mono text-sm">
									{formatTokens(entry.tokens)}
								</div>
								<div
									className={cn(
										"text-xs flex items-center justify-end gap-1",
										change.className
									)}
								>
									<ChangeIcon className="h-3.5 w-3.5" />
									<span>{change.text}</span>
								</div>
							</div>
						</div>
					);
				})}
				{showAll
					? extraEntries.map((entry, index) => {
							const change = getChangeDisplay(entry);
							const ChangeIcon = change.Icon;
							const rankValue =
								typeof entry.rank === "number"
									? entry.rank
									: NaN;
							const rankLabel =
								range === "trending"
									? `#${index + maxCollapsed + 1}`
									: Number.isFinite(rankValue) &&
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
									<Link
										href={`/models/${entry.model_id}`}
										aria-label={entry.model_name}
										className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center"
									>
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
									</Link>
									<div className="min-w-0 flex-1">
										<Link
											href={`/models/${entry.model_id}`}
											className="font-medium truncate block"
										>
											{entry.model_name}
										</Link>
										{entry.organisation_name ? (
											entry.organisation_id ? (
												<Link
													href={`/organisations/${entry.organisation_id}`}
													className="text-xs text-muted-foreground truncate block"
												>
													{entry.organisation_name}
												</Link>
											) : (
												<span className="text-xs text-muted-foreground truncate block">
													{entry.organisation_name}
												</span>
											)
										) : null}
									</div>
									<div className="text-right">
										<div className="font-mono text-sm">
											{formatTokens(entry.tokens)}
										</div>
										<div
											className={cn(
												"text-xs flex items-center justify-end gap-1",
												change.className
											)}
										>
											<ChangeIcon className="h-3.5 w-3.5" />
											<span>{change.text}</span>
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

