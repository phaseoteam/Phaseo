import Link from "@/components/link";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "@/i18n/react";
import { cn } from "@/lib/utils";
import {
	HoverCard,
	HoverCardContent,
	HoverCardHeader,
	HoverCardLinks,
	HoverCardNote,
	HoverCardRows,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TAP_TARGET_24 } from "@/lib/tapTargets";
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
	"https://phaseo.app/docs/v1/guides/quantization";

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

const TRAINING_KEYS: Record<ProviderPromptTrainingPolicy, string> = {
	unknown: "unknown",
	may_train: "yes",
	no_train: "no",
	opt_out_available: "optOut",
	enterprise_no_train: "enterpriseNo",
};

const CONTRACT_KEYS: Record<ProviderDataPolicyContractMode, string> = {
	none: "none",
	customer_agreement: "customer",
	enterprise_agreement: "enterprise",
};

/** The one value every entry shares, "mixed" when they differ, or the fallback when there are none. */
function singleOrMixed<T extends string>(values: T[], fallback: T): T | "mixed" {
	const unique = Array.from(new Set(values));
	if (unique.length === 0) return fallback;
	return unique.length === 1 ? unique[0] : "mixed";
}

/** A stored code such as "hashed_only" as "Hashed only". */
function humanizeCode(value: string): string {
	const text = value.replace(/[_-]+/g, " ").trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function IconHover({
	ariaLabel,
	children,
	content,
	triggerClassName,
	contentClassName,
}: {
	ariaLabel: string;
	children: ReactNode;
	content: ReactNode;
	triggerClassName?: string;
	contentClassName?: string;
}) {
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
						TAP_TARGET_24,
						triggerClassName,
					)}
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className={cn("w-72 max-w-[calc(100vw-2rem)] space-y-2.5", contentClassName)}>
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
	return note.replace(/\s+/g, " ").trim();
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
	const tCard = useTranslations("Catalogue.hoverCards");
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
	// One link per kind of source, labelled by what it documents; a URL shared
	// by several kinds is shown once, under the first kind.
	const sourceLinks: Array<{ url: string; labelKey: "policySource" | "residencySource" | "pricingSource" }> = [];
	for (const [urls, labelKey] of [
		[dataPolicySourceUrls, "policySource"],
		[residencySourceUrls, "residencySource"],
		[pricingSourceUrls, "pricingSource"],
	] as const) {
		const url = urls.find((candidate) => !sourceLinks.some((link) => link.url === candidate));
		if (url) sourceLinks.push({ url, labelKey });
	}
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

	const trainingPolicies = promptTrainingEntries.length > 0
		? promptTrainingEntries.map((entry) => entry.policy)
		: dataPolicy.map((entry) => normalizeProviderPromptTrainingPolicy(entry.promptTrainingPolicy));
	const trainingState = singleOrMixed(trainingPolicies, "unknown" as const);
	const trainingValue = trainingState === "mixed"
		? t("policyTiers.mixed")
		: tCard(`training.${TRAINING_KEYS[trainingState]}` as never);
	const confidenceState = singleOrMixed(dataPolicyEntries.map((entry) => entry.confidence), "unknown" as const);
	const contractState = singleOrMixed(dataPolicyEntries.map((entry) => entry.contractMode), "none" as const);
	const contractNotes = getFirstDefined(dataPolicyEntries.map((entry) => entry.contractNotes));
	const userIdentifierPolicy = getFirstDefined(promptTrainingEntries.map((entry) => entry.userIdentifierPolicy));
	const policyNote = getFirstDefined([
		...dataPolicyEntries.map((entry) => entry.notes),
		...promptTrainingEntries.map((entry) => entry.notes),
	]);
	const policyUrl = promptTrainingSourceUrls[0] ?? dataPolicySourceUrls[0] ?? null;
	const privacyUrl = promptTrainingPrivacyPolicyUrls[0] ?? null;
	const termsUrl = promptTrainingTermsUrls[0] ?? null;
	const zeroDataRetentionValue =
		zeroDataRetentionState === true ? t("zdrValues.true")
			: zeroDataRetentionState === false ? t("zdrValues.false")
			: zeroDataRetentionState === "mixed" ? t("zdrValues.mixed") : t("zdrValues.unknown");
	const residencyModeLabel = residencyModeState !== "unknown"
		? t(`residencyModes.${residencyModeState === "provider_managed" ? "providerManaged" : residencyModeState === "customer_selectable" ? "customerSelectable" : residencyModeState === "account_selected" ? "accountSelected" : residencyModeState}` as never)
		: null;
	const regionalPricingValue = hasPricingPolicy
		? derivedPricingLabel ??
			((pricingPolicy?.regionalPricingMode ?? "unknown") !== "unknown"
				? t(`pricingModes.${pricingPolicy?.regionalPricingMode === "same_as_global" ? "sameAsGlobal" : pricingPolicy?.regionalPricingMode === "source_region_rates" ? "sourceRegionRates" : pricingPolicy?.regionalPricingMode === "offer_specific" ? "offerSpecific" : pricingPolicy?.regionalPricingMode}` as never)
				: t("varies"))
		: null;
	const residencyNote = residencyNotes[0] ?? (hasPricingPolicy ? summarizePricingNote(pricingNotes[0] ?? regionalPricingHint ?? "") : "") ?? "";
	const sourceLinkLabels = { policySource: tCard("linkPolicy"), residencySource: tCard("linkResidency"), pricingSource: tCard("linkPricing") } as const;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{hasDataPolicy ? (
				<IconHover
					ariaLabel={t("dataPolicy")}
					contentClassName="w-80"
					content={
						<>
							<HoverCardHeader
								icon={getDataPolicyIcon(dataPolicyTierState)}
								title={t("dataPolicy")}
								meta={[
									t(`policyTiers.${dataPolicyTierState}` as never),
									confidenceState === "mixed" ? null : tCard(`confidence.${confidenceState}` as never),
								]}
							/>
							<HoverCardRows
								rows={[
									{ key: "training", label: tCard("rowPromptTraining"), value: trainingValue },
									{ key: "zdr", label: tCard("rowZdr"), value: zeroDataRetentionValue },
									{
										key: "contract",
										label: tCard("rowContract"),
										value: contractState === "mixed" ? t("policyTiers.mixed") : tCard(`contract.${CONTRACT_KEYS[contractState]}` as never),
									},
									{
										key: "userIds",
										label: tCard("rowUserIds"),
										value: userIdentifierPolicy ? humanizeCode(userIdentifierPolicy) : t("unknown"),
									},
								]}
							/>
							{dataPolicyTierState === "trains" ? (
								<Alert variant="destructive" className="rounded-md px-3 py-2 text-xs">
									<ShieldAlert />
									<AlertDescription className="text-xs">{dataPolicySummary}</AlertDescription>
								</Alert>
							) : (
								<HoverCardNote>{policyNote ?? dataPolicySummary}</HoverCardNote>
							)}
							{contractNotes ? <HoverCardNote>{contractNotes}</HoverCardNote> : null}
							<HoverCardLinks>
								{policyUrl ? <Link key="policy" href={policyUrl} target="_blank" rel="noopener noreferrer">{tCard("linkPolicy")}</Link> : null}
								{privacyUrl ? <Link key="privacy" href={privacyUrl} target="_blank" rel="noopener noreferrer">{tCard("linkPrivacy")}</Link> : null}
								{termsUrl ? <Link key="terms" href={termsUrl} target="_blank" rel="noopener noreferrer">{tCard("linkTerms")}</Link> : null}
							</HoverCardLinks>
						</>
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
						<>
							<HoverCardHeader title={t("quantizationDetails")} meta={[quantization]} />
							<HoverCardNote>{t("quantizationDescription", { scheme: quantization ?? "" })}</HoverCardNote>
							<HoverCardLinks>
								<Link href={getLocalizedDocsHref(locale, QUANTIZATION_DOCS_URL)} target="_blank" rel="noopener noreferrer">
									{t("readQuantizationDocs")}
								</Link>
							</HoverCardLinks>
						</>
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
						<>
							<HoverCardHeader icon={<MapPin />} title={tCard("locationsTitle")} meta={[residencyModeLabel]} />
							<HoverCardRows
								rows={[
									{
										key: "processing",
										label: tCard("rowProcessing"),
										value: residencyExecutionRegions.length > 0 ? formatResidencyRegionList(residencyExecutionRegions) : t("unknown"),
									},
									{
										key: "stored",
										label: tCard("rowDataStored"),
										value: residencyDataRegions.length > 0 ? formatResidencyRegionList(residencyDataRegions) : t("unknown"),
									},
									regionalPricingValue ? { key: "pricing", label: tCard("rowRegionalPricing"), value: regionalPricingValue } : null,
								]}
							/>
							{residencyNote ? <HoverCardNote>{residencyNote}</HoverCardNote> : null}
							<HoverCardLinks>
								{sourceLinks.map(({ url, labelKey }) => (
									<Link key={url} href={url} target="_blank" rel="noopener noreferrer">
										{sourceLinkLabels[labelKey]}
									</Link>
								))}
							</HoverCardLinks>
						</>
					}
				>
					<MapPin className="h-3.5 w-3.5" />
				</IconHover>
			) : null}

			{hasModelMapping ? (
				<IconHover
					ariaLabel={t("providerLabel")}
					content={
						<>
							<HoverCardHeader icon={<Tag />} title={t("providerLabel")} />
							<HoverCardNote>{t("providerMappingIntro")}</HoverCardNote>
							<div className="flex flex-col items-start gap-1">
								{displayModelIds.map((modelId) => (
									<code
										key={`model:${modelId}`}
										className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded bg-muted px-1 py-0.5 text-xs text-foreground"
									>
										{modelId}
									</code>
								))}
							</div>
							<HoverCardLinks>
								<Link href={`/api-providers/${providerId}`}>{t("viewProviderPage")}</Link>
							</HoverCardLinks>
						</>
					}
				>
					<Tag className="h-3.5 w-3.5" />
				</IconHover>
			) : null}
		</div>
	);
}
