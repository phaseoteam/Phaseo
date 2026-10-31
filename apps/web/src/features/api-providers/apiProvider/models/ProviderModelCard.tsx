import { useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, Ban, ChevronLeft, ChevronRight, CircleCheck, Clock3, Info, PanelRight } from "lucide-react";
import { useLocale, useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { prettifyParamName } from "@/components/(data)/model/pricing/ProviderModelParameters";
import { getLocalizedDocsHref } from "@/lib/docs";
import {
	ALL_PARAMETERS_DOCS_HREF,
	getParameterDocsHref,
	getParameterReference,
	getParameterReferenceTranslationKey,
} from "@/lib/parameters/reference";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import UnreleasedBadge from "@/components/(data)/model/UnreleasedBadge";
import { getModalityIcon } from "@/components/(data)/models/Models/modalityIcons";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { cn } from "@/lib/utils";
import type {
	APIProviderModelListItem,
	APIProviderModelPricingMeter,
} from "@/lib/fetchers/api-providers/providerDataTypes";

export function listify(value?: string[] | string | null): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export function normalizeCapabilityKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values.map(normalizeCapabilityKey).filter(Boolean))).sort(
		(a, b) => a.localeCompare(b),
	);
}

function organisationIdFor(model: APIProviderModelListItem): string | null {
	const [organisationId, rest] = model.model_id.split("/");
	return rest ? organisationId : null;
}

// Same "$2" / "$0.10" / "$0.000125" style as the catalogue model cards.
function useUsdFormatter() {
	const format = useDisplayFormatters();
	return (value: number | null | undefined): string => {
		if (value == null || !Number.isFinite(value)) return "—";
		if (value === 0) return "$0";
		if (value < 0.01) {
			return format.number(value, { style: "currency", currency: "USD", maximumSignificantDigits: 3, notation: "standard" });
		}
		const integer = Math.abs(value - Math.round(value)) < 1e-9;
		return format.number(value, {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: integer ? 0 : 2,
			maximumFractionDigits: integer ? 0 : 3,
			notation: "standard",
		});
	};
}

type MeterDisplay = { label: string; amount: number | null; unitLabel: string };

function useMeterDisplay() {
	const t = useTranslations("Catalogue.providerModelList");
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const locale = useLocale();
	return (meter: APIProviderModelPricingMeter): MeterDisplay => {
		const label = tPricing.has(`meters.${meter.meter}` as never)
			? tPricing(`meters.${meter.meter}` as never)
			: meter.label;
		const isPixelMeter = meter.unit === "pixel" || meter.meter.includes("pixel");
		const isTokenMeter = meter.unit === "token" || meter.meter.includes("token");
		if (meter.price_per_1m_usd != null && Number.isFinite(meter.price_per_1m_usd)) {
			if (isPixelMeter) return { label, amount: meter.price_per_1m_usd, unitLabel: t("oneMillionPixels") };
			if (isTokenMeter) return { label, amount: meter.price_per_1m_usd, unitLabel: t("oneMillionTokens") };
		}
		const quantity = meter.unit_size ?? 1;
		const key = `${quantity === 1 ? "unitsSingular" : "units"}.${meter.unit}`;
		const knownUnit = tPricing.has(key as never)
			? `${quantity === 1 ? "" : `${quantity.toLocaleString(locale)} `}${tPricing(key as never)}`
			: null;
		return {
			label,
			amount: meter.price_per_unit_usd,
			unitLabel: knownUnit || meter.display_unit_label || meter.unit || t("unit"),
		};
	};
}

function findTokenMeter(meters: APIProviderModelPricingMeter[], direction: "input" | "output") {
	return meters.find(
		(meter) =>
			meter.price_per_1m_usd != null &&
			meter.meter.startsWith(`${direction}_`) &&
			meter.meter.includes("token") &&
			!meter.meter.includes("cache"),
	);
}

function useHeadlinePrice() {
	const t = useTranslations("Catalogue.providerModelList");
	const tModels = useTranslations("Catalogue.models");
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const formatUsd = useUsdFormatter();
	const meterDisplay = useMeterDisplay();
	return (model: APIProviderModelListItem): string | null => {
		const meters = model.pricing_meters ?? [];
		const input = findTokenMeter(meters, "input");
		const output = findTokenMeter(meters, "output");
		if (input && output) {
			return `${tModels("priceInputOutput", {
				input: formatUsd(input.price_per_1m_usd),
				output: formatUsd(output.price_per_1m_usd),
			})} / ${t("oneMillionTokens")}`;
		}
		if (meters[0]) {
			const display = meterDisplay(meters[0]);
			return `${formatUsd(display.amount)} / ${display.unitLabel}`;
		}
		if (model.starting_price_usd != null) {
			const unit = model.starting_price_unit && tPricing.has(`unitsSingular.${model.starting_price_unit}` as never)
				? tPricing(`unitsSingular.${model.starting_price_unit}` as never)
				: model.starting_price_unit ?? t("unit");
			return `${t("startingAt", { price: formatUsd(model.starting_price_usd) })} / ${unit}`;
		}
		return null;
	};
}

function useModalityLabel() {
	const t = useTranslations("Catalogue.providerModelList");
	const tMetadata = useTranslations("Catalogue.modelDetail.metadata");
	const labels: Record<string, string> = {
		text: t("capabilities.text"),
		image: t("capabilities.image"),
		audio: t("capabilities.audio"),
		video: t("capabilities.video"),
		rerank: t("capabilities.rerank"),
		embeddings: t("capabilities.embeddings"),
		decisions: tMetadata("modalityDecisions"),
		structured: tMetadata("modalityStructured"),
		moderation: tMetadata("modalityModeration"),
	};
	return (value: string) => labels[value] ?? value;
}

function ModalityBadges({ values }: { values: string[] }) {
	const label = useModalityLabel();
	if (values.length === 0) return <span className="text-[11px] text-muted-foreground">-</span>;
	return (
		<>
			{values.map((modality) => {
				const Icon = getModalityIcon(modality);
				const tone = getModalityTone(modality);
				return (
					<span
						key={modality}
						className={cn(
							"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
							tone.badgeClassName,
						)}
					>
						<Icon className={cn("h-3 w-3", tone.iconClassName)} />
						{label(modality)}
					</span>
				);
			})}
		</>
	);
}

function StatusBadge({ model }: { model: APIProviderModelListItem }) {
	const tStatus = useTranslations("Catalogue.modelDetail.providerTable");
	if (model.is_unreleased) return <UnreleasedBadge compact />;
	if (model.availability_status === "coming_soon") {
		return (
			<Badge variant="secondary" className="shrink-0 border-blue-200 bg-blue-50 text-[11px] font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
				{tStatus("statuses.comingSoon")}
			</Badge>
		);
	}
	if (model.availability_status === "not_active") {
		return (
			<Badge variant="secondary" className="shrink-0 text-[11px] font-medium">
				{tStatus("statuses.inactive")}
			</Badge>
		);
	}
	return null;
}

function useStatusDescription(model: APIProviderModelListItem | null): string | null {
	const t = useTranslations("Catalogue.providerModelList");
	const tStatus = useTranslations("Catalogue.modelDetail.providerTable");
	if (model?.availability_status === "coming_soon") {
		return model.availability_reason === "scheduled" ? t("scheduledRelease") : tStatus("statusDescriptions.comingSoon");
	}
	if (model?.availability_status === "not_active") {
		return model.availability_reason === "internal_testing"
			? tStatus("statusDescriptions.internalTesting")
			: tStatus("statusDescriptions.inactive");
	}
	return null;
}

function ModelLogo({ model, className }: { model: APIProviderModelListItem; className?: string }) {
	const organisationId = organisationIdFor(model);
	return (
		<div className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-md border bg-background", className)}>
			{organisationId ? (
				<div className="relative size-6">
					<Logo id={organisationId} alt={organisationId} className="object-contain" fill />
				</div>
			) : null}
		</div>
	);
}

function primaryDate(model: APIProviderModelListItem): string | null {
	return model.release_date ?? model.announcement_date ?? null;
}

export function ProviderModelCard({
	model,
	selected = false,
	onOpenDetails,
}: {
	model: APIProviderModelListItem;
	selected?: boolean;
	onOpenDetails: (model: APIProviderModelListItem) => void;
}) {
	const t = useTranslations("Catalogue.providerModelList");
	const tModels = useTranslations("Catalogue.models");
	const format = useDisplayFormatters();
	const headlinePrice = useHeadlinePrice();
	const modelHref = `/models/${model.model_id}`;
	const name = model.model_name || model.model_id;
	const price = headlinePrice(model);
	const paramCount = uniqueSorted(listify(model.supported_params)).length;
	const date = primaryDate(model);

	// A pointer shortcut: clicking the card opens the details sheet, except on its
	// own links and buttons. Keyboard and screen-reader users use the Details button.
	const openFromCard = (event: MouseEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest("a,button")) return;
		onOpenDetails(model);
	};

	return (
		<div
			data-selected={selected ? "true" : undefined}
			onClick={openFromCard}
			className="group h-full cursor-pointer py-4 transition-colors hover:bg-muted/20 data-[selected=true]:bg-muted/40 md:py-5"
		>
			<div className="flex h-full flex-col gap-4 px-4 md:px-5">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
					<ModelLogo model={model} />
					<div className="min-w-0 space-y-0.5 self-center">
						<div className="flex min-w-0 items-center gap-1.5">
							<Link
								href={modelHref}
								prefetch={false}
								className="line-clamp-1 text-sm font-semibold leading-[1.1] text-foreground underline-offset-4 transition-colors duration-200 hover:underline"
							>
								{name}
							</Link>
							<CopyButton
								content={model.api_model_id}
								variant="ghost"
								size="sm"
								className="h-5 w-5 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
								aria-label={t("copyModelId")}
							/>
							<StatusBadge model={model} />
						</div>
						<div className="truncate font-mono text-xs leading-[1.15] text-muted-foreground">
							{model.api_model_id}
						</div>
					</div>
					<Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0">
						<Link href={modelHref} prefetch={false} aria-label={tModels("viewDetails")}>
							<ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
						</Link>
					</Button>
				</div>

				<div className="space-y-2 text-xs">
					<div className="flex flex-wrap items-center gap-1">
						<span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-medium tabular-nums">
							{price ?? <span className="font-normal text-muted-foreground">{t("noPricing")}</span>}
						</span>
						{paramCount > 0 ? (
							<span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-muted-foreground">
								{t("parametersCount", { count: paramCount })}
							</span>
						) : null}
					</div>
					<div className="space-y-1">
						<div className="flex min-w-0 items-center gap-2">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">{t("input")}</span>
							<div className="flex min-w-0 flex-wrap items-center gap-1">
								<ModalityBadges values={uniqueSorted(listify(model.input_modalities))} />
							</div>
						</div>
						<div className="flex min-w-0 items-center gap-2">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">{t("output")}</span>
							<div className="flex min-w-0 flex-wrap items-center gap-1">
								<ModalityBadges values={uniqueSorted(listify(model.output_modalities))} />
							</div>
						</div>
					</div>
				</div>

				<div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span className="truncate">{date ? format.calendarDate(date) : "—"}</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground"
						aria-pressed={selected}
						aria-label={`${t("viewDetails")}: ${name}`}
						onClick={() => onOpenDetails(model)}
					>
						<PanelRight className="size-3.5" />
						{t("details")}
					</Button>
				</div>
			</div>
		</div>
	);
}

function InspectorSection({
	title,
	href,
	badge,
	children,
}: {
	title: string;
	href?: string;
	badge?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-1 border-t border-zinc-200/80 py-2 first:border-t-0 dark:border-zinc-800">
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-[15px] font-semibold text-foreground">
					{href ? (
						<a
							href={href}
							target="_blank"
							rel="noreferrer"
							className="group inline-flex items-center gap-1.5 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							{title}
							<ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
						</a>
					) : title}
				</h3>
				{badge}
			</div>
			{children}
		</section>
	);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="flex max-w-[20rem] flex-wrap items-center justify-end gap-1.5 text-right text-sm font-medium text-foreground">
				{children}
			</div>
		</div>
	);
}

// Click-to-copy ID pill, like the provider model IDs in the pricing inspector.
function CopyPill({ value }: { value: string }) {
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				void navigator.clipboard?.writeText(value).then(() => {
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1500);
				});
			}}
			className="min-w-0 max-w-full rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:hover:bg-zinc-800"
			title={tSections("copyProviderModelId")}
		>
			<span className="block truncate">{copied ? tSections("copied") : value}</span>
		</button>
	);
}

function GatewayStatus({ model }: { model: APIProviderModelListItem }) {
	const tStatus = useTranslations("Catalogue.modelDetail.providerTable");
	if (model.availability_status === "coming_soon" || model.is_unreleased) {
		return <><Clock3 className="size-4 text-blue-600 dark:text-blue-400" /><span>{tStatus("statuses.comingSoon")}</span></>;
	}
	if (model.availability_status === "not_active" || model.is_active_gateway === false) {
		return <><Ban className="size-4 text-red-600 dark:text-red-400" /><span>{tStatus("statuses.inactive")}</span></>;
	}
	return <><CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" /><span>{tStatus("statuses.active")}</span></>;
}

function ParameterButton({ param }: { param: string }) {
	const locale = useLocale();
	const tQuickstart = useTranslations("Catalogue.models.detail.quickstart");
	const reference = getParameterReference(param);
	const descriptionKey = getParameterReferenceTranslationKey(param);
	return (
		<HoverCard openDelay={120} closeDelay={80}>
			<HoverCardTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 min-h-0 justify-start rounded-md px-2 py-1 font-mono text-[11px]"
				>
					{prettifyParamName(param)}
				</Button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80 p-3 text-xs">
				<div className="space-y-2">
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-3">
							<code className="font-mono text-[11px] text-foreground">{param}</code>
							<a
								href={getLocalizedDocsHref(locale, getParameterDocsHref(param))}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
							>
								{tQuickstart("docsLabel")}
							</a>
						</div>
						<p className="leading-relaxed text-muted-foreground">
							{tQuickstart(`parameterDescriptions.${descriptionKey}` as never)}
						</p>
					</div>
					<div className="flex items-center gap-4 border-t border-zinc-200/70 pt-2 text-[11px] text-muted-foreground dark:border-zinc-800">
						<span>
							{tQuickstart("typeLabel")} <span className="text-foreground">{reference.type}</span>
						</span>
						<span>
							{tQuickstart("defaultLabel")}{" "}
							<span className="text-foreground">
								{reference.defaultValue === "Provider specific"
									? tQuickstart("defaultProviderSpecific")
									: reference.defaultValue === "Unset"
										? tQuickstart("defaultUnset")
										: reference.defaultValue}
							</span>
						</span>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

export function ProviderModelDetailsSheet({
	model,
	index,
	total,
	onPrevious,
	onNext,
	onOpenChange,
}: {
	model: APIProviderModelListItem | null;
	index: number;
	total: number;
	onPrevious?: () => void;
	onNext?: () => void;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("Catalogue.providerModelList");
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	const tQuickstart = useTranslations("Catalogue.models.detail.quickstart");
	const locale = useLocale();
	const format = useDisplayFormatters();
	const formatUsd = useUsdFormatter();
	const meterDisplay = useMeterDisplay();
	const tProviders = useTranslations("Catalogue.providers");
	const statusDescription = useStatusDescription(model);
	const organisationId = model ? organisationIdFor(model) : null;

	const meters = model?.pricing_meters ?? [];
	const params = model ? uniqueSorted(listify(model.supported_params)) : [];
	const endpoints = model ? Array.from(new Set(model.endpoints ?? [])).sort((a, b) => a.localeCompare(b)) : [];
	const providerModelId = model?.provider_model_slug?.trim() || model?.api_model_id || "";
	const date = model ? primaryDate(model) : null;

	return (
		// Non-modal like the pricing inspector: the page stays scrollable and
		// clicking another card swaps the content instead of closing the panel.
		<ProviderInspectorSheet open={model != null} onOpenChange={onOpenChange} disablePointerDismissal>
			<ProviderInspectorSheetContent className="w-full gap-0 overflow-hidden p-0 sm:w-[30rem] md:w-[50vw] lg:w-[44vw] xl:w-[40vw] 2xl:w-[36vw]">
				{model ? (
					<>
						<div className="absolute right-14 top-4 z-10 flex items-center gap-1">
							<Button type="button" variant="ghost" size="icon-sm" disabled={!onPrevious} aria-label={t("previousModel")} onClick={onPrevious}>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<Button type="button" variant="ghost" size="icon-sm" disabled={!onNext} aria-label={t("nextModel")} onClick={onNext}>
								<ChevronRight className="h-4 w-4" />
							</Button>
							{index >= 0 ? (
								<span
									aria-label={t("modelIndex", { current: index + 1, total })}
									className="min-w-8 text-right text-[10px] font-medium tabular-nums text-muted-foreground"
								>
									{index + 1} / {total}
								</span>
							) : null}
						</div>

						<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
							<div className="flex min-w-0 items-center gap-3 pr-32">
								<div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background dark:border-zinc-800">
									{organisationId ? (
										<Link href={`/organisations/${organisationId}`} prefetch={false} className="relative h-7 w-7">
											<Logo id={organisationId} alt={organisationId} className="object-contain" fill sizes="22px" />
										</Link>
									) : null}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex min-w-0 items-center gap-2">
										<ProviderInspectorSheetTitle className="truncate pr-2 text-base">
											<Link
												href={`/models/${model.model_id}`}
												prefetch={false}
												className="text-foreground underline-offset-4 hover:underline focus-visible:underline"
											>
												{model.model_name || model.model_id}
											</Link>
										</ProviderInspectorSheetTitle>
										<StatusBadge model={model} />
									</div>
									<ProviderInspectorSheetDescription className="mt-1 flex min-w-0 items-center gap-1 font-mono text-[11px]">
										<span className="truncate">{model.api_model_id}</span>
										<CopyButton
											content={model.api_model_id}
											variant="ghost"
											size="sm"
											className="h-5 w-5 shrink-0 p-0"
											aria-label={t("copyModelId")}
										/>
									</ProviderInspectorSheetDescription>
								</div>
							</div>
						</ProviderInspectorSheetHeader>

						<ScrollArea
							className="min-h-0 flex-1 overscroll-contain"
							viewportClassName="pb-5 overscroll-contain"
							scrollBarOrientation="vertical"
						>
							<div className="px-5">
								{statusDescription ? (
									<p className="border-b border-zinc-200/80 py-2.5 text-xs text-muted-foreground dark:border-zinc-800">{statusDescription}</p>
								) : null}

								<InspectorSection title={t("pricing")}>
									{meters.length > 0 ? (
										<dl className="space-y-2">
											{meters.map((meter) => {
												const display = meterDisplay(meter);
												return (
													<div key={meter.meter} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
														<dt className="min-w-0 text-[11px] text-muted-foreground">{display.label}</dt>
														<dd className="text-right tabular-nums">
															<span className="text-sm font-semibold text-foreground">
																{display.amount === 0 ? tProviders("free") : formatUsd(display.amount)}
															</span>
															{display.amount === 0 ? null : (
																<span className="text-[11px] text-muted-foreground"> / {display.unitLabel}</span>
															)}
															{meter.meter === "image_pixels" && meter.estimated_price_per_image_usd != null ? (
																<span className="block text-[11px] text-muted-foreground">
																	{t("estimatedImagePrice", { price: formatUsd(meter.estimated_price_per_image_usd), size: "1024×1024" })}
																</span>
															) : null}
														</dd>
													</div>
												);
											})}
										</dl>
									) : (
										<div className="rounded-md border border-dashed border-zinc-200/80 bg-zinc-50/60 px-3 py-2.5 text-xs text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/30">
											{t("noPricing")}
										</div>
									)}
								</InspectorSection>

								<InspectorSection title={tSections("routingDetails")}>
									<div className="space-y-2">
										<DetailRow label={tSections("gatewayStatus")}><GatewayStatus model={model} /></DetailRow>
										<DetailRow label={tSections("providerModelIds")}><CopyPill value={providerModelId} /></DetailRow>
										<DetailRow label={t("endpoints")}>
											{endpoints.length > 0 ? endpoints.map((endpoint) => (
												<span key={endpoint} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{endpoint}</span>
											)) : <span className="text-xs text-muted-foreground">--</span>}
										</DetailRow>
									</div>
								</InspectorSection>

								<InspectorSection title={tQuickstart("technicalDetails")}>
									<div className="space-y-2">
										<DetailRow label={t("input")}><ModalityBadges values={uniqueSorted(listify(model.input_modalities))} /></DetailRow>
										<DetailRow label={t("output")}><ModalityBadges values={uniqueSorted(listify(model.output_modalities))} /></DetailRow>
										<DetailRow label={t("released")}><span className="tabular-nums">{date ? format.calendarDate(date) : "--"}</span></DetailRow>
									</div>
								</InspectorSection>

								<InspectorSection
									title={tQuickstart("parameterSupport")}
									href={getLocalizedDocsHref(locale, ALL_PARAMETERS_DOCS_HREF)}
									badge={params.length > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{params.length}</span> : (
										<span className="rounded-md border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
											{tQuickstart("unknown")}
										</span>
									)}
								>
									{params.length > 0 ? (
										<div className="flex flex-wrap items-start gap-1.5 pt-1">
											{params.map((param) => <ParameterButton key={param} param={param} />)}
										</div>
									) : (
										<div className="rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-3 dark:border-amber-900/70 dark:bg-amber-950/20">
											<div className="flex items-start gap-2">
												<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
												<div>
													<p className="text-sm font-medium text-foreground">{tQuickstart("supportNotDocumented")}</p>
													<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tQuickstart("supportNotDocumentedDescription")}</p>
												</div>
											</div>
										</div>
									)}
								</InspectorSection>
							</div>
						</ScrollArea>

						<div className="flex items-center gap-2 border-t border-zinc-200/80 px-5 py-3 dark:border-zinc-800">
							<Button asChild size="sm" className="h-8 rounded-md">
								<Link href={`/models/${model.model_id}`} prefetch={false}>
									{t("openModelPage")}
									<ArrowUpRight className="size-3.5" />
								</Link>
							</Button>
							<Button asChild variant="outline" size="sm" className="h-8 rounded-md">
								<Link href={`/models/${model.model_id}/pricing`} prefetch={false}>
									{t("compareProviders")}
								</Link>
							</Button>
						</div>
					</>
				) : null}
			</ProviderInspectorSheetContent>
		</ProviderInspectorSheet>
	);
}
