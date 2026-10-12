"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import {
	getCapabilityIconMeta,
	MODEL_ICON_BADGE_CLASS_NAME,
	ModelCapabilityIcons,
	useModelCapabilityLabel,
} from "@/components/(data)/models/ModelCapabilityIcons";
import { formatExecutionRegionLabel } from "@/lib/providers/executionRegions";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { parseCatalogueTierFilters } from "@/lib/models/catalogueTierFilters";
import { resolveProviderLogoId } from "@/lib/providers/providerOffers";
import { cn } from "@/lib/utils";
import {
	describeProviderRoutes,
	groupModelRows,
	lowestDisplayedPrice,
	type ProviderRoute,
	type GroupedModelData,
	type ModelData,
	type ModelOperationPrices,
	type ModelUsagePrice,
} from "./modelTableGrouping";
import {
	matchesModelTableRow,
	normalizeModelTableStatus as normalizeStatusValue,
	type ModelTableFilters,
} from "./modelTableFilters";

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

const featureIcons: Record<string, { icon: LucideIcon; badgeClassName: string; iconClassName: string }> = {
	tools: {
		icon: Wrench,
		badgeClassName: "bg-yellow-100 dark:bg-yellow-950/50",
		iconClassName: "text-yellow-700 dark:text-yellow-300",
	},
	reasoning: {
		icon: Brain,
		badgeClassName: "bg-indigo-100 dark:bg-indigo-950/50",
		iconClassName: "text-indigo-700 dark:text-indigo-300",
	},
	structured_outputs: {
		icon: Braces,
		badgeClassName: "bg-cyan-100 dark:bg-cyan-950/50",
		iconClassName: "text-cyan-700 dark:text-cyan-300",
	},
	caching: {
		icon: Database,
		badgeClassName: "bg-emerald-100 dark:bg-emerald-950/50",
		iconClassName: "text-emerald-700 dark:text-emerald-300",
	},
	web_search: {
		icon: Globe,
		badgeClassName: "bg-blue-100 dark:bg-blue-950/50",
		iconClassName: "text-blue-700 dark:text-blue-300",
	},
	moderated: {
		icon: ShieldAlert,
		badgeClassName: "bg-red-100 dark:bg-red-950/50",
		iconClassName: "text-red-700 dark:text-red-300",
	},
	free: {
		icon: BadgeCheck,
		badgeClassName: "bg-emerald-100 dark:bg-emerald-950/50",
		iconClassName: "text-emerald-700 dark:text-emerald-300",
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
	{ id: "capability", label: "Capabilities", width: 128 },
	{ id: "inputPrice", label: "Input $", width: 128, numeric: true },
	{ id: "outputPrice", label: "Output $", width: 128, numeric: true },
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
	const capabilityLabel = useModelCapabilityLabel();
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
		parse: parseCatalogueTierFilters,
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

	const filters = useMemo<ModelTableFilters>(() => ({
		search: searchQuery,
		year: yearSelected,
		inputModalities: selectedInputModalities,
		outputModalities: selectedOutputModalities,
		features: selectedFeatures,
		tiers: selectedTiers,
		supportedParameters: selectedSupportedParameters,
		providers: selectedProviders,
		regions: selectedRegions,
		creators: selectedCreators,
		contextMin: selectedContextMin,
		endpoints: selectedEndpoints,
		statuses: selectedStatuses,
	}), [
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
	]);

	const filteredGroupedData = useMemo(() => {
		const filtered = data.filter((item) => matchesModelTableRow(item, filters));

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
						aValue = lowestDisplayedPrice(a, "inputPrices");
						bValue = lowestDisplayedPrice(b, "inputPrices");
						break;
					case "outputPrice":
						aValue = lowestDisplayedPrice(a, "outputPrices");
						bValue = lowestDisplayedPrice(b, "outputPrices");
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
	}, [data, filters, sortField, sortDirection]);

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
		const routes = describeProviderRoutes(linkedProviders);
		const regionsLabel = (regions: string[]) => regions.map((region) =>
			region === "jp" ? modelsUiT("regionJapan")
				: region === "au" ? modelsUiT("regionAustralia")
					: formatExecutionRegionLabel(region)).join(", ");
		const routeLabel = (route: ProviderRoute) => [
			route.name,
			route.regions.length ? `${modelsUiT("regionRouting")}: ${regionsLabel(route.regions)}` : null,
			route.routeId,
		].filter(Boolean).join(" · ");
		const renderRouteDetails = (route: ProviderRoute) => (
			<span className="block">
				<span className="block font-medium">{route.name}</span>
				{route.regions.length ? (
					<span className="block opacity-80">
						{modelsUiT("regionRouting")}: {regionsLabel(route.regions)}
					</span>
				) : null}
				{route.routeId ? <span className="block font-mono text-[10px] opacity-70">{route.routeId}</span> : null}
			</span>
		);
		const visibleProviders = routes.slice(0, 5);
		const hiddenProviders = routes.slice(visibleProviders.length);
		return (
			<div className="flex items-center">
				<div className="flex items-center gap-1">
					{visibleProviders.map((provider) => (
						<Tooltip key={provider.id}>
							<TooltipTrigger asChild>
								<Link
									href={`/api-providers/${provider.id}`}
									aria-label={routeLabel(provider)}
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
							<TooltipContent side="top" className="max-w-64">{renderRouteDetails(provider)}</TooltipContent>
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
						<TooltipContent side="top" className="max-w-64">
							<div className="space-y-1.5">
								{hiddenProviders.map((route) => (
									<span key={route.id} className="block">{renderRouteDetails(route)}</span>
								))}
							</div>
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		);
	};

	// Per-unit charges can be fractions of a cent, so keep three significant digits.
	const formatUsagePrice = (value: number) => format.number(value, {
		style: "currency",
		currency: "USD",
		...(value > 0 && value < 0.01
			? { maximumSignificantDigits: 3 }
			: { minimumFractionDigits: 2, maximumFractionDigits: 3 }),
		notation: "standard",
	});

	const renderPriceRange = (prices: number[]) => {
		if (!prices.length) {
			return <span title={comparisonT("priceUnavailable")} aria-label={comparisonT("priceUnavailable")}>-</span>;
		}
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
									className={cn(MODEL_ICON_BADGE_CLASS_NAME, tone.badgeClassName)}
								>
									<IconComponent
										aria-hidden
										className={cn("h-3.5 w-3.5", tone.iconClassName)}
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
					const iconConfig = featureIcons[key];
					if (!iconConfig) return null;
					const IconComponent = iconConfig.icon;

					const label = t(`featureLabels.${key}` as never) as string;
					const description = t(`featureDescriptions.${key}` as never) as string;
					return (
						<HoverCard key={feature} openDelay={160} closeDelay={80}>
							<HoverCardTrigger asChild>
								<button
									type="button"
					aria-label={t("featureAriaLabel", { label })}
									className={cn(MODEL_ICON_BADGE_CLASS_NAME, iconConfig.badgeClassName)}
								>
									<IconComponent
										aria-hidden
										className={cn("h-3.5 w-3.5", iconConfig.iconClassName)}
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

	const renderStatus = (status: string, capabilities: string[]) => {
		const normalizedStatus = normalizeStatusValue(status);
		const iconConfig =
			statusMetaByKey[normalizedStatus] ?? statusMetaByKey.inactive;
		const IconComponent = iconConfig.icon;
		const label = statusMetaByKey[normalizedStatus]
			? (t(`providerStatus.${normalizedStatus}` as never) as string)
			: t("providerStatus.unknown", { status });
		const endpointLabel = capabilities.length
			? capabilities.map(capabilityLabel).join(", ")
			: "-";

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
							<span className="text-foreground">{endpointLabel}</span>
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
							fast: modelsUiT("tierPriority"),
						} as Record<string, string>)[normalizedTier] ?? normalizedTier
					}</span>
			</span>
		);
	};

	const formatDate = (dateStr: string) => {
		return format.calendarDate(dateStr);
	};

	const renderStatuses = (item: GroupedModelData) => (
		<div className="flex items-center justify-center gap-0.5">
			{item.statusEndpoints.map(({ status, endpoints }) => (
				<span key={status}>{renderStatus(status, endpoints)}</span>
			))}
		</div>
	);

	// Charges without a token rate (per image, per second, ...) sit in the output
	// column with their unit, so they never read as a $0 token price.
	const renderPriceCell = (
		prices: number[],
		usage: ModelUsagePrice[],
		column: "inputPrices" | "outputPrices",
	) => {
		if (column === "inputPrices" || !usage.length) return renderPriceRange(prices);
		return (
			<div className="space-y-1">
				{prices.length ? <div>{renderPriceRange(prices)}</div> : null}
				{usage.map(({ price, unit }) => (
					<div key={unit} className="leading-tight">
						<span className="mr-1 font-sans text-[10px] text-muted-foreground">{sectionsT("from")}</span>
						{formatUsagePrice(price)}
						<div className="font-sans text-[10px] text-muted-foreground">/ {unit}</div>
					</div>
				))}
			</div>
		);
	};

	// Per-capability rows only when this column's prices differ between
	// capabilities; each row is marked by the capability's icon, as in the
	// Capabilities column, so labels never spill into the next column.
	const renderOperationPrices = (
		item: GroupedModelData,
		column: "inputPrices" | "outputPrices",
	) => {
		const operations = item.operationPrices;
		const columnKey = (operation: ModelOperationPrices) => column === "inputPrices"
			? operation.inputPrices.join()
			: `${operation.outputPrices.join()}|${JSON.stringify(operation.usagePrices)}`;
		const differs = operations.some(operation => columnKey(operation) !== columnKey(operations[0]));
		if (!differs) return renderPriceCell(item[column], item.usagePrices, column);
		return (
			<div className="inline-grid grid-cols-[auto_auto] items-start gap-x-1.5 gap-y-1 text-left">
				{operations.map(operation => {
					const { icon: Icon, tone } = getCapabilityIconMeta(operation.capability);
					const label = capabilityLabel(operation.capability);
					return (
						<Fragment key={operation.capability}>
							<Tooltip>
								<TooltipTrigger asChild>
									<span role="img" tabIndex={0} aria-label={label}
										className={cn(MODEL_ICON_BADGE_CLASS_NAME, "size-4 rounded-sm", tone.badgeClassName)}>
										<Icon aria-hidden className={cn("h-2.5 w-2.5", tone.iconClassName)} />
									</span>
								</TooltipTrigger>
								<TooltipContent side="top">{label}</TooltipContent>
							</Tooltip>
							<div className="leading-4">{renderPriceCell(operation[column], operation.usagePrices, column)}</div>
						</Fragment>
					);
				})}
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
				return <ModelCapabilityIcons endpoints={item.endpoints} />;
			case "inputPrice":
				return renderOperationPrices(item, "inputPrices");
			case "outputPrice":
				return renderOperationPrices(item, "outputPrices");
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
