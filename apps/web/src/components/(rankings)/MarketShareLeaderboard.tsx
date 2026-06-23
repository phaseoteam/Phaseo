"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { EmptyLeaderboardPreview } from "@/components/(rankings)/EmptyLeaderboardPreview";
import { ChevronDown } from "lucide-react";

export type MarketShareLeaderboardEntry = {
	key: string;
	name: string;
	logo_id?: string | null;
	href?: string | null;
	tokens: number;
	share_pct: number;
};

type MarketShareLeaderboardProps = {
	data: MarketShareLeaderboardEntry[];
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

function formatPercent(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value === 0) return "0%";
	if (value < 1) return "<1%";
	return `${Math.round(value)}%`;
}

export function MarketShareLeaderboard({
	data,
	maxCollapsed = 10,
	maxExpanded = 20,
}: MarketShareLeaderboardProps) {
	const [showAll, setShowAll] = useState(false);

	if (!data.length) {
		return (
			<EmptyLeaderboardPreview
				title="No market share data yet"
				description="Market share entries appear once usage is recorded."
			/>
		);
	}

	const visibleEntries = data.slice(0, showAll ? maxExpanded : maxCollapsed);
	const listColumnSplit = Math.ceil(visibleEntries.length / 2);
	const listColumns = [
		visibleEntries.slice(0, listColumnSplit),
		visibleEntries.slice(listColumnSplit),
	].filter((column) => column.length > 0);

	return (
		<div className="space-y-4">
			<div className="grid gap-x-16 gap-y-1 md:grid-cols-2">
				{listColumns.map((column, columnIndex) => (
					<div key={`market-share-column-${columnIndex}`} className="space-y-1">
						{column.map((entry, columnRowIndex) => {
							const index =
								columnIndex === 0
									? columnRowIndex
									: listColumnSplit + columnRowIndex;
							return (
								<div
									key={entry.key}
									className="grid min-h-16 grid-cols-[2.25rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-2"
								>
									<div className="text-base tabular-nums text-muted-foreground">
										{index + 1}.
									</div>
							{entry.logo_id ? (
								entry.href ? (
									<Link
										href={entry.href}
										className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800"
										aria-label={entry.name}
									>
										<div className="relative h-4 w-4">
											<Logo
												id={entry.logo_id}
												alt={entry.name}
												className="object-contain"
												fill
											/>
										</div>
									</Link>
								) : (
									<div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800">
										<div className="relative h-4 w-4">
											<Logo
												id={entry.logo_id}
												alt={entry.name}
												className="object-contain"
												fill
											/>
										</div>
									</div>
								)
							) : (
								<div className="h-7 w-7" />
							)}
							<div className="min-w-0">
								{entry.href ? (
									<Link
										href={entry.href}
										className="block truncate text-base font-semibold underline decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
									>
										{entry.name}
									</Link>
								) : (
									<div className="truncate text-base font-semibold">
										{entry.name}
									</div>
								)}
							</div>
							<div className="text-right">
								<div className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
									{formatPercent(entry.share_pct)}
								</div>
								<div className="text-xs text-muted-foreground">
									{formatTokens(entry.tokens)}
								</div>
							</div>
								</div>
							);
						})}
					</div>
				))}
			</div>

			{data.length > maxCollapsed ? (
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
