"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Ban, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	TierTiles,
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	RequestsSection,
	UpcomingPricingSection,
} from "@/components/(data)/model/pricing/sections";
import ProviderModelParameters from "@/components/(data)/model/pricing/ProviderModelParameters";
import {
	buildProviderSections,
	fmtUSD,
	type TokenTier,
	type TokenTriple,
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

function parseRuleConditionValues(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((v) => String(v));
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			try {
				const parsed = JSON.parse(trimmed.replace(/''/g, '"'));
				if (Array.isArray(parsed)) return parsed.map((v) => String(v));
			} catch {
				return trimmed
					.slice(1, -1)
					.split(",")
					.map((v) => v.replace(/['"]/g, "").trim())
					.filter(Boolean);
			}
		}
		return [trimmed.replace(/['"]/g, "")];
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return [String(value)];
	}
	return [];
}

function parseRuleAudioMode(value: unknown): "with-audio" | "without-audio" | null {
	const values = parseRuleConditionValues(value);
	const parsed = values
		.map((raw) => raw.trim().toLowerCase())
		.map((v) => {
			if (["true", "1", "yes", "enabled", "t", "on"].includes(v)) return true;
			if (["false", "0", "no", "disabled", "f", "off"].includes(v)) return false;
			return null;
		})
		.filter((v): v is boolean => v !== null);
	if (!parsed.length) return null;
	const hasTrue = parsed.includes(true);
	const hasFalse = parsed.includes(false);
	if (hasTrue && !hasFalse) return "with-audio";
	if (hasFalse && !hasTrue) return "without-audio";
	return null;
}

const PROVIDER_STATUS_PRIORITY_ORDER = [
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"inactive",
	"disabled",
	"not_listed",
] as const;

type CanonicalGatewayStatus = (typeof PROVIDER_STATUS_PRIORITY_ORDER)[number];

const providerStatusPriority = new Map<string, number>(
	PROVIDER_STATUS_PRIORITY_ORDER.map((status, index) => [status, index])
);

const PROVIDER_STATUS_META: Record<
	CanonicalGatewayStatus,
	{
		label: string;
		icon: React.ElementType;
		iconClass: string;
		description: string;
	}
> = {
	active: {
		label: "Active",
		icon: CheckCircle2,
		iconClass: "text-green-600",
		description: "Active on gateway.",
	},
	deranked_lvl1: {
		label: "Deranked Level 1",
		icon: AlertTriangle,
		iconClass: "text-amber-500",
		description: "Deranked on gateway (Level 1).",
	},
	deranked_lvl2: {
		label: "Deranked Level 2",
		icon: AlertTriangle,
		iconClass: "text-amber-600",
		description: "Deranked on gateway (Level 2).",
	},
	deranked_lvl3: {
		label: "Deranked Level 3",
		icon: AlertTriangle,
		iconClass: "text-red-500",
		description: "Deranked on gateway (Level 3).",
	},
	inactive: {
		label: "Inactive",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "Configured but not active on gateway.",
	},
	disabled: {
		label: "Disabled",
		icon: Ban,
		iconClass: "text-red-600",
		description: "Capability is disabled.",
	},
	not_listed: {
		label: "Not Listed",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "No gateway status listed for this provider.",
	},
};

function normalizeGatewayStatusValue(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function resolveGatewayStatus(
	isActiveGateway: boolean | null | undefined,
	capabilityStatus: unknown
): string {
	const normalizedCapabilityStatus =
		normalizeGatewayStatusValue(capabilityStatus);

	if (normalizedCapabilityStatus === "disabled") return "disabled";
	if (normalizedCapabilityStatus.startsWith("deranked")) {
		return normalizedCapabilityStatus;
	}
	if (
		normalizedCapabilityStatus &&
		normalizedCapabilityStatus !== "active" &&
		normalizedCapabilityStatus !== "inactive"
	) {
		return normalizedCapabilityStatus;
	}
	if (normalizedCapabilityStatus === "inactive") return "inactive";
	return isActiveGateway ? "active" : "inactive";
}

export default function ProviderCard({
	provider,
	plan,
	runtimeStats,
	routingStatus: _routingStatus,
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
	const matchingProviderModels = provider.provider_models.filter((pm) =>
		planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
	);
	const providerModelsInScope =
		matchingProviderModels.length > 0
			? matchingProviderModels
			: provider.provider_models;

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

	const resolvedGatewayStatuses = providerModelsInScope.map((providerModel) =>
		resolveGatewayStatus(
			providerModel.is_active_gateway,
			providerModel.capability_status
		)
	);
	const chosenGatewayStatus =
		resolvedGatewayStatuses.reduce<string | undefined>((current, candidate) => {
			if (!current) return candidate;
			const currentPriority =
				providerStatusPriority.get(current) ?? providerStatusPriority.size + 1;
			const candidatePriority =
				providerStatusPriority.get(candidate) ?? providerStatusPriority.size + 1;
			return candidatePriority < currentPriority ? candidate : current;
		}, undefined) ?? "not_listed";
	const statusKey = chosenGatewayStatus as CanonicalGatewayStatus;
	const statusMeta = PROVIDER_STATUS_META[statusKey] ?? PROVIDER_STATUS_META.not_listed;
	const statusIcon = statusMeta.icon;
	const statusClass = cn("h-3.5 w-3.5", statusMeta.iconClass);
	const statusLabel = statusMeta.label;
	const statusDetail =
		statusKey === "active" && leavingSoonRule?.effective_to
			? `${statusMeta.description} Leaving on ${formatLeavingDate(leavingSoonRule.effective_to, now)}`
			: statusMeta.description;

	const isFreePlan = plan === "free";
	const imageInputs = sec.mediaInputs?.filter((r) => r.mod === "image") ?? [];
	const videoInputs = sec.mediaInputs?.filter((r) => r.mod === "video") ?? [];
	const upcomingFor = (
		sectionKey:
			| "textTokens"
			| "requests"
			| "imageInputs"
			| "videoInputs"
			| "imageTokens"
			| "imageGen"
			| "audioTokens"
			| "videoTokens"
			| "videoGen"
			| "other"
	) => sec.upcomingChanges?.filter((change) => change.sectionKey === sectionKey) ?? [];
	const textProviderModels = providerModelsInScope.filter(
		(pm) => pm.endpoint === "text.generate"
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
		const capacityMetrics = [
			maxContextTokens !== null
				? {
						label: "Total Context",
						value: formatTokenLimit1dp(maxContextTokens),
				  }
				: null,
			maxOutputTokens !== null
				? {
						label: "Max Output",
						value: formatTokenLimit(maxOutputTokens),
				  }
				: null,
		].filter(
			(
				metric
			): metric is {
				label: string;
				value: string;
			} => Boolean(metric)
		);
	type TokenMetricTile = {
		key: string;
		title: string;
		tiers?: TokenTier[];
		unitLabel?: string;
	};
	type TokenMetricGroup = {
		key: string;
		title: string;
		tiles: TokenMetricTile[];
	};
	const createTokenTiles = (
		modalityLabel: "Text" | "Audio" | "Image" | "Video",
		modalityKey: "text" | "audio" | "image" | "video",
		triple: TokenTriple | undefined,
	): TokenMetricTile[] => {
		if (!triple) return [];
		const sections: Array<{
			key: string;
			title: string;
			tiers: TokenTier[];
		}> = [
			{
				key: `${modalityKey}-input`,
				title: `${modalityLabel} Input`,
				tiers: triple.in,
			},
			{
				key: `${modalityKey}-output`,
				title: `${modalityLabel} Output`,
				tiers: triple.out,
			},
			{
				key: `${modalityKey}-cache-read`,
				title: `${modalityLabel} Cache Reads`,
				tiers: triple.cached,
			},
			{
				key: `${modalityKey}-cache-write`,
				title: `${modalityLabel} Cache Writes`,
				tiers: triple.write,
			},
		];
		return sections
			.filter((section) => section.tiers.length > 0)
			.map((section) => ({
				key: section.key,
				title: section.title,
				tiers: section.tiers,
				unitLabel: "Per 1M tokens",
			}));
	};
	const tokenMetricGroups: TokenMetricGroup[] = [
		{
			key: "text",
			title: "Text",
			tiles: createTokenTiles("Text", "text", sec.textTokens),
		},
		{
			key: "audio",
			title: "Audio",
			tiles: createTokenTiles("Audio", "audio", sec.audioTokens),
		},
		{
			key: "image",
			title: "Image",
			tiles: createTokenTiles("Image", "image", sec.imageTokens),
		},
		{
			key: "video",
			title: "Video",
			tiles: createTokenTiles("Video", "video", sec.videoTokens),
		},
	].filter((group) => group.tiles.length > 0);
	const showTokenGroupHeaders = tokenMetricGroups.length > 1;
	const upcomingTokenChanges = [
		...upcomingFor("textTokens"),
		...upcomingFor("imageTokens"),
		...upcomingFor("audioTokens"),
		...upcomingFor("videoTokens"),
	];
	const infoScope = providerModelsInScope;
	const providerModelSlugs = infoScope.map((pm) => pm.provider_model_slug);
	const videoAudioRuleHints = planRules.flatMap((rule) => {
		const meter = String(rule.meter ?? "").toLowerCase();
		const isVideoMeter =
			meter.includes("output_video") ||
			meter.includes("video_output") ||
			(meter.includes("video") &&
				(meter.includes("second") || meter.includes("minute") || meter.includes("video")));
		if (!isVideoMeter) return [];
		const fromMs = rule.effective_from ? new Date(rule.effective_from).getTime() : null;
		const toMs = rule.effective_to ? new Date(rule.effective_to).getTime() : null;
		const nowMs = now.getTime();
		if (fromMs != null && Number.isFinite(fromMs) && fromMs > nowMs) return [];
		if (toMs != null && Number.isFinite(toMs) && toMs <= nowMs) return [];
		const conditions = Array.isArray(rule.match) ? rule.match : [];
		const audioCondition = conditions.find(
			(cond: any) =>
				String(cond?.path ?? "").trim().toLowerCase() === "video_params.audio",
		);
		const audioMode = audioCondition
			? parseRuleAudioMode(audioCondition.value)
			: null;
		if (!audioMode) return [];
		const resolutionCondition = conditions.find((cond: any) =>
			String(cond?.path ?? "").trim().toLowerCase().includes("resolution"),
		);
		const resolutions = resolutionCondition
			? parseRuleConditionValues(resolutionCondition.value)
			: ["Any resolution"];
		const price = Number(rule.price_per_unit ?? Number.NaN);
		if (!Number.isFinite(price)) return [];
		return resolutions.map((resolution) => ({
			resolution,
			price,
			audioMode,
		}));
	});
	const hasExplicitVideoAudioRules = planRules.some((rule) => {
		const meter = String(rule.meter ?? "").toLowerCase();
		const isVideoMeter =
			meter.includes("output_video") ||
			meter.includes("video_output") ||
			(meter.includes("video") && (meter.includes("second") || meter.includes("minute")));
		if (!isVideoMeter) return false;
		const match = Array.isArray(rule.match) ? rule.match : [];
		const audioCond = match.find(
			(cond: any) =>
				String(cond?.path ?? "").trim().toLowerCase() === "video_params.audio",
		);
		if (!audioCond) return false;
		const values = Array.isArray(audioCond.value) ? audioCond.value : [audioCond.value];
		return values.some((v: unknown) => {
			if (typeof v === "boolean") return true;
			const normalized = String(v ?? "").trim().toLowerCase();
			return [
				"true",
				"false",
				"1",
				"0",
				"yes",
				"no",
				"enabled",
				"disabled",
				"t",
				"f",
				"on",
				"off",
			].includes(normalized);
		});
	});
	const hasVideoAudioSplitData = Boolean(
		sec.videoGen?.some((row) => row.audioMode === "with-audio" || row.audioMode === "without-audio")
	);
	const quantizationScheme =
		infoScope
			.find(
				(pm) =>
					pm.is_active_gateway &&
					pm.capability_status !== "disabled" &&
					typeof pm.quantization_scheme === "string" &&
					pm.quantization_scheme.trim()
			)
			?.quantization_scheme?.trim() ??
		infoScope
			.find(
				(pm) =>
					pm.endpoint === "text.generate" &&
					typeof pm.quantization_scheme === "string" &&
					pm.quantization_scheme.trim()
			)
			?.quantization_scheme?.trim() ??
		infoScope
			.find(
				(pm) =>
					typeof pm.quantization_scheme === "string" &&
					pm.quantization_scheme.trim()
			)
			?.quantization_scheme?.trim() ??
		null;
	const allEmpty =
		!sec.textTokens &&
		!sec.imageTokens &&
		!sec.audioTokens &&
		!sec.videoTokens &&
		!sec.imageGen &&
		!sec.videoGen &&
		!imageInputs.length &&
		!videoInputs.length &&
		!sec.requests?.length &&
		!sec.upcomingChanges?.length &&
		!sec.otherRules.length;

	if (allEmpty && !isFreePlan && hasPlanPricing) return null;

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
	const performanceMetrics = [
		{
			label: "Latency",
			value: formatLatencySeconds(runtimeStats?.latencyMs30m) as React.ReactNode,
		},
		{
			label: "Throughput",
			value: throughputValue ? (
				<>
					{throughputValue}
					<span className="ml-0.5 text-[0.68em] font-medium">tps</span>
				</>
			) : (
				"--"
			),
		},
		{
			label: "Uptime",
			value: (
				<div
					className="mt-0.5 flex items-center justify-center gap-[3px]"
					aria-label={`Uptime ${formatPercent(uptimePct)}`}
				>
					{uptimeBars.map((bar) => (
						<HoverCard key={bar.dayOffset} openDelay={120} closeDelay={80}>
							<HoverCardTrigger asChild>
								<button
									type="button"
									aria-label={`Uptime ${formatPercent(bar.uptimePct)} ${bar.label}`}
									className={cn(
										"h-[16px] w-[7px] rounded-[2px] transition-colors",
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
								<Link href={`/api-providers/${sec.providerId}`} className="group min-w-0">
									<CardTitle className="truncate text-lg transition-colors group-hover:text-primary">
										{sec.providerName}
									</CardTitle>
								</Link>
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								<HoverCard openDelay={120} closeDelay={80}>
									<HoverCardTrigger asChild>
										<button
											type="button"
											aria-label={`Provider status: ${statusLabel}`}
											className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors hover:border-slate-300 dark:border-zinc-800 dark:hover:border-slate-700"
										>
											{React.createElement(statusIcon, {
												className: statusClass,
											})}
										</button>
									</HoverCardTrigger>
									<HoverCardContent align="start" className="w-auto p-2 text-xs">
										<p className="font-semibold">{statusLabel}</p>
										<p>{statusDetail}</p>
									</HoverCardContent>
								</HoverCard>
								<ProviderInfoHoverIcons
									providerId={sec.providerId}
									providerModelSlugs={providerModelSlugs}
									quantizationScheme={quantizationScheme}
									promptTraining={
										infoScope.length > 0
											? infoScope.map((providerModel) => ({
													policy:
														providerModel.prompt_training_policy_override ??
														provider.provider.prompt_training_policy ??
														null,
													notes:
														providerModel.prompt_training_override_notes ??
														provider.provider.prompt_training_notes ??
														null,
													sourceUrl:
														providerModel.prompt_training_override_source_url ??
														provider.provider.prompt_training_source_url ??
														null,
													isOverride: Boolean(
														providerModel.prompt_training_policy_override,
													),
											  }))
											: [
													{
														policy:
															provider.provider.prompt_training_policy ?? null,
														notes:
															provider.provider.prompt_training_notes ?? null,
														sourceUrl:
															provider.provider
																.prompt_training_source_url ?? null,
														isOverride: false,
													},
											  ]
									}
								/>
								<ProviderModelParameters models={infoScope} />
							</div>
						</div>

					<div className="w-full lg:w-auto lg:min-w-[300px]">
						<div className="grid grid-cols-3 divide-x divide-zinc-200/70 dark:divide-zinc-800">
							{performanceMetrics.map((metric) => (
								<div
									key={metric.label}
									className="flex min-w-0 flex-col items-center justify-center px-3 text-center"
								>
									<p className="text-[10px] font-medium text-muted-foreground">
										{metric.label}
									</p>
									<div className="text-xs font-semibold leading-tight text-foreground tabular-nums">
										{metric.value}
									</div>
								</div>
							))}
						</div>
						{capacityMetrics.length > 0 ? (
							<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
								<div
									className={cn(
										"grid divide-zinc-200/70 dark:divide-zinc-800",
										capacityMetrics.length > 1
											? "grid-cols-2 divide-x"
											: "grid-cols-1",
									)}
								>
									{capacityMetrics.map((metric) => (
										<div
											key={metric.label}
											className="flex min-w-0 flex-col items-center justify-center px-3 text-center"
										>
											<p className="text-[10px] font-medium text-muted-foreground">
												{metric.label}
											</p>
											<div className="text-xs font-semibold leading-tight text-foreground tabular-nums">
												{metric.value}
											</div>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-4 pb-4 pt-0">
				<div className="grid grid-cols-1 gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
					{!hasPlanPricing ? (
						<div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
							Pricing is not available for the selected tier on this provider.
						</div>
					) : null}
					{isFreePlan && (
						<div className="px-1 py-1">
							<div className="mb-0.5 text-xs text-muted-foreground">
								Per 1M tokens
							</div>
							<div className="text-xs font-semibold leading-tight tabular-nums">
								{fmtUSD(0)}
							</div>
						</div>
					)}
					{!isFreePlan && tokenMetricGroups.length > 0 && (
						<div className="space-y-1.5">
							{tokenMetricGroups.map((group) => (
								<div key={group.key} className="space-y-1.5">
									{showTokenGroupHeaders ? (
										<h4 className="text-xs font-semibold tracking-wide text-foreground">
											{group.title}
										</h4>
									) : null}
									<div className="w-full overflow-visible sm:overflow-x-auto">
										<div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:w-full sm:min-w-max sm:gap-0 sm:divide-x sm:divide-zinc-200/70 sm:dark:divide-zinc-800">
											{group.tiles.map((tile) => (
												<div
													key={tile.key}
													className="min-w-0 px-1 py-1 sm:min-w-[140px] sm:flex-1 sm:px-3 sm:py-2"
												>
													<div className="mb-0.5 text-xs text-muted-foreground">{tile.title}</div>
													{tile.tiers ? (
														<TierTiles tiers={tile.tiers} dense unitLabel={tile.unitLabel} />
													) : null}
												</div>
											))}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
					{!isFreePlan && upcomingTokenChanges.length > 0 && (
						<UpcomingPricingSection
							rows={upcomingTokenChanges}
							title="Upcoming Token Pricing"
							compact
						/>
					)}
					{!isFreePlan && sec.requests && sec.requests.length > 0 && (
						<RequestsSection rows={sec.requests} />
					)}
					{!isFreePlan && upcomingFor("requests").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("requests")} title="Upcoming" compact />
					)}
					{!isFreePlan && imageInputs.length > 0 && (
						<InputsSection title="Image Inputs" rows={imageInputs} />
					)}
					{!isFreePlan && upcomingFor("imageInputs").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("imageInputs")} title="Upcoming" compact />
					)}
					{!isFreePlan && videoInputs.length > 0 && (
						<InputsSection title="Video Inputs" rows={videoInputs} />
					)}
					{!isFreePlan && upcomingFor("videoInputs").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("videoInputs")} title="Upcoming" compact />
					)}
					{!isFreePlan && sec.imageGen && <ImageGenSection rows={sec.imageGen} />}
					{!isFreePlan && upcomingFor("imageGen").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("imageGen")} title="Upcoming" compact />
					)}
					{!isFreePlan && sec.videoGen && (
						<VideoGenSection
							rows={sec.videoGen}
							showAudioVariants={
								hasExplicitVideoAudioRules ||
								hasVideoAudioSplitData ||
								videoAudioRuleHints.length > 0
							}
							audioHints={videoAudioRuleHints}
						/>
					)}
					{!isFreePlan && upcomingFor("videoGen").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("videoGen")} title="Upcoming" compact />
					)}
					{!isFreePlan && sec.otherRules.length > 0 && (
						<div>
							<AdvancedTable rows={sec.otherRules} />
						</div>
					)}
					{!isFreePlan && upcomingFor("other").length > 0 && (
						<UpcomingPricingSection
							rows={upcomingFor("other")}
							title="Other Upcoming Pricing"
							compact
						/>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
