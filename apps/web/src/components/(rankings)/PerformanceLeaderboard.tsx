"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { EmptyLeaderboardPreview } from "@/components/(rankings)/EmptyLeaderboardPreview";
import { formatModelDisplayName } from "@/lib/models/displayName";
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
	if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
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
			<EmptyLeaderboardPreview
				title="No performance data yet"
				description="Performance stats appear once enough requests are aggregated."
			/>
		);
	}

	const visibleEntries = data.slice(0, showAll ? maxExpanded : maxCollapsed);
	const listColumnSplit = Math.ceil(visibleEntries.length / 2);
	const listColumns = [
		visibleEntries.slice(0, listColumnSplit),
		visibleEntries.slice(listColumnSplit),
	].filter((column) => column.length > 0);

	const renderRow = (entry: PerformanceLeaderboardEntry, index: number, rank: number) => {
		const providerId = entry.provider_id ?? null;
		const modelHref = getModelHref(entry);
		const modelName = formatModelDisplayName(entry.model_name, entry.model_id);
		return (
			<div
				key={`${entry.key}-${index}`}
				className="grid min-h-16 grid-cols-[2.25rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-2"
			>
				<div className="text-base tabular-nums text-muted-foreground">{rank}.</div>
				{providerId ? (
					<Link
						href={`/api-providers/${encodeURIComponent(providerId)}`}
						aria-label={entry.provider_name ?? providerId}
						className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800"
					>
						<div className="relative h-4 w-4">
							<Logo
								id={providerId}
								alt={entry.provider_name ?? providerId}
								className="object-contain"
								fill
							/>
						</div>
					</Link>
				) : (
					<div className="h-7 w-7" />
				)}
				<div className="min-w-0">
					{modelHref ? (
						<Link
							href={modelHref}
							className="block truncate text-base font-semibold underline decoration-transparent underline-offset-2 transition-colors duration-200 hover:decoration-current"
						>
							{modelName}
						</Link>
					) : (
						<div className="truncate text-base font-semibold">{modelName}</div>
					)}
					{entry.provider_name ? (
						providerId ? (
							<Link
								href={`/api-providers/${encodeURIComponent(providerId)}`}
								className="text-xs text-muted-foreground truncate block underline underline-offset-2 decoration-transparent hover:decoration-current transition-colors duration-200"
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
					<div className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
						{formatThroughput(entry.throughput)}{" "}
						<span className="text-xs text-muted-foreground">tok/s</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="space-y-4">
			<div className="grid gap-x-16 gap-y-1 md:grid-cols-2">
				{listColumns.map((column, columnIndex) => (
					<div key={`performance-column-${columnIndex}`} className="space-y-1">
						{column.map((entry, columnRowIndex) => {
							const index =
								columnIndex === 0
									? columnRowIndex
									: listColumnSplit + columnRowIndex;
							return renderRow(entry, index, index + 1);
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
