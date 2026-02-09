"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { Logo } from "@/components/Logo";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Orb } from "@/components/ui/orb";
import {
	MediaPlayer,
	MediaPlayerControls,
	MediaPlayerControlsOverlay,
	MediaPlayerDownload,
	MediaPlayerError,
	MediaPlayerFullscreen,
	MediaPlayerLoading,
	MediaPlayerPiP,
	MediaPlayerPlay,
	MediaPlayerSeek,
	MediaPlayerSeekBackward,
	MediaPlayerSeekForward,
	MediaPlayerSettings,
	MediaPlayerTime,
	MediaPlayerVideo,
	MediaPlayerVolume,
	MediaPlayerVolumeIndicator,
} from "@/components/ui/media-player";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
	ChatMessage,
	ChatSettings,
	ChatThread,
} from "@/lib/indexeddb/chats";
import {
	Brain,
	ChevronLeft,
	ChevronRight,
	Copy,
	Cpu,
	GitBranch,
	Info,
	Mic,
	MessageSquare,
	Pencil,
	Paperclip,
	RotateCcw,
	Search,
	SendHorizontal,
	Save,
	Square,
	X,
} from "lucide-react";

export type ChatSendPayload = {
	content: string;
	attachments: File[];
	webSearchEnabled: boolean;
};

type ChatConversationProps = {
	activeThread: ChatThread | null;
	isSending: boolean;
	isAuthenticated: boolean;
	hasApiKey: boolean;
	mode?: "classic" | "unified";
	webSearchEnabled?: boolean;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	reasoningEnabled?: boolean;
	reasoningEffort?: ChatSettings["reasoningEffort"];
	onReasoningEnabledChange?: (enabled: boolean) => void;
	onReasoningEffortChange?: (effort: NonNullable<ChatSettings["reasoningEffort"]>) => void;
	presetPrompt?: string;
	onSend: (payload: ChatSendPayload) => void;
	onEditMessage: (messageId: string, content: string) => void;
	onRetryAssistant: (messageId: string) => void;
	onBranchAssistant: (messageId: string) => void;
	onSelectVariant: (messageId: string, variantIndex: number) => void;
	orgNameById: Record<string, string>;
	accentColor: string;
	selectedOrgId: string;
	selectedModelId: string;
	selectedModelLabel: string;
	selectedModelCount?: number;
	selectedModelsHint?: string;
	onOpenModelPicker: () => void;
	onAudioAttachmentRequirementChange?: (requiresAudioInput: boolean) => void;
};

const AUDIO_RECORDING_MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
	"audio/ogg",
] as const;

function getSupportedRecordingMimeType() {
	if (typeof MediaRecorder === "undefined") return "";
	for (const mimeType of AUDIO_RECORDING_MIME_CANDIDATES) {
		if (MediaRecorder.isTypeSupported(mimeType)) {
			return mimeType;
		}
	}
	return "";
}

function extensionForAudioMimeType(mimeType: string) {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("mp4")) return "m4a";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("mpeg")) return "mp3";
	if (normalized.includes("wav")) return "wav";
	return "webm";
}

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
}

function formatModelLabel(modelId: string) {
	const parts = modelId.split("/");
	return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

function buildModelLink(modelId: string) {
	if (!modelId) return "#";
	const [org, ...rest] = modelId.split("/");
	const modelSlug = rest.length ? rest.join("/") : modelId;
	return `/models/${org}/${modelSlug}`;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractGeneratedVideoUrl(content: string): string | null {
	const markdownMatch = content.match(
		/\[[^\]]*(generated video|open generated video|video result|open result)[^\]]*\]\((https?:\/\/[^)\s]+)\)/i,
	);
	if (markdownMatch?.[2]) return markdownMatch[2];

	const directUrlMatch = content.match(
		/(https?:\/\/[^\s)]+?\.(mp4|webm|mov|m4v)(\?[^\s)]*)?)/i,
	);
	if (directUrlMatch?.[1]) return directUrlMatch[1];

	return null;
}

function stripMarkdownLink(content: string, url: string): string {
	const pattern = new RegExp(
		`\\[[^\\]]*\\]\\(${escapeRegExp(url)}\\)`,
		"i",
	);
	return content.replace(pattern, "").trim();
}

function ensureVariants(message: ChatMessage) {
	if (message.variants && message.variants.length > 0)
		return message.variants;
	return [
		{
			id: message.id,
			content: message.content,
			createdAt: message.createdAt,
			usage: message.usage ?? null,
			meta: message.meta ?? null,
		},
	];
}

const SAMPLE_QUESTIONS = [
	"Why do we get bugs in production but not locally?",
	"What is the best way to handle errors in async code?",
	"Can you explain closures in JavaScript?",
	"How do I center a div? (Just kidding, I actually know this one)",
	"Why does my regex work on regex101 but not in my code?",
	"What's the difference between interface and type in TypeScript?",
	"How do I write a recursive function without infinite loops?",
	"What's the cleanest way to handle null and undefined?",
	"Why did my API call return 403 when it worked yesterday?",
	"How do I debug code that only fails in production?",
];

function getRandomPlaceholder() {
	return SAMPLE_QUESTIONS[Math.floor(Math.random() * SAMPLE_QUESTIONS.length)];
}

export function ChatConversation({
	activeThread,
	isSending,
	isAuthenticated,
	hasApiKey,
	mode = "classic",
	webSearchEnabled = false,
	onWebSearchEnabledChange,
	reasoningEnabled = false,
	reasoningEffort = "medium",
	onReasoningEnabledChange,
	onReasoningEffortChange,
	presetPrompt,
	onSend,
	onEditMessage,
	onRetryAssistant,
	onBranchAssistant,
	onSelectVariant,
	orgNameById,
	accentColor,
	selectedOrgId,
	selectedModelId,
	selectedModelLabel,
	selectedModelCount = selectedModelId ? 1 : 0,
	selectedModelsHint,
	onOpenModelPicker,
	onAudioAttachmentRequirementChange,
}: ChatConversationProps) {
	const isUnified = mode === "unified";
	const [composer, setComposer] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [metadataOpenId, setMetadataOpenId] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const scrollAreaRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const audioInputRef = useRef<HTMLInputElement | null>(null);
	const [attachments, setAttachments] = useState<File[]>([]);
	const [recordingSupported, setRecordingSupported] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [isStartingRecording, setIsStartingRecording] = useState(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const recordingChunksRef = useRef<Blob[]>([]);
	const appliedPresetRef = useRef<string | null>(null);

	const placeholder = useMemo(() => {
		return getRandomPlaceholder();
	}, [activeThread?.id]);

	const latestMessageContent =
		activeThread?.messages[activeThread.messages.length - 1]?.content ?? "";
	const lastMessageId =
		activeThread?.messages[activeThread.messages.length - 1]?.id ?? null;

	useEffect(() => {
		const root = scrollAreaRef.current;
		if (!root) return;
		const viewport = root.querySelector(
			"[data-radix-scroll-area-viewport]",
		) as HTMLDivElement | null;
		if (!viewport) return;
		requestAnimationFrame(() => {
			viewport.scrollTop = viewport.scrollHeight;
		});
	}, [activeThread?.id, activeThread?.messages.length, latestMessageContent]);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		requestAnimationFrame(() => {
			textarea.focus();
		});
	}, [activeThread?.id]);

	useEffect(() => {
		const raf = requestAnimationFrame(() => {
			setComposer("");
			setAttachments([]);
		});
		return () => cancelAnimationFrame(raf);
	}, [activeThread?.id]);

	useEffect(() => {
		const supported =
			typeof navigator !== "undefined" &&
			typeof window !== "undefined" &&
			typeof MediaRecorder !== "undefined" &&
			typeof navigator.mediaDevices?.getUserMedia === "function";
		setRecordingSupported(supported);
	}, []);

	useEffect(() => {
		const requiresAudioInput = attachments.some((attachment) =>
			attachment.type.startsWith("audio/"),
		);
		onAudioAttachmentRequirementChange?.(requiresAudioInput);
	}, [attachments, onAudioAttachmentRequirementChange]);

	const stopRecording = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state !== "inactive") {
			recorder.stop();
		}
		if (mediaStreamRef.current) {
			for (const track of mediaStreamRef.current.getTracks()) {
				track.stop();
			}
			mediaStreamRef.current = null;
		}
		setIsRecording(false);
		setIsStartingRecording(false);
	}, []);

	const startRecording = useCallback(async () => {
		if (!recordingSupported) return;
		setIsStartingRecording(true);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			mediaStreamRef.current = stream;
			recordingChunksRef.current = [];
			const mimeType = getSupportedRecordingMimeType();
			const recorder = mimeType
				? new MediaRecorder(stream, { mimeType })
				: new MediaRecorder(stream);
			mediaRecorderRef.current = recorder;
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					recordingChunksRef.current.push(event.data);
				}
			};
			recorder.onstop = () => {
				const chunks = recordingChunksRef.current;
				recordingChunksRef.current = [];
				const fallbackType = recorder.mimeType || "audio/webm";
				const audioBlob = chunks.length
					? new Blob(chunks, { type: fallbackType })
					: null;
				if (audioBlob && audioBlob.size > 0) {
					const extension = extensionForAudioMimeType(fallbackType);
					const file = new File(
						[audioBlob],
						`recording-${Date.now()}.${extension}`,
						{ type: fallbackType },
					);
					setAttachments((prev) => prev.concat(file));
				}
				if (mediaStreamRef.current) {
					for (const track of mediaStreamRef.current.getTracks()) {
						track.stop();
					}
					mediaStreamRef.current = null;
				}
				setIsRecording(false);
			};
			recorder.start(200);
			setIsRecording(true);
		} catch {
			setIsRecording(false);
		} finally {
			setIsStartingRecording(false);
		}
	}, [recordingSupported]);

	useEffect(() => {
		return () => {
			const recorder = mediaRecorderRef.current;
			if (recorder && recorder.state !== "inactive") {
				recorder.stop();
			}
			if (mediaStreamRef.current) {
				for (const track of mediaStreamRef.current.getTracks()) {
					track.stop();
				}
			}
		};
	}, []);

	useEffect(() => {
		if (!presetPrompt) return;
		if (appliedPresetRef.current === presetPrompt) return;
		setComposer(presetPrompt);
		appliedPresetRef.current = presetPrompt;
	}, [presetPrompt, activeThread?.id]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const overlayOpen = Boolean(
				document.querySelector(
					'[data-state="open"][role="dialog"],' +
						' [data-state="open"][role="menu"],' +
						' [data-state="open"][role="listbox"],' +
						' [data-state="open"][data-radix-popper-content-wrapper]',
				),
			);
			if (overlayOpen) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (
				event.target &&
				(event.target as HTMLElement).closest(
					"input, textarea, [contenteditable='true']",
				)
			) {
				return;
			}
			if (event.key.length !== 1) return;
			const textarea = textareaRef.current;
			if (!textarea) return;
			textarea.focus();
			setComposer((prev) => `${prev}${event.key}`);
			event.preventDefault();
		};
		const handlePaste = (event: ClipboardEvent) => {
			const overlayOpen = Boolean(
				document.querySelector(
					'[data-state="open"][role="dialog"],' +
						' [data-state="open"][role="menu"],' +
						' [data-state="open"][role="listbox"],' +
						' [data-state="open"][data-radix-popper-content-wrapper]',
				),
			);
			if (overlayOpen) return;
			if (
				event.target &&
				(event.target as HTMLElement).closest(
					"input, textarea, [contenteditable='true']",
				)
			) {
				return;
			}
			const text = event.clipboardData?.getData("text") ?? "";
			if (!text) return;
			const textarea = textareaRef.current;
			if (!textarea) return;
			textarea.focus();
			setComposer((prev) => `${prev}${text}`);
			event.preventDefault();
		};
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("paste", handlePaste);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("paste", handlePaste);
		};
	}, []);

	const handleCopy = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// ignore clipboard errors
		}
	}, []);

	const formatMetric = (
		value: number | string | null | undefined,
		suffix?: string,
	) => {
		if (value === null || value === undefined || value === "") return "-";
		return suffix ? `${value}${suffix}` : `${value}`;
	};

	const metadataMessage = useMemo(() => {
		if (!metadataOpenId || !activeThread) return null;
		return (
			activeThread.messages.find(
				(message) => message.id === metadataOpenId,
			) ?? null
		);
	}, [activeThread, metadataOpenId]);

	const metadataVariant = useMemo(() => {
		if (!metadataMessage) return null;
		const variants = ensureVariants(metadataMessage);
		const index = metadataMessage.activeVariantIndex ?? 0;
		return variants[index] ?? variants[0] ?? null;
	}, [metadataMessage]);

	const usage = metadataVariant?.usage ?? metadataMessage?.usage ?? null;
	const meta = metadataVariant?.meta ?? metadataMessage?.meta ?? null;
	const totalTokens =
		(usage as any)?.output_text_tokens ??
		(usage as any)?.output_tokens ??
		(usage as any)?.outputTokens ??
		null;
	const pricing = (usage as any)?.pricing_breakdown ?? null;
	const costUsdStr =
		pricing?.total_usd_str ??
		(typeof pricing?.total_nanos === "number"
			? (pricing.total_nanos / 1e9).toFixed(7)
			: null);
	const costDisplay =
		costUsdStr ||
		(typeof (meta as any)?.total_cost_usd === "string"
			? (meta as any).total_cost_usd
			: null);
	const costNumber = costDisplay ? Number.parseFloat(costDisplay) : NaN;
	const costLabel = Number.isFinite(costNumber)
		? `$${costNumber.toFixed(5)}`
		: null;
	const latencyMs =
		(meta as any)?.latency_ms ??
		(meta as any)?.latencyMs ??
		(meta as any)?.client?.latencyMs ??
		null;
	const generationMs =
		(meta as any)?.generation_ms ??
		(meta as any)?.generationMs ??
		(meta as any)?.client?.generationMs ??
		null;
	const throughput =
		(meta as any)?.throughput_tps ??
		(meta as any)?.throughput_tokens_per_second ??
		(meta as any)?.throughputTokensPerSecond ??
		(meta as any)?.client?.throughputTokensPerSecond ??
		null;
	const latencyDisplay =
		typeof latencyMs === "number" ? Math.round(latencyMs) : null;
	const generationSeconds =
		typeof generationMs === "number"
			? Math.round(generationMs / 1000)
			: null;
	const throughputDisplay =
		typeof throughput === "number" ? Math.round(throughput) : null;

	const messagesContent = useMemo(() => {
		if (!activeThread?.messages.length) {
			return (
				<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<MessageSquare className="h-6 w-6 text-foreground" />
					</div>
					<div>
						<p className="text-base font-semibold">
							Start a new conversation
						</p>
						<p className="text-sm text-muted-foreground">
							Pick a model, write your prompt, and run a request
							through the gateway.
						</p>
					</div>
				</div>
			);
		}

		return activeThread.messages.map((message) => {
			const isUser = message.role === "user";
			const isPendingAssistant =
				!isUser && isSending && lastMessageId === message.id;
			const variants = ensureVariants(message);
			const activeVariantIndex = message.activeVariantIndex ?? 0;
			const activeVariant = variants[activeVariantIndex] ?? variants[0];
			const content = activeVariant?.content ?? message.content;
			const videoUrl = isUser ? null : extractGeneratedVideoUrl(content);
			const contentWithoutVideoLink =
				videoUrl ? stripMarkdownLink(content, videoUrl) : content;
			const reasoningText =
				(activeVariant?.meta as any)?.reasoning_text ??
				(activeVariant?.meta as any)?.reasoning ??
				(message.meta as any)?.reasoning_text ??
				(message.meta as any)?.reasoning ??
				null;
			const modelId = message.modelId ?? activeThread.modelId;
			const orgId = modelId ? getOrgId(modelId) : "ai-stats";
			const modelLabel = modelId ? formatModelLabel(modelId) : "Model";
			const orgName = orgNameById[orgId] ?? orgId;
			const modelLink = buildModelLink(modelId);
			const isEditing = editingId === message.id;
			const hasAccent = Boolean(accentColor);
			const userBubbleStyle =
				isUser && hasAccent
					? { backgroundColor: accentColor }
					: undefined;

			return (
				<div
					key={message.id}
					className={cn(
						"flex flex-col",
						isUser ? "items-end" : "items-start",
					)}
				>
					{!isUser && modelId && (
						<Link
							href={modelLink}
							className="mb-2 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
						>
							<Logo
								id={orgId}
								alt={orgName}
								width={18}
								height={18}
								className="rounded-xl shrink-0"
							/>
							<span className="truncate">{modelLabel}</span>
						</Link>
					)}
					<div
						className={cn(
							"max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
							isUser
								? hasAccent
									? "text-background"
									: "bg-foreground text-background"
								: "border border-border bg-muted text-foreground",
						)}
						style={userBubbleStyle}
					>
						{isUser ? (
							isEditing ? (
								<div className="grid gap-3">
									<Textarea
										value={editingValue}
										onChange={(event) =>
											setEditingValue(event.target.value)
										}
										rows={3}
										className="min-h-[100px] resize-none"
									/>
									<div className="flex items-center justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setEditingId(null);
												setEditingValue("");
											}}
										>
											<X className="mr-1 h-4 w-4" />
											Cancel
										</Button>
										<Button
											size="sm"
											onClick={() => {
												onEditMessage(
													message.id,
													editingValue.trim(),
												);
												setEditingId(null);
												setEditingValue("");
											}}
										>
											<Save className="mr-1 h-4 w-4" />
											Save
										</Button>
									</div>
								</div>
							) : (
								message.content
							)
						) : isSending &&
						  (!content || content === "Generating...") ? (
							<div className="flex min-h-7 items-center">
								<Shimmer className="text-sm text-muted-foreground">
									Generating...
								</Shimmer>
							</div>
						) : (
							<div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-ul:pl-5 prose-ol:pl-5 prose-li:my-1">
								{reasoningText ? (
									<Reasoning
										isStreaming={isPendingAssistant}
										defaultOpen={Boolean(
											isPendingAssistant,
										)}
									>
										<ReasoningTrigger />
										<ReasoningContent>
											{reasoningText}
										</ReasoningContent>
									</Reasoning>
								) : null}
								{contentWithoutVideoLink ? (
									<Streamdown>{contentWithoutVideoLink}</Streamdown>
								) : null}
								{videoUrl ? (
									<div className="not-prose mt-3 grid gap-2">
										<MediaPlayer className="w-full">
											<MediaPlayerVideo>
												<source src={videoUrl} type="video/mp4" />
											</MediaPlayerVideo>
											<MediaPlayerLoading />
											<MediaPlayerError />
											<MediaPlayerVolumeIndicator />
											<MediaPlayerControls>
												<MediaPlayerControlsOverlay />
												<MediaPlayerSeek />
												<div className="flex flex-wrap items-center gap-1">
													<MediaPlayerPlay />
													<MediaPlayerSeekBackward />
													<MediaPlayerSeekForward />
													<MediaPlayerVolume className="mr-1" />
													<MediaPlayerTime className="mr-auto" />
													<MediaPlayerPiP />
													<MediaPlayerFullscreen />
													<MediaPlayerDownload />
													<MediaPlayerSettings />
												</div>
											</MediaPlayerControls>
										</MediaPlayer>
										<Link
											href={videoUrl}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
										>
											Open video in new tab
										</Link>
									</div>
								) : null}
							</div>
						)}
					</div>
					{isUser ? (
						<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className="h-7 w-7"
										onClick={() =>
											handleCopy(message.content)
										}
									>
										<Copy className="h-3.5 w-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">Copy</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className="h-7 w-7"
										onClick={() => {
											setEditingId(message.id);
											setEditingValue(message.content);
										}}
									>
										<Pencil className="h-3.5 w-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">Edit</TooltipContent>
							</Tooltip>
						</div>
					) : (
						<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							{isPendingAssistant ? null : (
								<>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												size="icon"
												variant="ghost"
												className="h-7 w-7"
												onClick={() =>
													handleCopy(content)
												}
											>
												<Copy className="h-3.5 w-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="top">
											Copy
										</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												size="icon"
												variant="ghost"
												className="h-7 w-7"
												onClick={() =>
													onRetryAssistant(message.id)
												}
											>
												<RotateCcw className="h-3.5 w-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="top">
											Retry
										</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												size="icon"
												variant="ghost"
												className="h-7 w-7"
												onClick={() =>
													onBranchAssistant(
														message.id,
													)
												}
											>
												<GitBranch className="h-3.5 w-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="top">
											Branch
										</TooltipContent>
									</Tooltip>
									<Popover
										open={metadataOpenId === message.id}
										onOpenChange={(open) =>
											setMetadataOpenId(
												open ? message.id : null,
											)
										}
									>
										<Tooltip>
											<TooltipTrigger asChild>
												<PopoverTrigger asChild>
													<Button
														size="icon"
														variant="ghost"
														className="h-7 w-7"
													>
														<Info className="h-3.5 w-3.5" />
													</Button>
												</PopoverTrigger>
											</TooltipTrigger>
											<TooltipContent side="top">
												Metadata
											</TooltipContent>
										</Tooltip>
										<PopoverContent
											align="start"
											className="w-72"
										>
											<div className="grid gap-3 text-sm">
												<div className="grid gap-1.5">
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															Total tokens
														</span>
														<span>
															{formatMetric(
																totalTokens,
															)}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															Latency
														</span>
														<span>
															{formatMetric(
																latencyDisplay,
																" ms",
															)}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															Generation
														</span>
														<span>
															{formatMetric(
																generationSeconds,
																" s",
															)}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															Throughput
														</span>
														<span>
															{formatMetric(
																throughputDisplay,
																" tps",
															)}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															Total cost
														</span>
														<span>
															{costLabel ?? "-"}
														</span>
													</div>
												</div>
											</div>
										</PopoverContent>
									</Popover>
								</>
							)}
							{!isPendingAssistant && variants.length > 1 ? (
								<div className="ml-auto flex items-center gap-2">
									<Button
										size="icon"
										variant="ghost"
										onClick={() =>
											onSelectVariant(
												message.id,
												Math.max(
													0,
													activeVariantIndex - 1,
												),
											)
										}
										disabled={activeVariantIndex <= 0}
									>
										<ChevronLeft className="h-4 w-4" />
									</Button>
									<span className="text-xs text-muted-foreground">
										{activeVariantIndex + 1}/
										{variants.length}
									</span>
									<Button
										size="icon"
										variant="ghost"
										onClick={() =>
											onSelectVariant(
												message.id,
												Math.min(
													variants.length - 1,
													activeVariantIndex + 1,
												),
											)
										}
										disabled={
											activeVariantIndex >=
											variants.length - 1
										}
									>
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							) : null}
						</div>
					)}
				</div>
			);
		});
	}, [
		activeThread,
		isSending,
		lastMessageId,
		editingId,
		editingValue,
		metadataOpenId,
		orgNameById,
		accentColor,
		handleCopy,
		onEditMessage,
		onRetryAssistant,
		onBranchAssistant,
		onSelectVariant,
		latencyDisplay,
		generationSeconds,
		throughputDisplay,
		costLabel,
		totalTokens,
	]);

	const handleSubmit = () => {
		const text = composer.trim();
		if (!text && attachments.length === 0) return;
		onSend({
			content: text,
			attachments,
			webSearchEnabled: isUnified ? webSearchEnabled : false,
		});
		setComposer("");
		setAttachments([]);
	};

	const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		if (!files.length) return;
		setAttachments((prev) => prev.concat(files));
		event.target.value = "";
	};

	const toggleRecording = useCallback(() => {
		if (isStartingRecording) return;
		if (isRecording) {
			stopRecording();
			return;
		}
		if (!recordingSupported) {
			audioInputRef.current?.click();
			return;
		}
		void startRecording();
	}, [isRecording, isStartingRecording, startRecording, stopRecording]);

	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<ScrollArea className="flex-1" ref={scrollAreaRef}>
				<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
					{isRecording ? (
						<div className="sticky top-2 z-10 mx-auto w-full max-w-md rounded-2xl border border-border bg-background/92 px-4 py-3 shadow-sm backdrop-blur">
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={toggleRecording}
									disabled={isStartingRecording}
									aria-label="Stop recording"
									className="relative h-14 w-14 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
								>
									<Orb
										agentState="listening"
										className="h-full w-full"
										colors={["#8BB8FF", "#5E8DD6"]}
									/>
									<span className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground">
										<Square className="h-4 w-4 fill-current text-foreground/85" />
									</span>
								</button>
								<div className="min-w-0">
									<p className="text-sm font-medium">Listening...</p>
									<p className="text-xs text-muted-foreground">
										Speak now, then stop to attach the clip.
									</p>
								</div>
							</div>
						</div>
					) : null}
					{messagesContent}
				</div>
			</ScrollArea>
			<div className="border-t border-border px-4 py-4 md:px-8">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<input
							ref={fileInputRef}
							type="file"
							className="hidden"
							multiple
							onChange={handleFileSelect}
						/>
						<input
							ref={audioInputRef}
							type="file"
							accept="audio/*"
							className="hidden"
							multiple
							onChange={handleFileSelect}
						/>
						<Textarea
							ref={textareaRef}
							value={composer}
							onChange={(event) =>
								setComposer(event.target.value)
							}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									handleSubmit();
								}
							}}
							rows={2}
							placeholder={placeholder}
							className="min-h-[56px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						{attachments.length > 0 ? (
							<div className="flex flex-wrap gap-1 pb-1">
								{attachments.map((file, index) => (
									<button
										key={`${file.name}-${file.size}-${index}`}
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
										onClick={() =>
											setAttachments((prev) =>
												prev.filter((_, i) => i !== index),
											)
										}
									>
										<span className="max-w-[180px] truncate">
											{file.name}
										</span>
										<X className="h-3 w-3" />
									</button>
								))}
							</div>
						) : null}
						<div className="flex items-center justify-between pt-2">
							<div className="flex items-center gap-2">
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
											) : selectedModelLabel ===
											  "Select model" ? (
												<Cpu className="h-4 w-4 text-muted-foreground" />
											) : (
												<Logo
													id={selectedOrgId}
													alt={selectedOrgId}
													width={16}
													height={16}
													className="rounded-xl shrink-0"
												/>
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{selectedModelCount > 1
											? selectedModelsHint ??
											  `${selectedModelCount} models selected`
											: selectedModelId ||
											  "Select model"}
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
										{isUnified ? "Add files" : "Available in unified chat"}
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
											onClick={toggleRecording}
											aria-label={
												isRecording
													? "Stop recording"
													: "Record audio"
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
												webSearchEnabled && isUnified
													? "bg-muted text-foreground"
													: "",
											)}
											onClick={() => {
												if (!isUnified) return;
												const next = !webSearchEnabled;
												onWebSearchEnabledChange?.(next);
											}}
										>
											<Search className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{isUnified
											? webSearchEnabled
												? "Disable web search"
												: "Enable web search"
											: "Available in unified chat"}
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className={cn(
												"h-8 w-8",
												reasoningEnabled
													? "bg-muted text-foreground"
													: "",
											)}
											onClick={() =>
												onReasoningEnabledChange?.(
													!reasoningEnabled,
												)
											}
										>
											<Brain className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{reasoningEnabled
											? "Disable reasoning"
											: "Enable reasoning"}
									</TooltipContent>
								</Tooltip>
								{reasoningEnabled ? (
									<Select
										value={reasoningEffort ?? "medium"}
										onValueChange={(value) =>
											onReasoningEffortChange?.(
												value as NonNullable<ChatSettings["reasoningEffort"]>,
											)
										}
									>
										<SelectTrigger className="h-8 w-[104px]">
											<SelectValue placeholder="Effort" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">None</SelectItem>
											<SelectItem value="minimal">
												Minimal
											</SelectItem>
											<SelectItem value="low">Low</SelectItem>
											<SelectItem value="medium">
												Medium
											</SelectItem>
											<SelectItem value="high">
												High
											</SelectItem>
											<SelectItem value="xhigh">
												X-High
											</SelectItem>
										</SelectContent>
									</Select>
								) : null}
							</div>
							<Button
								size="icon"
								onClick={handleSubmit}
								disabled={
									isSending ||
									(!composer.trim() && attachments.length === 0) ||
									!isAuthenticated ||
									!hasApiKey
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

			{/* Metadata now handled via per-message popovers */}
		</main>
	);
}
