"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type RefObject,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
	Brain,
	CalendarClock,
	Check,
	ChevronRight,
	Cpu,
	FileCode,
	FileSearch,
	Globe,
	ImagePlus,
	Info,
	MessageSquare,
	Mic,
	Paperclip,
	Plus,
	SendHorizontal,
	Star,
	type LucideIcon,
	Search,
	Settings2,
	X,
} from "lucide-react";
import type {
	ChatAdvisorServerToolConfig,
	ChatServerToolConfigs,
	ChatServerToolType,
	ChatSettings,
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
	ScrollArea,
	ScrollBar,
} from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
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

type SlashMenu = "main" | "reasoning" | "model" | "tools";

type ComposerModelOption = Pick<
	ModelOption,
	| "modelId"
	| "orgId"
	| "label"
	| "orgName"
	| "providerIds"
	| "providerNames"
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
		id: "server-tool-datetime",
		label: "Datetime",
		toolType: "gateway:datetime",
		description: "Current date and time",
		keywords: ["server", "tool", "datetime", "date", "time", "timezone"],
		icon: CalendarClock,
	},
	{
		id: "server-tool-web-search",
		label: "Web Search",
		toolType: "ai-stats:web_search",
		description: "Model-directed web searches",
		keywords: ["server", "tool", "web", "search", "grounding", "current"],
		icon: Search,
	},
	{
		id: "server-tool-web-fetch",
		label: "Web Fetch",
		toolType: "ai-stats:web_fetch",
		description: "Fetch and read URLs",
		keywords: ["server", "tool", "web", "fetch", "url", "page"],
		icon: FileSearch,
	},
	{
		id: "server-tool-advisor",
		label: "Advisor",
		toolType: "ai-stats:advisor",
		description: "Consult another model",
		keywords: ["server", "tool", "advisor", "review", "second", "model"],
		icon: MessageSquare,
	},
	{
		id: "server-tool-image-generation",
		label: "Image Generation",
		toolType: "ai-stats:image_generation",
		description: "Create images mid-request",
		keywords: ["server", "tool", "image", "generation", "create"],
		icon: ImagePlus,
	},
	{
		id: "server-tool-apply-patch",
		label: "Apply Patch",
		toolType: "ai-stats:apply_patch",
		description: "Return patch operations",
		keywords: ["server", "tool", "apply", "patch", "code"],
		icon: FileCode,
	},
] satisfies Array<{
	id: string;
	label: string;
	toolType: ChatServerToolType;
	description: string;
	keywords: string[];
	icon: LucideIcon;
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

function getAttachmentDescription(file: File) {
	return [file.type || "File", formatAttachmentSize(file.size)].join(" - ");
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
	isStartingRecording: boolean;
	recordingSupported: boolean;
	onToggleRecording: () => void;
	onToggleModel: (modelId: string) => void;
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
		webSearchEnabled,
		onWebSearchEnabledChange,
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
		isStartingRecording,
		recordingSupported,
		onToggleRecording,
		onToggleModel,
		onSubmit,
		onSelectEvaluationPrompt,
		onComposerChange,
		onRemoveAttachment,
		onFileSelect,
	} = props;
	const promptScrollAreaRef = useRef<HTMLDivElement | null>(null);
	const composerLeftControlsRef = useRef<HTMLDivElement | null>(null);
	const composerSendControlsRef = useRef<HTMLDivElement | null>(null);
	const composerLayoutAnimationsRef = useRef<Animation[]>([]);
	const previousComposerLayoutRectsRef = useRef<Map<string, DOMRect>>(
		new Map(),
	);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
	const [slashMenu, setSlashMenu] = useState<SlashMenu>("main");
	const [commandMenuOpen, setCommandMenuOpen] = useState(false);
	const [commandSearch, setCommandSearch] = useState("");
	const [favoriteModelIdSet, setFavoriteModelIdSet] = useState<Set<string>>(
		() => new Set(getDefaultFavoriteModelIds()),
	);
	const slashSearchInputRef = useRef<HTMLInputElement | null>(null);
	const slashQuery = normalizeSlashQuery(composer);
	const slashMenuOpen = commandMenuOpen || slashQuery !== null;
	const activeSlashSearchValue =
		slashMenu === "main" ? (slashQuery ?? "") : commandSearch;
	const showSlashSearch = slashMenuOpen && slashMenu !== "main";
	const hasComposerContent =
		(composer.trim().length > 0 && slashQuery === null) ||
		attachments.length > 0;
	const hasSelectedModel =
		selectedModelIds.length > 0 ||
		selectedModelCount > 0 ||
		Boolean(selectedModelId);
	const canSubmit =
		hasSelectedModel && !isSending && !slashMenuOpen && hasComposerContent;
	const showChooseModelTooltip = !hasSelectedModel && hasComposerContent;
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
		if (webSearchEnabled) {
			commands.push({
				id: "web-search",
				label: "Native Web Search",
				description: "Enabled",
				keywords: ["native", "web", "search", "grounding", "browse"],
				icon: Globe,
				selected: true,
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
	}, [activeCustomServerTools, defaultServerToolsDisabled, webSearchEnabled]);
	const trimmedComposer = composer.trim();
	const promptNeedsExpandedComposer =
		trimmedComposer.length >= COMPOSER_EXPAND_PROMPT_LENGTH ||
		trimmedComposer.includes("\n");
	const composerExpanded =
		attachments.length > 0 ||
		activeInlineTools.length > 0 ||
		promptNeedsExpandedComposer;
	const advisorConfig = serverToolConfigs.advisor ?? {};
	const advisorEnabled = enabledServerToolSet.has("ai-stats:advisor");
	const updateAdvisorConfig = useCallback(
		(partial: Partial<ChatAdvisorServerToolConfig>) => {
			onServerToolConfigsChange?.({
				...serverToolConfigs,
				advisor: {
					...(serverToolConfigs.advisor ?? {}),
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

	useEffect(() => {
		setSlashSelectedIndex(0);
	}, [slashMenu, activeSlashSearchValue]);

	useEffect(() => {
		if (!slashMenuOpen) {
			setSlashMenu("main");
			setCommandSearch("");
		}
	}, [slashMenuOpen]);

	useEffect(() => {
		if (!showSlashSearch) return;
		requestAnimationFrame(() => {
			slashSearchInputRef.current?.focus();
		});
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
				slashSearchInputRef.current?.focus();
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

	const slashCommands = useMemo<SlashCommand[]>(() => {
		const commands: SlashCommand[] = [
			{
				id: "attach",
				label: "Add photos & files",
				description: "Upload from computer",
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
					webSearchEnabled ? "Web on" : "Web off",
					defaultServerToolsDisabled
						? "Datetime off"
						: activeCustomServerTools.length > 0
							? `${activeCustomServerTools.length} extra`
							: "Default",
				].join(" - "),
				keywords: ["tools", "api", "server", "context", "web", "search"],
				icon: Settings2,
				disabled:
					!isUnified ||
					(!onServerToolsChange && !onWebSearchEnabledChange),
			},
			{
				id: "audio",
				label: recordingSupported ? "Record audio" : "Add audio file",
				description: recordingSupported
					? "Capture a voice clip"
					: "Upload audio",
				keywords: ["audio", "voice", "record", "mic", "microphone"],
				icon: Mic,
				disabled: isStartingRecording,
			},
		];

		return commands;
	}, [
		activeCustomServerTools.length,
		defaultServerToolsDisabled,
		isStartingRecording,
		isUnified,
		onServerToolsChange,
		onWebSearchEnabledChange,
		reasoningOptions,
		reasoningSelection,
		recordingSupported,
		selectedModelCount,
		selectedModelId,
		selectedModelLabel,
		selectedModelsHint,
		webSearchEnabled,
	]);

	const reasoningSlashCommands = useMemo<SlashCommand[]>(() => {
		return reasoningOptions.map((option) => ({
				id: `reasoning-${option.value}`,
				label: option.label,
				description:
					reasoningSelection === option.value
						? "Currently selected"
						: "Apply to next request",
				keywords: ["reasoning", "think", "effort", option.value, option.label],
				icon: Brain,
				selected: reasoningSelection === option.value,
			}));
	}, [
		reasoningOptions,
		reasoningSelection,
	]);

	const modelSlashGroups = useMemo<ModelSlashGroup[]>(() => {
		const activeModelOptions = modelOptions.filter(
			(option) => option.gatewayStatus === "active",
		);
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
	}, [favoriteModelIdSet, modelOptions, selectedModelIds]);

	const modelSlashCommands = useMemo<SlashCommand[]>(
		() => modelSlashGroups.flatMap((group) => group.commands),
		[modelSlashGroups],
	);

	const toolsSlashCommands = useMemo<SlashCommand[]>(
		() => [
			{
				id: "web-search",
				label: "Native Web Search",
				description: webSearchEnabled ? "Enabled" : "Disabled",
				keywords: ["native", "web", "search", "grounding", "browse"],
				icon: Globe,
				disabled: !isUnified || !onWebSearchEnabledChange,
				selected: webSearchEnabled,
			},
			...SERVER_TOOL_COMMANDS.map((tool) => {
				const selected = enabledServerToolSet.has(tool.toolType);
				return {
					id: tool.id,
					label: tool.label,
					description: DEFAULT_SERVER_TOOL_SET.has(tool.toolType)
						? selected
							? "Default"
							: "Disabled"
						: selected
							? tool.description
							: "Disabled",
					keywords: tool.keywords,
					icon: tool.icon,
					disabled: !isUnified || !onServerToolsChange,
					selected,
					serverToolType: tool.toolType,
				};
			}),
		],
		[
			enabledServerToolSet,
			isUnified,
			onServerToolsChange,
			onWebSearchEnabledChange,
			webSearchEnabled,
		],
	);

	const activeSlashCommands =
		slashMenu === "reasoning"
			? reasoningSlashCommands
			: slashMenu === "model"
				? modelSlashCommands
				: slashMenu === "tools"
					? toolsSlashCommands
				: slashCommands;

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

	const renderAdvisorSettings = () => {
		if (slashMenu !== "tools" || !advisorEnabled) return null;
		return (
			<div className="mt-1 border-t border-border/70 px-2.5 py-2">
				<div className="mb-2 flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="text-[11px] font-medium text-muted-foreground">
							Advisor settings
						</div>
						<div className="truncate text-[11px] text-muted-foreground">
							Configure the model consulted during generation.
						</div>
					</div>
					<label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
						<span>Transcript</span>
						<Switch
							size="sm"
							checked={advisorConfig.forwardTranscript === true}
							onCheckedChange={(checked) =>
								updateAdvisorConfig({ forwardTranscript: checked })
							}
						/>
					</label>
				</div>
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
					<label className="grid gap-1 text-[11px] text-muted-foreground">
						<span>Model</span>
						<Input
							value={advisorConfig.model ?? ""}
							onChange={(event) =>
								updateAdvisorConfig({
									model: event.target.value || undefined,
								})
							}
							placeholder="Outer model"
							className="h-7 rounded-lg text-xs"
						/>
					</label>
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
					<label className="grid gap-1 text-[11px] text-muted-foreground">
						<span>Reasoning</span>
						<select
							value={advisorConfig.reasoningEffort ?? "none"}
							onChange={(event) =>
								updateAdvisorConfig({
									reasoningEffort: event.target
										.value as ChatAdvisorServerToolConfig["reasoningEffort"],
								})
							}
							className="h-7 rounded-lg border border-transparent bg-input/50 px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
						>
							<option value="none">Default</option>
							<option value="minimal">Minimal</option>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="xhigh">Extra High</option>
						</select>
					</label>
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
		if (command.id === "audio") {
			onToggleRecording();
			clearSlashCommand();
			return;
		}
		if (command.id === "web-search") {
			if (!isUnified) {
				return;
			}
			onWebSearchEnabledChange?.(!webSearchEnabled);
			return;
		}
		if (command.serverToolType) {
			if (!isUnified) {
				return;
			}
			const nextTools = new Set<ChatServerToolType>(serverTools);
			if (nextTools.has(command.serverToolType)) {
				nextTools.delete(command.serverToolType);
			} else {
				nextTools.add(command.serverToolType);
			}
			onServerToolsChange?.(
				SERVER_TOOL_COMMANDS.map((tool) => tool.toolType).filter(
					(toolType) => nextTools.has(toolType),
				),
			);
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
		onServerToolsChange,
		onToggleRecording,
		onToggleModel,
		onWebSearchEnabledChange,
		reasoningOptions,
		reasoningSelection,
		selectedModelId,
		serverTools,
		webSearchEnabled,
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
			slashMenu === "main" &&
			(command.id === "model" ||
				command.id === "reasoning" ||
				command.id === "tools");
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
						: "text-foreground hover:bg-muted/70",
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
			aria-label={hasSelectedModel ? "Send message" : "Choose a model to send"}
			aria-disabled={!canSubmit}
			data-chat-send-button="true"
			title={showChooseModelTooltip ? "Choose a model" : undefined}
			className={cn(
				canSubmit ? "cursor-pointer" : "cursor-default opacity-50",
			)}
			style={{ cursor: canSubmit ? "pointer" : "default" }}
			onClick={() => {
				if (canSubmit) {
					onSubmit();
				}
			}}
			tabIndex={canSubmit ? undefined : -1}
		>
			{isSending ? (
				<Spinner className="h-4 w-4" />
			) : (
				<SendHorizontal className="h-4 w-4" />
			)}
		</Button>
	);

	return (
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
				{showEvaluationPrompts ? (
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
				<div className="relative">
					{slashMenuOpen ? (
						<div
							className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-background/96 shadow-xl shadow-foreground/10"
							aria-label="Chat commands"
						>
							{showSlashSearch ? (
								<div className="border-b border-border/70 p-2">
									<div className="flex h-8 items-center gap-2 rounded-lg bg-muted/80 px-2 text-muted-foreground">
										<Search className="h-3.5 w-3.5 shrink-0" />
										<input
											ref={slashSearchInputRef}
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
											className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
										/>
									</div>
								</div>
							) : null}
							<ScrollArea
								className="max-h-[min(70vh,26rem)]"
								viewportClassName="h-auto max-h-[min(70vh,26rem)] overflow-y-auto overscroll-contain"
								onWheel={(event) => {
									event.stopPropagation();
								}}
							>
								<div className="p-1" role="listbox" aria-label="Chat commands">
									{slashMenu === "model" ? (
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
									{renderAdvisorSettings()}
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
					<Textarea
						ref={textareaRef}
						data-chat-composer-input="true"
						value={composer}
						onChange={(event) => {
							const nextValue = event.target.value;
							onComposerChange(nextValue);
							if (commandMenuOpen && !nextValue.startsWith("/")) {
								setCommandMenuOpen(false);
							}
						}}
						onKeyDown={(event) => {
							if (slashMenuOpen) {
								if (handleSlashNavigationKeyDown(event)) {
									return;
								}
							}
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								if (canSubmit) {
									onSubmit();
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
					{attachments.length > 0 ? (
						<AttachmentGroup className="pb-1">
							{attachments.map((file, index) => {
								const previewUrl = attachmentPreviewUrls[index];
								const isImagePreview = Boolean(previewUrl);

								return (
									<Attachment
										key={`${file.name}-${file.size}-${index}`}
										size="sm"
										state="done"
										className="max-w-[260px]"
									>
										<AttachmentMedia
											variant={isImagePreview ? "image" : "icon"}
										>
											{previewUrl ? (
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
					) : null}
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
										onClick={toggleSlashCommandMenu}
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
								"flex items-center gap-2 will-change-transform",
								composerExpanded ? "" : "order-3",
							)}
						>
							{renderSendButton()}
						</div>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}
