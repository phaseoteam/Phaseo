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
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";

const ENDPOINT_LABELS: Record<string, string> = {
	"/chat/completions": "Chat",
	"/responses": "Responses",
	"/messages": "Messages",
	"/images/generations": "Image Gen",
	"/images/edits": "Image Edit",
	"/images/variations": "Image Variations",
	"/video/generations": "Video Gen",
	"/audio/transcriptions": "Transcription",
	"/audio/speech": "Speech",
	"/audio/translations": "Translation",
	"/embeddings": "Embeddings",
	"/moderations": "Moderations",
	"/batches": "Batch",
};

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

	const activeProviderModels = provider.provider_models.filter(
		(pm) => pm.is_active_gateway
	);
	const modelScope = activeProviderModels.length
		? activeProviderModels
		: provider.provider_models;

	const supportedCapabilities = new Set(modelScope.map((pm) => pm.endpoint));
	const supportedEndpoints = new Set<string>();
	for (const cap of supportedCapabilities) {
		const eps = capabilityToEndpoints[cap] || [];
		eps.forEach((ep) => supportedEndpoints.add(ep));
	}

	const supportedEndpointLabels = Array.from(supportedEndpoints)
		.map((ep) => ENDPOINT_LABELS[ep] ?? ep)
		.sort((a, b) => a.localeCompare(b));
	const endpointPreview = supportedEndpointLabels.slice(0, 6);
	const endpointOverflow = Math.max(0, supportedEndpointLabels.length - 6);

	const isFreePlan = plan === "free";
	const imageInputs = sec.mediaInputs?.filter((r) => r.mod === "image") ?? [];
	const videoInputs = sec.mediaInputs?.filter((r) => r.mod === "video") ?? [];
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
			<CardHeader className="pb-2">
				<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="flex items-start gap-3">
						<Link href={`/api-providers/${sec.providerId}`} className="group">
							<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
								<div className="w-7 h-7 relative">
									<Logo
										id={sec.providerId}
										alt={`${sec.providerName} logo`}
										className="object-contain group-hover:opacity-80 transition"
										fill
									/>
								</div>
							</div>
						</Link>
						<div className="space-y-1">
							<Link href={`/api-providers/${sec.providerId}`} className="group">
								<CardTitle className="text-lg group-hover:text-primary transition-colors">
									{sec.providerName}
								</CardTitle>
							</Link>
							<div className="flex items-center gap-2">
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
					</div>

					<div className="flex flex-wrap items-center gap-1 md:justify-end">
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
			<CardContent className="space-y-3">
				{supportedEndpointLabels.length > 0 ? (
					<div className="flex flex-wrap items-center gap-1">
						{endpointPreview.map((label) => (
							<Badge key={label} variant="secondary" className="text-[0.65rem]">
								{label}
							</Badge>
						))}
						{endpointOverflow > 0 ? (
							<Badge variant="secondary" className="text-[0.65rem]">
								+{endpointOverflow}
							</Badge>
						) : null}
					</div>
				) : (
					<div className="text-xs text-muted-foreground">No endpoint metadata.</div>
				)}

				{isFreePlan && (
					<div className="rounded-lg border p-3">
						<div className="text-xs text-muted-foreground mb-1">Per 1M tokens</div>
						<div className="text-xl font-semibold">{fmtUSD(0)}</div>
					</div>
				)}

				{!isFreePlan && sec.textTokens && (
					<TokenTripleSection title="Text Tokens" triple={sec.textTokens} />
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
					<AdvancedTable rows={sec.otherRules} />
				)}
			</CardContent>
		</Card>
	);
}
