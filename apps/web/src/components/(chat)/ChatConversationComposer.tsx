"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type RefObject,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
	Brain,
	Check,
	Clock3,
	Cpu,
	Info,
	Image as ImageIcon,
	Mic,
	Paperclip,
	SendHorizontal,
	Square,
	type LucideIcon,
	Search,
	Settings2,
	X,
} from "lucide-react";
import type { ChatSettings } from "@/lib/indexeddb/chats";
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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	ScrollArea,
	ScrollBar,
} from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
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
	description: string;
	keywords: string[];
	icon: LucideIcon;
	disabled?: boolean;
};

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
	apiServerToolsEnabled: boolean;
	onApiServerToolsEnabledChange?: (enabled: boolean) => void;
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
	selectedModelId: string;
	selectedModelLabel: string;
	selectedOrgId: string;
	isRecording: boolean;
	isStartingRecording: boolean;
	recordingSupported: boolean;
	onToggleRecording: () => void;
	onOpenModelPicker: () => void;
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
		apiServerToolsEnabled,
		onApiServerToolsEnabledChange,
		showEvaluationPrompts,
		reasoningEnabled,
		reasoningPickerOpen,
		onReasoningPickerOpenChange,
		reasoningSelection,
		reasoningOptions,
		onReasoningSelection,
		selectedModelCount,
		selectedModelsHint,
		selectedModelId,
		selectedModelLabel,
		selectedOrgId,
		isRecording,
		isStartingRecording,
		recordingSupported,
		onToggleRecording,
		onOpenModelPicker,
		onSubmit,
		onSelectEvaluationPrompt,
		onComposerChange,
		onRemoveAttachment,
		onFileSelect,
	} = props;
	const promptScrollAreaRef = useRef<HTMLDivElement | null>(null);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
	const slashQuery = normalizeSlashQuery(composer);
	const slashMenuOpen = slashQuery !== null;
	const hasComposerContent =
		composer.trim().length > 0 || attachments.length > 0;
	const composerExpanded = hasComposerContent || slashMenuOpen;

	const clearSlashCommand = useCallback(() => {
		if (slashMenuOpen) {
			onComposerChange("");
		}
		requestAnimationFrame(() => {
			document
				.querySelector<HTMLTextAreaElement>(
					"[data-chat-composer-input='true']",
				)
				?.focus();
		});
	}, [onComposerChange, slashMenuOpen]);

	const slashCommands = useMemo<SlashCommand[]>(() => {
		const commands: SlashCommand[] = [
			{
				id: "model",
				label: "Switch model",
				description:
					selectedModelCount > 1
						? selectedModelsHint ?? `${selectedModelCount} models selected`
						: selectedModelId || selectedModelLabel,
				keywords: ["model", "models", "provider", "swap"],
				icon: Cpu,
			},
			{
				id: "attach",
				label: "Add attachment",
				description: "Upload files, photos, video, or documents.",
				keywords: ["attach", "attachment", "file", "upload"],
				icon: Paperclip,
				disabled: !isUnified,
			},
			{
				id: "photo-video",
				label: "Add photo or video",
				description: "Attach visual media to the next message.",
				keywords: ["photo", "image", "picture", "video", "media"],
				icon: ImageIcon,
				disabled: !isUnified,
			},
			{
				id: "audio",
				label: recordingSupported ? "Record audio" : "Add audio file",
				description: recordingSupported
					? "Capture a voice clip and attach it."
					: "Upload an audio file from this device.",
				keywords: ["audio", "voice", "record", "mic", "microphone"],
				icon: Mic,
				disabled: isStartingRecording,
			},
			{
				id: "web",
				label: webSearchEnabled ? "Disable web search" : "Enable web search",
				description: "Toggle grounded web search for this request.",
				keywords: ["web", "search", "grounding", "browse"],
				icon: Search,
				disabled: !isUnified || !onWebSearchEnabledChange,
			},
			{
				id: "tools",
				label: apiServerToolsEnabled
					? "Disable API tools"
					: "Enable API tools",
				description: "Let the model inspect AI Stats API context.",
				keywords: ["tools", "api", "server", "context"],
				icon: Settings2,
				disabled: !isUnified || !onApiServerToolsEnabledChange,
			},
		];

		for (const option of reasoningOptions) {
			commands.push({
				id: `reasoning-${option.value}`,
				label: `Reasoning: ${option.label}`,
				description:
					reasoningSelection === option.value
						? "Currently selected."
						: "Apply this reasoning effort to the next request.",
				keywords: ["reasoning", "think", "effort", option.value, option.label],
				icon: Brain,
			});
		}

		return commands;
	}, [
		apiServerToolsEnabled,
		isStartingRecording,
		isUnified,
		onApiServerToolsEnabledChange,
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

	const filteredSlashCommands = useMemo(() => {
		if (slashQuery === null) return [];
		if (!slashQuery) return slashCommands;

		const terms = slashQuery.split(/\s+/).filter(Boolean);
		return slashCommands.filter((command) => {
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
	}, [slashCommands, slashQuery]);

	const activeSlashIndex = Math.min(
		slashSelectedIndex,
		Math.max(filteredSlashCommands.length - 1, 0),
	);

	const runSlashCommand = useCallback((command: SlashCommand) => {
		if (command.disabled) return;
		if (command.id === "model") {
			onOpenModelPicker();
			clearSlashCommand();
			return;
		}
		if (
			command.id === "attach" ||
			command.id === "photo-video"
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
		if (command.id === "web") {
			if (!isUnified) {
				return;
			}
			onWebSearchEnabledChange?.(!webSearchEnabled);
			clearSlashCommand();
			return;
		}
		if (command.id === "tools") {
			if (!isUnified) {
				return;
			}
			onApiServerToolsEnabledChange?.(!apiServerToolsEnabled);
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
		apiServerToolsEnabled,
		clearSlashCommand,
		isUnified,
		onApiServerToolsEnabledChange,
		onOpenModelPicker,
		onReasoningSelection,
		onToggleRecording,
		onWebSearchEnabledChange,
		webSearchEnabled,
	]);

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
				<div
					className={cn(
						"rounded-2xl border border-border bg-card shadow-sm",
						composerExpanded
							? "flex flex-col px-3 py-2"
							: "flex items-center gap-1 px-2 py-1",
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
					{slashMenuOpen ? (
						<div
							className="mb-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm"
							role="listbox"
							aria-label="Chat commands"
						>
							<div className="flex items-center justify-between border-b border-border px-3 py-2">
								<span className="text-xs font-medium text-muted-foreground">
									Commands
								</span>
								<span className="text-xs text-muted-foreground">
									Enter to apply
								</span>
							</div>
							<div className="max-h-64 overflow-y-auto p-1">
								{filteredSlashCommands.length ? (
									filteredSlashCommands.map((command, index) => {
										const Icon = command.icon;
										const selected = activeSlashIndex === index;

										return (
											<button
												key={command.id}
												type="button"
												role="option"
												aria-selected={selected}
												disabled={command.disabled}
												className={cn(
													"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45",
													selected
														? "bg-muted text-foreground"
														: "text-foreground hover:bg-muted/70",
												)}
												onMouseEnter={() =>
													setSlashSelectedIndex(index)
												}
												onMouseDown={(event) => {
													event.preventDefault();
												}}
												onClick={() => runSlashCommand(command)}
											>
												<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
													<Icon className="h-4 w-4" />
												</span>
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium">
														{command.label}
													</span>
													<span className="block truncate text-xs text-muted-foreground">
														{command.description}
													</span>
												</span>
											</button>
										);
									})
								) : (
									<div className="px-3 py-6 text-center text-sm text-muted-foreground">
										No commands found
									</div>
								)}
							</div>
						</div>
					) : null}
					<Textarea
						ref={textareaRef}
						data-chat-composer-input="true"
						value={composer}
						onChange={(event) => onComposerChange(event.target.value)}
						onKeyDown={(event) => {
							if (slashMenuOpen) {
								if (event.key === "ArrowDown") {
									event.preventDefault();
									setSlashSelectedIndex((current) =>
										Math.min(
											current + 1,
											Math.max(filteredSlashCommands.length - 1, 0),
										),
									);
									return;
								}
								if (event.key === "ArrowUp") {
									event.preventDefault();
									setSlashSelectedIndex((current) =>
										Math.max(current - 1, 0),
									);
									return;
								}
								if (event.key === "Escape") {
									event.preventDefault();
									onComposerChange("");
									return;
								}
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									const command =
										filteredSlashCommands[activeSlashIndex];
									if (command) {
										runSlashCommand(command);
									}
									return;
								}
							}
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								onSubmit();
							}
						}}
						rows={composerExpanded ? 2 : 1}
						placeholder={placeholder}
						className={cn(
							"resize-none border-0 !bg-transparent shadow-none focus-visible:ring-0 dark:!bg-transparent",
							composerExpanded
								? "min-h-[56px] px-1 py-2"
								: "order-2 min-h-9 flex-1 px-2 py-2",
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
								: "contents",
						)}
					>
						<div
							className={cn(
								"flex items-center gap-1",
								composerExpanded ? "sm:gap-2" : "order-1",
							)}
						>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										onClick={onOpenModelPicker}
										className="h-8 px-2 gap-1.5"
									>
										{selectedModelCount > 1 ? (
											<span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
												{selectedModelCount}
											</span>
										) : selectedModelLabel === "Select model" ? (
											<Cpu className="h-4 w-4 text-muted-foreground" />
										) : (
											<Logo
												id={selectedOrgId}
												alt={selectedOrgId}
												width={16}
												height={16}
												className="shrink-0 rounded-none"
											/>
										)}
									</Button>
								</TooltipTrigger>
									<TooltipContent>
										{selectedModelCount > 1
											? selectedModelsHint ??
												`${selectedModelCount} models selected`
											: selectedModelId || "Select model"}
									</TooltipContent>
							</Tooltip>
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
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										disabled={!isUnified}
										className={cn(
											"h-8 w-8",
											apiServerToolsEnabled && isUnified
												? "bg-muted text-foreground"
												: "",
										)}
										onClick={() => {
											if (!isUnified) return;
											const next = !apiServerToolsEnabled;
											onApiServerToolsEnabledChange?.(next);
										}}
									>
										<Clock3 className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isUnified
										? apiServerToolsEnabled
											? "Disable API server tools"
											: "Enable API server tools"
										: "Not available in this room"}
								</TooltipContent>
							</Tooltip>
							<Popover
								open={reasoningPickerOpen}
								onOpenChange={onReasoningPickerOpenChange}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<PopoverTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className={cn(
													"h-8 w-8",
													reasoningEnabled
														? "bg-muted text-foreground"
														: "",
												)}
											>
												<Brain className="h-4 w-4" />
											</Button>
										</PopoverTrigger>
									</TooltipTrigger>
									<TooltipContent>
										Reasoning:{" "}
										{reasoningOptions.find(
											(option) => option.value === reasoningSelection,
										)?.label ?? "Medium"}
									</TooltipContent>
								</Tooltip>
								<PopoverContent align="start" className="w-40 p-1">
									<div className="grid gap-0.5">
										{reasoningOptions.map((option) => (
											<Button
												key={option.value}
												type="button"
												variant="ghost"
												className="h-8 w-full justify-between px-2 text-sm"
												onClick={() => onReasoningSelection(option.value)}
											>
												<span className="flex-1 text-left">
													{option.label}
												</span>
												<Check
													className={cn(
														"ml-2 h-3.5 w-3.5 shrink-0",
														reasoningSelection === option.value
															? "opacity-100"
															: "opacity-0",
													)}
												/>
											</Button>
										))}
									</div>
								</PopoverContent>
							</Popover>
						</div>
						<div
							className={cn(
								"flex items-center gap-2",
								composerExpanded ? "" : "order-3",
							)}
						>
							<Button
								size="icon"
								aria-label="Send message"
								data-chat-send-button="true"
								onClick={onSubmit}
								disabled={
									isSending ||
									slashMenuOpen ||
									(!composer.trim() && attachments.length === 0)
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
	);
}
