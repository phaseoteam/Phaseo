"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { debounce, useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import {
	Search,
	Grid as GridIcon,
	Table as TableIcon,
	Layers as LayersIcon,
	SlidersHorizontal,
	Activity,
	ArrowDownCircle,
	ArrowUpCircle,
	ArrowUpDown,
	Captions,
	CircleDot,
	FileText,
	Headphones,
	Music4,
	Route,
	Sparkles,
	Speech,
	Text as TextIcon,
	ImageIcon,
	Video,
	CalendarDays,
	Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { featureLabels } from "@/lib/config/featureLabels";
import type { MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { MonitorTableClient } from "@/components/monitor/MonitorTableClient";

type OptionCount = {
	value: string;
	count: number;
};

const MODALITY_FILTER_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"audio_tts",
	"audio_stt",
	"audio_music",
	"file",
	"moderations",
	"rerank",
	"embeddings",
] as const;

const STATUS_FILTER_DISPLAY_ORDER = [
	"active",
	"coming_soon",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"inactive",
	"disabled",
] as const;

interface ModelsTableDisplayProps {
	initialModelData: MonitorModelData[];
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allStatuses: string[];
	allTiers: string[];
	weeklyTokensByModel: Record<string, number>;
	weeklyTokensByModelProvider: Record<string, number>;
}

function parseCsvParam(value: string | null): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function normalizeModalityFilterValue(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._/-]+/g, " ");
	if (!normalized) return "";
	if (normalized.includes("text")) return "text";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
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
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("file")) return "file";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("embed")) return "embeddings";
	return normalized.replace(/\s+/g, "_");
}

function parseModalityParam(value: string | null): string[] {
	return Array.from(
		new Set(
			parseCsvParam(value)
				.map((part) => normalizeModalityFilterValue(part))
				.filter(Boolean),
		),
	);
}

function normalizeStatusFilterValue(value: string): string {
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

function serializeCsvParam(values: string[]): string {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	).join(",");
}

function parseStatusesParam(value: string | null): string[] {
	return Array.from(
		new Set(
			parseCsvParam(value)
				.map((part) => normalizeStatusFilterValue(part))
				.filter(Boolean),
		),
	);
}

function parseYearParam(value: string | null): number {
	const parsed = Number.parseInt(String(value ?? "0"), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toggleInList(current: string[], value: string): string[] {
	const next = new Set(current);
	if (next.has(value)) {
		next.delete(value);
	} else {
		next.add(value);
	}
	return Array.from(next);
}

function toTitleCase(value: string): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "audio_stt") return "Transcription";
	if (normalized === "audio_tts") return "Speech";
	if (normalized === "audio_music") return "Music";
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[._/-]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((word) =>
			word.length > 0
				? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`
				: word,
		)
		.join(" ");
}

function formatStatusLabel(value: string): string {
	const normalized = normalizeStatusFilterValue(value);
	if (normalized === "active") return "Active On Gateway";
	if (normalized === "inactive") return "Not Active";
	if (normalized === "deranked_lvl1") return "Deranked Level 1";
	if (normalized === "deranked_lvl2") return "Deranked Level 2";
	if (normalized === "deranked_lvl3") return "Deranked Level 3";
	if (normalized === "disabled") return "Disabled";
	return toTitleCase(normalized);
}

function getModalityIcon(modality: string): LucideIcon {
	const normalized = modality.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return ArrowUpDown;
	}
	if (normalized.includes("image")) return ImageIcon;
	if (normalized.includes("video")) return Video;
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
	if (normalized.includes("audio")) return Headphones;
	if (normalized.includes("file")) return FileText;
	if (normalized.includes("text")) return TextIcon;
	return CircleDot;
}

function FilterCheckboxList({
	options,
	selected,
	onToggle,
	labelForValue,
	iconForValue,
	toneForValue,
	collapsedLimit,
}: {
	options: OptionCount[];
	selected: string[];
	onToggle: (value: string) => void;
	labelForValue?: (value: string) => string;
	iconForValue?: (value: string) => LucideIcon;
	toneForValue?: (value: string) => ReturnType<typeof getModalityTone>;
	collapsedLimit?: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const canCollapse =
		Number.isFinite(collapsedLimit) &&
		Number(collapsedLimit) > 0 &&
		options.length > Number(collapsedLimit);
	const visibleOptions =
		canCollapse && !expanded
			? options.slice(0, Number(collapsedLimit))
			: options;
	const hiddenCount = options.length - visibleOptions.length;

	return (
		<div className="space-y-1.5">
			{options.length === 0 ? (
				<div className="px-2 text-xs text-muted-foreground">No options</div>
			) : (
				visibleOptions.map((option) => {
					const checked = selected.includes(option.value);
					const label = labelForValue
						? labelForValue(option.value)
						: toTitleCase(option.value);
					const Icon = iconForValue?.(option.value);
					const tone = toneForValue?.(option.value);

					return (
						<button
							key={option.value}
							type="button"
							onClick={() => onToggle(option.value)}
							className={cn(
								"group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
								checked
									? "bg-muted/45 text-foreground hover:bg-muted/55"
									: "hover:bg-muted/50",
							)}
							aria-pressed={checked}
						>
							<span className="flex items-center gap-2 min-w-0">
								{Icon ? (
									tone ? (
										<span
											className={cn(
												"inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors",
												tone.sidebarIconHoverClassName,
												checked && tone.sidebarIconSelectedClassName,
											)}
										>
											<Icon className="h-3 w-3" />
										</span>
									) : (
										<Icon
											className={cn(
												"h-3.5 w-3.5 shrink-0",
												checked ? "text-primary" : "text-muted-foreground",
											)}
										/>
									)
								) : null}
								<span className="text-sm truncate">{label}</span>
							</span>
							<span
								className={cn(
									"inline-flex min-w-5 shrink-0 justify-center text-[11px] tabular-nums",
									checked ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{option.count}
							</span>
						</button>
					);
				})
			)}
			{canCollapse ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 w-full justify-center text-xs"
					onClick={() => setExpanded((current) => !current)}
				>
					{expanded ? "Show Less" : `Show More (${hiddenCount})`}
				</Button>
			) : null}
		</div>
	);
}

function getOptionCounts(
	values: string[],
	countsMap: Map<string, number>,
): OptionCount[] {
	return values
		.map((value) => ({ value, count: countsMap.get(value) ?? 0 }))
		.filter((option) => option.count > 0);
}

function getModalityOptions(
	countsMap: Map<string, number>,
	values: string[],
): OptionCount[] {
	const canonical = MODALITY_FILTER_DISPLAY_ORDER.map((value) => ({
		value,
		count: countsMap.get(value) ?? 0,
	})).filter((option) => option.count > 0);

	const known = new Set<string>(MODALITY_FILTER_DISPLAY_ORDER);
	const normalizedValues = Array.from(
		new Set(values.map((value) => normalizeModalityFilterValue(value)).filter(Boolean)),
	);
	const additional = normalizedValues
		.filter((value) => !known.has(value))
		.map((value) => ({ value, count: countsMap.get(value) ?? 0 }))
		.filter((option) => option.count > 0)
		.sort((a, b) => {
			if (a.count !== b.count) return b.count - a.count;
			return a.value.localeCompare(b.value);
		});

	return [...canonical, ...additional];
}

export default function ModelsTableDisplay({
	initialModelData,
	allEndpoints,
	allModalities,
	allFeatures,
	allStatuses,
	allTiers,
	weeklyTokensByModel,
	weeklyTokensByModelProvider,
}: ModelsTableDisplayProps) {
	const [search, setSearch] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
		clearOnDefault: true,
		shallow: true,
	});
	const deferredSearch = useDeferredValue(search ?? "");
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

	const DEFAULT_OPEN_SECTIONS = ["gatewayStatus", "inputModalities", "outputModalities"];
	const [openFilterSections, setOpenFilterSections] = useState<string[]>([
		...DEFAULT_OPEN_SECTIONS,
	]);

	const [selectedStatuses, setSelectedStatuses] = useQueryState("statuses", {
		defaultValue: [] as string[],
		parse: parseStatusesParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [hasInteractedWithStatuses, setHasInteractedWithStatuses] = useState(
		selectedStatuses.length > 0,
	);
	const effectiveSelectedStatuses = useMemo(
		() =>
			!hasInteractedWithStatuses && selectedStatuses.length === 0
				? ["active"]
				: selectedStatuses,
		[hasInteractedWithStatuses, selectedStatuses],
	);
	const [selectedEndpoints, setSelectedEndpoints] = useQueryState("endpoints", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [selectedInputModalities, setSelectedInputModalities] = useQueryState(
		"inputModalities",
		{
			defaultValue: [] as string[],
			parse: parseModalityParam,
			serialize: serializeCsvParam,
			shallow: true,
			clearOnDefault: true,
		},
	);
	const [selectedOutputModalities, setSelectedOutputModalities] =
		useQueryState("outputModalities", {
			defaultValue: [] as string[],
			parse: parseModalityParam,
			serialize: serializeCsvParam,
			shallow: true,
			clearOnDefault: true,
		});
	const [selectedFeatures, setSelectedFeatures] = useQueryState("features", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [selectedTiers, setSelectedTiers] = useQueryState("tiers", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [yearSelected, setYearSelected] = useQueryState("year", {
		defaultValue: 0,
		parse: parseYearParam,
		serialize: (value) => String(value),
		shallow: true,
		clearOnDefault: true,
	});

	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isTable = pathname?.includes("/models/table");
	const isCollections = pathname?.includes("/models/collections");

	const isDefaultTiers = selectedTiers.length === 0;

	const counts = useMemo(() => {
		const inputMap = new Map<string, number>();
		const outputMap = new Map<string, number>();
		const featureMap = new Map<string, number>();
		const endpointMap = new Map<string, number>();
		const statusMap = new Map<string, number>();
		const tierMap = new Map<string, number>();
		const yearMap = new Map<string, number>();

		for (const item of initialModelData) {
			for (const modality of item.inputModalities ?? []) {
				const key = normalizeModalityFilterValue(String(modality ?? ""));
				if (!key) continue;
				inputMap.set(key, (inputMap.get(key) ?? 0) + 1);
			}
			for (const modality of item.outputModalities ?? []) {
				const key = normalizeModalityFilterValue(String(modality ?? ""));
				if (!key) continue;
				outputMap.set(key, (outputMap.get(key) ?? 0) + 1);
			}
			for (const feature of item.provider.features ?? []) {
				const key = String(feature ?? "").trim();
				if (!key) continue;
				featureMap.set(key, (featureMap.get(key) ?? 0) + 1);
			}
			const endpoint = String(item.endpoint ?? "").trim();
			if (endpoint) endpointMap.set(endpoint, (endpointMap.get(endpoint) ?? 0) + 1);

			const status = String(item.gatewayStatus ?? "").trim();
			const statusKey = normalizeStatusFilterValue(status);
			if (statusKey) {
				statusMap.set(statusKey, (statusMap.get(statusKey) ?? 0) + 1);
			}

			const tier = String(item.tier ?? "standard").trim();
			if (tier) tierMap.set(tier, (tierMap.get(tier) ?? 0) + 1);

			if (item.added) {
				const year = String(new Date(item.added).getFullYear());
				if (year !== "NaN") yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
			}
		}

		return {
			inputMap,
			outputMap,
			featureMap,
			endpointMap,
			statusMap,
			tierMap,
			yearMap,
		};
	}, [initialModelData]);

	const inputModalityOptions = useMemo(
		() => getModalityOptions(counts.inputMap, allModalities),
		[allModalities, counts.inputMap],
	);
	const outputModalityOptions = useMemo(
		() => getModalityOptions(counts.outputMap, allModalities),
		[allModalities, counts.outputMap],
	);
	const featureOptions = useMemo(
		() => getOptionCounts(allFeatures, counts.featureMap),
		[allFeatures, counts.featureMap],
	);
	const endpointOptions = useMemo(
		() => getOptionCounts(allEndpoints, counts.endpointMap),
		[allEndpoints, counts.endpointMap],
	);
	const statusOptions = useMemo(() => {
		const normalized = Array.from(
			new Set(
				allStatuses
					.map((value) => normalizeStatusFilterValue(value))
					.filter(Boolean),
			),
		);
		const known = new Set<string>(STATUS_FILTER_DISPLAY_ORDER);
		const preferred = STATUS_FILTER_DISPLAY_ORDER.filter((value) =>
			normalized.includes(value),
		);
		const rest = normalized
			.filter((value) => !known.has(value))
			.sort((a, b) => a.localeCompare(b));
		return getOptionCounts([...preferred, ...rest], counts.statusMap);
	}, [allStatuses, counts.statusMap]);
	const tierOptions = useMemo(() => {
		const uniqueTiers = Array.from(new Set(["standard", ...allTiers]));
		return getOptionCounts(uniqueTiers, counts.tierMap);
	}, [allTiers, counts.tierMap]);
	const yearOptions = useMemo(
		() =>
			Array.from(counts.yearMap.entries())
				.map(([value, count]) => ({ value, count }))
				.sort((a, b) => Number(b.value) - Number(a.value)),
		[counts.yearMap],
	);

	const shownCount = useMemo(() => {
		return initialModelData.filter((item) => {
			if (deferredSearch.trim()) {
				const searchLower = deferredSearch.trim().toLowerCase();
				const matchesSearch = Object.values(item).some((value) => {
					if (Array.isArray(value)) {
						return value.some((v) => String(v).toLowerCase().includes(searchLower));
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

			if (yearSelected > 0) {
				const itemYear = item.added ? new Date(item.added).getFullYear() : null;
				if (itemYear !== yearSelected) return false;
			}

			if (selectedInputModalities.length > 0) {
				const normalizedInputs = new Set(
					(item.inputModalities ?? [])
						.map((value) => normalizeModalityFilterValue(String(value ?? "")))
						.filter(Boolean),
				);
				const hasAllInputs = selectedInputModalities.every((mod) =>
					normalizedInputs.has(mod),
				);
				if (!hasAllInputs) return false;
			}

			if (selectedOutputModalities.length > 0) {
				const normalizedOutputs = new Set(
					(item.outputModalities ?? [])
						.map((value) => normalizeModalityFilterValue(String(value ?? "")))
						.filter(Boolean),
				);
				const hasAllOutputs = selectedOutputModalities.every((mod) =>
					normalizedOutputs.has(mod),
				);
				if (!hasAllOutputs) return false;
			}

			if (selectedFeatures.length > 0) {
				const hasAllFeatures = selectedFeatures.every((feat) =>
					item.provider.features.includes(feat),
				);
				if (!hasAllFeatures) return false;
			}

			if (selectedEndpoints.length > 0 && !selectedEndpoints.includes(item.endpoint)) {
				return false;
			}

			if (
				effectiveSelectedStatuses.length > 0 &&
				!effectiveSelectedStatuses.includes(
					normalizeStatusFilterValue(item.gatewayStatus),
				)
			) {
				return false;
			}

			if (selectedTiers.length > 0) {
				const tier = item.tier || "standard";
				if (!selectedTiers.includes(tier)) return false;
			}

			return true;
		}).length;
	}, [
		deferredSearch,
		initialModelData,
		selectedEndpoints,
		selectedFeatures,
		selectedInputModalities,
		selectedOutputModalities,
		effectiveSelectedStatuses,
		selectedTiers,
		yearSelected,
	]);

	const activeFilterCount =
		(hasInteractedWithStatuses ? selectedStatuses.length : 0) +
		selectedEndpoints.length +
		selectedInputModalities.length +
		selectedOutputModalities.length +
		selectedFeatures.length +
		(isDefaultTiers ? 0 : selectedTiers.length) +
		(yearSelected > 0 ? 1 : 0);

	const resetFilters = () => {
		setHasInteractedWithStatuses(false);
		setSelectedStatuses([]);
		setSelectedEndpoints([]);
		setSelectedInputModalities([]);
		setSelectedOutputModalities([]);
		setSelectedFeatures([]);
		setSelectedTiers([]);
		setYearSelected(0);
	};

	const buildHref = (path: string) => {
		const params = new URLSearchParams(searchParams?.toString() ?? "");

		if (path === "/models" || path === "/models/collections") {
			const searchValue = params.get("search") ?? "";
			if (searchValue.trim()) {
				params.set("q", searchValue);
			} else {
				params.delete("q");
			}
			params.delete("search");

			const statuses = parseStatusesParam(params.get("statuses"));
			if (statuses.length > 0) {
				const mapped = statuses.flatMap((status) => {
					if (status === "active") return ["active"];
					if (status === "coming_soon") return ["coming_soon"];
					if (status === "inactive") return ["not_active"];
					return [];
				});
				if (mapped.length > 0) {
					params.set("statuses", mapped.join(","));
				} else {
					params.delete("statuses");
				}
			}

			const year = parseYearParam(params.get("year"));
			if (year > 0) {
				params.set("years", String(year));
			} else {
				params.delete("years");
			}
			params.delete("year");

			params.delete("tiers");
			params.delete("sort");
			params.delete("dir");
			params.delete("page");
		}

		if (path === "/models/table") {
			const qValue = params.get("q") ?? "";
			if (qValue.trim()) {
				params.set("search", qValue);
			}
			params.delete("q");

			const statuses = parseStatusesParam(params.get("statuses"));
			if (statuses.length > 0) {
				params.set("statuses", statuses.join(","));
			}

			const years = parseCsvParam(params.get("years"));
			if (years.length > 0) {
				params.set("year", years[0] ?? "0");
			}
			params.delete("years");
		}

		const qs = params.toString();
		return qs ? `${path}?${qs}` : path;
	};

	const shownCountLabel = `${shownCount.toLocaleString()} shown`;
	const shownCountWithSearchLabel = deferredSearch
		? `${shownCountLabel} for "${deferredSearch}"`
		: shownCountLabel;

	const viewSwitcher = (
		<div className="inline-flex rounded-md overflow-hidden border bg-background">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						asChild
						variant={!isTable ? "default" : "outline"}
						className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
					>
						<Link href={buildHref("/models")} prefetch={false} aria-label="Card view">
							<GridIcon className="h-4 w-4" />
						</Link>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Card view</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						variant={isTable ? "default" : "outline"}
						className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
						asChild
					>
						<Link href={buildHref("/models/table")} prefetch={false} aria-label="Table view">
							<TableIcon className="h-4 w-4" />
						</Link>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Table view</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						variant={isCollections ? "default" : "outline"}
						className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
						asChild
					>
						<Link
							href={buildHref("/models/collections")}
							prefetch={false}
							aria-label="Collections view"
						>
							<LayersIcon className="h-4 w-4" />
						</Link>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Collections</TooltipContent>
			</Tooltip>
		</div>
	);

	const filtersContent = (
		<Accordion
			type="multiple"
			value={openFilterSections}
			onValueChange={setOpenFilterSections}
			className="w-full"
		>
			<AccordionItem value="gatewayStatus" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Activity className="h-4 w-4 text-muted-foreground" />
						Gateway Status
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={statusOptions}
						selected={effectiveSelectedStatuses}
						onToggle={(value) => {
							setHasInteractedWithStatuses(true);
							setSelectedStatuses(
								toggleInList(effectiveSelectedStatuses, value),
							);
						}}
						labelForValue={formatStatusLabel}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="inputModalities" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
						Input Modalities
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={inputModalityOptions}
						selected={selectedInputModalities}
						onToggle={(value) =>
							setSelectedInputModalities(toggleInList(selectedInputModalities, value))
						}
						iconForValue={getModalityIcon}
						labelForValue={toTitleCase}
						toneForValue={getModalityTone}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="outputModalities" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
						Output Modalities
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={outputModalityOptions}
						selected={selectedOutputModalities}
						onToggle={(value) =>
							setSelectedOutputModalities(toggleInList(selectedOutputModalities, value))
						}
						iconForValue={getModalityIcon}
						labelForValue={toTitleCase}
						toneForValue={getModalityTone}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="tiers" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Tag className="h-4 w-4 text-muted-foreground" />
						Pricing Tier
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={tierOptions}
						selected={selectedTiers}
						onToggle={(value) => setSelectedTiers(toggleInList(selectedTiers, value))}
						labelForValue={toTitleCase}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="features" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Sparkles className="h-4 w-4 text-muted-foreground" />
						Features
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={featureOptions}
						selected={selectedFeatures}
						onToggle={(value) => setSelectedFeatures(toggleInList(selectedFeatures, value))}
						labelForValue={(value) => featureLabels[value] ?? value}
						collapsedLimit={5}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="endpoints" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Route className="h-4 w-4 text-muted-foreground" />
						Endpoints
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={endpointOptions}
						selected={selectedEndpoints}
						onToggle={(value) => setSelectedEndpoints(toggleInList(selectedEndpoints, value))}
						labelForValue={(value) => value}
						collapsedLimit={5}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="year" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<CalendarDays className="h-4 w-4 text-muted-foreground" />
						Year
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={yearOptions}
						selected={yearSelected > 0 ? [String(yearSelected)] : []}
						onToggle={(value) => {
							const numeric = Number.parseInt(value, 10);
							if (!Number.isFinite(numeric)) return;
							setYearSelected(yearSelected === numeric ? 0 : numeric);
						}}
						labelForValue={(value) => value}
					/>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);

	return (
		<div className="flex w-full flex-1">
			<aside className="hidden lg:block w-[20rem] shrink-0 border-r border-border/70 bg-background/95 [&_[data-slot=separator]]:-mx-4">
				<div className="sticky top-16 flex h-[calc(100dvh-4rem)] min-h-0 flex-col">
					<ScrollArea className="min-h-0 flex-1 overscroll-y-contain [&>[data-orientation=vertical]]:opacity-0 [&>[data-orientation=vertical]]:transition-opacity [&>[data-orientation=vertical]]:duration-150 hover:[&>[data-orientation=vertical]]:opacity-100 focus-within:[&>[data-orientation=vertical]]:opacity-100">
						<div className="space-y-4 px-4 py-2 pb-6">{filtersContent}</div>
					</ScrollArea>
				</div>
			</aside>

			<section className="min-w-0 flex flex-1 flex-col">
				<div className="shrink-0 border-b border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur lg:px-8">
					<div className="sm:hidden space-y-2">
						<div className="flex items-center justify-between gap-2">
							<h1 className="font-bold text-xl leading-8">Models</h1>
							<div className="flex items-center justify-end gap-2 min-w-0">
								<span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
									{shownCountLabel}
								</span>
								{viewSwitcher}
							</div>
						</div>

						<div className="relative w-full">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
							<Input
								placeholder="Search"
								value={search}
								onChange={(e) =>
									setSearch(e.target.value || "", {
										limitUrlUpdates: debounce(250),
									})
								}
								className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
							/>
						</div>

						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 w-full justify-center gap-1.5"
							onClick={() => setMobileFiltersOpen(true)}
						>
							<SlidersHorizontal className="h-3.5 w-3.5" />
							Filters
							{activeFilterCount > 0 ? (
								<span className="inline-flex min-w-5 items-center justify-center rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums">
									{activeFilterCount}
								</span>
							) : null}
						</Button>
					</div>

					<div className="hidden sm:block">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(260px,460px)_auto] sm:items-center sm:gap-3">
							<div className="min-w-0 sm:flex sm:h-8 sm:items-center">
								<h1 className="font-bold text-xl leading-8">Models</h1>
							</div>

							<div className="relative w-full sm:justify-self-center">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
								<Input
									placeholder="Search"
									value={search}
									onChange={(e) =>
										setSearch(e.target.value || "", {
											limitUrlUpdates: debounce(250),
										})
									}
									className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
								/>
							</div>

							<div className="flex items-center justify-end gap-2 sm:justify-self-end">
								{viewSwitcher}
							</div>
						</div>

						<div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<div className="text-sm text-muted-foreground">
									{shownCountWithSearchLabel}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 lg:hidden"
									onClick={() => setMobileFiltersOpen(true)}
								>
									<SlidersHorizontal className="h-3.5 w-3.5" />
									Filters
									{activeFilterCount > 0 ? (
										<span className="inline-flex min-w-5 items-center justify-center rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums">
											{activeFilterCount}
										</span>
									) : null}
								</Button>
							</div>
							<div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
								<ArrowUpDown className="h-3.5 w-3.5" />
								Sort in table columns
							</div>
						</div>
					</div>
				</div>

				<div className="w-full px-4 pt-2 pb-5 lg:px-8 lg:pt-2 lg:pb-6">
					<MonitorTableClient
						initialModelData={initialModelData}
						weeklyTokensByModel={weeklyTokensByModel}
						weeklyTokensByModelProvider={weeklyTokensByModelProvider}
					/>
				</div>
			</section>

			<Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
				<SheetContent
					side="right"
					className="w-[86vw] max-w-sm gap-0 p-0 lg:hidden"
				>
					<SheetHeader className="border-b border-border/70 px-4 py-3 text-left">
						<div className="flex items-start justify-between gap-3 pr-8">
							<div>
								<SheetTitle>Filters</SheetTitle>
								<SheetDescription>Refine the models list.</SheetDescription>
							</div>
							{activeFilterCount > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 px-2"
									onClick={resetFilters}
								>
									Reset
								</Button>
							) : null}
						</div>
					</SheetHeader>
					<ScrollArea className="min-h-0 flex-1 overscroll-y-contain px-4 py-2">
						<div className="space-y-4 pb-6">{filtersContent}</div>
					</ScrollArea>
				</SheetContent>
			</Sheet>
		</div>
	);
}
