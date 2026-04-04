"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	AlignCenter,
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	AudioLines,
	BadgeCheck,
	Ban,
	Brain,
	Braces,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Database,
	FileDigit,
	FileUp,
	Globe,
	ImageDown,
	ImageUp,
	ShieldAlert,
	ShieldCheck,
	Video,
	Wrench,
	XCircle,
	type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/Logo";

import Link from "next/link";
import { useQueryState } from "nuqs";
import { featureLabels } from "@/lib/config/featureLabels";

const MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"moderations",
	"embeddings",
] as const;

type ModalityConfig = {
	input: LucideIcon;
	output: LucideIcon;
	color: string;
	label: string;
};

const modalityIcons: Record<string, ModalityConfig> = {
	text: {
		input: AlignCenter,
		output: AlignCenter,
		color: "text-gray-600",
		label: "Text",
	},
	image: {
		input: ImageUp,
		output: ImageDown,
		color: "text-blue-600",
		label: "Image",
	},
	video: {
		input: Video,
		output: Video,
		color: "text-purple-600",
		label: "Video",
	},
	audio: {
		input: AudioLines,
		output: AudioLines,
		color: "text-pink-600",
		label: "Audio",
	},
	moderations: {
		input: ShieldCheck,
		output: ShieldAlert,
		color: "text-red-600",
		label: "Moderations",
	},
	embeddings: {
		input: FileDigit,
		output: FileDigit,
		color: "text-orange-600",
		label: "Embeddings",
	},
	file: {
		input: FileUp,
		output: FileUp,
		color: "text-green-600",
		label: "File",
	},
	multimodal: {
		input: Globe,
		output: Globe,
		color: "text-indigo-600",
		label: "Multimodal",
	},
	code: {
		input: Braces,
		output: Braces,
		color: "text-cyan-600",
		label: "Code",
	},
	function: {
		input: Wrench,
		output: Wrench,
		color: "text-yellow-600",
		label: "Function",
	},
};

function normalizeModality(value: string): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return "";
	if (normalized === "vision") return "image";
	if (normalized === "speech") return "audio";
	if (normalized === "moderation") return "moderations";
	if (normalized === "embedding") return "embeddings";
	return normalized;
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

function formatStatusLabel(status: string): string {
	const normalized = normalizeStatusValue(status);
	if (!normalized) return "Unknown";
	const mapped = statusMetaByKey[normalized];
	if (mapped) return mapped.label;
	return normalized
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
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
	tools: { icon: Wrench, color: "text-yellow-600" },
	reasoning: { icon: Brain, color: "text-indigo-600" },
	structured_outputs: { icon: Braces, color: "text-cyan-600" },
	caching: { icon: Database, color: "text-emerald-600" },
	web_search: { icon: Globe, color: "text-blue-500" },
	moderated: { icon: ShieldAlert, color: "text-red-500" },
	free: { icon: BadgeCheck, color: "text-emerald-600" },
};

const statusMetaByKey: Record<
	string,
	{ icon: LucideIcon; color: string; label: string }
> = {
	active: { icon: CheckCircle2, color: "text-green-600", label: "Active" },
	inactive: { icon: XCircle, color: "text-zinc-500", label: "Inactive" },
	not_active: { icon: XCircle, color: "text-zinc-500", label: "Inactive" },
	not_listed: { icon: XCircle, color: "text-zinc-500", label: "Not Listed" },
	deranked_lvl1: {
		icon: AlertTriangle,
		color: "text-amber-500",
		label: "Deranked Level 1",
	},
	deranked_lvl2: {
		icon: AlertTriangle,
		color: "text-amber-600",
		label: "Deranked Level 2",
	},
	deranked_lvl3: {
		icon: AlertTriangle,
		color: "text-red-500",
		label: "Deranked Level 3",
	},
	disabled: { icon: Ban, color: "text-red-600", label: "Disabled" },
};
const statusLegendOrder = [
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"disabled",
	"inactive",
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
	120, // Features
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
	};
	endpoint: string;
	gatewayStatus: string;
	inputModalities: string[]; // text, image, video, audio, file, embeddings
	outputModalities: string[]; // text, image, video, audio
	context: number; // context window in tokens
	maxOutput: number; // max output tokens
	quantization?: string; // quantization level
	tier?: string; // pricing tier
	added?: string; // date added
	retired?: string; // when this model is retired
	popularityTokensWeek?: number;
}

// Props for the datatable component
interface MonitorDataTableProps {
	data: ModelData[];
	loading?: boolean;
}

export function MonitorDataTable({
	data,
	loading = false,
}: MonitorDataTableProps) {
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

	const [selectedEndpoints] = useQueryState("endpoints", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedStatuses] = useQueryState("statuses", {
		defaultValue: [],
		parse: (value) =>
			value
				? value
						.split(",")
						.map((part) => normalizeStatusValue(part))
						.filter(Boolean)
				: [],
		serialize: (value) =>
			value.map((part) => normalizeStatusValue(part)).filter(Boolean).join(","),
	});

	const [selectedTiers] = useQueryState("tiers", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

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

	const [page, setPage] = useQueryState("page", {
		defaultValue: 1,
		parse: (value) => {
			const parsed = Number.parseInt(value || "1", 10);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
		},
		serialize: (value) => String(value),
	});

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
		if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
		return sortDirection === "asc" ? (
			<ArrowUp className="h-4 w-4" />
		) : (
			<ArrowDown className="h-4 w-4" />
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
									String(v)
										.toLowerCase()
										.includes(searchLower),
								);
							}
							return String(nestedValue)
								.toLowerCase()
								.includes(searchLower);
						});
					}
					return String(value).toLowerCase().includes(searchLower);
				});
				if (!matchesSearch) return false;
			}

			if (yearSelected && yearSelected > 0) {
				const itemYear = item.added
					? new Date(item.added).getFullYear()
					: null;
				if (itemYear !== yearSelected) return false;
			}

			if (selectedInputModalities.length > 0) {
				const hasAllInputModalities = selectedInputModalities.every(
					(mod) => item.inputModalities.includes(mod),
				);
				if (!hasAllInputModalities) return false;
			}

			if (selectedOutputModalities.length > 0) {
				const hasAllOutputModalities = selectedOutputModalities.every(
					(mod) => item.outputModalities.includes(mod),
				);
				if (!hasAllOutputModalities) return false;
			}

			if (selectedFeatures.length > 0) {
				const hasAllFeatures = selectedFeatures.every((feat) =>
					item.provider.features.includes(feat),
				);
				if (!hasAllFeatures) return false;
			}

			if (selectedEndpoints.length > 0) {
				if (!selectedEndpoints.includes(item.endpoint)) return false;
			}

			if (selectedStatuses.length > 0) {
				const normalizedStatus = normalizeStatusValue(item.gatewayStatus);
				if (!selectedStatuses.includes(normalizedStatus)) return false;
			}

			if (selectedTiers.length > 0) {
				if (!item.tier || !selectedTiers.includes(item.tier))
					return false;
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
					return sortDirection === "asc"
						? aDate - bDate
						: bDate - aDate;
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
				return sortDirection === "asc"
					? aValue - bValue
					: bValue - aValue;
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
		selectedEndpoints,
		selectedStatuses,
		selectedTiers,
		sortField,
		sortDirection,
	]);

	const PAGE_SIZE = 250;
	const totalItems = filteredSortedData.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);

	const filterKey = [
		searchQuery,
		yearSelected,
		selectedInputModalities.join(","),
		selectedOutputModalities.join(","),
		selectedFeatures.join(","),
		selectedEndpoints.join(","),
		selectedStatuses.join(","),
		selectedTiers.join(","),
		sortField,
		sortDirection,
	].join("|");
	const prevFilterKey = useRef(filterKey);

	useEffect(() => {
		if (safePage !== page) {
			setPage(safePage);
		}
	}, [page, safePage, setPage]);

	useEffect(() => {
		if (prevFilterKey.current !== filterKey) {
			prevFilterKey.current = filterKey;
			if (page !== 1) {
				setPage(1);
			}
		}
	}, [filterKey, page, setPage]);

	const pageStart = (safePage - 1) * PAGE_SIZE;
	const pageData = filteredSortedData.slice(pageStart, pageStart + PAGE_SIZE);
	const tableContainerRef = useRef<HTMLDivElement | null>(null);
	const shouldVirtualizeRows = pageData.length > 60;
	const [scrollMargin, setScrollMargin] = useState(0);
	const lastNonEmptyVirtualRowsRef = useRef<Array<{ index: number }>>([]);

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
	}, [shouldVirtualizeRows, pageData.length]);

	const rowVirtualizer = useWindowVirtualizer({
		count: pageData.length,
		estimateSize: () => 52,
		overscan: 20,
		scrollMargin,
		enabled: shouldVirtualizeRows,
	});
	const virtualRows = rowVirtualizer.getVirtualItems();
	useEffect(() => {
		lastNonEmptyVirtualRowsRef.current = [];
	}, [safePage, pageData.length]);
	if (virtualRows.length > 0) {
		lastNonEmptyVirtualRowsRef.current = virtualRows.map((row) => ({
			index: row.index,
		}));
	}
	const rowsToRender = shouldVirtualizeRows
		? (virtualRows.length > 0
				? virtualRows.map((row) => ({ index: row.index }))
				: lastNonEmptyVirtualRowsRef.current)
		: pageData.map((_, index) => ({ index }));
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
									alt="Organisation logo"
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
						<span className="block cursor-pointer truncate">
							{model}
						</span>
					</Link>
				) : (
					<span className="block min-w-0 flex-1 truncate text-xs font-medium" title={model}>
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
		return price > 0 ? `$${price.toFixed(2)}` : "-";
	};

	const renderModalities = (
		modalities: string[],
		type: "input" | "output",
	) => {
		const sortedModalities = sortModalities(modalities);
		return (
			<div className="flex flex-wrap gap-1 justify-center">
				{sortedModalities.map((modality) => {
					const iconConfig = modalityIcons[modality];
					if (!iconConfig) return null;

					const IconComponent =
						type === "input" ? iconConfig.input : iconConfig.output;

					// Convert text color to border/background color
					const colorMap: Record<string, string> = {
						"text-blue-600": "border-blue-600 bg-blue-50",
						"text-purple-600": "border-purple-600 bg-purple-50",
						"text-green-600": "border-green-600 bg-green-50",
						"text-orange-600": "border-orange-600 bg-orange-50",
						"text-red-600": "border-red-600 bg-red-50",
						"text-pink-600": "border-pink-600 bg-pink-50",
						"text-gray-600": "border-gray-600 bg-gray-50",
						"text-indigo-600": "border-indigo-600 bg-indigo-50",
						"text-cyan-600": "border-cyan-600 bg-cyan-50",
						"text-yellow-600": "border-yellow-600 bg-yellow-50",
					};

					const borderClass =
						colorMap[iconConfig.color] ||
						"border-gray-600 bg-gray-50";

					return (
						<Tooltip key={modality}>
							<TooltipTrigger asChild>
								<div
									className={`inline-flex items-center justify-center w-6 h-6 rounded border ${borderClass}`}
								>
									<IconComponent
										className={`h-4 w-4 ${iconConfig.color}`}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p>{iconConfig.label}</p>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		);
	};

	const renderFeatures = (features: string[]) => {
		return (
			<div className="flex flex-wrap gap-1 justify-center">
				{features.map((feature) => {
					const rawKey = feature
						.trim()
						.toLowerCase()
						.replace(/\s+/g, "_");
					const key =
						rawKey === "native_web_search"
							? "web_search"
							: rawKey === "structured_output"
								? "structured_outputs"
								: rawKey;
					const iconConfig =
						featureIcons[key as keyof typeof featureIcons];
					if (!iconConfig) return null;

					const IconComponent = iconConfig.icon;
					if (!IconComponent) return null;

					// Convert text color to border/background color
					const colorMap: Record<string, string> = {
						"text-yellow-600": "border-yellow-600 bg-yellow-50",
						"text-indigo-600": "border-indigo-600 bg-indigo-50",
						"text-cyan-600": "border-cyan-600 bg-cyan-50",
						"text-emerald-600": "border-emerald-600 bg-emerald-50",
						"text-blue-500": "border-blue-500 bg-blue-50",
						"text-red-500": "border-red-500 bg-red-50",
					};

					const borderClass =
						colorMap[iconConfig.color] ||
						"border-gray-600 bg-gray-50";

					return (
						<Tooltip key={feature}>
							<TooltipTrigger asChild>
								<div
									className={`inline-flex items-center justify-center w-6 h-6 rounded border ${borderClass}`}
								>
									<IconComponent
										className={`h-4 w-4 ${iconConfig.color}`}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p>{featureLabels[key] ?? feature}</p>
							</TooltipContent>
						</Tooltip>
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
		const label = formatStatusLabel(status);
		const endpointLabel = formatEndpoint(endpoint);

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="inline-flex items-center justify-center w-6 h-6">
						{IconComponent && (
							<IconComponent
								className={`h-4 w-4 ${iconConfig.color}`}
							/>
						)}
					</div>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					<p className="font-medium">{label}</p>
					<p className="text-muted-foreground">
						Capability: <span className="font-mono">{endpointLabel}</span>
					</p>
					<p className="text-muted-foreground">
						Status is capability-specific, not provider-wide.
					</p>
				</TooltipContent>
			</Tooltip>
		);
	};

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString();
	};

	const formatEndpoint = (endpoint?: string) => {
		const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
		return trimmed ? trimmed : "-";
	};

	const formatTokenCount = (value: number): string => {
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

	const getPaginationRange = (current: number, total: number, delta = 1) => {
		if (total <= 1) return [1];

		const range: Array<number | "ellipsis"> = [];
		const left = Math.max(2, current - delta);
		const right = Math.min(total - 1, current + delta);

		range.push(1);
		if (left > 2) range.push("ellipsis");
		for (let page = left; page <= right; page += 1) {
			range.push(page);
		}
		if (right < total - 1) range.push("ellipsis");
		range.push(total);

		return range;
	};

	const paginationRange = getPaginationRange(safePage, totalPages, 1);

	return (
		<TooltipProvider>
			<div className="space-y-4">
				{/* Table */}
				<div ref={tableContainerRef} className="relative overflow-x-auto">
					<Table
						className="table-fixed w-max bg-background text-xs"
						style={{
							width: `${TABLE_TOTAL_WIDTH}px`,
							minWidth: `${TABLE_TOTAL_WIDTH}px`,
						}}
					>
						<colgroup>
							{TABLE_COLUMN_WIDTHS.map((width, index) => (
								<col key={`col-${index}`} style={{ width: `${width}px` }} />
							))}
						</colgroup>
						<TableHeader>
							<TableRow className="bg-background">
								<TableHead className="bg-background min-w-48">
									<Button
										variant="ghost"
										onClick={() => handleSort("model")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Model {getSortIcon("model")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-32">
									<Button
										variant="ghost"
										onClick={() => handleSort("provider")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Provider {getSortIcon("provider")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-16">
									<HoverCard openDelay={1000} closeDelay={120}>
										<HoverCardTrigger asChild>
											<Button
												variant="ghost"
												onClick={() => handleSort("status")}
												className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
											>
												Gateway Status {getSortIcon("status")}
											</Button>
										</HoverCardTrigger>
										<HoverCardContent align="start" className="w-52 p-3">
											<div className="space-y-2">
												<p className="text-[11px] font-medium text-muted-foreground">
													Status Key
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
																<span>{statusMeta.label}</span>
															</div>
														);
													})}
												</div>
												<p className="text-[11px] text-muted-foreground">
													Applies to the row capability.
												</p>
											</div>
										</HoverCardContent>
									</HoverCard>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("endpoint")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Capability {getSortIcon("endpoint")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("inputPrice")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Input $ {getSortIcon("inputPrice")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("outputPrice")
										}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Output $ {getSortIcon("outputPrice")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-16 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("tier")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Tier {getSortIcon("tier")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-32 text-center">
									<div className="text-xs font-semibold">
										Input Modalities
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-32 text-center">
									<div className="text-xs font-semibold">
										Output Modalities
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center">
									<div className="text-xs font-semibold">
										Features
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("context")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Context {getSortIcon("context")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("maxOutput")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Max Output {getSortIcon("maxOutput")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("weeklyTokens")
										}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Weekly Tokens {getSortIcon("weeklyTokens")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("added")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Added {getSortIcon("added")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center">
									<Button
										variant="ghost"
										onClick={() => handleSort("retired")}
										className="h-auto p-0 text-xs font-semibold hover:underline underline-offset-2"
									>
										Retired {getSortIcon("retired")}
									</Button>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody className="bg-background">
							{loading ? (
								<>{renderLoadingRows()}</>
							) : filteredSortedData.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={TABLE_COLUMNS_COUNT}
										className="text-center py-8"
									>
										No models match the current filters
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
										const item = pageData[virtualRowLike.index];
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
													{renderStatus(
														item.gatewayStatus,
														item.endpoint,
													)}
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
												<TableCell className="text-center capitalize">
													{item.tier || "standard"}
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
													{item.context > 0
														? item.context.toLocaleString()
														: "-"}
												</TableCell>
												<TableCell className="font-mono text-center">
													{item.maxOutput > 0
														? item.maxOutput.toLocaleString()
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

				{loading ? (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Skeleton className="h-3 w-40" />
						<div className="flex items-center gap-1">
							<Skeleton className="h-8 w-8 rounded-md" />
							<Skeleton className="h-8 w-8 rounded-md" />
							<Skeleton className="h-8 w-8 rounded-md" />
							<Skeleton className="h-8 w-8 rounded-md" />
							<Skeleton className="h-8 w-8 rounded-md" />
						</div>
					</div>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
						<div>
							Showing {totalItems === 0 ? 0 : pageStart + 1}-
							{Math.min(pageStart + PAGE_SIZE, totalItems)} of{" "}
							{totalItems}
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage(Math.max(1, safePage - 1))}
								disabled={safePage <= 1}
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<div className="flex items-center gap-1">
								{paginationRange.map((entry, index) => {
									if (entry === "ellipsis") {
										return (
											<span
												key={`ellipsis-${index}`}
												className="px-2 text-muted-foreground"
											>
												...
											</span>
										);
									}
									const pageNumber = entry;
									const isActive = pageNumber === safePage;
									return (
										<Button
											key={pageNumber}
											variant={
												isActive ? "default" : "outline"
											}
											size="sm"
											onClick={() => setPage(pageNumber)}
											disabled={isActive}
											className="h-8 w-8 px-0"
										>
											{pageNumber}
										</Button>
									);
								})}
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setPage(Math.min(totalPages, safePage + 1))
								}
								disabled={safePage >= totalPages}
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}


