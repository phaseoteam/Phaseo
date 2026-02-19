"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	TokenTripleSection,
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	CacheWriteSection,
	RequestsSection,
} from "@/components/(data)/model/pricing/sections";
import {
	buildProviderSections,
	fmtUSD,
} from "@/components/(data)/model/pricing/pricingHelpers";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ProviderRuntimeStats } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatus } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import { Logo } from "@/components/Logo";

function formatLatencyMs(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${Math.round(value)}ms`;
}

function formatThroughput(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
	return `${rounded} tok/s`;
}

function formatPercent(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function formatTokenLimit(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
	return `${Math.round(value)}`;
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
	const msIn7Days = 7 * 24 * 60 * 60 * 1000;

	const planRules = provider.pricing_rules.filter(
		(r) => (r.pricing_plan || "standard") === plan
	);
	const hasPlanPricing = planRules.length > 0;
	const hasDatedPricing = planRules.some((r) => r.effective_from || r.effective_to);

	const planModelKeys = new Set(planRules.map((r) => r.model_key));
	const matchingProviderModel = provider.provider_models.find((pm) =>
		planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
	);
	const isActiveGateway = matchingProviderModel?.is_active_gateway ?? false;

	const comingSoonRule = planRules
		.filter((r) => {
			if (!r.effective_from) return false;
			const from = new Date(r.effective_from).getTime();
			return from > now.getTime() && from - now.getTime() <= msIn7Days;
		})
		.sort(
			(a, b) =>
				new Date(a.effective_from!).getTime() -
				new Date(b.effective_from!).getTime()
		)[0];

	const leavingSoonRule = planRules
		.filter((r) => {
			if (!r.effective_to) return false;
			const to = new Date(r.effective_to).getTime();
			return to > now.getTime() && to - now.getTime() <= msIn7Days;
		})
		.sort(
			(a, b) =>
				new Date(a.effective_to!).getTime() -
				new Date(b.effective_to!).getTime()
		)[0];

	let status: "Active" | "Leaving Soon" | "Coming Soon" | "Inactive";
	let statusIcon: React.ElementType;
	let statusClass: string;

	if (isActiveGateway && leavingSoonRule) {
		status = "Leaving Soon";
		statusIcon = AlertTriangle;
		statusClass = "h-3.5 w-3.5 text-amber-500";
	} else if (comingSoonRule) {
		status = "Coming Soon";
		statusIcon = Clock;
		statusClass = "h-3.5 w-3.5 text-amber-500";
	} else if (isActiveGateway && hasDatedPricing) {
		status = "Active";
		statusIcon = CheckCircle2;
		statusClass = "h-3.5 w-3.5 text-emerald-500";
	} else {
		status = "Inactive";
		statusIcon = XCircle;
		statusClass = "h-3.5 w-3.5 text-red-500";
	}

	const countdownMs =
		status === "Coming Soon" && comingSoonRule
			? new Date(comingSoonRule.effective_from!).getTime() - now.getTime()
			: status === "Leaving Soon" && leavingSoonRule
			? new Date(leavingSoonRule.effective_to!).getTime() - now.getTime()
			: null;
	const inactiveReason = !isActiveGateway
		? "Model not active in gateway"
		: "Pricing window not specified";

	const formatCountdown = (ms: number) => {
		const totalHours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
		const days = Math.floor(totalHours / 24);
		const hours = totalHours % 24;
		if (days > 0) return `${days}d ${hours}h`;
		return `${hours}h`;
	};

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
	const showTextLimits =
		textProviderModels.length > 0 &&
		(maxOutputTokens !== null || maxContextTokens !== null);
	const textLimitTiles = [
		maxContextTokens !== null
			? { label: "Context", value: formatTokenLimit(maxContextTokens) }
			: null,
		maxOutputTokens !== null
			? { label: "Max output", value: formatTokenLimit(maxOutputTokens) }
			: null,
	].filter((tile): tile is { label: string; value: string } => Boolean(tile));
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

	return (
		<Card className="border-slate-200">
			<CardHeader className="p-2.5 pb-1">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-2">
						<Link href={`/api-providers/${sec.providerId}`} className="group">
							<div className="relative flex h-8 w-8 items-center justify-center rounded-lg border">
								<div className="relative h-5 w-5">
									<Logo
										id={sec.providerId}
										alt={`${sec.providerName} logo`}
										className="object-contain group-hover:opacity-80 transition"
										fill
									/>
								</div>
							</div>
						</Link>
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<Link href={`/api-providers/${sec.providerId}`} className="group">
								<CardTitle className="truncate text-base group-hover:text-primary transition-colors">
									{sec.providerName}
								</CardTitle>
							</Link>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
											{React.createElement(statusIcon, {
												className: statusClass,
											})}
											<span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
												{status}
											</span>
										</div>
									</TooltipTrigger>
									<TooltipContent>
										{countdownMs !== null && (
											<p>
												{status === "Coming Soon"
													? "Pricing available in "
													: "Expires in "}
												{formatCountdown(countdownMs)}
											</p>
										)}
										{status === "Inactive" && <p>{inactiveReason}</p>}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
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

					<div className="flex flex-wrap items-center gap-1 justify-end">
						<Badge variant="outline" className="text-[0.65rem]">
							Latency {formatLatencyMs(runtimeStats?.latencyMs30m)}
						</Badge>
						<Badge variant="outline" className="text-[0.65rem]">
							Throughput {formatThroughput(runtimeStats?.throughput30m)}
						</Badge>
						<Badge variant="outline" className="text-[0.65rem]">
							Uptime {formatPercent(runtimeStats?.uptimePct3d)}
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-2.5 pt-1">
				<div className="grid grid-cols-1 gap-1.5">
					{isFreePlan && (
						<div className="rounded-md border p-2">
							<div className="mb-0.5 text-xs text-muted-foreground">
								Per 1M tokens
							</div>
							<div className="text-lg font-semibold leading-tight">
								{fmtUSD(0)}
							</div>
						</div>
					)}

					{!isFreePlan && sec.textTokens && (
						<TokenTripleSection
							triple={sec.textTokens}
							hideHeader
							leadingTiles={showTextLimits ? textLimitTiles : []}
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
						<TokenTripleSection title="Image Tokens" triple={sec.imageTokens} />
					)}
					{!isFreePlan && sec.imageGen && <ImageGenSection rows={sec.imageGen} />}
					{!isFreePlan && sec.audioTokens && (
						<TokenTripleSection title="Audio Tokens" triple={sec.audioTokens} />
					)}
					{!isFreePlan && sec.videoTokens && (
						<TokenTripleSection title="Video Tokens" triple={sec.videoTokens} />
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


