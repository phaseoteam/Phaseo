"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { cn } from "@/lib/utils";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { CalendarDays, ChevronDown } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
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
	title?: string;
	subtitle?: string;
	icon?: ReactNode;
	maxCollapsed?: number;
	maxExpanded?: number;
};

const RANGE_OPTIONS: Array<{ key: LeaderboardRange; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "Last 7d" },
	{ key: "month", label: "Last 30d" },
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
		return { text: "--", className: "text-muted-foreground" };
	}

	const label = entry.change_label ? ` ${entry.change_label}` : "";
	const text = `${rawValue > 0 ? "+" : ""}${rawValue}${label}`;
	const className =
		rawValue > 0 ? "text-emerald-600" : "text-rose-500";

	return { text, className };
}

function getModelHref(entry: ModelLeaderboardEntry) {
	return getModelDetailsHref(entry.organisation_id, entry.model_id);
}

function getOrganisationHref(entry: ModelLeaderboardEntry) {
	if (!entry.organisation_id) return null;
	return `/organisations/${encodeURIComponent(entry.organisation_id)}`;
}

function getProviderHref(entry: ModelLeaderboardEntry) {
	if (!entry.provider_id) return null;
	return `/api-providers/${encodeURIComponent(entry.provider_id)}`;
}

export function ModelLeaderboard({
	dataByRange,
	defaultRange = "week",
	showRangeControls = true,
	title,
	subtitle,
	icon,
	maxCollapsed = 10,
	maxExpanded = 20,
}: ModelLeaderboardProps) {
	const [range, setRange] = useState<LeaderboardRange>(() => {
		if (dataByRange[defaultRange]?.length) return defaultRange;
		return (
			RANGE_OPTIONS.find((option) => dataByRange[option.key]?.length)?.key ??
			defaultRange
		);
	});
	const [showAll, setShowAll] = useState(false);

	const entries = dataByRange[range] ?? [];
	const visibleEntries = entries.slice(0, maxCollapsed);
	const extraEntries = entries.slice(maxCollapsed, maxExpanded);
	const selectedRangeLabel =
		RANGE_OPTIONS.find((option) => option.key === range)?.label ?? "Range";

	return (
		<div className="space-y-4">
			{showRangeControls || title ? (
				<div
					className={[
						"flex flex-col gap-3 sm:flex-row sm:items-start",
						title ? "justify-between" : "justify-end",
					].join(" ")}
				>
					{title ? (
						<div className="space-y-0.5">
							<div className="flex items-center gap-2">
								{icon}
								<h3 className="text-xl font-semibold leading-8">{title}</h3>
							</div>
							{subtitle ? (
								<p className="text-sm text-muted-foreground">{subtitle}</p>
							) : null}
						</div>
					) : null}
					{showRangeControls ? (
						<Select
							value={range}
							onValueChange={(value) => {
								setRange(value as LeaderboardRange);
								setShowAll(false);
							}}
						>
							<SelectTrigger
								className="h-9 w-full min-w-[10rem] border border-border/70 bg-background shadow-xs hover:bg-muted/45 sm:w-fit dark:border-border/70 dark:bg-background dark:hover:bg-muted/25"
								aria-label="Select leaderboard range"
							>
								<span className="flex min-w-0 items-center gap-2">
									<CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{selectedRangeLabel}</span>
								</span>
							</SelectTrigger>
							<SelectContent
								align="end"
								alignItemWithTrigger={false}
								className="!w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"
							>
								{RANGE_OPTIONS.map((option) => (
									<SelectItem key={option.key} value={option.key}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}
				</div>
			) : null}

			{!entries.length ? (
				<RankingsEmptyState
					title={`No leaderboard data for ${selectedRangeLabel.toLowerCase()}`}
					description="Try a wider timeframe or check back once more gateway requests are aggregated."
				/>
			) : (
			<>
			<div className="space-y-2">
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
					const modelHref = getModelHref(entry);
					const organisationHref = getOrganisationHref(entry);
					const providerHref = getProviderHref(entry);
					const logoHref = organisationHref ?? providerHref ?? modelHref;
					return (
						<div
							key={entry.key}
							className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 px-3 py-3"
						>
							<div className="w-6 shrink-0 text-xs text-muted-foreground">
								{rankLabel}
							</div>
							{logoHref ? (
								<Link
									href={logoHref}
									className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60"
									aria-label={entry.organisation_name ?? entry.model_name}
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
							) : (
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60">
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
							)}
							<div className="min-w-0 flex-1">
								{modelHref ? (
									<Link
										href={modelHref}
										className="block min-w-0 truncate font-medium underline decoration-2 decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
									>
										{entry.model_name}
									</Link>
								) : (
									<div className="block min-w-0 truncate font-medium">
										{entry.model_name}
									</div>
								)}
								{entry.organisation_name ? (
									organisationHref ? (
										<Link
											href={organisationHref}
											className="block min-w-0 truncate text-xs text-muted-foreground underline decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
										>
											{entry.organisation_name}
										</Link>
									) : (
										<span className="block min-w-0 truncate text-xs text-muted-foreground">
											{entry.organisation_name}
										</span>
									)
								) : null}
							</div>
							<div className="shrink-0 text-right">
								<div className="tabular-nums text-sm">
									{formatTokens(entry.tokens)}
								</div>
								<div className={cn("text-xs", change.className)}>
									{change.text}
								</div>
							</div>
						</div>
					);
				})}
				</div>
				{extraEntries.length > 0 ? (
					<div
						className={cn(
							"grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
							showAll
								? "grid-rows-[1fr] opacity-100"
								: "grid-rows-[0fr] opacity-0"
						)}
					>
						<div className="overflow-hidden">
							<div className="pt-2">
								<div className="grid gap-2 md:grid-cols-2">
									{extraEntries.map((entry, index) => {
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
							const modelHref = getModelHref(entry);
							const organisationHref = getOrganisationHref(entry);
							const providerHref = getProviderHref(entry);
							const logoHref = organisationHref ?? providerHref ?? modelHref;
							return (
								<div
									key={`${entry.key}-extra`}
									className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 px-3 py-3"
								>
									<div className="w-6 shrink-0 text-xs text-muted-foreground">
										{rankLabel}
									</div>
									{logoHref ? (
										<Link
											href={logoHref}
											className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60"
											aria-label={entry.organisation_name ?? entry.model_name}
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
									) : (
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60">
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
									)}
									<div className="min-w-0 flex-1">
										{modelHref ? (
											<Link
												href={modelHref}
												className="block min-w-0 truncate font-medium underline decoration-2 decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
											>
												{entry.model_name}
											</Link>
										) : (
											<div className="block min-w-0 truncate font-medium">
												{entry.model_name}
											</div>
										)}
										{entry.organisation_name ? (
											organisationHref ? (
												<Link
													href={organisationHref}
													className="block min-w-0 truncate text-xs text-muted-foreground underline decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
												>
													{entry.organisation_name}
												</Link>
											) : (
												<span className="block min-w-0 truncate text-xs text-muted-foreground">
													{entry.organisation_name}
												</span>
											)
										) : null}
									</div>
									<div className="shrink-0 text-right">
										<div className="tabular-nums text-sm">
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
						})}
								</div>
							</div>
						</div>
					</div>
				) : null}
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
			</>
			)}
		</div>
	);
}
