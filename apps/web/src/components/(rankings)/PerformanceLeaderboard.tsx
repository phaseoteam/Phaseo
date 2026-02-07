"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { ChevronDown } from "lucide-react";

export type PerformanceLeaderboardEntry = {
	key: string;
	model_id: string;
	model_name: string;
	organisation_id?: string | null;
	provider_id?: string | null;
	provider_name?: string | null;
	throughput: number;
	requests: number;
};

type PerformanceLeaderboardProps = {
	data: PerformanceLeaderboardEntry[];
	maxCollapsed?: number;
	maxExpanded?: number;
};

function formatThroughput(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toFixed(1);
}

function getModelHref(entry: PerformanceLeaderboardEntry) {
	return getModelDetailsHref(entry.organisation_id, entry.model_id);
}

export function PerformanceLeaderboard({
	data,
	maxCollapsed = 10,
	maxExpanded = 20,
}: PerformanceLeaderboardProps) {
	const [showAll, setShowAll] = useState(false);

	if (!data.length) {
		return (
			<RankingsEmptyState
				title="No performance data yet"
				description="Performance stats appear once enough requests are aggregated."
			/>
		);
	}

	const visibleEntries = data.slice(0, maxCollapsed);
	const extraEntries = data.slice(maxCollapsed, maxExpanded);

	const renderRow = (entry: PerformanceLeaderboardEntry, index: number, rank: number) => {
		const providerId = entry.provider_id ?? null;
		const modelHref = getModelHref(entry);
		return (
			<div
				key={`${entry.key}-${index}`}
				className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-3"
			>
				<div className="w-6 text-xs text-muted-foreground">#{rank}</div>
				{providerId ? (
					<Link
						href={`/api-providers/${encodeURIComponent(providerId)}`}
						aria-label={entry.provider_name ?? providerId}
						className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center"
					>
						<div className="relative h-5 w-5">
							<Logo
								id={providerId}
								alt={entry.provider_name ?? providerId}
								className="object-contain"
								fill
							/>
						</div>
					</Link>
				) : null}
				<div className="min-w-0 flex-1">
					{modelHref ? (
						<Link
							href={modelHref}
							className="font-medium truncate block"
						>
							{entry.model_name}
						</Link>
					) : (
						<div className="font-medium truncate">{entry.model_name}</div>
					)}
					{entry.provider_name ? (
						providerId ? (
							<Link
								href={`/api-providers/${encodeURIComponent(providerId)}`}
								className="text-xs text-muted-foreground truncate block"
							>
								{entry.provider_name}
							</Link>
						) : (
							<span className="text-xs text-muted-foreground truncate block">
								{entry.provider_name}
							</span>
						)
					) : null}
				</div>
				<div className="text-right">
					<div className="font-mono text-sm">
						{formatThroughput(entry.throughput)}{" "}
						<span className="text-xs text-muted-foreground">tok/s</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="space-y-4">
			<div className="grid gap-2 md:grid-cols-2">
				{visibleEntries.map((entry, index) =>
					renderRow(entry, index, index + 1)
				)}
				{showAll
					? extraEntries.map((entry, index) => (
							<div
								key={`${entry.key}-extra`}
								className="animate-in fade-in slide-in-from-top-1"
								style={{ animationDelay: `${index * 20}ms` }}
							>
								{renderRow(entry, index, index + maxCollapsed + 1)}
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
