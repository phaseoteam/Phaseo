"use client";

import React from "react";
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
	PriceComparisonDirection,
	PriceComparisonKind,
	TokenTier,
	TokenTriple,
	QualityRow,
	ResolutionRow,
	ProviderSections,
	UsageRow,
	UpcomingPricingChange,
} from "./pricingHelpers";
import { fmtUSD } from "./pricingHelpers";

type PricingComparisonAccent = "batch" | null;

function renderComparisonToneClass(
	kind?: PriceComparisonKind | null,
	direction?: PriceComparisonDirection,
	accent?: PricingComparisonAccent,
) {
	if (accent === "batch") {
		return "text-xs font-semibold text-orange-700 tabular-nums dark:text-orange-300";
	}
	if (kind === "discount" || direction === "cheaper") {
		return "text-xs font-semibold text-emerald-600 tabular-nums";
	}
	if (direction === "pricier") {
		return "text-xs font-semibold text-fuchsia-700 tabular-nums";
	}
	return "text-xs font-semibold text-foreground tabular-nums";
}

function renderComparisonPrices(
	currentPrice: number,
	basePrice: number | null | undefined,
	decimals: number,
	kind?: PriceComparisonKind | null,
	direction?: PriceComparisonDirection,
	accent?: PricingComparisonAccent,
) {
	const currentClass = renderComparisonToneClass(kind, direction, accent);
	if (basePrice == null) {
		return (
			<span className={currentClass}>
				{formatUsdAligned(currentPrice, decimals)}
			</span>
		);
	}

	return (
		<>
			<span className="text-xs font-medium text-muted-foreground line-through tabular-nums">
				{formatUsdAligned(basePrice, decimals)}
			</span>
			<span className={currentClass}>
				{formatUsdAligned(currentPrice, decimals)}
			</span>
		</>
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

function normalizeResolutionKey(value: string): string {
	const label = String(value ?? "").trim().toLowerCase();
	if (!label) return "any resolution";
	const [resolutionPart, ...rest] = label.split(" - ");
	const suffix = rest.join(" - ").trim();
	const dimMatch = resolutionPart.match(/^(\d+)\s*x\s*(\d+)$/i);
	const canonicalResolution = dimMatch
		? `${Math.min(Number(dimMatch[1]), Number(dimMatch[2]))}x${Math.max(
				Number(dimMatch[1]),
				Number(dimMatch[2]),
		  )}`
		: resolutionPart.trim();
	return suffix ? `${canonicalResolution} - ${suffix}` : canonicalResolution;
}

function makeResolutionPriceKey(resolution: string, price: number): string {
	const normalizedPrice = Number.isFinite(price) ? price.toFixed(8) : "nan";
	return `${normalizeResolutionKey(resolution)}|${normalizedPrice}`;
}

function parseAudioBool(value: string): boolean | null {
	const normalized = value.trim().toLowerCase();
	if (["true", "1", "yes", "enabled", "t", "on"].includes(normalized)) return true;
	if (["false", "0", "no", "disabled", "f", "off"].includes(normalized)) return false;
	return null;
}

function inferAudioModeFromLabel(rawLabel: string): {
	mode: ResolutionRow["audioMode"];
	cleanedLabel: string;
} {
	const trimLabel = (value: string) =>
		value
			.replace(/\s*[-:,|]\s*$/g, "")
			.replace(/^\s*[-:,|]\s*/g, "")
			.replace(/\s{2,}/g, " ")
			.trim();
	const label = String(rawLabel ?? "").trim();
	if (!label) {
		return { mode: null, cleanedLabel: "Any resolution" };
	}

	const boolMatch = label.match(
		/\baudio\b[^a-z0-9]*(?:=|:|eq)?[^a-z0-9]*(true|false|1|0|yes|no|enabled|disabled)\b/i,
	);
	if (boolMatch?.[1]) {
		const boolValue = parseAudioBool(boolMatch[1]);
		const cleaned = trimLabel(label.replace(boolMatch[0], ""));
		return {
			mode: boolValue == null ? null : boolValue ? "with-audio" : "without-audio",
			cleanedLabel: cleaned || "Any resolution",
		};
	}

	if (/\b(without|no)\s+audio\b/i.test(label)) {
		const cleaned = trimLabel(label.replace(/\b(without|no)\s+audio\b/gi, ""));
		return { mode: "without-audio", cleanedLabel: cleaned || "Any resolution" };
	}

	if (/\bwith\s+audio\b/i.test(label)) {
		const cleaned = trimLabel(label.replace(/\bwith\s+audio\b/gi, ""));
		return { mode: "with-audio", cleanedLabel: cleaned || "Any resolution" };
	}

	return { mode: null, cleanedLabel: label };
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

function countUsdDecimals(value: number): number {
	const formatted = fmtUSD(value);
	const dotIndex = formatted.indexOf(".");
	return dotIndex === -1 ? 0 : formatted.length - dotIndex - 1;
}

function formatUsdAligned(value: number, decimals: number): string {
	if (!Number.isFinite(value)) return fmtUSD(value);
	return `$${value.toFixed(decimals)}`;
}

function formatTierConditionLabel(label: string): {
	shortLabel: string;
	tooltipLabel?: string;
} | null {
	const raw = String(label ?? "").trim();
	if (!raw || raw.toLowerCase() === "all usage") return null;

	const ttlMatch = raw.match(/^(.+?)\s+cache\s+ttl$/i);
	if (!ttlMatch) return { shortLabel: raw };

	const durationRaw = ttlMatch[1]?.trim() ?? "";
	const parseDuration = (
		value: string,
		re: RegExp,
		unitShort: string,
		unitLong: string,
	): { shortLabel: string; tooltipLabel: string } | null => {
		const m = value.match(re);
		if (!m?.[1]) return null;
		const amount = Number(m[1]);
		if (!Number.isFinite(amount) || amount <= 0) return null;
		const plural = amount === 1 ? unitLong : `${unitLong}s`;
		return {
			shortLabel: `${amount}${unitShort}`,
			tooltipLabel: `${amount} ${plural} cache TTL`,
		};
	};

	const minute =
		parseDuration(durationRaw, /^(\d+)\s*(?:m|min|mins|minute|minutes)$/i, "m", "minute") ??
		parseDuration(durationRaw, /^(\d+)\s*$/i, "m", "minute");
	if (minute) return minute;

	const hour = parseDuration(
		durationRaw,
		/^(\d+)\s*(?:h|hr|hrs|hour|hours)$/i,
		"h",
		"hour",
	);
	if (hour) return hour;

	const day = parseDuration(
		durationRaw,
		/^(\d+)\s*(?:d|day|days)$/i,
		"d",
		"day",
	);
	if (day) return day;

	return { shortLabel: durationRaw, tooltipLabel: raw };
}

export function TierTiles({
	tiers,
	dense = false,
	unitLabel,
	comparisonAccent = null,
}: {
	tiers: TokenTier[];
	dense?: boolean;
	unitLabel?: string;
	comparisonAccent?: PricingComparisonAccent;
}) {
	if (!tiers?.length) {
		return <div className="text-sm text-muted-foreground">--</div>;
	}
	const sharedDecimals = tiers.reduce(
		(max, tier) => Math.max(max, countUsdDecimals(tier.per1M)),
		0,
	);
	const [primaryTier, ...additionalTiers] = tiers;
	const hasAdditionalTiers = additionalTiers.length > 0;
	const renderTierRow = (tier: TokenTier, key: string | number) => (
		<div key={key} className="space-y-0.5">
			<div className="flex items-baseline gap-1">
				{renderComparisonPrices(
					tier.per1M,
					tier.basePer1M,
					sharedDecimals,
					tier.comparisonKind,
					tier.comparisonDirection,
					comparisonAccent,
				)}
				{(() => {
					const condition = formatTierConditionLabel(tier.label);
					if (!condition) return null;
					const hasTooltip =
						condition.tooltipLabel &&
						condition.tooltipLabel !== condition.shortLabel;
					return (
						<span
							className="text-xs text-muted-foreground"
							title={hasTooltip ? condition.tooltipLabel : undefined}
						>
							({condition.shortLabel})
						</span>
					);
				})()}
			</div>
		</div>
	);

	return (
		<div className={dense ? "space-y-0.5" : "space-y-1.5"}>
			<div className="space-y-0.5">
				{renderTierRow(primaryTier, "primary")}
				{!hasAdditionalTiers && unitLabel ? (
					<div className="text-[11px] text-muted-foreground">{unitLabel}</div>
				) : null}
			</div>
			{additionalTiers.map((tier, index) =>
				renderTierRow(tier, `additional-${index}`),
			)}
			{hasAdditionalTiers && unitLabel ? (
				<div className="text-[11px] text-muted-foreground">{unitLabel}</div>
			) : null}
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
	vertical = false,
	comparisonAccent = null,
}: {
	title?: string;
	triple?: TokenTriple;
	headerRight?: React.ReactNode;
	hideHeader?: boolean;
	leadingTiles?: Array<{ label: string; value: string }>;
	compact?: boolean;
	minimumSegments?: Array<"Input" | "Cache Reads" | "Cache Writes" | "Output">;
	vertical?: boolean;
	comparisonAccent?: PricingComparisonAccent;
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
	if (segments.length + leadingTiles.length === 0) return null;

	const showSegmentLabels = segments.length > 1;
	const columns = [
		...leadingTiles.map((tile) => ({
			key: `leading-${tile.label}`,
			title: tile.label,
			content: (
				<div className="text-xs font-semibold text-foreground tabular-nums">{tile.value}</div>
			),
		})),
		...segments.map((s, idx) => ({
			key: `segment-${idx}`,
			title: showSegmentLabels ? s.label : null,
			content: (
				<TierTiles
					tiers={s.tiers}
					dense={compact}
					comparisonAccent={comparisonAccent}
				/>
			),
		})),
	];
	const columnsWrapClass = vertical
		? "grid grid-cols-1 gap-1"
		: "grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:w-full sm:min-w-max sm:gap-0 sm:divide-x sm:divide-zinc-200/70 sm:dark:divide-zinc-800";
	const columnClass = vertical
		? "min-w-0 rounded-md border border-zinc-200/70 px-1 py-1 dark:border-zinc-800"
		: "min-w-0 px-1 py-1 sm:min-w-[140px] sm:flex-1 sm:px-3 sm:py-2";
	const wrapperClass = vertical ? "space-y-1" : "space-y-1.5";
	const titleClass = vertical ? "mb-0 text-xs text-muted-foreground" : "mb-0.5 text-xs text-muted-foreground";
	const contentClass = vertical ? "space-y-0" : "space-y-0.5";

	return (
		<div className={wrapperClass}>
			{!hideHeader ? (
				<div className="flex items-center justify-between">
					<h4 className="text-xs font-semibold tracking-wide text-foreground">{title}</h4>
					<span className="text-xs text-muted-foreground">{headerRight ?? "Per 1M tokens"}</span>
				</div>
			) : null}
					<div className={vertical ? "" : "w-full overflow-visible sm:overflow-x-auto"}>
						<div className={columnsWrapClass}>
								{columns.map((column) => (
									<div key={column.key} className={columnClass}>
										{column.title ? (
											<div className={titleClass}>{column.title}</div>
										) : null}
									<div className={contentClass}>{column.content}</div>
								</div>
							))}
						</div>
					</div>
				</div>
			);
}

export function ImageGenSection({
	rows,
	vertical = false,
	comparisonAccent = null,
}: {
	rows?: QualityRow[];
	vertical?: boolean;
	comparisonAccent?: PricingComparisonAccent;
}) {
	if (!rows || !rows.length) return null;

	const qualityRows = rows.map((row) => ({
		quality: row.quality.charAt(0).toUpperCase() + row.quality.slice(1),
		items: row.items,
	}));
	const sharedDecimals = qualityRows.reduce(
		(max, row) => Math.max(max, ...row.items.map((item) => countUsdDecimals(item.price))),
		0,
	);
	const columnsWrapClass = vertical
		? "grid grid-cols-1 gap-1"
		: "grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:w-full sm:min-w-max sm:gap-0 sm:divide-x sm:divide-zinc-200/70 sm:dark:divide-zinc-800";
	const columnClass = vertical
		? "min-w-0 rounded-md border border-zinc-200/70 px-1 py-1 dark:border-zinc-800"
		: "min-w-0 space-y-0.5 px-1 py-1 sm:min-w-[220px] sm:flex-1 sm:px-3 sm:py-2";
	const wrapperClass = vertical ? "space-y-1" : "space-y-1.5";
	const innerStackClass = vertical ? "space-y-0.5" : "space-y-1";

	return (
		<div className={wrapperClass}>
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold tracking-wide text-foreground">Image Quality</h4>
				<span className="text-xs text-muted-foreground">Per image</span>
			</div>
					<div className={vertical ? "" : "w-full overflow-visible sm:overflow-x-auto"}>
						<div className={columnsWrapClass}>
							{qualityRows.map((row, rowIndex) => (
								<div key={`${row.quality}-${rowIndex}`} className={columnClass}>
									<div className="text-xs text-muted-foreground">{row.quality}</div>
									<div className={innerStackClass}>
									{row.items.map((item, itemIndex) => {
									const label = item.label || "Any resolution";
									return (
										<div key={`${row.quality}-${label}-${itemIndex}`} className="space-y-0.5">
											<div className="flex items-baseline gap-1">
												{renderComparisonPrices(
													item.price,
													item.basePrice,
													sharedDecimals,
													item.comparisonKind,
													item.comparisonDirection,
													comparisonAccent,
												)}
												<span className="text-xs text-muted-foreground">{label}</span>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function VideoGenSection({
	rows,
	showAudioVariants = false,
	audioHints = [],
	vertical = false,
	comparisonAccent = null,
}: {
	rows?: ResolutionRow[];
	showAudioVariants?: boolean;
	audioHints?: Array<{
		resolution: string;
		price: number;
		audioMode: "with-audio" | "without-audio";
	}>;
	vertical?: boolean;
	comparisonAccent?: PricingComparisonAccent;
}) {
	if (!rows || !rows.length) return null;

	const byUnit: Record<string, ResolutionRow[]> = {};
	for (const r of rows) {
		(byUnit[r.unitLabel] ??= []).push(r);
	}
	const unitEntries = Object.entries(byUnit);
	const audioHintMap = new Map<string, "with-audio" | "without-audio">();
	for (const hint of audioHints) {
		audioHintMap.set(
			makeResolutionPriceKey(hint.resolution, hint.price),
			hint.audioMode,
		);
	}
	const audioModeRank = (mode?: ResolutionRow["audioMode"]) => {
		if (mode === "with-audio") return 0;
		if (mode === "without-audio") return 1;
		return 2;
	};
	const items = unitEntries.flatMap(([unit, list]) => {
		const grouped = new Map<
			string,
			{
				unit: string;
				resolution: string;
				price: number;
				audioMode: ResolutionRow["audioMode"];
				basePrice: number | null;
				comparisonKind?: PriceComparisonKind | null;
				comparisonDirection?: PriceComparisonDirection;
				discountEndsAt: string | null;
			}
		>();
		for (const row of list) {
			const raw = String(row.resolution ?? "").trim() || "Any resolution";
			const { mode: inferredAudioMode, cleanedLabel } = inferAudioModeFromLabel(raw);
			const [resolutionPart, ...rest] = cleanedLabel.split(" - ");
			const suffix = rest.join(" - ");
			const match = resolutionPart.match(/^(\d+)\s*x\s*(\d+)$/i);
			const canonicalResolution = match
				? `${Math.min(Number(match[1]), Number(match[2]))}x${Math.max(Number(match[1]), Number(match[2]))}`
				: resolutionPart;
			const canonicalLabel = suffix
				? `${canonicalResolution} - ${suffix}`
				: canonicalResolution;
			const hintAudioMode =
				audioHintMap.get(makeResolutionPriceKey(canonicalLabel, row.price)) ??
				audioHintMap.get(makeResolutionPriceKey(canonicalResolution, row.price)) ??
				null;
			const audioMode = showAudioVariants
				? (row.audioMode ?? inferredAudioMode ?? hintAudioMode ?? null)
				: null;
			const key = `${unit}|${canonicalLabel}|${audioMode ?? "none"}|${row.price}`;
			const existing = grouped.get(key) ?? {
				unit,
				resolution: canonicalLabel || "Any resolution",
				price: row.price,
				audioMode,
				basePrice: null,
				discountEndsAt: null,
			};
			const hasDiscountWindow = row.basePrice != null && Boolean(row.discountEndsAt);
			if (hasDiscountWindow || row.comparisonKind === "vs-standard") {
				const candidateBase = row.basePrice ?? null;
				const currentBase = existing.basePrice ?? null;
				if (candidateBase != null && (currentBase == null || candidateBase > currentBase)) {
					existing.basePrice = candidateBase;
					existing.discountEndsAt = row.discountEndsAt ?? null;
					existing.comparisonKind = row.comparisonKind ?? null;
					existing.comparisonDirection = row.comparisonDirection ?? null;
				}
			}
			grouped.set(key, existing);
		}
		return Array.from(grouped.values());
	});

	items.sort((a, b) => {
		const byResolution = compareResolutionLabels(a.resolution, b.resolution);
		if (byResolution !== 0) return byResolution;
		if (showAudioVariants) {
			const byAudioMode = audioModeRank(a.audioMode) - audioModeRank(b.audioMode);
			if (byAudioMode !== 0) return byAudioMode;
		}
		if (a.price !== b.price) return a.price - b.price;
		return a.resolution.localeCompare(b.resolution, undefined, {
			numeric: true,
			sensitivity: "base",
		});
	});
	const sharedDecimals = items.reduce(
		(max, item) => Math.max(max, countUsdDecimals(item.price)),
		0,
	);
	const columnsWrapClass = vertical
		? "grid grid-cols-1 gap-1"
		: "grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:w-full sm:min-w-max sm:gap-0 sm:divide-x sm:divide-zinc-200/70 sm:dark:divide-zinc-800";
	const resolutionColumnClass = vertical
		? "min-w-0 rounded-md border border-zinc-200/70 px-1 py-1 dark:border-zinc-800"
		: "min-w-0 px-1 py-1 sm:min-w-[180px] sm:flex-1 sm:px-3 sm:py-2";
	const audioColumnClass = vertical
		? "min-w-0 rounded-md border border-zinc-200/70 px-1 py-1 dark:border-zinc-800"
		: "min-w-0 px-1 py-1 sm:min-w-[220px] sm:flex-1 sm:px-3 sm:py-2";
	const wrapperClass = vertical ? "space-y-1" : "space-y-1.5";
	const itemStackClass = vertical ? "space-y-0.5" : "space-y-1";
	const unitSummaryForItems = (list: Array<{ unit: string }>): string | null => {
		const uniqueUnits = Array.from(
			new Set(
				list
					.map((item) => String(item.unit ?? "").trim())
					.filter(Boolean),
			),
		);
		if (!uniqueUnits.length) return null;
		return uniqueUnits.join(" / ");
	};

	return (
		<div className={wrapperClass}>
				{showAudioVariants ? (
						<div className={vertical ? "" : "w-full overflow-visible sm:overflow-x-auto"}>
							{(() => {
						const withAudioItems = items.filter((item) => item.audioMode === "with-audio");
						const withoutAudioItems = items.filter((item) => item.audioMode === "without-audio");
						const hasExplicitSplit = withAudioItems.length > 0 || withoutAudioItems.length > 0;
						if (!hasExplicitSplit) {
							const sortedItems = [...items].sort((a, b) => {
								const byResolution = compareResolutionLabels(a.resolution, b.resolution);
								if (byResolution !== 0) return byResolution;
								return a.price - b.price;
							});
							const unitSummary = unitSummaryForItems(sortedItems);
							return (
								<div className={columnsWrapClass}>
									<div className={resolutionColumnClass}>
										<div className={itemStackClass}>
											{sortedItems.map((item, index) => (
												<div key={`${item.unit}-${item.resolution}-${item.price}-${index}`} className="space-y-0.5">
													<div className="flex items-baseline gap-1">
														{renderComparisonPrices(
															item.price,
															item.basePrice,
															sharedDecimals,
															item.comparisonKind,
															item.comparisonDirection,
															comparisonAccent,
														)}
														<span className="text-xs text-muted-foreground">{item.resolution}</span>
													</div>
												</div>
											))}
										</div>
										{unitSummary ? (
											<div className="pt-0.5 text-[11px] text-muted-foreground">{unitSummary}</div>
										) : null}
									</div>
								</div>
							);
						}
						return (
									<div className={columnsWrapClass}>
									{[
									{
										key: "with-audio",
										title: "Video (With Audio)",
										items: withAudioItems,
									},
									{
										key: "without-audio",
										title: "Video (Without Audio)",
										items: withoutAudioItems,
									},
								].map((column) => (
									(() => {
										const sortedColumnItems = [...column.items].sort((a, b) => {
											const byResolution = compareResolutionLabels(
												a.resolution,
												b.resolution,
											);
											if (byResolution !== 0) return byResolution;
											return a.price - b.price;
										});
										const unitSummary = unitSummaryForItems(sortedColumnItems);
										return (
									<div key={column.key} className={audioColumnClass}>
									<div className="mb-0.5 text-xs text-muted-foreground">{column.title}</div>
									{sortedColumnItems.length ? (
										<>
										<div className={itemStackClass}>
										{sortedColumnItems.map((item, index) => (
											<div key={`${column.key}-${item.unit}-${item.resolution}-${index}`} className="space-y-0.5">
												<div className="flex items-baseline gap-1">
													{renderComparisonPrices(
														item.price,
														item.basePrice,
														sharedDecimals,
														item.comparisonKind,
														item.comparisonDirection,
														comparisonAccent,
													)}
													<span className="text-xs text-muted-foreground">{item.resolution}</span>
												</div>
											</div>
										))}
									</div>
									{unitSummary ? (
										<div className="pt-0.5 text-[11px] text-muted-foreground">{unitSummary}</div>
									) : null}
									</>
								) : (
									<div className="text-xs text-muted-foreground">--</div>
								)}
							</div>
									);
									})()
						))}
							</div>
						);
						})()}
						</div>
				) : (
					<div className={vertical ? "" : "w-full overflow-visible sm:overflow-x-auto"}>
						<div className={columnsWrapClass}>
							{(() => {
								const sortedItems = [...items].sort((a, b) => {
									const byResolution = compareResolutionLabels(a.resolution, b.resolution);
									if (byResolution !== 0) return byResolution;
									return a.price - b.price;
								});
								const unitSummary = unitSummaryForItems(sortedItems);
								return (
									<div className={resolutionColumnClass}>
										<div className={itemStackClass}>
											{sortedItems.map((item, index) => (
												<div key={`${item.unit}-${item.resolution}-${item.price}-${index}`} className="space-y-0.5">
													<div className="flex items-baseline gap-1">
													{renderComparisonPrices(
														item.price,
														item.basePrice,
														sharedDecimals,
														item.comparisonKind,
														item.comparisonDirection,
														comparisonAccent,
													)}
														<span className="text-xs text-muted-foreground">{item.resolution}</span>
													</div>
												</div>
											))}
										</div>
										{unitSummary ? (
											<div className="pt-0.5 text-[11px] text-muted-foreground">{unitSummary}</div>
										) : null}
									</div>
								);
							})()}
					</div>
				</div>
			)}
		</div>
	);
}

export function InputsSection({
	rows,
	title,
	compact = false,
	comparisonAccent = null,
}: {
	rows?: UsageRow[];
	title: string;
	compact?: boolean;
	comparisonAccent?: PricingComparisonAccent;
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
			comparisonKind: r.comparisonKind,
			comparisonDirection: r.comparisonDirection,
			discountEndsAt: r.discountEndsAt,
		})),
	);
	const sharedDecimals = items.reduce(
		(max, item) => Math.max(max, countUsdDecimals(item.price)),
		0,
	);

	const wrapperClass = compact ? "space-y-1" : "space-y-1.5";
	const listClass = compact ? "space-y-0.5" : "space-y-1";

	return (
		<div className={wrapperClass}>
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold tracking-wide text-foreground">{title}</h4>
				{hasSingleUnit ? <span className="text-xs text-muted-foreground">{unitEntries[0][0]}</span> : null}
			</div>
			<div className={listClass}>
				{items.map((item, index) => {
					const label = item.label && item.label !== "All usage" ? item.label : "All usage";
					return (
						<div key={`${item.unit}-${label}-${index}`} className="space-y-0.5">
							<div className="flex items-baseline gap-1">
								{renderComparisonPrices(
									item.price,
									item.basePrice,
									sharedDecimals,
									item.comparisonKind,
									item.comparisonDirection,
									comparisonAccent,
								)}
								<span className="text-xs text-muted-foreground">{label}</span>
								{hasSingleUnit ? null : <span className="text-xs text-muted-foreground/80">({item.unit})</span>}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function CacheWriteSection({
	rows,
	comparisonAccent = null,
}: {
	rows?: TokenTier[];
	comparisonAccent?: PricingComparisonAccent;
}) {
	if (!rows?.length) return null;
	const sharedDecimals = rows.reduce(
		(max, tier) => Math.max(max, countUsdDecimals(tier.per1M)),
		0,
	);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold tracking-wide text-foreground">Cache Writes</h4>
				<span className="text-xs text-muted-foreground">Per 1M tokens</span>
			</div>
			<div className="space-y-1">
				{rows.map((t, i) => (
					<div key={`cache-write-${i}`} className="space-y-0.5">
						<div className="flex items-baseline gap-1">
							{renderComparisonPrices(
								t.per1M,
								t.basePer1M,
								sharedDecimals,
								t.comparisonKind,
								t.comparisonDirection,
								comparisonAccent,
							)}
							<span className="text-xs text-muted-foreground">{t.label || "All usage"}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function RequestsSection({
	rows,
	compact = false,
	comparisonAccent = null,
}: {
	rows?: TokenTier[];
	compact?: boolean;
	comparisonAccent?: PricingComparisonAccent;
}) {
	if (!rows?.length) return null;
	const sharedDecimals = rows.reduce(
		(max, tier) => Math.max(max, countUsdDecimals(tier.price)),
		0,
	);
	const wrapperClass = compact ? "space-y-1" : "space-y-1.5";
	const listClass = compact ? "space-y-0.5" : "space-y-1";

	return (
		<div className={wrapperClass}>
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold tracking-wide text-foreground">Requests</h4>
				<span className="text-xs text-muted-foreground">Per request</span>
			</div>
			<div className={listClass}>
				{rows.map((t, i) => (
					<div key={`request-${i}`} className="space-y-0.5">
						<div className="flex items-baseline gap-1">
							{renderComparisonPrices(
								t.price,
								t.basePrice ?? t.basePer1M,
								sharedDecimals,
								t.comparisonKind,
								t.comparisonDirection,
								comparisonAccent,
							)}
							<span className="text-xs text-muted-foreground">{t.label || "All usage"}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function UpcomingPricingSection({
	rows,
	title = "Upcoming Pricing",
	compact = false,
	vertical = false,
}: {
	rows?: UpcomingPricingChange[];
	title?: string;
	compact?: boolean;
	vertical?: boolean;
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
		? "space-y-1 rounded-md border border-zinc-200/70 bg-zinc-50/70 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/25"
		: "space-y-1.5 rounded-md border border-zinc-200/70 bg-zinc-50/70 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/25";
	const gridClass =
		vertical || visibleRows.length <= 1
			? "grid-cols-1"
			: visibleRows.length === 2
			? "grid-cols-1 sm:grid-cols-2"
			: visibleRows.length === 3
			? "grid-cols-1 sm:grid-cols-3"
			: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

	return (
		<div className={sectionClass}>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
					<h4 className="text-xs font-semibold text-foreground">{title}</h4>
				</div>
				<span className="text-xs text-muted-foreground">
					{sharedTitle ? `${sharedTitle} - Scheduled` : "Scheduled"}
				</span>
			</div>
			<div className={`grid gap-2 ${gridClass}`}>
				{visibleRows.map((row, i) => {
					const effectiveDate = formatEffectiveDate(row.effectiveFrom);
					const deltaPct = formatPercentDelta(row.price, row.currentPrice);
					const trendClass =
						row.trend === "down"
							? "text-emerald-600"
							: row.trend === "up"
							? "text-amber-600"
							: "text-foreground";
					const label = hasSingleTitle
						? row.subtitle ?? row.unitLabel
						: [row.title, row.subtitle ?? row.unitLabel].filter(Boolean).join(" - ");

					const rowClass = vertical
						? "space-y-0 rounded-md border border-zinc-200/70 bg-background/70 px-1.5 py-1 dark:border-zinc-800 dark:bg-zinc-900/30"
						: "space-y-1 rounded-md border border-zinc-200/70 bg-background/70 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/30";

					return (
						<div
							key={`upcoming-${row.title}-${row.effectiveFrom}-${i}`}
							className={rowClass}
						>
							<div className="flex items-baseline gap-1.5">
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
										<span className="text-[10px] font-medium text-muted-foreground">{deltaPct}</span>
									) : null}
								</span>
								<span className="truncate text-xs text-muted-foreground">{label}</span>
							</div>
							<div className="text-xs text-muted-foreground/90">
								<span>{effectiveDate ?? "--"}</span>
								{row.currentPrice != null ? (
									<span className="text-muted-foreground/80"> - was {fmtUSD(row.currentPrice)}</span>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
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
														<span key={j} className="mr-2 inline-block">
															{`${c.path} ${c.op} ${
																Array.isArray(c.value)
																	? JSON.stringify(c.value)
																	: String(c.value)
															}`}
														</span>
												  ))
												: "--"}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">{r.ruleId || "--"}</TableCell>
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
