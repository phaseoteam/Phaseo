"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type DragEvent,
	type KeyboardEvent,
	type RefObject,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
	ArrowLeft,
	AudioLines,
	Bot,
	Brain,
	CalendarClock,
	Check,
	ChevronDown,
	ChevronRight,
	ClipboardCheck,
	CornerDownRight,
	Cpu,
	FileSearch,
	GripVertical,
	ImagePlus,
	Info,
	ListPlus,
	Mic,
	Paperclip,
	Pencil,
	Plus,
	SendHorizontal,
	Star,
	Square,
	type LucideIcon,
	Search,
	Settings2,
	Trash2,
	X,
} from "lucide-react";
import type {
	ChatAdvisorServerToolConfig,
	ChatDatetimeServerToolConfig,
	ChatFusionServerToolConfig,
	ChatImageGenerationServerToolConfig,
	ChatServerToolConfigs,
	ChatServerToolType,
	ChatSettings,
	ChatSubagentServerToolConfig,
	ChatWebFetchServerToolConfig,
	ChatWebSearchServerToolConfig,
} from "@/lib/indexeddb/chats";
import {
	DEFAULT_SERVER_TOOLS,
	type ModelOption,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	getDefaultFavoriteModelIds,
	groupModelsByReleaseMonth,
	MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
	normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import { Logo } from "@/components/Logo";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	ScrollArea,
	ScrollBar,
} from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SendGateType = "auth" | null;

type ReasoningOption = {
	value: NonNullable<ChatSettings["reasoningEffort"]>;
	label: string;
};

type SlashCommand = {
	id: string;
	label: string;
	description?: string;
	keywords: string[];
	icon?: LucideIcon;
	logoId?: string;
	disabled?: boolean;
	modelId?: string;
	serverToolType?: ChatServerToolType;
	selected?: boolean;
};

type SlashMenu = "main" | "reasoning" | "model" | "tools" | "tool-settings";

type ComposerModelOption = Pick<
	ModelOption,
	| "modelId"
	| "orgId"
	| "label"
	| "orgName"
	| "providerIds"
	| "providerNames"
	| "capabilityEndpoints"
	| "releaseDate"
	| "gatewayStatus"
>;

type ModelSlashGroup = {
	heading: string;
	commands: SlashCommand[];
};

const DEFAULT_SERVER_TOOL_SET = new Set<ChatServerToolType>(
	DEFAULT_SERVER_TOOLS,
);

const SERVER_TOOL_COMMANDS = [
	{
		id: "server-tool-web-search",
		label: "Web Search",
		toolType: "phaseo:web_search",
		description: "Model-directed web searches",
		keywords: ["server", "tool", "web", "search", "grounding", "current"],
		icon: Search,
	},
	{
		id: "server-tool-web-fetch",
		label: "Web Fetch",
		toolType: "phaseo:web_fetch",
		description: "Fetch and read URLs",
		keywords: ["server", "tool", "web", "fetch", "url", "page"],
		icon: FileSearch,
	},
	{
		id: "server-tool-image-generation",
		label: "Image Generation",
		toolType: "phaseo:image_generation",
		description: "Create images mid-request",
		keywords: ["server", "tool", "image", "generation", "create"],
		icon: ImagePlus,
	},
	{
		id: "server-tool-datetime",
		label: "Datetime",
		toolType: "gateway:datetime",
		description: "Current date and time",
		keywords: ["server", "tool", "datetime", "date", "time", "timezone"],
		icon: CalendarClock,
	},
	{
		id: "server-tool-fusion",
		label: "Fusion",
		toolType: "phaseo:fusion",
		description: "Synthesize multiple model outputs",
		keywords: ["server", "tool", "fusion", "synthesis", "combine"],
		icon: Cpu,
	},
	{
		id: "server-tool-advisor",
		label: "Advisor",
		toolType: "phaseo:advisor",
		description: "Consult another model",
		keywords: ["server", "tool", "advisor", "review", "second", "model"],
		icon: ClipboardCheck,
	},
	{
		id: "server-tool-sub-agent",
		label: "Sub-agent",
		toolType: "phaseo:subagent",
		description: "Delegate focused work to another agent",
		keywords: ["server", "tool", "sub", "agent", "delegate"],
		icon: Bot,
	},
] satisfies Array<{
	id: string;
	label: string;
	toolType: ChatServerToolType;
	description: string;
	keywords: string[];
	icon: LucideIcon;
}>;

const SERVER_TOOL_SETTING_LABELS: Record<ChatServerToolType, string> = {
	"gateway:datetime": "Datetime",
	"phaseo:web_search": "Web Search",
	"phaseo:web_fetch": "Web Fetch",
	"phaseo:advisor": "Advisor",
	"phaseo:image_generation": "Image Generation",
	"phaseo:apply_patch": "Apply Patch",
	"phaseo:fusion": "Fusion",
	"phaseo:subagent": "Sub-agent",
};

const WEB_SEARCH_ENGINE_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "native", label: "Native" },
	{ value: "exa", label: "Exa" },
	{ value: "parallel", label: "Parallel" },
	{ value: "firecrawl", label: "Firecrawl" },
	{ value: "perplexity", label: "Perplexity" },
] satisfies Array<{ value: NonNullable<ChatWebSearchServerToolConfig["engine"]>; label: string }>;

const WEB_FETCH_ENGINE_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "native", label: "Native" },
	{ value: "direct", label: "Direct" },
	{ value: "exa", label: "Exa" },
	{ value: "parallel", label: "Parallel" },
	{ value: "firecrawl", label: "Firecrawl" },
] satisfies Array<{ value: NonNullable<ChatWebFetchServerToolConfig["engine"]>; label: string }>;

const WEB_SEARCH_CONTEXT_OPTIONS = [
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
] satisfies Array<{
	value: NonNullable<ChatWebSearchServerToolConfig["searchContextSize"]>;
	label: string;
}>;

const IMAGE_QUALITY_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
] satisfies Array<{
	value: NonNullable<ChatImageGenerationServerToolConfig["quality"]>;
	label: string;
}>;

const IMAGE_ASPECT_RATIO_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "1:1", label: "1:1" },
	{ value: "16:9", label: "16:9" },
	{ value: "9:16", label: "9:16" },
	{ value: "4:3", label: "4:3" },
	{ value: "3:4", label: "3:4" },
];

const IMAGE_SIZE_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "1024x1024", label: "1024 x 1024" },
	{ value: "1536x1024", label: "1536 x 1024" },
	{ value: "1024x1536", label: "1024 x 1536" },
	{ value: "1792x1024", label: "1792 x 1024" },
	{ value: "1024x1792", label: "1024 x 1792" },
];

const IMAGE_BACKGROUND_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "transparent", label: "Transparent" },
	{ value: "opaque", label: "Opaque" },
] satisfies Array<{
	value: NonNullable<ChatImageGenerationServerToolConfig["background"]>;
	label: string;
}>;

const IMAGE_OUTPUT_FORMAT_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "png", label: "PNG" },
	{ value: "jpeg", label: "JPEG" },
	{ value: "webp", label: "WebP" },
] satisfies Array<{
	value: NonNullable<ChatImageGenerationServerToolConfig["outputFormat"]>;
	label: string;
}>;

const IMAGE_MODERATION_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "low", label: "Low" },
	{ value: "standard", label: "Standard" },
] satisfies Array<{
	value: NonNullable<ChatImageGenerationServerToolConfig["moderation"]>;
	label: string;
}>;

const EVALUATION_PROMPTS = [
	{
		title: "Palindrome Quest",
		description: "Find the next palindrome",
		prompt:
			"Find the smallest palindrome number greater than 12932. Explain your reasoning briefly.",
	},
	{
		title: "Car Wash Test",
		description: "Should you walk or drive?",
		prompt:
			"A person needs to go through a car wash. Should they walk through it or drive through it? Explain the safest and most sensible answer.",
	},
	{
		title: "Personal Finance",
		description: "Draft a portfolio proposal",
		prompt:
			"Draft a practical portfolio management proposal for a 35-year-old with moderate risk tolerance, a 20-year time horizon, and a preference for low-fee diversified funds.",
	},
	{
		title: "9.9 vs 9.11",
		description: "Which one is larger?",
		prompt: "Which is bigger, 9.11 or 9.9? Explain your answer briefly.",
	},
	{
		title: "The Missing Dollar",
		description: "Classic money logic puzzle",
		prompt:
			"Three guests pay $30 for a room. The manager realizes it should cost $25 and gives $5 to the bellhop to return. The bellhop keeps $2 and gives $1 back to each guest. Each guest paid $9, totaling $27, plus the bellhop's $2 makes $29. Where is the missing dollar?",
	},
	{
		title: "Career Development",
		description: "Build a growth roadmap",
		prompt:
			"Create a 90-day professional growth roadmap for a mid-level software engineer who wants to become a technical lead.",
	},
	{
		title: "Strawberry Test",
		description: "How many r's are in the word?",
		prompt:
			"How many times does the letter r appear in the word strawberry? Think carefully and answer with one sentence.",
	},
	{
		title: "Small Business Strategy",
		description: "Plan an expansion",
		prompt:
			"Develop a concise expansion plan for a small local coffee shop that wants to add online ordering and corporate catering.",
	},
	{
		title: "Poem Riddle",
		description: "Compose a 13-line poem",
		prompt:
			"Compose a 13-line poem where the first letter of each line spells REASONINGTEST.",
	},
	{
		title: "Alphabet Series",
		description: "Find the next letter",
		prompt:
			"What is the next letter in this sequence: A, C, F, J, O, ? Explain the pattern briefly.",
	},
	{
		title: "Healthy Lifestyle",
		description: "Diet and exercise plan",
		prompt:
			"Design a balanced weekly diet and exercise regimen for a busy office worker with beginner fitness experience.",
	},
	{
		title: "Anagram Challenge",
		description: "Unscramble the letters",
		prompt:
			"Unscramble the letters 'TCAOR' into a common English word. If there is more than one possibility, list them and explain which is most likely.",
	},
	{
		title: "Educational Advancement",
		description: "Plan higher education",
		prompt:
			"Create a decision plan for someone choosing between a part-time master's degree, a professional certificate, and self-study.",
	},
	{
		title: "Word Transformation",
		description: "Change one letter at a time",
		prompt:
			"Transform COLD into WARM by changing one letter at a time, with every intermediate step being a valid English word.",
	},
	{
		title: "JSON Only",
		description: "Return a strict object",
		prompt:
			"Return only valid JSON with keys answer, confidence, and reasoning. The question is: which is larger, 9.11 or 9.9?",
	},
];

const PROMPT_SCROLL_COPIES = [0, 1, 2];
const COMPOSER_LAYOUT_ANIMATION_MS = 220;
const COMPOSER_EXPAND_PROMPT_LENGTH = 60;
const MAX_COMPOSER_ADVISORS = 5;
const MAX_COMPOSER_FUSION_MODELS = 5;
const IMAGE_GENERATION_ENDPOINT = "images.generations";

function getDefaultAdvisorName(index: number) {
	return `advisor_${index + 1}`;
}

function normalizeAdvisorDisplayConfig(
	advisor: ChatAdvisorServerToolConfig | undefined,
	index: number,
) {
	const legacyNameMatch = advisor?.name?.trim().match(/^Advisor\s+(\d+)$/i);
	return {
		...(advisor ?? {}),
		name: legacyNameMatch
			? getDefaultAdvisorName(Number(legacyNameMatch[1]) - 1)
			: advisor?.name?.trim() || getDefaultAdvisorName(index),
	};
}

function getSupportedTimezoneOptions() {
	const fallback = [
		"UTC",
		"Europe/London",
		"America/New_York",
		"America/Los_Angeles",
		"Asia/Tokyo",
	];
	const supportedValuesOf = (
		Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
	).supportedValuesOf;
	try {
		const timezones = supportedValuesOf?.("timeZone") ?? fallback;
		return Array.from(new Set(["UTC", ...timezones])).sort((first, second) =>
			first.localeCompare(second),
		);
	} catch {
		return fallback;
	}
}

function getTimezoneOffsetMinutes(timezone: string, date = new Date()) {
	try {
		const offsetPart = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			timeZoneName: "shortOffset",
			hour: "2-digit",
		})
			.formatToParts(date)
			.find((part) => part.type === "timeZoneName")?.value;
		if (!offsetPart || offsetPart === "GMT" || offsetPart === "UTC") {
			return 0;
		}
		const match = offsetPart.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
		if (!match) return 0;
		const sign = match[1] === "-" ? -1 : 1;
		const hours = Number(match[2]);
		const minutes = Number(match[3] ?? "0");
		return sign * (hours * 60 + minutes);
	} catch {
		return 0;
	}
}

function formatTimezoneOffset(minutes: number) {
	if (minutes === 0) return "UTC";
	const sign = minutes < 0 ? "-" : "+";
	const absoluteMinutes = Math.abs(minutes);
	const hours = Math.floor(absoluteMinutes / 60);
	const remainder = absoluteMinutes % 60;
	return `UTC${sign}${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getSortedTimezoneOptions() {
	return getSupportedTimezoneOptions()
		.filter((timezone) => timezone !== "UTC")
		.map((timezone) => {
			const offsetMinutes = getTimezoneOffsetMinutes(timezone);
			return {
				value: timezone,
				label: `${timezone} (${formatTimezoneOffset(offsetMinutes)})`,
				offsetMinutes,
			};
		})
		.sort(
			(first, second) =>
				first.offsetMinutes - second.offsetMinutes ||
				first.value.localeCompare(second.value),
		);
}

function normalizeSlashQuery(value: string) {
	if (!value.startsWith("/")) return null;
	return value.slice(1).trim().toLowerCase();
}

function formatAttachmentSize(size: number) {
	if (!Number.isFinite(size) || size <= 0) return "0 B";

	const units = ["B", "KB", "MB", "GB"];
	let value = size;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const formatted =
		unitIndex === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
	return `${formatted} ${units[unitIndex]}`;
}

function getReadableTextColor(backgroundColor: string) {
	const hex = backgroundColor.trim().replace(/^#/, "");
	const normalized =
		hex.length === 3
			? hex
					.split("")
					.map((char) => `${char}${char}`)
					.join("")
			: hex;
	if (!/^[0-9a-f]{6}$/i.test(normalized)) return undefined;
	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
	return luminance > 0.58 ? "#111111" : "#ffffff";
}

function getAttachmentDescription(file: File) {
	if (file.type.startsWith("audio/")) {
		return ["Audio", formatAttachmentSize(file.size)].join(" - ");
	}
	return [file.type || "File", formatAttachmentSize(file.size)].join(" - ");
}

function getAudioAttachmentTitle(file: File) {
	const match = file.name.match(
		/^Voice note (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})\./,
	);
	if (!match) return file.name;
	const [, year, month, day, hour, minute] = match;
	return `Voice note ${day}/${month}/${year} ${hour}:${minute}`;
}

function getSafeAttachmentPreviewUrl(value: string | null | undefined) {
	if (!value) return null;
	return value.startsWith("blob:") ? value : null;
}

function formatRecordingDuration(milliseconds: number) {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function RecordingWaveform({
	bars,
	durationMs,
}: {
	bars: number[];
	durationMs: number;
}) {
	return (
		<div
			role="status"
			aria-label="Recording audio"
			className="order-1 flex min-h-9 w-full min-w-0 flex-1 items-center gap-2 px-2 sm:order-2"
		>
			<span className="sr-only">Recording audio</span>
			<div className="flex h-10 min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
				{bars.map((height, index) => (
					<span
						key={index}
						className="min-w-px flex-1 rounded-full bg-muted-foreground/75 transition-[height] duration-75 ease-linear"
						style={{
							height,
						}}
					/>
				))}
			</div>
			<span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
				{formatRecordingDuration(durationMs)}
			</span>
		</div>
	);
}

function ComposerModelSelectField({
	label,
	value,
	options,
	autoLabel,
	allowAuto = true,
	onChange,
}: {
	label: string;
	value?: string;
	options: ComposerModelOption[];
	autoLabel: string;
	allowAuto?: boolean;
	onChange: (value: string | undefined) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selectedModel = options.find((option) => option.modelId === value);
	const selectedLabel = selectedModel
		? `${selectedModel.orgName}: ${selectedModel.label}`
		: autoLabel;
	const filteredOptions = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return options;
		return options.filter((option) =>
			[
				option.label,
				option.orgName,
				option.orgId,
				option.modelId,
				...option.providerNames,
				...option.providerIds,
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [options, search]);

	const handleSelect = (nextValue: string | undefined) => {
		onChange(nextValue);
		setOpen(false);
		setSearch("");
	};

	return (
		<div className="grid gap-1 text-[11px] text-muted-foreground">
			<span>{label}</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted px-2 text-left text-xs text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
					>
						<span className="flex min-w-0 items-center gap-2">
							{selectedModel ? (
								<Logo
									id={selectedModel.orgId}
									alt={selectedModel.orgName}
									width={16}
									height={16}
									className="size-4 shrink-0 rounded-sm"
								/>
							) : null}
							<span className="truncate">{selectedLabel}</span>
						</span>
						<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
					</button>
				</PopoverTrigger>
				<PopoverContent
					data-chat-composer-nested-popover="true"
					align="start"
					sideOffset={6}
					className="w-[min(30rem,calc(100vw-2rem))] gap-1 rounded-2xl p-1"
				>
					<div className="p-1">
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							onKeyDown={(event) => event.stopPropagation()}
							placeholder="Search models..."
							className="h-8 rounded-xl bg-input/50 text-xs"
						/>
					</div>
					<ScrollArea className="h-72" viewportClassName="pr-2">
						<div className="grid gap-0.5 p-1">
							{allowAuto ? (
								<button
									type="button"
									className={cn(
										"flex min-h-7 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
										!selectedModel && "bg-muted",
									)}
									onClick={() => handleSelect(undefined)}
								>
									<span className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-border text-[10px] text-muted-foreground">
										A
									</span>
									<span className="min-w-0 flex-1 truncate">{autoLabel}</span>
									{!selectedModel ? (
										<Check className="size-3.5 shrink-0 text-foreground" />
									) : null}
								</button>
							) : null}
							{filteredOptions.map((option) => {
								const selected = option.modelId === value;
								return (
									<button
										type="button"
										key={option.modelId}
										className={cn(
											"flex min-h-7 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
											selected && "bg-muted",
										)}
										onClick={() => handleSelect(option.modelId)}
									>
										<Logo
											id={option.orgId}
											alt={option.orgName}
											width={16}
											height={16}
											className="size-4 shrink-0 rounded-sm"
										/>
										<span className="min-w-0 flex-1 truncate">
											{option.orgName}: {option.label}
										</span>
										{selected ? (
											<Check className="size-3.5 shrink-0 text-foreground" />
										) : null}
									</button>
								);
							})}
							{filteredOptions.length === 0 ? (
								<div className="px-2 py-6 text-center text-xs text-muted-foreground">
									No models found.
								</div>
							) : null}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}

function ComposerTimezoneSelectField({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value?: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string | undefined) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selectedOption =
		value === "UTC"
			? { value: "UTC", label: "UTC" }
			: options.find((option) => option.value === value);
	const selectedLabel = selectedOption?.label ?? "Auto";
	const filteredOptions = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return options;
		return options.filter((option) =>
			`${option.value} ${option.label}`.toLowerCase().includes(query),
		);
	}, [options, search]);

	const handleSelect = (nextValue: string | undefined) => {
		onChange(nextValue);
		setOpen(false);
		setSearch("");
	};

	return (
		<div className="grid gap-1 text-[11px] text-muted-foreground">
			<span>{label}</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted px-2 text-left text-xs text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
					>
						<span className="min-w-0 truncate">{selectedLabel}</span>
						<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
					</button>
				</PopoverTrigger>
				<PopoverContent
					data-chat-composer-nested-popover="true"
					align="start"
					sideOffset={6}
					className="w-[min(24rem,calc(100vw-2rem))] gap-1 rounded-2xl p-1"
				>
					<div className="p-1">
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							onKeyDown={(event) => event.stopPropagation()}
							placeholder="Search timezones..."
							className="h-8 rounded-xl bg-input/50 text-xs"
						/>
					</div>
					<div className="grid gap-0.5 px-1 pb-1">
						<button
							type="button"
							className={cn(
								"flex min-h-7 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
								!value && "bg-muted",
							)}
							onClick={() => handleSelect(undefined)}
						>
							<span className="min-w-0 flex-1 truncate">Auto</span>
							<span className="text-[11px] text-muted-foreground">
								Browser + UTC
							</span>
							{!value ? <Check className="size-3.5 shrink-0" /> : null}
						</button>
						<button
							type="button"
							className={cn(
								"flex min-h-7 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
								value === "UTC" && "bg-muted",
							)}
							onClick={() => handleSelect("UTC")}
						>
							<span className="min-w-0 flex-1 truncate">UTC</span>
							{value === "UTC" ? (
								<Check className="size-3.5 shrink-0" />
							) : null}
						</button>
					</div>
					<div className="mx-1 border-t border-border" />
					<ScrollArea className="h-64" viewportClassName="pr-2">
						<div className="grid gap-0.5 p-1">
							{filteredOptions.map((option) => {
								const selected = option.value === value;
								return (
									<button
										type="button"
										key={option.value}
										className={cn(
											"flex min-h-7 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
											selected && "bg-muted",
										)}
										onClick={() => handleSelect(option.value)}
									>
										<span className="min-w-0 flex-1 truncate">
											{option.label}
										</span>
										{selected ? (
											<Check className="size-3.5 shrink-0" />
										) : null}
									</button>
								);
							})}
							{filteredOptions.length === 0 ? (
								<div className="px-2 py-6 text-center text-xs text-muted-foreground">
									No timezones found.
								</div>
							) : null}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	);
}

interface ChatConversationComposerProps {
	sendGateType: SendGateType;
	isSending: boolean;
	composer: string;
	promptHistory?: string[];
	attachments: File[];
	attachmentPreviewUrls: Array<string | null>;
	placeholder: string;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	fileInputRef: RefObject<HTMLInputElement | null>;
	audioInputRef: RefObject<HTMLInputElement | null>;
	isUnified: boolean;
	accentColor: string;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	serverTools: ChatServerToolType[];
	onServerToolsChange?: (tools: ChatServerToolType[]) => void;
	serverToolConfigs: ChatServerToolConfigs;
	onServerToolConfigsChange?: (configs: ChatServerToolConfigs) => void;
	showEvaluationPrompts: boolean;
	reasoningEnabled: boolean;
	reasoningPickerOpen: boolean;
	onReasoningPickerOpenChange: (open: boolean) => void;
	reasoningSelection: NonNullable<ChatSettings["reasoningEffort"]>;
	reasoningOptions: ReasoningOption[];
	onReasoningSelection: (
		value: NonNullable<ChatSettings["reasoningEffort"]>,
	) => void;
	selectedModelCount: number;
	selectedModelsHint?: string;
	selectedModelIds: string[];
	selectedModelId: string;
	selectedModelLabel: string;
	modelOptions: ComposerModelOption[];
	isRecording: boolean;
	recordingWaveformBars: number[];
	recordingDurationMs: number;
	isStartingRecording: boolean;
	recordingSupported: boolean;
	onToggleRecording: () => void;
	onToggleModel: (modelId: string) => void;
	onSubmit: () => void;
	queuedPrompts?: Array<{
		id: string;
		content: string;
		attachmentCount: number;
	}>;
	onRemoveQueuedPrompt?: (id: string) => void;
	onEditQueuedPrompt?: (id: string) => void;
	onReorderQueuedPrompt?: (activeId: string, targetId: string) => void;
	onSelectEvaluationPrompt: (prompt: string) => void;
	onComposerChange: (value: string) => void;
	onRemoveAttachment: (index: number) => void;
	onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function ChatConversationComposer(props: ChatConversationComposerProps) {
	const {
		sendGateType,
		isSending,
		composer,
		promptHistory = [],
		attachments,
		attachmentPreviewUrls,
		placeholder,
		textareaRef,
		fileInputRef,
		audioInputRef,
		isUnified,
		accentColor,
		serverTools,
		onServerToolsChange,
		serverToolConfigs,
		onServerToolConfigsChange,
		showEvaluationPrompts,
		reasoningSelection,
		reasoningOptions,
		onReasoningSelection,
		selectedModelCount,
		selectedModelsHint,
		selectedModelIds,
		selectedModelId,
		selectedModelLabel,
		modelOptions,
		isRecording,
		recordingWaveformBars,
		recordingDurationMs,
		isStartingRecording,
		recordingSupported,
		onToggleRecording,
		onToggleModel,
		onSubmit,
		queuedPrompts = [],
		onRemoveQueuedPrompt,
		onEditQueuedPrompt,
		onReorderQueuedPrompt,
		onSelectEvaluationPrompt,
		onComposerChange,
		onRemoveAttachment,
		onFileSelect,
	} = props;
	const promptScrollAreaRef = useRef<HTMLDivElement | null>(null);
	const composerCommandRootRef = useRef<HTMLDivElement | null>(null);
	const composerLeftControlsRef = useRef<HTMLDivElement | null>(null);
	const composerSendControlsRef = useRef<HTMLDivElement | null>(null);
	const composerLayoutAnimationsRef = useRef<Animation[]>([]);
	const previousComposerLayoutRectsRef = useRef<Map<string, DOMRect>>(
		new Map(),
	);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
	const [slashMenu, setSlashMenu] = useState<SlashMenu>("main");
	const [selectedServerToolSettings, setSelectedServerToolSettings] =
		useState<ChatServerToolType | null>(null);
	const [selectedAdvisorIndex, setSelectedAdvisorIndex] = useState(0);
	const [commandMenuOpen, setCommandMenuOpen] = useState(false);
	const [commandSearch, setCommandSearch] = useState("");
	const [draggingQueuedPromptId, setDraggingQueuedPromptId] = useState<
		string | null
	>(null);
	const [historyIndex, setHistoryIndex] = useState<number | null>(null);
	const [historyDraft, setHistoryDraft] = useState("");
	const [favoriteModelIdSet, setFavoriteModelIdSet] = useState<Set<string>>(
		() => new Set(getDefaultFavoriteModelIds()),
	);
	const slashSearchInputRef = useRef<HTMLInputElement | null>(null);
	const slashQuery = normalizeSlashQuery(composer);
	const slashMenuOpen = !isRecording && (commandMenuOpen || slashQuery !== null);
	const activeSlashSearchValue =
		slashMenu === "main" ? (slashQuery ?? "") : commandSearch;
	const showSlashSearch =
		slashMenuOpen && slashMenu !== "main" && slashMenu !== "tool-settings";

	useEffect(() => {
		if (isRecording) {
			setCommandMenuOpen(false);
			setCommandSearch("");
		}
	}, [isRecording]);
	const hasComposerContent =
		(composer.trim().length > 0 && slashQuery === null) ||
		attachments.length > 0;
	const hasSelectedModel =
		selectedModelIds.length > 0 ||
		selectedModelCount > 0 ||
		Boolean(selectedModelId);
	const canSubmit =
		!isRecording && hasSelectedModel && !slashMenuOpen && hasComposerContent;
	const showChooseModelTooltip = !hasSelectedModel && hasComposerContent;
	const resetPromptHistoryNavigation = useCallback(() => {
		setHistoryIndex(null);
		setHistoryDraft("");
	}, []);
	const moveComposerCursorToEnd = useCallback(
		(value: string) => {
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (!textarea) return;
				textarea.setSelectionRange(value.length, value.length);
			});
		},
		[textareaRef],
	);
	const handleComposerChange = useCallback(
		(value: string) => {
			if (historyIndex !== null) {
				resetPromptHistoryNavigation();
			}
			onComposerChange(value);
			if (commandMenuOpen && !value.startsWith("/")) {
				setCommandMenuOpen(false);
			}
		},
		[
			commandMenuOpen,
			historyIndex,
			onComposerChange,
			resetPromptHistoryNavigation,
		],
	);
	const handleComposerSubmit = useCallback(() => {
		resetPromptHistoryNavigation();
		onSubmit();
	}, [onSubmit, resetPromptHistoryNavigation]);
	const handlePromptHistoryKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				event.nativeEvent.isComposing ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey
			) {
				return false;
			}

			if (event.key === "ArrowUp") {
				if (promptHistory.length === 0) return false;

				const textarea = event.currentTarget;
				const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
				if (
					historyIndex === null &&
					(composer.length > 0 || textarea.selectionStart > 0 || hasSelection)
				) {
					return false;
				}

				event.preventDefault();
				const nextIndex =
					historyIndex === null
						? promptHistory.length - 1
						: Math.max(historyIndex - 1, 0);
				if (historyIndex === null) {
					setHistoryDraft(composer);
				}
				const nextPrompt = promptHistory[nextIndex] ?? "";
				setHistoryIndex(nextIndex);
				onComposerChange(nextPrompt);
				moveComposerCursorToEnd(nextPrompt);
				return true;
			}

			if (event.key === "ArrowDown") {
				if (historyIndex === null) return false;

				event.preventDefault();
				const nextIndex = historyIndex + 1;
				if (nextIndex >= promptHistory.length) {
					const nextPrompt = historyDraft;
					resetPromptHistoryNavigation();
					onComposerChange(nextPrompt);
					moveComposerCursorToEnd(nextPrompt);
					return true;
				}

				const nextPrompt = promptHistory[nextIndex] ?? "";
				setHistoryIndex(nextIndex);
				onComposerChange(nextPrompt);
				moveComposerCursorToEnd(nextPrompt);
				return true;
			}

			return false;
		},
		[
			composer,
			historyDraft,
			historyIndex,
			moveComposerCursorToEnd,
			onComposerChange,
			promptHistory,
			resetPromptHistoryNavigation,
		],
	);
	const enabledServerToolSet = useMemo(
		() => new Set<ChatServerToolType>(serverTools),
		[serverTools],
	);
	const defaultServerToolsDisabled = DEFAULT_SERVER_TOOLS.some(
		(toolType) => !enabledServerToolSet.has(toolType),
	);
	const activeCustomServerTools = useMemo(
		() =>
			SERVER_TOOL_COMMANDS.filter(
				(tool) =>
					!DEFAULT_SERVER_TOOL_SET.has(tool.toolType) &&
					enabledServerToolSet.has(tool.toolType),
			),
		[enabledServerToolSet],
	);
	const activeInlineTools = useMemo(() => {
		const commands: SlashCommand[] = [];
		if (defaultServerToolsDisabled) {
			commands.push({
				id: "tools",
				label: "Tools changed",
				description: "Datetime off",
				keywords: ["tools", "server", "datetime", "disabled", "settings"],
				icon: Settings2,
			});
		}
		for (const tool of activeCustomServerTools) {
			commands.push({
				id: tool.id,
				label: tool.label,
				description: tool.description,
				keywords: tool.keywords,
				icon: tool.icon,
				serverToolType: tool.toolType,
				selected: true,
			});
		}
		return commands;
	}, [activeCustomServerTools, defaultServerToolsDisabled]);
	const trimmedComposer = composer.trim();
	const promptNeedsExpandedComposer =
		trimmedComposer.length >= COMPOSER_EXPAND_PROMPT_LENGTH ||
		trimmedComposer.includes("\n");
	const composerExpanded =
		activeInlineTools.length > 0 ||
		promptNeedsExpandedComposer;
	const advisorConfigs = useMemo(() => {
		const advisors =
			serverToolConfigs.advisors && serverToolConfigs.advisors.length > 0
				? serverToolConfigs.advisors
				: [serverToolConfigs.advisor ?? {}];
		return advisors
			.slice(0, MAX_COMPOSER_ADVISORS)
			.map((advisor, index) => normalizeAdvisorDisplayConfig(advisor, index));
	}, [serverToolConfigs.advisor, serverToolConfigs.advisors]);
	const advisorIndex = Math.min(
		selectedAdvisorIndex,
		Math.max(advisorConfigs.length - 1, 0),
	);
	const advisorConfig = advisorConfigs[advisorIndex] ?? {};
	const datetimeConfig = serverToolConfigs.datetime ?? {};
	const webSearchConfig = serverToolConfigs.webSearch ?? {};
	const webFetchConfig = serverToolConfigs.webFetch ?? {};
	const imageGenerationConfig = serverToolConfigs.imageGeneration ?? {};
	const fusionConfig = serverToolConfigs.fusion ?? {};
	const fusionModelIds = useMemo(
		() =>
			(fusionConfig.models ?? [])
				.map((modelId) => modelId.trim())
				.slice(0, MAX_COMPOSER_FUSION_MODELS),
		[fusionConfig.models],
	);
	const subagentConfig = serverToolConfigs.subagent ?? {};
	const timezoneOptions = useMemo(
		() => getSortedTimezoneOptions(),
		[],
	);
	const activeModelOptions = useMemo(
		() => modelOptions.filter((option) => option.gatewayStatus === "active"),
		[modelOptions],
	);
	const imageGenerationModelOptions = useMemo(() => {
		const supportedOptions = activeModelOptions.filter((option) =>
			option.capabilityEndpoints.includes(IMAGE_GENERATION_ENDPOINT),
		);
		return supportedOptions.length > 0 ? supportedOptions : activeModelOptions;
	}, [activeModelOptions]);
	const advisorReasoningOptions = useMemo<
		Array<{
			value: NonNullable<ChatAdvisorServerToolConfig["reasoningEffort"]>;
			label: string;
		}>
	>(
		() => [
			{ value: "none", label: "Default" },
			...reasoningOptions
				.filter((option) => option.value !== "none")
				.map((option) => ({
					value: option.value,
					label: option.label,
				})),
		],
		[reasoningOptions],
	);
	const advisorEnabled = enabledServerToolSet.has("phaseo:advisor");
	const selectedServerToolCommand = selectedServerToolSettings
		? SERVER_TOOL_COMMANDS.find(
				(command) => command.toolType === selectedServerToolSettings,
			) ?? null
		: null;
	const writeAdvisorConfigs = useCallback(
		(nextAdvisors: ChatAdvisorServerToolConfig[]) => {
			const normalizedAdvisors = nextAdvisors
				.slice(0, MAX_COMPOSER_ADVISORS)
				.map((advisor, index) => normalizeAdvisorDisplayConfig(advisor, index));
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				advisor: normalizedAdvisors[0] ?? {},
				advisors: normalizedAdvisors,
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);
	const updateAdvisorConfig = useCallback(
		(partial: Partial<ChatAdvisorServerToolConfig>) => {
			const nextAdvisors = [...advisorConfigs];
			nextAdvisors[advisorIndex] = {
				...(nextAdvisors[advisorIndex] ?? {}),
				...partial,
			};
			writeAdvisorConfigs(nextAdvisors);
		},
		[advisorConfigs, advisorIndex, writeAdvisorConfigs],
	);
	const addAdvisorConfig = useCallback(() => {
		if (advisorConfigs.length >= MAX_COMPOSER_ADVISORS) return;
		const nextIndex = advisorConfigs.length;
		writeAdvisorConfigs([
			...advisorConfigs,
			{
				name: getDefaultAdvisorName(nextIndex),
				maxUses: 1,
			},
		]);
		setSelectedAdvisorIndex(nextIndex);
	}, [advisorConfigs, writeAdvisorConfigs]);
	const removeAdvisorConfig = useCallback(() => {
		if (advisorConfigs.length <= 1) return;
		const nextAdvisors = advisorConfigs.filter(
			(_, index) => index !== advisorIndex,
		);
		writeAdvisorConfigs(nextAdvisors);
		setSelectedAdvisorIndex(Math.max(0, advisorIndex - 1));
	}, [advisorConfigs, advisorIndex, writeAdvisorConfigs]);
	const updateDatetimeConfig = useCallback(
		(partial: Partial<ChatDatetimeServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				datetime: {
					...(serverToolConfigs.datetime ?? {}),
					...partial,
				},
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);
	const updateWebSearchConfig = useCallback(
		(partial: Partial<ChatWebSearchServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				webSearch: {
					...(serverToolConfigs.webSearch ?? {}),
					...partial,
				},
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);
	const updateWebFetchConfig = useCallback(
		(partial: Partial<ChatWebFetchServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				webFetch: {
					...(serverToolConfigs.webFetch ?? {}),
					...partial,
				},
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);
	const updateImageGenerationConfig = useCallback(
		(partial: Partial<ChatImageGenerationServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				imageGeneration: {
					...(serverToolConfigs.imageGeneration ?? {}),
					...partial,
				},
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);
	const updateFusionConfig = useCallback(
		(partial: Partial<ChatFusionServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				fusion: {
					...(serverToolConfigs.fusion ?? {}),
					...partial,
				},
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);
	const updateFusionModel = useCallback(
		(index: number, model: string | undefined) => {
			const nextModels = [...fusionModelIds];
			if (model) {
				nextModels[index] = model;
			} else {
				nextModels.splice(index, 1);
			}
			updateFusionConfig({
				models: Array.from(new Set(nextModels.filter(Boolean))).slice(
					0,
					MAX_COMPOSER_FUSION_MODELS,
				),
			});
		},
		[fusionModelIds, updateFusionConfig],
	);
	const addFusionModel = useCallback(() => {
		if (fusionModelIds.length >= MAX_COMPOSER_FUSION_MODELS) return;
		updateFusionConfig({ models: [...fusionModelIds, ""] });
	}, [fusionModelIds, updateFusionConfig]);
	const updateSubagentConfig = useCallback(
		(partial: Partial<ChatSubagentServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				subagent: {
					...(serverToolConfigs.subagent ?? {}),
					...partial,
				},
			});
		},
		[onServerToolConfigsChange, serverToolConfigs],
	);

	const parseOptionalNumber = useCallback((value: string) => {
		if (value.trim() === "") return null;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}, []);

	const renderSelectField = <T extends string,>({
		label,
		value,
		options,
		onChange,
	}: {
		label: string;
		value: T;
		options: Array<{ value: T; label: string }>;
		onChange: (value: T) => void;
	}) => {
		const selectedOption = options.find((option) => option.value === value);
		return (
			<div className="grid gap-1 text-[11px] text-muted-foreground">
				<span>{label}</span>
				<Select
					value={value}
					onValueChange={(nextValue) => onChange(nextValue as T)}
				>
					<SelectTrigger
						size="sm"
						className="h-8 w-full rounded-lg border-border bg-muted px-2 text-xs text-foreground"
					>
						<SelectValue>
							{selectedOption?.label ?? value}
						</SelectValue>
					</SelectTrigger>
					<SelectContent
						align="start"
						alignItemWithTrigger={false}
						className="min-w-[var(--anchor-width)] rounded-lg"
					>
						{options.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		);
	};

	const setServerToolEnabled = useCallback(
		(toolType: ChatServerToolType, enabled: boolean) => {
			const nextTools = new Set<ChatServerToolType>(serverTools);
			if (enabled) {
				nextTools.add(toolType);
			} else {
				nextTools.delete(toolType);
			}
			onServerToolsChange?.(
				SERVER_TOOL_COMMANDS.map((tool) => tool.toolType).filter((candidate) =>
					nextTools.has(candidate),
				),
			);
		},
		[onServerToolsChange, serverTools],
	);

	useEffect(() => {
		setSlashSelectedIndex(0);
	}, [slashMenu, activeSlashSearchValue]);

	useEffect(() => {
		if (!slashMenuOpen) {
			setSlashMenu("main");
			setSelectedServerToolSettings(null);
			setCommandSearch("");
		}
	}, [slashMenuOpen]);

	useEffect(() => {
		if (!showSlashSearch) return;
		let secondFrame: number | null = null;
		const firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => {
				slashSearchInputRef.current?.focus({ preventScroll: true });
			});
		});
		return () => {
			cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) {
				cancelAnimationFrame(secondFrame);
			}
		};
	}, [showSlashSearch, slashMenu]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const availableFavoriteIds = new Set(
			modelOptions.map((option) => normalizeFavoriteModelId(option.modelId)),
		);
		const fallbackIds = getDefaultFavoriteModelIds().filter((id) =>
			availableFavoriteIds.has(id),
		);
		const raw = window.localStorage.getItem(
			MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
		);
		if (!raw) {
			setFavoriteModelIdSet(new Set(fallbackIds));
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			const next = Array.isArray(parsed)
				? parsed
						.map((value) => normalizeFavoriteModelId(String(value)))
						.filter((id) => availableFavoriteIds.has(id))
				: fallbackIds;
			setFavoriteModelIdSet(new Set(next));
		} catch {
			setFavoriteModelIdSet(new Set(fallbackIds));
		}
	}, [modelOptions]);

	const toggleSlashCommandMenu = useCallback(() => {
		if (slashMenuOpen) {
			setCommandMenuOpen(false);
			setSlashMenu("main");
			setCommandSearch("");
			if (slashQuery !== null) {
				onComposerChange("");
			}
			requestAnimationFrame(() => {
				textareaRef.current?.focus();
			});
			return;
		}
		setCommandMenuOpen(true);
		setSlashMenu("main");
		setSlashSelectedIndex(0);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
		});
	}, [onComposerChange, slashMenuOpen, slashQuery, textareaRef]);

	const openSlashSubmenu = useCallback(
		(nextMenu: SlashMenu, selectedIndex = 0) => {
			setCommandMenuOpen(true);
			setSlashMenu(nextMenu);
			setCommandSearch("");
			setSlashSelectedIndex(Math.max(selectedIndex, 0));
			if (slashQuery !== null) {
				onComposerChange("");
			}
			requestAnimationFrame(() => {
				slashSearchInputRef.current?.focus({ preventScroll: true });
			});
		},
		[onComposerChange, slashQuery],
	);

	const clearSlashCommand = useCallback(() => {
		if (slashMenuOpen) {
			setCommandMenuOpen(false);
			if (slashQuery !== null) {
				onComposerChange("");
			}
		}
		setSlashMenu("main");
		setCommandSearch("");
		requestAnimationFrame(() => {
			document
				.querySelector<HTMLTextAreaElement>(
					"[data-chat-composer-input='true']",
				)
				?.focus();
		});
	}, [onComposerChange, slashMenuOpen, slashQuery]);

	const closeSlashCommandWithoutFocus = useCallback(() => {
		if (slashMenuOpen) {
			setCommandMenuOpen(false);
			if (slashQuery !== null) {
				onComposerChange("");
			}
		}
		setSlashMenu("main");
		setSelectedServerToolSettings(null);
		setCommandSearch("");
	}, [onComposerChange, slashMenuOpen, slashQuery]);

	useEffect(() => {
		if (!slashMenuOpen) return;

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (composerCommandRootRef.current?.contains(target)) return;
			if (target.closest("[data-chat-composer-nested-popover='true']")) return;
			if (target.closest("[data-slot='select-content']")) return;

			closeSlashCommandWithoutFocus();
		};

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, [closeSlashCommandWithoutFocus, slashMenuOpen]);

	const slashCommands = useMemo<SlashCommand[]>(() => {
		const commands: SlashCommand[] = [
			{
				id: "attach",
				label: "Upload from device",
				keywords: ["attach", "attachment", "file", "upload"],
				icon: Paperclip,
				disabled: !isUnified,
			},
			{
				id: "model",
				label: "Model",
				description:
					selectedModelCount > 1
						? selectedModelsHint ?? `${selectedModelCount} models selected`
						: selectedModelId || selectedModelLabel,
				keywords: ["model", "models", "provider", "swap"],
				icon: Cpu,
			},
			{
				id: "reasoning",
				label: "Reasoning",
				description:
					reasoningOptions.find(
						(option) => option.value === reasoningSelection,
					)?.label ?? "Medium",
				keywords: ["reasoning", "think", "effort"],
				icon: Brain,
			},
			{
				id: "tools",
				label: "Tools",
				description: [
					enabledServerToolSet.has("phaseo:web_search")
						? "Web Search on"
						: "Web Search off",
					defaultServerToolsDisabled
						? "Datetime off"
						: activeCustomServerTools.length > 0
							? `${activeCustomServerTools.length} extra`
							: "Datetime enabled",
				].join(" - "),
				keywords: ["tools", "api", "server", "context", "web", "search"],
				icon: Settings2,
				disabled: !isUnified || !onServerToolsChange,
			},
		];

		return commands;
	}, [
		activeCustomServerTools.length,
		defaultServerToolsDisabled,
		isUnified,
		enabledServerToolSet,
		onServerToolsChange,
		reasoningOptions,
		reasoningSelection,
		selectedModelCount,
		selectedModelId,
		selectedModelLabel,
		selectedModelsHint,
	]);

	const reasoningSlashCommands = useMemo<SlashCommand[]>(() => {
		return reasoningOptions.map((option) => ({
				id: `reasoning-${option.value}`,
				label: option.label,
				keywords: ["reasoning", "think", "effort", option.value, option.label],
				icon: Brain,
				selected: reasoningSelection === option.value,
			}));
	}, [
		reasoningOptions,
		reasoningSelection,
	]);

	const modelSlashGroups = useMemo<ModelSlashGroup[]>(() => {
		const optionById = new Map(
			activeModelOptions.map((option) => [option.modelId, option]),
		);
		const selectedIdSet = new Set(selectedModelIds);
		const selectedOptions = selectedModelIds
			.map((modelId) => optionById.get(modelId))
			.filter((option): option is ComposerModelOption => Boolean(option));
		const favoriteOptions = activeModelOptions.filter(
			(option) =>
				!selectedIdSet.has(option.modelId) &&
				favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId)),
		);
		const groupedOptions = groupModelsByReleaseMonth(
			activeModelOptions.filter(
				(option) =>
					!selectedIdSet.has(option.modelId) &&
					!favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId)),
			),
		);
		const toCommand = (option: ComposerModelOption): SlashCommand => ({
			id: `model-${option.modelId}`,
			label: option.label,
			keywords: [
				"model",
				"models",
				option.modelId,
				option.label,
				option.orgId,
				option.orgName,
				...option.providerIds,
				...option.providerNames,
			],
			icon: Cpu,
			logoId: option.orgId,
			modelId: option.modelId,
			selected: selectedIdSet.has(option.modelId),
		});
		const groups: ModelSlashGroup[] = [];
		if (selectedOptions.length > 0) {
			groups.push({
				heading: "Selected",
				commands: selectedOptions.map(toCommand),
			});
		}
		if (favoriteOptions.length > 0) {
			groups.push({
				heading: "Favourites",
				commands: favoriteOptions.map(toCommand),
			});
		}
		for (const group of groupedOptions) {
			groups.push({
				heading: group.heading,
				commands: group.items.map(toCommand),
			});
		}
		return groups;
	}, [activeModelOptions, favoriteModelIdSet, selectedModelIds]);

	const modelSlashCommands = useMemo<SlashCommand[]>(
		() => modelSlashGroups.flatMap((group) => group.commands),
		[modelSlashGroups],
	);

	const toolsSlashCommands = useMemo<SlashCommand[]>(
		() =>
			SERVER_TOOL_COMMANDS.map((tool) => {
				const selected = enabledServerToolSet.has(tool.toolType);
				return {
					id: tool.id,
					label: tool.label,
					description: DEFAULT_SERVER_TOOL_SET.has(tool.toolType)
						? selected
							? "Enabled by default"
							: "Disabled"
						: selected
							? "Enabled - configure"
							: "Configure",
					keywords: tool.keywords,
					icon: tool.icon,
					disabled: !isUnified || !onServerToolsChange,
					selected,
					serverToolType: tool.toolType,
				};
			}),
		[enabledServerToolSet, isUnified, onServerToolsChange],
	);

	const activeSlashCommands = useMemo<SlashCommand[]>(() => {
		switch (slashMenu) {
			case "reasoning":
				return reasoningSlashCommands;
			case "model":
				return modelSlashCommands;
			case "tools":
				return toolsSlashCommands;
			case "tool-settings":
				return [];
			default:
				return slashCommands;
		}
	}, [
		modelSlashCommands,
		reasoningSlashCommands,
		slashCommands,
		slashMenu,
		toolsSlashCommands,
	]);

	const filteredSlashCommands = useMemo(() => {
		if (!slashMenuOpen) return [];
		if (!activeSlashSearchValue) return activeSlashCommands;

		const terms = activeSlashSearchValue.split(/\s+/).filter(Boolean);
		return activeSlashCommands.filter((command) => {
			const haystack = [
				command.id,
				command.label,
				command.description,
				...command.keywords,
			]
				.join(" ")
				.toLowerCase();
			return terms.every((term) => haystack.includes(term));
		});
	}, [activeSlashCommands, activeSlashSearchValue, slashMenuOpen]);

	const activeSlashIndex = Math.min(
		slashSelectedIndex,
		Math.max(filteredSlashCommands.length - 1, 0),
	);

	const visibleModelSlashGroups = useMemo<ModelSlashGroup[]>(() => {
		if (slashMenu !== "model") return [];
		if (activeSlashSearchValue) {
			return [
				{
					heading: `Results (${filteredSlashCommands.length})`,
					commands: filteredSlashCommands,
				},
			];
		}
		return modelSlashGroups;
	}, [
		activeSlashSearchValue,
		filteredSlashCommands,
		modelSlashGroups,
		slashMenu,
	]);

	const renderServerToolSettings = () => {
		if (slashMenu !== "tool-settings" || !selectedServerToolSettings) {
			return null;
		}
		const toolType = selectedServerToolSettings;
		const command = selectedServerToolCommand;
		const Icon = command?.icon ?? Settings2;
		const toolEnabled = enabledServerToolSet.has(toolType);
		const toolLabel =
			command?.label ?? SERVER_TOOL_SETTING_LABELS[toolType] ?? "Server Tool";
		return (
			<div className="grid gap-3 p-2">
				<div className="flex items-start gap-2">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="mt-0.5 h-7 w-7 shrink-0"
						onClick={() => {
							setSlashMenu("tools");
							setSelectedServerToolSettings(null);
							setSlashSelectedIndex(0);
						}}
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						<span className="sr-only">Back to tools</span>
					</Button>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 text-sm font-medium text-foreground">
							<Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span>{toolLabel}</span>
						</div>
						<div className="text-xs text-muted-foreground">
							Configure this server tool for the current chat.
						</div>
					</div>
					<label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
						<Switch
							size="sm"
							checked={toolEnabled}
							onCheckedChange={(checked) => setServerToolEnabled(toolType, checked)}
						/>
						<span>{toolEnabled ? "Enabled" : "Disabled"}</span>
					</label>
				</div>
				{toolType === "gateway:datetime" ? (
					<div className="grid gap-2">
						<ComposerTimezoneSelectField
							label="Timezone"
							value={datetimeConfig.timezone}
							options={timezoneOptions}
							onChange={(timezone) => updateDatetimeConfig({ timezone })}
						/>
						<p className="text-xs text-muted-foreground">
							Auto includes the browser timezone and UTC. Pick a fixed
							IANA timezone when a chat needs a specific region.
						</p>
					</div>
				) : null}
				{toolType === "phaseo:web_search" ? (
					<div className="grid gap-2">
						<div className="grid gap-2 sm:grid-cols-2">
							{renderSelectField({
								label: "Engine",
								value: webSearchConfig.engine ?? "auto",
								options: WEB_SEARCH_ENGINE_OPTIONS,
								onChange: (engine) => updateWebSearchConfig({ engine }),
							})}
							{renderSelectField({
								label: "Context size",
								value: webSearchConfig.searchContextSize ?? "medium",
								options: WEB_SEARCH_CONTEXT_OPTIONS,
								onChange: (searchContextSize) =>
									updateWebSearchConfig({ searchContextSize }),
							})}
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Results per search</span>
								<Input
									type="number"
									min={1}
									max={25}
									value={webSearchConfig.maxResults ?? ""}
									onChange={(event) =>
										updateWebSearchConfig({
											maxResults: parseOptionalNumber(event.target.value),
										})
									}
									placeholder="Default: 5"
									className="h-8 rounded-lg text-xs"
								/>
							</label>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Total results</span>
								<Input
									type="number"
									min={1}
									max={100}
									value={webSearchConfig.maxTotalResults ?? ""}
									onChange={(event) =>
										updateWebSearchConfig({
											maxTotalResults: parseOptionalNumber(
												event.target.value,
											),
										})
									}
									placeholder="Default: 10"
									className="h-8 rounded-lg text-xs"
								/>
							</label>
						</div>
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Max characters</span>
							<Input
								type="number"
								min={1}
								max={50000}
								value={webSearchConfig.maxCharacters ?? ""}
								onChange={(event) =>
									updateWebSearchConfig({
										maxCharacters: parseOptionalNumber(event.target.value),
									})
								}
								placeholder="Engine default"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Allowed domains</span>
							<Input
								value={webSearchConfig.allowedDomains ?? ""}
								onChange={(event) =>
									updateWebSearchConfig({
										allowedDomains: event.target.value || undefined,
									})
								}
								placeholder="docs.phaseo.app, github.com"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Excluded domains</span>
							<Input
								value={webSearchConfig.excludedDomains ?? ""}
								onChange={(event) =>
									updateWebSearchConfig({
										excludedDomains: event.target.value || undefined,
									})
								}
								placeholder="reddit.com, example.com"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
						<div className="grid gap-2 sm:grid-cols-2">
							<label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
								<span>Highlights</span>
								<Switch
									size="sm"
									checked={webSearchConfig.includeHighlights !== false}
									onCheckedChange={(includeHighlights) =>
										updateWebSearchConfig({ includeHighlights })
									}
								/>
							</label>
							<label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
								<span>Full text</span>
								<Switch
									size="sm"
									checked={webSearchConfig.includeText === true}
									onCheckedChange={(includeText) =>
										updateWebSearchConfig({ includeText })
									}
								/>
							</label>
						</div>
					</div>
				) : null}
				{toolType === "phaseo:web_fetch" ? (
					<div className="grid gap-2">
						{renderSelectField({
							label: "Engine",
							value: webFetchConfig.engine ?? "auto",
							options: WEB_FETCH_ENGINE_OPTIONS,
							onChange: (engine) => updateWebFetchConfig({ engine }),
						})}
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Max characters</span>
							<Input
								type="number"
								min={1}
								max={50000}
								value={webFetchConfig.maxChars ?? ""}
								onChange={(event) =>
									updateWebFetchConfig({
										maxChars: parseOptionalNumber(event.target.value),
									})
								}
								placeholder="Default: 12000"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Allowed domains</span>
							<Input
								value={webFetchConfig.allowedDomains ?? ""}
								onChange={(event) =>
									updateWebFetchConfig({
										allowedDomains: event.target.value || undefined,
									})
								}
								placeholder="docs.phaseo.app"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Blocked domains</span>
							<Input
								value={webFetchConfig.blockedDomains ?? ""}
								onChange={(event) =>
									updateWebFetchConfig({
										blockedDomains: event.target.value || undefined,
									})
								}
								placeholder="internal.example.com"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
					</div>
				) : null}
				{toolType === "phaseo:image_generation" ? (
					<div className="grid gap-2">
						<ComposerModelSelectField
							label="Image model"
							value={imageGenerationConfig.model}
							options={imageGenerationModelOptions}
							autoLabel="Choose image model"
							allowAuto={false}
							onChange={(model) => updateImageGenerationConfig({ model })}
						/>
						<div className="grid gap-2 sm:grid-cols-2">
							{renderSelectField({
								label: "Quality",
								value: imageGenerationConfig.quality ?? "auto",
								options: IMAGE_QUALITY_OPTIONS,
								onChange: (quality) =>
									updateImageGenerationConfig({ quality }),
							})}
							{renderSelectField({
								label: "Aspect ratio",
								value: imageGenerationConfig.aspectRatio ?? "auto",
								options: IMAGE_ASPECT_RATIO_OPTIONS,
								onChange: (aspectRatio) =>
									updateImageGenerationConfig({ aspectRatio }),
							})}
							{renderSelectField({
								label: "Size",
								value: imageGenerationConfig.size ?? "auto",
								options: IMAGE_SIZE_OPTIONS,
								onChange: (size) => updateImageGenerationConfig({ size }),
							})}
							{renderSelectField({
								label: "Background",
								value: imageGenerationConfig.background ?? "auto",
								options: IMAGE_BACKGROUND_OPTIONS,
								onChange: (background) =>
									updateImageGenerationConfig({ background }),
							})}
							{renderSelectField({
								label: "Format",
								value: imageGenerationConfig.outputFormat ?? "auto",
								options: IMAGE_OUTPUT_FORMAT_OPTIONS,
								onChange: (outputFormat) =>
									updateImageGenerationConfig({ outputFormat }),
							})}
							{renderSelectField({
								label: "Moderation",
								value: imageGenerationConfig.moderation ?? "auto",
								options: IMAGE_MODERATION_OPTIONS,
								onChange: (moderation) =>
									updateImageGenerationConfig({ moderation }),
							})}
						</div>
						<label className="grid gap-1 text-[11px] text-muted-foreground">
							<span>Output compression</span>
							<Input
								type="number"
								min={0}
								max={100}
								value={imageGenerationConfig.outputCompression ?? ""}
								onChange={(event) =>
									updateImageGenerationConfig({
										outputCompression: parseOptionalNumber(
											event.target.value,
										),
									})
								}
								placeholder="Default (0-100)"
								className="h-8 rounded-lg text-xs"
							/>
						</label>
					</div>
				) : null}
				{toolType === "phaseo:advisor" ? (
					<>
						<div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
							<div className="flex min-w-0 flex-1 flex-wrap gap-1">
								{advisorConfigs.map((advisor, index) => {
									const selected = index === advisorIndex;
									return (
										<button
											type="button"
											key={index}
											className={cn(
												"min-w-0 shrink-0 rounded-lg px-2 py-1 text-xs transition-colors",
												selected
													? "bg-background text-foreground shadow-sm"
													: "text-muted-foreground hover:bg-background/70 hover:text-foreground",
											)}
											onClick={() => setSelectedAdvisorIndex(index)}
										>
											<span className="block max-w-28 truncate">
												{advisor.name?.trim() || getDefaultAdvisorName(index)}
											</span>
										</button>
									);
								})}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="h-7 w-7 shrink-0"
								disabled={advisorConfigs.length >= MAX_COMPOSER_ADVISORS}
								onClick={addAdvisorConfig}
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="sr-only">Add advisor</span>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground"
								disabled={advisorConfigs.length <= 1}
								onClick={removeAdvisorConfig}
							>
								<X className="h-3.5 w-3.5" />
								<span className="sr-only">Remove advisor</span>
							</Button>
						</div>
						<label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
							<span>
								<span className="block font-medium text-foreground">
									Forward transcript
								</span>
								<span>Share the conversation so far with the advisor.</span>
							</span>
							<Switch
								size="sm"
								checked={advisorConfig.forwardTranscript === true}
								disabled={!advisorEnabled}
								onCheckedChange={(checked) =>
									updateAdvisorConfig({ forwardTranscript: checked })
								}
							/>
						</label>
						<div className="grid gap-2 sm:grid-cols-2">
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Name</span>
								<Input
									value={advisorConfig.name ?? ""}
									onChange={(event) =>
										updateAdvisorConfig({
											name: event.target.value || undefined,
										})
									}
									placeholder="reviewer"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							<ComposerModelSelectField
								label="Model"
								value={advisorConfig.model}
								options={activeModelOptions}
								autoLabel="Choose advisor model"
								allowAuto={false}
								onChange={(model) => updateAdvisorConfig({ model })}
							/>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Max uses</span>
								<Input
									type="number"
									min={1}
									value={advisorConfig.maxUses ?? ""}
									onChange={(event) =>
										updateAdvisorConfig({
											maxUses: parseOptionalNumber(event.target.value),
										})
									}
									placeholder="1"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Max tokens</span>
								<Input
									type="number"
									min={1}
									value={advisorConfig.maxCompletionTokens ?? ""}
									onChange={(event) =>
										updateAdvisorConfig({
											maxCompletionTokens: parseOptionalNumber(
												event.target.value,
											),
										})
									}
									placeholder="1400"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Temperature</span>
								<Input
									type="number"
									step={0.1}
									min={0}
									value={advisorConfig.temperature ?? ""}
									onChange={(event) =>
										updateAdvisorConfig({
											temperature: parseOptionalNumber(event.target.value),
										})
									}
									placeholder="Default"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							{renderSelectField({
								label: "Reasoning",
								value: advisorConfig.reasoningEffort ?? "none",
								options: advisorReasoningOptions,
								onChange: (reasoningEffort) =>
									updateAdvisorConfig({ reasoningEffort }),
							})}
						</div>
						<label className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
							<span>Instructions</span>
							<Textarea
								value={advisorConfig.instructions ?? ""}
								onChange={(event) =>
									updateAdvisorConfig({
										instructions: event.target.value || undefined,
									})
								}
								placeholder="Review plans for correctness, missing edge cases, and implementation risk."
								className="min-h-16 resize-none rounded-lg border-transparent bg-input/50 px-2 py-1.5 text-xs"
							/>
						</label>
					</>
				) : null}
				{toolType === "phaseo:fusion" ? (
					<div className="grid gap-2">
						<div className="rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
							<span className="block font-medium text-foreground">
								Fusion Settings
							</span>
							Run a small panel of models, then optionally use a judge model to
							choose the strongest direction.
						</div>
						<div className="grid gap-2">
							<span className="text-[11px] font-medium text-muted-foreground">
								Analysis Models
							</span>
							{(fusionModelIds.length ? fusionModelIds : [""]).map(
								(modelId, index) => (
									<div
										key={`${index}-${modelId || "empty"}`}
										className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
									>
										<ComposerModelSelectField
											label={`Analysis model ${index + 1}`}
											value={modelId || undefined}
											options={activeModelOptions}
											autoLabel="Choose fusion model"
											allowAuto={false}
											onChange={(model) => updateFusionModel(index, model)}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground"
											disabled={fusionModelIds.length <= 1 && !modelId}
											onClick={() => updateFusionModel(index, undefined)}
										>
											<X className="h-3.5 w-3.5" />
											<span className="sr-only">Remove fusion model</span>
										</Button>
									</div>
								),
							)}
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 justify-center"
								disabled={fusionModelIds.length >= MAX_COMPOSER_FUSION_MODELS}
								onClick={addFusionModel}
							>
								<Plus className="h-3.5 w-3.5" />
								Add model
							</Button>
						</div>
						<ComposerModelSelectField
							label="Judge Model"
							value={fusionConfig.judgeModel}
							options={activeModelOptions}
							autoLabel="Auto"
							allowAuto
							onChange={(judgeModel) => updateFusionConfig({ judgeModel })}
						/>
						<div className="grid gap-2">
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Max Tool Calls</span>
								<Input
									type="number"
									min={1}
									value={fusionConfig.maxUses ?? ""}
									onChange={(event) =>
										updateFusionConfig({
											maxUses: parseOptionalNumber(event.target.value),
										})
									}
									placeholder="Default: 8"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
						</div>
					</div>
				) : null}
				{toolType === "phaseo:subagent" ? (
					<>
						<div className="grid gap-2 sm:grid-cols-2">
							<ComposerModelSelectField
								label="Worker model"
								value={subagentConfig.model}
								options={activeModelOptions}
								autoLabel="Choose worker model"
								allowAuto={false}
								onChange={(model) => updateSubagentConfig({ model })}
							/>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Max uses</span>
								<Input
									type="number"
									min={1}
									value={subagentConfig.maxUses ?? ""}
									onChange={(event) =>
										updateSubagentConfig({
											maxUses: parseOptionalNumber(event.target.value),
										})
									}
									placeholder="10"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Max tokens</span>
								<Input
									type="number"
									min={1024}
									value={subagentConfig.maxCompletionTokens ?? ""}
									onChange={(event) =>
										updateSubagentConfig({
											maxCompletionTokens: parseOptionalNumber(
												event.target.value,
											),
										})
									}
									placeholder="1200"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							<label className="grid gap-1 text-[11px] text-muted-foreground">
								<span>Temperature</span>
								<Input
									type="number"
									step={0.1}
									min={0}
									max={2}
									value={subagentConfig.temperature ?? ""}
									onChange={(event) =>
										updateSubagentConfig({
											temperature: parseOptionalNumber(event.target.value),
										})
									}
									placeholder="Default"
									className="h-7 rounded-lg text-xs"
								/>
							</label>
							{renderSelectField({
								label: "Reasoning",
								value: subagentConfig.reasoningEffort ?? "none",
								options: advisorReasoningOptions,
								onChange: (reasoningEffort) =>
									updateSubagentConfig({ reasoningEffort }),
							})}
						</div>
						<label className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
							<span>Instructions</span>
							<Textarea
								value={subagentConfig.instructions ?? ""}
								onChange={(event) =>
									updateSubagentConfig({
										instructions: event.target.value || undefined,
									})
								}
								placeholder="Return concise findings for the main model. Do not address the end user directly."
								className="min-h-16 resize-none rounded-lg border-transparent bg-input/50 px-2 py-1.5 text-xs"
							/>
						</label>
					</>
				) : null}
			</div>
		);
	};

	const runSlashCommand = useCallback((command: SlashCommand) => {
		if (command.disabled) return;
		if (command.id === "reasoning") {
			const selectedReasoningIndex = reasoningOptions.findIndex(
				(option) => option.value === reasoningSelection,
			);
			openSlashSubmenu("reasoning", selectedReasoningIndex);
			return;
		}
		if (command.id === "model") {
			const selectedModelIndex = modelSlashCommands.findIndex(
				(option) => option.modelId === selectedModelId,
			);
			openSlashSubmenu("model", selectedModelIndex);
			return;
		}
		if (command.id === "tools") {
			openSlashSubmenu("tools");
			return;
		}
		if (command.serverToolType) {
			if (!isUnified) {
				return;
			}
			setSelectedServerToolSettings(command.serverToolType);
			setSlashMenu("tool-settings");
			setSlashSelectedIndex(0);
			setCommandSearch("");
			return;
		}
		if (command.modelId) {
			onToggleModel(command.modelId);
			return;
		}
		if (
			command.id === "attach"
		) {
			document
				.querySelector<HTMLInputElement>(
					"[data-chat-file-input='true']",
				)
				?.click();
			clearSlashCommand();
			return;
		}
		if (command.id.startsWith("reasoning-")) {
			const value = command.id.replace(
				"reasoning-",
				"",
			) as NonNullable<ChatSettings["reasoningEffort"]>;
			onReasoningSelection(value);
			clearSlashCommand();
		}
	}, [
		clearSlashCommand,
		isUnified,
		modelSlashCommands,
		onComposerChange,
		openSlashSubmenu,
		onReasoningSelection,
		onToggleRecording,
		onToggleModel,
		reasoningOptions,
		reasoningSelection,
		selectedModelId,
	]);

	const handleSlashNavigationKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
			if (!slashMenuOpen) return false;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSlashSelectedIndex((current) =>
					Math.min(
						current + 1,
						Math.max(filteredSlashCommands.length - 1, 0),
					),
				);
				return true;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSlashSelectedIndex((current) => Math.max(current - 1, 0));
				return true;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				if (slashMenu !== "main") {
					setSlashMenu("main");
					setSlashSelectedIndex(0);
					setCommandSearch("");
					requestAnimationFrame(() => {
						textareaRef.current?.focus();
					});
				} else {
					setCommandMenuOpen(false);
					if (slashQuery !== null) {
						onComposerChange("");
					}
				}
				return true;
			}
			if (
				(event.key === "ArrowLeft" || event.key === "Backspace") &&
				slashMenu !== "main" &&
				activeSlashSearchValue === ""
			) {
				event.preventDefault();
				setSlashMenu("main");
				setSlashSelectedIndex(0);
				setCommandSearch("");
				requestAnimationFrame(() => {
					textareaRef.current?.focus();
				});
				return true;
			}
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				const command = filteredSlashCommands[activeSlashIndex];
				if (command) {
					runSlashCommand(command);
				}
				return true;
			}
			return false;
		},
		[
			activeSlashIndex,
			filteredSlashCommands,
			onComposerChange,
			runSlashCommand,
			activeSlashSearchValue,
			slashMenu,
			slashMenuOpen,
			slashQuery,
			textareaRef,
		],
	);

	useEffect(() => {
		const root = promptScrollAreaRef.current;
		const viewport = root?.querySelector(
			"[data-radix-scroll-area-viewport]",
		) as HTMLDivElement | null;
		if (!viewport) return;

		let isAdjusting = false;
		let rafId = 0;
		const getSegmentWidth = () => viewport.scrollWidth / PROMPT_SCROLL_COPIES.length;
		const moveToMiddle = () => {
			const segmentWidth = getSegmentWidth();
			if (segmentWidth > 0) {
				viewport.scrollLeft = segmentWidth;
			}
		};
		const unlockAdjustment = () => {
			isAdjusting = false;
		};
		const handleScroll = () => {
			if (isAdjusting) return;
			const segmentWidth = getSegmentWidth();
			if (segmentWidth <= 0) return;
			const left = viewport.scrollLeft;
			if (left < segmentWidth * 0.35) {
				isAdjusting = true;
				viewport.scrollLeft = left + segmentWidth;
				rafId = requestAnimationFrame(unlockAdjustment);
				return;
			}
			if (left > segmentWidth * 1.65) {
				isAdjusting = true;
				viewport.scrollLeft = left - segmentWidth;
				rafId = requestAnimationFrame(unlockAdjustment);
			}
		};

		rafId = requestAnimationFrame(moveToMiddle);
		viewport.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", moveToMiddle);

		return () => {
			cancelAnimationFrame(rafId);
			viewport.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", moveToMiddle);
		};
	}, [showEvaluationPrompts]);

	useLayoutEffect(() => {
		const animatedElements = [
			["input", textareaRef.current],
			["left-controls", composerLeftControlsRef.current],
			["send-controls", composerSendControlsRef.current],
		] as const;
		const nextRects = new Map<string, DOMRect>();

		for (const [key, element] of animatedElements) {
			if (element) {
				nextRects.set(key, element.getBoundingClientRect());
			}
		}

		const previousRects = previousComposerLayoutRectsRef.current;
		previousComposerLayoutRectsRef.current = nextRects;

		if (
			previousRects.size === 0 ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		for (const animation of composerLayoutAnimationsRef.current) {
			animation.cancel();
		}
		composerLayoutAnimationsRef.current = [];

		for (const [key, element] of animatedElements) {
			const previousRect = previousRects.get(key);
			const nextRect = nextRects.get(key);
			if (!element || !previousRect || !nextRect) continue;

			const deltaX = previousRect.left - nextRect.left;
			const deltaY = previousRect.top - nextRect.top;
			if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

			const animation = element.animate(
				[
					{ transform: `translate(${deltaX}px, ${deltaY}px)` },
					{ transform: "translate(0, 0)" },
				],
				{
					duration: COMPOSER_LAYOUT_ANIMATION_MS,
					easing: "cubic-bezier(0.23, 1, 0.32, 1)",
				},
			);
			composerLayoutAnimationsRef.current.push(animation);
		}

		return () => {
			for (const animation of composerLayoutAnimationsRef.current) {
				animation.cancel();
			}
			composerLayoutAnimationsRef.current = [];
		};
	}, [attachments.length, composerExpanded, sendGateType, slashMenuOpen]);

	const renderSlashCommandButton = (command: SlashCommand, index: number) => {
		const Icon = command.icon ?? Cpu;
		const selected = activeSlashIndex === index;
		const opensNestedAction =
			(slashMenu === "main" &&
				(command.id === "model" ||
					command.id === "reasoning" ||
					command.id === "tools")) ||
			(slashMenu === "tools" && Boolean(command.serverToolType));
		const isFavoriteModel = command.modelId
			? favoriteModelIdSet.has(normalizeFavoriteModelId(command.modelId))
			: false;

		return (
			<button
				key={command.id}
				type="button"
				role="option"
				aria-selected={selected}
				disabled={command.disabled}
				className={cn(
					"flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left text-[13px] leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-45",
					selected
						? "bg-muted text-foreground"
						: "text-foreground hover:bg-muted",
				)}
				onMouseEnter={() => setSlashSelectedIndex(index)}
				onMouseDown={(event) => {
					event.preventDefault();
				}}
				onClick={() => runSlashCommand(command)}
			>
				{command.logoId ? (
					<Logo
						id={command.logoId}
						alt=""
						width={16}
						height={16}
						className="h-4 w-4 shrink-0 rounded-none"
					/>
				) : (
					<Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				)}
				<span className="min-w-0 truncate font-medium">
					{command.label}
				</span>
				{command.description ? (
					<span className="min-w-0 flex-1 truncate text-muted-foreground">
						{command.description}
					</span>
				) : (
					<span className="min-w-0 flex-1" />
				)}
				{opensNestedAction ? (
					<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				) : command.selected ? (
					<Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
				) : isFavoriteModel ? (
					<Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
				) : null}
			</button>
		);
	};

	const renderSendButton = () => (
		<Button
			size="icon"
			aria-label={
				hasSelectedModel
					? isSending
						? "Queue message"
						: "Send message"
					: "Choose a model to send"
			}
			aria-disabled={!canSubmit}
			data-chat-send-button="true"
			title={showChooseModelTooltip ? "Choose a model" : undefined}
			className={cn(
				canSubmit
					? "cursor-pointer border-transparent hover:brightness-95"
					: "cursor-default border-transparent opacity-50",
			)}
			style={{
				backgroundColor: accentColor,
				color: getReadableTextColor(accentColor),
				cursor: canSubmit ? "pointer" : "default",
			}}
			onClick={() => {
				if (canSubmit) {
					handleComposerSubmit();
				}
			}}
			tabIndex={canSubmit ? undefined : -1}
		>
			{isSending ? (
				<ListPlus className="h-4 w-4" />
			) : (
				<SendHorizontal className="h-4 w-4" />
			)}
		</Button>
	);

	const renderAudioButton = () => {
		const label = isRecording
			? "Stop recording"
			: recordingSupported
				? "Record audio"
				: "Add audio file";
		const Icon = isRecording ? Square : recordingSupported ? Mic : AudioLines;

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						size="icon"
						variant={isRecording ? "destructive" : "ghost"}
						aria-label={label}
						aria-pressed={isRecording}
						data-chat-audio-button="true"
						disabled={isStartingRecording}
						className={cn(
							"h-8 w-8 rounded-full",
							isRecording
								? "animate-pulse"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={onToggleRecording}
					>
						<Icon className={cn("h-4 w-4", isRecording && "fill-current")} />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{isStartingRecording ? "Starting recording..." : label}
				</TooltipContent>
			</Tooltip>
		);
	};

	const handleQueuedPromptDragStart = (
		event: DragEvent<HTMLButtonElement>,
		id: string,
	) => {
		if (!onReorderQueuedPrompt) return;
		setDraggingQueuedPromptId(id);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", id);
	};

	const handleQueuedPromptDrop = (
		event: DragEvent<HTMLDivElement>,
		targetId: string,
	) => {
		if (!onReorderQueuedPrompt) return;
		event.preventDefault();
		const activeId =
			event.dataTransfer.getData("text/plain") || draggingQueuedPromptId;
		setDraggingQueuedPromptId(null);
		if (!activeId || activeId === targetId) return;
		onReorderQueuedPrompt(activeId, targetId);
	};

	const renderAttachmentStrip = () => (
		<AttachmentGroup
			tabIndex={0}
			role="group"
			aria-label="Attached files"
			className="-mx-4 w-[calc(100%+2rem)] px-4 pb-1 md:-mx-8 md:w-[calc(100%+4rem)] md:px-8"
		>
			{attachments.map((file, index) => {
				const previewUrl = getSafeAttachmentPreviewUrl(
					attachmentPreviewUrls[index],
				);
				const isImagePreview =
					file.type.startsWith("image/") && Boolean(previewUrl);
				const isAudioPreview = file.type.startsWith("audio/");

				if (isAudioPreview) {
					return (
						<Attachment
							key={`${file.name}-${file.size}-${index}`}
							size="sm"
							state="done"
							className="w-[19rem] max-w-[calc(100vw-3rem)] flex-nowrap items-start gap-2.5"
						>
							<AttachmentMedia className="mt-0.5 w-8 bg-foreground text-background">
								<AudioLines className="h-3.5 w-3.5" />
							</AttachmentMedia>
							<AttachmentContent className="min-w-0 pb-1 pr-0">
								<AttachmentTitle>{getAudioAttachmentTitle(file)}</AttachmentTitle>
								<AttachmentDescription>
									{getAttachmentDescription(file)}
								</AttachmentDescription>
							</AttachmentContent>
							<AttachmentActions className="pt-1 pr-0.5">
								<AttachmentAction
									aria-label={`Remove ${file.name}`}
									onClick={() => onRemoveAttachment(index)}
								>
									<X className="h-3.5 w-3.5" />
								</AttachmentAction>
							</AttachmentActions>
						</Attachment>
					);
				}

				return (
					<Attachment
						key={`${file.name}-${file.size}-${index}`}
						size="sm"
						state="done"
						className="max-w-[260px]"
					>
						<AttachmentMedia variant={isImagePreview ? "image" : "icon"}>
							{isImagePreview && previewUrl ? (
								<Image
									src={previewUrl}
									alt=""
									width={32}
									height={32}
									unoptimized
									className="h-full w-full object-cover"
								/>
							) : (
								<Paperclip className="h-4 w-4" />
							)}
						</AttachmentMedia>
						<AttachmentContent>
							<AttachmentTitle>{file.name}</AttachmentTitle>
							<AttachmentDescription>
								{getAttachmentDescription(file)}
							</AttachmentDescription>
						</AttachmentContent>
						<AttachmentActions>
							<AttachmentAction
								aria-label={`Remove ${file.name}`}
								onClick={() => onRemoveAttachment(index)}
							>
								<X className="h-3.5 w-3.5" />
							</AttachmentAction>
						</AttachmentActions>
					</Attachment>
				);
			})}
		</AttachmentGroup>
	);

	return (
		<div className="border-t border-border bg-background px-4 py-[17px] md:px-8">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
				{queuedPrompts.length > 0 ? (
					<div className="rounded-2xl border border-border bg-card/95 p-1.5">
						<div className="grid gap-0.5">
							{queuedPrompts.map((prompt) => {
								const label =
									prompt.content.trim() ||
									(prompt.attachmentCount > 0
										? `${prompt.attachmentCount} attachment${prompt.attachmentCount === 1 ? "" : "s"}`
										: "Queued prompt");
								return (
									<div
										key={prompt.id}
										onDragOver={(event) => {
											if (onReorderQueuedPrompt) {
												event.preventDefault();
												event.dataTransfer.dropEffect = "move";
											}
										}}
										onDrop={(event) =>
											handleQueuedPromptDrop(event, prompt.id)
										}
										onDragEnd={() => setDraggingQueuedPromptId(null)}
										className={cn(
											"group grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-xl px-1.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/55",
											draggingQueuedPromptId === prompt.id &&
												"bg-muted/60 opacity-70",
										)}
									>
										<button
											type="button"
											aria-label="Drag to reorder queued prompt"
											draggable={Boolean(onReorderQueuedPrompt)}
											onDragStart={(event) =>
												handleQueuedPromptDragStart(event, prompt.id)
											}
											className="inline-flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-100"
										>
											<GripVertical className="h-3.5 w-3.5" />
										</button>
										<CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
										<span className="truncate text-foreground/90">
											{label}
										</span>
										{onEditQueuedPrompt ? (
											<button
												type="button"
												aria-label="Edit queued prompt"
												onClick={() => onEditQueuedPrompt(prompt.id)}
												className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<Pencil className="h-3.5 w-3.5" />
											</button>
										) : null}
										{onRemoveQueuedPrompt ? (
											<button
												type="button"
												aria-label="Remove queued prompt"
												onClick={() => onRemoveQueuedPrompt(prompt.id)}
												className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				) : null}
				{sendGateType === "auth" ? (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100">
						<div className="flex items-start gap-2 text-sm">
							<Info className="mt-0.5 h-4 w-4 shrink-0" />
							<div className="space-y-0.5">
								<p className="font-medium">
									Create an account to send messages.
								</p>
								<p className="text-xs opacity-90">
									Sign up to start chatting in this playground.
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Button asChild size="sm">
								<Link href="/sign-up">Create account</Link>
							</Button>
							<Button asChild variant="outline" size="sm">
								<Link href="/sign-in">Sign in</Link>
							</Button>
						</div>
					</div>
				) : null}
				{attachments.length > 0 ? (
					renderAttachmentStrip()
				) : showEvaluationPrompts ? (
					<ScrollArea
						ref={promptScrollAreaRef}
						className="-mx-4 w-[calc(100%+2rem)] whitespace-nowrap px-4 [mask-image:linear-gradient(90deg,transparent,black_1.25rem,black_calc(100%-1.25rem),transparent)] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 md:[mask-image:linear-gradient(90deg,transparent,black_2rem,black_calc(100%-2rem),transparent)]"
						aria-label="Prompt presets"
					>
						<div
							className={cn(
								"flex w-max gap-2.5 sm:gap-3",
								composerExpanded ? "py-0.5" : "py-1.5",
							)}
						>
							{PROMPT_SCROLL_COPIES.map((copyIndex) => (
								<div
									key={copyIndex}
									className="flex shrink-0 gap-2.5 sm:gap-3"
									aria-hidden={copyIndex !== 1}
								>
									{EVALUATION_PROMPTS.map((item) => (
										<button
											key={`${item.title}-${copyIndex}`}
											type="button"
											className={cn(
												"group/card relative flex shrink-0 flex-col justify-center overflow-hidden border border-border/70 bg-card/95 text-left text-foreground shadow-sm shadow-black/[0.03] transition duration-200",
												"hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/40 hover:shadow-md hover:shadow-black/[0.05]",
												"active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												composerExpanded
													? "h-10 w-auto max-w-[13rem] rounded-full px-3 sm:max-w-[14.5rem]"
													: "h-[4.25rem] w-[14.75rem] rounded-2xl px-4 sm:w-60",
											)}
											onClick={() =>
												onSelectEvaluationPrompt(item.prompt)
											}
											tabIndex={copyIndex === 1 ? 0 : -1}
										>
											<span
												className={cn(
													"block truncate font-semibold tracking-normal",
													composerExpanded
														? "text-xs leading-4 sm:text-[13px]"
														: "text-[13px] leading-5 sm:text-sm",
												)}
											>
												{item.title}
											</span>
											{!composerExpanded ? (
												<span className="block truncate text-xs leading-4 text-muted-foreground">
													{item.description}
												</span>
											) : null}
										</button>
									))}
								</div>
							))}
						</div>
						<ScrollBar className="hidden" orientation="horizontal" />
					</ScrollArea>
				) : null}
				<div ref={composerCommandRootRef} className="relative">
					{slashMenuOpen ? (
						<div
							className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-none"
							aria-label="Chat commands"
						>
							{showSlashSearch ? (
								<div className="border-b border-border/70 p-2">
									<div className="flex h-8 items-center gap-2 rounded-lg bg-muted px-2 text-muted-foreground">
										<Search className="h-3.5 w-3.5 shrink-0" />
										<Input
											ref={slashSearchInputRef}
											autoFocus
											value={commandSearch}
											onChange={(event) =>
												setCommandSearch(event.target.value)
											}
											onKeyDown={handleSlashNavigationKeyDown}
											placeholder={
												slashMenu === "model"
													? "Search models..."
													: slashMenu === "reasoning"
														? "Search reasoning..."
													: "Search tools..."
											}
											className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0"
										/>
									</div>
								</div>
							) : null}
							<ScrollArea
								className="max-h-[min(82vh,38rem)]"
								viewportClassName="h-auto max-h-[min(82vh,38rem)] overflow-y-auto overscroll-contain"
								onWheel={(event) => {
									event.stopPropagation();
								}}
							>
								<div className="p-1" role="listbox" aria-label="Chat commands">
									{slashMenu === "tool-settings" ? (
										renderServerToolSettings()
									) : slashMenu === "model" ? (
										visibleModelSlashGroups.length ? (
											visibleModelSlashGroups.map((group) => (
												<div key={group.heading} className="pb-1">
													<div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
														{group.heading}
													</div>
													{group.commands.map((command) =>
														renderSlashCommandButton(
															command,
															filteredSlashCommands.indexOf(command),
														),
													)}
												</div>
											))
										) : (
											<div className="px-3 py-6 text-center text-sm text-muted-foreground">
												No models found
											</div>
										)
									) : filteredSlashCommands.length ? (
										filteredSlashCommands.map((command, index) =>
											renderSlashCommandButton(command, index),
										)
									) : (
										<div className="px-3 py-6 text-center text-sm text-muted-foreground">
											No commands found
										</div>
									)}
								</div>
							</ScrollArea>
						</div>
					) : null}
					<div
						data-chat-composer-surface="true"
						className={cn(
							"rounded-2xl border border-border bg-card shadow-sm transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
							composerExpanded
								? "flex flex-col px-3 py-2"
								: "flex flex-col gap-1 px-2 py-1 sm:flex-row sm:items-center",
						)}
					>
					<input
						ref={fileInputRef}
						data-chat-file-input="true"
						type="file"
						className="hidden"
						multiple
						onChange={onFileSelect}
					/>
					<input
						ref={audioInputRef}
						type="file"
						accept="audio/*"
						className="hidden"
						multiple
						onChange={onFileSelect}
					/>
					{isRecording ? (
						<RecordingWaveform
							bars={recordingWaveformBars}
							durationMs={recordingDurationMs}
						/>
					) : (
						<Textarea
							ref={textareaRef}
							data-chat-composer-input="true"
							value={composer}
							onChange={(event) => {
								handleComposerChange(event.target.value);
							}}
							onKeyDown={(event) => {
								if (slashMenuOpen) {
									if (handleSlashNavigationKeyDown(event)) {
										return;
									}
								}
								if (handlePromptHistoryKeyDown(event)) {
									return;
								}
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									if (canSubmit) {
										handleComposerSubmit();
									}
								}
							}}
							rows={1}
							placeholder={placeholder}
							className={cn(
								"resize-none border-0 !bg-transparent shadow-none transition-[min-height,padding] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform focus-visible:ring-0 motion-reduce:transition-none dark:!bg-transparent",
								composerExpanded
									? "min-h-[56px] px-1 py-2"
									: "order-1 min-h-9 w-full px-2 py-2 sm:order-2 sm:flex-1",
							)}
						/>
					)}
					<div
						className={cn(
							composerExpanded
								? "flex items-center justify-between pt-2"
								: "order-2 flex w-full items-center justify-between sm:contents",
						)}
					>
						<div
							ref={composerLeftControlsRef}
							className={cn(
								"flex items-center gap-1 will-change-transform",
								composerExpanded ? "sm:gap-2" : "order-1",
							)}
						>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={isRecording ? undefined : toggleSlashCommandMenu}
										disabled={isRecording}
										aria-label="Open action menu"
									>
										<Plus className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Open actions</TooltipContent>
							</Tooltip>
							{activeInlineTools.length > 0 ? (
								<div
									className="flex min-w-0 items-center gap-1"
									aria-label="Active tools"
								>
									{activeInlineTools.map((tool) => {
										const Icon = tool.icon ?? Settings2;
										const isManageAction = tool.id === "tools";
										return (
											<Tooltip key={tool.id}>
												<TooltipTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="h-8 w-8 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
														onClick={() => runSlashCommand(tool)}
														aria-label={
															isManageAction
																? "Manage tool settings"
																: `Disable ${tool.label}`
														}
													>
														<Icon className="h-3.5 w-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													{isManageAction
														? "Manage tool settings"
														: `Disable ${tool.label}`}
												</TooltipContent>
											</Tooltip>
										);
									})}
								</div>
							) : null}
						</div>
						<div
							ref={composerSendControlsRef}
							className={cn(
								"flex items-center gap-1.5 will-change-transform",
								composerExpanded ? "" : "order-3",
							)}
						>
							{renderAudioButton()}
							{renderSendButton()}
						</div>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}
