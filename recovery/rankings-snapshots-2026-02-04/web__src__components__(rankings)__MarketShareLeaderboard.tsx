"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { ChevronDown } from "lucide-react";

export type MarketShareLeaderboardEntry = {
	key: string;
	name: string;
	logo_id?: string | null;
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
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function formatPercent(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value === 0) return "0%";
	const precision = value < 1 ? 1 : value < 10 ? 1 : 0;
	return `${value.toFixed(precision)}%`;
}

export function MarketShareLeaderboard({
	data,
	maxCollapsed = 10,
	maxExpanded = 20,
}: MarketShareLeaderboardProps) {
	const [showAll, setShowAll] = useState(false);

	if (!data.length) {
		return (
			<RankingsEmptyState
				title="No market share data yet"
				description="Market share entries appear once usage is recorded."
			/>
		);
	}

	const visibleEntries = data.slice(0, maxCollapsed);
	const extraEntries = data.slice(maxCollapsed, maxExpanded);

	return (
		<div className="space-y-4">
			<div className="grid gap-2 md:grid-cols-2">
				{visibleEntries.map((entry, index) => (
					<div
						key={entry.key}
						className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3"
					>
						<div className="w-6 text-xs text-muted-foreground">
							#{index + 1}
						</div>
						{entry.logo_id ? (
							<div className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center">
								<div className="relative h-5 w-5">
									<Logo
										id={entry.logo_id}
										alt={entry.name}
										className="object-contain"
										fill
									/>
								</div>
							</div>
						) : null}
						<div className="min-w-0 flex-1">
							<div className="font-medium truncate">
								{entry.name}
							</div>
						</div>
						<div className="text-right">
							<div className="font-mono text-sm">
								{formatPercent(entry.share_pct)}
							</div>
							<div className="text-xs text-muted-foreground">
								{formatTokens(entry.tokens)}
							</div>
						</div>
					</div>
				))}
				{showAll
					? extraEntries.map((entry, index) => (
							<div
								key={`${entry.key}-extra`}
								className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3 animate-in fade-in slide-in-from-top-1"
								style={{
									animationDelay: `${index * 20}ms`,
								}}
							>
								<div className="w-6 text-xs text-muted-foreground">
									#{index + maxCollapsed + 1}
								</div>
								{entry.logo_id ? (
									<div className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center">
										<div className="relative h-5 w-5">
											<Logo
												id={entry.logo_id}
												alt={entry.name}
												className="object-contain"
												fill
											/>
										</div>
									</div>
								) : null}
								<div className="min-w-0 flex-1">
									<div className="font-medium truncate">
										{entry.name}
									</div>
								</div>
								<div className="text-right">
									<div className="font-mono text-sm">
										{formatPercent(entry.share_pct)}
									</div>
									<div className="text-xs text-muted-foreground">
										{formatTokens(entry.tokens)}
									</div>
								</div>
							</div>
					  ))
					: null}
			</div>

			{data.length > maxCollapsed ? (
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
