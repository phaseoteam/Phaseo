"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
	Building2,
	CircleHelp,
	MapPin,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Tag,
	Workflow,
} from "lucide-react";
import {
	PROVIDER_DATA_POLICY_CONFIDENCE_LABELS,
	PROVIDER_DATA_POLICY_CONTRACT_MODE_LABELS,
	PROVIDER_DATA_POLICY_TIER_LABELS,
	type ProviderDataPolicyConfidence,
	type ProviderDataPolicyContractMode,
	type ProviderDataPolicyTier,
	resolveProviderDataPolicy,
} from "@/lib/providers/dataPolicy";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
	type ProviderPromptTrainingPolicy,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";
import type {
	ResidencyMode,
	ZeroDataRetentionMode,
} from "@/lib/providers/providerResidency";
import {
	formatResidencyMode,
	formatResidencyRegionList,
	formatZeroDataRetention,
} from "@/lib/providers/residencyDisplay";
import {
	formatDerivedPricingMultiplierLabel,
	formatRegionalPricingMode,
	getRegionalPricingHint,
	type RegionalPricingMode,
} from "@/lib/providers/providerPricingPolicy";
import { normalizeQuantizationScheme } from "@/lib/quantization";

const QUANTIZATION_DOCS_URL =
	"https://docs.phaseo.app/v1/guides/model-quantization";

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

type PromptTrainingState = ProviderPromptTrainingPolicy | "mixed";

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

function getPromptTrainingState(entries: PromptTrainingEntry[]): PromptTrainingState {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.policy)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getDataPolicyTierState(
	entries: DataPolicyEntry[],
): ProviderDataPolicyTier | "mixed" {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.tier)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getDataPolicyConfidenceState(
	entries: DataPolicyEntry[],
): ProviderDataPolicyConfidence | "mixed" {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.confidence)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getDataPolicyContractState(
	entries: DataPolicyEntry[],
): ProviderDataPolicyContractMode | "mixed" {
	if (!entries.length) return "none";
	const unique = Array.from(new Set(entries.map((entry) => entry.contractMode)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function formatDataPolicyTier(value: ProviderDataPolicyTier | "mixed"): string {
	if (value === "mixed") return "Varies by mapping";
	return PROVIDER_DATA_POLICY_TIER_LABELS[value];
}

function formatDataPolicyConfidence(
	value: ProviderDataPolicyConfidence | "mixed",
): string {
	if (value === "mixed") return "Varies by mapping";
	return PROVIDER_DATA_POLICY_CONFIDENCE_LABELS[value];
}

function formatDataPolicyContractMode(
	value: ProviderDataPolicyContractMode | "mixed",
): string | null {
	if (value === "mixed") return "Agreement varies by mapping";
	if (value === "none") return null;
	return PROVIDER_DATA_POLICY_CONTRACT_MODE_LABELS[value];
}

function getPromptTrainingIcon(state: PromptTrainingState) {
	switch (state) {
		case "no_train":
			return <ShieldCheck className="h-3.5 w-3.5" />;
		case "may_train":
			return <ShieldAlert className="h-3.5 w-3.5" />;
		case "opt_out_available":
			return <Shield className="h-3.5 w-3.5" />;
		case "enterprise_no_train":
			return <Building2 className="h-3.5 w-3.5" />;
		case "mixed":
			return <Workflow className="h-3.5 w-3.5" />;
		default:
			return <CircleHelp className="h-3.5 w-3.5" />;
	}
}

function getDataPolicyIcon(state: ProviderDataPolicyTier | "mixed") {
	switch (state) {
		case "private":
			return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
		case "logs":
			return <Shield className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />;
		case "trains":
			return <ShieldAlert className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />;
		case "mixed":
			return <Workflow className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />;
		default:
			return <CircleHelp className="h-3.5 w-3.5" />;
	}
}

function getPromptTrainingSummary(state: PromptTrainingState): string {
	if (state === "mixed") return "Training policy varies by endpoint/model mapping.";
	if (state === "unknown") {
		return "We do not currently have a clear public statement from this provider on whether API prompts and completions may be used for model training or improvement.";
	}
	return PROVIDER_PROMPT_TRAINING_POLICY_LABELS[state];
}

function getDataPolicySummary(state: ProviderDataPolicyTier | "mixed"): string {
	switch (state) {
		case "private":
			return "No provider training or non-transient prompt storage is documented for this route.";
		case "logs":
			return "Provider may retain prompts or request logs, but is not known to train on them.";
		case "trains":
			return "Provider may use prompts or outputs for training or model improvement.";
		case "mixed":
			return "Data policy varies across provider/model mappings.";
		default:
			return "No clear provider-level policy is listed. Treat as unknown for sensitive data.";
	}
}

function getPromptLoggingValue(state: ProviderDataPolicyTier | "mixed"): string {
	switch (state) {
		case "private":
			return "No prompt storage";
		case "logs":
			return "May retain logs";
		case "trains":
			return "May retain prompts";
		case "mixed":
			return "Varies by mapping";
		default:
			return "Unknown";
	}
}

function getPromptLoggingSummary(state: ProviderDataPolicyTier | "mixed"): string {
	switch (state) {
		case "private":
			return "Classified as private for provider-side prompt handling.";
		case "logs":
			return "Prompt or request logs may be retained by the provider.";
		case "trains":
			return "Prompt retention may be part of training or model improvement policy.";
		case "mixed":
			return "Retention policy differs across endpoint mappings.";
		default:
			return "Policy has not been confidently classified yet.";
	}
}

function formatPolicyConfidence(value: ProviderDataPolicyConfidence | "mixed"): string | null {
	if (value === "unknown") return null;
	if (value === "mixed") return "Confidence varies by mapping";
	return `Confidence: ${formatDataPolicyConfidence(value)}`;
}

function formatPromptTrainingValue(state: PromptTrainingState): string {
	if (state === "mixed") return "Varies by mapping";
	return PROVIDER_PROMPT_TRAINING_POLICY_LABELS[state];
}

function formatUserIdentifierPolicy(value: string | null): string {
	switch (value) {
		case "sent":
			return "Provider-facing user identifier sent";
		case "not_sent":
			return "No provider-facing user identifier sent";
		case "varies":
			return "User identifier varies by endpoint";
		default:
			return "User identifier policy unclear";
	}
}

function normalizeResidencyEntries(values: ResidencyEntryInput[]): ResidencyEntry[] {
	return values.map((value) => ({
		residencyMode: value.residencyMode ?? "unknown",
		executionRegions: uniqueDefined(value.executionRegions ?? []),
		dataRegions: uniqueDefined(value.dataRegions ?? []),
		zeroDataRetention: value.zeroDataRetention ?? "unknown",
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
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.zeroDataRetention)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getZeroDataRetentionDetail(
	state: ZeroDataRetentionMode | "mixed",
): string | null {
	switch (state) {
		case "default":
			return "Documented as the default handling for this provider mapping.";
		case "optional":
			return "Documented as available, but it can depend on provider-side configuration, account setup, or a specific endpoint.";
		case "unsupported":
			return "No zero-data-retention option is documented for this provider mapping.";
		case "mixed":
			return "Zero-data-retention handling varies across provider/model mappings.";
		default:
			return null;
	}
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
	className?: string;
}) {
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
	const dataPolicyConfidenceState =
		getDataPolicyConfidenceState(dataPolicyEntries);
	const dataPolicyContractState = getDataPolicyContractState(dataPolicyEntries);
	const dataPolicySummary = getDataPolicySummary(dataPolicyTierState);
	const promptTrainingState = getPromptTrainingState(promptTrainingEntries);
	const residencyModeState = getResidencyModeState(residencyEntries);
	const zeroDataRetentionState = getZeroDataRetentionState(residencyEntries);
	const promptTrainingSummary = getPromptTrainingSummary(promptTrainingState);
	const promptTrainingHasOverrides = promptTrainingEntries.some(
		(entry) => entry.isOverride,
	);
	const zeroDataRetentionDetail = getZeroDataRetentionDetail(
		zeroDataRetentionState,
	);
	const dataPolicyNotes = uniqueDefined(
		dataPolicyEntries.flatMap((entry) => [entry.notes, entry.contractNotes]),
	);
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
	const promptTrainingNotes = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.notes),
	);
	const userIdentifierPolicies = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.userIdentifierPolicy),
	);
	const userIdentifierNotes = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.userIdentifierNotes),
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
	const promptTrainingPolicyBreakdown = Array.from(
		promptTrainingEntries.reduce((acc, entry) => {
			const current = acc.get(entry.policy) ?? 0;
			acc.set(entry.policy, current + 1);
			return acc;
		}, new Map<ProviderPromptTrainingPolicy, number>()),
	).sort((a, b) =>
		PROVIDER_PROMPT_TRAINING_POLICY_LABELS[a[0]].localeCompare(
			PROVIDER_PROMPT_TRAINING_POLICY_LABELS[b[0]],
		),
	);
	const hasQuantization = showQuantizationTrigger && Boolean(quantization);
	const hasSlug = displayModelIds.length > 0;
	const hasPromptTraining = promptTrainingEntries.length > 0;
	const hasDataPolicy = dataPolicyEntries.some(
		(entry) =>
			entry.tier !== "unknown" ||
			entry.confidence !== "unknown" ||
			entry.contractMode !== "none" ||
			Boolean(entry.notes) ||
			Boolean(entry.contractNotes) ||
			Boolean(entry.sourceUrl),
	);
	const hasResidency = residencyEntries.some(
		(entry) =>
			entry.executionRegions.length > 0 ||
			entry.dataRegions.length > 0 ||
			entry.zeroDataRetention !== "unknown" ||
			entry.residencyMode !== "unknown" ||
			Boolean(entry.notes) ||
			Boolean(entry.sourceUrl),
	);

	if (!hasQuantization && !hasSlug && !hasPromptTraining && !hasResidency && !hasDataPolicy) return null;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{hasPromptTraining || hasDataPolicy ? (
				<IconHover
					ariaLabel="Data policy"
					content={
						<div className="space-y-2">
							{hasDataPolicy ? (
								<>
									<InfoBlock
										title="Data policy"
										value={formatDataPolicyTier(dataPolicyTierState)}
										meta={dataPolicySummary}
										tone={dataPolicyTierState === "trains" ? "risk" : "default"}
									/>
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<InfoBlock
											title="Prompt logging"
											value={getPromptLoggingValue(dataPolicyTierState)}
											meta={getPromptLoggingSummary(dataPolicyTierState)}
											tone={dataPolicyTierState === "trains" ? "risk" : "default"}
										/>
										<InfoBlock
											title="Prompt training"
											value={formatPromptTrainingValue(promptTrainingState)}
											meta={promptTrainingSummary}
											tone={
												promptTrainingState === "may_train" ||
												promptTrainingState === "opt_out_available"
													? "risk"
													: "default"
											}
										/>
									</div>
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<InfoBlock
											title="Zero data retention"
											value={
												zeroDataRetentionState !== "unknown"
													? formatZeroDataRetention(zeroDataRetentionState)
													: "Unknown"
											}
											meta={zeroDataRetentionDetail}
										/>
										<InfoBlock
											title="Policy confidence"
											value={formatPolicyConfidence(dataPolicyConfidenceState) ?? "Unknown"}
											meta={
												dataPolicyConfidenceState === "maybe"
													? "Best-known classification, but not confirmed by a direct agreement."
													: null
											}
										/>
									</div>
									{formatDataPolicyContractMode(dataPolicyContractState) ? (
										<InfoBlock
											title="Agreement"
											value={formatDataPolicyContractMode(dataPolicyContractState) ?? "None"}
											meta={dataPolicyNotes[0] ?? null}
										/>
									) : dataPolicyNotes.length > 0 ? (
										<p className="text-muted-foreground">
											{dataPolicyNotes[0]}
										</p>
									) : null}
								</>
							) : null}
							{hasPromptTraining && !hasDataPolicy ? (
								<p className="leading-relaxed text-muted-foreground">
									{promptTrainingSummary}
								</p>
							) : null}
							{promptTrainingState === "mixed" ? (
								<div className="space-y-1">
									{promptTrainingPolicyBreakdown.map(([policy, count]) => (
										<div key={policy} className="flex items-center justify-between gap-2">
											<span className="text-foreground">
												{PROVIDER_PROMPT_TRAINING_POLICY_LABELS[policy]}
											</span>
											<span className="text-muted-foreground">
												{count} mapping{count === 1 ? "" : "s"}
											</span>
										</div>
									))}
								</div>
							) : null}
							{promptTrainingHasOverrides ? (
								<p className="text-muted-foreground">
									Includes model-specific override values.
								</p>
							) : null}
							{promptTrainingNotes.length > 0 ? (
								<div className="space-y-1">
									{promptTrainingNotes.slice(0, 2).map((note) => (
										<p key={note} className="text-muted-foreground">
											{note}
										</p>
									))}
								</div>
							) : null}
							{userIdentifierPolicies.length > 0 || userIdentifierNotes.length > 0 ? (
								<div className="rounded-md border border-zinc-200/80 p-2 dark:border-zinc-800">
									<p className="font-medium text-foreground">Provider identifier</p>
									{userIdentifierPolicies.length > 0 ? (
										<p className="mt-1 text-muted-foreground">
											{formatUserIdentifierPolicy(userIdentifierPolicies[0] ?? null)}
										</p>
									) : null}
									{userIdentifierNotes.length > 0 ? (
										<p className="mt-1 text-muted-foreground">
											{userIdentifierNotes[0]}
										</p>
									) : null}
								</div>
							) : null}
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
											View policy source
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
											View policy source
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
											View privacy policy
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
											View terms
										</Link>
									))}
								</div>
							) : null}
						</div>
					}
				>
					{hasDataPolicy
						? getDataPolicyIcon(dataPolicyTierState)
						: getPromptTrainingIcon(promptTrainingState)}
				</IconHover>
			) : null}

			{hasQuantization ? (
				<IconHover
					ariaLabel="Quantization details"
					triggerClassName="w-auto min-w-7 max-w-[108px] px-2"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								This provider serves this model using{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-foreground">
									{quantization}
								</code>{" "}
								quantization.
							</p>
							<Link
								href={QUANTIZATION_DOCS_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								Read quantization docs
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
					ariaLabel="Data policy and residency"
					content={
						<div className="space-y-2">
							<InfoBlock
								title="Execution"
								value={
									residencyExecutionRegions.length > 0
										? formatResidencyRegionList(residencyExecutionRegions)
										: "Unknown"
								}
								meta={
									residencyModeState !== "unknown"
										? formatResidencyMode(residencyModeState)
										: null
								}
							/>
							<InfoBlock
								title="Data residency"
								value={
									residencyDataRegions.length > 0
										? formatResidencyRegionList(residencyDataRegions)
										: "Unknown"
								}
							/>
							{zeroDataRetentionState !== "unknown" ? (
								<InfoBlock
									title="Zero data retention"
									value={formatZeroDataRetention(zeroDataRetentionState)}
									meta={zeroDataRetentionDetail}
								/>
							) : null}
							{hasPricingPolicy ? (
								<InfoBlock
									title="Pricing"
									value={
										derivedPricingLabel ??
										((pricingPolicy?.regionalPricingMode ?? "unknown") !==
										"unknown"
											? formatRegionalPricingMode(
													pricingPolicy?.regionalPricingMode ?? "unknown",
												)
											: "Varies")
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
													{index === 0 ? "Policy source" : "Pricing source"}
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

			{hasSlug ? (
				<IconHover
					ariaLabel="Provider label"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								This provider exposes this mapping as:
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
								View provider page
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
