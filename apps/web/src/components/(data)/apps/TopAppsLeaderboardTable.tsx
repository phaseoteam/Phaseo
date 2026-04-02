"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

type LeaderboardAppRow = {
	appId: string;
	appName: string;
	tokens: number;
	requests: number;
	uniqueModels: number;
};

function formatCompactNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function getInitial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || "A";
}

export default function TopAppsLeaderboardTable({
	rows,
	imageUrlsById,
}: {
	rows: LeaderboardAppRow[];
	imageUrlsById: Record<string, string | null>;
}) {
	const [page, setPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);

	const pagedRows = useMemo(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return rows.slice(start, start + PAGE_SIZE);
	}, [currentPage, rows]);

	return (
		<div className="space-y-4">
			<div className="grid gap-2 md:grid-cols-2">
				{pagedRows.map((app, index) => {
					const absoluteRank = (currentPage - 1) * PAGE_SIZE + index + 1;
					return (
						<div
							key={app.appId}
							className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-2"
						>
							<div className="flex min-w-0 items-center gap-3">
								<span className="w-8 text-xs text-zinc-500 dark:text-zinc-400">
									#{absoluteRank}
								</span>
								<Link
									href={`/apps/${encodeURIComponent(app.appId)}`}
									className="flex min-w-0 items-center gap-3"
								>
									<Avatar className="h-9 w-9 rounded-lg border border-border/60">
										<AvatarImage
											src={imageUrlsById[app.appId] ?? undefined}
											alt={app.appName}
											className="object-cover"
										/>
										<AvatarFallback className="rounded-lg text-xs font-semibold">
											{getInitial(app.appName)}
										</AvatarFallback>
									</Avatar>
									<span className="truncate text-sm font-medium text-foreground">
										{app.appName}
									</span>
								</Link>
							</div>
							<div className="text-sm font-semibold tabular-nums text-foreground">
								{formatCompactNumber(app.tokens)}
							</div>
						</div>
					);
				})}
			</div>

			{totalPages > 1 ? (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">
						Page {currentPage} of {totalPages}
					</p>
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
						>
							Previous
						</Button>
						{Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
							(pageNumber) => (
								<Button
									key={pageNumber}
									type="button"
									size="sm"
									variant={pageNumber === currentPage ? "default" : "outline"}
									onClick={() => setPage(pageNumber)}
								>
									{pageNumber}
								</Button>
							),
						)}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								setPage((p) => Math.min(totalPages, p + 1))
							}
							disabled={currentPage === totalPages}
						>
							Next
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
