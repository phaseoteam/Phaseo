"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import type { TopAppData } from "@/lib/fetchers/rankings/getRankingsData";
import { ChevronDown } from "lucide-react";

type AppsUsageListProps = {
	data: TopAppData[];
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
	maxCollapsed = 10,
	maxExpanded = 20,
}: AppsUsageListProps) {
	const [showAll, setShowAll] = useState(false);

	if (!data.length) {
		return (
			<RankingsEmptyState
				title="No app usage data yet"
				description="App usage appears once requests are recorded."
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
						key={`${entry.app_name}-${index}`}
						className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-3"
					>
						<div className="w-8 text-xs text-muted-foreground">
							#{index + 1}
						</div>
						<div className="min-w-0 flex-1 flex items-center">
							{entry.app_id ? (
								<Link
									href={`/apps/${encodeURIComponent(
										entry.app_id
									)}`}
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
				))}
				{showAll
					? extraEntries.map((entry, index) => (
							<div
								key={`${entry.app_name}-extra-${index}`}
								className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-3 animate-in fade-in slide-in-from-top-1"
								style={{
									animationDelay: `${index * 20}ms`,
								}}
							>
								<div className="w-8 text-xs text-muted-foreground">
									#{index + maxCollapsed + 1}
								</div>
								<div className="min-w-0 flex-1 flex items-center">
									{entry.app_id ? (
										<Link
											href={`/apps/${encodeURIComponent(
												entry.app_id
											)}`}
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
