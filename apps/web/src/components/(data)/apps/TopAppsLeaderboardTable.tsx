"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getPublicAppPath } from "@/lib/apps/publicAppPath";
import AppCategoryTags from "@/components/(data)/apps/AppCategoryTags";
import AppLogo from "@/components/(data)/apps/AppLogo";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

const PAGE_SIZE = 20;

type LeaderboardAppRow = {
	appId: string;
	appName: string;
	appUrl?: string | null;
	appCategory?: string | null;
	tokens: number;
	requests: number;
	uniqueModels: number;
};

type RankingRange = "today" | "week" | "month";

const RANGE_OPTIONS: Array<{ value: RankingRange; label: string }> = [
	{ value: "today", label: "Today" },
	{ value: "week", label: "This week" },
	{ value: "month", label: "This month" },
];

function getInitial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || "A";
}

function getUrlLabel(value?: string | null): string | null {
	if (!value?.startsWith("http")) return null;
	try {
		return new URL(value).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

export default function TopAppsLeaderboardTable({
	rowsByRange,
	imageUrlsById,
}: {
	rowsByRange: Record<RankingRange, LeaderboardAppRow[]>;
	imageUrlsById: Record<string, string | null>;
}) {
	const format = useDisplayFormatters();
	const [range, setRange] = useState<RankingRange>("month");
	const [page, setPage] = useState(1);
	const rows = rowsByRange[range];
	const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);

	const pagedRows = useMemo(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return rows.slice(start, start + PAGE_SIZE);
	}, [currentPage, rows]);
	const columns = useMemo(() => {
		const splitAt = Math.ceil(pagedRows.length / 2);
		return [pagedRows.slice(0, splitAt), pagedRows.slice(splitAt)];
	}, [pagedRows]);
	const rangeLabel = RANGE_OPTIONS.find((option) => option.value === range)?.label;

	return (
		<div>
			<div className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
						<Globe2 className="size-5 text-muted-foreground" />
						Global ranking
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Apps ranked by token usage across Phaseo Gateway.
					</p>
				</div>
				<Select
					value={range}
					onValueChange={(value) => {
						setRange(value);
						setPage(1);
					}}
				>
					<SelectTrigger size="sm" aria-label="Ranking period" className="min-w-32 border border-border/70 bg-transparent">
						<SelectValue placeholder="Ranking period" />
					</SelectTrigger>
					<SelectContent align="end">
						{RANGE_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value} label={option.label}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{pagedRows.length === 0 ? (
				<div className="border-b border-border/70 py-16 text-center">
					<p className="text-sm font-medium">No usage recorded {rangeLabel?.toLowerCase()}.</p>
					<p className="mt-1 text-xs text-muted-foreground">Rankings appear as public app traffic is processed.</p>
				</div>
			) : (
				<div className="grid border-b border-border/70 lg:grid-cols-2 lg:divide-x lg:divide-border/70">
					{columns.map((column, columnIndex) => (
						<div
							key={columnIndex}
							className={`divide-y divide-border/60 ${columnIndex === 0 ? "lg:pr-5" : "border-t border-border/60 lg:border-t-0 lg:pl-5"}`}
						>
							{column.map((app, index) => {
								const absoluteRank = (currentPage - 1) * PAGE_SIZE + columnIndex * columns[0].length + index + 1;
								const urlLabel = getUrlLabel(app.appUrl);
								return (
									<Link
										key={app.appId}
										href={getPublicAppPath(app.appName)}
										className="group grid min-h-20 grid-cols-[2rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
									>
										<span className="text-xs font-medium tabular-nums text-muted-foreground">{absoluteRank}.</span>
										<AppLogo
											src={imageUrlsById[app.appId]}
											alt={app.appName}
											fallback={getInitial(app.appName)}
											className="size-10"
											fallbackClassName="text-xs"
										/>
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">{app.appName}</p>
											<p className="mt-0.5 truncate text-xs text-muted-foreground">
												{urlLabel ?? `${format.number(app.requests, { maximumFractionDigits: 1 })} requests`} · {format.number(app.uniqueModels)} {app.uniqueModels === 1 ? "model" : "models"}
											</p>
											<AppCategoryTags categoryCsv={app.appCategory} className="mt-1.5" />
										</div>
										<p className="pl-2 text-right text-sm font-semibold tabular-nums text-foreground">
											{format.number(app.tokens, { maximumFractionDigits: 1 })} <span className="hidden font-normal text-muted-foreground sm:inline">tokens</span>
										</p>
									</Link>
								);
							})}
						</div>
					))}
				</div>
			)}

			{totalPages > 1 ? (
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-3">
					<p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</p>
					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label="Previous page"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
						>
							<ChevronLeft />
						</Button>
						<span className="min-w-16 text-center text-xs font-medium tabular-nums">{currentPage} / {totalPages}</span>
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label="Next page"
							onClick={() =>
								setPage((p) => Math.min(totalPages, p + 1))
							}
							disabled={currentPage === totalPages}
						>
							<ChevronRight />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
