"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLocale, useTranslations } from "next-intl";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	AlignCenter,
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	AudioLines,
	BadgeAlert,
	BadgeCheck,
	Ban,
	Brain,
	Braces,
	Captions,
	CheckCircle2,
	ChevronsUpDown,
	Clock3,
	Database,
	FileDigit,
	FileUp,
	Globe,
	Headphones,
	ImageDown,
	ImageUp,
	Mic,
	Music4,
	ShieldAlert,
	Speech,
	Video,
	Wrench,
	XCircle,
	type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/Logo";
import TableSettings from "@/components/(gateway)/usage/TableSettings";
import { useTablePreferences } from "@/components/(gateway)/usage/useTablePreferences";
import type {
	TableColumnDefinition,
	TableColumnPreference,
	TableDensity,
} from "@/components/(gateway)/usage/tablePreferences";

import Link from "next/link";
import { useQueryState } from "nuqs";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { ModelCapabilityBadges } from "@/components/(data)/models/ModelCapabilityBadges";
import { decisionModelCapability } from "@/lib/models/modelCapabilities";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { resolveProviderLogoId } from "@/lib/providers/providerOffers";
import { cn } from "@/lib/utils";
import {
	groupModelRows,
	type GroupedModelData,
	type ModelData,
} from "./modelTableGrouping";

export type { ModelData } from "./modelTableGrouping";

const MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"audio_tts",
	"audio_stt",
	"audio_music",
	"moderations",
	"rerank",
	"embeddings",
] as const;

type ModalityConfig = {
	input: LucideIcon;
	output: LucideIcon;
	color: string;
};

const modalityIcons: Record<string, ModalityConfig> = {
	text: {
		input: AlignCenter,
		output: AlignCenter,
		color: "text-gray-600",
	},
	image: {
		input: ImageUp,
		output: ImageDown,
		color: "text-blue-600",
	},
	video: {
		input: Video,
		output: Video,
		color: "text-purple-600",
	},
	audio: {
		input: AudioLines,
		output: Headphones,
		color: "text-pink-600",
	},
	audio_stt: {
		input: Mic,
		output: Captions,
		color: "text-rose-600",
	},
	audio_tts: {
		input: Speech,
		output: Speech,
		color: "text-orange-600",
	},
	audio_music: {
		input: Music4,
		output: Music4,
		color: "text-fuchsia-600",
	},
	moderations: {
		input: BadgeAlert,
		output: BadgeAlert,
		color: "text-red-600",
	},
	rerank: {
		input: ArrowUpDown,
		output: ArrowUpDown,
		color: "text-teal-600",
	},
	embeddings: {
		input: FileDigit,
		output: FileDigit,
		color: "text-orange-600",
	},
	file: {
		input: FileUp,
		output: FileUp,
		color: "text-green-600",
	},
	multimodal: {
		input: Globe,
		output: Globe,
		color: "text-indigo-600",
	},
	code: {
		input: Braces,
		output: Braces,
		color: "text-cyan-600",
	},
	function: {
		input: Wrench,
		output: Wrench,
		color: "text-yellow-600",
	},
};

function normalizeModality(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._/-]+/g, " ");
	if (!normalized) return "";
	if (normalized.includes("vision") || normalized.includes("image"))
		return "image";
	if (normalized.includes("video")) return "video";
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
	if (normalized.includes("speech") || normalized.includes("audio"))
		return "audio";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("embedding")) return "embeddings";
	if (normalized.includes("rerank") || normalized.includes("re rank"))
		return "rerank";
	if (normalized.includes("text")) return "text";
	return normalized.replace(/\s+/g, "_");
}

function normalizeStatusValue(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function sortModalities(values: string[]): string[] {
	const unique = Array.from(
		new Set(values.map((value) => normalizeModality(value)).filter(Boolean)),
	);
	const orderIndex = new Map<string, number>(
		MODALITY_DISPLAY_ORDER.map((modality, index) => [modality, index]),
	);
	return unique.sort((a, b) => {
		const aIndex = orderIndex.get(a);
		const bIndex = orderIndex.get(b);
		if (aIndex !== undefined || bIndex !== undefined) {
			if (aIndex === undefined) return 1;
			if (bIndex === undefined) return -1;
			return aIndex - bIndex;
		}
		return a.localeCompare(b);
	});
}

const featureIcons = {
	tools: {
		icon: Wrench,
		color: "text-yellow-600",
		darkColor: "dark:text-yellow-300",
	},
	reasoning: {
		icon: Brain,
		color: "text-indigo-600",
		darkColor: "dark:text-indigo-300",
	},
	structured_outputs: {
		icon: Braces,
		color: "text-cyan-600",
		darkColor: "dark:text-cyan-300",
	},
	caching: {
		icon: Database,
		color: "text-emerald-600",
		darkColor: "dark:text-emerald-300",
	},
	web_search: {
		icon: Globe,
		color: "text-blue-500",
		darkColor: "dark:text-blue-300",
	},
	moderated: {
		icon: ShieldAlert,
		color: "text-red-500",
		darkColor: "dark:text-red-300",
	},
	free: {
		icon: BadgeCheck,
		color: "text-emerald-600",
		darkColor: "dark:text-emerald-300",
	},
};

const statusMetaByKey: Record<
	string,
        { icon: LucideIcon; color: string }
> = {
	active: {
		icon: CheckCircle2,
		color: "text-green-600 dark:text-green-400",
	},
	deranked_lvl1: {
		icon: AlertTriangle,
		color: "text-amber-500 dark:text-amber-400",
	},
	deranked_lvl2: {
		icon: AlertTriangle,
		color: "text-amber-600 dark:text-amber-400",
	},
	deranked_lvl3: {
		icon: AlertTriangle,
		color: "text-red-500 dark:text-red-400",
	},
	coming_soon: {
		icon: Clock3,
		color: "text-sky-600 dark:text-sky-400",
	},
	inactive: {
		icon: XCircle,
		color: "text-zinc-500 dark:text-zinc-400",
	},
	not_active: {
		icon: XCircle,
		color: "text-zinc-500 dark:text-zinc-400",
	},
	not_listed: {
		icon: XCircle,
		color: "text-zinc-500 dark:text-zinc-400",
	},
	disabled: {
		icon: Ban,
		color: "text-red-600 dark:text-red-400",
	},
};
const statusLegendOrder = [
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"coming_soon",
	"inactive",
	"disabled",
] as const;
const TABLE_LOADING_SKELETON_ROWS = 12;
const DEFAULT_SORT_FIELD = "added";
const DEFAULT_SORT_DIRECTION: "asc" | "desc" = "desc";
export const MODEL_TABLE_COLUMNS = [
	{ id: "model", label: "Model", width: 360 },
	{ id: "providers", label: "Providers", width: 184 },
	{ id: "status", label: "Gateway Status", width: 148 },
	{ id: "capability", label: "Capabilities", width: 190 },
	{ id: "inputPrice", label: "Input $", width: 112, numeric: true },
	{ id: "outputPrice", label: "Output $", width: 112, numeric: true },
	{ id: "tier", label: "Tier", width: 112 },
	{ id: "inputModalities", label: "Input Modalities", width: 164 },
	{ id: "outputModalities", label: "Output Modalities", width: 164 },
	{ id: "features", label: "Features", width: 200 },
	{ id: "context", label: "Context", width: 112, numeric: true },
	{ id: "maxOutput", label: "Max Output", width: 112, numeric: true },
	{ id: "weeklyTokens", label: "Weekly Tokens", width: 140, numeric: true },
	{ id: "added", label: "Added", width: 116 },
	{ id: "retired", label: "Retired", width: 116 },
] as const satisfies readonly (TableColumnDefinition & { width: number })[];

type ModelTableColumnId = (typeof MODEL_TABLE_COLUMNS)[number]["id"];
type ModelTableColumn = TableColumnDefinition & {
	id: ModelTableColumnId;
	width: number;
	numeric?: boolean;
};

export type ModelTablePreferences = {
	columns: TableColumnPreference<ModelTableColumnId>[];
	density: TableDensity;
	updateColumns: (columns: TableColumnPreference<ModelTableColumnId>[]) => void;
	updateDensity: (density: TableDensity) => void;
	resetColumns: () => void;
};

// Props for the datatable component
interface MonitorDataTableProps {
	data: ModelData[];
	loading?: boolean;
	effectiveStatuses?: string[];
	stickyHeaderOffset?: number;
	modelTablePreferences?: ModelTablePreferences;
}

export function MonitorDataTable({
	data,
	loading = false,
	effectiveStatuses,
	stickyHeaderOffset = 60,
	modelTablePreferences,
}: MonitorDataTableProps) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.monitor");
	const tWithModality = t as unknown as (
		key: string,
		values: { modality: string },
	) => string;
	const modelsUiT = useTranslations("Catalogue.models.filtersUi");
	const pricingT = useTranslations("Catalogue.modelDetail.pricing");
	const sectionsT = useTranslations("Catalogue.modelDetail.sections");
	const comparisonT = useTranslations("Catalogue.compare");
	const format = useDisplayFormatters();
	const localizedModelTableColumns = useMemo(() => {
		const labels: Record<ModelTableColumnId, string> = {
			model: t("context.model"), providers: t("providersGroup"),
			status: sectionsT("gatewayStatus"), capability: t("capabilityLabel"),
			inputPrice: pricingT("inputPrice"), outputPrice: pricingT("outputPrice"),
			tier: t("tier"), inputModalities: modelsUiT("inputModalities"),
			outputModalities: modelsUiT("outputModalities"), features: modelsUiT("features"),
			context: comparisonT("context"), maxOutput: sectionsT("maxOutput"),
			weeklyTokens: t("tableHeaders.weeklyTokens"), added: t("actionAdded"), retired: t("tableHeaders.retired"),
		};
		return MODEL_TABLE_COLUMNS.map((column) => ({ ...column, label: labels[column.id] }));
	}, [t, sectionsT, pricingT, modelsUiT, comparisonT]);

	const localModelTablePreferences = useTablePreferences("models-table", localizedModelTableColumns);
	const {
		columns: modelTableColumns,
		density: modelTableDensity,
		updateColumns: updateModelTableColumns,
		updateDensity: updateModelTableDensity,
		resetColumns: resetModelTableColumns,
	} = modelTablePreferences ?? localModelTablePreferences;
	const [searchQuery] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [yearSelected] = useQueryState("year", {
		defaultValue: 0,
		parse: (value) => Number.parseInt(value || "0", 10),
		serialize: (value) => String(value),
	});

	const [selectedInputModalities] = useQueryState("inputModalities", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedOutputModalities] = useQueryState("outputModalities", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedFeatures] = useQueryState("features", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});
	const [selectedTiers] = useQueryState("tiers", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedSupportedParameters] = useQueryState("supportedParameters", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedProviders] = useQueryState("providers", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedRegions] = useQueryState("regions", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedCreators] = useQueryState("creators", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedContextMin] = useQueryState("contextMin", {
		defaultValue: 0,
		parse: (value) => {
			const parsed = Number(value);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
		},
		serialize: (value) => String(value),
	});

	const [selectedEndpoints] = useQueryState("endpoints", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [urlSelectedStatuses] = useQueryState("statuses", {
		defaultValue: [],
		parse: (value) =>
			value
				? value
						.split(",")
						.map((part) => normalizeStatusValue(part))
						.filter(Boolean)
				: [],
		serialize: (value) =>
			value
				.map((part) => normalizeStatusValue(part))
				.filter(Boolean)
				.join(","),
	});
	const selectedStatuses = effectiveStatuses ?? urlSelectedStatuses;

	// Sorting via URL params
	const [sortField, setSortField] = useQueryState("sort", {
		defaultValue: DEFAULT_SORT_FIELD,
		parse: (value) => value || DEFAULT_SORT_FIELD,
		serialize: (value) => value,
	});
	const [sortDirection, setSortDirection] = useQueryState("dir", {
		defaultValue: DEFAULT_SORT_DIRECTION,
		parse: (value) => (value === "asc" ? "asc" : DEFAULT_SORT_DIRECTION),
		serialize: (value) => value,
	});
	const previousSortRef = useRef(`${sortField}:${sortDirection}`);

	const handleSort = (field: string) => {
		const defaultDirection: "asc" | "desc" = "desc";
		const oppositeDirection: "asc" | "desc" =
			defaultDirection === "desc" ? "asc" : "desc";

		if (sortField !== field) {
			setSortField(field);
			setSortDirection(defaultDirection);
			return;
		}

		if (sortDirection === defaultDirection) {
			setSortDirection(oppositeDirection);
			return;
		}

		setSortField(DEFAULT_SORT_FIELD);
		setSortDirection(DEFAULT_SORT_DIRECTION);
	};

	const getSortIcon = (field: string) => {
		if (sortField !== field) {
			return (
				<ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
			);
		}
		return sortDirection === "asc" ? (
			<ArrowUp className="h-3.5 w-3.5" />
		) : (
			<ArrowDown className="h-3.5 w-3.5" />
		);
	};

	const renderSortHead = (
		label: string,
		field: string,
		align: "left" | "center" = "left",
	) => {
		const isActive = sortField === field;
		return (
			<button
				type="button"
				onClick={() => handleSort(field)}
				className={cn(
					"group inline-flex w-full items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
					align === "center"
						? "justify-center text-center"
						: "justify-start text-left",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
				aria-label={t("sortModelsBy", { label })}
			>
				<span>{label}</span>
				{getSortIcon(field)}
			</button>
		);
	};

	const filteredGroupedData = useMemo(() => {
		const filtered = data.filter((item) => {
			if (searchQuery) {
				const searchLower = searchQuery.toLowerCase();
				const matchesSearch = Object.values(item).some((value) => {
					if (Array.isArray(value)) {
						return value.some((v) =>
							String(v).toLowerCase().includes(searchLower),
						);
					}
					if (typeof value === "object" && value !== null) {
						return Object.values(value).some((nestedValue) => {
							if (Array.isArray(nestedValue)) {
								return nestedValue.some((v) =>
									String(v).toLowerCase().includes(searchLower),
								);
							}
							return String(nestedValue).toLowerCase().includes(searchLower);
						});
					}
					return String(value).toLowerCase().includes(searchLower);
				});
				if (!matchesSearch) return false;
			}

			if (yearSelected && yearSelected > 0) {
				const itemYear = item.added ? new Date(item.added).getFullYear() : null;
				if (itemYear !== yearSelected) return false;
			}

			if (selectedInputModalities.length > 0) {
				const hasAllInputModalities = selectedInputModalities.every((mod) =>
					item.inputModalities.includes(mod),
				);
				if (!hasAllInputModalities) return false;
			}

			if (selectedOutputModalities.length > 0) {
				const hasAllOutputModalities = selectedOutputModalities.every((mod) =>
					item.outputModalities.includes(mod),
				);
				if (!hasAllOutputModalities) return false;
			}

			if (selectedFeatures.length > 0) {
				const hasAllFeatures = selectedFeatures.every((feat) =>
					item.provider.features.includes(feat),
				);
				if (!hasAllFeatures) return false;
			}

			if (selectedTiers.length > 0) {
				const tier = String(item.tier ?? "standard")
					.trim()
					.toLowerCase();
				if (!selectedTiers.includes(tier)) return false;
			}

			if (selectedSupportedParameters.length > 0) {
				const parameters = new Set(item.supportedParameters ?? []);
				if (
					!selectedSupportedParameters.every((value) => parameters.has(value))
				) {
					return false;
				}
			}

			if (
				selectedProviders.length > 0 &&
				!selectedProviders.includes(item.provider.id)
			) {
				return false;
			}

			if (selectedRegions.length > 0) {
				const regions = new Set(
					(item.provider.executionRegions ?? []).map((value) =>
						String(value).trim().toLowerCase(),
					),
				);
				if (!selectedRegions.every((value) => regions.has(value))) return false;
			}

			if (
				selectedCreators.length > 0 &&
				(!item.organisationId ||
					!selectedCreators.includes(item.organisationId))
			) {
				return false;
			}

			if (selectedContextMin > 0 && item.context < selectedContextMin) {
				return false;
			}

			if (selectedEndpoints.length > 0) {
				if (!selectedEndpoints.includes(item.endpoint)) return false;
			}

			if (selectedStatuses.length > 0) {
				const normalizedStatus = normalizeStatusValue(item.gatewayStatus);
				if (!selectedStatuses.includes(normalizedStatus)) return false;
			}

			return true;
		});

		const grouped = groupModelRows(filtered);
		if (!sortField) return grouped;

		return [...grouped].sort((a, b) => {
			let aValue: any;
			let bValue: any;

			if (sortField === "added" || sortField === "retired") {
				const field = sortField as "added" | "retired";
				const aHasDate = !!a[field];
				const bHasDate = !!b[field];

				if (aHasDate && bHasDate) {
					const aDate = new Date(a[field]!).getTime();
					const bDate = new Date(b[field]!).getTime();
					return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
				}
				if (aHasDate && !bHasDate) return -1;
				if (!aHasDate && bHasDate) return 1;
				return 0;
			}

				switch (sortField) {
					case "model":
						aValue = a.model;
						bValue = b.model;
						break;
					case "provider":
						aValue = a.providers[0]?.name ?? "";
						bValue = b.providers[0]?.name ?? "";
						break;
					case "endpoint":
						aValue = a.endpoints[0] ?? "";
						bValue = b.endpoints[0] ?? "";
						break;
					case "inputPrice":
						aValue = a.inputPrices[0] ?? Number.POSITIVE_INFINITY;
						bValue = b.inputPrices[0] ?? Number.POSITIVE_INFINITY;
						break;
					case "outputPrice":
						aValue = a.outputPrices[0] ?? Number.POSITIVE_INFINITY;
						bValue = b.outputPrices[0] ?? Number.POSITIVE_INFINITY;
						break;
					case "status":
						aValue = normalizeStatusValue(a.statusEndpoints[0]?.status ?? "");
						bValue = normalizeStatusValue(b.statusEndpoints[0]?.status ?? "");
						break;
					case "tier":
						aValue = a.tiers[0] ?? "";
						bValue = b.tiers[0] ?? "";
						break;
					case "weeklyTokens":
						aValue = a.popularityTokensWeek ?? 0;
						bValue = b.popularityTokensWeek ?? 0;
						break;
					case "context":
						aValue = a.context;
						bValue = b.context;
						break;
					case "maxOutput":
						aValue = a.maxOutput;
						bValue = b.maxOutput;
						break;
					default:
						aValue = "";
						bValue = "";
			}

			if (Array.isArray(aValue)) aValue = aValue.join(",");
			if (Array.isArray(bValue)) bValue = bValue.join(",");

			if (typeof aValue === "number" && typeof bValue === "number") {
				return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
			}

			const aStr = String(aValue).toLowerCase();
			const bStr = String(bValue).toLowerCase();
			return sortDirection === "asc"
				? aStr.localeCompare(bStr)
				: bStr.localeCompare(aStr);
		});
	}, [
		data,
		searchQuery,
		yearSelected,
		selectedInputModalities,
		selectedOutputModalities,
		selectedFeatures,
		selectedTiers,
		selectedSupportedParameters,
		selectedProviders,
		selectedRegions,
		selectedCreators,
		selectedContextMin,
		selectedEndpoints,
		selectedStatuses,
		sortField,
		sortDirection,
	]);

	const totalItems = filteredGroupedData.length;
	const tableContainerRef = useRef<HTMLDivElement | null>(null);
	const tableHeaderTrackRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const tableContainer = tableContainerRef.current;
		const headerTrack = tableHeaderTrackRef.current;
		if (!tableContainer || !headerTrack) return;

		const syncHeaderScroll = () => {
			headerTrack.style.transform = `translate3d(${-tableContainer.scrollLeft}px, 0, 0)`;
			headerTrack.style.setProperty(
				"--table-scroll-left",
				`${tableContainer.scrollLeft}px`,
			);
		};

		syncHeaderScroll();
		tableContainer.addEventListener("scroll", syncHeaderScroll, {
			passive: true,
		});
		return () => tableContainer.removeEventListener("scroll", syncHeaderScroll);
	}, []);
	const shouldVirtualizeRows = filteredGroupedData.length > 60;
	const [scrollMargin, setScrollMargin] = useState(0);
	useEffect(() => {
		if (!shouldVirtualizeRows || typeof window === "undefined") return;
		const updateScrollMargin = () => {
			if (!tableContainerRef.current) return;
			const rect = tableContainerRef.current.getBoundingClientRect();
			setScrollMargin(rect.top + window.scrollY);
		};
		updateScrollMargin();
		window.addEventListener("resize", updateScrollMargin);
		return () => window.removeEventListener("resize", updateScrollMargin);
	}, [shouldVirtualizeRows, filteredGroupedData.length]);

	const rowVirtualizer = useWindowVirtualizer({
		count: filteredGroupedData.length,
		estimateSize: () =>
			modelTableDensity === "compact"
				? 36
				: modelTableDensity === "expanded"
					? 64
					: 52,
		overscan: 8,
		scrollMargin,
		scrollPaddingStart: stickyHeaderOffset,
		enabled: shouldVirtualizeRows,
	});
	useEffect(() => {
		const sortSignature = `${sortField}:${sortDirection}`;
		if (previousSortRef.current === sortSignature) return;
		previousSortRef.current = sortSignature;
		if (!shouldVirtualizeRows || filteredGroupedData.length === 0) return;
		rowVirtualizer.scrollToIndex(0, { align: "start" });
	}, [
		filteredGroupedData,
		rowVirtualizer,
		shouldVirtualizeRows,
		sortDirection,
		sortField,
	]);
	const virtualRows = rowVirtualizer.getVirtualItems();
	const deferredVirtualRows = useDeferredValue(virtualRows);
	const rowsToRender = shouldVirtualizeRows
		? virtualRows.length > 0
			? virtualRows.map((row) => ({ index: row.index }))
			: deferredVirtualRows.map((row) => ({ index: row.index }))
		: filteredGroupedData.map((_, index) => ({ index }));
	const virtualScrollMargin = rowVirtualizer.options.scrollMargin ?? 0;
	const paddingTop =
		shouldVirtualizeRows && virtualRows.length > 0
			? Math.max(0, (virtualRows[0]?.start ?? 0) - virtualScrollMargin)
			: 0;
	const paddingBottom =
		shouldVirtualizeRows && virtualRows.length > 0
			? Math.max(
					0,
					rowVirtualizer.getTotalSize() -
						Math.max(
							0,
							(virtualRows[virtualRows.length - 1]?.end ?? 0) -
								virtualScrollMargin,
						),
				)
			: 0;

	// Render model cell with links for org and model
	const renderModel = (
		model: string,
		organisationId?: string,
		modelId?: string,
	) => {
		return (
			<div className="flex min-w-0 items-center gap-2">
				{organisationId ? (
					<Link
						href={`/organisations/${organisationId}`}
						className="inline-flex cursor-pointer"
					>
						<div className="w-6 h-6 relative flex items-center justify-center rounded-md border">
							<div className="w-4 h-4 relative">
							<Logo
								id={organisationId}
								alt={t("organisationLogoAlt")}
									className="object-contain"
									fill
								/>
							</div>
						</div>
					</Link>
				) : null}
				{modelId ? (
					<Link
						href={`/models/${modelId}`}
						className="min-w-0 flex-1 text-xs font-medium hover:underline underline-offset-2 decoration-[1px]"
						title={model}
					>
						<span className="block cursor-pointer truncate">{model}</span>
					</Link>
				) : (
					<span
						className="block min-w-0 flex-1 truncate text-xs font-medium"
						title={model}
					>
						{model}
					</span>
				)}
			</div>
		);
	};
	const renderProviders = (providers: GroupedModelData["providers"]) => {
		const linkedProviders = providers.filter(
			(provider) => provider.id && provider.id !== "unlinked",
		);
		if (!linkedProviders.length) return <span className="text-xs">-</span>;
		const visibleProviders = linkedProviders.slice(0, 5);
		const hiddenProviders = linkedProviders.slice(visibleProviders.length);
		return (
			<div className="flex items-center">
				<div className="flex items-center gap-1">
					{visibleProviders.map((provider) => (
						<Tooltip key={provider.id}>
							<TooltipTrigger asChild>
								<Link
									href={`/api-providers/${provider.id}`}
									aria-label={provider.name}
									className="relative flex size-6 items-center justify-center rounded-md border bg-background transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span className="relative size-4">
									<Logo
										id={resolveProviderLogoId({ providerId: provider.id })}
										alt=""
										className="object-contain"
										fill
									/>
									</span>
								</Link>
							</TooltipTrigger>
							<TooltipContent side="top">{provider.name}</TooltipContent>
						</Tooltip>
					))}
				</div>
				{hiddenProviders.length > 0 ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span
								tabIndex={0}
								aria-label={`${hiddenProviders.length} additional providers`}
								className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[10px] font-medium tabular-nums text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								+{hiddenProviders.length}
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="max-w-56">
							<div className="space-y-1">
								{hiddenProviders.map(({ id, name }) => (
									<span key={id} className="block">{name}</span>
								))}
							</div>
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		);
	};

	const renderPriceRange = (prices: number[]) => {
		if (!prices.length) return "-";
		const minimum = prices[0];
		const maximum = prices[prices.length - 1];
		return minimum === maximum
			? format.number(minimum, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2, notation: "standard" })
			: `${format.number(minimum, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2, notation: "standard" })}–${format.number(maximum, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2, notation: "standard" })}`;
	};

	const renderModalities = (modalities: string[], type: "input" | "output") => {
		const sortedModalities = sortModalities(modalities);
		return (
			<div className="flex min-w-max flex-nowrap justify-center gap-1 whitespace-nowrap">
				{sortedModalities.map((modality) => {
					const iconConfig = modalityIcons[modality];
					if (!iconConfig) return null;
					const tone = getModalityTone(modality);
					const label = t(`modalityLabels.${modality}` as never) as string;
					const description = tWithModality(`modalityDescriptions.${type}`, {
						modality: label,
					});

					const IconComponent =
						type === "input" ? iconConfig.input : iconConfig.output;

					return (
						<HoverCard key={modality} openDelay={160} closeDelay={80}>
							<HoverCardTrigger asChild>
								<button
									type="button"
					aria-label={tWithModality(`modalityAriaLabels.${type}`, { modality: label })}
									className={cn(
										"group inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
										tone.badgeClassName,
									)}
								>
									<IconComponent
										className={cn(
											"h-4 w-4 transition-transform group-hover:scale-105",
											tone.iconClassName,
										)}
									/>
								</button>
							</HoverCardTrigger>
							<HoverCardContent
								align="center"
								side="top"
								className="w-72 p-3"
							>
								<p className="text-sm font-semibold leading-tight text-foreground">
									{tWithModality(`modalityHeadings.${type}`, { modality: label })}
								</p>
								<p className="mt-2 text-[13px] leading-5 text-muted-foreground">
									{description}
								</p>
							</HoverCardContent>
						</HoverCard>
					);
				})}
			</div>
		);
	};

	const renderFeatures = (features: string[]) => {
		return (
			<div className="flex min-w-max flex-nowrap justify-center gap-1 whitespace-nowrap">
				{features.map((feature) => {
					const rawKey = feature.trim().toLowerCase().replace(/\s+/g, "_");
					const key =
						rawKey === "native_web_search"
							? "web_search"
							: rawKey === "structured_output"
								? "structured_outputs"
								: rawKey;
					const iconConfig = featureIcons[key as keyof typeof featureIcons];
					if (!iconConfig) return null;

					const IconComponent = iconConfig.icon;
					if (!IconComponent) return null;

					const colorMap: Record<string, string> = {
						"text-yellow-600":
							"border-yellow-600 bg-yellow-50 dark:border-yellow-400/50 dark:bg-yellow-950/40",
						"text-indigo-600":
							"border-indigo-600 bg-indigo-50 dark:border-indigo-400/50 dark:bg-indigo-950/40",
						"text-cyan-600":
							"border-cyan-600 bg-cyan-50 dark:border-cyan-400/50 dark:bg-cyan-950/40",
						"text-emerald-600":
							"border-emerald-600 bg-emerald-50 dark:border-emerald-400/50 dark:bg-emerald-950/40",
						"text-blue-500":
							"border-blue-500 bg-blue-50 dark:border-blue-400/50 dark:bg-blue-950/40",
						"text-red-500":
							"border-red-500 bg-red-50 dark:border-red-400/50 dark:bg-red-950/40",
					};

					const borderClass =
						colorMap[iconConfig.color] || "border-gray-600 bg-gray-50";

					const label = t(`featureLabels.${key}` as never) as string;
					const description = t(`featureDescriptions.${key}` as never) as string;
					return (
						<HoverCard key={feature} openDelay={160} closeDelay={80}>
							<HoverCardTrigger asChild>
								<button
									type="button"
					aria-label={t("featureAriaLabel", { label })}
									className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${borderClass}`}
								>
									<IconComponent
										className={`h-4 w-4 ${iconConfig.color} ${iconConfig.darkColor}`}
									/>
								</button>
							</HoverCardTrigger>
							<HoverCardContent align="center" side="top" className="w-72 p-3">
								<p className="text-sm font-semibold leading-tight text-foreground">
									{label}
								</p>
								<p className="mt-2 text-[13px] leading-5 text-muted-foreground">
									{description}
								</p>
							</HoverCardContent>
						</HoverCard>
					);
				})}
			</div>
		);
	};

	const renderStatus = (status: string, endpoint?: string) => {
		const normalizedStatus = normalizeStatusValue(status);
		const iconConfig =
			statusMetaByKey[normalizedStatus] ?? statusMetaByKey.inactive;
		const IconComponent = iconConfig.icon;
		const label = statusMetaByKey[normalizedStatus]
			? (t(`providerStatus.${normalizedStatus}` as never) as string)
			: t("providerStatus.unknown", { status });
		const endpointLabel = formatEndpoint(endpoint);

		return (
			<HoverCard openDelay={140} closeDelay={80}>
				<HoverCardTrigger asChild>
					<button
						type="button"
						aria-label={t("statusAriaLabel", { status: label, capability: endpointLabel })}
						className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						{IconComponent && (
							<IconComponent className={`h-4 w-4 ${iconConfig.color}`} />
						)}
					</button>
				</HoverCardTrigger>
				<HoverCardContent
					align="center"
					side="top"
					className="w-64 p-3 text-xs"
				>
					<p className="font-semibold text-foreground">{label}</p>
					<div className="mt-1.5 space-y-1 text-muted-foreground">
						<p>
							{t("capabilityLabel")}:{" "}
							<span className="font-mono text-foreground">{endpointLabel}</span>
						</p>
						<p>{t("capabilityStatusDescription")}</p>
					</div>
				</HoverCardContent>
			</HoverCard>
		);
	};

	const renderTier = (tier?: string) => {
		const normalizedTier = String(tier ?? "standard")
			.trim()
			.toLowerCase();
		const tierMeta = getTierFilterMeta(normalizedTier);
		const TierIcon = tierMeta.icon;
		return (
			<span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap capitalize">
				<TierIcon
					className={cn("h-3.5 w-3.5 shrink-0", tierMeta.iconClassName)}
				/>
					<span>{
						({
							standard: modelsUiT("tierStandard"),
							batch: modelsUiT("tierBatch"),
							free: modelsUiT("tierFree"),
							flex: modelsUiT("tierFlex"),
							priority: modelsUiT("tierPriority"),
						} as Record<string, string>)[normalizedTier] ?? normalizedTier
					}</span>
			</span>
		);
	};

	const formatDate = (dateStr: string) => {
		return format.calendarDate(dateStr);
	};

	const formatEndpoint = (endpoint?: string) => {
		const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
		return trimmed ? trimmed : "-";
	};

	const renderStatuses = (item: GroupedModelData) => (
		<div className="flex items-center justify-center gap-0.5">
			{item.statusEndpoints.map(({ status, endpoint }) => (
				<span key={`${status}-${endpoint}`}>
					{renderStatus(status, formatEndpoint(endpoint))}
				</span>
			))}
		</div>
	);

	const renderCapabilities = (endpoints: string[]) => {
		const labels = endpoints.filter(endpoint => !decisionModelCapability(endpoint)).map(formatEndpoint);
		return (
			<div className="space-y-1"><ModelCapabilityBadges endpoints={endpoints} />
				{labels.length ? <span className="block truncate font-mono text-[11px]" title={labels.join(", ")}>{labels.join(", ")}</span> : null}
			</div>
		);
	};

	const renderTiers = (tiers: string[]) => (
		<div className="flex items-center justify-center gap-2">
			{tiers.slice(0, 2).map((tier) => (
				<span key={tier}>{renderTier(tier)}</span>
			))}
			{tiers.length > 2 ? (
				<span className="text-[11px] text-muted-foreground">+{tiers.length - 2}</span>
			) : null}
		</div>
	);

	const formatTokenCount = (value: number): string => {
		if (!Number.isFinite(value) || value < 0) return "-";
		return format.number(value, { notation: "compact", maximumFractionDigits: 2 });
	};

	const visibleModelTableColumns = modelTableColumns
		.filter(({ visible }) => visible)
		.map((preference) => ({
			preference,
			definition: localizedModelTableColumns.find(({ id }) => id === preference.id)! as ModelTableColumn,
		}));
	const modelTableWidth = visibleModelTableColumns.reduce(
		(total, { definition }) => total + definition.width,
		0,
	);
	const modelTablePinnedProps = (index: number, header = false) => {
		const current = visibleModelTableColumns[index];
		if (!current?.preference.pinned) return {};
		const left = visibleModelTableColumns
			.slice(0, index)
			.reduce((total, { definition }) => total + definition.width, 0);
		return {
			"data-pinned": true,
			style: {
				position: "sticky" as const,
				left,
				zIndex: header ? 3 : 1,
				backgroundColor: "var(--background)",
				transform: header
					? "translateX(var(--table-scroll-left, 0px))"
					: undefined,
				boxShadow: !visibleModelTableColumns[index + 1]?.preference.pinned
					? "inset -1px 0 0 var(--border)"
					: undefined,
			},
		};
	};
	const modelTableSettings = modelTablePreferences ? null : (
		<TableSettings
			columns={modelTableColumns}
			definitions={localizedModelTableColumns}
			tableLabel="models"
			onReset={resetModelTableColumns}
			onChange={updateModelTableColumns}
			density={modelTableDensity}
			onDensityChange={updateModelTableDensity}
		/>
	);
	const sortFieldForColumn = (
		column: ModelTableColumnId,
	): string | null => {
		switch (column) {
			case "providers":
				return "provider";
			case "capability":
				return "endpoint";
			case "inputModalities":
			case "outputModalities":
			case "features":
				return null;
			default:
				return column;
		}
	};
	const renderModelTableHeader = (
		column: ModelTableColumn,
	) => {
		const field = sortFieldForColumn(column.id);
		const align = column.numeric || column.id === "status" ? "center" : "left";
		const content = field
			? renderSortHead(column.label, field, align)
			: <span className={cn("text-xs font-semibold", align === "center" && "block text-center")}>{column.label}</span>;
		if (column.id !== "status") return content;
		return (
			<HoverCard openDelay={1000} closeDelay={120}>
				<HoverCardTrigger asChild>{content}</HoverCardTrigger>
				<HoverCardContent align="start" className="w-52 p-3">
					<div className="space-y-2">
						<p className="text-[11px] font-medium text-muted-foreground">{t("statusKeyLabel")}</p>
						<div className="space-y-1.5">
							{statusLegendOrder.map((statusKey) => {
								const statusMeta = statusMetaByKey[statusKey];
								if (!statusMeta) return null;
								const IconComponent = statusMeta.icon;
								return (
									<div key={statusKey} className="flex items-center gap-2 text-xs">
										<IconComponent className={`h-3.5 w-3.5 ${statusMeta.color}`} />
										<span>{t(`providerStatus.${statusKey}` as never)}</span>
									</div>
								);
							})}
						</div>
						<p className="text-[11px] text-muted-foreground">{t("statusAppliesToRowCapability")}</p>
					</div>
				</HoverCardContent>
			</HoverCard>
		);
	};
	const renderModelTableCell = (
		item: GroupedModelData,
		column: ModelTableColumnId,
	) => {
		switch (column) {
			case "model":
				return renderModel(item.model, item.organisationId, item.modelId);
			case "providers":
				return renderProviders(item.providers);
			case "status":
				return renderStatuses(item);
			case "capability":
				return renderCapabilities(item.endpoints);
			case "inputPrice":
				return item.operationPrices.length === 2 ? <div className="space-y-1">{item.operationPrices.map(operation => <div key={operation.capability}>
					<span className="mr-1 text-[10px] text-muted-foreground">{modelsUiT(operation.capability === "text.generate" ? "capabilityTextGeneration" : "modalityDecisions")}</span>
					{renderPriceRange(operation.inputPrices)}
				</div>)}</div> : renderPriceRange(item.inputPrices);
			case "outputPrice":
				return item.operationPrices.length === 2 ? <div className="space-y-1">{item.operationPrices.map(operation => <div key={operation.capability}>
					<span className="mr-1 text-[10px] text-muted-foreground">{modelsUiT(operation.capability === "text.generate" ? "capabilityTextGeneration" : "modalityDecisions")}</span>
					{renderPriceRange(operation.outputPrices)}
				</div>)}</div> : renderPriceRange(item.outputPrices);
			case "tier":
				return renderTiers(item.tiers);
			case "inputModalities":
				return renderModalities(item.inputModalities, "input");
			case "outputModalities":
				return renderModalities(item.outputModalities, "output");
			case "features":
				return renderFeatures(item.features);
			case "context":
				return item.context > 0 ? format.number(item.context) : "-";
			case "maxOutput":
				return item.maxOutput > 0 ? format.number(item.maxOutput) : "-";
			case "weeklyTokens":
				return formatTokenCount(item.popularityTokensWeek);
			case "added":
				return item.added ? formatDate(item.added) : "-";
			case "retired":
				return item.retired ? formatDate(item.retired) : "-";
		}
	};
	const renderLoadingRows = () =>
		Array.from({ length: TABLE_LOADING_SKELETON_ROWS }).map((_, rowIndex) => (
			<TableRow key={`table-loading-row-${rowIndex}`} aria-hidden>
				{visibleModelTableColumns.map(({ definition }, index) => (
					<TableCell
						key={definition.id}
						{...modelTablePinnedProps(index)}
						className={definition.numeric ? "text-center" : undefined}
					>
						<Skeleton className={cn("h-3 w-20", definition.numeric && "mx-auto w-12")} />
					</TableCell>
				))}
			</TableRow>
		));

	return (
		<div className="space-y-4">
			{modelTableSettings ? (
				<div className="flex justify-end">{modelTableSettings}</div>
			) : null}
			<div className="relative">
				<div
					className="sticky z-30 w-full overflow-hidden bg-background"
					style={{ top: `${stickyHeaderOffset}px` }}
				>
					<div
						ref={tableHeaderTrackRef}
						className="will-change-transform"
						style={{
							width: `${modelTableWidth}px`,
							minWidth: `${modelTableWidth}px`,
						}}
					>
						<Table
							wrapInContainer={false}
							aria-label={t("modelsTable")}
							className="table-fixed w-max bg-background text-xs"
							style={{
								width: `${modelTableWidth}px`,
								minWidth: `${modelTableWidth}px`,
							}}
						>
							<colgroup>
								{visibleModelTableColumns.map(({ definition }) => (
									<col
										key={definition.id}
										style={{ width: `${definition.width}px` }}
									/>
								))}
							</colgroup>
							<TableHeader>
								<TableRow className="bg-background hover:bg-background">
									{visibleModelTableColumns.map(({ definition }, index) => (
										<TableHead
											key={definition.id}
											{...modelTablePinnedProps(index, true)}
											className={cn("bg-background", definition.numeric && "text-center")}
										>
											{renderModelTableHeader(definition)}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
						</Table>
					</div>
				</div>

				<div
					ref={tableContainerRef}
					className="relative overflow-x-auto overflow-y-clip"
				>
					<Table
							wrapInContainer={false}
							aria-label={t("rows")}
							data-density={modelTableDensity}
							className={cn(
								"table-fixed w-max bg-background text-xs",
								modelTableDensity === "compact"
									? "[&_tbody_td:not([colspan])]:py-1"
									: modelTableDensity === "expanded"
										? "[&_tbody_td:not([colspan])]:py-4"
										: "[&_tbody_td:not([colspan])]:py-2",
							)}
							style={{
								width: `${modelTableWidth}px`,
								minWidth: `${modelTableWidth}px`,
							}}
						>
							<colgroup>
								{visibleModelTableColumns.map(({ definition }) => (
									<col key={definition.id} style={{ width: `${definition.width}px` }} />
								))}
							</colgroup>
						<TableBody className="bg-background">
							{loading ? (
								<>{renderLoadingRows()}</>
							) : filteredGroupedData.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={visibleModelTableColumns.length}
										className="text-center py-8"
								>
										{t("noModelsMatchFilters")}
								</TableCell>
							</TableRow>
						) : (
							<>
								{paddingTop > 0 ? (
									<TableRow aria-hidden>
										<TableCell
											colSpan={visibleModelTableColumns.length}
											style={{ height: `${paddingTop}px` }}
											className="bg-background p-0"
										/>
									</TableRow>
								) : null}
								{rowsToRender.map((virtualRowLike) => {
									const item = filteredGroupedData[virtualRowLike.index];
									if (!item) return null;
									return (
										<TableRow key={item.id}>
											{visibleModelTableColumns.map(({ definition }, index) => (
												<TableCell
													key={definition.id}
													{...modelTablePinnedProps(index)}
													className={cn(
														definition.id === "model" && "font-medium",
														(definition.numeric || ["status", "tier", "inputModalities", "outputModalities", "features", "added", "retired"].includes(definition.id)) && "text-center",
														definition.numeric && "font-mono",
													)}
												>
													{renderModelTableCell(item, definition.id)}
												</TableCell>
											))}
										</TableRow>
									);
								})}
								{paddingBottom > 0 ? (
									<TableRow aria-hidden>
										<TableCell
											colSpan={visibleModelTableColumns.length}
											style={{ height: `${paddingBottom}px` }}
											className="bg-background p-0"
										/>
									</TableRow>
								) : null}
							</>
						)}
						</TableBody>
					</Table>
				</div>
			</div>

			{loading ? (
				<div className="flex items-center gap-3">
					<Skeleton className="h-3 w-40" />
				</div>
			) : (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="tabular-nums">
						{t("rowCount", { formattedCount: format.number(totalItems) })}
					</span>
					<span aria-hidden>·</span>
					<span>{t("rowsRenderedOnDemand")}</span>
				</div>
			)}
		</div>
	);
}
