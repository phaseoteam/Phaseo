"use client";

import Link from "next/link";
import {
	Suspense,
	use,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { debounce, useQueryState } from "nuqs";
import { ModelsGrid } from "./ModelsGrid";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import {
	Search,
	Grid as GridIcon,
	Table as TableIcon,
	Layers3,
	SlidersHorizontal,
	Activity,
	ArrowDownCircle,
	ArrowUpDown,
	BadgeAlert,
	ChevronUp,
	Binary,
	Captions,
	CircleDot,
	Database,
	FileText,
	Headphones,
	Music4,
	RotateCcw,
	Route,
	SearchX,
	Sparkles,
	Speech,
	Type as TypeIcon,
	ImageIcon,
	Video,
	CalendarDays,
	Globe2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import {
	MODELS_SORT_OPTIONS,
	qParser,
	sortParser,
	type ModelsSortOption,
} from "@/app/(dashboard)/models/search-params";
import { featureLabels } from "@/lib/config/featureLabels";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";
import type {
	GatewayStatusFilter,
	ModelsPageData,
	ModelsPageModel,
	OptionCount,
} from "./modelsDisplay.types";

interface ModelsDisplayProps {
	dataPromise?: Promise<ModelsPageData>;
	modelsPageData?: ModelsPageData;
	showPrimaryHeader?: boolean;
}

type PreparedModel = {
	model: ModelsPageModel;
	status: GatewayStatusFilter;
	endpointsSet: ReadonlySet<string>;
	inputModalitiesSet: ReadonlySet<string>;
	outputModalitiesSet: ReadonlySet<string>;
	featuresSet: ReadonlySet<string>;
	tiersSet: ReadonlySet<string>;
	providerNamesSet: ReadonlySet<string>;
	executionRegionsSet: ReadonlySet<string>;
	supportedParametersSet: ReadonlySet<string>;
	maxContextLength: number | null;
	creator: string;
	modelYear: string;
	searchIndex: string;
	sortPrice: number | null;
	sortContext: number | null;
	popularityWeek: number | null;
	throughputWeek: number | null;
	latencyWeek: number | null;
};

type FilterDimension =
	| "statuses"
	| "endpoints"
	| "inputModalities"
	| "outputModalities"
	| "features"
	| "tiers"
	| "contextMin"
	| "supportedParameters"
	| "providers"
	| "regions"
	| "creators"
	| "years";

const SORT_OPTION_LABELS: Record<ModelsSortOption, string> = {
	newest: "Newest",
	popular_week: "Most Popular (7d Tokens)",
	price_low_to_high: "Price: Low to High",
	price_high_to_low: "Price: High to Low",
	context_high_to_low: "Context: High to Low",
	throughput_high_to_low: "Throughput: High to Low",
	latency_low_to_high: "Latency: Low to High",
};

const SORT_TRIGGER_LABELS: Record<ModelsSortOption, string> = {
	newest: "Newest",
	popular_week: "Most Popular",
	price_low_to_high: "Lowest Price",
	price_high_to_low: "Highest Price",
	context_high_to_low: "Largest Context",
	throughput_high_to_low: "Fastest Throughput",
	latency_low_to_high: "Lowest Latency",
};

const CONTEXT_LENGTH_STOPS = [
	0, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000, 1_000_000,
] as const;

const SCROLL_TOP_VISIBILITY_THRESHOLD = 320;
const SCROLL_TOP_ANIMATION_DURATION_MS = 700;
const MOBILE_FILTER_FAB_VISIBILITY_THRESHOLD = 240;
const OUTPUT_MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"audio_tts",
	"audio_stt",
	"embeddings",
	"moderations",
	"rerank",
	"audio_music",
] as const;
const REGION_DISPLAY_ORDER = ["us", "eu", "apac", "jp", "au"] as const;
const ENDPOINT_DISPLAY_ORDER = [
	"responses",
	"chat/completions",
	"messages",
	"completions",
	"embeddings",
	"text/rerank",
	"rerank",
	"moderations",
	"image/generate",
	"image/edit",
	"images/generations",
	"images/edits",
	"audio/speech",
	"audio/transcription",
	"audio/transcriptions",
	"audio/translations",
	"video/generations",
] as const;

const ENDPOINT_LABELS: Record<string, string> = {
	responses: "Responses",
	"chat/completions": "Chat Completions",
	messages: "Messages",
	completions: "Completions",
	embeddings: "Embeddings",
	"text/rerank": "Rerank",
	rerank: "Rerank",
	moderations: "Moderations",
	"image/generate": "Image Generation",
	"image/edit": "Image Editing",
	"images/generations": "Image Generation",
	"images/edits": "Image Editing",
	"audio/speech": "Text to Speech",
	"audio/transcription": "Transcription",
	"audio/transcriptions": "Transcription",
	"audio/translations": "Translation",
	"video/generations": "Video Generation",
};

const endpointOrder = new Map(
	ENDPOINT_DISPLAY_ORDER.map((value, index) => [value, index] as const),
);

function normalizeSortOption(
	value: string | null | undefined,
): ModelsSortOption {
	const normalized = String(value ?? "").trim();
	if (
		MODELS_SORT_OPTIONS.includes(
			normalized as (typeof MODELS_SORT_OPTIONS)[number],
		)
	) {
		return normalized as ModelsSortOption;
	}
	return "newest";
}

function parseCsvParam(value: string | null): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function parseRegionParam(value: string | null): string[] {
	return Array.from(
		new Set(
			parseCsvParam(value)
				.map((part) =>
					String(part ?? "")
						.trim()
						.toLowerCase(),
				)
				.filter(Boolean),
		),
	);
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

function parseContextMinParam(value: string | null): number {
	if (value === null) return 0;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return parsed;
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

function toGatewayStatusFilter(value: string): GatewayStatusFilter | null {
	const normalized = value.trim().toLowerCase();
	if (normalized === "active") return "active";
	if (normalized === "coming_soon" || normalized === "comingsoon") {
		return "coming_soon";
	}
	if (
		normalized === "not_active" ||
		normalized === "inactive" ||
		normalized === "not_listed"
	) {
		return "not_active";
	}
	return null;
}

function parseGatewayStatusParam(value: string | null): string[] {
	if (!value) return [];
	const normalized = value
		.split(",")
		.map((part) => toGatewayStatusFilter(part))
		.filter((part): part is GatewayStatusFilter => Boolean(part));
	return Array.from(new Set(normalized));
}

function getGatewayStatusBucket(
	status: ModelsPageModel["gateway_status"] | null | undefined,
): GatewayStatusFilter {
	if (status === "active") return "active";
	if (status === "coming_soon") return "coming_soon";
	return "not_active";
}

function serializeCsvParam(values: string[]): string {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	).join(",");
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

function getModelYear(model: ModelsPageModel): string {
	if (Number.isFinite(model.primary_timestamp)) {
		const year = new Date(Number(model.primary_timestamp)).getUTCFullYear();
		return Number.isFinite(year) ? String(year) : "";
	}
	if (model.primary_date) {
		const parsed = new Date(model.primary_date).getTime();
		if (Number.isFinite(parsed)) {
			return String(new Date(parsed).getUTCFullYear());
		}
	}
	return "";
}

function getSortPrice(model: ModelsPageModel): number | null {
	const candidates = [model.lowest_input_price, model.lowest_output_price]
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0);
	if (candidates.length === 0) return null;
	return Math.min(...candidates);
}

function getSortContext(model: ModelsPageModel): number | null {
	const contextValues = (model.context_lengths ?? [])
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0);
	if (contextValues.length === 0) return null;
	return Math.max(...contextValues);
}

function compareNullableNumber(
	a: number | null | undefined,
	b: number | null | undefined,
	direction: "asc" | "desc",
): number {
	const hasA = Number.isFinite(Number(a));
	const hasB = Number.isFinite(Number(b));

	if (!hasA && !hasB) return 0;
	if (!hasA) return 1;
	if (!hasB) return -1;

	const aValue = Number(a);
	const bValue = Number(b);
	return direction === "asc" ? aValue - bValue : bValue - aValue;
}

function normalizedSet(
	values: readonly string[] | undefined,
): ReadonlySet<string> {
	const set = new Set<string>();
	for (const raw of values ?? []) {
		const value = String(raw ?? "").trim();
		if (value) set.add(value);
	}
	return set;
}

function normalizedModalitySet(
	values: readonly string[] | undefined,
): ReadonlySet<string> {
	const set = new Set<string>();
	for (const raw of values ?? []) {
		const value = normalizeModalityFilterValue(String(raw ?? ""));
		if (value) set.add(value);
	}
	return set;
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

function normalizeEndpointValue(value: string): string {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._-]+/g, "/")
		.replace(/\/+/g, "/");
}

function formatEndpointLabel(value: string): string {
	const normalized = normalizeEndpointValue(value);
	if (ENDPOINT_LABELS[normalized]) return ENDPOINT_LABELS[normalized];
	return normalized
		.split(/[._/-]+/g)
		.filter(Boolean)
		.map((word) => {
			if (word === "api") return "API";
			if (word === "tts") return "TTS";
			if (word === "stt") return "STT";
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(" ");
}

function getEndpointSortRank(value: string): number {
	const normalized = normalizeEndpointValue(value);
	const directRank = endpointOrder.get(
		normalized as (typeof ENDPOINT_DISPLAY_ORDER)[number],
	);
	if (directRank !== undefined) return directRank;
	if (normalized.includes("response")) return 0;
	if (normalized.includes("chat")) return 1;
	if (normalized.includes("message")) return 2;
	if (normalized.includes("completion")) return 3;
	if (normalized.includes("embedding")) return 4;
	if (normalized.includes("rerank")) return 5;
	if (normalized.includes("moderation")) return 6;
	if (normalized.includes("image")) return 7;
	if (normalized.includes("speech")) return 8;
	if (normalized.includes("transcription")) return 9;
	if (normalized.includes("translation")) return 10;
	if (normalized.includes("video")) return 11;
	return 99;
}

function getModalityIcon(modality: string): LucideIcon {
	const normalized = modality.toLowerCase().replace(/[._/-]+/g, " ");

	if (normalized.includes("embed")) return Binary;
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return ArrowUpDown;
	}
	if (normalized.includes("moderat")) return BadgeAlert;
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

function getEndpointIcon(endpoint: string): LucideIcon {
	const normalized = normalizeEndpointValue(endpoint);
	if (normalized.includes("embedding")) return Database;
	if (normalized.includes("rerank")) return ArrowUpDown;
	if (normalized.includes("moderation")) return BadgeAlert;
	if (normalized.includes("image")) return ImageIcon;
	if (normalized.includes("video")) return Video;
	if (normalized.includes("speech")) return Speech;
	if (
		normalized.includes("audio") ||
		normalized.includes("transcription") ||
		normalized.includes("translation")
	) {
		return Headphones;
	}
	if (
		normalized.includes("chat") ||
		normalized.includes("message") ||
		normalized.includes("response") ||
		normalized.includes("completion")
	) {
		return TypeIcon;
	}
	return Route;
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

function ModelsEmptyState({
	hasActiveQuery,
	onReset,
}: {
	hasActiveQuery: boolean;
	onReset: () => void;
}) {
	return (
		<div className="flex min-h-[22rem] items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/15 px-6 py-12 text-center">
			<div className="flex max-w-sm flex-col items-center">
				<span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<SearchX className="h-5 w-5" />
				</span>
				<h2 className="mt-4 text-lg font-semibold tracking-tight">
					No matching models
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{hasActiveQuery
						? "Try broadening your filters or clearing the search query."
						: "There are no models available for this view yet."}
				</p>
				{hasActiveQuery ? (
					<Button
						type="button"
						size="sm"
						className="mt-5 gap-2"
						onClick={onReset}
					>
						<RotateCcw className="h-3.5 w-3.5" />
						Reset filters and search
					</Button>
				) : null}
			</div>
		</div>
	);
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

function countPreparedValues(
	models: PreparedModel[],
	selector: (model: PreparedModel) => Iterable<string>,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const model of models) {
		for (const value of selector(model)) {
			const normalized = String(value ?? "").trim();
			if (!normalized) continue;
			counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
		}
	}
	return counts;
}

function mergeOptionCounts(
	baseOptions: OptionCount[],
	counts: Map<string, number>,
	selected: string[],
): OptionCount[] {
	const orderedValues = new Set<string>();
	for (const option of baseOptions) {
		const value = String(option.value ?? "").trim();
		if (value) orderedValues.add(value);
	}
	for (const value of counts.keys()) {
		const normalized = String(value ?? "").trim();
		if (normalized) orderedValues.add(normalized);
	}
	for (const value of selected) {
		const normalized = String(value ?? "").trim();
		if (normalized) orderedValues.add(normalized);
	}
	return Array.from(orderedValues, (value) => ({
		value,
		count: counts.get(value) ?? 0,
	}));
}

function filterOutFileModality(options: OptionCount[]): OptionCount[] {
	return options.filter(
		(option) => normalizeModalityFilterValue(option.value) !== "file",
	);
}

function sortOutputModalityOptions(options: OptionCount[]): OptionCount[] {
	const order = new Map<string, number>(
		OUTPUT_MODALITY_DISPLAY_ORDER.map(
			(value, index) => [value, index] as const,
		),
	);
	return [...options].sort((a, b) => {
		const aKey = normalizeModalityFilterValue(a.value);
		const bKey = normalizeModalityFilterValue(b.value);
		const aIndex = order.get(aKey);
		const bIndex = order.get(bKey);
		if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
		if (aIndex !== undefined) return -1;
		if (bIndex !== undefined) return 1;
		return toTitleCase(a.value).localeCompare(toTitleCase(b.value));
	});
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

	const buttons = sortOutputModalityOptions(options).map((option) => {
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

export default function ModelsDisplay({
	dataPromise,
	modelsPageData,
	showPrimaryHeader = true,
}: ModelsDisplayProps) {
	return (
		<Suspense fallback={null}>
			<ModelsDisplayData
				dataPromise={dataPromise}
				modelsPageData={modelsPageData}
				showPrimaryHeader={showPrimaryHeader}
			/>
		</Suspense>
	);
}

function ModelsDisplayData({
	dataPromise,
	modelsPageData,
	showPrimaryHeader = true,
}: ModelsDisplayProps) {
	const serverData = dataPromise ? use(dataPromise) : undefined;
	const resolvedModelsPageData = serverData ?? modelsPageData;

	if (!resolvedModelsPageData) return null;

	return (
		<ModelsDisplayContent
			modelsPageData={resolvedModelsPageData}
			showPrimaryHeader={showPrimaryHeader}
		/>
	);
}

function ModelsDisplayContent({
	modelsPageData,
	showPrimaryHeader = true,
}: {
	modelsPageData: ModelsPageData;
	showPrimaryHeader?: boolean;
}) {
	const { models, facets } = modelsPageData;
	const [search, setSearch] = useQueryState("q", qParser);
	const deferredSearch = useDeferredValue(search ?? "");
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
	const [selectedStatuses, setSelectedStatuses] = useQueryState("statuses", {
		defaultValue: [] as string[],
		parse: parseGatewayStatusParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [hasInteractedWithStatuses, setHasInteractedWithStatuses] = useState(
		selectedStatuses.length > 0,
	);
	const hasSearchQuery = deferredSearch.trim().length > 0;
	const effectiveSelectedStatuses = useMemo<GatewayStatusFilter[]>(
		() =>
			!hasInteractedWithStatuses && selectedStatuses.length === 0
				? hasSearchQuery
					? []
					: ["active"]
				: (selectedStatuses as GatewayStatusFilter[]),
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
		parse: parseRegionParam,
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
	const [selectedYears, setSelectedYears] = useQueryState("years", {
		defaultValue: [] as string[],
		parse: parseCsvParam,
		serialize: serializeCsvParam,
		shallow: true,
		clearOnDefault: true,
	});
	const [sort, setSort] = useQueryState("sort", sortParser);
	const selectedSort = normalizeSortOption(sort);
	const [showScrollTopButton, setShowScrollTopButton] = useState(false);
	const [showMobileFilterFab, setShowMobileFilterFab] = useState(false);
	const [isMobileViewport, setIsMobileViewport] = useState(false);
	const [sidebarCountsReady, setSidebarCountsReady] = useState(false);
	const scrollTopAnimationFrameRef = useRef<number | null>(null);

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			setSidebarCountsReady(true);
		});
		return () => window.cancelAnimationFrame(frame);
	}, [models]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 639px)");
		const updateViewport = () => {
			setIsMobileViewport(mediaQuery.matches);
		};

		updateViewport();
		mediaQuery.addEventListener("change", updateViewport);
		return () => mediaQuery.removeEventListener("change", updateViewport);
	}, []);

	useEffect(() => {
		const updateVisibility = () => {
			const scrollY = window.scrollY;
			const shouldShow = scrollY > SCROLL_TOP_VISIBILITY_THRESHOLD;
			const shouldShowMobileFab =
				scrollY > MOBILE_FILTER_FAB_VISIBILITY_THRESHOLD;
			setShowScrollTopButton((current) =>
				current === shouldShow ? current : shouldShow,
			);
			setShowMobileFilterFab((current) =>
				current === shouldShowMobileFab ? current : shouldShowMobileFab,
			);
		};

		updateVisibility();
		window.addEventListener("scroll", updateVisibility, { passive: true });
		return () => window.removeEventListener("scroll", updateVisibility);
	}, []);

	useEffect(
		() => () => {
			if (scrollTopAnimationFrameRef.current !== null) {
				window.cancelAnimationFrame(scrollTopAnimationFrameRef.current);
				scrollTopAnimationFrameRef.current = null;
			}
		},
		[],
	);

	const handleScrollToTop = useCallback(() => {
		if (scrollTopAnimationFrameRef.current !== null) {
			window.cancelAnimationFrame(scrollTopAnimationFrameRef.current);
			scrollTopAnimationFrameRef.current = null;
		}

		// Prefer the browser's native smooth scroll (typically less janky with virtualization).
		if ("scrollBehavior" in document.documentElement.style) {
			window.scrollTo({ top: 0, behavior: "smooth" });
			return;
		}

		const startY = window.scrollY;
		if (startY <= 0) return;
		const startTime = performance.now();
		const duration = SCROLL_TOP_ANIMATION_DURATION_MS;

		const easeInOutCubic = (t: number): number =>
			t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

		const animate = (now: number) => {
			const elapsed = now - startTime;
			const progress = Math.min(1, elapsed / duration);
			const eased = easeInOutCubic(progress);
			window.scrollTo(0, Math.round(startY * (1 - eased)));
			if (progress < 1) {
				scrollTopAnimationFrameRef.current =
					window.requestAnimationFrame(animate);
				return;
			}
			scrollTopAnimationFrameRef.current = null;
		};

		scrollTopAnimationFrameRef.current = window.requestAnimationFrame(animate);
	}, []);

	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isTable = pathname?.includes("/models/table");
	const {
		endpointOptions: baseEndpointOptions,
		inputModalityOptions: baseInputModalityOptions,
		outputModalityOptions: baseOutputModalityOptions,
		featureOptions: baseFeatureOptions,
		tierOptions: baseTierOptions,
		supportedParameterOptions: baseSupportedParameterOptions,
		providerOptions: baseProviderOptions,
		regionOptions: baseRegionOptions,
		creatorOptions: baseCreatorOptions,
		yearOptions: baseYearOptions,
	} = facets;

	const activeFilterCount =
		(hasInteractedWithStatuses ? selectedStatuses.length : 0) +
		selectedEndpoints.length +
		selectedInputModalities.length +
		selectedOutputModalities.length +
		selectedFeatures.length +
		selectedTiers.length +
		(selectedContextMin > 0 ? 1 : 0) +
		selectedSupportedParameters.length +
		selectedProviders.length +
		selectedRegions.length +
		selectedCreators.length +
		selectedYears.length;

	const selectedContextStopIndex = getClosestStopIndex(selectedContextMin);

	const preparedModels = useMemo(
		() =>
			models.map((model) => {
				const endpoints = Array.from(normalizedSet(model.gateway_endpoints));
				const inputModalities = Array.from(
					normalizedModalitySet(model.gateway_input_modalities),
				);
				const outputModalities = Array.from(
					normalizedModalitySet(model.gateway_output_modalities),
				);
				const features = Array.from(normalizedSet(model.gateway_features));
				const tiers = Array.from(normalizedSet(model.gateway_tiers));
				const providerNames = Array.from(
					normalizedSet(model.gateway_provider_names),
				);
				const executionRegions = Array.from(
					normalizedSet(model.gateway_execution_regions),
				);
				const apiModelIds = Array.from(
					normalizedSet(model.gateway_api_model_ids),
				);
				const supportedParameters = Array.from(
					normalizedSet(model.supported_parameters),
				);
				const maxContextLength = Math.max(
					...(model.context_lengths ?? [])
						.map((value) => Number(value))
						.filter((value) => Number.isFinite(value) && value > 0),
				);

				return {
					model,
					status: getGatewayStatusBucket(model.gateway_status),
					endpointsSet: new Set(endpoints),
					inputModalitiesSet: new Set(inputModalities),
					outputModalitiesSet: new Set(outputModalities),
					featuresSet: new Set(features),
					tiersSet: new Set(tiers),
					providerNamesSet: new Set(providerNames),
					executionRegionsSet: new Set(executionRegions),
					supportedParametersSet: new Set(supportedParameters),
					maxContextLength:
						Number.isFinite(maxContextLength) && maxContextLength > 0
							? maxContextLength
							: null,
					creator: String(
						normalizeOrganisationDisplayName(
							model.organisation_name,
							model.organisation_id,
						) ?? "",
					).trim(),
					modelYear: getModelYear(model),
					searchIndex: [
						String(model.name ?? "").trim(),
						String(model.model_id ?? "").trim(),
						...apiModelIds,
					]
						.join(" ")
						.toLowerCase(),
					sortPrice: getSortPrice(model),
					sortContext: getSortContext(model),
					popularityWeek:
						Number.isFinite(Number(model.weekly_usage_quantity)) &&
						Number(model.weekly_usage_quantity) > 0
							? Number(model.weekly_usage_quantity)
							: Number.isFinite(Number(model.popularity_tokens_week)) &&
									Number(model.popularity_tokens_week) > 0
								? Number(model.popularity_tokens_week)
							: null,
					throughputWeek:
						Number.isFinite(Number(model.throughput_week)) &&
						Number(model.throughput_week) > 0
							? Number(model.throughput_week)
							: null,
					latencyWeek:
						Number.isFinite(Number(model.latency_week)) &&
						Number(model.latency_week) > 0
							? Number(model.latency_week)
							: null,
				};
			}),
		[models],
	);

	const matchesPreparedModel = useCallback(
		(
			prepared: PreparedModel,
			options?: { exclude?: FilterDimension | null },
		): boolean => {
			const exclude = options?.exclude ?? null;
			const searchValue = deferredSearch.trim().toLowerCase();

			if (
				exclude !== "statuses" &&
				effectiveSelectedStatuses.length > 0 &&
				!effectiveSelectedStatuses.includes(prepared.status)
			) {
				return false;
			}
			if (
				exclude !== "endpoints" &&
				selectedEndpoints.length > 0 &&
				!selectedEndpoints.every((value) => prepared.endpointsSet.has(value))
			) {
				return false;
			}
			if (
				exclude !== "inputModalities" &&
				selectedInputModalities.length > 0 &&
				!selectedInputModalities.every((value) =>
					prepared.inputModalitiesSet.has(value),
				)
			) {
				return false;
			}
			if (
				exclude !== "outputModalities" &&
				selectedOutputModalities.length > 0 &&
				!selectedOutputModalities.every((value) =>
					prepared.outputModalitiesSet.has(value),
				)
			) {
				return false;
			}
			if (
				exclude !== "features" &&
				selectedFeatures.length > 0 &&
				!selectedFeatures.every((value) => prepared.featuresSet.has(value))
			) {
				return false;
			}
			if (
				exclude !== "tiers" &&
				selectedTiers.length > 0 &&
				!selectedTiers.some((value) => prepared.tiersSet.has(value))
			) {
				return false;
			}
			if (
				exclude !== "contextMin" &&
				selectedContextMin > 0 &&
				(!prepared.maxContextLength ||
					prepared.maxContextLength < selectedContextMin)
			) {
				return false;
			}
			if (
				exclude !== "supportedParameters" &&
				selectedSupportedParameters.length > 0 &&
				!selectedSupportedParameters.every((value) =>
					prepared.supportedParametersSet.has(value),
				)
			) {
				return false;
			}
			if (
				exclude !== "providers" &&
				selectedProviders.length > 0 &&
				!selectedProviders.every((value) =>
					prepared.providerNamesSet.has(value),
				)
			) {
				return false;
			}
			if (
				exclude !== "regions" &&
				selectedRegions.length > 0 &&
				!selectedRegions.every((value) =>
					prepared.executionRegionsSet.has(value),
				)
			) {
				return false;
			}
			if (
				exclude !== "creators" &&
				selectedCreators.length > 0 &&
				!selectedCreators.includes(prepared.creator)
			) {
				return false;
			}
			if (
				exclude !== "years" &&
				selectedYears.length > 0 &&
				!selectedYears.includes(prepared.modelYear)
			) {
				return false;
			}
			if (!searchValue) return true;
			return prepared.searchIndex.includes(searchValue);
		},
		[
			deferredSearch,
			selectedContextMin,
			selectedCreators,
			effectiveSelectedStatuses,
			selectedEndpoints,
			selectedFeatures,
			selectedTiers,
			selectedInputModalities,
			selectedOutputModalities,
			selectedProviders,
			selectedRegions,
			selectedSupportedParameters,
			selectedYears,
		],
	);

	const filteredPreparedModels = useMemo(() => {
		const compareByNewest = (a: PreparedModel, b: PreparedModel) => {
			const tsA = a.model.primary_timestamp ?? Number.NEGATIVE_INFINITY;
			const tsB = b.model.primary_timestamp ?? Number.NEGATIVE_INFINITY;
			if (tsA !== tsB) return tsB - tsA;
			return (a.model.name ?? "").localeCompare(b.model.name ?? "");
		};

		const filtered = preparedModels.filter((prepared) =>
			matchesPreparedModel(prepared),
		);

		const compareBySelectedSort = (a: PreparedModel, b: PreparedModel) => {
			switch (selectedSort) {
				case "price_low_to_high":
					return compareNullableNumber(a.sortPrice, b.sortPrice, "asc");
				case "price_high_to_low":
					return compareNullableNumber(a.sortPrice, b.sortPrice, "desc");
				case "context_high_to_low":
					return compareNullableNumber(a.sortContext, b.sortContext, "desc");
				case "throughput_high_to_low":
					return compareNullableNumber(
						a.throughputWeek,
						b.throughputWeek,
						"desc",
					);
				case "latency_low_to_high":
					return compareNullableNumber(a.latencyWeek, b.latencyWeek, "asc");
				case "popular_week":
					return compareNullableNumber(
						a.popularityWeek,
						b.popularityWeek,
						"desc",
					);
				case "newest":
				default:
					return compareByNewest(a, b);
			}
		};

		filtered.sort((a, b) => {
			const bySelectedSort = compareBySelectedSort(a, b);
			if (bySelectedSort !== 0) return bySelectedSort;
			return compareByNewest(a, b);
		});

		return filtered;
	}, [matchesPreparedModel, preparedModels, selectedSort]);

	const filteredModels = useMemo(
		() => filteredPreparedModels.map((prepared) => prepared.model),
		[filteredPreparedModels],
	);

	const dynamicSidebarCounts = useMemo(() => {
		if (!sidebarCountsReady) {
			return {
				statusCounts: facets.statusCounts,
				endpointOptions: baseEndpointOptions,
				inputModalityOptions: baseInputModalityOptions,
				outputModalityOptions: baseOutputModalityOptions,
				featureOptions: baseFeatureOptions,
				tierOptions: baseTierOptions,
				supportedParameterOptions: baseSupportedParameterOptions,
				providerOptions: baseProviderOptions,
				regionOptions: baseRegionOptions,
				creatorOptions: baseCreatorOptions,
				yearOptions: baseYearOptions,
			};
		}

		const withAllExcept = (dimension: FilterDimension) =>
			preparedModels.filter((prepared) =>
				matchesPreparedModel(prepared, { exclude: dimension }),
			);

		const statusSource = withAllExcept("statuses");
		const statusCounts: Record<GatewayStatusFilter, number> = {
			active: 0,
			coming_soon: 0,
			not_active: 0,
		};
		for (const prepared of statusSource) {
			statusCounts[prepared.status] += 1;
		}

		return {
			statusCounts,
			endpointOptions: mergeOptionCounts(
				baseEndpointOptions,
				countPreparedValues(withAllExcept("endpoints"), (prepared) =>
					prepared.endpointsSet.values(),
				),
				selectedEndpoints,
			),
			inputModalityOptions: mergeOptionCounts(
				baseInputModalityOptions,
				countPreparedValues(withAllExcept("inputModalities"), (prepared) =>
					prepared.inputModalitiesSet.values(),
				),
				selectedInputModalities,
			),
			outputModalityOptions: mergeOptionCounts(
				baseOutputModalityOptions,
				countPreparedValues(withAllExcept("outputModalities"), (prepared) =>
					prepared.outputModalitiesSet.values(),
				),
				selectedOutputModalities,
			),
			featureOptions: mergeOptionCounts(
				baseFeatureOptions,
				countPreparedValues(withAllExcept("features"), (prepared) =>
					prepared.featuresSet.values(),
				),
				selectedFeatures,
			),
			tierOptions: mergeOptionCounts(
				baseTierOptions,
				countPreparedValues(withAllExcept("tiers"), (prepared) =>
					prepared.tiersSet.values(),
				),
				selectedTiers,
			),
			supportedParameterOptions: mergeOptionCounts(
				baseSupportedParameterOptions,
				countPreparedValues(withAllExcept("supportedParameters"), (prepared) =>
					prepared.supportedParametersSet.values(),
				),
				selectedSupportedParameters,
			),
			providerOptions: mergeOptionCounts(
				baseProviderOptions,
				countPreparedValues(withAllExcept("providers"), (prepared) =>
					prepared.providerNamesSet.values(),
				),
				selectedProviders,
			),
			regionOptions: mergeOptionCounts(
				baseRegionOptions,
				countPreparedValues(withAllExcept("regions"), (prepared) =>
					prepared.executionRegionsSet.values(),
				),
				selectedRegions,
			),
			creatorOptions: mergeOptionCounts(
				baseCreatorOptions,
				countPreparedValues(withAllExcept("creators"), (prepared) =>
					prepared.creator ? [prepared.creator] : [],
				),
				selectedCreators,
			),
			yearOptions: mergeOptionCounts(
				baseYearOptions,
				countPreparedValues(withAllExcept("years"), (prepared) =>
					prepared.modelYear ? [prepared.modelYear] : [],
				),
				selectedYears,
			),
		};
	}, [
		baseCreatorOptions,
		baseEndpointOptions,
		baseFeatureOptions,
		baseInputModalityOptions,
		baseOutputModalityOptions,
		baseProviderOptions,
		baseRegionOptions,
		baseSupportedParameterOptions,
		baseTierOptions,
		baseYearOptions,
		facets.statusCounts,
		matchesPreparedModel,
		preparedModels,
		sidebarCountsReady,
		selectedCreators,
		selectedEndpoints,
		selectedFeatures,
		selectedInputModalities,
		selectedOutputModalities,
		selectedProviders,
		selectedRegions,
		selectedSupportedParameters,
		selectedTiers,
		selectedYears,
	]);

	const resetFilters = () => {
		setHasInteractedWithStatuses(false);
		setSelectedStatuses([]);
		setSelectedEndpoints([]);
		setSelectedInputModalities([]);
		setSelectedOutputModalities([]);
		setSelectedFeatures([]);
		setSelectedTiers([]);
		setSelectedContextMin(0);
		setSelectedSupportedParameters([]);
		setSelectedProviders([]);
		setSelectedRegions([]);
		setSelectedCreators([]);
		setSelectedYears([]);
	};

	const resetResultsView = () => {
		setSearch(null);
		resetFilters();
	};

	const buildHref = (path: string, options?: { toTable?: boolean }) => {
		const params = new URLSearchParams(searchParams?.toString() ?? "");
		if (options?.toTable) {
			const qValue = params.get("q") ?? search ?? "";
			if (qValue.trim()) {
				params.set("search", qValue);
			} else {
				params.delete("search");
			}
			params.delete("q");
			const statuses = parseGatewayStatusParam(params.get("statuses"));
			if (statuses.length === 1) {
				params.set(
					"statuses",
					statuses[0] === "active"
						? "active"
						: statuses[0] === "coming_soon"
							? "coming_soon"
							: "inactive",
				);
			} else {
				params.delete("statuses");
			}
		}
		const qs = params.toString();
		return qs ? `${path}?${qs}` : path;
	};

	const gatewayStatusOptions: OptionCount[] = [
		{ value: "active", count: dynamicSidebarCounts.statusCounts.active },
		{
			value: "coming_soon",
			count: dynamicSidebarCounts.statusCounts.coming_soon,
		},
		{
			value: "not_active",
			count: dynamicSidebarCounts.statusCounts.not_active,
		},
	];
	const endpointOptions = useMemo(
		() =>
			[...dynamicSidebarCounts.endpointOptions].sort((a, b) => {
				const aRank = getEndpointSortRank(a.value);
				const bRank = getEndpointSortRank(b.value);
				if (aRank !== bRank) return aRank - bRank;
				if (a.count !== b.count) return b.count - a.count;
				return formatEndpointLabel(a.value).localeCompare(
					formatEndpointLabel(b.value),
				);
			}),
		[dynamicSidebarCounts.endpointOptions],
	);
	const inputModalityOptions = filterOutFileModality(
		dynamicSidebarCounts.inputModalityOptions,
	);
	const outputModalityOptions = dynamicSidebarCounts.outputModalityOptions;
	const featureOptions = dynamicSidebarCounts.featureOptions;
	const tierOptions = dynamicSidebarCounts.tierOptions;
	const supportedParameterOptions =
		dynamicSidebarCounts.supportedParameterOptions;
	const providerOptions = dynamicSidebarCounts.providerOptions;
	const regionOptions = useMemo(() => {
		const order = new Map<string, number>(
			REGION_DISPLAY_ORDER.map((value, index) => [value, index] as const),
		);
		return [...dynamicSidebarCounts.regionOptions].sort((a, b) => {
			const aKey = String(a.value ?? "")
				.trim()
				.toLowerCase();
			const bKey = String(b.value ?? "")
				.trim()
				.toLowerCase();
			const aIndex = order.get(aKey);
			const bIndex = order.get(bKey);
			if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
			if (aIndex !== undefined) return -1;
			if (bIndex !== undefined) return 1;
			return formatRegionLabel(a.value).localeCompare(
				formatRegionLabel(b.value),
			);
		});
	}, [dynamicSidebarCounts.regionOptions]);
	const creatorOptions = dynamicSidebarCounts.creatorOptions;
	const yearOptions = dynamicSidebarCounts.yearOptions;

	const handleFilterSectionChange = (sections: string[]) => {
		setOpenFilterSections(sections);
	};

	const shownCountLabel = `${filteredModels.length.toLocaleString()} shown`;
	const shownCountWithSearchLabel = search
		? `${shownCountLabel} for "${search}"`
		: shownCountLabel;
	const hasActiveResultsQuery =
		activeFilterCount > 0 || Boolean(String(search ?? "").trim());

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
						href={buildHref("/models/table", {
							toTable: true,
						})}
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
			value={selectedSort}
			onValueChange={(value) => {
				const nextSort = normalizeSortOption(value);
				setSort(nextSort === "newest" ? null : nextSort);
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
					<span className="truncate">{SORT_TRIGGER_LABELS[selectedSort]}</span>
				</span>
			</SelectTrigger>
			<SelectContent
				align="start"
				alignItemWithTrigger={false}
				className="!w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"
			>
				{MODELS_SORT_OPTIONS.map((option) => (
					<SelectItem key={option} value={option}>
						{SORT_OPTION_LABELS[option]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	const filtersContent = (
		<Accordion
			type="multiple"
			value={openFilterSections}
			onValueChange={handleFilterSectionChange}
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
						options={gatewayStatusOptions}
						selected={effectiveSelectedStatuses}
						onToggle={(value) => {
							setHasInteractedWithStatuses(true);
							setSelectedStatuses(
								toggleInList(effectiveSelectedStatuses, value),
							);
						}}
						labelForValue={(value) => {
							if (value === "active") return "Active On Gateway";
							if (value === "coming_soon") return "Coming Soon";
							return "Not Active";
						}}
						iconForValue={(value) => {
							if (value === "active") return Activity;
							if (value === "coming_soon") return Sparkles;
							return Database;
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
						labelForValue={(value) => value}
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
						labelForValue={(value) => value}
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
						labelForValue={formatEndpointLabel}
						iconForValue={getEndpointIcon}
						collapsedLimit={8}
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
						selected={selectedYears}
						onToggle={(value) =>
							setSelectedYears(toggleInList(selectedYears, value))
						}
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
				<div className="z-40 shrink-0 border-b border-border/70 bg-background/95 px-4 pb-1 pt-2.5 backdrop-blur md:sticky md:top-[3.75rem] lg:px-8">
					<div className="md:hidden space-y-2">
						{showPrimaryHeader ? (
							<div className="flex items-center gap-2">
								<h1 className="font-bold text-xl leading-8">Models</h1>
							</div>
						) : null}

						<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
							{sortSelect("h-8 min-w-0 rounded-md bg-background text-sm")}
							{filterButton(true)}
							{showPrimaryHeader ? viewSwitcher : null}
						</div>

						<div className="relative w-full">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
							<Input
								placeholder="Search"
								value={search}
								onChange={(e) =>
									setSearch(e.target.value || null, {
										limitUrlUpdates: debounce(250),
									})
								}
								className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
								style={{ minWidth: 0 }}
							/>
						</div>
					</div>

					<div className="hidden md:block">
						<div className="hidden lg:block">
							<div className="flex items-center justify-between gap-4">
								<div className="flex h-8 min-w-0 shrink-0 items-center">
									{showPrimaryHeader ? (
										<h1 className="font-bold text-xl leading-8">Models</h1>
									) : null}
								</div>

								<div className="flex min-w-0 flex-1 items-center justify-end gap-3">
									<div className="relative min-w-[15rem] max-w-[22rem] flex-1 2xl:max-w-[28rem]">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
										<Input
											placeholder="Search"
											value={search}
											onChange={(e) =>
												setSearch(e.target.value || null, {
													limitUrlUpdates: debounce(250),
												})
											}
											className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
											style={{ minWidth: 0 }}
										/>
									</div>
									{sortSelect(
										"h-8 w-[12.5rem] rounded-md bg-background text-sm 2xl:w-[13.5rem]",
									)}
									{showPrimaryHeader ? viewSwitcher : null}
								</div>
							</div>
						</div>

						<div className="lg:hidden">
							<div className="flex h-8 items-center justify-between gap-3">
								{showPrimaryHeader ? (
									<h1 className="font-bold text-xl leading-8">Models</h1>
								) : (
									<div />
								)}
								<div className="flex shrink-0 items-center justify-end gap-2">
									{filterButton()}
									{showPrimaryHeader ? viewSwitcher : null}
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
											setSearch(e.target.value || null, {
												limitUrlUpdates: debounce(250),
											})
										}
										className="h-8 rounded-md border border-border bg-background pl-9 pr-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
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

				<div className="w-full px-4 pt-1 pb-5 lg:px-8 lg:pt-1 lg:pb-6">
					{filteredModels.length > 0 ? (
						<ModelsGrid
							filteredModels={filteredModels}
							showOrganisationPrefix
						/>
					) : (
						<ModelsEmptyState
							hasActiveQuery={hasActiveResultsQuery}
							onReset={resetResultsView}
						/>
					)}
				</div>
			</section>

			{isMobileViewport ? (
				<Drawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
					<DrawerContent className="sm:hidden h-[85dvh] max-h-[85dvh] overflow-hidden gap-0 p-0">
						<DrawerHeader className="border-b border-border/70 px-4 py-3 text-left">
							<div className="flex items-start justify-between gap-3 pr-4">
								<div>
									<DrawerTitle>Filters</DrawerTitle>
									<DrawerDescription>Refine the models list.</DrawerDescription>
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
						</DrawerHeader>
						<ScrollArea
							className="min-h-0 h-full flex-1"
							viewportClassName="overscroll-y-contain"
						>
							<div className="space-y-4 px-4 py-2 pb-24">{filtersContent}</div>
						</ScrollArea>
					</DrawerContent>
				</Drawer>
			) : (
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
			)}

			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setMobileFiltersOpen(true)}
				className={cn(
					"fixed bottom-6 left-4 z-40 inline-flex h-11 items-center gap-2 rounded-full border border-border/70 !bg-background px-4 !text-foreground shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md dark:!border-zinc-800 dark:!bg-zinc-950 dark:!text-zinc-50 active:scale-95 md:hidden",
					showMobileFilterFab && !mobileFiltersOpen
						? "translate-y-0 opacity-100"
						: "pointer-events-none translate-y-3 opacity-0",
				)}
			>
				<SlidersHorizontal className="h-4 w-4" />
				<span>Filters</span>
				{activeFilterCount > 0 ? (
					<span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums">
						{activeFilterCount}
					</span>
				) : null}
			</Button>

			<button
				type="button"
				aria-label="Scroll to top"
				onClick={handleScrollToTop}
				className={cn(
					"group fixed bottom-6 right-9 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95",
					showScrollTopButton
						? "translate-y-0 opacity-100"
						: "pointer-events-none translate-y-3 opacity-0",
				)}
			>
				<ChevronUp className="h-6 w-6 transition-transform duration-500 ease-out group-hover:-translate-y-1" />
			</button>
		</div>
	);
}
