"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
	CircleHelp,
	MapPin,
	ShieldAlert,
	ShieldCheck,
	Tag,
	Workflow,
} from "lucide-react";
import {
	type ProviderDataPolicyConfidence,
	type ProviderDataPolicyContractMode,
	type ProviderDataPolicyTier,
	resolveProviderDataPolicy,
} from "@/lib/providers/dataPolicy";
import {
	type ProviderPromptTrainingPolicy,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";
import type {
	ResidencyMode,
	ZeroDataRetentionMode,
} from "@/lib/providers/providerResidency";
import {
	formatResidencyRegionList,
} from "@/lib/providers/residencyDisplay";
import {
	formatDerivedPricingMultiplierLabel,
	getRegionalPricingHint,
	type RegionalPricingMode,
} from "@/lib/providers/providerPricingPolicy";
import { normalizeQuantizationScheme } from "@/lib/quantization";
import { getLocalizedDocsHref } from "@/lib/docs";

const QUANTIZATION_DOCS_URL =
	"https://phaseo.app/docs/v1/guides/model-quantization";

function uniqueDefined(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(
			values
				.map((value) => (typeof value === "string" ? value.trim() : ""))
				.filter(Boolean)
		)
	).sort((a, b) => a.localeCompare(b));
}

type PromptTrainingEntryInput = {
	policy?: string | null;
	notes?: string | null;
	sourceUrl?: string | null;
	userIdentifierPolicy?: string | null;
	userIdentifierNotes?: string | null;
	privacyPolicyUrl?: string | null;
	termsOfServiceUrl?: string | null;
	isOverride?: boolean;
};

type PromptTrainingEntry = {
	policy: ProviderPromptTrainingPolicy;
	notes: string | null;
	sourceUrl: string | null;
	userIdentifierPolicy: string | null;
	userIdentifierNotes: string | null;
	privacyPolicyUrl: string | null;
	termsOfServiceUrl: string | null;
	isOverride: boolean;
};

type DataPolicyEntryInput = {
	tier?: ProviderDataPolicyTier | string | null;
	confidence?: ProviderDataPolicyConfidence | string | null;
	contractMode?: ProviderDataPolicyContractMode | string | null;
	contractNotes?: string | null;
	notes?: string | null;
	sourceUrl?: string | null;
	promptTrainingPolicy?: string | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
};

type DataPolicyEntry = {
	tier: ProviderDataPolicyTier;
	confidence: ProviderDataPolicyConfidence;
	contractMode: ProviderDataPolicyContractMode;
	contractNotes: string | null;
	notes: string | null;
	sourceUrl: string | null;
};

type ResidencyEntryInput = {
	residencyMode?: ResidencyMode | null;
	executionRegions?: string[] | null;
	dataRegions?: string[] | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
	notes?: string | null;
	sourceUrl?: string | null;
};

type ResidencyEntry = {
	residencyMode: ResidencyMode;
	executionRegions: string[];
	dataRegions: string[];
	zeroDataRetention: ZeroDataRetentionMode;
	notes: string | null;
	sourceUrl: string | null;
};

type PricingPolicyInput = {
	regionalPricingMode?: RegionalPricingMode | null;
	regionalPricingUpliftPercent?: number | null;
	derivedMultiplier?: number | null;
	derivedMinMultiplier?: number | null;
	derivedMaxMultiplier?: number | null;
	derivedComparisonProviderName?: string | null;
	derivedRuleCount?: number | null;
	notes?: string | null;
	sourceUrl?: string | null;
};

function normalizePromptTrainingEntries(
	values: PromptTrainingEntryInput[],
): PromptTrainingEntry[] {
	return values.map((value) => ({
		policy: normalizeProviderPromptTrainingPolicy(value.policy),
		notes:
			typeof value.notes === "string" && value.notes.trim()
				? value.notes.trim()
				: null,
		sourceUrl:
			typeof value.sourceUrl === "string" && value.sourceUrl.trim()
				? value.sourceUrl.trim()
				: null,
		userIdentifierPolicy:
			typeof value.userIdentifierPolicy === "string" &&
			value.userIdentifierPolicy.trim()
				? value.userIdentifierPolicy.trim()
				: null,
		userIdentifierNotes:
			typeof value.userIdentifierNotes === "string" &&
			value.userIdentifierNotes.trim()
				? value.userIdentifierNotes.trim()
				: null,
		privacyPolicyUrl:
			typeof value.privacyPolicyUrl === "string" && value.privacyPolicyUrl.trim()
				? value.privacyPolicyUrl.trim()
				: null,
		termsOfServiceUrl:
			typeof value.termsOfServiceUrl === "string" &&
			value.termsOfServiceUrl.trim()
				? value.termsOfServiceUrl.trim()
				: null,
		isOverride: value.isOverride === true,
	}));
}

function normalizeDataPolicyEntries(values: DataPolicyEntryInput[]): DataPolicyEntry[] {
	return values.map((value) => {
		const resolved = resolveProviderDataPolicy({
			tier: value.tier,
			confidence: value.confidence,
			contractMode: value.contractMode,
			promptTrainingPolicy: value.promptTrainingPolicy,
			zeroDataRetention: value.zeroDataRetention,
		});
		return {
			tier: resolved.tier,
			confidence: resolved.confidence,
			contractMode: resolved.contractMode,
			contractNotes:
				typeof value.contractNotes === "string" && value.contractNotes.trim()
					? value.contractNotes.trim()
					: null,
			notes:
				typeof value.notes === "string" && value.notes.trim()
					? value.notes.trim()
					: null,
			sourceUrl:
				typeof value.sourceUrl === "string" && value.sourceUrl.trim()
					? value.sourceUrl.trim()
					: null,
		};
	});
}

function getDataPolicyTierState(
	entries: DataPolicyEntry[],
): ProviderDataPolicyTier | "mixed" {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.tier)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getZeroDataRetentionDetailKey(state: ZeroDataRetentionMode | "mixed"): string | null {
	if (state === true) return "zdrDetails.true";
	if (state === false) return "zdrDetails.false";
	if (state === "mixed") return "zdrDetails.mixed";
	return null;
}

function getDataPolicyIcon(state: ProviderDataPolicyTier | "mixed") {
	switch (state) {
		case "private":
			return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
		case "logs":
			return <ShieldAlert className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />;
		case "trains":
			return <ShieldAlert className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />;
		case "mixed":
			return <Workflow className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />;
		default:
			return <CircleHelp className="h-3.5 w-3.5" />;
	}
}

function normalizeResidencyEntries(values: ResidencyEntryInput[]): ResidencyEntry[] {
	return values.map((value) => ({
		residencyMode: value.residencyMode ?? "unknown",
		executionRegions: uniqueDefined(value.executionRegions ?? []),
		dataRegions: uniqueDefined(value.dataRegions ?? []),
		zeroDataRetention: value.zeroDataRetention ?? false,
		notes:
			typeof value.notes === "string" && value.notes.trim()
				? value.notes.trim()
				: null,
		sourceUrl:
			typeof value.sourceUrl === "string" && value.sourceUrl.trim()
				? value.sourceUrl.trim()
				: null,
	}));
}

function getResidencyModeState(entries: ResidencyEntry[]): ResidencyMode | "mixed" {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.residencyMode)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getZeroDataRetentionState(
	entries: ResidencyEntry[],
): ZeroDataRetentionMode | "mixed" {
	if (!entries.length) return false;
	const unique = Array.from(new Set(entries.map((entry) => entry.zeroDataRetention)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function IconHover({
	ariaLabel,
	children,
	content,
	triggerClassName,
}: {
	ariaLabel: string;
	children: ReactNode;
	content: ReactNode;
	triggerClassName?: string;
}) {
	return (
		<HoverCard openDelay={150} closeDelay={120}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
						triggerClassName,
					)}
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-3 text-xs">
				{content}
			</HoverCardContent>
		</HoverCard>
	);
}

function getFirstDefined(values: Array<string | null | undefined>): string | null {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return null;
}

function summarizePricingNote(note: string): string {
	const normalized = note.replace(/\s+/g, " ").trim();
	if (
		/july 1,\s*2026/i.test(normalized) &&
		/non-global endpoint pricing/i.test(normalized) &&
		/global endpoint pricing applies to non-global endpoints/i.test(normalized)
	) {
		return "Global pricing applies until 1 Jul 2026. Non-global pricing starts after that.";
	}
	return normalized;
}

function InfoBlock({
	title,
	value,
	meta,
	tone = "default",
}: {
	title: string;
	value: string;
	meta?: string | null;
	tone?: "default" | "pricing" | "risk";
}) {
	const toneClass =
		tone === "pricing"
			? "border-amber-200/80 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
			: tone === "risk"
				? "border-red-200/80 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20"
			: "border-zinc-200/80 dark:border-zinc-800";

	return (
		<div className={cn("rounded-md border p-2", toneClass)}>
			<p className="font-medium text-foreground">{title}</p>
			<p className="mt-1 text-sm font-medium text-foreground">{value}</p>
			{meta ? (
				<p className="mt-1 leading-relaxed text-muted-foreground">{meta}</p>
			) : null}
		</div>
	);
}

export default function ProviderInfoHoverIcons({
	providerId,
	providerModelSlugs = [],
	apiModelIds = [],
	quantizationScheme,
	quantizationSchemes = [],
	dataPolicy = [],
	promptTraining = [],
	residency = [],
	pricingPolicy,
	showQuantizationTrigger = true,
	showModelMappingTrigger = true,
	className,
}: {
	providerId: string;
	providerModelSlugs?: Array<string | null | undefined>;
	apiModelIds?: Array<string | null | undefined>;
	quantizationScheme?: string | null;
	quantizationSchemes?: Array<string | null | undefined>;
	dataPolicy?: DataPolicyEntryInput[];
	promptTraining?: PromptTrainingEntryInput[];
	residency?: ResidencyEntryInput[];
	pricingPolicy?: PricingPolicyInput;
	showQuantizationTrigger?: boolean;
	showModelMappingTrigger?: boolean;
	className?: string;
}) {
	const t = useTranslations("Catalogue.modelDetail.providerInfo");
	const locale = useLocale();
	const slugs = uniqueDefined(providerModelSlugs);
	const modelIds = uniqueDefined(apiModelIds);
	const displayModelIds = slugs.length > 0 ? slugs : modelIds;
	const quantization = getFirstDefined([
		normalizeQuantizationScheme(quantizationScheme),
		...quantizationSchemes.map((value) => normalizeQuantizationScheme(value)),
	]);
	const dataPolicyEntries = normalizeDataPolicyEntries(dataPolicy);
	const promptTrainingEntries = normalizePromptTrainingEntries(promptTraining);
	const residencyEntries = normalizeResidencyEntries(residency);
	const dataPolicyTierState = getDataPolicyTierState(dataPolicyEntries);
	const dataPolicySummary = t(`policySummaries.${dataPolicyTierState}` as never);
	const residencyModeState = getResidencyModeState(residencyEntries);
	const zeroDataRetentionState = getZeroDataRetentionState(residencyEntries);
	const zeroDataRetentionDetailKey = getZeroDataRetentionDetailKey(zeroDataRetentionState);
	const zeroDataRetentionDetail = zeroDataRetentionDetailKey ? t(zeroDataRetentionDetailKey as never) : null;
	const dataPolicySourceUrls = uniqueDefined(
		dataPolicyEntries.map((entry) => entry.sourceUrl),
	);
	const promptTrainingSourceUrls = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.sourceUrl),
	);
	const promptTrainingPrivacyPolicyUrls = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.privacyPolicyUrl),
	);
	const promptTrainingTermsUrls = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.termsOfServiceUrl),
	);
	const residencyExecutionRegions = uniqueDefined(
		residencyEntries.flatMap((entry) => entry.executionRegions),
	);
	const residencyDataRegions = uniqueDefined(
		residencyEntries.flatMap((entry) => entry.dataRegions),
	);
	const residencySourceUrls = uniqueDefined(
		residencyEntries.map((entry) => entry.sourceUrl),
	);
	const residencyNotes = uniqueDefined(
		residencyEntries.map((entry) => entry.notes),
	);
	const pricingNotes = uniqueDefined([
		pricingPolicy?.notes ?? null,
	]);
	const pricingSourceUrls = uniqueDefined([
		pricingPolicy?.sourceUrl ?? null,
	]);
	const allSourceUrls = uniqueDefined([
		...dataPolicySourceUrls,
		...residencySourceUrls,
		...pricingSourceUrls,
	]);
	const regionalPricingHint = getRegionalPricingHint({
		regionalPricingMode: pricingPolicy?.regionalPricingMode ?? null,
		regionalPricingUpliftPercent:
			pricingPolicy?.regionalPricingUpliftPercent ?? null,
		derivedMultiplier: pricingPolicy?.derivedMultiplier ?? null,
		derivedMinMultiplier: pricingPolicy?.derivedMinMultiplier ?? null,
		derivedMaxMultiplier: pricingPolicy?.derivedMaxMultiplier ?? null,
		derivedComparisonProviderName:
			pricingPolicy?.derivedComparisonProviderName ?? null,
		derivedRuleCount: pricingPolicy?.derivedRuleCount ?? null,
	});
	const derivedPricingLabel = formatDerivedPricingMultiplierLabel({
		derivedMultiplier: pricingPolicy?.derivedMultiplier ?? null,
		derivedMinMultiplier: pricingPolicy?.derivedMinMultiplier ?? null,
		derivedMaxMultiplier: pricingPolicy?.derivedMaxMultiplier ?? null,
		derivedComparisonProviderName:
			pricingPolicy?.derivedComparisonProviderName ?? null,
		includeComparedProvider: true,
	});
	const hasPricingPolicy =
		Boolean(regionalPricingHint) ||
		(pricingPolicy?.regionalPricingMode ?? "unknown") !== "unknown" ||
		pricingNotes.length > 0 ||
		pricingSourceUrls.length > 0;
	const hasQuantization = showQuantizationTrigger && Boolean(quantization);
	const hasModelMapping = showModelMappingTrigger && displayModelIds.length > 0;
	const hasDataPolicy =
		dataPolicyEntries.length > 0 ||
		promptTrainingEntries.length > 0 ||
		residencyEntries.length > 0;
	const hasResidency = residencyEntries.some(
		(entry) =>
			entry.executionRegions.length > 0 ||
			entry.dataRegions.length > 0 ||
			entry.residencyMode !== "unknown" ||
			Boolean(entry.notes) ||
			Boolean(entry.sourceUrl),
	);

	if (!hasQuantization && !hasModelMapping && !hasResidency && !hasDataPolicy) return null;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{hasDataPolicy ? (
				<IconHover
					ariaLabel={t("dataPolicy")}
					content={
						<div className="space-y-2">
							<InfoBlock
								title={t("dataPolicy")}
								value={t(`policyTiers.${dataPolicyTierState}` as never)}
								meta={dataPolicySummary}
								tone={dataPolicyTierState === "trains" ? "risk" : "default"}
							/>
							<InfoBlock
								title={t("zeroDataRetention")}
								value={
									zeroDataRetentionState === true ? t("zdrValues.true")
										: zeroDataRetentionState === false ? t("zdrValues.false")
										: zeroDataRetentionState === "mixed" ? t("zdrValues.mixed") : t("zdrValues.unknown")
								}
								meta={zeroDataRetentionDetail}
							/>
							{promptTrainingSourceUrls.length > 0 ? (
								<div className="flex flex-col items-start gap-1">
									{promptTrainingSourceUrls.slice(0, 2).map((url) => (
										<Link
											key={url}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline decoration-transparent hover:decoration-current"
										>
											{t("viewPolicySource")}
										</Link>
									))}
								</div>
							) : null}
							{promptTrainingSourceUrls.length === 0 &&
							dataPolicySourceUrls.length > 0 ? (
								<div className="flex flex-col items-start gap-1">
									{dataPolicySourceUrls.slice(0, 2).map((url) => (
										<Link
											key={url}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline decoration-transparent hover:decoration-current"
										>
											{t("viewPolicySource")}
										</Link>
									))}
								</div>
							) : null}
							{promptTrainingPrivacyPolicyUrls.length > 0 ||
							promptTrainingTermsUrls.length > 0 ? (
								<div className="flex flex-col items-start gap-1">
									{promptTrainingPrivacyPolicyUrls.slice(0, 1).map((url) => (
										<Link
											key={url}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline decoration-transparent hover:decoration-current"
										>
											{t("viewPrivacyPolicy")}
										</Link>
									))}
									{promptTrainingTermsUrls.slice(0, 1).map((url) => (
										<Link
											key={url}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline decoration-transparent hover:decoration-current"
										>
											{t("viewTerms")}
										</Link>
									))}
								</div>
							) : null}
						</div>
					}
				>
					{getDataPolicyIcon(dataPolicyTierState)}
				</IconHover>
			) : null}

			{hasQuantization ? (
				<IconHover
					ariaLabel={t("quantizationDetails")}
					triggerClassName="w-auto min-w-7 max-w-[108px] px-2"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								{t("quantizationDescription", { scheme: quantization ?? "" })}
							</p>
							<Link
				href={getLocalizedDocsHref(locale, QUANTIZATION_DOCS_URL)}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								{t("readQuantizationDocs")}
							</Link>
						</div>
					}
				>
					<span className="max-w-[90px] truncate text-[10px] font-semibold leading-none tracking-[0.02em] text-foreground">
						{quantization}
					</span>
				</IconHover>
			) : null}

			{hasResidency ? (
				<IconHover
					ariaLabel={t("processingAndDataLocations")}
					content={
						<div className="space-y-2">
							<InfoBlock
								title={t("processingLocation")}
								value={
									residencyExecutionRegions.length > 0
										? formatResidencyRegionList(residencyExecutionRegions)
										: t("unknown")
								}
								meta={
									residencyModeState !== "unknown"
									? t(`residencyModes.${residencyModeState === "provider_managed" ? "providerManaged" : residencyModeState === "customer_selectable" ? "customerSelectable" : residencyModeState === "account_selected" ? "accountSelected" : residencyModeState}` as never)
										: null
								}
							/>
							<InfoBlock
								title={t("dataCentreLocation")}
								value={
									residencyDataRegions.length > 0
										? formatResidencyRegionList(residencyDataRegions)
										: t("unknown")
								}
							/>
							{hasPricingPolicy ? (
								<InfoBlock
									title={t("pricing")}
									value={
										derivedPricingLabel ??
										((pricingPolicy?.regionalPricingMode ?? "unknown") !==
										"unknown"
											? t(`pricingModes.${pricingPolicy?.regionalPricingMode === "same_as_global" ? "sameAsGlobal" : pricingPolicy?.regionalPricingMode === "source_region_rates" ? "sourceRegionRates" : pricingPolicy?.regionalPricingMode === "offer_specific" ? "offerSpecific" : pricingPolicy?.regionalPricingMode}` as never)
											: t("varies"))
									}
									meta={
										summarizePricingNote(pricingNotes[0] ?? regionalPricingHint ?? "")
									}
									tone="pricing"
								/>
							) : null}
							{(residencyNotes.length > 0 || allSourceUrls.length > 0) ? (
								<div className="rounded-md border border-zinc-200/80 p-2 dark:border-zinc-800">
									{residencyNotes.length > 0 ? (
										<p className="leading-relaxed text-muted-foreground">
											{residencyNotes[0]}
										</p>
									) : null}
									{allSourceUrls.length > 0 ? (
										<div className={cn(residencyNotes.length > 0 ? "mt-2" : "", "flex flex-wrap items-center gap-x-3 gap-y-1")}>
											{allSourceUrls.slice(0, 2).map((url, index) => (
												<Link
													key={url}
													href={url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary underline decoration-transparent hover:decoration-current"
												>
											{index === 0 ? t("policySource") : t("pricingSource")}
												</Link>
											))}
										</div>
									) : null}
								</div>
							) : null}
						</div>
					}
				>
					<MapPin className="h-3.5 w-3.5" />
				</IconHover>
			) : null}

			{hasModelMapping ? (
				<IconHover
					ariaLabel={t("providerLabel")}
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								{t("providerMappingIntro")}
							</p>
							<div className="flex flex-col items-start gap-1">
								{displayModelIds.map((modelId) => (
									<code
										key={`model:${modelId}`}
										className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded bg-muted px-1 py-0.5 text-foreground"
									>
										{modelId}
									</code>
								))}
							</div>
							<Link
								href={`/api-providers/${providerId}`}
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								{t("viewProviderPage")}
							</Link>
						</div>
					}
				>
					<Tag className="h-3.5 w-3.5" />
				</IconHover>
			) : null}
		</div>
	);
}
