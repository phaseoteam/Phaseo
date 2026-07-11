"use client";

import Link from "next/link";
import {
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { debounce, useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import {
	Search,
	Grid as GridIcon,
	Table as TableIcon,
	SlidersHorizontal,
	Activity,
	AlertTriangle,
	ArrowDownCircle,
	ArrowUpDown,
	Ban,
	Binary,
	Captions,
	CheckCircle2,
	CircleDot,
	Clock3,
	FileText,
	Globe2,
	Headphones,
	Music4,
	Route,
	Sparkles,
	Speech,
	Type as TypeIcon,
	ImageIcon,
	Layers3,
	Video,
	CalendarDays,
	XCircle,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { featureLabels } from "@/lib/config/featureLabels";
import type { MonitorModelTableRow } from "@/lib/fetchers/models/table-view/types";
import { MonitorTableClient } from "@/components/monitor/MonitorTableClient";
import { Logo } from "@/components/Logo";
import { Slider } from "@/components/ui/slider";

type OptionCount = {
	value: string;
	count: number;
};

type TableSortOption = {
	value: string;
	direction: "asc" | "desc";
	label: string;
	triggerLabel: string;
};

const TABLE_SORT_OPTIONS: TableSortOption[] = [
	{
		value: "added",
		direction: "desc",
		label: "Newest",
		triggerLabel: "Newest",
	},
	{
		value: "weeklyTokens",
		direction: "desc",
		label: "Most Popular (7d Tokens)",
		triggerLabel: "Most Popular",
	},
	{
		value: "inputPrice",
		direction: "asc",
		label: "Price: Low to High",
		triggerLabel: "Lowest Price",
	},
	{
		value: "outputPrice",
		direction: "desc",
		label: "Price: High to Low",
		triggerLabel: "Highest Price",
	},
	{
		value: "context",
		direction: "desc",
		label: "Context: High to Low",
		triggerLabel: "Largest Context",
	},
];

const CONTEXT_LENGTH_STOPS = [
	0, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000, 1_000_000,
] as const;

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
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"coming_soon",
	"inactive",
	"disabled",
] as const;

const STATUS_FILTER_META: Record<
	string,
	{ icon: LucideIcon; iconClassName: string }
> = {
	active: {
		icon: CheckCircle2,
		iconClassName: "text-green-600 dark:text-green-400",
	},
	deranked_lvl1: {
		icon: AlertTriangle,
		iconClassName: "text-amber-500 dark:text-amber-400",
	},
	deranked_lvl2: {
		icon: AlertTriangle,
		iconClassName: "text-amber-600 dark:text-amber-400",
	},
	deranked_lvl3: {
		icon: AlertTriangle,
		iconClassName: "text-red-500 dark:text-red-400",
	},
	coming_soon: {
		icon: Clock3,
		iconClassName: "text-sky-600 dark:text-sky-400",
	},
	inactive: {
		icon: XCircle,
		iconClassName: "text-zinc-500 dark:text-zinc-400",
	},
	disabled: {
		icon: Ban,
		iconClassName: "text-red-600 dark:text-red-400",
	},
};

interface ModelsTableDisplayProps {
	initialModelData: MonitorModelTableRow[];
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allStatuses: string[];
}

function parseContextMinParam(value: string | null): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatContextStop(value: number): string {
	if (value <= 0) return "Any";
	if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
	return `${Math.round(value / 1_000)}K`;
}

function getClosestStopIndex(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 0;
	const index = CONTEXT_LENGTH_STOPS.findIndex((stop) => stop >= value);
	return index === -1 ? CONTEXT_LENGTH_STOPS.length - 1 : index;
}

function formatRegionLabel(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "us") return "US";
	if (normalized === "eu") return "EU";
	if (normalized === "apac") return "APAC";
	if (normalized === "jp") return "Japan";
	if (normalized === "au") return "Australia";
	return normalized ? normalized.toUpperCase() : value;
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
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
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
	if (normalized === "coming_soon") return "Coming Soon";
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
	if (normalized.includes("text")) return TypeIcon;
	return CircleDot;
}

function FilterCheckboxList({
	options,
	selected,
	onToggle,
	labelForValue,
	iconForValue,
	renderStart,
	toneForValue,
	collapsedLimit,
}: {
	options: OptionCount[];
	selected: string[];
	onToggle: (value: string) => void;
	labelForValue?: (value: string) => string;
	iconForValue?: (value: string) => LucideIcon;
	renderStart?: (options: {
		value: string;
		label: string;
		checked: boolean;
	}) => ReactNode;
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
					const start = renderStart?.({
						value: option.value,
						label,
						checked,
					});
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
								{start ??
									(Icon ? (
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
									) : null)}
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

function FilterLogo({ value, label }: { value: string; label: string }) {
	return (
		<span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background p-0.5">
			<Logo
				id={value}
				alt={`${label} logo`}
				width={14}
				height={14}
				className="h-3.5 w-3.5 object-contain"
			/>
		</span>
	);
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
		new Set(
			values
				.map((value) => normalizeModalityFilterValue(value))
				.filter(Boolean),
		),
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

function OutputModalityButtonRow({
	options,
	selected,
	onToggle,
}: {
	options: OptionCount[];
	selected: string[];
	onToggle: (value: string) => void;
}) {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const updateOverflow = () => {
			setHasHorizontalOverflow(viewport.scrollWidth > viewport.clientWidth + 1);
		};

		updateOverflow();
		const resizeObserver = new ResizeObserver(updateOverflow);
		resizeObserver.observe(viewport);
		if (contentRef.current) resizeObserver.observe(contentRef.current);
		window.addEventListener("resize", updateOverflow);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", updateOverflow);
		};
	}, [options]);

	if (options.length === 0) return null;

	const buttons = options.map((option) => {
		const checked = selected.includes(option.value);
		const Icon = getModalityIcon(option.value);
		const tone = getModalityTone(option.value);

		return (
			<Button
				key={option.value}
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => onToggle(option.value)}
				aria-pressed={checked}
				className={cn(
					"group h-9 shrink-0 rounded-md px-2 text-sm shadow-none transition-colors",
					checked
						? cn(
								"bg-muted text-foreground hover:bg-muted",
								tone.badgeClassName,
								"border-transparent hover:border-transparent",
							)
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<span
					className={cn(
						"inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm",
						checked
							? tone.iconClassName
							: cn(
									"bg-transparent text-muted-foreground transition-colors",
									tone.ghostIconHoverClassName,
								),
					)}
				>
					<Icon className="h-3.5 w-3.5" />
				</span>
				<span>{toTitleCase(option.value)}</span>
				<span
					className={cn(
						"inline-flex min-w-5 items-center justify-center px-1 text-[11px] font-medium leading-none tabular-nums",
						checked ? "text-current" : "text-muted-foreground",
					)}
				>
					{option.count}
				</span>
			</Button>
		);
	});

	return (
		<ScrollArea
			className="w-full [&>[data-orientation=horizontal]]:opacity-100 [&>[data-orientation=horizontal]]:transition-none"
			scrollBarOrientation="horizontal"
			viewportClassName={hasHorizontalOverflow ? "pb-2" : "pb-0"}
			viewportRef={viewportRef}
		>
			<div
				ref={contentRef}
				className="flex min-w-max items-center gap-1.5 pr-4"
			>
				{buttons}
			</div>
		</ScrollArea>
	);
}

export default function ModelsTableDisplay({
	initialModelData,
	allEndpoints,
	allModalities,
	allFeatures,
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
	const toolbarRef = useRef<HTMLDivElement | null>(null);
	const [stickyOffsets, setStickyOffsets] = useState({
		toolbarTop: 60,
		tableHeaderTop: 60,
	});

	useEffect(() => {
		const toolbar = toolbarRef.current;
		if (!toolbar || typeof window === "undefined") return;

		const siteHeader = document.querySelector<HTMLElement>(
			"#dashboard-shell > header",
		);
		const mediumViewport = window.matchMedia("(min-width: 768px)");
		const updateOffsets = () => {
			const toolbarTop = Math.ceil(
				siteHeader?.getBoundingClientRect().height ?? 60,
			);
			const toolbarHeight = mediumViewport.matches
				? Math.ceil(toolbar.getBoundingClientRect().height)
				: 0;
			const tableHeaderTop = toolbarTop + toolbarHeight;
			setStickyOffsets((current) =>
				current.toolbarTop === toolbarTop &&
				current.tableHeaderTop === tableHeaderTop
					? current
					: { toolbarTop, tableHeaderTop },
			);
		};

		updateOffsets();
		const resizeObserver = new ResizeObserver(updateOffsets);
		resizeObserver.observe(toolbar);
		if (siteHeader) resizeObserver.observe(siteHeader);
		mediumViewport.addEventListener("change", updateOffsets);
		window.addEventListener("resize", updateOffsets);

		return () => {
			resizeObserver.disconnect();
			mediumViewport.removeEventListener("change", updateOffsets);
			window.removeEventListener("resize", updateOffsets);
		};
	}, []);

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
	const hasSearchQuery = deferredSearch.trim().length > 0;
	const effectiveSelectedStatuses = useMemo(
		() =>
			!hasInteractedWithStatuses && selectedStatuses.length === 0
				? hasSearchQuery
					? []
					: ["active"]
				: selectedStatuses,
		[hasInteractedWithStatuses, hasSearchQuery, selectedStatuses],
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
	const [selectedOutputModalities, setSelectedOutputModalities] = useQueryState(
		"outputModalities",
		{
			defaultValue: [] as string[],
			parse: parseModalityParam,
			serialize: serializeCsvParam,
			shallow: true,
			clearOnDefault: true,
		},
	);
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
	const DEFAULT_OPEN_SECTIONS = ["gatewayStatus", "inputModalities"];
	const [openFilterSections, setOpenFilterSections] = useState<string[]>(() => [
		...DEFAULT_OPEN_SECTIONS,
		...(selectedTiers.length > 0 ? ["tiers"] : []),
	]);
	const [selectedSupportedParameters, setSelectedSupportedParameters] =
		useQueryState("supportedParameters", {
			defaultValue: [] as string[],
			parse: parseCsvParam,
			serialize: serializeCsvParam,
			shallow: true,
			clearOnDefault: true,
		});
	const [selectedProviders, setSelectedProviders] = useQueryState("providers", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [selectedRegions, setSelectedRegions] = useQueryState("regions", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [selectedCreators, setSelectedCreators] = useQueryState("creators", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [selectedContextMin, setSelectedContextMin] = useQueryState(
		"contextMin",
		{
			defaultValue: 0,
			parse: parseContextMinParam,
			serialize: (value) => String(value),
			shallow: true,
			clearOnDefault: true,
		},
	);
	const [yearSelected, setYearSelected] = useQueryState("year", {
		defaultValue: 0,
		parse: parseYearParam,
		serialize: (value) => String(value),
		shallow: true,
		clearOnDefault: true,
	});
	const [sortField, setSortField] = useQueryState("sort", {
		defaultValue: "added",
		parse: (value) => value || "added",
		serialize: (value) => value,
		clearOnDefault: true,
		shallow: true,
	});
	const [sortDirection, setSortDirection] = useQueryState("dir", {
		defaultValue: "desc" as "asc" | "desc",
		parse: (value) => (value === "asc" ? "asc" : "desc"),
		serialize: (value) => value,
		clearOnDefault: true,
		shallow: true,
	});

	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isTable = pathname?.includes("/models/table");

	const selectedContextStopIndex = getClosestStopIndex(selectedContextMin);

	const counts = useMemo(() => {
		const inputMap = new Map<string, number>();
		const outputMap = new Map<string, number>();
		const featureMap = new Map<string, number>();
		const supportedParameterMap = new Map<string, number>();
		const providerMap = new Map<string, number>();
		const regionMap = new Map<string, number>();
		const creatorMap = new Map<string, number>();
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
			for (const parameter of item.supportedParameters ?? []) {
				const key = String(parameter ?? "").trim();
				if (!key) continue;
				supportedParameterMap.set(
					key,
					(supportedParameterMap.get(key) ?? 0) + 1,
				);
			}
			const providerId = String(item.provider.id ?? "").trim();
			if (providerId) {
				providerMap.set(providerId, (providerMap.get(providerId) ?? 0) + 1);
			}
			for (const region of item.provider.executionRegions ?? []) {
				const key = String(region ?? "")
					.trim()
					.toLowerCase();
				if (!key) continue;
				regionMap.set(key, (regionMap.get(key) ?? 0) + 1);
			}
			const creatorId = String(item.organisationId ?? "").trim();
			if (creatorId) {
				creatorMap.set(creatorId, (creatorMap.get(creatorId) ?? 0) + 1);
			}
			const endpoint = String(item.endpoint ?? "").trim();
			if (endpoint)
				endpointMap.set(endpoint, (endpointMap.get(endpoint) ?? 0) + 1);

			const status = String(item.gatewayStatus ?? "").trim();
			const statusKey = normalizeStatusFilterValue(status);
			if (statusKey) {
				statusMap.set(statusKey, (statusMap.get(statusKey) ?? 0) + 1);
			}

			const tier = String(item.tier ?? "standard")
				.trim()
				.toLowerCase();
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
			supportedParameterMap,
			providerMap,
			regionMap,
			creatorMap,
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
	const supportedParameterOptions = useMemo(
		() =>
			getOptionCounts(
				Array.from(counts.supportedParameterMap.keys()).sort((a, b) =>
					toTitleCase(a).localeCompare(toTitleCase(b)),
				),
				counts.supportedParameterMap,
			),
		[counts.supportedParameterMap],
	);
	const providerOptions = useMemo(
		() =>
			getOptionCounts(
				Array.from(counts.providerMap.keys()),
				counts.providerMap,
			),
		[counts.providerMap],
	);
	const regionOptions = useMemo(
		() =>
			getOptionCounts(Array.from(counts.regionMap.keys()), counts.regionMap),
		[counts.regionMap],
	);
	const creatorOptions = useMemo(
		() =>
			getOptionCounts(Array.from(counts.creatorMap.keys()), counts.creatorMap),
		[counts.creatorMap],
	);
	const endpointOptions = useMemo(
		() => getOptionCounts(allEndpoints, counts.endpointMap),
		[allEndpoints, counts.endpointMap],
	);
	const statusOptions = useMemo(
		() =>
			STATUS_FILTER_DISPLAY_ORDER.map((value) => ({
				value,
				count: counts.statusMap.get(value) ?? 0,
			})),
		[counts.statusMap],
	);
	const tierOptions = useMemo(() => {
		const preferredOrder = ["standard", "batch", "free"];
		const values = Array.from(counts.tierMap.keys()).sort((a, b) => {
			const aIndex = preferredOrder.indexOf(a);
			const bIndex = preferredOrder.indexOf(b);
			if (aIndex !== -1 || bIndex !== -1) {
				if (aIndex === -1) return 1;
				if (bIndex === -1) return -1;
				return aIndex - bIndex;
			}
			return a.localeCompare(b);
		});
		return getOptionCounts(values, counts.tierMap);
	}, [counts.tierMap]);
	const providerLabels = useMemo(
		() =>
			new Map(
				initialModelData.map((item) => [item.provider.id, item.provider.name]),
			),
		[initialModelData],
	);
	const creatorLabels = useMemo(
		() =>
			new Map(
				initialModelData.map((item) => [
					item.organisationId ?? "",
					item.organisationName ?? item.organisationId ?? "Unknown",
				]),
			),
		[initialModelData],
	);
	const yearOptions = useMemo(
		() =>
			Array.from(counts.yearMap.entries())
				.map(([value, count]) => ({ value, count }))
				.sort((a, b) => Number(b.value) - Number(a.value)),
		[counts.yearMap],
	);

	const activeFilterCount =
		(hasInteractedWithStatuses ? selectedStatuses.length : 0) +
		selectedEndpoints.length +
		selectedInputModalities.length +
		selectedOutputModalities.length +
		selectedFeatures.length +
		selectedTiers.length +
		selectedSupportedParameters.length +
		selectedProviders.length +
		selectedRegions.length +
		selectedCreators.length +
		(selectedContextMin > 0 ? 1 : 0) +
		(yearSelected > 0 ? 1 : 0);

	const resetFilters = () => {
		setHasInteractedWithStatuses(false);
		setSelectedStatuses([]);
		setSelectedEndpoints([]);
		setSelectedInputModalities([]);
		setSelectedOutputModalities([]);
		setSelectedFeatures([]);
		setSelectedTiers([]);
		setSelectedSupportedParameters([]);
		setSelectedProviders([]);
		setSelectedRegions([]);
		setSelectedCreators([]);
		setSelectedContextMin(0);
		setYearSelected(0);
	};

	const buildHref = (path: string) => {
		const params = new URLSearchParams(searchParams?.toString() ?? "");

		if (path === "/models") {
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

	const selectedTableSort =
		TABLE_SORT_OPTIONS.find(
			(option) =>
				option.value === sortField && option.direction === sortDirection,
		) ?? TABLE_SORT_OPTIONS[0];

	const filterButton = (compact = false) => (
		<Button
			type="button"
			size="sm"
			className={cn(
				"relative h-8 shrink-0 rounded-md border border-border/70 bg-background text-foreground shadow-xs transition-colors hover:bg-muted/45 dark:border-border/70 dark:bg-background dark:text-foreground dark:hover:bg-muted/25",
				compact ? "w-9 px-0" : "gap-1.5",
			)}
			onClick={() => setMobileFiltersOpen(true)}
		>
			<SlidersHorizontal className="h-3.5 w-3.5" />
			<span className={compact ? "sr-only" : undefined}>Filters</span>
			{activeFilterCount > 0 ? (
				<span
					className={cn(
						"inline-flex min-w-5 items-center justify-center rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums",
						compact && "absolute -right-1 -top-1 min-w-4 px-1 py-0 text-[10px]",
					)}
				>
					{activeFilterCount}
				</span>
			) : null}
		</Button>
	);

	const viewSwitcherItemClass = (active: boolean, isFirst = false) =>
		cn(
			"inline-flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45",
			!isFirst && "border-l border-border/70",
			active &&
				"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
		);

	const viewSwitcher = (
		<div className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border border-border/70 bg-background shadow-xs">
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						href={buildHref("/models")}
						prefetch={false}
						aria-label="Card view"
						aria-current={!isTable ? "page" : undefined}
						className={viewSwitcherItemClass(!isTable, true)}
					>
						<GridIcon className="h-4 w-4" />
					</Link>
				</TooltipTrigger>
				<TooltipContent side="top">Card view</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						href={buildHref("/models/table")}
						prefetch={false}
						aria-label="Table view"
						aria-current={isTable ? "page" : undefined}
						className={viewSwitcherItemClass(isTable)}
					>
						<TableIcon className="h-4 w-4" />
					</Link>
				</TooltipTrigger>
				<TooltipContent side="top">Table view</TooltipContent>
			</Tooltip>
		</div>
	);

	const sortSelect = (triggerClassName: string) => (
		<Select
			value={`${selectedTableSort.value}:${selectedTableSort.direction}`}
			onValueChange={(value) => {
				const nextSort = TABLE_SORT_OPTIONS.find(
					(option) => `${option.value}:${option.direction}` === value,
				);
				if (!nextSort) return;
				setSortField(nextSort.value);
				setSortDirection(nextSort.direction);
			}}
		>
			<SelectTrigger
				className={cn(
					"border border-border/70 bg-background shadow-xs hover:bg-muted/45 dark:border-border/70 dark:bg-background dark:hover:bg-muted/25",
					triggerClassName,
				)}
				aria-label="Sort models"
			>
				<span className="flex min-w-0 items-center gap-2">
					<ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate">{selectedTableSort.triggerLabel}</span>
				</span>
			</SelectTrigger>
			<SelectContent
				align="start"
				alignItemWithTrigger={false}
				className="!w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"
			>
				{TABLE_SORT_OPTIONS.map((option) => (
					<SelectItem
						key={`${option.value}:${option.direction}`}
						value={`${option.value}:${option.direction}`}
					>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
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
						renderStart={({ value }) => {
							const statusMeta = STATUS_FILTER_META[value];
							if (!statusMeta) return null;
							const StatusIcon = statusMeta.icon;
							return (
								<StatusIcon
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										statusMeta.iconClassName,
									)}
								/>
							);
						}}
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
							setSelectedInputModalities(
								toggleInList(selectedInputModalities, value),
							)
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
						<Layers3 className="h-4 w-4 text-muted-foreground" />
						Tier
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={tierOptions}
						selected={selectedTiers}
						onToggle={(value) =>
							setSelectedTiers(toggleInList(selectedTiers, value))
						}
						labelForValue={toTitleCase}
						renderStart={({ value, checked }) => {
							const tierMeta = getTierFilterMeta(value);
							const TierIcon = tierMeta.icon;
							return (
								<TierIcon
									className={cn(
										"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors",
										tierMeta.filterIconHoverClassName,
										checked && tierMeta.iconClassName,
									)}
								/>
							);
						}}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="contextLength" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Binary className="h-4 w-4 text-muted-foreground" />
						Context Length
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<div className="space-y-2 px-2 pb-1.5 pt-1">
						<Slider
							value={[selectedContextStopIndex]}
							min={0}
							max={CONTEXT_LENGTH_STOPS.length - 1}
							step={1}
							onValueChange={(next) => {
								const nextIndex = Number(next[0] ?? 0);
								const clamped = Math.min(
									Math.max(nextIndex, 0),
									CONTEXT_LENGTH_STOPS.length - 1,
								);
								setSelectedContextMin(CONTEXT_LENGTH_STOPS[clamped] ?? 0);
							}}
							aria-label="Minimum context length"
						/>
						<div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
							<span>{formatContextStop(CONTEXT_LENGTH_STOPS[0])}</span>
							<span>
								{selectedContextMin > 0
									? `Min ${formatContextStop(selectedContextMin)} tokens`
									: "No minimum"}
							</span>
							<span>
								{formatContextStop(
									CONTEXT_LENGTH_STOPS[CONTEXT_LENGTH_STOPS.length - 1],
								)}
							</span>
						</div>
						<div className="flex justify-center">
							{selectedContextMin > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => setSelectedContextMin(0)}
								>
									Reset
								</Button>
							) : null}
						</div>
					</div>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="supportedParameters" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
						Supported Parameters
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={supportedParameterOptions}
						selected={selectedSupportedParameters}
						onToggle={(value) =>
							setSelectedSupportedParameters(
								toggleInList(selectedSupportedParameters, value),
							)
						}
						labelForValue={toTitleCase}
						collapsedLimit={5}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="providers" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Route className="h-4 w-4 text-muted-foreground" />
						Providers
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={providerOptions}
						selected={selectedProviders}
						onToggle={(value) =>
							setSelectedProviders(toggleInList(selectedProviders, value))
						}
						labelForValue={(value) => providerLabels.get(value) ?? value}
						renderStart={({ value, label }) => (
							<FilterLogo value={value} label={label} />
						)}
						collapsedLimit={5}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="regionRouting" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<Globe2 className="h-4 w-4 text-muted-foreground" />
						Region Routing
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={regionOptions}
						selected={selectedRegions}
						onToggle={(value) =>
							setSelectedRegions(toggleInList(selectedRegions, value))
						}
						labelForValue={formatRegionLabel}
					/>
				</AccordionContent>
			</AccordionItem>

			<AccordionItem value="modelCreators" className="border-border/70">
				<AccordionTrigger className="px-2 py-3 text-sm no-underline hover:no-underline">
					<span className="flex items-center gap-2">
						<TypeIcon className="h-4 w-4 text-muted-foreground" />
						Model Creators
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1" disableAnimation>
					<FilterCheckboxList
						options={creatorOptions}
						selected={selectedCreators}
						onToggle={(value) =>
							setSelectedCreators(toggleInList(selectedCreators, value))
						}
						labelForValue={(value) => creatorLabels.get(value) ?? value}
						renderStart={({ value, label }) => (
							<FilterLogo value={value} label={label} />
						)}
						collapsedLimit={5}
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
						onToggle={(value) =>
							setSelectedFeatures(toggleInList(selectedFeatures, value))
						}
						labelForValue={(value) => featureLabels[value] ?? value}
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
						onToggle={(value) =>
							setSelectedEndpoints(toggleInList(selectedEndpoints, value))
						}
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
				<div
					ref={toolbarRef}
					className="z-40 shrink-0 border-b border-border/70 bg-background/95 px-4 pb-1 pt-2.5 backdrop-blur md:sticky lg:px-8"
					style={{ top: `${stickyOffsets.toolbarTop}px` }}
				>
					<div className="md:hidden space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="font-bold text-xl leading-8">Models</h1>
						</div>

						<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
							{sortSelect("h-8 min-w-0 rounded-md bg-background text-sm")}
							{filterButton(true)}
							{viewSwitcher}
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
								className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
								style={{ minWidth: 0 }}
							/>
						</div>
					</div>

					<div className="hidden md:block">
						<div className="hidden lg:block">
							<div className="flex items-center justify-between gap-4">
								<div className="flex h-8 min-w-0 shrink-0 items-center">
									<h1 className="font-bold text-xl leading-8">Models</h1>
								</div>

								<div className="flex min-w-0 flex-1 items-center justify-end gap-3">
									<div className="relative min-w-[15rem] max-w-[22rem] flex-1 2xl:max-w-[28rem]">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
										<Input
											placeholder="Search"
											value={search}
											onChange={(e) =>
												setSearch(e.target.value || "", {
													limitUrlUpdates: debounce(250),
												})
											}
											className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
											style={{ minWidth: 0 }}
										/>
									</div>
									{sortSelect(
										"h-8 w-[12.5rem] rounded-md bg-background text-sm 2xl:w-[13.5rem]",
									)}
									{viewSwitcher}
								</div>
							</div>
						</div>

						<div className="lg:hidden">
							<div className="flex h-8 items-center justify-between gap-3">
								<h1 className="font-bold text-xl leading-8">Models</h1>
								<div className="flex shrink-0 items-center justify-end gap-2">
									{filterButton()}
									{viewSwitcher}
								</div>
							</div>
							<div className="mt-2 grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] items-center gap-2">
								{sortSelect("h-8 min-w-0 rounded-md bg-background text-sm")}
								<div className="relative min-w-0">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
									<Input
										placeholder="Search"
										value={search}
										onChange={(e) =>
											setSearch(e.target.value || "", {
												limitUrlUpdates: debounce(250),
											})
										}
										className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
										style={{ minWidth: 0 }}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="mt-1.5">
						<OutputModalityButtonRow
							options={outputModalityOptions}
							selected={selectedOutputModalities}
							onToggle={(value) =>
								setSelectedOutputModalities(
									toggleInList(selectedOutputModalities, value),
								)
							}
						/>
					</div>
				</div>

				<div className="w-full px-4 pb-5 pt-1 lg:px-8 lg:pb-6 lg:pt-1">
					<MonitorTableClient
						initialModelData={initialModelData}
						effectiveStatuses={effectiveSelectedStatuses}
						stickyHeaderOffset={stickyOffsets.tableHeaderTop}
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
