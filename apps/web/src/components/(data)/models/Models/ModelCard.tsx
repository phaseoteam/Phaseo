import Link from "@/components/link";
import { useLocale, useTranslations } from "@/i18n/react";
import { decisionModelCapabilities } from "@/lib/models/modelCapabilities";
import {
	memo,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type MouseEvent,
	type ReactNode,
} from "react";
import {
	ArrowUpRight,
	Check,
	Copy,
	BadgeAlert,
	CalendarClock,
	EyeOff,
	LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveWeeklyUsageDisplay } from "./weeklyUsage";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";
import { hasPassedLifecycleDate } from "@/lib/models/modelLifecycle";
import { resolveProviderLogoId } from "@/lib/providers/providerOffers";
import { getModalityIcon } from "./modalityIcons";
import { resolveModelVisibility } from "./modelVisibility";
import {
	buildPriceCardRows,
	describePriceCardRow,
	formatCardUsd,
	priceCardTokenUnits,
	type PriceCardLabels,
} from "./priceCardRows";
import { PriceCardRowList } from "./PriceCardRowList";

type ModelCardLike = Omit<ModelCardType, "gateway_status"> & {
	gateway_status?:
		| ModelCardType["gateway_status"]
		| "coming_soon"
		| "deprecated"
		| "retired"
		| null;
	router_requests_30d?: number | null;
	router_spend_nanos_30d?: number | null;
	// Set on workspace private-endpoint models, which only their workspace sees.
	is_private?: boolean;
};
import { Logo } from "@/components/Logo";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { useRouter } from "@/lib/navigation";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	HoverCard,
	HoverCardContent,
	HoverCardHeader,
	HoverCardStat,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

const MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"audio",
	"audio_tts",
	"realtime",
	"audio_stt",
	"audio_music",
	"video",
	"rerank",
	"embedding",
	"moderation",
	"decisions",
] as const;
const PROVIDER_STATUS_ORDER = [
	"active",
	"coming_soon",
	"deranked",
	"internal_testing",
	"external",
	"inactive",
	"disabled",
	"not_listed",
] as const;

const PROVIDER_STATUS_META: Record<
	string,
	{ label: string; badgeClassName: string; dotClassName: string }
> = {
	active: {
		label: "Active",
		badgeClassName: "bg-emerald-500/10 text-emerald-600",
		dotClassName: "bg-emerald-500",
	},
	coming_soon: {
		label: "Coming Soon",
		badgeClassName: "bg-blue-500/10 text-blue-600",
		dotClassName: "bg-blue-500",
	},
	internal_testing: {
		label: "Internal Testing",
		badgeClassName: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
		dotClassName: "bg-cyan-500",
	},
	external: {
		label: "External",
		badgeClassName: "bg-violet-500/10 text-violet-600",
		dotClassName: "bg-violet-500",
	},
	deranked: {
		label: "Lower priority",
		badgeClassName: "bg-amber-600/10 text-amber-700",
		dotClassName: "bg-amber-600",
	},
	disabled: {
		label: "Disabled",
		badgeClassName: "bg-red-600/10 text-red-700",
		dotClassName: "bg-red-600",
	},
	inactive: {
		label: "Inactive",
		badgeClassName: "bg-muted text-muted-foreground",
		dotClassName: "bg-muted-foreground/60",
	},
	not_listed: {
		label: "Not Listed",
		badgeClassName: "bg-muted text-muted-foreground",
		dotClassName: "bg-muted-foreground/60",
	},
};
const providerStatusOrderIndex = new Map<string, number>(
	PROVIDER_STATUS_ORDER.map((status, index) => [status, index]),
);

function toTitleLabel(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (normalized === "realtime") return "Realtime";
	if (normalized === "extraction" || normalized === "extraction.extract") return "Extraction";
	if (normalized === "audio_stt") return "Transcription";
	if (normalized === "audio_tts") return "Speech";
	if (normalized === "audio_music") return "Music";
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[._/-]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((part) =>
			part.length > 0
				? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`
				: part,
		)
		.join(" ");
}

function normalizeModalityOrderKey(value: string): string {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("realtime") || normalized.includes("real time")) {
		return "realtime";
	}
	if (normalized.includes("embed")) return "embedding";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("moderat")) return "moderation";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcri") ||
		normalized.includes("speech to text") ||
		normalized.includes("stt")
	) {
		return "audio_stt";
	}
	if (
		normalized.includes("text to speech") ||
		normalized.includes("audio speech") ||
		normalized.includes("speech synth") ||
		normalized.includes("tts")
	) {
		return "audio_tts";
	}
	if (normalized.includes("video")) return "video";
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("text")) return "text";
	return normalized.trim();
}

function sortModalitiesForDisplay(values: string[]): string[] {
	const orderIndex = new Map<string, number>(
		MODALITY_DISPLAY_ORDER.map((value, index) => [value, index]),
	);
	return [...values].sort((a, b) => {
		const keyA = normalizeModalityOrderKey(a);
		const keyB = normalizeModalityOrderKey(b);
		const indexA = orderIndex.get(keyA);
		const indexB = orderIndex.get(keyB);
		if (indexA !== undefined || indexB !== undefined) {
			if (indexA === undefined) return 1;
			if (indexB === undefined) return -1;
			return indexA - indexB;
		}
		return a.localeCompare(b);
	});
}

function normalizeProviderStatus(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "inactive";
	if (normalized === "not_active") return "inactive";
	if (normalized === "comingsoon") return "coming_soon";
	// The catalogue stores a deranked route as `degraded`; the former levels are one level now.
	if (normalized === "degraded" || normalized === "de_ranked" || /^deranked(_lvl_?[123])?$/.test(normalized)) return "deranked";
	return normalized;
}

function providerStatusPriority(status: string): number {
	return providerStatusOrderIndex.get(status) ?? providerStatusOrderIndex.size + 1;
}

function formatProviderStatusLabel(
	status: string,
	labels: Record<string, string>,
): string {
	const normalized = normalizeProviderStatus(status);
	const localized = labels[normalized];
	if (localized) return localized;
	return normalized
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPrice(
	value: number | null | undefined,
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
	options: { allowZero?: boolean } = {},
): string | null {
	if (
		!Number.isFinite(value) ||
		value === null ||
		value === undefined ||
		value < 0
	) {
		return null;
	}
	if (value === 0) return options.allowZero ? "$0" : null;
	const maximumFractionDigits = value < 0.001 ? 4 : value < 0.1 ? 3 : 2;
	return formatNumber(value, { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits, notation: "standard" });
}

// Matches the API's detail-row formatting: cents for fractional amounts of a
// cent or more ("$0.50", "$0.035"), bare integers ("$15"), and three
// significant digits below a cent so small rates never look free.
function formatHeadlinePrice(
	value: number,
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
	if (value === 0) return "$0";
	if (value < 0.01) {
		return `$${formatNumber(value, { maximumSignificantDigits: 3, notation: "standard" })}`;
	}
	const integer = Math.abs(value - Math.round(value)) < 1e-9;
	return `$${formatNumber(value, {
		minimumFractionDigits: integer ? 0 : 2,
		maximumFractionDigits: integer ? 0 : 3,
		notation: "standard",
	})}`;
}

function formatCostNanos(
	value: number | null | undefined,
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string | null {
	if (!Number.isFinite(value) || value === null || value === undefined || value < 0) {
		return null;
	}
	return formatNumber(value / 1e9, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: value / 1e9 >= 1 ? 2 : 5,
		notation: "standard",
	});
}

function normalizeFromPriceUnit(value: string | null | undefined): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	if (
		normalized === "1m token" ||
		normalized === "1m tokens" ||
		normalized === "per 1m token" ||
		normalized === "per 1m tokens"
	) {
		return "1M tokens";
	}
	if (normalized === "token" || normalized === "tokens") return "1M tokens";
	if (normalized === "sec" || normalized === "secs" || normalized === "seconds") {
		return "second";
	}
	if (normalized === "min" || normalized === "mins" || normalized === "minutes") {
		return "minute";
	}
	if (normalized === "hr" || normalized === "hrs" || normalized === "hours") {
		return "hour";
	}
	if (normalized === "images") return "image";
	if (normalized === "videos") return "video";
	if (normalized === "characters") return "character";
	return normalized;
}

function formatFromPrice(
	value: number | null | undefined,
	unit: string | null | undefined,
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
	options: { allowZero?: boolean } = {},
): string | null {
	const amount = formatPrice(value, formatNumber, { allowZero: options.allowZero });
	if (!amount) return null;
	const normalizedUnit = normalizeFromPriceUnit(unit);
	return normalizedUnit ? `${amount} per ${normalizedUnit}` : amount;
}

function formatPriceWithUnit(
	value: number | null | undefined,
	unit: string | null | undefined,
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string | null {
	const amount = formatPrice(value, formatNumber, { allowZero: true });
	if (!amount) return null;
	const normalizedUnit = normalizeFromPriceUnit(unit);
	if (!normalizedUnit) return amount;
	if (normalizedUnit === "1M tokens") return `${amount} /M tokens`;
	return `${amount} / ${normalizedUnit}`;
}

function inferPriceUnitFromModality(modalityKey: string): string | null {
	if (modalityKey === "image") return "image";
	if (modalityKey === "video") return "video";
	if (modalityKey === "audio" || modalityKey === "audio_tts") return "minute";
	return null;
}

function ModelCardScrollRail({
	ariaLabel,
	children,
	className,
}: {
	ariaLabel: string;
	children: ReactNode;
	className?: string;
}) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [canScrollRight, setCanScrollRight] = useState(false);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const updateScrollAffordance = () => {
			setCanScrollRight(
				viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1,
			);
		};

		updateScrollAffordance();
		viewport.addEventListener("scroll", updateScrollAffordance, { passive: true });
		const resizeObserver = new ResizeObserver(updateScrollAffordance);
		resizeObserver.observe(viewport);
		if (viewport.firstElementChild) {
			resizeObserver.observe(viewport.firstElementChild);
		}

		return () => {
			viewport.removeEventListener("scroll", updateScrollAffordance);
			resizeObserver.disconnect();
		};
	}, []);

	return (
		<ScrollArea
			className={cn(
				"min-w-0 max-w-full transition-[mask-image] duration-200",
				className,
			)}
			scrollBarClassName="hidden"
			scrollBarOrientation="horizontal"
			style={
				canScrollRight
					? {
							WebkitMaskImage:
								"linear-gradient(to right, black calc(100% - 2rem), transparent)",
							maskImage:
								"linear-gradient(to right, black calc(100% - 2rem), transparent)",
						}
					: undefined
			}
			viewportRef={viewportRef}
			viewportProps={{ "aria-label": ariaLabel, role: "region" }}
			viewportClassName="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{children}
		</ScrollArea>
	);
}

function ModelCardImpl({
	model,
	showOrganisationPrefix = false,
	contentPaddingClassName,
}: {
	model: ModelCardLike;
	showOrganisationPrefix?: boolean;
	contentPaddingClassName?: string;
}) {
	const tAuditCopy = useTranslations();
	const t = useTranslations("Catalogue.models");
	const tDetail = useTranslations("Catalogue.modelDetail");
	const tCard = useTranslations("Catalogue.hoverCards");
	const tPriceCard = useTranslations("Catalogue.hoverCards.priceCard");
	const locale = useLocale();
	const tProviderStatus = useTranslations(
		"Catalogue.modelDetail.providerTable.statuses",
	);
	const providerStatusLabels: Record<string, string> = {
		active: tProviderStatus("active"),
		inactive: tProviderStatus("inactive"),
		disabled: tProviderStatus("disabled"),
		coming_soon: tProviderStatus("comingSoon"),
		internal_testing: tProviderStatus("internalTesting"),
		rate_limited: tProviderStatus("rateLimited"),
		degraded: tProviderStatus("degraded"),
		external: tProviderStatus("external"),
	};
	const format = useDisplayFormatters();
	const modelSlug = model.model_id;
	const modelHref =
		getModelDetailsHref(model.organisation_id, model.model_id) ??
		`/models/${modelSlug}`;
	const router = useRouter();
	const apiModelId =
		model.gateway_api_model_ids
			?.map((value) => String(value ?? "").trim())
			.filter(Boolean)
			.sort((a, b) => {
				const aIsFree = a.toLowerCase().endsWith(":free");
				const bIsFree = b.toLowerCase().endsWith(":free");
				if (aIsFree !== bIsFree) return aIsFree ? -1 : 1;
				return a.localeCompare(b);
			})[0] ?? null;
	const displayModelId = modelSlug;
	const isDisplayedApiModelFree =
		apiModelId?.toLowerCase().endsWith(":free") ??
		displayModelId.toLowerCase().endsWith(":free");
	const organisationLabel = String(
		normalizeOrganisationDisplayName(
			model.organisation_name,
			model.organisation_id,
		) ?? "",
	).trim();
	const labPrefix = `${organisationLabel}: `;
	const nameHasLabPrefix =
		Boolean(organisationLabel) &&
		model.name.toLowerCase().startsWith(labPrefix.toLowerCase());
	const modelDisplayName =
		showOrganisationPrefix && organisationLabel
			? nameHasLabPrefix
				? model.name
				: `${labPrefix}${model.name}`
			: model.name;
	const safeModelDisplayName = String(modelDisplayName ?? "").trim() || displayModelId;
	// Phones drop the "Lab: " prefix; the lab logo sits right beside the name.
	const shortModelName =
		String(nameHasLabPrefix ? model.name.slice(labPrefix.length) : model.name).trim() ||
		displayModelId;
	const showLabPrefix =
		Boolean(organisationLabel) && (showOrganisationPrefix || nameHasLabPrefix);
	const lifecycleStatus = String(model.status ?? "")
		.trim()
		.toLowerCase();
	const isRetired =
		lifecycleStatus === "retired" ||
		lifecycleStatus === "removed" ||
		hasPassedLifecycleDate(model.retirement_date) ||
		hasPassedLifecycleDate(model.removal_date);
	const isDeprecated =
		!isRetired &&
		(lifecycleStatus === "deprecated" ||
			hasPassedLifecycleDate(model.deprecation_date));
	const LifecycleIcon = isRetired || isDeprecated ? BadgeAlert : null;
	const lifecycleLabel = isRetired
		? t("lifecycleEndOfLife")
		: isDeprecated
			? t("lifecycleDeprecated")
			: null;
	const isComingSoon =
		!isRetired && !isDeprecated && model.gateway_status === "coming_soon";
	const visibility = resolveModelVisibility(model);
	const isInternal = visibility === "internal";
	const isPrivate = visibility === "private";
	const visibilityLabel = isInternal
		? tDetail("sections.internalOnly")
		: isPrivate
			? t("filtersUi.tierPrivate")
			: null;
	const VisibilityIcon = isInternal ? EyeOff : isPrivate ? LockKeyhole : null;
	const visibilityBadge = (display: string, iconOnly = false) =>
		VisibilityIcon && visibilityLabel ? (
			<span
				title={iconOnly ? visibilityLabel : undefined}
				className={cn(
					display,
					"shrink-0 items-center gap-1 rounded-md border text-[11px] font-medium leading-4",
					iconOnly ? "p-0.5" : "px-1.5 py-px",
					isInternal
						? "border-[#00b8db]/30 bg-[#00b8db]/10 text-cyan-700 dark:text-cyan-300"
						: "border-border bg-muted text-muted-foreground",
				)}
			>
				<VisibilityIcon className="size-3" aria-hidden="true" />
				<span className={iconOnly ? "sr-only" : undefined}>{visibilityLabel}</span>
			</span>
		) : null;
	const [copied, setCopied] = useState(false);
	const routerRequests30d =
		Number.isFinite(Number(model.router_requests_30d)) &&
		Number(model.router_requests_30d) > 0
			? Number(model.router_requests_30d)
			: null;
	const routerSpend30d = formatCostNanos(model.router_spend_nanos_30d, format.number);
	const rawProviderDetails = (model.gateway_provider_details ?? [])
		.map((provider) => ({
			id: String(provider.id ?? "").trim(),
			name: String(provider.name ?? "").trim(),
			status: normalizeProviderStatus(
				provider.status ?? (provider.is_active ? "active" : "inactive"),
			),
			isActive: Boolean(provider.is_active),
		}))
		.filter((provider) => provider.name);
	const providerDetails = Array.from(
		rawProviderDetails.reduce((providers, provider) => {
			const key = provider.id || provider.name.toLowerCase();
			const existing = providers.get(key);
			if (!existing) {
				providers.set(key, provider);
				return providers;
			}
			providers.set(key, {
				...existing,
				isActive: existing.isActive || provider.isActive,
				status:
					providerStatusPriority(provider.status) < providerStatusPriority(existing.status)
						? provider.status
						: existing.status,
			});
			return providers;
		}, new Map<string, (typeof rawProviderDetails)[number]>()),
	).map(([, provider]) => provider);
	const providerNames = Array.from(
		new Set(
			(model.gateway_provider_names ?? [])
				.map((value) => String(value ?? "").trim())
				.filter(Boolean),
		),
	).sort((a, b) => a.localeCompare(b));
	const activeProviderNameSet = new Set(
		(model.gateway_active_provider_names ?? [])
			.map((value) => String(value ?? "").trim())
			.filter(Boolean),
	);
	const providerStatusItems =
		providerDetails.length > 0
			? providerDetails.sort((a, b) => {
					const priorityDiff =
						providerStatusPriority(a.status) - providerStatusPriority(b.status);
					if (priorityDiff !== 0) return priorityDiff;
					return a.name.localeCompare(b.name);
				})
			: providerNames
					.map((name) => ({
						id: "",
						name,
						status: activeProviderNameSet.has(name) ? "active" : "inactive",
						isActive: activeProviderNameSet.has(name),
					}))
					.sort((a, b) => {
						const priorityDiff =
							providerStatusPriority(a.status) - providerStatusPriority(b.status);
						if (priorityDiff !== 0) return priorityDiff;
						return a.name.localeCompare(b.name);
					});
	const providerCount = providerStatusItems.length > 0
		? providerStatusItems.length
		: model.gateway_provider_count ?? 0;
	const activeProviders = providerStatusItems.length > 0
		? providerStatusItems.filter((provider) => provider.isActive).length
		: model.gateway_active_provider_count ?? 0;
	const PROVIDER_ROW_HEIGHT = 28;
	const PROVIDER_ROW_GAP = 4;
	const providerListHeight = Math.min(
		224,
		providerStatusItems.length * PROVIDER_ROW_HEIGHT +
			Math.max(0, providerStatusItems.length - 1) * PROVIDER_ROW_GAP,
	);
	const inputModalities = model.gateway_input_modalities ?? [];
	const capabilities = decisionModelCapabilities(model.gateway_endpoints ?? []);
	const dualDecisionsModel = capabilities.length === 2;
	const outputModalities = model.gateway_output_modalities ?? [];
	const contextLengths = (model.context_lengths ?? []).filter(
		(value) => Number.isFinite(value) && value > 0,
	);
	const maxContextLength =
		contextLengths.length > 0 ? Math.max(...contextLengths) : null;
	const modalitySet = new Set(
		[...inputModalities, ...outputModalities].map((value) =>
			normalizeModalityOrderKey(String(value ?? "")),
		),
	);
	const isTextModel = modalitySet.has("text");
	const inputPrice = formatPrice(model.lowest_input_price, format.number, { allowZero: true });
	const outputPrice = formatPrice(model.lowest_output_price, format.number, { allowZero: true });
	const standardInputPrice = formatPrice(model.lowest_standard_input_price, format.number, {
		allowZero: true,
	});
	const standardOutputPrice = formatPrice(model.lowest_standard_output_price, format.number, {
		allowZero: true,
	});
	const primaryInputKey = inputModalities[0]
		? normalizeModalityOrderKey(String(inputModalities[0]))
		: "";
	const primaryOutputKey = outputModalities[0]
		? normalizeModalityOrderKey(String(outputModalities[0]))
		: "";
	const outputUsesCheapestTierPrefix =
		primaryOutputKey === "image" || primaryOutputKey === "video";
	const formatStructuredPriceSummary = (
		input: string | null,
		output: string | null,
	) => {
		const formattedOutput =
			output && outputUsesCheapestTierPrefix ? `${output}+` : output;
		return input && formattedOutput
			? `${input} / ${formattedOutput}`
			: input
				? input
				: formattedOutput
					? formattedOutput
					: null;
	};
	const ioPriceSummary = formatStructuredPriceSummary(inputPrice, outputPrice);
	const standardIoPriceSummary = formatStructuredPriceSummary(
		standardInputPrice,
		standardOutputPrice,
	);
	const structuredPriceSummary = standardIoPriceSummary ?? ioPriceSummary;
	const explicitFromPrice = formatFromPrice(
		model.lowest_from_price,
		model.lowest_from_price_unit,
		format.number,
		{ allowZero: true },
	);
	const tokenPriceCandidates = [model.lowest_input_price, model.lowest_output_price]
		.filter((value) => value !== null && value !== undefined)
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value >= 0);
	const standardTokenPriceCandidates = [
		model.lowest_standard_input_price,
		model.lowest_standard_output_price,
	]
		.filter((value) => value !== null && value !== undefined)
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value >= 0);
	const fallbackFromPrice =
		tokenPriceCandidates.length > 0
			? formatFromPrice(Math.min(...tokenPriceCandidates), "1M tokens", format.number)
			: null;
	const normalizedFromPriceUnit = normalizeFromPriceUnit(model.lowest_from_price_unit);
	const parsedFromPrice =
		model.lowest_from_price === null ||
		model.lowest_from_price === undefined
			? null
			: Number(model.lowest_from_price);
	const hasZeroFromPrice =
		parsedFromPrice !== null &&
		Number.isFinite(parsedFromPrice) &&
		parsedFromPrice === 0;
	const hasFreeFromPrice =
		hasZeroFromPrice &&
		normalizedFromPriceUnit === "1M tokens";
	const isFreeTextModel =
		isTextModel &&
		isDisplayedApiModelFree &&
		(
			((standardTokenPriceCandidates.length > 0 || tokenPriceCandidates.length > 0) &&
				[...standardTokenPriceCandidates, ...tokenPriceCandidates].every(
					(value) => value === 0,
				)) ||
			hasFreeFromPrice
		);
	const isFreeDisplayModel =
		isDisplayedApiModelFree && (isFreeTextModel || hasZeroFromPrice);
	const fromPriceSummary = explicitFromPrice ?? fallbackFromPrice;
	// The API's headline price wins when present; the derivation above is the
	// fallback for rows that do not carry one yet.
	const headline = model.pricing_summary;
	const headlinePrice = (value: number) => formatHeadlinePrice(value, format.number);
	const headlineSummary = !headline
		? null
		: headline.kind === "free"
			? t("free")
			: headline.kind === "provider_cost"
				? t("atProviderCost")
				: headline.kind === "usage"
				? headline.per_image !== undefined
					// Three significant digits keep a sub-cent estimate exact ($0.0336, not $0.034).
					? t("pricePerImageEstimate", { price: `$${format.number(headline.per_image, { maximumSignificantDigits: 3, notation: "standard" })}` })
					: `${headlinePrice(headline.price)} / ${headline.unit}`
				: headline.input !== null && headline.output !== null
					? `${t("priceInputOutput", { input: headlinePrice(headline.input), output: headlinePrice(headline.output) })} / ${headline.unit}`
					: headline.input !== null
						? `${headlinePrice(headline.input)} / ${headline.unit}`
						: headline.output !== null
							? `${t("priceOutputOnly", { output: headlinePrice(headline.output) })} / ${headline.unit}`
							: null;
	const priceSummary =
		headlineSummary ?? (isFreeDisplayModel
			? t("free")
			: structuredPriceSummary
				? structuredPriceSummary
				: fromPriceSummary);
	const priceLabel = headlineSummary
		? headline && "from" in headline && headline.from ? t("from") : null
		: structuredPriceSummary || isTextModel ? t("pricing") : t("from");
	// Models with meter details but no headline price (for example, billed at
	// provider cost) still get a pill that opens the details.
	const pillValue = priceSummary
		?? ((model.pricing_detail_rows?.length ?? 0) > 0 ? t("pricing") : null);
	const pillLabel = priceSummary ? priceLabel : null;
	// The provider whose prices the hover card lists (none for stealth routes).
	const pricingProviderId = headlineSummary ? model.pricing_provider_id ?? null : null;
	const pricingProviderName = pricingProviderId
		? providerDetails.find((provider) => provider.id === pricingProviderId)?.name ?? null
		: null;
	const fallbackInputLabel =
		primaryInputKey === "image"
			? t("imageInputs")
			: primaryInputKey === "audio"
				? t("audioInput")
				: primaryInputKey === "video"
					? t("videoInput")
					: t("input");
	const fallbackOutputLabel =
		primaryOutputKey === "image"
			? t("outputImagesFrom")
			: primaryOutputKey === "audio"
				? t("audioOutput")
				: primaryOutputKey === "video"
					? t("videoOutputFrom")
					: t("output");
	const fallbackInputUnit =
		normalizeFromPriceUnit(model.lowest_from_price_unit) ??
		inferPriceUnitFromModality(primaryInputKey);
	const fallbackOutputUnit =
		(primaryOutputKey === primaryInputKey
			? normalizeFromPriceUnit(model.lowest_from_price_unit)
			: null) ?? inferPriceUnitFromModality(primaryOutputKey);
	const explicitPricingDetailRows = (model.pricing_detail_rows ?? []).filter(
		(row) =>
			Boolean(String(row?.label ?? "").trim()) &&
			Boolean(String(row?.value ?? "").trim()),
	);
	const explicitPricingHasVariants = explicitPricingDetailRows.some((row) =>
		String(row.label ?? "").includes("("),
	);
	const standardPricingRows = [
		{
			id: "input",
			label: String(model.lowest_standard_input_price_label ?? "").trim() || t("input"),
			value: formatPriceWithUnit(
				model.lowest_standard_input_price,
				model.lowest_standard_input_price_unit,
				format.number,
			),
		},
		{
			id: "output",
			label:
				String(model.lowest_standard_output_price_label ?? "").trim() || t("output"),
			value: formatPriceWithUnit(
				model.lowest_standard_output_price,
				model.lowest_standard_output_price_unit,
				format.number,
			),
		},
	].filter((row) => Boolean(row.value));
	const fallbackPricingRows = [
		{
			id: "input",
			label: fallbackInputLabel,
			value: formatPriceWithUnit(
				model.lowest_input_price,
				fallbackInputUnit,
				format.number,
			),
		},
		{
			id: "output",
			label: fallbackOutputLabel,
			value: formatPriceWithUnit(
				model.lowest_output_price,
				fallbackOutputUnit,
				format.number,
			),
		},
	].filter((row) => Boolean(row.value));
	const pricingRowById = new Map<
		string,
		{ id: string; label: string; value: string | null }
	>();
	for (const row of fallbackPricingRows) pricingRowById.set(row.id, row);
	for (const row of standardPricingRows) pricingRowById.set(row.id, row);
	const basePricingDetailRows = ["input", "output"]
		.map((id) => pricingRowById.get(id))
		.filter((row): row is { id: string; label: string; value: string } =>
			Boolean(row?.value),
		);
	let pricingDetailRows =
		explicitPricingDetailRows.length > 0 &&
		(explicitPricingHasVariants || standardPricingRows.length === 0)
			? explicitPricingDetailRows.map((row, index) => ({
					id: `explicit-${index}`,
					label: row.label,
					value: row.value,
				}))
			: basePricingDetailRows;
	if (
		explicitPricingDetailRows.length > 0 &&
		!explicitPricingHasVariants &&
		basePricingDetailRows.length > 0
	) {
		const existingKeys = new Set(
			basePricingDetailRows.map(
				(row) =>
					`${String(row.label ?? "").trim().toLowerCase()}::${String(row.value ?? "")
						.trim()
						.toLowerCase()}`,
			),
		);
		const additionalExplicitRows = explicitPricingDetailRows
			.map((row, index) => ({
				id: `explicit-${index}`,
				label: row.label,
				value: row.value,
			}))
			.filter((row) => {
				const key = `${String(row.label ?? "").trim().toLowerCase()}::${String(
					row.value ?? "",
				)
					.trim()
					.toLowerCase()}`;
				if (existingKeys.has(key)) return false;
				existingKeys.add(key);
				return true;
			});
		if (additionalExplicitRows.length > 0) {
			pricingDetailRows = [...basePricingDetailRows, ...additionalExplicitRows];
		}
	}
	if (headlineSummary && explicitPricingDetailRows.length > 0) {
		// The API sends every meter already grouped and ordered.
		pricingDetailRows = explicitPricingDetailRows.map((row, index) => ({
			id: `meter-${index}`,
			label: row.label,
			value: row.value,
		}));
	}
	if (pricingDetailRows.length === 0 && priceSummary) {
		pricingDetailRows = [
			{
				id: "summary",
			label: t("pricing"),
				value: priceSummary,
			},
		];
	}
	const priceCardLabels: PriceCardLabels = {
		kinds: {
			input: tPriceCard("rows.input"),
			output: tPriceCard("rows.output"),
			reasoning: tPriceCard("rows.reasoning"),
			cachedInput: tPriceCard("rows.cachedInput"),
			cachedWrite: tPriceCard("rows.cachedWrite"),
			requests: tPriceCard("rows.requests"),
			webSearch: tPriceCard("rows.webSearch"),
			webFetch: tPriceCard("rows.webFetch"),
			tokens: tPriceCard("rows.tokens"),
		},
		modalities: {
			image: tPriceCard("modalities.image"),
			video: tPriceCard("modalities.video"),
			audio: tPriceCard("modalities.audio"),
		},
		list: (items) => new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items),
		also: (list) => tPriceCard("alsoModalities", { list }),
		from: tPriceCard("from"),
		atProviderCost: t("atProviderCost"),
	};
	const priceCardRows = buildPriceCardRows(pricingDetailRows);
	const priceCardTokenUnitMode = priceCardTokenUnits(priceCardRows);
	const describedPriceCardRows = priceCardRows.map((row) => describePriceCardRow(row, priceCardLabels));
	const priceCardMeta = [
		pricingProviderId ? tPriceCard("cheapestRoute") : null,
		priceCardTokenUnitMode === "all" || (priceCardTokenUnitMode === "none" && headline?.kind === "tokens")
			? tPriceCard("perMillionTokens")
			: priceCardTokenUnitMode === "some"
				? tPriceCard("perMillionTokensUnlessNoted")
				: null,
	];
	// Token headlines read "$2 in · $10 out"; the meta line states the unit.
	const priceCardHeadline =
		headline?.kind === "tokens" && (headline.input !== null || headline.output !== null) ? (
			<>
				{headline.input !== null ? (
					<>
						{formatCardUsd(headline.input)}{" "}
						<span className="text-xs font-normal text-muted-foreground">{tPriceCard("in")}</span>
					</>
				) : null}
				{headline.input !== null && headline.output !== null ? (
					<span className="text-muted-foreground"> · </span>
				) : null}
				{headline.output !== null ? (
					<>
						{formatCardUsd(headline.output)}{" "}
						<span className="text-xs font-normal text-muted-foreground">{tPriceCard("out")}</span>
					</>
				) : null}
			</>
		) : (
			headlineSummary
		);
	const formatModalities = (values: string[]) => {
		const unique = sortModalitiesForDisplay(Array.from(
			new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
		));
		return {
			visible: unique,
			hiddenCount: 0,
		};
	};
	const inputModalityDisplay = formatModalities(inputModalities);
	const outputModalityDisplay = formatModalities(outputModalities);
	const weeklyUsage = resolveWeeklyUsageDisplay(model);
	const weeklyUsageValue = weeklyUsage.quantity === null ? "—" : `${weeklyUsage.unitSuffix
		? format.number(weeklyUsage.quantity, { maximumFractionDigits: 2, notation: "standard" })
		: format.count(weeklyUsage.quantity)}${weeklyUsage.unitSuffix}`;

	const copyModelId = async () => {
		try {
			await navigator.clipboard.writeText(displayModelId);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};
	const rowStyle: CSSProperties & Record<string, string | undefined> = {
		"--provider-accent": model.organisation_colour ?? undefined,
	};
	const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			target.closest("a,button,[role='button'],[data-no-row-nav='true']")
		) {
			return;
		}
		router.push(modelHref, { scroll: true });
	};

	return (
		<div
			className={cn(
				"group h-full cursor-pointer py-4 transition-colors hover:bg-muted/20 md:py-5",
			)}
			style={rowStyle}
			onClick={handleRowClick}
		>
			<div
				className={cn(
					"flex h-full flex-col gap-4 px-4 md:px-5",
					contentPaddingClassName,
				)}
			>
				<div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
					<Link
						href={`/organisations/${model.organisation_id}`}
						prefetch={false}
						className="shrink-0"
						scroll
					>
						<div className="w-10 h-10 relative flex items-center justify-center rounded-lg border bg-background ml-1 md:ml-0">
							{model.organisation_logo_url ? <Avatar className="size-full rounded-md after:rounded-md"><AvatarImage src={model.organisation_logo_url} alt={`${model.organisation_name ?? "Workspace"} logo`} className="rounded-md object-cover" /><AvatarFallback className="rounded-md">{(model.organisation_name ?? "W").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar> : <div className="w-6 h-6 relative">
								<Logo
									id={model.organisation_id}
									alt={tDetail("availabilityLabels.providerLogo", {
										provider:
											model.organisation_name ||
											tDetail("availabilityLabels.unknownProvider"),
										})}
									className="object-contain"
									fill
								/>
							</div>}
						</div>
					</Link>

					<div className="min-w-0 space-y-0.5 self-center">
						<div className="flex items-center gap-1 min-w-0">
							<Link
								href={modelHref}
								prefetch={false}
								scroll
								className="font-semibold text-sm leading-[1.1] text-foreground hover:underline underline-offset-4 transition-colors duration-200 line-clamp-1"
							>
								{showLabPrefix ? (
									<>
										<span className="sr-only sm:not-sr-only">{labPrefix}</span>
										{shortModelName}
									</>
								) : (
									safeModelDisplayName
								)}
							</Link>
							{visibilityBadge("hidden sm:inline-flex")}
							{displayModelId ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											onClick={copyModelId}
											className="hidden h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:inline-flex"
											aria-label={`Copy API model ID for ${safeModelDisplayName}`}
										>
											<span className="relative h-3 w-3">
												<Copy
													className={cn(
														"absolute inset-0 size-3 [stroke-width:1.75] transition-all duration-200 ease-out",
														copied
															? "translate-y-px scale-90 opacity-0"
															: "translate-y-0 scale-100 opacity-100",
													)}
												/>
												<Check
													className={cn(
														"absolute inset-0 size-3 [stroke-width:2.25] transition-all duration-200 ease-out",
														copied
															? "translate-y-0 scale-100 opacity-100"
															: "-translate-y-px scale-90 opacity-0",
													)}
												/>
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">
										{copied ? tAuditCopy("Catalogue.common.copied") : tAuditCopy("Common.ui.actions.copyModelId")}
									</TooltipContent>
								</Tooltip>
							) : null}
						</div>
						<div className="flex min-w-0 items-center gap-1.5">
							{visibilityBadge("inline-flex sm:hidden", true)}
							<div className="min-w-0 truncate text-xs leading-[1.15] text-muted-foreground font-mono">
								{displayModelId}
							</div>
						</div>
					</div>

					<Button asChild size="icon" variant="ghost" className="hidden h-8 w-8 shrink-0 sm:inline-flex">
						<Link
							href={modelHref}
							prefetch={false}
							scroll
							aria-label={t("viewDetails")}
							className="group/open"
						>
							<ArrowUpRight
								className={cn(
									"h-4 w-4 text-muted-foreground transition-colors",
									model.organisation_colour
										? "group-hover:text-[var(--provider-accent)]"
										: "group-hover:text-primary",
								)}
							/>
						</Link>
					</Button>
				</div>

				<div className="grid gap-2 text-xs md:grid-cols-3">
					<ModelCardScrollRail ariaLabel={t("modelSummary")} className="md:col-span-3">
						<div className="flex w-max min-w-full items-center gap-1.5 pb-px text-[11px] [&>*]:shrink-0">
						{isComingSoon ? (
							<span className="inline-flex items-center gap-1 rounded-md border border-[#2b7fff]/30 bg-[#2b7fff]/10 px-2 py-1 font-medium text-blue-700 dark:text-blue-300">
								<CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
								<span>{t("filtersUi.comingSoon")}</span>
							</span>
						) : null}
						{dualDecisionsModel ? (model.operation_pricing?.length ? model.operation_pricing.map(operation => (
							<span key={operation.capability} className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">{t(`filtersUi.${operation.capability === "text.generate" ? "capabilityTextGeneration" : "modalityDecisions"}`)}</span>
								<span className="font-medium tabular-nums">
									{t("input")} {formatPrice(operation.input, format.number, { allowZero: true }) ?? "—"} / {t("output")} {formatPrice(operation.output, format.number, { allowZero: true }) ?? "—"} · {tDetail("pricing.perMillionTokens")}
								</span>
							</span>
						)) : <Link href={`${modelHref}/pricing`} className="rounded-md border border-border/60 px-2 py-1 underline underline-offset-2">{t("pricing")}</Link>) : null}
						{!dualDecisionsModel && pillValue ? (
							pricingDetailRows.length > 0 ? (
								<HoverCard>
									<HoverCardTrigger asChild>
										<Link
											href={`${modelHref}/pricing`}
											prefetch={false}
											data-no-row-nav="true"
											className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-left transition-colors hover:bg-muted/45"
										>
											{pillLabel ? (
												<span className="text-muted-foreground">{pillLabel}</span>
											) : null}
											<span className="font-medium tabular-nums text-foreground">
												{pillValue}
											</span>
										</Link>
									</HoverCardTrigger>
									<HoverCardContent align="start" className="max-h-96 w-72 space-y-2.5 overflow-y-auto rounded-md p-3">
										<HoverCardHeader
											icon={pricingProviderId && pricingProviderName ? (
												<span className="relative block h-4 w-4 shrink-0 rounded-[4px] border bg-background">
													<Logo
														id={resolveProviderLogoId({ providerId: pricingProviderId })}
														alt=""
														className="object-contain p-[1px]"
														fill
													/>
												</span>
											) : null}
											title={pricingProviderName ?? t("pricing")}
											meta={priceCardMeta}
										/>
										{priceCardHeadline ? <HoverCardStat>{priceCardHeadline}</HoverCardStat> : null}
										<PriceCardRowList rows={describedPriceCardRows} />
									</HoverCardContent>
								</HoverCard>
							) : (
								<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
									{pillLabel ? (
										<span className="text-muted-foreground">{pillLabel}</span>
									) : null}
									<span className="font-medium tabular-nums text-foreground">{pillValue}</span>
								</div>
							)
						) : null}
						{LifecycleIcon && lifecycleLabel ? (
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-md border px-2 py-1",
									isRetired
										? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
										: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
								)}
								aria-label={lifecycleLabel}
							>
								<LifecycleIcon className="h-3.5 w-3.5" aria-hidden="true" />
								<span>{lifecycleLabel}</span>
							</span>
						) : providerStatusItems.length > 0 ? (
							<HoverCard>
								<HoverCardTrigger asChild>
									<button
										type="button"
										data-no-row-nav="true"
										className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-left transition-colors hover:bg-muted/45"
									>
										<span className="text-muted-foreground">{t("providers")}</span>
										<span className="font-medium text-foreground tabular-nums">
											{format.number(activeProviders)}/{format.number(providerCount)}
										</span>
									</button>
								</HoverCardTrigger>
								<HoverCardContent align="start" className="w-72 space-y-2.5 rounded-md p-3">
									<HoverCardHeader
										title={t("providers")}
										meta={[tCard("activeListed", { active: format.number(activeProviders), listed: format.number(providerCount) })]}
									/>
									<ScrollArea className="pr-1" style={{ height: providerListHeight }}>
										<ul className="space-y-1 pr-2 text-xs">
											{providerStatusItems.map((provider) => {
												const statusLabel = formatProviderStatusLabel(provider.status, providerStatusLabels);
												return (
													<li
														key={`${provider.id || "provider"}-${provider.name}`}
														className="flex items-center gap-2 py-1"
													>
														{provider.id ? (
															<Link
																href={`/api-providers/${provider.id}`}
																prefetch={false}
																className="flex min-w-0 items-center gap-2 text-foreground underline-offset-2 hover:underline"
															>
																<span className="relative h-4 w-4 shrink-0 rounded-md border bg-background">
																	<Logo
																		id={resolveProviderLogoId({ providerId: provider.id })}
																		alt=""
																		className="object-contain p-[1px]"
																		fill
																	/>
																</span>
																<span className="truncate">{provider.name}</span>
															</Link>
														) : (
															<span className="min-w-0 truncate text-foreground">{provider.name}</span>
														)}
														<span
															title={statusLabel}
															className={cn("size-1.5 shrink-0 rounded-full", PROVIDER_STATUS_META[provider.status]?.dotClassName ?? "bg-muted-foreground/60")}
														>
															<span className="sr-only">{statusLabel}</span>
														</span>
													</li>
												);
											})}
										</ul>
									</ScrollArea>
								</HoverCardContent>
							</HoverCard>
						) : (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">{t("providers")}</span>
								<span className="font-medium text-foreground tabular-nums">
									{format.number(activeProviders)}/{format.number(providerCount)}
								</span>
							</div>
						)}
						{maxContextLength ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">{t("filtersUi.contextLength")}</span>
								<span className="font-medium text-foreground tabular-nums">
									{t("tokenCountDisplay", { count: format.number(maxContextLength, { maximumFractionDigits: 2 }) })}
								</span>
							</div>
						) : null}
						{routerRequests30d !== null ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">{t("freeRouter.requests30d")}</span>
								<span className="font-medium tabular-nums text-foreground">
									{format.number(routerRequests30d)}
								</span>
							</div>
						) : null}
						{routerSpend30d ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">{t("freeRouter.spend30d")}</span>
								<span className="font-medium tabular-nums text-foreground">
									{routerSpend30d}
								</span>
							</div>
						) : null}
						</div>
					</ModelCardScrollRail>

					<div className="min-w-0 space-y-1 md:col-span-3">
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">
								{t("input")}
							</span>
							<ModelCardScrollRail ariaLabel={t("filtersUi.inputModalities")} className="flex-1">
								<div className="flex w-max min-w-full items-center gap-1 pb-px [&>*]:shrink-0">
								{inputModalityDisplay.visible.length > 0 ? (
									<>
										{inputModalityDisplay.visible.map((modality) => {
											const Icon = getModalityIcon(modality);
											const tone = getModalityTone(modality);
											return (
												<span
													key={`input-${modality}`}
													className={cn(
												"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
														tone.badgeClassName,
													)}
												>
													<Icon className={cn("h-3 w-3", tone.iconClassName)} />
													{toTitleLabel(modality)}
												</span>
											);
										})}
										{inputModalityDisplay.hiddenCount > 0 ? (
											<span className="inline-flex items-center rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
												{t("othersCount", { count: inputModalityDisplay.hiddenCount })}
											</span>
										) : null}
									</>
								) : (
									<span className="text-[11px] text-muted-foreground">-</span>
								)}
								</div>
							</ModelCardScrollRail>
						</div>
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">
								{t("output")}
							</span>
							<ModelCardScrollRail ariaLabel={t("filtersUi.outputModalities")} className="flex-1">
								<div className="flex w-max min-w-full items-center gap-1 pb-px [&>*]:shrink-0">
								{outputModalityDisplay.visible.length > 0 ? (
									<>
										{outputModalityDisplay.visible.map((modality) => {
											const Icon = getModalityIcon(modality);
											const tone = getModalityTone(modality);
											return (
												<span
													key={`output-${modality}`}
													className={cn(
												"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
														tone.badgeClassName,
													)}
												>
													<Icon className={cn("h-3 w-3", tone.iconClassName)} />
													{toTitleLabel(modality)}
												</span>
											);
										})}
										{outputModalityDisplay.hiddenCount > 0 ? (
											<span className="inline-flex items-center rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
												{t("othersCount", { count: outputModalityDisplay.hiddenCount })}
											</span>
										) : null}
									</>
								) : (
									<span className="text-[11px] text-muted-foreground">-</span>
								)}
								</div>
							</ModelCardScrollRail>
						</div>
					</div>
				</div>

				<div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span className="truncate">{model.primary_date ? format.calendarDate(model.primary_date) : tAuditCopy("Common.ui.auditCopy.dateUnknown")}</span>
					<div className="shrink-0">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="hidden h-8 px-2 tabular-nums text-muted-foreground md:inline-flex"
									aria-label={weeklyUsage.label}
								>
									{weeklyUsageValue}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">{weeklyUsage.label}</TooltipContent>
						</Tooltip>

						<Popover>
							<PopoverTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="h-8 px-2 tabular-nums text-muted-foreground md:hidden"
									aria-label={weeklyUsage.label}
								>
									{weeklyUsageValue}
								</Button>
							</PopoverTrigger>
							<PopoverContent
								side="top"
								align="end"
								className="w-auto px-2.5 py-1.5 text-xs"
							>
								{weeklyUsage.label}
							</PopoverContent>
						</Popover>
					</div>
				</div>
			</div>
		</div>
	);
}

export const ModelCard = memo(ModelCardImpl);
ModelCard.displayName = "ModelCard";
