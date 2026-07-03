"use client";

import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from "react";
import Link from "next/link";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { useVirtualizer } from "@tanstack/react-virtual";
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
	ChatRequestErrorNotice,
	type ChatRequestErrorDetails,
} from "@/components/(chat)/ChatRequestErrorNotice";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	AssistantMessageFooter,
	UserMessageFooter,
} from "@/components/(chat)/ChatMessageFooters";
import { Textarea } from "@/components/ui/textarea";
import {
	MediaPlayer,
	MediaPlayerAudio,
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
	Message,
	MessageContent,
	MessageHeader,
} from "@/components/ui/message";
import { cn } from "@/lib/utils";
import type { ChatThread } from "@/lib/indexeddb/chats";
import type {
	ChatResponseLayout,
	ModelOption,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	Cpu,
	Save,
	X,
} from "lucide-react";
import {
	ChatMessageMarkers,
	ChatToolCallMarkers,
	getComparableModelSet,
	getRequestContextMarker,
	type ChatMessageMarker,
} from "@/components/(chat)/ChatMessageMarkers";
import type {
	ChatToolCall,
	ChatTraceEvent,
} from "@/components/(chat)/chatPayload";
import { ChatMessagesEmptyState } from "@/components/(chat)/ChatMessagesEmptyState";
import { ChatVirtualMessageList } from "@/components/(chat)/ChatVirtualMessageList";
import { markChatUserMessageRendered } from "@/components/(chat)/playground/chat-performance";
import {
	buildModelLink,
	ensureVariants,
	extractGeneratedAudioUrl,
	extractGeneratedImageUrl,
	extractGeneratedVideoUrl,
	formatModelLabel,
	getInlineAttachmentPreviewsFromMeta,
	getOrgId,
	inferAudioMimeType,
	isInternalModelId,
	sanitizeHttpMediaUrl,
	stripMarkdownLink,
} from "./chatConversationHelpers";

const ATTACHMENT_PLACEHOLDER_PATTERN = /^\[(Attachment|Attachments)\]/i;
const VIRTUALIZE_AFTER_MESSAGES = 80;
const VIRTUAL_MESSAGE_OVERSCAN = 16;
const ESTIMATED_MESSAGE_HEIGHT = 220;
const EMPTY_MESSAGES: ChatThread["messages"] = [];

const getReadableTextColor = (backgroundColor: string) => {
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
};

const getToolCallsFromMeta = (
	meta: Record<string, unknown> | null,
): ChatToolCall[] => {
	const value = meta?.tool_calls;
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is ChatToolCall => {
		if (!item || typeof item !== "object") return false;
		const toolCall = item as Partial<ChatToolCall>;
		return (
			typeof toolCall.id === "string" &&
			typeof toolCall.name === "string" &&
			typeof toolCall.type === "string"
		);
	});
};

const getTraceEventsFromMeta = (
	meta: Record<string, unknown> | null,
): ChatTraceEvent[] => {
	const value = meta?.trace_events;
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is ChatTraceEvent => {
			if (!item || typeof item !== "object") return false;
			const event = item as Partial<ChatTraceEvent>;
			if (
				typeof event.id !== "string" ||
				typeof event.type !== "string" ||
				typeof event.sequence !== "number"
			) {
				return false;
			}
			if (
				event.type === "reasoning" ||
				event.type === "response"
			) {
				return typeof event.text === "string";
			}
			return (
				event.type === "tool_call" &&
				typeof event.toolCallId === "string"
			);
		})
		.sort((a, b) => a.sequence - b.sequence);
};

type ChatConversationMessagesProps = {
	activeThread: ChatThread | null;
	isSending: boolean;
	lastMessageId: string | null;
	editingId: string | null;
	editingValue: string;
	metadataOpenId: string | null;
	onMetadataOpenIdChange: (id: string | null) => void;
	onEditingIdChange: (id: string | null) => void;
	onEditingValueChange: (value: string) => void;
	orgNameById: Record<string, string>;
	modelDisplayNameById: Record<string, string>;
	modelOrgIdById: Record<string, string>;
	modelLinkById: Record<string, string>;
	accentColor: string;
	onEditMessage: (messageId: string, content: string) => void;
	onRetryAssistant: (messageId: string) => void;
	onBranchAssistant: (messageId: string) => void;
	onSelectVariant: (messageId: string, variantIndex: number) => void;
	onCopy: (text: string) => boolean | Promise<boolean>;
	requestError?: ChatRequestErrorDetails | null;
	scrollViewportRef: RefObject<HTMLDivElement | null>;
	responseLayout?: ChatResponseLayout;
	modelOrderIds?: string[];
	modelOptions: ModelOption[];
	selectedModelIds: string[];
	onAddModelSet: (modelIds: string[]) => void;
	temporaryMode?: boolean;
};

export function ChatConversationMessages({
	activeThread,
	isSending,
	lastMessageId,
	editingId,
	editingValue,
	metadataOpenId,
	onMetadataOpenIdChange,
	onEditingIdChange,
	onEditingValueChange,
	orgNameById,
	modelDisplayNameById,
	modelOrgIdById,
	modelLinkById,
	accentColor,
	onEditMessage,
	onRetryAssistant,
	onBranchAssistant,
	onSelectVariant,
	onCopy,
	requestError = null,
	scrollViewportRef,
	responseLayout = "sequential",
	modelOrderIds = [],
	modelOptions,
	selectedModelIds,
	onAddModelSet,
	temporaryMode = false,
}: ChatConversationMessagesProps) {
	const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
	const copiedResetTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (copiedResetTimeoutRef.current !== null) {
				window.clearTimeout(copiedResetTimeoutRef.current);
			}
		};
	}, []);

	const markCopied = useCallback((key: string) => {
		setCopiedMessageKey(key);
		if (copiedResetTimeoutRef.current !== null) {
			window.clearTimeout(copiedResetTimeoutRef.current);
		}
		copiedResetTimeoutRef.current = window.setTimeout(() => {
			setCopiedMessageKey((current) => (current === key ? null : current));
			copiedResetTimeoutRef.current = null;
		}, 1500);
	}, []);

	const handleCopyForMessage = useCallback(
		async (key: string, text: string) => {
			const copied = await onCopy(text);
			if (copied) {
				markCopied(key);
			}
		},
		[markCopied, onCopy],
	);

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
	const metadataProviderId =
		typeof (meta as any)?.provider === "string" &&
		(meta as any).provider.trim().length > 0
			? (meta as any).provider.trim()
			: typeof (meta as any)?.routing?.selected_provider === "string" &&
					(meta as any).routing.selected_provider.trim().length > 0
				? (meta as any).routing.selected_provider.trim()
				: metadataMessage?.providerId?.trim() || null;
	const metadataProviderLabel =
		metadataMessage?.providerName?.trim() || metadataProviderId || null;
	const messages = activeThread?.messages ?? EMPTY_MESSAGES;
	useEffect(() => {
		const latestUserMessage = messages
			.slice()
			.reverse()
			.find((message) => message.role === "user");
		if (latestUserMessage) {
			markChatUserMessageRendered(latestUserMessage.id);
		}
	}, [messages]);

	const shouldVirtualizeMessages =
		responseLayout === "sequential" &&
		messages.length > VIRTUALIZE_AFTER_MESSAGES;
	// TanStack Virtual exposes imperative measurement APIs; keep them local to this list.
	// eslint-disable-next-line react-hooks/incompatible-library
	const messageVirtualizer = useVirtualizer({
		count: messages.length,
		enabled: shouldVirtualizeMessages,
		estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
		getItemKey: (index) => messages[index]?.id ?? index,
		getScrollElement: () => scrollViewportRef.current,
		overscan: VIRTUAL_MESSAGE_OVERSCAN,
	});
	const virtualItems = messageVirtualizer.getVirtualItems();
	const measureVirtualMessage = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node) return;
			messageVirtualizer.measureElement(node);
		},
		[messageVirtualizer],
	);

	const messagesContent = useMemo(() => {
		if (!activeThread || !messages.length) {
			return (
				<ChatMessagesEmptyState
					modelOptions={modelOptions}
					selectedModelIds={selectedModelIds}
					onAddModelSet={onAddModelSet}
					temporaryMode={temporaryMode}
				/>
			);
		}

		const renderMessage = (
			message: ChatThread["messages"][number],
			messageIndex: number,
			options: {
				inSideBySideGroup?: boolean;
				wrapInScroller?: boolean;
				hideMarkers?: boolean;
			} = {},
		) => {
			const isUser = message.role === "user";
			const inSideBySideGroup = Boolean(options.inSideBySideGroup && !isUser);
			const wrapInScroller = options.wrapInScroller ?? true;
			const userCopyKey = `user:${message.id}`;
			const assistantCopyKey = `assistant:${message.id}`;
			const userCopied = copiedMessageKey === userCopyKey;
			const assistantCopied = copiedMessageKey === assistantCopyKey;
			const isPendingAssistant =
				!isUser && isSending && lastMessageId === message.id;
			const variants = ensureVariants(message);
			const activeVariantIndex = message.activeVariantIndex ?? 0;
			const activeVariant = variants[activeVariantIndex] ?? variants[0];
			const content = activeVariant?.content ?? message.content;
			const activeMeta =
				(activeVariant?.meta as Record<string, unknown> | null) ??
				(message.meta as Record<string, unknown> | null) ??
				null;
			const toolCalls = isUser ? [] : getToolCallsFromMeta(activeMeta);
			const requestContext = isUser
				? getRequestContextMarker(message.meta)
				: null;
			const previousUserRequestContext = isUser
				? getRequestContextMarker(
						activeThread.messages
							.slice(0, messageIndex)
							.reverse()
							.find((item) => item.role === "user")?.meta,
					)
				: null;
			const requestContextMarkers: ChatMessageMarker[] = [];
			if (requestContext && previousUserRequestContext) {
				const currentModelSet = getComparableModelSet(requestContext);
				const previousModelSet = getComparableModelSet(previousUserRequestContext);
				if (currentModelSet && currentModelSet !== previousModelSet) {
					const labels = [
						requestContext.modelId
							? (modelDisplayNameById[requestContext.modelId] ??
								formatModelLabel(requestContext.modelId))
							: null,
						...requestContext.compareModelIds.map(
							(modelId) =>
								modelDisplayNameById[modelId] ??
								formatModelLabel(modelId),
						),
					].filter((value): value is string => Boolean(value));
					requestContextMarkers.push({
						id: "model",
						icon: Cpu,
						label:
							labels.length > 1
								? `Models changed to ${labels.join(", ")}`
								: `Model changed to ${labels[0] ?? "selected model"}`,
					});
				}
			}
			let messageRequestError: ChatRequestErrorDetails | null = null;
			if (!isUser) {
				if (
					activeMeta?.chat_request_error &&
					typeof activeMeta.chat_request_error === "object" &&
					!Array.isArray(activeMeta.chat_request_error)
				) {
					messageRequestError =
						activeMeta.chat_request_error as ChatRequestErrorDetails;
				} else if (
					requestError &&
					lastMessageId === message.id
				) {
					messageRequestError = requestError;
				}
			}
			const showRequestError = Boolean(messageRequestError);
			const videoUrl = isUser
				? null
				: sanitizeHttpMediaUrl(extractGeneratedVideoUrl(content));
			const contentWithoutVideoLink = videoUrl
				? stripMarkdownLink(content, videoUrl)
				: content;
			const audioUrl = isUser
				? null
				: sanitizeHttpMediaUrl(
						extractGeneratedAudioUrl(contentWithoutVideoLink),
					);
			const contentWithoutAudioLink = audioUrl
				? stripMarkdownLink(contentWithoutVideoLink, audioUrl)
				: contentWithoutVideoLink;
			const imageUrl = isUser
				? null
				: sanitizeHttpMediaUrl(
						extractGeneratedImageUrl(contentWithoutAudioLink),
					);
			const contentWithoutMediaLinks = imageUrl
				? stripMarkdownLink(contentWithoutAudioLink, imageUrl)
				: contentWithoutAudioLink;
			const reasoningText = isUser
				? null
				: (activeVariant?.meta as any)?.reasoning_text ??
					(activeVariant?.meta as any)?.reasoning ??
					(message.meta as any)?.reasoning_text ??
					(message.meta as any)?.reasoning ??
					null;
			const traceEvents = isUser
				? []
				: getTraceEventsFromMeta(activeMeta);
			const toolCallsById = new Map(
				toolCalls.map((toolCall) => [toolCall.id, toolCall]),
			);
			const traceToolCallIds = new Set(
				traceEvents
					.filter((event) => event.type === "tool_call")
					.map((event) => event.toolCallId),
			);
			const fallbackToolCalls = traceEvents.length
				? toolCalls.filter(
						(toolCall) => !traceToolCallIds.has(toolCall.id),
					)
				: toolCalls;
			const traceHasReasoning = traceEvents.some(
				(event) => event.type === "reasoning" && event.text.trim(),
			);
			const traceHasResponse = traceEvents.some(
				(event) => event.type === "response" && event.text.trim(),
			);
			const stripAssistantMediaLinks = (value: string) => {
				let next = value;
				if (videoUrl) next = stripMarkdownLink(next, videoUrl);
				if (audioUrl) next = stripMarkdownLink(next, audioUrl);
				if (imageUrl) next = stripMarkdownLink(next, imageUrl);
				return next;
			};
			const displayModelId = (message.modelId ?? activeThread.modelId ?? "").trim();
			const overrideModelLabel = displayModelId
				? activeThread.settings.modelOverridesById?.[
						displayModelId
					]?.displayName?.trim()
				: "";
			const mappedModelLabel = displayModelId
				? modelDisplayNameById[displayModelId]?.trim()
				: "";
			const modelLabel =
				overrideModelLabel ||
				mappedModelLabel ||
				(displayModelId ? formatModelLabel(displayModelId) : "Model");
			const orgId =
				(displayModelId ? modelOrgIdById[displayModelId] : undefined) ??
				(displayModelId
					? isInternalModelId(displayModelId)
						? getOrgId(displayModelId)
						: "ai-stats"
					: "ai-stats");
			const orgName = orgNameById[orgId] ?? orgId;
			const modelLink =
				(displayModelId ? modelLinkById[displayModelId] : undefined) ??
				buildModelLink(displayModelId);
			const hasModelLink = Boolean(displayModelId && modelLink !== "#");
			const routingSelectedProvider =
				(activeMeta?.routing as any)?.selected_provider;
			let responseProviderId = message.providerId?.trim() || null;
			if (
				typeof activeMeta?.provider === "string" &&
				activeMeta.provider.trim().length > 0
			) {
				responseProviderId = activeMeta.provider.trim();
			} else if (
				typeof routingSelectedProvider === "string" &&
				routingSelectedProvider.trim().length > 0
			) {
				responseProviderId = routingSelectedProvider.trim();
			}
			const responseProviderLabel =
				message.providerName?.trim() || responseProviderId || null;
			const responseProviderHref =
				responseProviderId && responseProviderId !== "auto"
					? `/api-providers/${encodeURIComponent(responseProviderId)}`
					: null;
			const isEditing = editingId === message.id;
			const userInlineAttachmentPreviews = isUser
				? getInlineAttachmentPreviewsFromMeta(message.meta)
				: [];
			const userImageAttachmentPreviews = userInlineAttachmentPreviews.filter(
				(attachment) => attachment.isImage,
			);
			const userAudioAttachmentPreviews = userInlineAttachmentPreviews.filter(
				(attachment) => attachment.isAudio,
			);
			const userVideoAttachmentPreviews = userInlineAttachmentPreviews.filter(
				(attachment) => attachment.isVideo,
			);
			const hideAttachmentPlaceholderText =
				isUser &&
				userInlineAttachmentPreviews.length > 0 &&
				ATTACHMENT_PLACEHOLDER_PATTERN.test(
					message.content.trim(),
				);
			const hasAccent = Boolean(accentColor);
			const messagePanelStyle =
				isUser && hasAccent
					? {
							backgroundColor: accentColor,
							color: getReadableTextColor(accentColor),
						}
					: undefined;

			const messageNode = (
						<Message
							align={isUser ? "end" : "start"}
							data-chat-message-id={message.id}
							data-chat-message-role={message.role}
							className={cn(inSideBySideGroup && "h-full")}
						>
							<MessageContent
								className={cn(
									"max-w-[min(100%,42rem)] gap-2",
									isUser ? "items-end" : "items-start",
									inSideBySideGroup &&
										"max-w-none items-stretch h-full",
								)}
							>
								{!isUser && displayModelId && (
									<MessageHeader className="mb-0 flex-col items-start gap-0.5 px-0 text-xs text-muted-foreground">
										{hasModelLink ? (
											<Link
												href={modelLink}
												className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
											>
												<Logo
													id={orgId}
													alt={orgName}
													width={18}
													height={18}
													className="shrink-0 rounded-none"
												/>
												<span className="truncate">
													{modelLabel}
												</span>
											</Link>
										) : (
											<span className="inline-flex items-center gap-2">
												<Logo
													id={orgId}
													alt={orgName}
													width={18}
													height={18}
													className="shrink-0 rounded-none"
												/>
												<span className="truncate">
													{modelLabel}
												</span>
											</span>
										)}
										{responseProviderLabel ? (
											responseProviderHref ? (
												<Link
													href={responseProviderHref}
													className="pl-6 text-[11px] text-muted-foreground/80 transition-colors hover:text-foreground"
												>
													via {responseProviderLabel}
												</Link>
											) : (
												<span className="pl-6 text-[11px] text-muted-foreground/80">
													via {responseProviderLabel}
												</span>
											)
										) : null}
									</MessageHeader>
								)}
								{showRequestError && messageRequestError ? (
									<ChatRequestErrorNotice
										error={messageRequestError}
										threadTitle={activeThread.title}
										className="mb-0 max-w-full"
									/>
								) : (
									<div
										data-slot="message-panel"
										className={cn(
											isUser
												? cn(
														"max-w-full rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
														inSideBySideGroup
															? "flex h-full min-h-[180px] w-full flex-col"
															: "w-fit",
														hasAccent
															? ""
															: "bg-foreground text-background",
													)
												: cn(
														"w-full max-w-[min(100%,46rem)] px-0 py-1 text-sm leading-relaxed text-foreground",
														inSideBySideGroup &&
															"flex h-full min-h-[180px] flex-col",
													),
										)}
										style={messagePanelStyle}
									>
						{isUser ? (
							isEditing ? (
								<div className="grid gap-3">
									<Textarea
										value={editingValue}
										onChange={(event) =>
											onEditingValueChange(event.target.value)
										}
										rows={3}
										className="min-h-[100px] resize-none"
									/>
									<div className="flex items-center justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												onEditingIdChange(null);
												onEditingValueChange("");
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
												onEditingIdChange(null);
												onEditingValueChange("");
											}}
										>
											<Save className="mr-1 h-4 w-4" />
											Save
										</Button>
									</div>
								</div>
							) : (
								<div className="grid gap-2">
									{hideAttachmentPlaceholderText ? null : (
										<span className="whitespace-pre-wrap">
											{message.content}
										</span>
									)}
									{userImageAttachmentPreviews.length ? (
										<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											{userImageAttachmentPreviews.map((attachment) => (
												<img
													key={`${message.id}-${attachment.dataUrl}`}
													src={attachment.dataUrl}
													alt={attachment.name}
													className="max-h-[360px] w-auto max-w-full rounded-lg border border-border object-contain"
													loading="lazy"
												/>
											))}
										</div>
									) : null}
									{userAudioAttachmentPreviews.length ? (
										<div className="grid gap-2">
											{userAudioAttachmentPreviews.map((attachment) => (
												<MediaPlayer
													key={`${message.id}-${attachment.dataUrl}`}
													className="w-full"
												>
													<MediaPlayerAudio>
														<source
															src={attachment.dataUrl}
															type={
																attachment.mimeType ||
																"audio/mpeg"
															}
														/>
													</MediaPlayerAudio>
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
															<MediaPlayerDownload />
															<MediaPlayerSettings />
														</div>
													</MediaPlayerControls>
												</MediaPlayer>
											))}
										</div>
									) : null}
									{userVideoAttachmentPreviews.length ? (
										<div className="grid gap-2">
											{userVideoAttachmentPreviews.map((attachment) => (
												<MediaPlayer
													key={`${message.id}-${attachment.dataUrl}`}
													className="w-full"
												>
													<MediaPlayerVideo>
														<source
															src={attachment.dataUrl}
															type={
																attachment.mimeType ||
																"video/mp4"
															}
														/>
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
											))}
										</div>
									) : null}
								</div>
							)
						) : isSending &&
							(!content || content === "Generating...") &&
							toolCalls.length === 0 ? (
							<div className="flex min-h-7 items-center">
								<Shimmer
									className="text-sm text-muted-foreground"
									duration={1.4}
								>
									{`Generating with ${modelLabel}...`}
								</Shimmer>
							</div>
						) : (
							<div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-ul:pl-5 prose-ol:pl-5 prose-li:my-1">
								{traceEvents.length ? (
									<div className="not-prose grid gap-1.5">
										{traceEvents.map((event) => {
											if (event.type === "reasoning") {
												if (!event.text.trim()) return null;
												return (
													<Reasoning
														key={event.id}
														className="mb-0"
														isStreaming={isPendingAssistant}
														defaultOpen={Boolean(
															isPendingAssistant,
														)}
													>
														<ReasoningTrigger />
														<ReasoningContent className="mt-2">
															{event.text}
														</ReasoningContent>
													</Reasoning>
												);
											}
											if (event.type === "tool_call") {
												const toolCall =
													toolCallsById.get(event.toolCallId);
												if (!toolCall) return null;
												return (
													<ChatToolCallMarkers
														key={event.id}
														compact
														toolCalls={[toolCall]}
														messageId={message.id}
													/>
												);
											}
											const eventText =
												stripAssistantMediaLinks(event.text);
											if (!eventText.trim()) return null;
											return (
												<div
													key={event.id}
													className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-0"
												>
													<Streamdown>{eventText}</Streamdown>
												</div>
											);
										})}
										{fallbackToolCalls.length ? (
											<ChatToolCallMarkers
												compact
												toolCalls={fallbackToolCalls}
												messageId={message.id}
											/>
										) : null}
										{!traceHasReasoning && reasoningText ? (
											<Reasoning
												className="mb-0"
												isStreaming={isPendingAssistant}
												defaultOpen={Boolean(
													isPendingAssistant,
												)}
											>
												<ReasoningTrigger />
												<ReasoningContent className="mt-2">
													{reasoningText}
												</ReasoningContent>
											</Reasoning>
										) : null}
										{!traceHasResponse &&
										!showRequestError &&
										contentWithoutMediaLinks ? (
											<div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-0">
												<Streamdown>
													{contentWithoutMediaLinks}
												</Streamdown>
											</div>
										) : null}
									</div>
								) : (
									<>
										<ChatToolCallMarkers
											toolCalls={toolCalls}
											messageId={message.id}
										/>
										{reasoningText ? (
											<Reasoning
												className="mb-1.5"
												isStreaming={isPendingAssistant}
												defaultOpen={Boolean(
													isPendingAssistant,
												)}
											>
												<ReasoningTrigger />
												<ReasoningContent className="mt-2">
													{reasoningText}
												</ReasoningContent>
											</Reasoning>
										) : null}
										{!showRequestError &&
										contentWithoutMediaLinks ? (
											<Streamdown>
												{contentWithoutMediaLinks}
											</Streamdown>
										) : null}
									</>
								)}
								{!contentWithoutMediaLinks &&
									messageRequestError ? (
									<p className="not-prose text-sm text-muted-foreground">
										Request failed. Use Retry to run this message again.
									</p>
								) : null}
								{isPendingAssistant &&
								!contentWithoutMediaLinks &&
								!messageRequestError ? (
									<div className="not-prose flex min-h-7 items-center">
										<Shimmer
											className="text-sm text-muted-foreground"
											duration={1.4}
										>
											Generating final response...
										</Shimmer>
									</div>
								) : null}
								{imageUrl ? (
									<div className="not-prose mt-3 grid gap-2">
										<img
											src={imageUrl}
											alt="Generated image"
											className="max-h-[420px] w-auto max-w-full rounded-lg border border-border object-contain"
										/>
										<Link
											href={imageUrl}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
										>
											Open image in new tab
										</Link>
									</div>
								) : null}
								{audioUrl ? (
									<div className="not-prose mt-3 grid gap-2">
										<MediaPlayer className="w-full">
											<MediaPlayerAudio>
												<source
													src={audioUrl}
													type={inferAudioMimeType(audioUrl)}
												/>
											</MediaPlayerAudio>
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
													<MediaPlayerDownload />
													<MediaPlayerSettings />
												</div>
											</MediaPlayerControls>
										</MediaPlayer>
										<Link
											href={audioUrl}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
										>
											Open audio in new tab
										</Link>
									</div>
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
								)}
								{isUser ? (
									<UserMessageFooter
										copied={userCopied}
										onCopy={() => {
											void handleCopyForMessage(
												userCopyKey,
												message.content,
											);
										}}
										onEdit={() => {
											onEditingIdChange(message.id);
											onEditingValueChange(message.content);
										}}
									/>
								) : (
									<AssistantMessageFooter
										activeVariantIndex={activeVariantIndex}
										assistantCopied={assistantCopied}
										costLabel={costLabel}
										generationSeconds={generationSeconds}
										isPendingAssistant={isPendingAssistant}
										latencyDisplay={latencyDisplay}
										metadataOpen={metadataOpenId === message.id}
										metadataProviderId={metadataProviderId}
										metadataProviderLabel={metadataProviderLabel}
										onBranch={() => onBranchAssistant(message.id)}
										onCopy={() => {
											void handleCopyForMessage(
												assistantCopyKey,
												content,
											);
										}}
										onMetadataOpenChange={(open) =>
											onMetadataOpenIdChange(
												open ? message.id : null,
											)
										}
										onRetry={() => onRetryAssistant(message.id)}
										onSelectVariant={(variantIndex) =>
											onSelectVariant(message.id, variantIndex)
										}
										throughputDisplay={throughputDisplay}
										totalTokens={totalTokens}
										variantCount={variants.length}
									/>
								)}
							</MessageContent>
						</Message>
			);

			if (!wrapInScroller) {
				return messageNode;
			}

			return (
				<Fragment key={message.id}>
					{options.hideMarkers ? null : (
						<ChatMessageMarkers
							markers={requestContextMarkers}
							messageId={message.id}
						/>
					)}
					<MessageScroller.Item
						messageId={message.id}
						scrollAnchor={isUser}
					>
						{messageNode}
					</MessageScroller.Item>
				</Fragment>
			);
		};

		if (shouldVirtualizeMessages) {
			return (
				<ChatVirtualMessageList
					estimatedMessageHeight={ESTIMATED_MESSAGE_HEIGHT}
					measureVirtualMessage={measureVirtualMessage}
					messages={messages}
					renderMessage={renderMessage}
					totalSize={messageVirtualizer.getTotalSize()}
					virtualItems={virtualItems}
				/>
			);
		}

		if (responseLayout === "side-by-side") {
			type SideBySideItem = {
				message: ChatThread["messages"][number];
				messageIndex: number;
			};
			type SideBySideTurn = {
				key: string;
				user: SideBySideItem | null;
				assistantsByModelKey: Map<string, SideBySideItem[]>;
			};
			const rawTurns: SideBySideTurn[] = [];
			const firstAssistantIndexByModelKey = new Map<string, number>();
			let currentTurn: SideBySideTurn | null = null;

			messages.forEach((message, messageIndex) => {
				const item = { message, messageIndex };
				if (message.role === "user") {
					currentTurn = {
						key: message.id,
						user: item,
						assistantsByModelKey: new Map(),
					};
					rawTurns.push(currentTurn);
					return;
				}

				if (!currentTurn) {
					currentTurn = {
						key: `assistant-${message.id}`,
						user: null,
						assistantsByModelKey: new Map(),
					};
					rawTurns.push(currentTurn);
				}

				const modelKey =
					(message.modelId ?? activeThread.modelId ?? "").trim() ||
					message.id;
				const modelItems =
					currentTurn.assistantsByModelKey.get(modelKey) ?? [];
				modelItems.push(item);
				currentTurn.assistantsByModelKey.set(modelKey, modelItems);
				if (!firstAssistantIndexByModelKey.has(modelKey)) {
					firstAssistantIndexByModelKey.set(modelKey, messageIndex);
				}
			});

			const haveOverlappingModels = (
				a: SideBySideTurn,
				b: SideBySideTurn,
			) => {
				for (const modelKey of a.assistantsByModelKey.keys()) {
					if (b.assistantsByModelKey.has(modelKey)) {
						return true;
					}
				}
				return false;
			};
			const mergeTurns = (
				target: SideBySideTurn,
				source: SideBySideTurn,
			) => {
				for (const [modelKey, items] of source.assistantsByModelKey) {
					const targetItems =
						target.assistantsByModelKey.get(modelKey) ?? [];
					targetItems.push(...items);
					target.assistantsByModelKey.set(modelKey, targetItems);
				}
			};
			const turns: SideBySideTurn[] = [];
			for (const turn of rawTurns) {
				const previousTurn = turns[turns.length - 1];
				const previousPrompt = previousTurn?.user?.message.content.trim();
				const currentPrompt = turn.user?.message.content.trim();
				if (
					previousTurn?.user &&
					turn.user &&
					previousPrompt &&
					currentPrompt &&
					previousPrompt === currentPrompt &&
					previousTurn.assistantsByModelKey.size > 0 &&
					turn.assistantsByModelKey.size > 0 &&
					!haveOverlappingModels(previousTurn, turn)
				) {
					mergeTurns(previousTurn, turn);
					continue;
				}
				turns.push(turn);
			}

			const modelOrder = new Map(
				modelOrderIds.map((modelId, index) => [modelId, index]),
			);
			const modelKeys = Array.from(firstAssistantIndexByModelKey.keys()).sort(
				(a, b) => {
					const aOrder = modelOrder.get(a);
					const bOrder = modelOrder.get(b);
					if (aOrder !== undefined || bOrder !== undefined) {
						return (
							(aOrder ?? Number.MAX_SAFE_INTEGER) -
							(bOrder ?? Number.MAX_SAFE_INTEGER)
						);
					}
					return (
						(firstAssistantIndexByModelKey.get(a) ??
							Number.MAX_SAFE_INTEGER) -
						(firstAssistantIndexByModelKey.get(b) ??
							Number.MAX_SAFE_INTEGER)
					);
				},
			);
			if (modelKeys.length === 0) {
				return messages.map((message, messageIndex) =>
					renderMessage(message, messageIndex),
				);
			}

			return (
				<MessageScroller.Item
					messageId={
						turns[0]?.user?.message.id ??
						turns[0]?.assistantsByModelKey.values().next().value?.[0]
							?.message.id ??
						"side-by-side"
					}
					scrollAnchor={false}
				>
					<ScrollArea
						data-chat-response-layout="side-by-side"
						scrollBarOrientation="horizontal"
						className="w-full pb-3"
						viewportClassName="overscroll-x-contain"
					>
						<div
							className="grid min-w-max items-stretch gap-x-4 gap-y-5 pr-4"
							style={{
								gridTemplateColumns: `repeat(${modelKeys.length}, minmax(0, min(88vw, 32rem)))`,
							}}
						>
							{turns.flatMap((turn) =>
								modelKeys.map((modelKey, modelIndex) => {
									const assistantItems =
										turn.assistantsByModelKey.get(modelKey) ?? [];
									return (
										<section
											key={`${turn.key}-${modelKey}`}
											className={cn(
												"flex min-h-full flex-col gap-4",
												modelIndex > 0 && "border-l border-border pl-4",
											)}
										>
											{turn.user ? (
												renderMessage(
													turn.user.message,
													turn.user.messageIndex,
													{
														hideMarkers: true,
														wrapInScroller: false,
													},
												)
											) : null}
											{assistantItems.length > 0 ? (
												assistantItems.map((item) => (
													<Fragment
														key={`${turn.key}-${modelKey}-${item.message.id}-${item.messageIndex}`}
													>
														{renderMessage(
															item.message,
															item.messageIndex,
															{
																hideMarkers: true,
																inSideBySideGroup: true,
																wrapInScroller: false,
															},
														)}
													</Fragment>
												))
											) : (
												<div
													className="min-h-[180px] flex-1"
													aria-hidden="true"
												/>
											)}
										</section>
									);
								}),
							)}
						</div>
					</ScrollArea>
				</MessageScroller.Item>
			);
		}

		type SequentialItem = {
			message: ChatThread["messages"][number];
			messageIndex: number;
		};
		type SequentialTurn = {
			user: SequentialItem | null;
			assistants: SequentialItem[];
		};
		const sequentialTurns: SequentialTurn[] = [];
		let currentTurn: SequentialTurn | null = null;

		messages.forEach((message, messageIndex) => {
			const item = { message, messageIndex };
			if (message.role === "user") {
				currentTurn = {
					user: item,
					assistants: [],
				};
				sequentialTurns.push(currentTurn);
				return;
			}
			if (!currentTurn) {
				currentTurn = {
					user: null,
					assistants: [],
				};
				sequentialTurns.push(currentTurn);
			}
			currentTurn.assistants.push(item);
		});

		const getAssistantModelKey = (
			message: ChatThread["messages"][number],
		) => (message.modelId ?? activeThread.modelId ?? message.id).trim();

		const mergedTurns: SequentialTurn[] = [];
		for (const turn of sequentialTurns) {
			const previousTurn = mergedTurns[mergedTurns.length - 1];
			const previousPrompt = previousTurn?.user?.message.content.trim();
			const currentPrompt = turn.user?.message.content.trim();
			if (
				previousTurn?.user &&
				turn.user &&
				previousPrompt &&
				currentPrompt &&
				previousPrompt === currentPrompt &&
				previousTurn.assistants.length > 0 &&
				turn.assistants.length > 0
			) {
				const previousModels = new Set(
					previousTurn.assistants.map((item) =>
						getAssistantModelKey(item.message),
					),
				);
				const hasOverlappingModel = turn.assistants.some((item) =>
					previousModels.has(getAssistantModelKey(item.message)),
				);
				if (!hasOverlappingModel) {
					previousTurn.assistants.push(...turn.assistants);
					continue;
				}
			}
			mergedTurns.push({
				user: turn.user,
				assistants: [...turn.assistants],
			});
		}

		return mergedTurns.flatMap((turn) => [
			...(turn.user
				? [renderMessage(turn.user.message, turn.user.messageIndex)]
				: []),
			...turn.assistants.map((item) =>
				renderMessage(item.message, item.messageIndex),
			),
		]);
	}, [
		activeThread,
		messages,
		shouldVirtualizeMessages,
		messageVirtualizer,
		virtualItems,
		measureVirtualMessage,
		isSending,
		lastMessageId,
		editingId,
		editingValue,
		metadataOpenId,
		orgNameById,
		modelDisplayNameById,
		modelOrgIdById,
		modelLinkById,
		accentColor,
		requestError,
		handleCopyForMessage,
		copiedMessageKey,
		onEditingValueChange,
		onEditingIdChange,
		onEditMessage,
		onRetryAssistant,
		onBranchAssistant,
		onSelectVariant,
		latencyDisplay,
		generationSeconds,
		throughputDisplay,
		costLabel,
		totalTokens,
		metadataProviderLabel,
		onMetadataOpenIdChange,
		responseLayout,
		modelOrderIds,
		modelOptions,
		selectedModelIds,
		onAddModelSet,
	]);

	return <>{messagesContent}</>;
}
