"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import type { TopAppData } from "@/lib/fetchers/rankings/getRankingsData";
import { ChevronDown } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type AppRange = "today" | "week" | "month";

const RANGE_OPTIONS: Array<{ key: AppRange; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "Last 7d" },
	{ key: "month", label: "Last month" },
];

type AppsUsageListProps = {
	data?: TopAppData[];
	dataByRange?: Partial<Record<AppRange, TopAppData[]>>;
	defaultRange?: AppRange;
	showHeader?: boolean;
	title?: string;
	subtitle?: string;
	icon?: ReactNode;
	maxCollapsed?: number;
	maxExpanded?: number;
};

function formatTokens(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

export function AppsUsageList({
	data,
	dataByRange,
	defaultRange = "week",
	showHeader = false,
	title,
	subtitle,
	icon,
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
	const visibleEntries = entries.slice(0, maxCollapsed);
	const extraEntries = entries.slice(maxCollapsed, maxExpanded);

	if (!entries.length) {
		return (
			<RankingsEmptyState
				title="No app usage data yet"
				description="App usage appears once requests are recorded."
			/>
		);
	}

	return (
		<div className="space-y-4">
			<div
				className={[
					"flex items-start gap-3",
					showHeader ? "justify-between" : "justify-end",
				].join(" ")}
			>
				{showHeader ? (
					<div className="space-y-0.5">
						<div className="flex items-center gap-2">
							{icon}
							<h2 className="text-xl font-semibold leading-8">{title ?? "Top Apps"}</h2>
						</div>
						{subtitle ? (
							<p className="text-sm text-muted-foreground">{subtitle}</p>
						) : null}
					</div>
				) : null}
				{availableRanges.length > 1 ? (
					<Select
						value={range}
						onValueChange={(value) => {
							setRange(value as AppRange);
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
									disabled={!resolvedDataByRange[option.key]?.length}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>

			<div className="grid gap-2 md:grid-cols-2">
				{visibleEntries.map((entry, index) => (
					<div
						key={`${entry.app_id ?? entry.app_name}-${index}`}
						className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3"
					>
						<div className="w-6 text-xs text-muted-foreground">
							#{index + 1}
						</div>
						{entry.app_id ? (
							<Link
								href={`/apps/${encodeURIComponent(entry.app_id)}`}
								aria-label={entry.app_name}
							>
								<Avatar className="h-8 w-8 rounded-lg border border-border/60">
									{entry.image_url ? (
										<AvatarImage
											src={entry.image_url}
											alt={entry.app_name}
											className="object-cover"
										/>
									) : null}
									<AvatarFallback className="rounded-lg text-[11px] font-semibold">
										{getInitial(entry.app_name)}
									</AvatarFallback>
								</Avatar>
							</Link>
						) : (
							<Avatar className="h-8 w-8 rounded-lg border border-border/60">
								{entry.image_url ? (
									<AvatarImage
										src={entry.image_url}
										alt={entry.app_name}
										className="object-cover"
									/>
								) : null}
								<AvatarFallback className="rounded-lg text-[11px] font-semibold">
									{getInitial(entry.app_name)}
								</AvatarFallback>
							</Avatar>
						)}
						<div className="min-w-0 flex-1 flex items-center">
							{entry.app_id ? (
								<Link
									href={`/apps/${encodeURIComponent(entry.app_id)}`}
									className="font-medium truncate block"
								>
									{entry.app_name}
								</Link>
							) : (
								<div className="font-medium truncate">{entry.app_name}</div>
							)}
							<div className="h-4" />
						</div>
						<div className="text-right flex items-center">
							<div className="font-mono text-sm">
								{formatTokens(entry.tokens)}{" "}
								<span className="text-xs text-muted-foreground">Tok</span>
							</div>
						</div>
					</div>
				))}
				{showAll
					? extraEntries.map((entry, index) => (
							<div
								key={`${entry.app_id ?? entry.app_name}-extra-${index}`}
								className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3 animate-in fade-in slide-in-from-top-1"
								style={{
									animationDelay: `${index * 20}ms`,
								}}
							>
								<div className="w-6 text-xs text-muted-foreground">
									#{index + maxCollapsed + 1}
								</div>
								{entry.app_id ? (
									<Link
										href={`/apps/${encodeURIComponent(entry.app_id)}`}
										aria-label={entry.app_name}
									>
										<Avatar className="h-8 w-8 rounded-lg border border-border/60">
											{entry.image_url ? (
												<AvatarImage
													src={entry.image_url}
													alt={entry.app_name}
													className="object-cover"
												/>
											) : null}
											<AvatarFallback className="rounded-lg text-[11px] font-semibold">
												{getInitial(entry.app_name)}
											</AvatarFallback>
										</Avatar>
									</Link>
								) : (
									<Avatar className="h-8 w-8 rounded-lg border border-border/60">
										{entry.image_url ? (
											<AvatarImage
												src={entry.image_url}
												alt={entry.app_name}
												className="object-cover"
											/>
										) : null}
										<AvatarFallback className="rounded-lg text-[11px] font-semibold">
											{getInitial(entry.app_name)}
										</AvatarFallback>
									</Avatar>
								)}
								<div className="min-w-0 flex-1 flex items-center">
									{entry.app_id ? (
										<Link
											href={`/apps/${encodeURIComponent(entry.app_id)}`}
											className="font-medium truncate block"
										>
											{entry.app_name}
										</Link>
									) : (
										<div className="font-medium truncate">
											{entry.app_name}
										</div>
									)}
									<div className="h-4" />
								</div>
								<div className="text-right flex items-center">
									<div className="font-mono text-sm">
										{formatTokens(entry.tokens)}{" "}
										<span className="text-xs text-muted-foreground">
											Tok
										</span>
									</div>
								</div>
							</div>
					  ))
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
