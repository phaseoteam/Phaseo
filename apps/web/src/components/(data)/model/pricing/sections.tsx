"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
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
	UpcomingPricingChange,
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

function renderDiscountFooter(basePrice?: number | null, discountEndsAt?: string | null) {
	if (basePrice == null) return null;
	const countdown = formatCountdown(discountEndsAt);
	return (
		<div className="flex items-center justify-between">
			<span className="line-through tabular-nums">{fmtUSD(basePrice)}</span>
			{countdown ? (
				<Badge variant="secondary" className="text-[0.6rem] tracking-wide">
					{countdown}
				</Badge>
			) : null}
		</div>
	);
}

function formatEffectiveDate(iso?: string | null) {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const now = new Date();
	const includeYear = d.getFullYear() !== now.getFullYear();
	return d.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		...(includeYear ? { year: "numeric" as const } : {}),
	});
}

function resolutionSortValue(label: string): number {
	const pMatches = Array.from(label.matchAll(/(\d+)\s*p/gi)).map((m) => Number(m[1]));
	if (pMatches.length) return Math.min(...pMatches);

	const kMatch = label.match(/(\d+(?:\.\d+)?)\s*k\b/i);
	if (kMatch) return Number(kMatch[1]) * 1000;

	const dimMatch = label.match(/(\d+)\s*x\s*(\d+)/i);
	if (dimMatch) {
		const a = Number(dimMatch[1]);
		const b = Number(dimMatch[2]);
		if (Number.isFinite(a) && Number.isFinite(b)) return Math.min(a, b);
	}

	return Number.POSITIVE_INFINITY;
}

function compareResolutionLabels(a: string, b: string): number {
	const av = resolutionSortValue(a);
	const bv = resolutionSortValue(b);
	if (Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return av - bv;
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function formatPercentDelta(nextPrice: number, currentPrice?: number | null): string | null {
	if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
	if (!Number.isFinite(nextPrice)) return null;
	const deltaPct = ((nextPrice - currentPrice) / currentPrice) * 100;
	const abs = Math.abs(deltaPct);
	const digits = abs >= 10 ? 0 : 1;
	const formattedAbs = abs.toFixed(digits).replace(/\.0$/, "");
	if (deltaPct > 0) return `+${formattedAbs}%`;
	if (deltaPct < 0) return `-${formattedAbs}%`;
	return "0%";
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
		<div className="w-full overflow-x-auto">
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
						<div className="text-xs font-semibold text-foreground tabular-nums">
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
									? "text-xs font-semibold text-emerald-600 tabular-nums"
									: "text-xs font-semibold text-foreground tabular-nums"
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
											className="text-[0.6rem] tracking-wide"
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
	minimumSegments = [],
}: {
	title?: string;
	triple?: TokenTriple;
	headerRight?: React.ReactNode;
	hideHeader?: boolean;
	leadingTiles?: Array<{ label: string; value: string }>;
	compact?: boolean;
	minimumSegments?: Array<"Input" | "Cache Reads" | "Cache Writes" | "Output">;
}) {
	if (!triple) return null;
	const baseSegments = [
		{ label: "Input", tiers: triple.in },
		{ label: "Cache Reads", tiers: triple.cached },
		{ label: "Cache Writes", tiers: triple.write },
		{ label: "Output", tiers: triple.out },
	] as const;
	const minimum = new Set(minimumSegments);
	const segments = baseSegments.filter(
		(segment) => segment.tiers.length > 0 || minimum.has(segment.label),
	);
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
						<h4 className="text-xs font-semibold tracking-wide text-foreground">
							{title}
						</h4>
						<span className="text-xs text-muted-foreground">{headerRight ?? "Per 1M tokens"}</span>
				</div>
			) : null}
			{compact ? (
				<div className="w-full overflow-x-auto">
					<div className="flex w-full min-w-[540px] divide-x divide-zinc-200/70 dark:divide-zinc-800">
						{leadingTiles.map((tile) => (
							<div key={tile.label} className="min-w-0 flex-1 px-3 py-2">
								<div className="mb-0.5 text-xs text-muted-foreground">
									{tile.label}
								</div>
								<div className="text-xs font-semibold text-foreground tabular-nums">
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
							<div className="text-xs font-semibold text-foreground tabular-nums">
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
					<h4 className="text-xs font-semibold tracking-wide text-foreground">
						Image Generation
					</h4>
					<span className="text-xs text-muted-foreground">Per image</span>
				</div>
			<div className="space-y-1.5">
				{qualityRows.map((row, rowIndex) => (
					<div
						key={`${row.quality}-${rowIndex}`}
						className="w-full overflow-x-auto"
					>
						<div className="flex w-full min-w-max divide-x divide-zinc-200/70 dark:divide-zinc-800">
								<div className="min-w-[140px] px-3 py-2">
									<div className="text-xs text-muted-foreground">Quality</div>
										<div className="text-xs font-semibold tracking-wide text-foreground">
											{row.quality}
										</div>
								</div>
							{row.items.map((item, itemIndex) => (
								<div
									key={`${row.quality}-${item.label}-${itemIndex}`}
									className="min-w-[170px] flex-1 px-3 py-2"
								>
									<div className="mb-0.5 text-xs text-muted-foreground">
										{item.label || "Any resolution"}
									</div>
									<div className="text-xs font-semibold text-foreground tabular-nums">
										{fmtUSD(item.price)}
									</div>
									{item.basePrice != null ? (
										<div className="mt-0.5 text-xs text-muted-foreground">
											{renderDiscountFooter(item.basePrice, item.discountEndsAt)}
										</div>
									) : null}
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
	const items = unitEntries.flatMap(([unit, list]) => {
		const groupedByPrice = new Map<number, ResolutionRow[]>();
		for (const row of list) {
			const existing = groupedByPrice.get(row.price) ?? [];
			existing.push(row);
			groupedByPrice.set(row.price, existing);
		}

		return Array.from(groupedByPrice.entries()).map(([price, groupedRows]) => {
			const byCanonicalLabel = new Map<string, Set<string>>();
			for (const row of groupedRows) {
				const raw = String(row.resolution ?? "").trim() || "Any resolution";
				const [resolutionPart, ...rest] = raw.split(" - ");
				const suffix = rest.join(" - ");
				const match = resolutionPart.match(/^(\d+)\s*x\s*(\d+)$/i);
				const canonicalResolution = match
					? `${Math.min(Number(match[1]), Number(match[2]))}x${Math.max(Number(match[1]), Number(match[2]))}`
					: resolutionPart;
				const canonicalLabel = suffix
					? `${canonicalResolution} - ${suffix}`
					: canonicalResolution;
				const variants = byCanonicalLabel.get(canonicalLabel) ?? new Set<string>();
				variants.add(raw);
				byCanonicalLabel.set(canonicalLabel, variants);
			}

			const combinedResolution = Array.from(byCanonicalLabel.values())
				.map((variants) => {
					const labels = Array.from(variants).sort(compareResolutionLabels);
					return labels.join(" / ");
				})
				.sort(compareResolutionLabels)
				.join(", ");
			const discountRow = groupedRows
				.filter((row) => row.basePrice != null && row.discountEndsAt)
				.sort((a, b) => (b.basePrice ?? 0) - (a.basePrice ?? 0))[0];

			return {
				unit,
				resolution: combinedResolution || "Any resolution",
				price,
				basePrice: discountRow?.basePrice ?? null,
				discountEndsAt: discountRow?.discountEndsAt ?? null,
			};
		});
	});
		return (
			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<h4 className="text-xs font-semibold tracking-wide text-foreground">
						Video Generation
					</h4>
				{hasSingleUnit ? (
					<span className="text-xs text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			<DividerColumns
				columns={items
					.sort((a, b) => {
						if (a.price !== b.price) return a.price - b.price;
						return compareResolutionLabels(a.resolution, b.resolution);
					})
					.map((item, i) => ({
						id: `${item.unit}-${item.resolution}-${i}`,
						title: item.resolution,
						subtitle: hasSingleUnit ? undefined : item.unit,
						value: fmtUSD(item.price),
						footer: renderDiscountFooter(item.basePrice, item.discountEndsAt),
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
					<h4 className="text-xs font-semibold tracking-wide text-foreground">
						{title}
					</h4>
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
					footer: renderDiscountFooter(item.basePrice, item.discountEndsAt),
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
					<h4 className="text-xs font-semibold tracking-wide text-foreground">
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
					footer: renderDiscountFooter(t.basePer1M, t.discountEndsAt),
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
					<h4 className="text-xs font-semibold tracking-wide text-foreground">
						Requests
					</h4>
				<span className="text-xs text-muted-foreground">Per request</span>
			</div>
			<DividerColumns
				columns={rows.map((t, i) => ({
					id: `request-${i}`,
					title: t.label || "All usage",
					value: fmtUSD(t.price),
					footer: renderDiscountFooter(t.basePrice ?? t.basePer1M, t.discountEndsAt),
				}))}
				minColumnPx={170}
			/>
		</div>
	);
}

export function UpcomingPricingSection({
	rows,
	title = "Upcoming Pricing",
	compact = false,
}: {
	rows?: UpcomingPricingChange[];
	title?: string;
	compact?: boolean;
}) {
	if (!rows?.length) return null;

	const orderedRows = [...rows].sort((a, b) => {
		const aFrom = new Date(a.effectiveFrom).getTime();
		const bFrom = new Date(b.effectiveFrom).getTime();
		if (aFrom !== bFrom) return aFrom - bFrom;
		if (a.title !== b.title) return a.title.localeCompare(b.title);
		return compareResolutionLabels(a.subtitle ?? "", b.subtitle ?? "");
	});
	const visibleRows = orderedRows.slice(0, 4);
	const remaining = rows.length - visibleRows.length;
	const hasSingleTitle = new Set(visibleRows.map((row) => row.title)).size === 1;
	const sharedTitle = hasSingleTitle ? visibleRows[0]?.title : null;
	const sectionClass = compact
		? "space-y-0.5 rounded-md border border-zinc-200/70 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/25"
		: "space-y-1 rounded-md border border-zinc-200/70 bg-zinc-50/70 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/25";

	return (
		<div className={sectionClass}>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
					<h4 className="text-xs font-semibold text-foreground">{title}</h4>
				</div>
				<span className="text-xs text-muted-foreground">
					{sharedTitle ? `${sharedTitle} · Scheduled` : "Scheduled"}
				</span>
			</div>
			<DividerColumns
				columns={visibleRows.map((row, i) => {
					const effectiveDate = formatEffectiveDate(row.effectiveFrom);
					const deltaPct = formatPercentDelta(row.price, row.currentPrice);
					const trendClass =
						row.trend === "down"
							? "text-emerald-600"
							: row.trend === "up"
							? "text-amber-600"
							: "text-foreground";
					return {
						id: `upcoming-${row.title}-${row.effectiveFrom}-${i}`,
						title: hasSingleTitle ? row.subtitle ?? row.unitLabel : row.title,
						subtitle: hasSingleTitle ? undefined : row.subtitle ?? row.unitLabel,
						value: (
							<span className={cn("inline-flex items-center gap-1 tabular-nums", trendClass)}>
								{row.trend === "down" ? (
									<ArrowDownRight className="h-3.5 w-3.5" />
								) : row.trend === "up" ? (
									<ArrowUpRight className="h-3.5 w-3.5" />
								) : row.trend === "flat" ? (
									<Minus className="h-3.5 w-3.5" />
								) : null}
								{fmtUSD(row.price)}
								{deltaPct ? (
									<span className="text-[10px] font-medium text-muted-foreground">
										{deltaPct}
									</span>
								) : null}
							</span>
						),
						footer: (
							<span className="inline-flex items-center gap-1">
								<span>{effectiveDate ?? "--"}</span>
								{row.currentPrice != null ? (
									<span className="text-muted-foreground/80">
										· was {fmtUSD(row.currentPrice)}
									</span>
								) : null}
							</span>
						),
					};
				})}
				minColumnPx={compact ? 130 : 150}
			/>
			{remaining > 0 ? (
				<p className="text-xs text-muted-foreground">
					+{remaining} more scheduled change{remaining > 1 ? "s" : ""}
				</p>
			) : null}
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
						<span className="text-xs font-semibold tracking-wide text-foreground">
							Advanced & Conditional Pricing
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



