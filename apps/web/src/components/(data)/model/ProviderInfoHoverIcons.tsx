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
	"https://docs.ai-stats.phaseo.app/v1/guides/model-quantization";

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

function getPromptTrainingState(entries: PromptTrainingEntry[]): PromptTrainingState {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.policy)));
	return unique.length === 1 ? unique[0] : "mixed";
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

function getPromptTrainingSummary(state: PromptTrainingState): string {
	if (state === "mixed") return "Training policy varies by endpoint/model mapping.";
	if (state === "unknown") {
		return "We do not currently have a clear public statement from this provider on whether API prompts and completions may be used for model training or improvement.";
	}
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
						"inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700",
						triggerClassName,
					)}
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-72 p-3 text-xs">
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
	tone?: "default" | "pricing";
}) {
	const toneClass =
		tone === "pricing"
			? "border-amber-200/80 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
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
	promptTraining = [],
	residency = [],
	pricingPolicy,
	className,
}: {
	providerId: string;
	providerModelSlugs?: Array<string | null | undefined>;
	apiModelIds?: Array<string | null | undefined>;
	quantizationScheme?: string | null;
	quantizationSchemes?: Array<string | null | undefined>;
	promptTraining?: PromptTrainingEntryInput[];
	residency?: ResidencyEntryInput[];
	pricingPolicy?: PricingPolicyInput;
	className?: string;
}) {
	const slugs = uniqueDefined(providerModelSlugs);
	const modelIds = uniqueDefined(apiModelIds);
	const quantization = getFirstDefined([
		normalizeQuantizationScheme(quantizationScheme),
		...quantizationSchemes.map((value) => normalizeQuantizationScheme(value)),
	]);
	const promptTrainingEntries = normalizePromptTrainingEntries(promptTraining);
	const residencyEntries = normalizeResidencyEntries(residency);
	const promptTrainingState = getPromptTrainingState(promptTrainingEntries);
	const residencyModeState = getResidencyModeState(residencyEntries);
	const zeroDataRetentionState = getZeroDataRetentionState(residencyEntries);
	const promptTrainingSummary = getPromptTrainingSummary(promptTrainingState);
	const promptTrainingHasOverrides = promptTrainingEntries.some(
		(entry) => entry.isOverride,
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
	const hasQuantization = Boolean(quantization);
	const hasSlug = slugs.length > 0 || modelIds.length > 0;
	const hasPromptTraining = promptTrainingEntries.length > 0;
	const hasResidency = residencyEntries.some(
		(entry) =>
			entry.executionRegions.length > 0 ||
			entry.dataRegions.length > 0 ||
			entry.zeroDataRetention !== "unknown" ||
			entry.residencyMode !== "unknown" ||
			Boolean(entry.notes) ||
			Boolean(entry.sourceUrl),
	);

	if (!hasQuantization && !hasSlug && !hasPromptTraining && !hasResidency) return null;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{hasPromptTraining ? (
				<IconHover
					ariaLabel="Prompt training policy"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								{promptTrainingSummary}
							</p>
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
					{getPromptTrainingIcon(promptTrainingState)}
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
									meta={
										zeroDataRetentionState !== "unknown"
											? `Zero data retention: ${formatZeroDataRetention(
													zeroDataRetentionState,
											  )}`
											: null
									}
								/>
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
								{modelIds.map((modelId) => (
									<code
										key={`model:${modelId}`}
										className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded bg-muted px-1 py-0.5 text-foreground"
									>
										{modelId}
									</code>
								))}
								{slugs.map((slug) => (
									<code
										key={`slug:${slug}`}
										className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded bg-muted px-1 py-0.5 text-foreground"
									>
										{slug}
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
