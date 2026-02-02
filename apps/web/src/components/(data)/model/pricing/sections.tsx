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
	if (!tiers?.length)
		return <div className="text-sm text-muted-foreground">—</div>;

	return (
		<div className="space-y-2">
			{tiers.map((t, i) => (
				<div key={i}>
					{t.label === "All usage" ? (
						<div className="space-y-1">
							{t.basePer1M != null ? (
								<div className="text-sm font-semibold text-emerald-600">
									{fmtUSD(t.per1M)}
								</div>
							) : (
								<div className="text-sm font-semibold">
									{fmtUSD(t.per1M)}
								</div>
							)}
							{t.basePer1M != null ? (
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span className="line-through">
										{fmtUSD(t.basePer1M)}
									</span>
									{formatCountdown(t.discountEndsAt) ? (
										<Badge
											variant="secondary"
											className="text-[0.65rem] uppercase tracking-wide"
										>
											{formatCountdown(t.discountEndsAt)}
										</Badge>
									) : null}
								</div>
							) : null}
						</div>
					) : (
						<div className="space-y-1">
							<div className="flex justify-between items-center">
								<span
									className={
										t.basePer1M != null
											? "text-sm font-semibold text-emerald-600"
											: "text-sm font-semibold"
									}
								>
									{fmtUSD(t.per1M)}
								</span>
								<span className="text-xs text-muted-foreground">
									{t.label}
								</span>
							</div>
							{t.basePer1M != null ? (
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span className="line-through">
										{fmtUSD(t.basePer1M)}
									</span>
									{formatCountdown(t.discountEndsAt) ? (
										<Badge
											variant="secondary"
											className="text-[0.65rem] uppercase tracking-wide"
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
}: {
	title: string;
	triple?: TokenTriple;
}) {
	if (!triple) return null;
	const segments = [
		{ label: "Input", tiers: triple.in },
		{ label: "Cached input", tiers: triple.cached },
		{ label: "Output", tiers: triple.out },
	].filter((s) => s.tiers.length > 0);
	if (!segments.length) return null;
	const gridCols =
		segments.length === 1
			? "grid-cols-1"
			: segments.length === 2
			? "grid-cols-1 sm:grid-cols-2"
			: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
	const renderSegments = (items: typeof segments) => (
		<div className={`grid ${gridCols} gap-3`}>
			{items.map((s, idx) => (
				<div key={idx} className="rounded-lg border p-3">
					<div className="text-xs text-muted-foreground mb-2">
						{s.label}
					</div>
					<TierTiles tiers={s.tiers} />
				</div>
			))}
		</div>
	);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">{title}</h4>
				<span className="text-xs text-muted-foreground">
					Per 1M tokens
				</span>
			</div>
			{renderSegments(segments)}
		</div>
	);
}

function Tile({ title, value }: { title: string; value: string }) {
	return (
		<div className="rounded-lg border p-4">
			<div className="text-xs text-muted-foreground mb-1">{title}</div>
			<div className="text-xl font-semibold">{value}</div>
		</div>
	);
}

export function ImageGenSection({ rows }: { rows?: QualityRow[] }) {
	if (!rows || !rows.length) return null;
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">Image generation</h4>
				<span className="text-xs text-muted-foreground">Per image</span>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{rows.map((q) => (
					<div key={q.quality} className="rounded-lg border p-3">
						<div className="text-xs text-muted-foreground mb-2">
							{q.quality.charAt(0).toUpperCase() +
								q.quality.slice(1)}
						</div>
						<div className="space-y-2">
							{q.items.map((it) => (
								<div
									key={it.label}
									className="flex justify-between items-center"
								>
									<span className="text-sm font-semibold">
										{fmtUSD(it.price)}
									</span>
									<span className="text-xs text-muted-foreground">
										{it.label}
									</span>
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
	for (const r of rows) (byUnit[r.unitLabel] ??= []).push(r);
	const unitEntries = Object.entries(byUnit);
	const hasSingleUnit = unitEntries.length === 1;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">Video generation</h4>
				{hasSingleUnit ? (
					<span className="text-xs text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			{unitEntries.map(([unit, list]) => (
				<div key={unit} className="space-y-2">
					{!hasSingleUnit ? (
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								{unit}
							</span>
						</div>
					) : null}
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{list
							.sort((a, b) =>
								a.resolution.localeCompare(b.resolution)
							)
							.map((r, i) => (
								<div key={i} className="rounded-lg border p-3">
									<div className="flex justify-between items-center">
										<span className="text-sm font-semibold">
											{fmtUSD(r.price)}
										</span>
										<span className="text-xs text-muted-foreground">
											{r.resolution}
										</span>
									</div>
								</div>
							))}
					</div>
				</div>
			))}
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
	for (const r of rows) (byUnit[r.unitLabel] ??= []).push(r);
	const unitEntries = Object.entries(byUnit);
	const hasSingleUnit = unitEntries.length === 1;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">{title}</h4>
				{hasSingleUnit ? (
					<span className="text-xs text-muted-foreground">
						{unitEntries[0][0]}
					</span>
				) : null}
			</div>
			{unitEntries.map(([unit, list]) => (
				<div key={unit} className="space-y-2">
					{!hasSingleUnit ? (
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								{unit}
							</span>
						</div>
					) : null}
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{list.map((r, i) => (
							<div key={i} className="rounded-lg border p-3">
								{r.label === "All usage" ? (
									<div className="text-sm font-semibold">
										{fmtUSD(r.price)}
									</div>
								) : (
									<div className="flex justify-between items-center">
										<span className="text-sm font-semibold">
											{fmtUSD(r.price)}
										</span>
										<span className="text-xs text-muted-foreground">
											{r.label}
										</span>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

export function CacheWriteSection({ rows }: { rows?: TokenTier[] }) {
	if (!rows?.length) return null;
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">Cache Writes</h4>
				<span className="text-xs text-muted-foreground">
					Per 1M tokens
				</span>
			</div>
			<div className="rounded-lg border p-3">
				<div className="space-y-2">
					{rows.map((t, i) => (
						<div key={i}>
							{t.label === "All usage" ? (
								<div className="text-sm font-semibold">
									{fmtUSD(t.per1M)}
								</div>
							) : (
								<div className="flex justify-between items-center">
									<span className="text-sm font-semibold">
										{fmtUSD(t.per1M)}
									</span>
									<span className="text-xs text-muted-foreground">
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
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold">Requests</h4>
				<span className="text-xs text-muted-foreground">
					Per request
				</span>
			</div>
			<div className="rounded-lg border p-3">
				<div className="space-y-2">
					{rows.map((t, i) => (
						<div key={i}>
							{t.label === "All usage" ? (
								<div className="text-sm font-semibold">
									{fmtUSD(t.price)}
								</div>
							) : (
								<div className="flex justify-between items-center">
									<span className="text-sm font-semibold">
										{fmtUSD(t.price)}
									</span>
									<span className="text-xs text-muted-foreground">
										{t.label}
									</span>
								</div>
							)}
							{t.basePer1M != null ? (
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span className="line-through">
										{fmtUSD(t.basePer1M)}
									</span>
									{formatCountdown(t.discountEndsAt) ? (
										<Badge
											variant="secondary"
											className="text-[0.65rem] uppercase tracking-wide"
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
		<div className="space-y-2">
			<details className="rounded-lg border">
				<summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between">
					<span className="text-sm font-semibold">
						Advanced & conditional pricing
					</span>
					<span className="text-xs text-muted-foreground">
						Show/Hide
					</span>
				</summary>
				<div className="px-3 pb-3">
					<div className="overflow-x-auto rounded-lg border">
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
										<TableCell className="text-xs">
											{r.meter}
										</TableCell>
										<TableCell className="text-xs">
											{r.unitLabel}
										</TableCell>
										<TableCell>{fmtUSD(r.price)}</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{r.conditions?.length
												? r.conditions.map((c, j) => (
														<span
															key={j}
															className="inline-block mr-2"
														>
															{`${c.path} ${
																c.op
															} ${
																Array.isArray(
																	c.value
																)
																	? JSON.stringify(
																			c.value
																	  )
																	: String(
																			c.value
																	  )
															}`}
														</span>
												  ))
												: "—"}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{r.ruleId || "—"}
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
