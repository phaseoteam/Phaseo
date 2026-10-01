"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

import Link from "next/link";
import { useQueryState } from "nuqs";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { cn } from "@/lib/utils";

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
const TABLE_COLUMNS_COUNT = 15;
const TABLE_LOADING_SKELETON_ROWS = 12;
const DEFAULT_SORT_FIELD = "added";
const DEFAULT_SORT_DIRECTION: "asc" | "desc" = "desc";
const TABLE_COLUMN_WIDTHS = [
	420, // Model
	168, // Provider
	132, // Gateway Status
	170, // Capability
	112, // Input $
	112, // Output $
	96, // Tier
	164, // Input Modalities
	164, // Output Modalities
	200, // Features — keep capability icons on one line
	112, // Context
	112, // Max Output
	140, // Weekly Tokens
	116, // Added
	116, // Retired
] as const;
const TABLE_TOTAL_WIDTH = TABLE_COLUMN_WIDTHS.reduce(
	(total, width) => total + width,
	0,
);

// Types for the model data
export interface ModelData {
	id: string;
	model: string;
	modelId: string;
	organisationId?: string;
	provider: {
		name: string;
		id: string;
		inputPrice: number;
		outputPrice: number;
		features: string[];
		executionRegions?: string[] | null;
	};
	endpoint: string;
	gatewayStatus: string;
	inputModalities: string[]; // text, image, video, audio/audio_stt/audio_tts/audio_music, file, embeddings
	outputModalities: string[]; // text, image, video, audio/audio_stt/audio_tts/audio_music
	context: number; // context window in tokens
	maxOutput: number; // max output tokens
	quantization?: string; // quantization level
	supportedParameters?: string[];
	tier?: string; // pricing tier
	added?: string; // date added
	retired?: string; // when this model is retired
	popularityTokensWeek?: number;
}

// Props for the datatable component
interface MonitorDataTableProps {
	data: ModelData[];
	loading?: boolean;
	effectiveStatuses?: string[];
	stickyHeaderOffset?: number;
}

export function MonitorDataTable({
	data,
	loading = false,
	effectiveStatuses,
	stickyHeaderOffset = 60,
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

	const filteredSortedData = useMemo(() => {
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

		if (!sortField) return filtered;

		return [...filtered].sort((a, b) => {
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
					aValue = a.provider.name;
					bValue = b.provider.name;
					break;
				case "endpoint":
					aValue = a.endpoint;
					bValue = b.endpoint;
					break;
				case "inputPrice":
					aValue = a.provider.inputPrice;
					bValue = b.provider.inputPrice;
					break;
				case "outputPrice":
					aValue = a.provider.outputPrice;
					bValue = b.provider.outputPrice;
					break;
				case "status":
					aValue = normalizeStatusValue(a.gatewayStatus);
					bValue = normalizeStatusValue(b.gatewayStatus);
					break;
				case "tier":
					aValue = a.tier || "";
					bValue = b.tier || "";
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

	const totalItems = filteredSortedData.length;
	const tableContainerRef = useRef<HTMLDivElement | null>(null);
	const tableHeaderTrackRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const tableContainer = tableContainerRef.current;
		const headerTrack = tableHeaderTrackRef.current;
		if (!tableContainer || !headerTrack) return;

		const syncHeaderScroll = () => {
			headerTrack.style.transform = `translate3d(${-tableContainer.scrollLeft}px, 0, 0)`;
		};

		syncHeaderScroll();
		tableContainer.addEventListener("scroll", syncHeaderScroll, {
			passive: true,
		});
		return () => tableContainer.removeEventListener("scroll", syncHeaderScroll);
	}, []);
	const shouldVirtualizeRows = filteredSortedData.length > 60;
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
	}, [shouldVirtualizeRows, filteredSortedData.length]);

	const rowVirtualizer = useWindowVirtualizer({
		count: filteredSortedData.length,
		estimateSize: () => 52,
		overscan: 8,
		scrollMargin,
		scrollPaddingStart: stickyHeaderOffset,
		enabled: shouldVirtualizeRows,
	});
	useEffect(() => {
		const sortSignature = `${sortField}:${sortDirection}`;
		if (previousSortRef.current === sortSignature) return;
		previousSortRef.current = sortSignature;
		if (!shouldVirtualizeRows || filteredSortedData.length === 0) return;
		rowVirtualizer.scrollToIndex(0, { align: "start" });
	}, [
		filteredSortedData,
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
		: filteredSortedData.map((_, index) => ({ index }));
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
	const renderProvider = (provider: {
		name: string;
		id: string;
		inputPrice: number;
		outputPrice: number;
		features: string[];
	}) => {
		const isLinked = provider.id && provider.id !== "unlinked";

		const logo = (
			<div className="w-6 h-6 relative flex items-center justify-center rounded-md border">
				<div className="w-4 h-4 relative">
					{isLinked ? (
						<Logo
							id={provider.id}
							alt={provider.name}
							className="object-contain"
							fill
						/>
					) : (
						<span className="text-xs text-muted-foreground">-</span>
					)}
				</div>
			</div>
		);

		const name = (
			<span className="text-xs">
				{provider.name && provider.name.toLowerCase() !== "unlinked"
					? provider.name
					: "-"}
			</span>
		);

		if (!isLinked) {
			return <span className="text-xs">-</span>;
		}

		return (
			<div className="flex items-center gap-2">
				<Link
					href={`/api-providers/${provider.id}`}
					className="inline-flex cursor-pointer"
				>
					{logo}
				</Link>
				<Link
					href={`/api-providers/${provider.id}`}
					className="text-xs hover:underline underline-offset-2 decoration-[1px]"
				>
					{name}
				</Link>
			</div>
		);
	};

	const renderPrice = (price: number) => {
		return price > 0
			? new Intl.NumberFormat(locale, {
					style: "currency",
					currency: "USD",
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}).format(price)
			: "-";
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
		return new Date(dateStr).toLocaleDateString(locale);
	};

	const formatEndpoint = (endpoint?: string) => {
		const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
		return trimmed ? trimmed : "-";
	};

	const formatTokenCount = (value: number): string => {
		if (!Number.isFinite(value) || value < 0) return "-";
		return new Intl.NumberFormat(locale, {
			notation: "compact",
			maximumFractionDigits: 2,
		}).format(value);
	};

	const renderLoadingRows = () =>
		Array.from({ length: TABLE_LOADING_SKELETON_ROWS }).map((_, rowIndex) => (
			<TableRow key={`table-loading-row-${rowIndex}`} aria-hidden>
				<TableCell>
					<div className="flex items-center gap-2">
						<Skeleton className="h-6 w-6 rounded-md" />
						<div className="space-y-1">
							<Skeleton className="h-3 w-28" />
							<Skeleton className="h-3 w-36" />
						</div>
					</div>
				</TableCell>
				<TableCell>
					<div className="flex items-center gap-2">
						<Skeleton className="h-6 w-6 rounded-md" />
						<Skeleton className="h-3 w-16" />
					</div>
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-4 w-4 rounded-full" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-24" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-12" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-12" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-14" />
				</TableCell>
				<TableCell>
					<div className="flex items-center justify-center gap-1">
						<Skeleton className="h-6 w-6 rounded-md" />
						<Skeleton className="h-6 w-6 rounded-md" />
						<Skeleton className="h-6 w-6 rounded-md" />
					</div>
				</TableCell>
				<TableCell>
					<div className="flex items-center justify-center gap-1">
						<Skeleton className="h-6 w-6 rounded-md" />
						<Skeleton className="h-6 w-6 rounded-md" />
					</div>
				</TableCell>
				<TableCell>
					<div className="flex items-center justify-center gap-1">
						<Skeleton className="h-6 w-6 rounded-md" />
						<Skeleton className="h-6 w-6 rounded-md" />
					</div>
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-14" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-14" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-12" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-16" />
				</TableCell>
				<TableCell className="text-center">
					<Skeleton className="mx-auto h-3 w-16" />
				</TableCell>
			</TableRow>
		));

	return (
		<div className="space-y-4">
			{/* Table */}
			<div className="relative">
				<div
					className="sticky z-30 w-full overflow-hidden bg-background"
					style={{ top: `${stickyHeaderOffset}px` }}
				>
					<div
						ref={tableHeaderTrackRef}
						className="will-change-transform"
						style={{
							width: `${TABLE_TOTAL_WIDTH}px`,
							minWidth: `${TABLE_TOTAL_WIDTH}px`,
						}}
					>
						<Table
							wrapInContainer={false}
							aria-label={t("modelsTable")}
							className="table-fixed w-max bg-background text-xs"
							style={{
								width: `${TABLE_TOTAL_WIDTH}px`,
								minWidth: `${TABLE_TOTAL_WIDTH}px`,
							}}
						>
							<colgroup>
								{TABLE_COLUMN_WIDTHS.map((width, index) => (
									<col
										key={`header-col-${index}`}
										style={{ width: `${width}px` }}
									/>
								))}
							</colgroup>
							<TableHeader>
								<TableRow className="bg-background hover:bg-background">
							<TableHead className="bg-background min-w-48">
								{renderSortHead(t("context.model"), "model")}
							</TableHead>
							<TableHead className="bg-background min-w-32">
								{renderSortHead(t("context.provider"), "provider")}
							</TableHead>
							<TableHead className="bg-background min-w-16">
								<HoverCard openDelay={1000} closeDelay={120}>
									<HoverCardTrigger asChild>
										{renderSortHead(sectionsT("gatewayStatus"), "status")}
									</HoverCardTrigger>
									<HoverCardContent align="start" className="w-52 p-3">
										<div className="space-y-2">
											<p className="text-[11px] font-medium text-muted-foreground">
												{t("statusKeyLabel")}
											</p>
											<div className="space-y-1.5">
												{statusLegendOrder.map((statusKey) => {
													const statusMeta = statusMetaByKey[statusKey];
													if (!statusMeta) return null;
													const IconComponent = statusMeta.icon;
													return (
														<div
															key={statusKey}
															className="flex items-center gap-2 text-xs"
														>
															<IconComponent
																className={`h-3.5 w-3.5 ${statusMeta.color}`}
															/>
															<span>
																{t(`providerStatus.${statusKey}` as never)}
															</span>
														</div>
													);
												})}
											</div>
											<p className="text-[11px] text-muted-foreground">
								{t("statusAppliesToRowCapability")}
											</p>
										</div>
									</HoverCardContent>
								</HoverCard>
							</TableHead>
							<TableHead className="bg-background min-w-24 text-center">
								{renderSortHead(t("capabilityLabel"), "endpoint", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(pricingT("inputPrice"), "inputPrice", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(pricingT("outputPrice"), "outputPrice", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-16 text-center">
								{renderSortHead(t("tier"), "tier", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-32 text-center">
								<div className="text-xs font-semibold">{modelsUiT("inputModalities")}</div>
							</TableHead>
							<TableHead className="bg-background min-w-32 text-center">
								<div className="text-xs font-semibold">{modelsUiT("outputModalities")}</div>
							</TableHead>
							<TableHead className="bg-background min-w-24 text-center">
								<div className="text-xs font-semibold">{modelsUiT("features")}</div>
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(comparisonT("context"), "context", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(sectionsT("maxOutput"), "maxOutput", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(t("tableHeaders.weeklyTokens"), "weeklyTokens", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(t("actionAdded"), "added", "center")}
							</TableHead>
							<TableHead className="bg-background min-w-20 text-center">
								{renderSortHead(t("tableHeaders.retired"), "retired", "center")}
							</TableHead>
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
						className="table-fixed w-max bg-background text-xs"
						style={{
							width: `${TABLE_TOTAL_WIDTH}px`,
							minWidth: `${TABLE_TOTAL_WIDTH}px`,
						}}
					>
						<colgroup>
							{TABLE_COLUMN_WIDTHS.map((width, index) => (
								<col key={`body-col-${index}`} style={{ width: `${width}px` }} />
							))}
						</colgroup>
					<TableBody className="bg-background">
						{loading ? (
							<>{renderLoadingRows()}</>
						) : filteredSortedData.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={TABLE_COLUMNS_COUNT}
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
											colSpan={TABLE_COLUMNS_COUNT}
											style={{ height: `${paddingTop}px` }}
											className="bg-background p-0"
										/>
									</TableRow>
								) : null}
								{rowsToRender.map((virtualRowLike) => {
									const item = filteredSortedData[virtualRowLike.index];
									if (!item) return null;
									return (
										<TableRow key={item.id}>
											<TableCell className="font-medium">
												{renderModel(
													item.model,
													item.organisationId,
													item.modelId,
												)}
											</TableCell>
											<TableCell>{renderProvider(item.provider)}</TableCell>
											<TableCell className="text-center">
												{renderStatus(item.gatewayStatus, item.endpoint)}
											</TableCell>
											<TableCell className="text-center">
												<span
													className="block truncate font-mono text-[11px]"
													title={formatEndpoint(item.endpoint)}
												>
													{formatEndpoint(item.endpoint)}
												</span>
											</TableCell>
											<TableCell className="font-mono text-center">
												{renderPrice(item.provider.inputPrice)}
											</TableCell>
											<TableCell className="font-mono text-center">
												{renderPrice(item.provider.outputPrice)}
											</TableCell>
											<TableCell className="text-center">
												{renderTier(item.tier)}
											</TableCell>
											<TableCell className="text-center">
												{renderModalities(item.inputModalities, "input")}
											</TableCell>
											<TableCell className="text-center">
												{renderModalities(item.outputModalities, "output")}
											</TableCell>
											<TableCell className="text-center">
												{renderFeatures(item.provider.features)}
											</TableCell>
											<TableCell className="font-mono text-center">
												{item.context > 0 ? item.context.toLocaleString(locale) : "-"}
											</TableCell>
											<TableCell className="font-mono text-center">
												{item.maxOutput > 0
													? item.maxOutput.toLocaleString(locale)
													: "-"}
											</TableCell>
											<TableCell className="font-mono text-center">
												{formatTokenCount(item.popularityTokensWeek ?? 0)}
											</TableCell>
											<TableCell className="text-xs text-center">
												{item.added ? formatDate(item.added) : "-"}
											</TableCell>
											<TableCell className="text-xs text-center">
												{item.retired ? formatDate(item.retired) : "-"}
											</TableCell>
										</TableRow>
									);
								})}
								{paddingBottom > 0 ? (
									<TableRow aria-hidden>
										<TableCell
											colSpan={TABLE_COLUMNS_COUNT}
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
						{t("rowCount", { formattedCount: totalItems.toLocaleString(locale) })}
					</span>
					<span aria-hidden>·</span>
					<span>{t("rowsRenderedOnDemand")}</span>
				</div>
			)}
		</div>
	);
}
