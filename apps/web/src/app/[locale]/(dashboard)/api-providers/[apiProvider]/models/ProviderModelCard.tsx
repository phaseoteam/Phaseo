"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { ArrowUpRight, PanelRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
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
	onOpenDetails,
}: {
	model: APIProviderModelListItem;
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
			aria-label={`${t("viewDetails")}: ${name}`}
			onClick={openFromCard}
			onKeyDown={openFromKeyboard}
			className="group h-full cursor-pointer py-4 outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/30 md:py-5"
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

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-2 border-t border-border/70 pt-4">
			<h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
			{children}
		</section>
	);
}

export function ProviderModelDetailsSheet({
	model,
	onOpenChange,
}: {
	model: APIProviderModelListItem | null;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("Catalogue.providerModelList");
	const format = useDisplayFormatters();
	const formatUsd = useUsdFormatter();
	const meterDisplay = useMeterDisplay();
	const statusDescription = useStatusDescription(model);

	return (
		<Sheet open={model != null} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
				{model ? (
					<>
						<SheetHeader className="gap-3 p-5 pr-12">
							<div className="flex items-center gap-3">
								<ModelLogo model={model} />
								<div className="min-w-0">
									<SheetTitle className="truncate text-base">{model.model_name || model.model_id}</SheetTitle>
									<SheetDescription className="flex min-w-0 items-center gap-1 font-mono text-xs">
										<span className="truncate">{model.api_model_id}</span>
										<CopyButton
											content={model.api_model_id}
											variant="ghost"
											size="sm"
											className="h-5 w-5 shrink-0 p-0"
											aria-label={t("copyModelId")}
										/>
									</SheetDescription>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<StatusBadge model={model} />
								<Button asChild variant="outline" size="sm" className="h-8 rounded-md">
									<Link href={`/models/${model.model_id}`} prefetch={false}>
										{t("openModelPage")}
										<ArrowUpRight className="size-3.5" />
									</Link>
								</Button>
							</div>
							{statusDescription ? (
								<p className="text-xs text-muted-foreground">{statusDescription}</p>
							) : null}
						</SheetHeader>

						<div className="space-y-4 px-5 pb-6">
							<SheetSection title={t("pricing")}>
								{(model.pricing_meters ?? []).length > 0 ? (
									<dl className="divide-y divide-border/60 rounded-md border border-border/70">
										{(model.pricing_meters ?? []).map((meter) => {
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
								) : (
									<p className="text-sm text-muted-foreground">{t("noPricing")}</p>
								)}
							</SheetSection>

							<SheetSection title={t("modalities")}>
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
							</SheetSection>

							<SheetSection title={t("supportedParameters")}>
								<ChipList values={uniqueSorted(listify(model.supported_params))} />
							</SheetSection>

							<SheetSection title={t("endpoints")}>
								<ChipList values={Array.from(new Set(model.endpoints ?? [])).sort((a, b) => a.localeCompare(b))} />
							</SheetSection>

							{primaryDate(model) ? (
								<SheetSection title={t("released")}>
									<p className="text-sm">{format.calendarDate(primaryDate(model))}</p>
								</SheetSection>
							) : null}
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
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
