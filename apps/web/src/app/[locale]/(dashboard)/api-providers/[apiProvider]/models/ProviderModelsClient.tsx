"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, FilePlus, Search, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { debounce, useQueryState } from "nuqs";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { APIProviderModelListItem } from "@/lib/fetchers/api-providers/providerDataTypes";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { fetchAuthenticatedProviderCatalogPreviews } from "@/lib/query/providerCatalogPreviews";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	hasAuthenticatedAccountQueryScope,
	webQueryKeys,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";
import { MODEL_CARD_GRID_CLASS_NAME } from "@/components/(data)/models/Models/modelCardGrid";
import {
	ProviderModelCard,
	ProviderModelDetailsSheet,
	listify,
	normalizeCapabilityKey,
} from "./ProviderModelCard";

type ProviderModelsClientProps = {
	apiProvider: string;
	models: APIProviderModelListItem[];
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[];
	accountQueryScope?: AccountQueryScope | null;
};

// Newest first, like the other model lists; undated models go last by name.
function modelTimestamp(model: APIProviderModelListItem): number {
	const value = model.release_date ?? model.announcement_date ?? model.created_at;
	const timestamp = value ? Date.parse(value) : Number.NaN;
	return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareModels(a: APIProviderModelListItem, b: APIProviderModelListItem): number {
	return modelTimestamp(b) - modelTimestamp(a) || (a.model_name || a.model_id).localeCompare(b.model_name || b.model_id);
}

function mapCatalogPreviewModel(model: AuthenticatedProviderCatalogPreview): APIProviderModelListItem {
	const modelId = model.canonical_model_slug?.trim() || model.model_id;
	const pricingMeters = (model.pricing ?? []).map((price) => {
		const pricePerUnitUsd = price.priceNanos / 1_000_000_000;
		const isTokenMeter = price.unit === "token" || price.meterKey.includes("token");
		return {
			meter: price.meterKey,
			label: price.displayLabel || price.meterKey,
			unit: price.unit,
			unit_size: price.unitQuantity,
			price_per_unit_usd: pricePerUnitUsd,
			price_per_1m_usd: isTokenMeter ? pricePerUnitUsd * (1_000_000 / Math.max(1, price.unitQuantity)) : null,
			estimated_price_per_image_usd: null,
			display_unit_label: price.displayUnit || price.unit,
		};
	});
	return {
		model_id: modelId,
		api_model_id: model.api_model_id,
		model_name: model.model_name,
		provider_model_slug: model.provider_model_slug,
		endpoints: model.endpoints ?? [],
		is_active_gateway: false,
		is_unreleased: true,
		availability_status: model.availability_status,
		availability_reason: model.availability_reason,
		input_modalities: model.input_modalities ?? [],
		output_modalities: model.output_modalities ?? [],
		release_date: model.release_date ?? model.available_from ?? null,
		announcement_date: model.announcement_date ?? null,
		created_at: model.created_at ?? null,
		supported_params: model.supported_params ?? [],
		pricing_meters: pricingMeters,
	};
}

function mergeCatalogPreviewModels(
	models: APIProviderModelListItem[],
	previews: AuthenticatedProviderCatalogPreview[],
): APIProviderModelListItem[] {
	const byModelId = new Map(models.map((model) => [model.model_id, model]));
	for (const preview of previews) {
		const incoming = mapCatalogPreviewModel(preview);
		const existing = byModelId.get(incoming.model_id);
		if (!existing) {
			byModelId.set(incoming.model_id, incoming);
			continue;
		}
		byModelId.set(incoming.model_id, {
			...existing,
			is_unreleased: Boolean(existing.is_unreleased || incoming.is_unreleased),
			endpoints: Array.from(new Set([...(existing.endpoints ?? []), ...(incoming.endpoints ?? [])])),
			input_modalities: Array.from(new Set([...listify(existing.input_modalities), ...listify(incoming.input_modalities)])),
			output_modalities: Array.from(new Set([...listify(existing.output_modalities), ...listify(incoming.output_modalities)])),
			supported_params: Array.from(new Set([...(existing.supported_params ?? []), ...(incoming.supported_params ?? [])])),
			pricing_meters: existing.pricing_meters?.length ? existing.pricing_meters : incoming.pricing_meters,
			availability_status: existing.is_active_gateway ? "active" : incoming.availability_status,
		});
	}
	return [...byModelId.values()];
}

export default function ProviderModelsClient({
	apiProvider,
	models,
	initialProviderPreviews,
	accountQueryScope = ANONYMOUS_ACCOUNT_QUERY_SCOPE,
}: ProviderModelsClientProps) {
	const t = useTranslations("Catalogue.providerModelList");
	const scope = accountQueryScope ?? ANONYMOUS_ACCOUNT_QUERY_SCOPE;
	const { data: providerPreviews = [] } = useQuery<AuthenticatedProviderCatalogPreview[]>({
		queryKey: webQueryKeys.account.providerPreviews({
			scope,
			providerSlug: apiProvider,
		}),
		queryFn: ({ signal }) =>
			fetchAuthenticatedProviderCatalogPreviews(apiProvider, false, { signal }),
		...WEB_QUERY_POLICIES.private,
		enabled: hasAuthenticatedAccountQueryScope(scope),
		initialData: initialProviderPreviews,
		refetchOnMount: true,
	});
	const displayModels = useMemo(
		() => mergeCatalogPreviewModels(models, providerPreviews),
		[models, providerPreviews],
	);
	const [searchQuery, setSearchQuery] = useQueryState("q", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});
	const [selectedParams, setSelectedParams] = useQueryState("params", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",").map(normalizeCapabilityKey) : []),
		serialize: (value) => value.join(","),
	});

	const [detailsModel, setDetailsModel] = useState<APIProviderModelListItem | null>(null);
	const [paramPickerValue, setParamPickerValue] = useState<string>("");
	const [isParamSelectOpen, setIsParamSelectOpen] = useState(false);
	const keepParamSelectOpenRef = useRef(false);

	const parameterOptions = useMemo(() => {
		const map = new Map<string, string>();
		displayModels.forEach((model) => {
			listify(model.supported_params).forEach((value) => {
				const id = normalizeCapabilityKey(value);
				if (id && !map.has(id)) map.set(id, id);
			});
		});
		return Array.from(map.entries())
			.map(([id, label]) => ({ id, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [displayModels]);

	const parameterLabelMap = useMemo(
		() => new Map(parameterOptions.map((option) => [option.id, option.label])),
		[parameterOptions],
	);
	const selectedParamLabels = useMemo(
		() =>
			selectedParams.map(
				(param) => parameterLabelMap.get(param) ?? param,
			),
		[selectedParams, parameterLabelMap],
	);
	const selectedParamsSummary = useMemo(() => {
		if (selectedParamLabels.length === 0) return t("filterParameters");
		if (selectedParamLabels.length === 1) return selectedParamLabels[0];
		return t("selectedParameters", { count: selectedParamLabels.length });
	}, [selectedParamLabels, t]);

	const filteredModels = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return displayModels.filter((model) => {
			if (q) {
				const haystack =
					`${model.model_name ?? ""} ${model.api_model_id} ${model.model_id}`.toLowerCase();
				if (!haystack.includes(q)) return false;
			}

			if (selectedParams.length > 0) {
				const modelParams = new Set(
					listify(model.supported_params).map(normalizeCapabilityKey),
				);
				const supportsAllSelected = selectedParams.every((param) =>
					modelParams.has(param),
				);
				if (!supportsAllSelected) return false;
			}

			return true;
		}).sort(compareModels);
	}, [displayModels, searchQuery, selectedParams]);

	const clearHref = `/api-providers/${apiProvider}#models`;

	const detailsIndex = detailsModel
		? filteredModels.findIndex((model) => model.model_id === detailsModel.model_id)
		: -1;
	const showModelAt = useCallback((index: number) => {
		const next = filteredModels[index];
		if (!next) return;
		setDetailsModel(next);
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		document
			.querySelector(`[data-provider-model-card="${CSS.escape(next.model_id)}"]`)
			?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
	}, [filteredModels]);

	// Left and right arrows step through the list while the inspector is open.
	// Up and down stay with the browser so the page and the sheet still scroll.
	useEffect(() => {
		if (detailsIndex < 0) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest("input, textarea, select, [contenteditable='true'], [role='listbox'], [role='slider'], [role='tablist']")) return;
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				showModelAt(detailsIndex - 1);
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				showModelAt(detailsIndex + 1);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [detailsIndex, showModelAt]);

	function toggleParam(param: string) {
		if (selectedParams.includes(param)) {
			void setSelectedParams(selectedParams.filter((item) => item !== param));
		} else {
			void setSelectedParams([...selectedParams, param]);
		}
	}

	function clearFilters() {
		void setSearchQuery("");
		void setSelectedParams([]);
		setParamPickerValue("");
	}

	function clearParameterFilters() {
		void setSelectedParams([]);
		setParamPickerValue("");
	}

	if (displayModels.length === 0) {
		return (
			<Empty className="mt-4 rounded-lg border p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FilePlus />
					</EmptyMedia>
					<EmptyTitle>{t("noModelsTitle")}</EmptyTitle>
					<EmptyDescription>
						{t("noModelsForProvider")}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild>
						<Link href="/contribute">{t("contribute")}</Link>
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<div className="relative w-full sm:max-w-xs">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchQuery}
						onChange={(event) =>
							setSearchQuery(event.target.value || "", {
								limitUrlUpdates: debounce(200),
							})
						}
						placeholder={t("searchPlaceholder")}
						className="h-9 pl-8"
						aria-label={t("searchPlaceholder")}
					/>
				</div>
				<div className="flex items-center gap-1 sm:w-60">
					<Select
						open={isParamSelectOpen}
						onOpenChange={(nextOpen) => {
							if (!nextOpen && keepParamSelectOpenRef.current) return;
							setIsParamSelectOpen(nextOpen);
						}}
						value={paramPickerValue}
						onValueChange={(value) => {
							keepParamSelectOpenRef.current = true;
							toggleParam(value);
							setParamPickerValue("");
							queueMicrotask(() => {
								setIsParamSelectOpen(true);
								keepParamSelectOpenRef.current = false;
							});
						}}
					>
						<SelectTrigger className="h-9 w-full [&>span]:max-w-[calc(100%-1.5rem)] [&>span]:truncate">
							<SelectValue placeholder={selectedParamsSummary} />
						</SelectTrigger>
						<SelectContent>
							{parameterOptions.map((option) => (
								<SelectItem
									key={option.id}
									value={option.id}
									className="[&>span:first-child]:hidden"
								>
									<span className="pr-6 font-mono text-xs">{option.label}</span>
									<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
										<Check
											className={`h-4 w-4 text-muted-foreground ${selectedParams.includes(option.id) ? "opacity-100" : "opacity-0"}`}
										/>
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectedParams.length > 0 ? (
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 shrink-0"
							onClick={clearParameterFilters}
							aria-label={t("clearSelectedParameterFilters")}
						>
							<X className="h-4 w-4" />
						</Button>
					) : null}
				</div>
				{searchQuery.length > 0 ? (
					<Button variant="ghost" size="sm" className="self-start sm:self-auto" onClick={clearFilters}>
						{t("clear")}
					</Button>
				) : null}
				<div className="text-sm text-muted-foreground sm:ml-auto">
					{t("modelsCount", { count: filteredModels.length })}
				</div>
			</div>

			<div className="mt-4">
				{filteredModels.length === 0 ? (
					<Empty className="rounded-lg border p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FilePlus />
							</EmptyMedia>
							<EmptyTitle>{t("noMatchingModels")}</EmptyTitle>
							<EmptyDescription>
								{t("noModelsMatched")}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button asChild>
								<Link href={clearHref} onClick={clearFilters}>
									{t("clearFilters")}
								</Link>
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<div className={MODEL_CARD_GRID_CLASS_NAME}>
						{filteredModels.map((model) => (
							<div key={`${model.model_id}:${model.created_at ?? "na"}`} data-provider-model-card={model.model_id}>
								<ProviderModelCard
									model={model}
									selected={detailsModel?.model_id === model.model_id}
									onOpenDetails={setDetailsModel}
								/>
							</div>
						))}
					</div>
				)}
			</div>

			<ProviderModelDetailsSheet
				model={detailsModel}
				index={detailsIndex}
				total={filteredModels.length}
				onPrevious={detailsIndex > 0 ? () => showModelAt(detailsIndex - 1) : undefined}
				onNext={detailsIndex >= 0 && detailsIndex < filteredModels.length - 1 ? () => showModelAt(detailsIndex + 1) : undefined}
				onOpenChange={(open) => {
					if (!open) setDetailsModel(null);
				}}
			/>
		</>
	);
}
