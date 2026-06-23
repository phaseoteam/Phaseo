"use client";

import {
	useMemo,
	useState,
	useEffect,
	useRef,
	type ChangeEvent,
	type ReactNode,
	type RefObject,
} from "react";
import Link from "next/link";
import {
	ArrowLeft,
	Check,
	ChevronDown,
	ChevronRight,
	Clock3,
	Cpu,
	ExternalLink,
	FileCode2,
	FileMusic,
	FileText,
	Globe2,
	ImageIcon,
	Info,
	Lightbulb,
	Link2,
	MessageSquareText,
	Mic,
	Paperclip,
	Plus,
	SendHorizontal,
	Sparkles,
	Square,
	Video,
	Wrench,
	X,
} from "lucide-react";
import type {
	ChatServerToolAdvisor,
	ChatSettings,
} from "@/lib/indexeddb/chats";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
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
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ServerToolModelChoice } from "@/components/(chat)/ChatConversation";
import { ModelDropdown } from "@/components/(chat)/ModelDropdown";
import { cn } from "@/lib/utils";

type SendGateType = "auth" | null;

type ReasoningOption = {
	value: NonNullable<ChatSettings["reasoningEffort"]>;
	label: string;
};

type ContextMessageLimit = NonNullable<ChatSettings["contextMessageLimit"]>;

const CONTEXT_MESSAGE_LIMIT_OPTIONS: Array<{
	value: number;
	label: string;
	description: string;
}> = [
	{ value: 1, label: "1 message", description: "Only the latest turn" },
	{ value: 5, label: "5 messages", description: "Very short context" },
	{ value: 10, label: "10 messages", description: "Default context" },
	{ value: 20, label: "20 messages", description: "Longer thread memory" },
	{ value: 50, label: "50 messages", description: "Large recent window" },
	{ value: 100, label: "100 messages", description: "Very large window" },
];

function formatContextMessageLimit(limit: ContextMessageLimit) {
	return limit === "all" ? "All msgs" : `${limit} msgs`;
}

function formatContextTriggerLabel(limit: ContextMessageLimit) {
	return limit === "all" ? "All" : String(limit);
}

function clampContextMessageLimit(value: number) {
	return Math.max(1, Math.min(100, Math.round(value)));
}

function formatAttachmentSize(size: number) {
	if (!Number.isFinite(size) || size <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"] as const;
	let value = size;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const formatted =
		value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1);
	return `${formatted} ${units[unitIndex]}`;
}

function getAttachmentKind(file: File) {
	if (file.type.startsWith("image/")) return "image";
	if (file.type.startsWith("audio/")) return "audio";
	if (file.type.startsWith("video/")) return "video";
	return "file";
}

function getAttachmentKindLabel(file: File) {
	const kind = getAttachmentKind(file);
	if (kind === "image") return "Image";
	if (kind === "audio") return "Audio";
	if (kind === "video") return "Video";
	return file.type || "File";
}

function AttachmentFileIcon({
	file,
	className,
}: {
	file: File;
	className?: string;
}) {
	const kind = getAttachmentKind(file);
	if (kind === "image") return <ImageIcon className={className} />;
	if (kind === "audio") return <FileMusic className={className} />;
	if (kind === "video") return <Video className={className} />;
	if (
		file.type.includes("json") ||
		file.type.includes("javascript") ||
		file.type.includes("typescript") ||
		file.type.includes("html") ||
		file.type.includes("css")
	) {
		return <FileCode2 className={className} />;
	}
	return <FileText className={className} />;
}

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

type ServerToolId =
	| "web-search"
	| "web-fetch"
	| "image-generation"
	| "datetime"
	| "fusion"
	| "advisor"
	| "subagent";

type ServerToolMenuItem = {
	id: ServerToolId;
	label: string;
	description: string;
	summary: string;
	detail: string;
	docsHref: string;
	icon: typeof Globe2;
	enabled: boolean;
	onEnabledChange?: (enabled: boolean) => void;
	disabled?: boolean;
	disabledReason?: string;
};

const SERVER_TOOLS_DOCS_BASE =
	"https://docs.ai-stats.phaseo.app/v1/guides/server-tools";
const FUSION_ANALYSIS_MODEL_COUNT = 3;
const WEB_SEARCH_ENGINE_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "native", label: "Native" },
	{ value: "exa", label: "Exa" },
	{ value: "parallel", label: "Parallel" },
	{ value: "firecrawl", label: "Firecrawl" },
	{ value: "perplexity", label: "Perplexity" },
] as const;
const WEB_FETCH_ENGINE_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "native", label: "Native" },
	{ value: "direct", label: "Direct" },
	{ value: "exa", label: "Exa" },
	{ value: "parallel", label: "Parallel" },
	{ value: "firecrawl", label: "Firecrawl" },
] as const;
const IMAGE_QUALITY_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
] as const;
const IMAGE_BACKGROUND_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "transparent", label: "Transparent" },
	{ value: "opaque", label: "Opaque" },
] as const;
const IMAGE_OUTPUT_FORMAT_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "png", label: "PNG" },
	{ value: "webp", label: "WebP" },
	{ value: "jpeg", label: "JPEG" },
] as const;
const IMAGE_MODERATION_OPTIONS = [
	{ value: "auto", label: "Auto" },
	{ value: "low", label: "Low" },
] as const;
const IMAGE_ASPECT_RATIO_OPTIONS = [
	"auto",
	"1:1",
	"16:9",
	"9:16",
	"4:3",
	"3:4",
] as const;
const IMAGE_SIZE_OPTIONS = [
	"auto",
	"1024x1024",
	"1536x1024",
	"1024x1536",
	"1536x864",
] as const;
const FALLBACK_TIME_ZONES = [
	"UTC",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"America/Toronto",
	"America/Sao_Paulo",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Asia/Singapore",
	"Asia/Tokyo",
	"Asia/Shanghai",
	"Australia/Sydney",
	"Pacific/Auckland",
];

function getSupportedTimeZones() {
	const supportedValuesOf = (
		Intl as typeof Intl & {
			supportedValuesOf?: (key: "timeZone") => string[];
		}
	).supportedValuesOf;
	return supportedValuesOf
		? supportedValuesOf("timeZone")
		: FALLBACK_TIME_ZONES;
}

function getUtcOffsetInfo(timeZone: string) {
	try {
		const timeZoneName = new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "shortOffset",
			hour: "2-digit",
			minute: "2-digit",
		})
			.formatToParts(new Date())
			.find((part) => part.type === "timeZoneName")?.value;
		if (!timeZoneName || timeZoneName === "GMT") {
			return { label: "UTC", minutes: 0 };
		}
		const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(timeZoneName);
		if (!match) {
			return { label: timeZoneName.replace(/^GMT/, "UTC"), minutes: 0 };
		}
		const [, sign, hours, minutes = "00"] = match;
		const offsetMinutes =
			(Number(hours) * 60 + Number(minutes)) * (sign === "-" ? -1 : 1);
		return {
			label: `UTC${sign}${hours.padStart(2, "0")}:${minutes}`,
			minutes: offsetMinutes,
		};
	} catch {
		return null;
	}
}

function createDefaultAdvisor(): ChatServerToolAdvisor {
	return {
		name: "",
		model: "",
		instructions: "",
	};
}

function formatModelSummary(
	modelId: string | undefined,
	choices: ServerToolModelChoice[],
	latestChoices: ServerToolModelChoice[] = [],
) {
	if (!modelId?.trim()) return "Auto";
	return (
		latestChoices.find((choice) => choice.id === modelId)?.label ??
		choices.find((choice) => choice.id === modelId)?.label ??
		modelId
	);
}

function parseMaxUsesInput(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(1, Math.min(99, parsed));
}

function parsePositiveIntInput(value: string, max?: number) {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed)) return null;
	const normalized = Math.max(1, Math.floor(parsed));
	return max ? Math.min(max, normalized) : normalized;
}

function parseCompressionInput(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(0, Math.min(100, Math.floor(parsed)));
}

function SegmentedSetting({
	value,
	options,
	onChange,
	columns,
}: {
	value: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	onChange?: (value: string) => void;
	columns?: number;
}) {
	return (
		<div
			className="grid gap-1"
			style={{
				gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
			}}
		>
			{options.map((option) => {
				const selected = value === option.value;
				return (
					<Button
						key={option.value}
						type="button"
						variant={selected ? "secondary" : "ghost"}
						size="sm"
						className={cn(
							"h-8 px-2 text-xs",
							selected &&
								"border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
						)}
						onClick={() => onChange?.(option.value)}
					>
						{option.label}
					</Button>
				);
			})}
		</div>
	);
}

function SelectSetting({
	value,
	options,
	onChange,
}: {
	value: string;
	options: readonly string[];
	onChange?: (value: string) => void;
}) {
	return (
		<Select
			value={value}
			onValueChange={(nextValue) => onChange?.(nextValue)}
		>
			<SelectTrigger className="h-8 bg-background px-2 text-sm shadow-none">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option} value={option}>
						{option === "auto" ? "Auto" : option}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function AdditionalSettingsSection({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-md bg-muted/40"
		>
			<CollapsibleTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="h-9 w-full justify-between px-3 text-sm font-semibold hover:bg-muted/60"
				>
					Additional settings
					<ChevronDown
						className={cn(
							"h-3.5 w-3.5 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
					/>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-3 px-3 pb-3">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}

function TimezoneDropdown({
	value,
	onValueChange,
}: {
	value: string;
	onValueChange?: (timezone: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const timeZones = useMemo(
		() =>
			getSupportedTimeZones()
				.map((timezone) => {
					const offsetInfo = getUtcOffsetInfo(timezone);
					return {
						timezone,
						offset: offsetInfo?.label ?? null,
						offsetMinutes:
							offsetInfo?.minutes ?? Number.POSITIVE_INFINITY,
					};
				})
				.sort(
					(a, b) =>
						a.offsetMinutes - b.offsetMinutes ||
						a.timezone.localeCompare(b.timezone),
				),
		[],
	);
	const selectedTimezone = value.trim();
	const selectedOffset = selectedTimezone
		? timeZones.find((option) => option.timezone === selectedTimezone)?.offset
		: null;
	const label = selectedTimezone
		? [selectedTimezone, selectedOffset].filter(Boolean).join(" · ")
		: "Auto";
	const choose = (timezone: string) => {
		onValueChange?.(timezone);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Timezone"
					className="h-8 w-full justify-between px-2 text-left text-sm font-normal"
				>
					<span className="truncate">{label}</span>
					<ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[min(372px,calc(100vw-3rem))] p-0"
			>
				<Command>
					<CommandInput placeholder="Search timezones..." />
					<CommandList className="max-h-[300px]">
						<CommandEmpty>No timezone found.</CommandEmpty>
						<CommandGroup>
							<CommandItem value="Auto" onSelect={() => choose("")}>
								<Check
									className={cn(
										"mr-2 h-3.5 w-3.5",
										!selectedTimezone
											? "opacity-100"
											: "opacity-0",
									)}
								/>
								Auto
							</CommandItem>
							{timeZones.map(({ timezone, offset }) => (
								<CommandItem
									key={timezone}
									value={[timezone, offset].filter(Boolean).join(" ")}
									onSelect={() => choose(timezone)}
								>
									<Check
										className={cn(
											"mr-2 h-3.5 w-3.5",
											selectedTimezone === timezone
												? "opacity-100"
												: "opacity-0",
										)}
									/>
									<span className="min-w-0 flex-1 truncate">
										{timezone}
									</span>
									{offset ? (
										<span className="shrink-0 text-xs text-muted-foreground">
											{offset}
										</span>
									) : null}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

interface ChatConversationComposerProps {
	sendGateType: SendGateType;
	isSending: boolean;
	composer: string;
	attachments: File[];
	attachmentPreviewUrls: Array<string | null>;
	placeholder: string;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	fileInputRef: RefObject<HTMLInputElement | null>;
	audioInputRef: RefObject<HTMLInputElement | null>;
	isUnified: boolean;
	temporaryMode: boolean;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	serverToolWebSearchEngine: string;
	onServerToolWebSearchEngineChange?: (engine: string) => void;
	serverToolWebSearchContextSize: "low" | "medium" | "high";
	onServerToolWebSearchContextSizeChange?: (
		contextSize: "low" | "medium" | "high",
	) => void;
	serverToolWebSearchMaxResults: number | null;
	onServerToolWebSearchMaxResultsChange?: (maxResults: number | null) => void;
	serverToolWebSearchMaxTotalResults: number | null;
	onServerToolWebSearchMaxTotalResultsChange?: (
		maxTotalResults: number | null,
	) => void;
	serverToolWebSearchMaxCharacters: number | null;
	onServerToolWebSearchMaxCharactersChange?: (
		maxCharacters: number | null,
	) => void;
	serverToolWebSearchAllowedDomains: string;
	onServerToolWebSearchAllowedDomainsChange?: (domains: string) => void;
	serverToolWebSearchBlockedDomains: string;
	onServerToolWebSearchBlockedDomainsChange?: (domains: string) => void;
	apiServerToolsEnabled: boolean;
	onApiServerToolsEnabledChange?: (enabled: boolean) => void;
	serverToolTimezone: string;
	onServerToolTimezoneChange?: (timezone: string) => void;
	serverToolWebFetchEnabled: boolean;
	onServerToolWebFetchEnabledChange?: (enabled: boolean) => void;
	serverToolWebFetchEngine: string;
	onServerToolWebFetchEngineChange?: (engine: string) => void;
	serverToolWebFetchMaxContentTokens: number | null;
	onServerToolWebFetchMaxContentTokensChange?: (
		maxContentTokens: number | null,
	) => void;
	serverToolWebFetchAllowedDomains: string;
	onServerToolWebFetchAllowedDomainsChange?: (domains: string) => void;
	serverToolWebFetchBlockedDomains: string;
	onServerToolWebFetchBlockedDomainsChange?: (domains: string) => void;
	serverToolAdvisorEnabled: boolean;
	onServerToolAdvisorEnabledChange?: (enabled: boolean) => void;
	serverToolAdvisors: ChatServerToolAdvisor[];
	onServerToolAdvisorsChange?: (advisors: ChatServerToolAdvisor[]) => void;
	serverToolImageGenerationEnabled: boolean;
	onServerToolImageGenerationEnabledChange?: (enabled: boolean) => void;
	serverToolImageGenerationModel: string;
	onServerToolImageGenerationModelChange?: (model: string) => void;
	serverToolImageGenerationQuality: string;
	onServerToolImageGenerationQualityChange?: (quality: string) => void;
	serverToolImageGenerationAspectRatio: string;
	onServerToolImageGenerationAspectRatioChange?: (aspectRatio: string) => void;
	serverToolImageGenerationSize: string;
	onServerToolImageGenerationSizeChange?: (size: string) => void;
	serverToolImageGenerationBackground: string;
	onServerToolImageGenerationBackgroundChange?: (background: string) => void;
	serverToolImageGenerationOutputFormat: string;
	onServerToolImageGenerationOutputFormatChange?: (format: string) => void;
	serverToolImageGenerationOutputCompression: number | null;
	onServerToolImageGenerationOutputCompressionChange?: (
		compression: number | null,
	) => void;
	serverToolImageGenerationModeration: string;
	onServerToolImageGenerationModerationChange?: (moderation: string) => void;
	serverToolSubagentEnabled: boolean;
	onServerToolSubagentEnabledChange?: (enabled: boolean) => void;
	serverToolSubagentModel: string;
	onServerToolSubagentModelChange?: (model: string) => void;
	serverToolSubagentInstructions: string;
	onServerToolSubagentInstructionsChange?: (instructions: string) => void;
	serverToolSubagentMaxUses: number | null;
	onServerToolSubagentMaxUsesChange?: (maxUses: number | null) => void;
	serverToolFusionEnabled: boolean;
	onServerToolFusionEnabledChange?: (enabled: boolean) => void;
	serverToolFusionAnalysisModels: string[];
	onServerToolFusionAnalysisModelsChange?: (models: string[]) => void;
	serverToolFusionJudgeModel: string;
	onServerToolFusionJudgeModelChange?: (model: string) => void;
	serverToolFusionMaxUses: number | null;
	onServerToolFusionMaxUsesChange?: (maxUses: number | null) => void;
	serverToolModelChoices: ServerToolModelChoice[];
	serverToolLatestModelChoices: ServerToolModelChoice[];
	serverToolImageGenerationModelChoices: ServerToolModelChoice[];
	serverToolImageGenerationLatestModelChoices: ServerToolModelChoice[];
	contextMessageLimit: ContextMessageLimit;
	onContextMessageLimitChange?: (limit: ContextMessageLimit) => void;
	showEvaluationPrompts: boolean;
	reasoningEnabled: boolean;
	reasoningPickerOpen: boolean;
	onReasoningPickerOpenChange: (open: boolean) => void;
	reasoningSelection: NonNullable<ChatSettings["reasoningEffort"]>;
	reasoningOptions: ReasoningOption[];
	supportedReasoningEfforts: Array<
		NonNullable<ChatSettings["reasoningEffort"]>
	>;
	onReasoningSelection: (
		value: NonNullable<ChatSettings["reasoningEffort"]>,
	) => void;
	isRecording: boolean;
	isStartingRecording: boolean;
	recordingSupported: boolean;
	onToggleRecording: () => void;
	onSubmit: () => void;
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
		attachments,
		attachmentPreviewUrls,
		placeholder,
		textareaRef,
		fileInputRef,
		audioInputRef,
		isUnified,
		temporaryMode,
		webSearchEnabled,
		onWebSearchEnabledChange,
		serverToolWebSearchEngine,
		onServerToolWebSearchEngineChange,
		serverToolWebSearchContextSize,
		onServerToolWebSearchContextSizeChange,
		serverToolWebSearchMaxResults,
		onServerToolWebSearchMaxResultsChange,
		serverToolWebSearchMaxTotalResults,
		onServerToolWebSearchMaxTotalResultsChange,
		serverToolWebSearchMaxCharacters,
		onServerToolWebSearchMaxCharactersChange,
		serverToolWebSearchAllowedDomains,
		onServerToolWebSearchAllowedDomainsChange,
		serverToolWebSearchBlockedDomains,
		onServerToolWebSearchBlockedDomainsChange,
		apiServerToolsEnabled,
		onApiServerToolsEnabledChange,
		serverToolTimezone,
		onServerToolTimezoneChange,
		serverToolWebFetchEnabled,
		onServerToolWebFetchEnabledChange,
		serverToolWebFetchEngine,
		onServerToolWebFetchEngineChange,
		serverToolWebFetchMaxContentTokens,
		onServerToolWebFetchMaxContentTokensChange,
		serverToolWebFetchAllowedDomains,
		onServerToolWebFetchAllowedDomainsChange,
		serverToolWebFetchBlockedDomains,
		onServerToolWebFetchBlockedDomainsChange,
		serverToolAdvisorEnabled,
		onServerToolAdvisorEnabledChange,
		serverToolAdvisors,
		onServerToolAdvisorsChange,
		serverToolImageGenerationEnabled,
		onServerToolImageGenerationEnabledChange,
		serverToolImageGenerationModel,
		onServerToolImageGenerationModelChange,
		serverToolImageGenerationQuality,
		onServerToolImageGenerationQualityChange,
		serverToolImageGenerationAspectRatio,
		onServerToolImageGenerationAspectRatioChange,
		serverToolImageGenerationSize,
		onServerToolImageGenerationSizeChange,
		serverToolImageGenerationBackground,
		onServerToolImageGenerationBackgroundChange,
		serverToolImageGenerationOutputFormat,
		onServerToolImageGenerationOutputFormatChange,
		serverToolImageGenerationOutputCompression,
		onServerToolImageGenerationOutputCompressionChange,
		serverToolImageGenerationModeration,
		onServerToolImageGenerationModerationChange,
		serverToolSubagentEnabled,
		onServerToolSubagentEnabledChange,
		serverToolSubagentModel,
		onServerToolSubagentModelChange,
		serverToolSubagentInstructions,
		onServerToolSubagentInstructionsChange,
		serverToolSubagentMaxUses,
		onServerToolSubagentMaxUsesChange,
		serverToolFusionEnabled,
		onServerToolFusionEnabledChange,
		serverToolFusionAnalysisModels,
		onServerToolFusionAnalysisModelsChange,
		serverToolFusionJudgeModel,
		onServerToolFusionJudgeModelChange,
		serverToolFusionMaxUses,
		onServerToolFusionMaxUsesChange,
		serverToolModelChoices,
		serverToolLatestModelChoices,
		serverToolImageGenerationModelChoices,
		serverToolImageGenerationLatestModelChoices,
		contextMessageLimit,
		onContextMessageLimitChange,
		showEvaluationPrompts,
		reasoningEnabled,
		reasoningPickerOpen,
		onReasoningPickerOpenChange,
		reasoningSelection,
		reasoningOptions,
		onReasoningSelection,
		isRecording,
		isStartingRecording,
		recordingSupported,
		onToggleRecording,
		onSubmit,
		onSelectEvaluationPrompt,
		onComposerChange,
		onRemoveAttachment,
		onFileSelect,
	} = props;
	const promptScrollAreaRef = useRef<HTMLDivElement | null>(null);
	const advisorAddButtonRef = useRef<HTMLButtonElement | null>(null);
	const [selectedServerToolId, setSelectedServerToolId] =
		useState<ServerToolId | null>(null);
	const [previewAttachmentIndex, setPreviewAttachmentIndex] =
		useState<number | null>(null);

	const serverTools = useMemo<ServerToolMenuItem[]>(
		() => [
			{
				id: "web-search",
				label: "Web Search",
				description: "Search the web for current information",
				summary: "Managed search",
				detail:
					"Adds ai-stats:web_search. The model decides when to search, writes the query, and receives URLs, snippets, highlights, and optional page text.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/web-search`,
				icon: Globe2,
				enabled: webSearchEnabled,
				onEnabledChange: onWebSearchEnabledChange,
			},
			{
				id: "web-fetch",
				label: "Web Fetch",
				description: "Retrieve content from URLs",
				summary: "Model-provided URLs",
				detail:
					"Adds ai-stats:web_fetch. The model can ask AI Stats to fetch and extract readable text from specific URLs during the tool loop.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/web-fetch`,
				icon: Link2,
				enabled: serverToolWebFetchEnabled,
				onEnabledChange: onServerToolWebFetchEnabledChange,
			},
			{
				id: "image-generation",
				label: "Image Generation",
				description: "Generate images from text",
				summary: "Server-side image tool",
				detail:
					"Adds ai-stats:image_generation. The model can request an image generation step and use the generated result while answering.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/image-generation`,
				icon: ImageIcon,
				enabled: serverToolImageGenerationEnabled,
				onEnabledChange: onServerToolImageGenerationEnabledChange,
			},
			{
				id: "datetime",
				label: "Datetime",
				description: "Current date and time info",
				summary: serverToolTimezone.trim() || "Auto",
				detail:
					"Adds gateway:datetime. The model can request the current timestamp and resolved timezone when the answer depends on dates or time.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/datetime`,
				icon: Clock3,
				enabled: apiServerToolsEnabled,
				onEnabledChange: onApiServerToolsEnabledChange,
			},
			{
				id: "fusion",
				label: "Fusion",
				description: "Multi-model consensus and analysis",
				summary: `${serverToolFusionAnalysisModels.filter(Boolean).length || FUSION_ANALYSIS_MODEL_COUNT} models`,
				detail:
					"Configures named advisor tools so the main model can consult analysis workers and an optional judge during the same chat loop.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/fusion`,
				icon: Sparkles,
				enabled: serverToolFusionEnabled,
				onEnabledChange: onServerToolFusionEnabledChange,
			},
			{
				id: "advisor",
				label: "Advisor",
				description: "Consult a stronger model for guidance",
				summary:
					serverToolAdvisors.length > 0
						? `${serverToolAdvisors.length} advisor${
								serverToolAdvisors.length === 1 ? "" : "s"
							}`
						: "One review call",
				detail:
					"Adds ai-stats:advisor. The main model can ask a second model for a review, plan, sanity check, or specialist opinion before finalizing.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/advisor`,
				icon: Lightbulb,
				enabled: serverToolAdvisorEnabled,
				onEnabledChange: onServerToolAdvisorEnabledChange,
			},
			{
				id: "subagent",
				label: "Subagent",
				description: "Delegate focused tasks to a faster model",
				summary: `Worker: ${formatModelSummary(
					serverToolSubagentModel,
					serverToolModelChoices,
					serverToolLatestModelChoices,
				)}`,
				detail:
					"Adds ai-stats:subagent. The main model can delegate self-contained tasks and receive the worker result inside the same chat loop.",
				docsHref: `${SERVER_TOOLS_DOCS_BASE}/subagent`,
				icon: Cpu,
				enabled: serverToolSubagentEnabled,
				onEnabledChange: onServerToolSubagentEnabledChange,
			},
		],
		[
			apiServerToolsEnabled,
			onApiServerToolsEnabledChange,
			onServerToolAdvisorEnabledChange,
			onServerToolImageGenerationEnabledChange,
			onServerToolSubagentEnabledChange,
			onServerToolFusionEnabledChange,
			onServerToolWebFetchEnabledChange,
			onWebSearchEnabledChange,
			serverToolAdvisorEnabled,
			serverToolAdvisors,
			serverToolFusionAnalysisModels,
			serverToolFusionEnabled,
			serverToolImageGenerationEnabled,
			serverToolModelChoices,
			serverToolLatestModelChoices,
			serverToolSubagentEnabled,
			serverToolSubagentModel,
			serverToolTimezone,
			serverToolWebFetchEnabled,
			webSearchEnabled,
		],
	);
	const enabledServerToolCount = serverTools.filter(
		(tool) => tool.enabled,
	).length;
	const reasoningSelectionLabel =
		reasoningOptions.find((option) => option.value === reasoningSelection)?.label ??
		(reasoningSelection === "xhigh"
			? "xHigh"
			: reasoningSelection === "max"
				? "Max"
				: "Medium");
	const contextMessageLimitLabel =
		formatContextMessageLimit(contextMessageLimit);
	const contextTriggerLabel =
		formatContextTriggerLabel(contextMessageLimit);
	const numericContextMessageLimit =
		contextMessageLimit === "all" ? 100 : contextMessageLimit;
	const updateContextMessageLimit = (value: number) => {
		onContextMessageLimitChange?.(clampContextMessageLimit(value));
	};
	const isReasoningOptionSelected = (
		optionValue: NonNullable<ChatSettings["reasoningEffort"]>,
	) => optionValue === reasoningSelection;
	const selectedServerTool = selectedServerToolId
		? serverTools.find((tool) => tool.id === selectedServerToolId) ?? null
		: null;
	const previewAttachment =
		previewAttachmentIndex == null
			? null
			: attachments[previewAttachmentIndex] ?? null;
	const previewAttachmentUrl =
		previewAttachmentIndex == null
			? null
			: attachmentPreviewUrls[previewAttachmentIndex] ?? null;
	const toggleServerTool = (
		tool: ServerToolMenuItem,
		enabled: boolean,
	) => {
		if (!isUnified || tool.disabled) return;
		tool.onEnabledChange?.(enabled);
	};
	const renderModelSelect = ({
		value,
		onChange,
		ariaLabel,
		placeholder,
		options = serverToolModelChoices,
		latestOptions = serverToolLatestModelChoices,
	}: {
		value: string;
		onChange?: (value: string) => void;
		ariaLabel: string;
		placeholder?: string;
		options?: ServerToolModelChoice[];
		latestOptions?: ServerToolModelChoice[];
	}) => (
		<ModelDropdown
			value={value}
			onValueChange={onChange}
			options={options}
			latestOptions={latestOptions}
			placeholder={placeholder}
			ariaLabel={ariaLabel}
			contentClassName="w-[390px]"
		/>
	);
	const visibleServerToolAdvisors =
		serverToolAdvisors.length > 0
			? serverToolAdvisors
			: [createDefaultAdvisor()];
	const advisorNamePlaceholder =
		visibleServerToolAdvisors.length > 1
			? "Name (required for multiple)"
			: "Name (optional)";
	const updateAdvisor = (
		index: number,
		patch: Partial<ChatServerToolAdvisor>,
	) => {
		const base =
			serverToolAdvisors.length > 0
				? serverToolAdvisors
				: [createDefaultAdvisor()];
		const next = base.map((advisor, advisorIndex) =>
			advisorIndex === index ? { ...advisor, ...patch } : advisor,
		);
		onServerToolAdvisorsChange?.(next);
	};
	const addAdvisor = () => {
		onServerToolAdvisorsChange?.([
			...serverToolAdvisors,
			createDefaultAdvisor(),
		]);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				advisorAddButtonRef.current?.scrollIntoView({
					block: "end",
				});
			});
		});
	};
	const removeAdvisor = (index: number) => {
		onServerToolAdvisorsChange?.(
			serverToolAdvisors.filter((_, advisorIndex) => advisorIndex !== index),
		);
	};
	const updateFusionAnalysisModel = (index: number, modelId: string) => {
		const next = Array.from(
			{ length: FUSION_ANALYSIS_MODEL_COUNT },
			(_, itemIndex) => serverToolFusionAnalysisModels[itemIndex] ?? "",
		);
		next[index] = modelId;
		onServerToolFusionAnalysisModelsChange?.(next);
	};
	const renderServerToolsMenu = () => {
		if (selectedServerTool) {
			const Icon = selectedServerTool.icon;
			return (
				<div className="min-h-[430px]">
					<div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-border px-3 py-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 gap-1 px-1.5 text-xs font-medium text-muted-foreground"
							onClick={() => setSelectedServerToolId(null)}
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							Back
						</Button>
					</div>
					<div className="space-y-4 pt-4">
						<div className="flex min-w-0 items-center gap-2">
							<Icon className="h-4 w-4 shrink-0" />
							<a
								href={selectedServerTool.docsHref}
								target="_blank"
								rel="noreferrer"
								className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold hover:text-primary"
							>
								{selectedServerTool.label} Settings
								<ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							</a>
						</div>
						{selectedServerTool.disabledReason ? (
							<p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
								{selectedServerTool.disabledReason}
							</p>
						) : null}
						{selectedServerTool.id === "datetime" ? (
							<div className="space-y-2">
								<label
									className="text-xs font-medium text-muted-foreground"
								>
									Timezone
								</label>
								<TimezoneDropdown
									value={serverToolTimezone}
									onValueChange={onServerToolTimezoneChange}
								/>
								<p className="text-xs text-muted-foreground">
									Auto leaves timezone selection to the gateway default.
									Choose an IANA timezone when a prompt needs a
									specific region.
								</p>
							</div>
						) : null}
						{selectedServerTool.id === "web-search" ? (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<div className="text-xs font-medium text-muted-foreground">
										Engine
									</div>
									<SegmentedSetting
										value={serverToolWebSearchEngine}
										options={WEB_SEARCH_ENGINE_OPTIONS}
										onChange={onServerToolWebSearchEngineChange}
										columns={3}
									/>
								</div>
								<div className="space-y-1.5">
									<div className="text-xs font-medium text-muted-foreground">
										Context size
									</div>
									<SegmentedSetting
										value={serverToolWebSearchContextSize}
										options={[
											{ value: "low", label: "Low" },
											{ value: "medium", label: "Medium" },
											{ value: "high", label: "High" },
										]}
										onChange={(value) =>
											onServerToolWebSearchContextSizeChange?.(
												value as "low" | "medium" | "high",
											)
										}
									/>
								</div>
								<div className="grid grid-cols-2 gap-2">
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Results per search
										</label>
										<Input
											type="number"
											min={1}
											max={25}
											value={serverToolWebSearchMaxResults ?? ""}
											onChange={(event) =>
												onServerToolWebSearchMaxResultsChange?.(
													parsePositiveIntInput(
														event.target.value,
														25,
													),
												)
											}
											placeholder="Default: 5, max 25"
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Total results limit
										</label>
										<Input
											type="number"
											min={1}
											max={100}
											value={
												serverToolWebSearchMaxTotalResults ?? ""
											}
											onChange={(event) =>
												onServerToolWebSearchMaxTotalResultsChange?.(
													parsePositiveIntInput(
														event.target.value,
														100,
													),
												)
											}
											placeholder="Default: 50"
											className="h-8 text-sm"
										/>
									</div>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Max characters
									</label>
									<Input
										type="number"
										min={1}
										max={50000}
										value={serverToolWebSearchMaxCharacters ?? ""}
										onChange={(event) =>
											onServerToolWebSearchMaxCharactersChange?.(
												parsePositiveIntInput(
													event.target.value,
													50000,
												),
											)
										}
										placeholder="Exact per-result char limit"
										className="h-8 text-sm"
									/>
								</div>
								<AdditionalSettingsSection>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Allowed domains
										</label>
										<Input
											value={serverToolWebSearchAllowedDomains}
											onChange={(event) =>
												onServerToolWebSearchAllowedDomainsChange?.(
													event.target.value,
												)
											}
											placeholder="e.g. docs.example.com, api.example.com"
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Blocked domains
										</label>
										<Input
											value={serverToolWebSearchBlockedDomains}
											onChange={(event) =>
												onServerToolWebSearchBlockedDomainsChange?.(
													event.target.value,
												)
											}
											placeholder="e.g. ads.example, spam.example"
											className="h-8 text-sm"
										/>
									</div>
								</AdditionalSettingsSection>
							</div>
						) : null}
						{selectedServerTool.id === "web-fetch" ? (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<div className="text-xs font-medium text-muted-foreground">
										Engine
									</div>
									<SegmentedSetting
										value={serverToolWebFetchEngine}
										options={WEB_FETCH_ENGINE_OPTIONS}
										onChange={onServerToolWebFetchEngineChange}
										columns={3}
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Max content tokens
									</label>
									<Input
										type="number"
										min={1}
										max={50000}
										value={serverToolWebFetchMaxContentTokens ?? ""}
										onChange={(event) =>
											onServerToolWebFetchMaxContentTokensChange?.(
												parsePositiveIntInput(
													event.target.value,
													50000,
												),
											)
										}
										placeholder="Default: 12000"
										className="h-8 text-sm"
									/>
								</div>
								<AdditionalSettingsSection>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Allowed domains
										</label>
										<Input
											value={serverToolWebFetchAllowedDomains}
											onChange={(event) =>
												onServerToolWebFetchAllowedDomainsChange?.(
													event.target.value,
												)
											}
											placeholder="e.g. docs.example.com, api.example.com"
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Blocked domains
										</label>
										<Input
											value={serverToolWebFetchBlockedDomains}
											onChange={(event) =>
												onServerToolWebFetchBlockedDomainsChange?.(
													event.target.value,
												)
											}
											placeholder="e.g. ads.example, spam.example"
											className="h-8 text-sm"
										/>
									</div>
								</AdditionalSettingsSection>
							</div>
						) : null}
						{selectedServerTool.id === "image-generation" ? (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Model
									</label>
									{renderModelSelect({
										value: serverToolImageGenerationModel,
										onChange: onServerToolImageGenerationModelChange,
										ariaLabel: "Image generation model",
										placeholder: "Auto",
										options: serverToolImageGenerationModelChoices,
										latestOptions:
											serverToolImageGenerationLatestModelChoices,
									})}
								</div>
								<div className="space-y-1.5">
									<div className="text-xs font-semibold text-muted-foreground">
										Basics
									</div>
									<label className="text-xs font-medium text-muted-foreground">
										Quality
									</label>
									<SegmentedSetting
										value={serverToolImageGenerationQuality}
										options={IMAGE_QUALITY_OPTIONS}
										onChange={onServerToolImageGenerationQualityChange}
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Aspect ratio
									</label>
									<SelectSetting
										value={serverToolImageGenerationAspectRatio}
										options={IMAGE_ASPECT_RATIO_OPTIONS}
										onChange={
											onServerToolImageGenerationAspectRatioChange
										}
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Size
									</label>
									<SelectSetting
										value={serverToolImageGenerationSize}
										options={IMAGE_SIZE_OPTIONS}
										onChange={onServerToolImageGenerationSizeChange}
									/>
								</div>
								<AdditionalSettingsSection>
									<div className="space-y-1.5">
										<div className="text-xs font-semibold text-muted-foreground">
											Output
										</div>
										<label className="text-xs font-medium text-muted-foreground">
											Background
										</label>
										<SegmentedSetting
											value={serverToolImageGenerationBackground}
											options={IMAGE_BACKGROUND_OPTIONS}
											onChange={
												onServerToolImageGenerationBackgroundChange
											}
											columns={3}
										/>
									</div>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Output format
										</label>
										<SegmentedSetting
											value={serverToolImageGenerationOutputFormat}
											options={IMAGE_OUTPUT_FORMAT_OPTIONS}
											onChange={
												onServerToolImageGenerationOutputFormatChange
											}
											columns={4}
										/>
									</div>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground">
											Output compression
										</label>
										<Input
											type="number"
											min={0}
											max={100}
											value={
												serverToolImageGenerationOutputCompression ??
												""
											}
											onChange={(event) =>
												onServerToolImageGenerationOutputCompressionChange?.(
													parseCompressionInput(
														event.target.value,
													),
												)
											}
											placeholder="Default (0-100)"
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1.5">
										<div className="text-xs font-semibold text-muted-foreground">
											Safety
										</div>
										<label className="text-xs font-medium text-muted-foreground">
											Moderation
										</label>
										<SegmentedSetting
											value={serverToolImageGenerationModeration}
											options={IMAGE_MODERATION_OPTIONS}
											onChange={
												onServerToolImageGenerationModerationChange
											}
											columns={2}
										/>
									</div>
								</AdditionalSettingsSection>
							</div>
						) : null}
						{selectedServerTool.id === "advisor" ? (
							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">
									Advisors
								</div>
								<div className="space-y-2">
									{visibleServerToolAdvisors.map((advisor, index) => (
										<div
											key={index}
											className="rounded-md border border-border p-2"
										>
											<div className="flex items-center gap-2">
												<Input
													value={advisor.name}
													onChange={(event) =>
														updateAdvisor(index, {
															name: event.target.value,
														})
													}
													placeholder={advisorNamePlaceholder}
													className="h-8 text-sm"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
													aria-label="Remove advisor"
													onClick={() => removeAdvisor(index)}
												>
													<X className="h-3.5 w-3.5" />
												</Button>
											</div>
											<div className="mt-2">
												{renderModelSelect({
													value: advisor.model ?? "",
													onChange: (model) =>
														updateAdvisor(index, { model }),
													ariaLabel: `Advisor ${index + 1} model`,
													placeholder: "Default model",
												})}
											</div>
											<Input
												value={advisor.instructions ?? ""}
												onChange={(event) =>
													updateAdvisor(index, {
														instructions: event.target.value,
													})
												}
												placeholder="Instructions (optional)"
												className="mt-2 h-8 text-sm"
											/>
										</div>
									))}
								</div>
								<Button
									ref={advisorAddButtonRef}
									type="button"
									variant="outline"
									className="h-8 w-full gap-1.5 border-dashed text-xs font-medium text-muted-foreground"
									onClick={addAdvisor}
								>
									<Plus className="h-3.5 w-3.5" />
									Add advisor
								</Button>
							</div>
						) : null}
						{selectedServerTool.id === "subagent" ? (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Worker model
									</label>
									{renderModelSelect({
										value: serverToolSubagentModel,
										onChange: onServerToolSubagentModelChange,
										ariaLabel: "Subagent worker model",
									})}
								</div>
								<div className="space-y-1.5">
									<label
										htmlFor="server-tool-subagent-instructions"
										className="text-xs font-medium text-muted-foreground"
									>
										Instructions
									</label>
									<Input
										id="server-tool-subagent-instructions"
										value={serverToolSubagentInstructions}
										onChange={(event) =>
											onServerToolSubagentInstructionsChange?.(
												event.target.value,
											)
										}
										placeholder="e.g. You are a fast, focused worker."
										className="h-8 text-sm"
									/>
								</div>
								<div className="space-y-1.5">
									<label
										htmlFor="server-tool-subagent-max-uses"
										className="text-xs font-medium text-muted-foreground"
									>
										Max tool calls
									</label>
									<Input
										id="server-tool-subagent-max-uses"
										type="number"
										min={1}
										max={99}
										value={serverToolSubagentMaxUses ?? ""}
										onChange={(event) =>
											onServerToolSubagentMaxUsesChange?.(
												parseMaxUsesInput(event.target.value),
											)
										}
										placeholder="Provider default"
										className="h-8 text-sm"
									/>
								</div>
							</div>
						) : null}
						{selectedServerTool.id === "fusion" ? (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Analysis models
									</label>
									<div className="space-y-2">
										{Array.from({
											length: FUSION_ANALYSIS_MODEL_COUNT,
										}).map((_, index) => (
											<div key={index}>
												{renderModelSelect({
													value:
														serverToolFusionAnalysisModels[
															index
														] ?? "",
													onChange: (modelId) =>
														updateFusionAnalysisModel(
															index,
															modelId,
														),
													ariaLabel: `Fusion analysis model ${
														index + 1
													}`,
												})}
											</div>
										))}
									</div>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Judge model
									</label>
									{renderModelSelect({
										value: serverToolFusionJudgeModel,
										onChange: onServerToolFusionJudgeModelChange,
										ariaLabel: "Fusion judge model",
									})}
								</div>
								<div className="space-y-1.5">
									<label
										htmlFor="server-tool-fusion-max-uses"
										className="text-xs font-medium text-muted-foreground"
									>
										Max tool calls
									</label>
									<Input
										id="server-tool-fusion-max-uses"
										type="number"
										min={1}
										max={99}
										value={serverToolFusionMaxUses ?? ""}
										onChange={(event) =>
											onServerToolFusionMaxUsesChange?.(
												parseMaxUsesInput(event.target.value),
											)
										}
										placeholder="Default: 8"
										className="h-8 text-sm"
									/>
								</div>
							</div>
						) : null}
					</div>
				</div>
			);
		}

		return (
			<div className="space-y-1">
				<div className="-mx-3 -mt-3 flex items-center justify-between border-b border-border px-4 py-3">
					<div className="flex items-center gap-2">
						<a
							href={SERVER_TOOLS_DOCS_BASE}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
						>
							Server Tools
							<ExternalLink className="h-3.5 w-3.5" />
						</a>
					</div>
					{enabledServerToolCount > 0 ? (
						<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
							{enabledServerToolCount} on
						</span>
					) : null}
				</div>
				<div className="py-2">
					{serverTools.map((tool) => {
						const Icon = tool.icon;
						return (
							<div
								key={tool.id}
								className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/60 focus-within:bg-muted/60"
							>
								<button
									type="button"
									className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
									onClick={() => setSelectedServerToolId(tool.id)}
								>
									<Icon className="h-4 w-4 shrink-0 text-foreground" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{tool.label}
										</span>
										<span className="mt-0.5 block truncate text-xs text-muted-foreground">
											{tool.description}
										</span>
										<span className="mt-1 block truncate text-[11px] text-muted-foreground/80">
											{tool.summary}
										</span>
									</span>
								</button>
								<Switch
									checked={tool.enabled}
									disabled={!isUnified || Boolean(tool.disabled)}
									onCheckedChange={(enabled) =>
										toggleServerTool(tool, enabled)
									}
									aria-label={`Toggle ${tool.label}`}
								/>
								<button
									type="button"
									className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
									onClick={() => setSelectedServerToolId(tool.id)}
									aria-label={`${tool.label} settings`}
								>
									<ChevronRight className="h-4 w-4" />
								</button>
							</div>
						);
					})}
				</div>
			</div>
		);
	};

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

	return (
		<>
			<div className="border-t border-border bg-background px-4 py-4 md:px-8">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
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
				{showEvaluationPrompts && attachments.length === 0 ? (
					<ScrollArea
						ref={promptScrollAreaRef}
						className="-mx-4 w-[calc(100%+2rem)] whitespace-nowrap px-4 md:-mx-8 md:w-[calc(100%+4rem)] md:px-8"
						aria-label="Prompt presets"
					>
						<div className="flex w-max gap-3 py-1">
							{PROMPT_SCROLL_COPIES.map((copyIndex) => (
								<div
									key={copyIndex}
									className="flex shrink-0 gap-3"
									aria-hidden={copyIndex !== 1}
								>
									{EVALUATION_PROMPTS.map((item) => (
										<button
											key={`${item.title}-${copyIndex}`}
											type="button"
											className="group/card flex h-16 w-56 shrink-0 flex-col justify-center overflow-hidden rounded-xl bg-card px-4 text-left text-foreground shadow-sm ring-1 ring-border/40 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-60"
											onClick={() =>
												onSelectEvaluationPrompt(item.prompt)
											}
											tabIndex={copyIndex === 1 ? 0 : -1}
										>
											<span className="w-full truncate text-[13px] font-medium transition-colors group-hover/card:text-foreground sm:text-sm">
												{item.title}
											</span>
											<span className="mt-1 w-full truncate text-xs text-muted-foreground">
												{item.description}
											</span>
										</button>
									))}
								</div>
							))}
						</div>
						<ScrollBar className="hidden" orientation="horizontal" />
					</ScrollArea>
				) : null}
				{attachments.length > 0 ? (
					<div className="space-y-2">
						<div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
							<span>Attachments</span>
							<span>
								{attachments.length}{" "}
								{attachments.length === 1 ? "file" : "files"}
							</span>
						</div>
						<div className="flex gap-2 overflow-x-auto pb-1">
							{attachments.map((file, index) => {
								const previewUrl = attachmentPreviewUrls[index];

								return (
									<div
										key={`${file.name}-${file.size}-${index}`}
										className="relative flex h-20 w-60 shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:bg-muted/35"
									>
										<button
											type="button"
											className="flex min-w-0 flex-1 items-center gap-3 p-2 pr-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
											onClick={() => setPreviewAttachmentIndex(index)}
											aria-label={`Preview ${file.name}`}
										>
											<span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
												{previewUrl ? (
													// eslint-disable-next-line @next/next/no-img-element
													<img
														src={previewUrl}
														alt=""
														className="h-full w-full object-cover"
													/>
												) : (
													<AttachmentFileIcon
														file={file}
														className="h-5 w-5"
													/>
												)}
											</span>
											<span className="min-w-0 space-y-1">
												<span className="block truncate text-sm font-medium text-foreground">
													{file.name}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{getAttachmentKindLabel(file)} -{" "}
													{formatAttachmentSize(file.size)}
												</span>
											</span>
										</button>
										<button
											type="button"
											className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											onClick={(event) => {
												event.stopPropagation();
												onRemoveAttachment(index);
											}}
											aria-label={`Remove ${file.name}`}
										>
											<X className="h-3 w-3" />
										</button>
									</div>
								);
							})}
						</div>
					</div>
				) : null}
				<div className="rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
					<input
						ref={fileInputRef}
						type="file"
						aria-label="Attach files"
						className="hidden"
						multiple
						onChange={onFileSelect}
					/>
					<input
						ref={audioInputRef}
						type="file"
						accept="audio/*"
						aria-label="Attach audio"
						className="hidden"
						multiple
						onChange={onFileSelect}
					/>
					<Textarea
						ref={textareaRef}
						value={composer}
						onChange={(event) => onComposerChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								onSubmit();
							}
						}}
						rows={2}
						placeholder={placeholder}
						className="min-h-[56px] resize-none border-0 !bg-transparent px-1 py-2 shadow-none focus-visible:ring-0 dark:!bg-transparent"
					/>
					<div className="flex items-center justify-between pt-2">
						<div className="flex items-center gap-2">
							<Popover>
								<Tooltip>
									<TooltipTrigger asChild>
										<PopoverTrigger asChild>
											<Button
												variant="ghost"
												className="h-8 gap-1.5 px-2 text-xs font-medium"
												aria-label={`Message context: ${contextMessageLimitLabel}`}
											>
												<MessageSquareText className="h-4 w-4 text-muted-foreground" />
												{contextTriggerLabel}
											</Button>
										</PopoverTrigger>
									</TooltipTrigger>
									<TooltipContent>
										Message context: {contextMessageLimitLabel}
									</TooltipContent>
								</Tooltip>
								<PopoverContent
									align="start"
									className="w-72 p-3"
									onOpenAutoFocus={(event) => event.preventDefault()}
								>
									<div className="space-y-4">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="text-sm font-medium">
													Context window
												</div>
												<div className="mt-0.5 text-xs text-muted-foreground">
													{contextMessageLimit === "all"
														? "Entire thread"
														: "Recent chat history"}
												</div>
											</div>
											<Input
												type="text"
												inputMode="numeric"
												pattern="[0-9]*"
												value={
													contextMessageLimit === "all"
														? ""
														: contextMessageLimit
												}
												placeholder="All"
												className="h-8 w-16 text-center text-sm font-medium"
												onChange={(event) => {
													const rawValue =
														event.target.value.trim();
													if (!rawValue) return;
													const value = Number(rawValue);
													if (!Number.isFinite(value)) return;
													updateContextMessageLimit(value);
												}}
												onBlur={(event) => {
													if (!event.target.value.trim()) {
														onContextMessageLimitChange?.("all");
													}
												}}
												aria-label="Exact message context count"
											/>
										</div>
										<div className="px-1 pt-2">
											<div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
												<span>1</span>
												<span>
													{contextMessageLimit === "all"
														? "All"
														: `${contextMessageLimit}`}
												</span>
												<span>100</span>
											</div>
											<Slider
												min={1}
												max={100}
												step={1}
												value={[numericContextMessageLimit]}
												onValueChange={(values) => {
													const [value] = values;
													if (typeof value !== "number") return;
													updateContextMessageLimit(value);
												}}
												aria-label="Message context slider"
											/>
										</div>
										<div className="space-y-2">
											<div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
												Presets
											</div>
											<div className="flex flex-wrap gap-1">
												{CONTEXT_MESSAGE_LIMIT_OPTIONS.map(
													(option) => {
														const selected =
															option.value ===
															contextMessageLimit;
														return (
															<Button
																key={option.value}
																type="button"
																variant={
																	selected
																		? "secondary"
																		: "ghost"
																}
																size="sm"
																className="h-7 min-w-8 px-2 text-xs"
																onClick={() =>
																	onContextMessageLimitChange?.(
																		option.value,
																	)
																}
															>
																{option.value}
															</Button>
														);
													},
												)}
												<Button
													type="button"
													variant={
														contextMessageLimit === "all"
															? "secondary"
															: "ghost"
													}
													size="sm"
													className="h-7 min-w-10 px-2 text-xs"
													onClick={() =>
														onContextMessageLimitChange?.(
															"all",
														)
													}
												>
													All
												</Button>
											</div>
										</div>
										<p className="text-xs leading-5 text-muted-foreground">
											Sets how much chat history is sent. System
											prompt is always included.
										</p>
									</div>
								</PopoverContent>
							</Popover>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										disabled={!isUnified}
										onClick={() => fileInputRef.current?.click()}
									>
										<Paperclip className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isUnified ? "Add files" : "Not available in this room"}
								</TooltipContent>
							</Tooltip>
							<Popover
								onOpenChange={(open) => {
									if (!open) setSelectedServerToolId(null);
								}}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<PopoverTrigger asChild>
											<Button
												variant="ghost"
												disabled={!isUnified}
												className={cn(
													"h-8 gap-1.5 px-2",
													enabledServerToolCount > 0 && isUnified
														? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
														: "",
												)}
												aria-label="Server tools"
											>
												<Wrench className="h-4 w-4" />
												{enabledServerToolCount > 0 ? (
													<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
														{enabledServerToolCount}
													</span>
												) : null}
											</Button>
										</PopoverTrigger>
									</TooltipTrigger>
									<TooltipContent>
										{isUnified
											? "Server tools"
											: "Not available in this room"}
									</TooltipContent>
								</Tooltip>
								<PopoverContent
									align="start"
									side="top"
									sideOffset={10}
									className="max-h-[calc(100vh-6rem)] w-[min(416px,calc(100vw-2rem))] overflow-y-auto overscroll-contain p-3"
								>
									{renderServerToolsMenu()}
								</PopoverContent>
							</Popover>
							<Popover
								open={reasoningPickerOpen}
								onOpenChange={onReasoningPickerOpenChange}
							>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										aria-label={`Reasoning effort: ${reasoningSelectionLabel}`}
										className={cn(
											"h-8 px-2 text-xs font-medium",
											reasoningEnabled
												? "bg-muted text-foreground"
												: "",
										)}
									>
										{reasoningSelectionLabel}
									</Button>
								</PopoverTrigger>
								<PopoverContent align="start" className="w-40 p-1">
									<div className="grid gap-0.5">
										{reasoningOptions.map((option) => {
											return (
												<Button
													key={option.value}
													type="button"
													variant="ghost"
													className="h-8 w-full justify-between gap-2 px-2 text-sm"
													onClick={() =>
														onReasoningSelection(option.value)
													}
												>
													<span className="flex-1 text-left">
														{option.label}
													</span>
													<Check
														className={cn(
															"ml-2 h-3.5 w-3.5 shrink-0",
															isReasoningOptionSelected(
																option.value,
															)
																? "opacity-100"
																: "opacity-0",
														)}
													/>
												</Button>
											);
										})}
									</div>
								</PopoverContent>
							</Popover>
						</div>
						<div className="flex items-center gap-2">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										disabled={isStartingRecording}
										className={cn(
											"h-8 w-8",
											isRecording
												? "bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary"
												: "",
										)}
										onClick={onToggleRecording}
										aria-label={
											isRecording ? "Stop recording" : "Record audio"
										}
									>
										{isRecording ? (
											<Square className="h-3.5 w-3.5 fill-current" />
										) : (
											<Mic className="h-4 w-4" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isRecording
										? "Stop recording and attach audio"
										: recordingSupported
											? "Record and attach audio"
											: "Recording unavailable in this browser context, click to add audio file"}
								</TooltipContent>
							</Tooltip>
							<Button
								size="icon"
								variant={temporaryMode ? "outline" : "default"}
								className={cn(
									temporaryMode &&
										"border-border bg-muted/60 text-foreground hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted/60",
								)}
								onClick={onSubmit}
								disabled={
									isSending ||
									(!composer.trim() && attachments.length === 0)
								}
								aria-label={
									temporaryMode ? "Send temporary message" : "Send message"
								}
							>
								{isSending ? (
									<Spinner className="h-4 w-4" />
								) : (
									<SendHorizontal className="h-4 w-4" />
								)}
							</Button>
						</div>
					</div>
				</div>
			</div>
			</div>
			<Dialog
				open={Boolean(previewAttachment)}
				onOpenChange={(open) => {
					if (!open) setPreviewAttachmentIndex(null);
				}}
			>
				<DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
					{previewAttachment ? (
						<>
							<DialogHeader className="border-b px-4 py-3 text-left">
								<DialogTitle className="truncate pr-8 text-base">
									{previewAttachment.name}
								</DialogTitle>
								<DialogDescription>
									{getAttachmentKindLabel(previewAttachment)} -{" "}
									{formatAttachmentSize(previewAttachment.size)}
								</DialogDescription>
							</DialogHeader>
							{previewAttachmentUrl ? (
								<div className="max-h-[70vh] bg-muted/40 p-2">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={previewAttachmentUrl}
										alt={previewAttachment.name}
										className="mx-auto max-h-[68vh] max-w-full rounded-lg object-contain"
									/>
								</div>
							) : (
								<div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
									<span className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
										<AttachmentFileIcon
											file={previewAttachment}
											className="h-6 w-6"
										/>
									</span>
									<div className="space-y-1">
										<p className="text-sm font-medium">
											Preview unavailable
										</p>
										<p className="max-w-sm text-sm text-muted-foreground">
											This file type can be attached to the message, but
											only image files can be previewed here.
										</p>
									</div>
								</div>
							)}
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
