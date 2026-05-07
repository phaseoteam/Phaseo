"use client";

import Link from "next/link";
import { memo, useState, type CSSProperties, type MouseEvent } from "react";
import {
	ArrowUpRight,
	ArrowUpDown,
	Check,
	Copy,
	Type,
	ImageIcon,
	Captions,
	Headphones,
	Music4,
	Speech,
	Video,
	Binary,
	BadgeAlert,
	FileText,
	CircleDot,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";

type ModelCardLike = Omit<ModelCardType, "gateway_status"> & {
	gateway_status?: ModelCardType["gateway_status"] | "coming_soon" | null;
};
import { Logo } from "@/components/Logo";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { useRouter } from "next/navigation";
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
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRIMARY_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
});
const MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"audio",
	"audio_tts",
	"audio_stt",
	"audio_music",
	"video",
	"rerank",
	"embedding",
	"moderation",
] as const;
const PROVIDER_STATUS_ORDER = [
	"active",
	"coming_soon",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
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
	deranked_lvl1: {
		label: "Deranked L1",
		badgeClassName: "bg-amber-500/10 text-amber-600",
		dotClassName: "bg-amber-500",
	},
	deranked_lvl2: {
		label: "Deranked L2",
		badgeClassName: "bg-amber-600/10 text-amber-700",
		dotClassName: "bg-amber-600",
	},
	deranked_lvl3: {
		label: "Deranked L3",
		badgeClassName: "bg-red-500/10 text-red-600",
		dotClassName: "bg-red-500",
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
	if (normalized.includes("embed")) return "embedding";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("moderat")) return "moderation";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcrib") ||
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
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function providerStatusPriority(status: string): number {
	return providerStatusOrderIndex.get(status) ?? providerStatusOrderIndex.size + 1;
}

function formatProviderStatusLabel(status: string): string {
	const normalized = normalizeProviderStatus(status);
	const mapped = PROVIDER_STATUS_META[normalized];
	if (mapped) return mapped.label;
	return normalized
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTokenCount(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "-";
	if (value >= 1_000_000_000_000_000_000) {
		const scaled = value / 1_000_000_000_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}Qi`;
	}
	if (value >= 1_000_000_000_000_000) {
		const scaled = value / 1_000_000_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}Q`;
	}
	if (value >= 1_000_000_000_000) {
		const scaled = value / 1_000_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}T`;
	}
	if (value >= 1_000_000_000) {
		const scaled = value / 1_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}B`;
	}
	if (value >= 1_000_000) {
		const scaled = value / 1_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}M`;
	}
	if (value >= 1_000) {
		return `${Math.round(value / 1_000)}K`;
	}
	return value.toLocaleString();
}

function formatPrice(
	value: number | null | undefined,
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
	if (value === 0) {
		return options.allowZero ? "$0" : null;
	}
	if (value < 0.001) return `$${value.toFixed(4)}`;
	if (value < 0.1) return `$${value.toFixed(3)}`;
	if (value < 1) return `$${value.toFixed(2)}`;
	return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
	options: { allowZero?: boolean } = {},
): string | null {
	const amount = formatPrice(value, { allowZero: options.allowZero });
	if (!amount) return null;
	const normalizedUnit = normalizeFromPriceUnit(unit);
	return normalizedUnit ? `${amount} per ${normalizedUnit}` : amount;
}

function formatPriceWithUnit(
	value: number | null | undefined,
	unit: string | null | undefined,
): string | null {
	const amount = formatPrice(value, { allowZero: true });
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

function summarizePricingValues(values: string[]): string | null {
	const parsed = values
		.map((value) => {
			const match = value.match(/^\$([\d.,]+)(?:-\$?([\d.,]+))?\s*\/\s*(.+)$/);
			if (!match) return null;
			const min = Number(match[1]?.replace(/,/g, ""));
			const max = Number((match[2] ?? match[1])?.replace(/,/g, ""));
			const unit = match[3]?.trim();
			if (!Number.isFinite(min) || !Number.isFinite(max) || !unit) return null;
			return { min, max, unit };
		})
		.filter((entry): entry is { min: number; max: number; unit: string } => Boolean(entry));
	if (parsed.length === 0) return null;
	const unit = parsed[0]?.unit ?? null;
	if (!unit || parsed.some((entry) => entry.unit !== unit)) return null;
	const min = Math.min(...parsed.map((entry) => entry.min));
	const max = Math.max(...parsed.map((entry) => entry.max));
	const minText = formatPrice(min, { allowZero: true });
	const maxText = formatPrice(max, { allowZero: true });
	if (!minText || !maxText) return null;
	return min === max ? `${minText} / ${unit}` : `${minText}-${maxText} / ${unit}`;
}

function summarizeDuplicatePricingItems(
	items: Array<{ value: string }>,
): string | null {
	const uniqueValues = Array.from(
		new Set(
			items
				.map((item) => String(item.value ?? "").trim())
				.filter(Boolean),
		),
	);
	if (uniqueValues.length === 0) return null;
	if (uniqueValues.length === 1) return uniqueValues[0] ?? null;
	return summarizePricingValues(uniqueValues);
}

function getModalityIcon(value: string): LucideIcon {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("embed")) return Binary;
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return ArrowUpDown;
	}
	if (normalized.includes("moderat")) return BadgeAlert;
	if (normalized.includes("file")) return FileText;
	if (normalized.includes("image")) return ImageIcon;
	if (normalized.includes("music")) return Music4;
	if (
		normalized.includes("transcrib") ||
		normalized.includes("speech to text") ||
		normalized.includes("stt")
	) {
		return Captions;
	}
	if (
		normalized.includes("text to speech") ||
		normalized.includes("audio speech") ||
		normalized.includes("speech synth") ||
		normalized.includes("tts")
	) {
		return Speech;
	}
	if (normalized.includes("video")) return Video;
	if (normalized.includes("audio")) return Headphones;
	if (normalized.includes("text")) return Type;
	return CircleDot;
}

function formatPrimaryDate(model: ModelCardLike): string {
	if (!model.primary_date) return "Date unknown";
	const parsed = new Date(model.primary_date);
	if (Number.isNaN(parsed.getTime())) return model.primary_date;
	return PRIMARY_DATE_FORMATTER.format(parsed);
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
	const modelSlug = model.model_id;
	const modelHref = `/models/${modelSlug}`;
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
	const displayModelId = apiModelId ?? "No API Model ID";
	const isDisplayedApiModelFree = apiModelId?.toLowerCase().endsWith(":free") ?? false;
	const organisationLabel = String(
		normalizeOrganisationDisplayName(
			model.organisation_name,
			model.organisation_id,
		) ?? "",
	).trim();
	const modelDisplayName =
		showOrganisationPrefix && organisationLabel
			? model.name.toLowerCase().startsWith(`${organisationLabel.toLowerCase()}: `)
				? model.name
				: `${organisationLabel}: ${model.name}`
			: model.name;
	const [copied, setCopied] = useState(false);
	const providerCount = model.gateway_provider_count ?? 0;
	const activeProviders = model.gateway_active_provider_count ?? 0;
	const providerDetails = (model.gateway_provider_details ?? [])
		.map((provider) => ({
			id: String(provider.id ?? "").trim(),
			name: String(provider.name ?? "").trim(),
			status: normalizeProviderStatus(
				provider.status ?? (provider.is_active ? "active" : "inactive"),
			),
			isActive: Boolean(provider.is_active),
		}))
		.filter((provider) => provider.name);
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
	const PROVIDER_ROW_HEIGHT = 28;
	const PROVIDER_ROW_GAP = 4;
	const providerListHeight = Math.min(
		224,
		providerStatusItems.length * PROVIDER_ROW_HEIGHT +
			Math.max(0, providerStatusItems.length - 1) * PROVIDER_ROW_GAP,
	);
	const inputModalities = model.gateway_input_modalities ?? [];
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
	const inputPrice = formatPrice(model.lowest_input_price, { allowZero: true });
	const outputPrice = formatPrice(model.lowest_output_price, { allowZero: true });
	const standardInputPrice = formatPrice(model.lowest_standard_input_price, {
		allowZero: true,
	});
	const standardOutputPrice = formatPrice(model.lowest_standard_output_price, {
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
			? formatFromPrice(Math.min(...tokenPriceCandidates), "1M tokens")
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
	const priceSummary =
		isFreeDisplayModel
			? "Free"
			: structuredPriceSummary
				? structuredPriceSummary
				: fromPriceSummary;
	const priceLabel = structuredPriceSummary || isTextModel ? "Pricing" : "From:";
	const fallbackInputLabel =
		primaryInputKey === "image"
			? "Image Inputs"
			: primaryInputKey === "audio"
				? "Audio Input"
				: primaryInputKey === "video"
					? "Video Input"
					: "Input";
	const fallbackOutputLabel =
		primaryOutputKey === "image"
			? "Output Images (from)"
			: primaryOutputKey === "audio"
				? "Audio Output"
				: primaryOutputKey === "video"
					? "Video Output (from)"
					: "Output";
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
			label: String(model.lowest_standard_input_price_label ?? "").trim() || "Input",
			value: formatPriceWithUnit(
				model.lowest_standard_input_price,
				model.lowest_standard_input_price_unit,
			),
		},
		{
			id: "output",
			label:
				String(model.lowest_standard_output_price_label ?? "").trim() || "Output",
			value: formatPriceWithUnit(
				model.lowest_standard_output_price,
				model.lowest_standard_output_price_unit,
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
			),
		},
		{
			id: "output",
			label: fallbackOutputLabel,
			value: formatPriceWithUnit(
				model.lowest_output_price,
				fallbackOutputUnit,
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
	if (pricingDetailRows.length === 0 && priceSummary) {
		pricingDetailRows = [
			{
				id: "summary",
				label: "Pricing",
				value: priceSummary,
			},
		];
	}
	const pricingDetailGroups = pricingDetailRows.reduce<
		Array<{
			id: string;
			baseLabel: string;
			items: Array<{ id: string; label: string; value: string; variant: string | null }>;
		}>
	>((groups, row) => {
		const match = row.label.match(/^(.*?)(?: \((.+)\))?$/);
		const baseLabel = match?.[1]?.trim() || row.label;
		const variant = match?.[2]?.trim() || null;
		const existingGroup = groups.find((group) => group.baseLabel === baseLabel);
		if (existingGroup) {
			existingGroup.items.push({
				id: row.id,
				label: row.label,
				value: row.value,
				variant,
			});
			return groups;
		}
		groups.push({
			id: row.id,
			baseLabel,
			items: [
				{
					id: row.id,
					label: row.label,
					value: row.value,
					variant,
				},
			],
		});
		return groups;
	}, []);
	const getVideoAudioGroup = (variant: string | null) => {
		if (!variant) return { heading: null, detail: null as string | null };
		if (variant.endsWith(", with audio")) {
			return {
				heading: "With audio",
				detail: variant.slice(0, -", with audio".length) || null,
			};
		}
		if (variant.endsWith(", no audio")) {
			return {
				heading: "No audio",
				detail: variant.slice(0, -", no audio".length) || null,
			};
		}
		return { heading: null, detail: variant };
	};
	const formatModalities = (values: string[]) => {
		const unique = sortModalitiesForDisplay(Array.from(
			new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
		));
		const visible = unique.slice(0, 4);
		const hiddenCount = unique.length - visible.length;
		return {
			visible,
			hiddenCount,
		};
	};
	const inputModalityDisplay = formatModalities(inputModalities);
	const outputModalityDisplay = formatModalities(outputModalities);
	const weeklyTokens = Number.isFinite(Number(model.popularity_tokens_week))
		? Math.max(0, Number(model.popularity_tokens_week))
		: 0;

	const copyModelId = async () => {
		if (!apiModelId) return;
		try {
			await navigator.clipboard.writeText(apiModelId);
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
		router.push(modelHref);
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
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
					<Link
						href={`/organisations/${model.organisation_id}`}
						prefetch={false}
						className="shrink-0"
						scroll
					>
						<div className="w-10 h-10 relative flex items-center justify-center rounded-lg border bg-background ml-1 md:ml-0">
							<div className="w-6 h-6 relative">
								<Logo
									id={model.organisation_id}
									alt={model.organisation_name || "Provider Logo"}
									className="object-contain"
									fill
								/>
							</div>
						</div>
					</Link>

					<div className="min-w-0 space-y-0.5 self-center">
						<div className="flex items-center gap-1 min-w-0">
							<Link
								href={modelHref}
								prefetch={false}
								className="font-semibold text-sm leading-[1.1] text-foreground hover:underline underline-offset-4 transition-colors duration-200 line-clamp-1"
							>
								{modelDisplayName}
							</Link>
							{apiModelId ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											onClick={copyModelId}
											className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
											aria-label={`Copy API model ID for ${modelDisplayName}`}
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
										{copied ? "Copied" : "Copy Model ID"}
									</TooltipContent>
								</Tooltip>
							) : null}
						</div>
						<div className="text-xs leading-[1.15] text-muted-foreground font-mono truncate">
							{displayModelId}
						</div>
					</div>

					<Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0">
						<Link
							href={modelHref}
							prefetch={false}
							aria-label={`Open ${modelDisplayName}`}
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
					<div className="flex flex-wrap items-center gap-1.5 text-[11px] md:col-span-3">
						{providerStatusItems.length > 0 ? (
							<HoverCard openDelay={120} closeDelay={100}>
								<HoverCardTrigger asChild>
									<button
										type="button"
										data-no-row-nav="true"
										className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-left transition-colors hover:bg-muted/45"
									>
										<span className="text-muted-foreground">Providers</span>
										<span className="font-medium text-foreground tabular-nums">
											{activeProviders.toLocaleString()}/{providerCount.toLocaleString()}
										</span>
									</button>
								</HoverCardTrigger>
								<HoverCardContent align="start" className="w-72 p-3">
									<div className="space-y-2">
										<div className="text-xs font-medium text-foreground">
											Provider Support
										</div>
										<ScrollArea className="pr-1" style={{ height: providerListHeight }}>
											<div className="space-y-1 pr-2">
												{providerStatusItems.map((provider) => (
													<div
														key={`${provider.id || "provider"}-${provider.name}`}
														className="flex items-center justify-between gap-3 rounded-sm px-1 py-1 text-xs"
													>
														{provider.id ? (
															<Link
																href={`/api-providers/${provider.id}`}
																prefetch={false}
																className="flex min-w-0 items-center gap-2 text-foreground hover:underline underline-offset-2"
															>
																<span className="relative h-4 w-4 shrink-0 rounded-[4px] border bg-background">
																	<Logo
																		id={provider.id}
																		alt={provider.name}
																		className="object-contain p-[1px]"
																		fill
																	/>
																</span>
																<span className="truncate">
																	{provider.name}
																</span>
															</Link>
														) : (
															<span className="flex min-w-0 items-center gap-2">
																<span className="truncate text-foreground">
																	{provider.name}
																</span>
															</span>
														)}
														<span
															className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px]", PROVIDER_STATUS_META[provider.status]?.badgeClassName ?? "bg-muted text-muted-foreground")}
														>
															<span
																className={cn("h-1.5 w-1.5 rounded-full", PROVIDER_STATUS_META[provider.status]?.dotClassName ?? "bg-muted-foreground/60")}
															/>
															{formatProviderStatusLabel(provider.status)}
														</span>
													</div>
												))}
											</div>
										</ScrollArea>
									</div>
								</HoverCardContent>
							</HoverCard>
						) : (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">Providers</span>
								<span className="font-medium text-foreground tabular-nums">
									{activeProviders.toLocaleString()}/{providerCount.toLocaleString()}
								</span>
							</div>
						)}
						{maxContextLength ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">Context</span>
								<span className="font-medium text-foreground tabular-nums">
									{`${formatTokenCount(maxContextLength)} tokens`}
								</span>
							</div>
						) : null}
						{priceSummary ? (
							pricingDetailRows.length > 0 ? (
								<HoverCard openDelay={120} closeDelay={100}>
									<HoverCardTrigger asChild>
										<button
											type="button"
											data-no-row-nav="true"
											className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-left transition-colors hover:bg-muted/45"
										>
											<span className="text-muted-foreground">{priceLabel}</span>
											<span className="font-medium text-foreground">
												{priceSummary}
											</span>
										</button>
									</HoverCardTrigger>
									<HoverCardContent
										align="start"
										className="w-fit min-w-[13rem] max-w-[22rem] p-3"
									>
										<div className="space-y-2">
											{pricingDetailGroups.map((group) => {
												const shouldGroupVariants =
													group.items.length > 1 &&
													group.items.every((item) => Boolean(item.variant));
												const duplicateSummary =
													!shouldGroupVariants && group.items.length > 1
														? summarizeDuplicatePricingItems(group.items)
														: null;
												if (duplicateSummary) {
													return (
														<div key={group.id} className="space-y-0.5 text-xs">
															<div className="font-semibold text-foreground">
																{group.baseLabel}
															</div>
															<div className="text-muted-foreground">
																{duplicateSummary}
															</div>
														</div>
													);
												}
												if (!shouldGroupVariants) {
													return group.items.map((item) => (
														<div key={item.id} className="space-y-0.5 text-xs">
															<div className="font-semibold text-foreground">
																{item.label}
															</div>
															<div className="text-muted-foreground">{item.value}</div>
														</div>
													));
												}
												if (group.baseLabel === "Image Output" && group.items.length >= 3) {
													const summarizedValue = summarizePricingValues(
														group.items.map((item) => item.value),
													);
													if (summarizedValue) {
														return (
															<div key={group.id} className="space-y-0.5 text-xs">
																<div className="font-semibold text-foreground">
																	{group.baseLabel}
																</div>
																<div className="text-muted-foreground">
																	{summarizedValue}
																</div>
															</div>
														);
													}
												}
												if (group.baseLabel === "Video Output") {
													const audioGroups = group.items.reduce<
														Array<{
															id: string;
															heading: string | null;
															items: Array<{ id: string; detail: string | null; value: string }>;
														}>
													>((acc, item) => {
														const parsed = getVideoAudioGroup(item.variant);
														const key = parsed.heading ?? "__default__";
														const existing = acc.find(
															(candidate) => (candidate.heading ?? "__default__") === key,
														);
														if (existing) {
															existing.items.push({
																id: item.id,
																detail: parsed.detail,
																value: item.value,
															});
															return acc;
														}
														acc.push({
															id: item.id,
															heading: parsed.heading,
															items: [
																{
																	id: item.id,
																	detail: parsed.detail,
																	value: item.value,
																},
															],
														});
														return acc;
													}, []);
													return (
														<div key={group.id} className="space-y-1.5 text-xs">
															<div className="font-semibold text-foreground">
																{group.baseLabel}
															</div>
															<div className="space-y-1.5">
																{audioGroups.map((audioGroup) => (
																	<div key={audioGroup.id} className="space-y-1">
																		{audioGroup.heading ? (
																			<div className="text-[11px] font-medium text-foreground/80">
																				{audioGroup.heading}
																			</div>
																		) : null}
																		<div className="space-y-1">
																			{audioGroup.items.map((item) => (
																				<div
																					key={item.id}
																					className="flex items-baseline justify-between gap-3"
																				>
																					<div className="text-muted-foreground">
																						{item.detail ?? "Standard"}
																					</div>
																					<div className="shrink-0 text-muted-foreground">
																						{item.value}
																					</div>
																				</div>
																			))}
																		</div>
																	</div>
																))}
															</div>
														</div>
													);
												}
												return (
													<div key={group.id} className="space-y-1 text-xs">
														<div className="font-semibold text-foreground">
															{group.baseLabel}
														</div>
														<div className="space-y-1">
															{group.items.map((item) => (
																<div
																	key={item.id}
																	className="flex items-baseline justify-between gap-3"
																>
																	<div className="text-muted-foreground">
																		{item.variant}
																	</div>
																	<div className="shrink-0 text-muted-foreground">
																		{item.value}
																	</div>
																</div>
															))}
														</div>
													</div>
												);
											})}
										</div>
									</HoverCardContent>
								</HoverCard>
							) : (
								<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
									<span className="text-muted-foreground">{priceLabel}</span>
									<span className="font-medium text-foreground">{priceSummary}</span>
								</div>
							)
						) : null}
					</div>

					<div className="space-y-1 md:col-span-3">
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">
								Input
							</span>
							<div className="min-w-0 flex flex-wrap gap-1">
								{inputModalityDisplay.visible.length > 0 ? (
									<>
										{inputModalityDisplay.visible.map((modality) => {
											const Icon = getModalityIcon(modality);
											const tone = getModalityTone(modality);
											return (
												<span
													key={`input-${modality}`}
													className={cn(
														"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
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
												+{inputModalityDisplay.hiddenCount} others
											</span>
										) : null}
									</>
								) : (
									<span className="text-[11px] text-muted-foreground">-</span>
								)}
							</div>
						</div>
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">
								Output
							</span>
							<div className="min-w-0 flex flex-wrap gap-1">
								{outputModalityDisplay.visible.length > 0 ? (
									<>
										{outputModalityDisplay.visible.map((modality) => {
											const Icon = getModalityIcon(modality);
											const tone = getModalityTone(modality);
											return (
												<span
													key={`output-${modality}`}
													className={cn(
														"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
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
												+{outputModalityDisplay.hiddenCount} others
											</span>
										) : null}
									</>
								) : (
									<span className="text-[11px] text-muted-foreground">-</span>
								)}
							</div>
						</div>
					</div>
				</div>

				<div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span className="truncate">{formatPrimaryDate(model)}</span>
					<div className="shrink-0">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="hidden h-8 px-2 tabular-nums text-muted-foreground md:inline-flex"
									aria-label="Weekly tokens"
								>
									{formatTokenCount(weeklyTokens)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Weekly tokens</TooltipContent>
						</Tooltip>

						<Popover>
							<PopoverTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="h-8 px-2 tabular-nums text-muted-foreground md:hidden"
									aria-label="Weekly tokens"
								>
									{formatTokenCount(weeklyTokens)}
								</Button>
							</PopoverTrigger>
							<PopoverContent
								side="top"
								align="end"
								className="w-auto px-2.5 py-1.5 text-xs"
							>
								Weekly tokens
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
