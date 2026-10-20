"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
			return `$${format.number(value, { maximumSignificantDigits: 3, notation: "standard" })}`;
		}
		const integer = Math.abs(value - Math.round(value)) < 1e-9;
		return `$${format.number(value, {
			minimumFractionDigits: integer ? 0 : 2,
			maximumFractionDigits: integer ? 0 : 3,
			notation: "standard",
		})}`;
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

	// The whole card opens the details sheet, except for its own links and buttons.
	const openFromCard = (event: MouseEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest("a,button")) return;
		onOpenDetails(model);
	};
	const openFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onOpenDetails(model);
		}
	};

	return (
		<div
			role="button"
			tabIndex={0}
			aria-pressed={selected}
			data-selected={selected ? "true" : undefined}
			aria-label={`${t("viewDetails")}: ${name}`}
			onClick={openFromCard}
			onKeyDown={openFromKeyboard}
			className="group h-full cursor-pointer py-4 outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/30 data-[selected=true]:bg-muted/40 md:py-5"
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
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-3 border-b border-zinc-200/80 py-4 last:border-b-0 dark:border-zinc-800">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}

type MeterGroup = "input" | "output" | "cache" | "other";

function meterGroup(meter: APIProviderModelPricingMeter): MeterGroup {
	if (meter.meter.includes("cache")) return "cache";
	if (meter.meter.startsWith("input_")) return "input";
	if (meter.meter.startsWith("output_")) return "output";
	return "other";
}

const METER_GROUP_ORDER: MeterGroup[] = ["input", "output", "cache", "other"];

// A worked example makes per-million prices easier to read at a glance.
const EXAMPLE_INPUT_TOKENS = 10_000;
const EXAMPLE_OUTPUT_TOKENS = 1_000;

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="min-w-0 px-3 py-2.5">
			<div className="truncate text-[11px] text-muted-foreground">{label}</div>
			<div className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</div>
		</div>
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
	const format = useDisplayFormatters();
	const formatUsd = useUsdFormatter();
	const meterDisplay = useMeterDisplay();
	const statusDescription = useStatusDescription(model);
	const organisationId = model ? organisationIdFor(model) : null;

	const meters = model?.pricing_meters ?? [];
	const inputMeter = findTokenMeter(meters, "input");
	const outputMeter = findTokenMeter(meters, "output");
	const exampleCost =
		inputMeter?.price_per_1m_usd != null && outputMeter?.price_per_1m_usd != null
			? (inputMeter.price_per_1m_usd * EXAMPLE_INPUT_TOKENS + outputMeter.price_per_1m_usd * EXAMPLE_OUTPUT_TOKENS) / 1_000_000
			: null;
	const groupLabels: Record<MeterGroup, string> = {
		input: t("input"),
		output: t("output"),
		cache: t("caching"),
		other: t("otherCharges"),
	};
	const groupedMeters = METER_GROUP_ORDER.map((group) => ({
		group,
		meters: meters.filter((meter) => meterGroup(meter) === group),
	})).filter((entry) => entry.meters.length > 0);
	const params = model ? uniqueSorted(listify(model.supported_params)) : [];
	const endpoints = model ? Array.from(new Set(model.endpoints ?? [])).sort((a, b) => a.localeCompare(b)) : [];
	const date = model ? primaryDate(model) : null;

	return (
		// Non-modal like the pricing inspector: the page stays scrollable and
		// clicking another card swaps the content instead of closing the panel.
		<ProviderInspectorSheet open={model != null} onOpenChange={onOpenChange} disablePointerDismissal>
			<ProviderInspectorSheetContent className="w-full gap-0 overflow-hidden p-0 sm:w-[28rem] lg:w-[32rem]">
				{model ? (
					<>
						<div className="absolute right-14 top-4 z-10 flex items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								disabled={!onPrevious}
								aria-label={t("previousModel")}
								onClick={onPrevious}
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								disabled={!onNext}
								aria-label={t("nextModel")}
								onClick={onNext}
							>
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

						<ProviderInspectorSheetHeader className="gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
							<div className="flex min-w-0 items-center gap-3 pr-32">
								{organisationId ? (
									<Link href={`/organisations/${organisationId}`} prefetch={false} className="shrink-0">
										<ModelLogo model={model} className="size-11" />
									</Link>
								) : (
									<ModelLogo model={model} className="size-11" />
								)}
								<div className="min-w-0 flex-1">
									<div className="flex min-w-0 items-center gap-2">
										<ProviderInspectorSheetTitle className="truncate text-base font-semibold">
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
							{statusDescription ? (
								<p className="text-xs text-muted-foreground">{statusDescription}</p>
							) : null}
						</ProviderInspectorSheetHeader>

						<ScrollArea
							className="min-h-0 flex-1 overscroll-contain"
							viewportClassName="pb-5 overscroll-contain"
							scrollBarOrientation="vertical"
						>
							<div className="grid grid-cols-2 border-b border-zinc-200/80 dark:border-zinc-800 [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t [&>*]:border-zinc-200/80 dark:[&>*]:border-zinc-800">
								<SummaryTile label={`${t("input")} / ${t("oneMillionTokens")}`} value={inputMeter ? formatUsd(inputMeter.price_per_1m_usd) : "—"} />
								<SummaryTile label={`${t("output")} / ${t("oneMillionTokens")}`} value={outputMeter ? formatUsd(outputMeter.price_per_1m_usd) : "—"} />
								<SummaryTile label={t("supportedParameters")} value={params.length || "—"} />
								<SummaryTile label={t("released")} value={date ? format.calendarDate(date) : "—"} />
							</div>

							<div className="px-5">
								<InspectorSection title={t("pricing")}>
									{groupedMeters.length > 0 ? (
										<div className="overflow-hidden rounded-md border border-zinc-200/80 dark:border-zinc-800">
											{groupedMeters.map(({ group, meters: groupMeters }) => (
												<div key={group} className="border-b border-zinc-200/80 last:border-b-0 dark:border-zinc-800">
													<div className="bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
														{groupLabels[group]}
													</div>
													<dl className="divide-y divide-zinc-200/60 dark:divide-zinc-800/80">
														{groupMeters.map((meter) => {
															const display = meterDisplay(meter);
															return (
																<div key={meter.meter} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
																	<dt className="min-w-0 text-muted-foreground">{display.label}</dt>
																	<dd className="shrink-0 text-right tabular-nums">
																		<span className="font-medium">{formatUsd(display.amount)}</span>
																		<span className="text-muted-foreground"> / {display.unitLabel}</span>
																		{meter.meter === "image_pixels" && meter.estimated_price_per_image_usd != null ? (
																			<span className="block text-xs text-muted-foreground">
																				{t("estimatedImagePrice", {
																					price: formatUsd(meter.estimated_price_per_image_usd),
																					size: "1024×1024",
																				})}
																			</span>
																		) : null}
																	</dd>
																</div>
															);
														})}
													</dl>
												</div>
											))}
										</div>
									) : (
										<p className="text-sm text-muted-foreground">{t("noPricing")}</p>
									)}
									{exampleCost != null ? (
										<div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-xs">
											<span className="text-muted-foreground">{t("exampleRequest")}</span>
											<span className="font-semibold tabular-nums">≈ {formatUsd(exampleCost)}</span>
										</div>
									) : null}
								</InspectorSection>

								<InspectorSection title={t("modalities")}>
									<div className="space-y-1.5 text-xs">
										<div className="flex items-center gap-2">
											<span className="w-11 shrink-0 text-[11px] text-muted-foreground">{t("input")}</span>
											<div className="flex flex-wrap gap-1"><ModalityBadges values={uniqueSorted(listify(model.input_modalities))} /></div>
										</div>
										<div className="flex items-center gap-2">
											<span className="w-11 shrink-0 text-[11px] text-muted-foreground">{t("output")}</span>
											<div className="flex flex-wrap gap-1"><ModalityBadges values={uniqueSorted(listify(model.output_modalities))} /></div>
										</div>
									</div>
								</InspectorSection>

								<InspectorSection
									title={t("supportedParameters")}
									action={params.length > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{params.length}</span> : null}
								>
									<ChipList values={params} />
								</InspectorSection>

								<InspectorSection title={t("endpoints")}>
									<ChipList values={endpoints} />
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

function ChipList({ values }: { values: string[] }) {
	if (values.length === 0) return <p className="text-sm text-muted-foreground">-</p>;
	return (
		<div className="flex flex-wrap gap-1.5">
			{values.map((value) => (
				<span
					key={value}
					className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground"
				>
					{value}
				</span>
			))}
		</div>
	);
}
