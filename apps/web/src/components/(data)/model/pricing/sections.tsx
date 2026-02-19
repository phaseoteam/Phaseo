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

export function TierTiles({ tiers }: { tiers: TokenTier[] }) {
	if (!tiers?.length) {
		return <div className="text-xs text-muted-foreground">--</div>;
	}

	return (
		<div className="space-y-1.5">
			{tiers.map((t, i) => (
				<div key={i}>
					{t.label === "All usage" ? (
						<div className="space-y-0.5">
							{t.basePer1M != null ? (
								<div className="text-xs font-semibold text-emerald-600">
									{fmtUSD(t.per1M)}
								</div>
							) : (
								<div className="text-xs font-semibold">
									{fmtUSD(t.per1M)}
								</div>
							)}
							{t.basePer1M != null ? (
								<div className="flex items-center justify-between text-[11px] text-muted-foreground">
									<span className="line-through">
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
					) : (
						<div className="space-y-0.5">
							<div className="flex items-center justify-between">
								<span
									className={
										t.basePer1M != null
											? "text-xs font-semibold text-emerald-600"
											: "text-xs font-semibold"
									}
								>
									{fmtUSD(t.per1M)}
								</span>
								<span className="text-[11px] text-muted-foreground">
									{t.label}
								</span>
							</div>
							{t.basePer1M != null ? (
								<div className="flex items-center justify-between text-[11px] text-muted-foreground">
									<span className="line-through">
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
					)}
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
}: {
	title?: string;
	triple?: TokenTriple;
	headerRight?: React.ReactNode;
	hideHeader?: boolean;
	leadingTiles?: Array<{ label: string; value: string }>;
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
		<div className="space-y-1">
			{!hideHeader ? (
				<div className="flex items-center justify-between">
					<h4 className="text-xs font-semibold uppercase tracking-wide">{title}</h4>
					<span className="text-[11px] text-muted-foreground">{headerRight ?? "Per 1M tokens"}</span>
				</div>
			) : null}
			<div className={`grid gap-1 ${gridClass}`}>
				{leadingTiles.map((tile) => (
					<div key={tile.label} className="rounded-md border p-2">
						<div className="mb-0.5 text-[11px] text-muted-foreground">
							{tile.label}
						</div>
						<div className="text-xs font-semibold">{tile.value}</div>
					</div>
				))}
				{segments.map((s, idx) => (
					<div key={idx} className="rounded-md border p-2">
						{showSegmentLabels ? (
							<div className="mb-0.5 text-[11px] text-muted-foreground">
								{s.label}
							</div>
						) : null}
						<TierTiles tiers={s.tiers} />
					</div>
				))}
			</div>
		</div>
	);
}

function Tile({ title, value }: { title: string; value: string }) {
	return (
		<div className="rounded-md border p-2.5">
			<div className="mb-1 text-[11px] text-muted-foreground">{title}</div>
			<div className="text-lg font-semibold leading-tight">{value}</div>
		</div>
	);
}

export function ImageGenSection({ rows }: { rows?: QualityRow[] }) {
	if (!rows || !rows.length) return null;

	const items = rows.flatMap((q) =>
		q.items.map((it) => ({
			quality: q.quality.charAt(0).toUpperCase() + q.quality.slice(1),
			label: it.label,
			price: it.price,
		}))
	);
	const gridClass =
		items.length <= 1
			? "grid-cols-1"
			: items.length === 2
			? "grid-cols-2"
			: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold uppercase tracking-wide">
					Image generation
				</h4>
				<span className="text-[11px] text-muted-foreground">Per image</span>
			</div>
			<div className={`grid gap-1 ${gridClass}`}>
				{items.map((item, index) => (
					<div
						key={`${item.quality}-${item.label}-${index}`}
						className="rounded-md border p-2"
					>
						<div className="mb-0.5 text-[11px] text-muted-foreground">
							{item.quality}
						</div>
						{item.label ? (
							<div className="mb-0.5 text-[11px] text-muted-foreground/80">
								{item.label}
							</div>
						) : null}
						<div className="text-xs font-semibold">{fmtUSD(item.price)}</div>
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
	const gridClass =
		items.length <= 1
			? "grid-cols-1"
			: items.length === 2
			? "grid-cols-2"
			: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold uppercase tracking-wide">
					Video generation
				</h4>
				{hasSingleUnit ? (
					<span className="text-[11px] text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			<div className={`grid gap-1 ${gridClass}`}>
				{items
					.sort((a, b) => a.resolution.localeCompare(b.resolution))
					.map((item, i) => (
						<div key={`${item.unit}-${item.resolution}-${i}`} className="rounded-md border p-2">
							<div className="mb-0.5 text-[11px] text-muted-foreground">
								{item.resolution}
							</div>
							{!hasSingleUnit ? (
								<div className="mb-0.5 text-[11px] text-muted-foreground/80">
									{item.unit}
								</div>
							) : null}
							<div className="text-xs font-semibold">{fmtUSD(item.price)}</div>
						</div>
					))}
			</div>
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
	const gridClass =
		items.length <= 1
			? "grid-cols-1"
			: items.length === 2
			? "grid-cols-2"
			: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold uppercase tracking-wide">{title}</h4>
				{hasSingleUnit ? (
					<span className="text-[11px] text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			<div className={`grid gap-1 ${gridClass}`}>
				{items.map((item, index) => (
					<div key={`${item.unit}-${item.label}-${index}`} className="rounded-md border p-2">
						{item.label && item.label !== "All usage" ? (
							<div className="mb-0.5 text-[11px] text-muted-foreground">
								{item.label}
							</div>
						) : null}
						{!hasSingleUnit ? (
							<div className="mb-0.5 text-[11px] text-muted-foreground/80">
								{item.unit}
							</div>
						) : null}
						<div className="text-xs font-semibold">{fmtUSD(item.price)}</div>
						{item.basePrice != null ? (
							<div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
								<span className="line-through">{fmtUSD(item.basePrice)}</span>
								{formatCountdown(item.discountEndsAt) ? (
									<Badge
										variant="secondary"
										className="text-[0.6rem] uppercase tracking-wide"
									>
										{formatCountdown(item.discountEndsAt)}
									</Badge>
								) : null}
							</div>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
export function CacheWriteSection({ rows }: { rows?: TokenTier[] }) {
	if (!rows?.length) return null;

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold uppercase tracking-wide">
					Cache Writes
				</h4>
				<span className="text-[11px] text-muted-foreground">
					Per 1M tokens
				</span>
			</div>
			<div className="rounded-md border p-2">
				<div className="space-y-1">
					{rows.map((t, i) => (
						<div key={i}>
							{t.label === "All usage" ? (
								<div className="text-xs font-semibold">
									{fmtUSD(t.per1M)}
								</div>
							) : (
								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold">
										{fmtUSD(t.per1M)}
									</span>
									<span className="text-[11px] text-muted-foreground">
										{t.label}
									</span>
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function RequestsSection({ rows }: { rows?: TokenTier[] }) {
	if (!rows?.length) return null;

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-semibold uppercase tracking-wide">Requests</h4>
				<span className="text-[11px] text-muted-foreground">Per request</span>
			</div>
			<div className="rounded-md border p-2">
				<div className="space-y-1">
					{rows.map((t, i) => (
						<div key={i}>
							{t.label === "All usage" ? (
								<div className="text-xs font-semibold">
									{fmtUSD(t.price)}
								</div>
							) : (
								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold">
										{fmtUSD(t.price)}
									</span>
									<span className="text-[11px] text-muted-foreground">
										{t.label}
									</span>
								</div>
							)}
							{t.basePer1M != null ? (
								<div className="flex items-center justify-between text-[11px] text-muted-foreground">
									<span className="line-through">
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
					))}
				</div>
			</div>
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
			<details className="rounded-md border">
				<summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-2">
					<span className="text-xs font-semibold uppercase tracking-wide">
						Advanced & conditional pricing
					</span>
					<span className="text-[11px] text-muted-foreground">Show/Hide</span>
				</summary>
				<div className="px-2.5 pb-2.5">
					<div className="overflow-x-auto rounded-md border">
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
										<TableCell>{fmtUSD(r.price)}</TableCell>
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



