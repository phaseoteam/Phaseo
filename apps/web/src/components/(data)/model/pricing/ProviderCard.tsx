"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeX, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	TokenTripleSection,
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	CacheWriteSection,
	RequestsSection,
} from "@/components/(data)/model/pricing/sections";
import ProviderModelParameters from "@/components/(data)/model/pricing/ProviderModelParameters";
import {
	buildProviderSections,
	fmtUSD,
} from "@/components/(data)/model/pricing/pricingHelpers";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ProviderRuntimeStats } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatus } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import { Logo } from "@/components/Logo";
import ProviderInfoHoverIcons from "@/components/(data)/model/ProviderInfoHoverIcons";

function formatLatencySeconds(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	const seconds = value / 1000;
	const decimals = seconds >= 10 ? 1 : 2;
	return `${seconds.toFixed(decimals)}s`;
}

function formatThroughputValue(value: number | null | undefined): string | null {
	if (value == null || !Number.isFinite(value)) return null;
	return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPercent(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function uptimeBarColorClass(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "bg-muted";
	if (value > 99) return "bg-emerald-500";
	if (value >= 90) return "bg-amber-500";
	return "bg-red-500";
}

function uptimeBarCount(value: number | null | undefined): number {
	if (value == null || !Number.isFinite(value)) return 0;
	if (value > 99) return 3;
	if (value >= 90) return 2;
	return 1;
}

function formatTokenLimit(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
	return `${Math.round(value)}`;
}

function formatTokenLimit1dp(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(0)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return `${value.toFixed(1)}`;
}

function formatLeavingDate(value: string, now: Date): string {
	const to = new Date(value);
	const includeYear = to.getFullYear() !== now.getFullYear();
	return to.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "long",
		...(includeYear ? { year: "numeric" as const } : {}),
	});
}

export default function ProviderCard({
	provider,
	plan,
	runtimeStats,
	routingStatus,
}: {
	provider: ProviderPricing;
	plan: string;
	runtimeStats: ProviderRuntimeStats | null;
	routingStatus: ProviderRoutingStatus | null;
}) {
	const sec = useMemo(() => buildProviderSections(provider, plan), [provider, plan]);

	const now = new Date();

	const planRules = provider.pricing_rules.filter(
		(r) => (r.pricing_plan || "standard") === plan
	);
	const hasPlanPricing = planRules.length > 0;
	const planModelKeys = new Set(planRules.map((r) => r.model_key));
	const matchingProviderModel = provider.provider_models.find((pm) =>
		planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
	);
	const isActiveGateway = matchingProviderModel?.is_active_gateway ?? false;

	const leavingSoonRule = planRules
		.filter((r) => {
			if (!r.effective_to) return false;
			const to = new Date(r.effective_to).getTime();
			return to > now.getTime();
		})
		.sort(
			(a, b) =>
				new Date(a.effective_to!).getTime() -
				new Date(b.effective_to!).getTime()
		)[0];

	let status: "Active" | "Leaving Soon" | "Not Available";
	let statusIcon: React.ElementType;
	let statusClass: string;

	if (isActiveGateway && leavingSoonRule) {
		status = "Leaving Soon";
		statusIcon = AlertTriangle;
		statusClass = "h-3.5 w-3.5 text-amber-500";
	} else if (isActiveGateway) {
		status = "Active";
		statusIcon = AlertTriangle;
		statusClass = "h-3.5 w-3.5 text-emerald-500";
	} else {
		status = "Not Available";
		statusIcon = BadgeX;
		statusClass = "h-3.5 w-3.5 text-red-500";
	}

	const showPrimaryStatusBadge =
		status === "Leaving Soon" || status === "Not Available";
	const statusBadgeLabel =
		status === "Leaving Soon" && leavingSoonRule?.effective_to
			? `Leaving on ${formatLeavingDate(leavingSoonRule.effective_to, now)}`
			: status;

	const isFreePlan = plan === "free";
	const imageInputs = sec.mediaInputs?.filter((r) => r.mod === "image") ?? [];
	const videoInputs = sec.mediaInputs?.filter((r) => r.mod === "video") ?? [];
	const textProviderModels = provider.provider_models.filter(
		(pm) =>
			pm.endpoint === "text.generate" &&
			pm.is_active_gateway &&
			planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
	);
	const maxFrom = (values: Array<number | null | undefined>) => {
		const nums = values.filter(
			(v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
		);
		return nums.length ? Math.max(...nums) : null;
	};
	const maxOutputTokens = maxFrom(
		textProviderModels.map((pm) => pm.max_output_tokens)
	);
	const maxContextTokens = maxFrom(
		textProviderModels.map((pm) => pm.context_length)
	);
	const textLimitMetrics = [
		maxContextTokens !== null
			? { label: "Total Context", value: formatTokenLimit1dp(maxContextTokens) }
			: null,
		maxOutputTokens !== null
			? { label: "Max output", value: formatTokenLimit(maxOutputTokens) }
			: null,
	].filter((tile): tile is { label: string; value: string } => Boolean(tile));
	const tokenTypeCount = [
		Boolean(sec.textTokens),
		Boolean(sec.imageTokens),
		Boolean(sec.audioTokens),
		Boolean(sec.videoTokens),
	].filter(Boolean).length;
	const showTextTokenHeader = tokenTypeCount > 1;
	const infoScope = matchingProviderModel
		? provider.provider_models.filter(
				(pm) =>
					planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
		  )
		: provider.provider_models;
	const providerModelSlugs = infoScope.map((pm) => pm.provider_model_slug);
	const quantizationSchemes = infoScope.map((pm) => pm.quantization_scheme);
	const allEmpty =
		!sec.textTokens &&
		!sec.imageTokens &&
		!sec.audioTokens &&
		!sec.videoTokens &&
		!sec.imageGen &&
		!sec.videoGen &&
		!imageInputs.length &&
		!videoInputs.length &&
		!sec.cacheWrites?.length &&
		!sec.requests?.length &&
		!sec.otherRules.length;

	if (!hasPlanPricing) return null;
	if (allEmpty && !isFreePlan) return null;

	const uptimePct = runtimeStats?.uptimePct3d;
	const throughputValue = formatThroughputValue(runtimeStats?.throughput30m);
	const uptimeByDay = runtimeStats?.uptimeDaily3d ?? [];
	const uptimeBars = [2, 1, 0].map((dayOffset) => {
		const match = uptimeByDay.find((d) => d.dayOffset === dayOffset);
		return {
			dayOffset,
			label:
				dayOffset === 0
					? "today"
					: dayOffset === 1
					? "yesterday"
					: `${dayOffset} days ago`,
			uptimePct: match?.uptimePct ?? null,
		};
	});
	const headerMetrics = [
		...textLimitMetrics.map((metric) => ({
			label: metric.label,
			value: metric.value as React.ReactNode,
		})),
		{
			label: "Latency",
			value: formatLatencySeconds(runtimeStats?.latencyMs30m) as React.ReactNode,
		},
		{
			label: "Throughput",
			value: throughputValue ? (
				<>
					{throughputValue}
					<span className="ml-0.5 text-[0.75em] font-medium">tps</span>
				</>
			) : (
				"--"
			),
		},
		{
			label: "Uptime",
			value: (
				<div
					className="mt-1.5 flex items-center justify-center gap-[3px]"
					aria-label={`Uptime ${formatPercent(uptimePct)}`}
				>
					{uptimeBars.map((bar) => (
						<HoverCard key={bar.dayOffset} openDelay={120} closeDelay={80}>
							<HoverCardTrigger asChild>
								<button
									type="button"
									aria-label={`Uptime ${formatPercent(bar.uptimePct)} ${bar.label}`}
									className={cn(
										"h-[18px] w-[7px] rounded-[2px] transition-colors",
										uptimeBarCount(bar.uptimePct) > 0
											? uptimeBarColorClass(bar.uptimePct)
											: "bg-muted"
									)}
								/>
							</HoverCardTrigger>
							<HoverCardContent align="center" className="w-auto p-2 text-xs">
								<p className="font-medium text-foreground">
									{formatPercent(bar.uptimePct)} uptime {bar.label}
								</p>
							</HoverCardContent>
						</HoverCard>
					))}
				</div>
			),
		},
	];

	return (
		<Card className="overflow-hidden border-zinc-200/80 shadow-sm dark:border-zinc-800">
			<CardHeader className="px-4 py-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0 flex-1 space-y-1.5">
						<div className="flex min-w-0 items-center gap-2">
							<Link href={`/api-providers/${sec.providerId}`} className="group">
								<div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-background dark:border-zinc-800">
									<div className="relative h-5 w-5">
										<Logo
											id={sec.providerId}
											alt={`${sec.providerName} logo`}
											className="object-contain transition group-hover:opacity-80"
											fill
										/>
									</div>
								</div>
							</Link>
							<div className="flex min-w-0 flex-wrap items-center gap-2">
								<Link href={`/api-providers/${sec.providerId}`} className="group">
									<CardTitle className="truncate text-lg transition-colors group-hover:text-primary">
										{sec.providerName}
									</CardTitle>
								</Link>
								{showPrimaryStatusBadge ? (
									<div className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 bg-background px-2 py-1 dark:border-zinc-800">
										{React.createElement(statusIcon, {
											className: statusClass,
										})}
										<span className="text-[0.7rem] font-semibold text-foreground">
											{statusBadgeLabel}
										</span>
									</div>
								) : null}
								{routingStatus?.deranked ? (
									<Badge
										variant="destructive"
										className="text-[0.65rem] uppercase"
										title="Provider is temporarily deranked by routing health breakers."
									>
										Deranked
									</Badge>
								) : routingStatus?.recovering ? (
									<Badge
										variant="secondary"
										className="text-[0.65rem] uppercase"
										title="Provider is in half-open breaker recovery."
									>
										Recovering
									</Badge>
								) : null}
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-1.5">
							<ProviderInfoHoverIcons
								providerId={sec.providerId}
								providerModelSlugs={providerModelSlugs}
								quantizationSchemes={quantizationSchemes}
							/>
							<ProviderModelParameters models={infoScope} />
						</div>
					</div>

					<div className="w-full rounded-lg border border-zinc-200/80 bg-background px-3 py-2 dark:border-zinc-800 lg:w-auto lg:min-w-[330px]">
						<div
							className={cn(
								"grid divide-x divide-zinc-200/70 dark:divide-zinc-800",
								headerMetrics.length <= 3
									? "grid-cols-3"
									: headerMetrics.length === 4
									? "grid-cols-2 sm:grid-cols-4"
									: "grid-cols-3 sm:grid-cols-5"
							)}
						>
							{headerMetrics.map((metric) => (
								<div
									key={metric.label}
									className="flex min-w-0 flex-col items-center justify-center px-2 text-center"
								>
									<p className="text-[11px] font-medium text-muted-foreground">
										{metric.label}
									</p>
									<div className="text-sm font-semibold leading-tight text-foreground tabular-nums">
										{metric.value}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-4 pb-4 pt-0">
				<div className="grid grid-cols-1 gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
					{isFreePlan && (
						<div className="rounded-lg border border-zinc-200/80 bg-background px-3 py-2 dark:border-zinc-800">
							<div className="mb-0.5 text-xs text-muted-foreground">
								Per 1M tokens
							</div>
							<div className="text-lg font-semibold leading-tight tabular-nums">
								{fmtUSD(0)}
							</div>
						</div>
					)}

					{!isFreePlan && sec.textTokens && (
						<TokenTripleSection
							title={showTextTokenHeader ? "Text Tokens" : undefined}
							triple={sec.textTokens}
							hideHeader={!showTextTokenHeader}
							compact
						/>
					)}
					{!isFreePlan && sec.cacheWrites && sec.cacheWrites.length > 0 && (
						<CacheWriteSection rows={sec.cacheWrites} />
					)}
					{!isFreePlan && sec.requests && sec.requests.length > 0 && (
						<RequestsSection rows={sec.requests} />
					)}
					{!isFreePlan && imageInputs.length > 0 && (
						<InputsSection title="Image inputs" rows={imageInputs} />
					)}
					{!isFreePlan && videoInputs.length > 0 && (
						<InputsSection title="Video inputs" rows={videoInputs} />
					)}
					{!isFreePlan && sec.imageTokens && (
						<TokenTripleSection title="Image Tokens" triple={sec.imageTokens} compact />
					)}
					{!isFreePlan && sec.imageGen && <ImageGenSection rows={sec.imageGen} />}
					{!isFreePlan && sec.audioTokens && (
						<TokenTripleSection title="Audio Tokens" triple={sec.audioTokens} compact />
					)}
					{!isFreePlan && sec.videoTokens && (
						<TokenTripleSection title="Video Tokens" triple={sec.videoTokens} compact />
					)}
					{!isFreePlan && sec.videoGen && <VideoGenSection rows={sec.videoGen} />}
					{!isFreePlan && sec.otherRules.length > 0 && (
						<div>
							<AdvancedTable rows={sec.otherRules} />
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

