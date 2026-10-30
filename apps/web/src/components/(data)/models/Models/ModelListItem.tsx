"use client";

import { useModelsLayoutTracking } from "./useModelsLayoutExperiment";

import Link from "next/link";
import { memo, useState, type CSSProperties, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
	ArrowRight,
	BadgeAlert,
	CalendarClock,
	Check,
	Copy,
	EyeOff,
	Lock,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { hasPassedLifecycleDate } from "@/lib/models/modelLifecycle";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";
import { cn } from "@/lib/utils";
import { getModalityIcon } from "./modalityIcons";
import { compareModalitiesByDisplayOrder } from "./modalityOrder";
import { groupProviders, variantRegionCode, type ProviderGroup } from "./providerGroups";
import { useModalityLabel } from "./useModalityLabel";

type ModelListItemModel = Omit<ModelCardType, "gateway_status"> & {
	gateway_status?:
		| ModelCardType["gateway_status"]
		| "coming_soon"
		| "deprecated"
		| "retired"
		| null;
	// Set on workspace private-endpoint models, which only their workspace sees.
	is_private?: boolean;
};

type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;

// Matches the card's headline formatting: cents for fractional amounts, bare
// integers, and three significant digits below a cent so small rates never look free.
function formatHeadlinePrice(value: number, formatNumber: FormatNumber): string {
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

// Unit wording for fallback prices, matching the card's normalisation.
function normalizePriceUnit(value: string | null | undefined): string | null {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return null;
	if (/^(per )?1m tokens?$/.test(normalized) || normalized === "token" || normalized === "tokens") {
		return "1M tokens";
	}
	if (normalized === "sec" || normalized === "secs" || normalized === "seconds") return "second";
	if (normalized === "min" || normalized === "mins" || normalized === "minutes") return "minute";
	if (normalized === "hr" || normalized === "hrs" || normalized === "hours") return "hour";
	if (normalized === "images") return "image";
	if (normalized === "videos") return "video";
	if (normalized === "characters") return "character";
	return normalized;
}

function finitePrice(value: number | null | undefined): number | null {
	return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
		? Number(value)
		: null;
}

function uniqueModalities(values: string[] | undefined): string[] {
	return Array.from(
		new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)),
	).sort(compareModalitiesByDisplayOrder);
}

// Icons stay muted until the pointer is over them, then take each modality's
// colour while a tooltip names the input and output types.
function ModalityIcons({ input, output }: { input: string[]; output: string[] }) {
	const t = useTranslations("Catalogue.models");
	const modalityLabel = useModalityLabel();
	if (input.length === 0 && output.length === 0) return null;
	// Literal keys keep the page's client message scope narrow.
	const directionLabels = { input: t("input"), output: t("output") };
	const renderIcons = (values: string[], direction: "input" | "output") =>
		values.map((value) => {
			const Icon = getModalityIcon(value);
			const label = modalityLabel(value);
			return (
				<Tooltip key={`${direction}-${value}`}>
					<TooltipTrigger asChild>
						<span
							role="img"
							className="group inline-flex items-center"
							aria-label={`${directionLabels[direction]}: ${label}`}
						>
							<Icon
								className={cn(
									"size-3.5 shrink-0 transition-colors",
									getModalityTone(value).ghostIconHoverClassName,
								)}
								aria-hidden="true"
							/>
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" className="text-xs">
						<span className="text-muted-foreground">{directionLabels[direction]}</span> {label}
					</TooltipContent>
				</Tooltip>
			);
		});
	return (
		<span className="inline-flex items-center gap-1">
			{renderIcons(input, "input")}
			<ArrowRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
			{renderIcons(output, "output")}
		</span>
	);
}

function ProviderLogo({
	logoId,
	isActive,
	className,
}: {
	logoId: string | null;
	isActive: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"relative inline-flex size-4 shrink-0 rounded-[4px] border bg-background",
				// Greyscale rather than faded, so overlapping logos never show through.
				!isActive && "grayscale",
				className,
			)}
		>
			{logoId ? <Logo id={logoId} alt="" className="object-contain p-[1px]" fill /> : null}
		</span>
	);
}

// A provider's one-line label: its name, then each region or data policy it
// serves this model under, and its status when it is not live.
function useProviderLabel(): (provider: ProviderGroup) => { name: string; detail: string | null } {
	const t = useTranslations("Catalogue.models");
	const tStatus = useTranslations("Catalogue.modelDetail.providerTable.statuses");
	const locale = useLocale();
	// Literal keys keep the page's client message scope narrow.
	const statusLabel = (status: string): string | null => {
		switch (status) {
			case "inactive":
			case "not_active":
				return tStatus("inactive");
			case "disabled":
				return tStatus("disabled");
			case "coming_soon":
				return tStatus("comingSoon");
			case "internal_testing":
				return tStatus("internalTesting");
			case "rate_limited":
				return tStatus("rateLimited");
			case "degraded":
				return tStatus("degraded");
			case "external":
				return tStatus("external");
			default:
				return null;
		}
	};
	return (provider) => {
		const variantLabel = (variant: string | null) => {
			if (!variant) return t("listProviderStandard");
			if (variant === "global") return t("listProviderGlobal");
			if (variant === "zdr") return t("listProviderZdr");
			if (variant === "e2ee") return t("listProviderE2ee");
			const code = variantRegionCode(variant);
			try {
				return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
			} catch {
				return code;
			}
		};
		const parts: string[] = [];
		if (provider.options.length > 1 || provider.options[0]?.variant) {
			parts.push(provider.options.map((option) => variantLabel(option.variant)).join(", "));
		}
		const status = provider.isActive ? null : statusLabel(provider.status);
		if (status) parts.push(status);
		return { name: provider.name, detail: parts.length > 0 ? parts.join(" · ") : null };
	};
}

// Each logo links to the model's providers section, which lists every route
// with its prices; the tooltip only names the logo.
function ProviderSummary({
	providers,
	text,
	href,
	onOpen,
}: {
	providers: ProviderGroup[];
	text: string;
	href: string;
	onOpen: () => void;
}) {
	const providerLabel = useProviderLabel();
	if (providers.length === 0) {
		return (
			<Link href={href} prefetch={false} onClick={onOpen} className="underline-offset-2 hover:text-foreground hover:underline">
				{text}
			</Link>
		);
	}
	const single = providers.length === 1;
	return (
		<span className="inline-flex items-center">
			{/* Overlapping stack, live providers on top; the hovered logo lifts to the front. */}
			<span className="flex items-center -space-x-1.5">
				{providers.map((provider, index) => {
					const { name, detail } = providerLabel(provider);
					const link = (
						<Link
							href={href}
							prefetch={false}
							onClick={onOpen}
							aria-label={single ? undefined : detail ? `${name}: ${detail}` : name}
							className={cn(
								"group/logo relative z-(--stack) inline-flex items-center gap-1.5 rounded-sm underline-offset-2 hover:z-50 hover:text-foreground focus-visible:z-50",
								single && "pr-0.5",
							)}
							style={{ "--stack": providers.length - index } as CSSProperties}
						>
							<ProviderLogo
								logoId={provider.logoId}
								isActive={provider.isActive}
								className="ring-2 ring-background transition-transform duration-150 group-hover/logo:-translate-y-0.5 group-hover/logo:scale-110 group-focus-visible/logo:-translate-y-0.5 group-focus-visible/logo:scale-110"
							/>
							{single ? <span className="group-hover/logo:underline">{text}</span> : null}
						</Link>
					);
					// A lone provider is already named beside its logo.
					if (single && !detail) return <span key={provider.key}>{link}</span>;
					return (
						<Tooltip key={provider.key}>
							<TooltipTrigger asChild>{link}</TooltipTrigger>
							<TooltipContent side="top" className="text-xs">
								{single ? null : <span className="font-medium">{name}</span>}
								{detail ? (
									<span className={single ? undefined : "text-muted-foreground"}>
										{single ? detail : ` · ${detail}`}
									</span>
								) : null}
							</TooltipContent>
						</Tooltip>
					);
				})}
			</span>
			{single ? null : <span className="sr-only">{text}</span>}
		</span>
	);
}

function Separator({ className }: { className?: string }) {
	return (
		<span aria-hidden="true" className={cn("opacity-50", className)}>
			·
		</span>
	);
}

function ModelListItemImpl({
	model,
	showOrganisationPrefix = false,
}: {
	model: ModelListItemModel;
	showOrganisationPrefix?: boolean;
}) {
	const t = useTranslations("Catalogue.models");
	const tDetail = useTranslations("Catalogue.modelDetail");
	const tRoot = useTranslations();
	const format = useDisplayFormatters();
	const router = useRouter();
	const [copied, setCopied] = useState(false);
	const trackLayout = useModelsLayoutTracking();
	const copyModelId = async () => {
		try {
			await navigator.clipboard.writeText(model.model_id);
			trackLayout("models_layout_model_id_copied", { model_id: model.model_id });
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};

	const modelHref =
		getModelDetailsHref(model.organisation_id, model.model_id) ?? `/models/${model.model_id}`;
	const organisationLabel = String(
		normalizeOrganisationDisplayName(model.organisation_name, model.organisation_id) ?? "",
	).trim();
	const displayName =
		showOrganisationPrefix && organisationLabel
			? model.name.toLowerCase().startsWith(`${organisationLabel.toLowerCase()}: `)
				? model.name
				: `${organisationLabel}: ${model.name}`
			: model.name;
	const safeDisplayName = String(displayName ?? "").trim() || model.model_id;
	const description = String(model.description ?? "").trim();

	const lifecycleStatus = String(model.status ?? "").trim().toLowerCase();
	const isRetired =
		lifecycleStatus === "retired" ||
		lifecycleStatus === "removed" ||
		hasPassedLifecycleDate(model.retirement_date) ||
		hasPassedLifecycleDate(model.removal_date);
	const isDeprecated =
		!isRetired &&
		(lifecycleStatus === "deprecated" || hasPassedLifecycleDate(model.deprecation_date));
	// Hidden models reach the list only through the admin staged-models query;
	// they arrive as coming soon but are not public yet.
	const isInternal = model.hidden === true;
	const isPrivate = model.is_private === true;
	const isComingSoon =
		!isInternal && !isRetired && !isDeprecated && model.gateway_status === "coming_soon";

	const headline = model.pricing_summary;
	const price = (value: number) => formatHeadlinePrice(value, format.number);
	let priceText: string | null = null;
	let priceUnit: string | null = null;
	// Token prices also stack as labelled input and output rows on desktop.
	let priceRows: Array<{ label: string; value: string }> = [];
	const tokenRows = (input: number | null, output: number | null) =>
		[
			input !== null ? { label: t("input"), value: price(input) } : null,
			output !== null ? { label: t("output"), value: price(output) } : null,
		].filter((row): row is { label: string; value: string } => row !== null);
	if (headline?.kind === "free") {
		priceText = t("free");
	} else if (headline?.kind === "usage") {
		priceText = price(headline.price);
		priceUnit = headline.unit;
	} else if (headline?.kind === "tokens") {
		priceText =
			headline.input !== null && headline.output !== null
				? t("priceInputOutput", { input: price(headline.input), output: price(headline.output) })
				: headline.input !== null
					? price(headline.input)
					: headline.output !== null
						? t("priceOutputOnly", { output: price(headline.output) })
						: null;
		priceUnit = priceText ? headline.unit : null;
		priceRows = tokenRows(headline.input, headline.output);
	}
	let priceIsFrom = headline && headline.kind !== "free" ? headline.from : false;
	// Rows without an API headline fall back to the catalogue's lowest prices;
	// with none at all the price is left out rather than replaced by a link.
	if (!priceText) {
		const standardInput = finitePrice(model.lowest_standard_input_price);
		const standardOutput = finitePrice(model.lowest_standard_output_price);
		const lowestInput = finitePrice(model.lowest_input_price);
		const lowestOutput = finitePrice(model.lowest_output_price);
		const fromPrice = finitePrice(model.lowest_from_price);
		const [input, output, unit] =
			standardInput !== null || standardOutput !== null
				? [
						standardInput,
						standardOutput,
						normalizePriceUnit(
							model.lowest_standard_input_price_unit ?? model.lowest_standard_output_price_unit,
						) ?? "1M tokens",
					]
				: [lowestInput, lowestOutput, "1M tokens"];
		if (input !== null || output !== null) {
			priceText =
				input !== null && output !== null
					? t("priceInputOutput", { input: price(input), output: price(output) })
					: input !== null
						? price(input)
						: t("priceOutputOnly", { output: price(output ?? 0) });
			priceUnit = unit;
			priceRows = tokenRows(input, output);
		} else if (fromPrice !== null) {
			priceText = price(fromPrice);
			priceUnit = normalizePriceUnit(model.lowest_from_price_unit);
			priceIsFrom = true;
		}
	}
	const priceUnitText = priceUnit
		? priceIsFrom
			? t("listPriceFromPerUnit", { unit: priceUnit })
			: t("listPricePerUnit", { unit: priceUnit })
		: null;

	const contextLengths = (model.context_lengths ?? []).filter(
		(value) => Number.isFinite(value) && value > 0,
	);
	const maxContext = contextLengths.length > 0 ? Math.max(...contextLengths) : null;
	const providers = groupProviders(model.gateway_provider_details ?? []);
	const providerTotal = providers.length || (model.gateway_provider_count ?? 0);
	const providerLive = providers.length
		? providers.filter((provider) => provider.isActive).length
		: (model.gateway_active_provider_count ?? 0);
	const providerText =
		providerTotal === 0
			? null
			: providers.length === 1
				? providers[0].name
				: isComingSoon
					? t("listProvidersComingSoon", { count: providerTotal })
					: providerLive > 0 && providerLive < providerTotal
						? t("listProvidersLive", { live: providerLive, total: providerTotal })
						: t("listProviders", { count: providerTotal });
	const inputModalities = uniqueModalities(model.gateway_input_modalities);
	const outputModalities = uniqueModalities(model.gateway_output_modalities);

	const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest("a,button,[role='button']")) return;
		trackLayout("models_layout_model_opened", { model_id: model.model_id });
		router.push(modelHref, { scroll: true });
	};

	return (
		<div
			className={cn(
				"group/row grid cursor-pointer grid-cols-1 items-start gap-x-7 border-b border-border/70 px-1 py-3.5 transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_9rem] sm:px-2",
				isComingSoon && "[&_[data-price]]:text-muted-foreground",
			)}
			onClick={handleRowClick}
		>
			<div className="flex min-w-0 items-start gap-3">
				<Link
					href={`/organisations/${model.organisation_id}`}
					prefetch={false}
					className="mt-px shrink-0"
					scroll
				>
					<span className="relative flex size-8 items-center justify-center rounded-md border bg-background">
						{model.organisation_logo_url ? (
							<Avatar className="size-full rounded-md after:rounded-md">
								<AvatarImage
									src={model.organisation_logo_url}
									alt={`${model.organisation_name ?? "Workspace"} logo`}
									className="rounded-md object-cover"
								/>
								<AvatarFallback className="rounded-md">
									{(model.organisation_name ?? "W").slice(0, 2).toUpperCase()}
								</AvatarFallback>
							</Avatar>
						) : (
							<span className="relative size-5">
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
							</span>
						)}
					</span>
				</Link>

				<div className="min-w-0 flex-1">
					{/* The name wraps rather than truncating; the chips and model ID
					    flow onto the next line when there is no room. */}
					<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
						<Link
							href={modelHref}
							onClick={() => trackLayout("models_layout_model_opened", { model_id: model.model_id })}
							prefetch={false}
							scroll
							className="min-w-0 break-words text-sm font-semibold text-foreground underline-offset-4 hover:underline"
						>
							{safeDisplayName}
						</Link>
						{isInternal || isPrivate ? (
							<span
								className={cn(
									"inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[11px] font-medium",
									isInternal
										? "border-[#00b8db]/30 bg-[#00b8db]/10 text-cyan-700 dark:text-cyan-300"
										: "border-border bg-muted text-muted-foreground",
								)}
							>
								{isInternal ? (
									<EyeOff className="size-3" aria-hidden="true" />
								) : (
									<Lock className="size-3" aria-hidden="true" />
								)}
								{isInternal ? t("listInternal") : t("listPrivate")}
							</span>
						) : null}
						{isComingSoon ? (
							<span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#2b7fff]/30 bg-[#2b7fff]/10 px-1.5 py-px text-[11px] font-medium text-blue-700 dark:text-blue-300">
								<CalendarClock className="size-3" aria-hidden="true" />
								{t("filtersUi.comingSoon")}
							</span>
						) : isRetired || isDeprecated ? (
							<span
								className={cn(
									"inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[11px] font-medium",
									isRetired
										? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
										: "border-[#ff6900]/30 bg-[#ff6900]/10 text-orange-700 dark:text-orange-300",
								)}
							>
								<BadgeAlert className="size-3" aria-hidden="true" />
								{isRetired ? "End of life" : "Deprecated"}
							</span>
						) : null}
						<span className="hidden min-w-0 max-w-full truncate font-mono text-xs text-muted-foreground sm:inline">
							{model.model_id}
						</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onClick={copyModelId}
									className="size-5 shrink-0 text-muted-foreground transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100"
									aria-label={`${tRoot("Common.ui.actions.copyModelId")}: ${model.model_id}`}
								>
									{copied ? (
										<Check className="size-3 [stroke-width:2.25]" aria-hidden="true" />
									) : (
										<Copy className="size-3 [stroke-width:1.75]" aria-hidden="true" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">
								{copied
									? tRoot("Catalogue.common.copied")
									: tRoot("Common.ui.actions.copyModelId")}
							</TooltipContent>
						</Tooltip>
					</div>

					{description ? (
						<p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground sm:text-[13px]">
							{description}
						</p>
					) : null}

					<div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
						{priceText ? (
							<span className="inline-flex items-center gap-2 sm:hidden">
								<span>
									<span data-price className="font-medium text-foreground tabular-nums">
										{priceText}
									</span>
									{priceUnitText ? ` ${priceUnitText}` : null}
								</span>
								<Separator />
							</span>
						) : null}
						<ModalityIcons input={inputModalities} output={outputModalities} />
						{maxContext ? (
							<>
								<Separator />
								<span className="tabular-nums">
									{t("listContext", { count: format.count(maxContext) })}
								</span>
							</>
						) : null}
						{providerText ? (
							<span className="hidden items-center gap-2 sm:inline-flex">
								<Separator />
								<ProviderSummary
									providers={providers}
									text={providerText}
									href={`${modelHref}#providers`}
									onOpen={() => trackLayout("models_layout_model_opened", { model_id: model.model_id })}
								/>
							</span>
						) : null}
						{model.primary_date ? (
							<span className="hidden items-center gap-2 sm:inline-flex">
								<Separator />
								<span>{format.calendarDate(model.primary_date)}</span>
							</span>
						) : null}
					</div>
				</div>
			</div>

			{priceText ? (
				<div className="hidden pt-px tabular-nums sm:block">
					{priceRows.length > 0 ? (
						<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
							{priceRows.map((row) => (
								<div key={row.label} className="contents">
									<dt className="text-xs text-muted-foreground">{row.label}</dt>
									<dd data-price className="text-right text-sm font-semibold text-foreground">
										{row.value}
									</dd>
								</div>
							))}
						</dl>
					) : (
						<div data-price className="text-right text-sm font-semibold text-foreground">
							{priceText}
						</div>
					)}
					{priceUnitText ? (
						<div className="mt-0.5 text-right text-[11px] text-muted-foreground">{priceUnitText}</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export const ModelListItem = memo(ModelListItemImpl);
ModelListItem.displayName = "ModelListItem";
