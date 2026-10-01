"use client";

import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "../ProviderLogo";
import { useLocale, useTranslations } from "next-intl";

function formatMonthYear(value: string | null | undefined, locale: string): string {
	if (!value) return "-";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "-";
	return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
}

function formatCount(value: number | null | undefined, locale: string): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return value.toLocaleString(locale, { maximumFractionDigits: 0 });
}

function bestNumber(
	models: ExtendedModel[],
	getValue: (model: ExtendedModel) => number | null | undefined
): number | null {
	const values = models
		.map(getValue)
		.filter((value): value is number => value != null && Number.isFinite(value));
	if (!values.length) return null;
	return Math.max(...values);
}

function isBest(value: number | null | undefined, best: number | null): boolean {
	return value != null && best != null && Math.abs(value - best) < 0.000001;
}

function getProviderCount(model: ExtendedModel): number {
	const providers = new Set<string>();
	for (const price of model.prices ?? []) {
		const providerId =
			price.api_provider_id ??
			(typeof price.api_provider === "string"
				? price.api_provider
				: price.api_provider?.api_provider_id);
		if (providerId) providers.add(providerId);
	}
	return providers.size;
}

function toTypeList(value: ExtendedModel["input_types"]): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return String(value)
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
}

function normalizeTypeLabel(
	value: string,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const v = value.trim().toLowerCase();
	if (v === "text") return t("modalityText");
	if (v === "image") return t("modalityImage");
	if (v === "audio_stt") return t("modalityTranscription");
	if (v === "audio_tts") return t("modalitySpeech");
	if (v === "audio_music") return t("modalityMusic");
	if (v === "audio") return t("modalityAudio");
	if (v === "video") return t("modalityVideo");
	if (v === "embedding" || v === "embeddings") return t("modalityEmbeddings");
	return t("unknown");
}

function formatLicenseLabel(
	value: string | null | undefined,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw) return "-";
	const lower = raw.toLowerCase();
	if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "tbd")
		return t("unknown");
	return raw;
}

function formatStatusLabel(
	value: string | null | undefined,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const raw = typeof value === "string" ? value.trim() : "";
	const normalized = raw.toLowerCase().replace(/[_-]+/g, " ");
	const statusKeys: Record<string, Parameters<typeof t>[0]> = {
		available: "statusAvailable",
		active: "statusAvailable",
		preview: "statusPreview",
		deprecated: "statusDeprecated",
		retired: "statusRetired",
		announced: "statusAnnounced",
		rumoured: "statusRumoured",
		rumored: "statusRumoured",
		"limited access": "statusLimitedAccess",
		withheld: "statusWithheld",
	};
	return statusKeys[normalized] ? t(statusKeys[normalized]) : t("unknown");
}

function capabilityChips(
	model: ExtendedModel,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string[] {
	return [
		model.reasoning ? t("reasoningCapability") : null,
		model.web_access ? t("webAccessCapability") : null,
		model.fine_tunable ? t("fineTunableCapability") : null,
		model.multimodal ? t("multimodalCapability") : null,
	].filter((value): value is string => Boolean(value));
}

export default function OverviewCard({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const t = useTranslations("Catalogue.compare");
	const locale = useLocale();
	if (!selectedModels || selectedModels.length === 0) return null;
	const bestInputContext = bestNumber(
		selectedModels,
		(model) => model.input_context_length
	);
	const bestOutputContext = bestNumber(
		selectedModels,
		(model) => model.output_context_length
	);
	const providerCounts = new Map(
		selectedModels.map((model) => [model.id, getProviderCount(model)])
	);
	const bestProviderCount = bestNumber(
		selectedModels,
		(model) => providerCounts.get(model.id) ?? null
	);

	return (
		<section className="space-y-3">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold">{t("overview")}</h2>
				<p className="text-sm text-muted-foreground">
					{t("overviewDescription")}
				</p>
			</header>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{selectedModels.map((m) => {
					const inputTypes = toTypeList(m.input_types).map((value) => normalizeTypeLabel(value, t));
					const outputTypes = toTypeList(m.output_types).map((value) => normalizeTypeLabel(value, t));
					const providers = providerCounts.get(m.id) ?? 0;
					const capabilities = capabilityChips(m, t);

					return (
						<div
							key={m.id}
							className="rounded-xl border border-border/60 bg-background/60 p-4"
						>
							<div className="flex items-start gap-2">
								<Link
									href={`/organisations/${m.provider.provider_id}`}
					aria-label={t("viewProvider", { name: m.provider.name })}
									className="shrink-0 pt-0.5"
								>
									<ProviderLogo
										id={m.provider.provider_id}
										alt={m.provider.name}
										size="xs"
									/>
								</Link>
								<div className="min-w-0 flex-1">
									<Link
										href={`/models/${m.id}`}
										className="block truncate font-semibold underline decoration-transparent transition-colors duration-200 hover:decoration-current"
									>
										{m.name}
									</Link>
									<div className="truncate text-xs text-muted-foreground">
										{m.provider.name}
									</div>
								</div>
							</div>

							<div className="mt-3 flex flex-wrap gap-1.5">
								<Badge variant="secondary" className="text-[10px]">
								{formatStatusLabel(m.status, t)}
								</Badge>
								<Badge
									variant="outline"
									className={cn(
										"text-[10px]",
										isBest(providers, bestProviderCount) &&
											"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
									)}
								>
									{providers === 0
										? t("noPricedProviders")
										: providers === 1
											? t("pricedProviderSingle")
											: t("pricedProviders", { count: providers })}
								</Badge>
								{m.open_router_model_id ? (
									<Badge variant="outline" className="text-[10px]">
						{t("openRouterMapped")}
									</Badge>
								) : null}
							</div>

							{capabilities.length ? (
								<div className="mt-3 flex flex-wrap gap-1.5">
									{capabilities.map((capability) => (
										<Badge
											key={`${m.id}-${capability}`}
											variant="outline"
											className="text-[10px]"
										>
											{capability}
										</Badge>
									))}
								</div>
							) : null}

						<div className="mt-4 space-y-3 text-sm">
							<div className="space-y-1">
								<div className="text-[11px] font-medium text-muted-foreground">
									{t("inputModalities")}
								</div>
								<div className="flex flex-wrap gap-1.5">
									{inputTypes.length ? (
										inputTypes.map((chip) => (
											<Badge
												key={`${m.id}-input-${chip}`}
												variant="outline"
												className="text-[10px]"
											>
												{chip}
											</Badge>
										))
									) : (
										<span className="text-xs text-muted-foreground">-</span>
									)}
								</div>
							</div>
							<div className="space-y-1">
								<div className="text-[11px] font-medium text-muted-foreground">
									{t("outputModalities")}
								</div>
								<div className="flex flex-wrap gap-1.5">
									{outputTypes.length ? (
										outputTypes.map((chip) => (
											<Badge
												key={`${m.id}-output-${chip}`}
												variant="outline"
												className="text-[10px]"
											>
												{chip}
											</Badge>
										))
									) : (
										<span className="text-xs text-muted-foreground">-</span>
									)}
								</div>
							</div>
						</div>

						<div className="mt-4 space-y-2 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">{t("release")}</span>
								<span className="font-mono text-xs text-foreground">
									{formatMonthYear(m.release_date, locale)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">
									{t("knowledgeCutoff")}
								</span>
								<span className="font-mono text-xs text-foreground">
									{formatMonthYear(m.knowledge_cutoff, locale)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">{t("context")}</span>
								<span
									className={cn(
										"rounded-md px-1.5 py-0.5 font-mono text-xs text-foreground",
										isBest(m.input_context_length, bestInputContext) &&
											"bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
									)}
								>
									{formatCount(m.input_context_length, locale)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">{t("maxOutput")}</span>
								<span
									className={cn(
										"rounded-md px-1.5 py-0.5 font-mono text-xs text-foreground",
										isBest(m.output_context_length, bestOutputContext) &&
											"bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
									)}
								>
									{formatCount(m.output_context_length, locale)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">{t("license")}</span>
								<span className="text-xs text-foreground">
										{formatLicenseLabel(m.license, t) !== "-" ? (
										<Badge variant="outline" className="text-[10px]">
											{formatLicenseLabel(m.license, t)}
										</Badge>
									) : (
										"-"
									)}
								</span>
							</div>
						</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
