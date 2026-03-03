"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	TokenTier,
	TokenTriple,
	QualityRow,
	ResolutionRow,
	ProviderSections,
	UsageRow,
} from "./pricingHelpers";
import { fmtUSD } from "./pricingHelpers";

function formatCountdown(iso?: string | null) {
	if (!iso) return null;
	const end = new Date(iso).getTime();
	if (Number.isNaN(end)) return null;
	const diff = end - Date.now();
	if (diff <= 0) return "Ends now";
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	if (days > 0) return `Ends in ${days}d ${remHours}h`;
	return `Ends in ${remHours}h`;
}

type DividerColumn = {
	id: string;
	title?: React.ReactNode;
	subtitle?: React.ReactNode;
	value: React.ReactNode;
	footer?: React.ReactNode;
};

function DividerColumns({
	columns,
	minColumnPx = 150,
}: {
	columns: DividerColumn[];
	minColumnPx?: number;
}) {
	if (!columns.length) return null;

	return (
		<div className="w-full overflow-x-auto rounded-lg border border-zinc-200/70 bg-background dark:border-zinc-800">
			<div className="flex w-full min-w-max divide-x divide-zinc-200/70 dark:divide-zinc-800">
				{columns.map((column) => (
					<div
						key={column.id}
						className="min-w-0 flex-1 px-3 py-2"
						style={{ minWidth: minColumnPx }}
					>
						{column.title ? (
							<div className="mb-0.5 text-xs text-muted-foreground">
								{column.title}
							</div>
						) : null}
						{column.subtitle ? (
							<div className="mb-0.5 text-xs text-muted-foreground/80">
								{column.subtitle}
							</div>
						) : null}
						<div className="text-sm font-semibold tabular-nums">
							{column.value}
						</div>
						{column.footer ? (
							<div className="mt-0.5 text-xs text-muted-foreground">
								{column.footer}
							</div>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

export function TierTiles({
	tiers,
	dense = false,
}: {
	tiers: TokenTier[];
	dense?: boolean;
}) {
	if (!tiers?.length) {
		return <div className="text-sm text-muted-foreground">--</div>;
	}

	return (
		<div className={dense ? "space-y-1" : "space-y-1.5"}>
			{tiers.map((t, i) => (
				<div key={i}>
					<div className="space-y-0.5">
						<div
							className={
								t.basePer1M != null
									? "text-sm font-semibold text-emerald-600 tabular-nums"
									: "text-sm font-semibold tabular-nums"
							}
						>
							{fmtUSD(t.per1M)}
						</div>
						{t.label !== "All usage" ? (
							<div className="text-xs text-muted-foreground">{t.label}</div>
						) : null}
						{t.basePer1M != null ? (
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span className="line-through tabular-nums">
									{fmtUSD(t.basePer1M)}
								</span>
								{formatCountdown(t.discountEndsAt) ? (
									<Badge
										variant="secondary"
										className="text-[0.6rem] uppercase tracking-wide"
									>
										{formatCountdown(t.discountEndsAt)}
									</Badge>
								) : null}
							</div>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}

export function TokenTripleSection({
	title,
	triple,
	headerRight,
	hideHeader = false,
	leadingTiles = [],
	compact = false,
}: {
	title?: string;
	triple?: TokenTriple;
	headerRight?: React.ReactNode;
	hideHeader?: boolean;
	leadingTiles?: Array<{ label: string; value: string }>;
	compact?: boolean;
}) {
	if (!triple) return null;
	const segments = [
		{ label: "Input", tiers: triple.in },
		{ label: "Cached input", tiers: triple.cached },
		{ label: "Output", tiers: triple.out },
	].filter((s) => s.tiers.length > 0);
	const totalTiles = segments.length + leadingTiles.length;
	if (!totalTiles) return null;

	const gridClass =
		totalTiles === 1
			? "grid-cols-1"
			: totalTiles === 2
			? "grid-cols-2"
			: totalTiles === 3
			? "grid-cols-1 sm:grid-cols-3"
			: totalTiles === 4
			? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
			: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5";
	const showSegmentLabels = segments.length > 1;

	return (
		<div className="space-y-1.5">
			{!hideHeader ? (
				<div className="flex items-center justify-between">
					<h4 className="text-sm font-semibold">{title}</h4>
					<span className="text-xs text-muted-foreground">{headerRight ?? "Per 1M tokens"}</span>
				</div>
			) : null}
			{compact ? (
				<div className="w-full overflow-x-auto rounded-lg border border-zinc-200/70 bg-background dark:border-zinc-800">
					<div className="flex w-full min-w-[540px] divide-x divide-zinc-200/70 dark:divide-zinc-800">
						{leadingTiles.map((tile) => (
							<div key={tile.label} className="min-w-0 flex-1 px-3 py-2">
								<div className="mb-0.5 text-xs text-muted-foreground">
									{tile.label}
								</div>
								<div className="text-sm font-semibold tabular-nums">
									{tile.value}
								</div>
							</div>
						))}
						{segments.map((s, idx) => (
							<div key={idx} className="min-w-0 flex-1 px-3 py-2">
								{showSegmentLabels ? (
									<div className="mb-0.5 text-xs text-muted-foreground">
										{s.label}
									</div>
								) : null}
								<TierTiles tiers={s.tiers} dense />
							</div>
						))}
					</div>
				</div>
			) : (
				<div className={`grid gap-2 ${gridClass}`}>
					{leadingTiles.map((tile) => (
						<div
							key={tile.label}
							className="rounded-lg border border-zinc-200/70 bg-background px-3 py-2 dark:border-zinc-800"
						>
							<div className="mb-0.5 text-xs text-muted-foreground">
								{tile.label}
							</div>
							<div className="text-sm font-semibold tabular-nums">
								{tile.value}
							</div>
						</div>
					))}
					{segments.map((s, idx) => (
						<div
							key={idx}
							className="rounded-lg border border-zinc-200/70 bg-background px-3 py-2 dark:border-zinc-800"
						>
							{showSegmentLabels ? (
								<div className="mb-0.5 text-xs text-muted-foreground">
									{s.label}
								</div>
							) : null}
							<TierTiles tiers={s.tiers} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function ImageGenSection({ rows }: { rows?: QualityRow[] }) {
	if (!rows || !rows.length) return null;

	const qualityRows = rows.map((row) => ({
		quality: row.quality.charAt(0).toUpperCase() + row.quality.slice(1),
		items: row.items,
	}));

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">
					Image generation
				</h4>
				<span className="text-xs text-muted-foreground">Per image</span>
			</div>
			<div className="space-y-1.5">
				{qualityRows.map((row, rowIndex) => (
					<div
						key={`${row.quality}-${rowIndex}`}
						className="w-full overflow-x-auto rounded-lg border border-zinc-200/70 bg-background dark:border-zinc-800"
					>
						<div className="flex w-full min-w-max divide-x divide-zinc-200/70 dark:divide-zinc-800">
							<div className="min-w-[140px] px-3 py-2">
								<div className="text-xs text-muted-foreground">Quality</div>
								<div className="text-sm font-semibold">{row.quality}</div>
							</div>
							{row.items.map((item, itemIndex) => (
								<div
									key={`${row.quality}-${item.label}-${itemIndex}`}
									className="min-w-[170px] flex-1 px-3 py-2"
								>
									<div className="mb-0.5 text-xs text-muted-foreground">
										{item.label || "Any resolution"}
									</div>
									<div className="text-sm font-semibold tabular-nums">
										{fmtUSD(item.price)}
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
export function VideoGenSection({ rows }: { rows?: ResolutionRow[] }) {
	if (!rows || !rows.length) return null;

	const byUnit: Record<string, ResolutionRow[]> = {};
	for (const r of rows) {
		(byUnit[r.unitLabel] ??= []).push(r);
	}
	const unitEntries = Object.entries(byUnit);
	const hasSingleUnit = unitEntries.length === 1;
	const items = unitEntries.flatMap(([unit, list]) =>
		list.map((r) => ({
			unit,
			resolution: r.resolution,
			price: r.price,
		}))
	);
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">
					Video generation
				</h4>
				{hasSingleUnit ? (
					<span className="text-xs text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			<DividerColumns
				columns={items
					.sort((a, b) => a.resolution.localeCompare(b.resolution))
					.map((item, i) => ({
						id: `${item.unit}-${item.resolution}-${i}`,
						title: item.resolution,
						subtitle: hasSingleUnit ? undefined : item.unit,
						value: fmtUSD(item.price),
					}))}
				minColumnPx={170}
			/>
		</div>
	);
}
export function InputsSection({
	rows,
	title,
}: {
	rows?: UsageRow[];
	title: string;
}) {
	if (!rows?.length) return null;

	const byUnit: Record<string, UsageRow[]> = {};
	for (const r of rows) {
		(byUnit[r.unitLabel] ??= []).push(r);
	}
	const unitEntries = Object.entries(byUnit);
	const hasSingleUnit = unitEntries.length === 1;
	const items = unitEntries.flatMap(([unit, list]) =>
		list.map((r) => ({
			unit,
			label: r.label,
			price: r.price,
			basePrice: r.basePrice,
			discountEndsAt: r.discountEndsAt,
		}))
	);
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">{title}</h4>
				{hasSingleUnit ? (
					<span className="text-xs text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			<DividerColumns
				columns={items.map((item, index) => ({
					id: `${item.unit}-${item.label}-${index}`,
					title:
						item.label && item.label !== "All usage" ? item.label : undefined,
					subtitle: hasSingleUnit ? undefined : item.unit,
					value: fmtUSD(item.price),
					footer:
						item.basePrice != null ? (
							<div className="flex items-center justify-between">
								<span className="line-through tabular-nums">
									{fmtUSD(item.basePrice)}
								</span>
								{formatCountdown(item.discountEndsAt) ? (
									<Badge
										variant="secondary"
										className="text-[0.6rem] uppercase tracking-wide"
									>
										{formatCountdown(item.discountEndsAt)}
									</Badge>
								) : null}
							</div>
						) : null,
				}))}
				minColumnPx={170}
			/>
		</div>
	);
}
export function CacheWriteSection({ rows }: { rows?: TokenTier[] }) {
	if (!rows?.length) return null;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">
					Cache Writes
				</h4>
				<span className="text-xs text-muted-foreground">
					Per 1M tokens
				</span>
			</div>
			<DividerColumns
				columns={rows.map((t, i) => ({
					id: `cache-write-${i}`,
					title: t.label || "All usage",
					value: fmtUSD(t.per1M),
					footer:
						t.basePer1M != null ? (
							<div className="flex items-center justify-between">
								<span className="line-through tabular-nums">
									{fmtUSD(t.basePer1M)}
								</span>
								{formatCountdown(t.discountEndsAt) ? (
									<Badge
										variant="secondary"
										className="text-[0.6rem] uppercase tracking-wide"
									>
										{formatCountdown(t.discountEndsAt)}
									</Badge>
								) : null}
							</div>
						) : null,
				}))}
				minColumnPx={170}
			/>
		</div>
	);
}

export function RequestsSection({ rows }: { rows?: TokenTier[] }) {
	if (!rows?.length) return null;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">Requests</h4>
				<span className="text-xs text-muted-foreground">Per request</span>
			</div>
			<DividerColumns
				columns={rows.map((t, i) => ({
					id: `request-${i}`,
					title: t.label || "All usage",
					value: fmtUSD(t.price),
					footer:
						t.basePer1M != null ? (
							<div className="flex items-center justify-between">
								<span className="line-through tabular-nums">
									{fmtUSD(t.basePer1M)}
								</span>
								{formatCountdown(t.discountEndsAt) ? (
									<Badge
										variant="secondary"
										className="text-[0.6rem] uppercase tracking-wide"
									>
										{formatCountdown(t.discountEndsAt)}
									</Badge>
								) : null}
							</div>
						) : null,
				}))}
				minColumnPx={170}
			/>
		</div>
	);
}

export function AdvancedTable({
	rows,
}: {
	rows: ProviderSections["otherRules"];
}) {
	if (!rows.length) return null;

	return (
		<div className="space-y-1.5">
			<details className="rounded-lg border border-zinc-200/70 bg-background dark:border-zinc-800">
				<summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
					<span className="text-sm font-semibold">
						Advanced & conditional pricing
					</span>
					<span className="text-xs text-muted-foreground">Show/Hide</span>
				</summary>
				<div className="px-3 pb-3">
					<div className="overflow-x-auto rounded-md border border-zinc-200/80 bg-background dark:border-zinc-800">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Meter</TableHead>
									<TableHead>Unit</TableHead>
									<TableHead>Price</TableHead>
									<TableHead>Conditions</TableHead>
									<TableHead>Rule</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((r, i) => (
									<TableRow key={i}>
										<TableCell className="text-xs">{r.meter}</TableCell>
										<TableCell className="text-xs">{r.unitLabel}</TableCell>
										<TableCell className="tabular-nums text-xs">{fmtUSD(r.price)}</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{r.conditions?.length
												? r.conditions.map((c, j) => (
														<span
															key={j}
															className="mr-2 inline-block"
														>
															{`${c.path} ${
																c.op
															} ${
																Array.isArray(c.value)
																	? JSON.stringify(c.value)
																	: String(c.value)
															}`}
														</span>
												  ))
												: "--"}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{r.ruleId || "--"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			</details>
		</div>
	);
}



