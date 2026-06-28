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
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
	ChatRequestErrorNotice,
	type ChatRequestErrorDetails,
} from "@/components/(chat)/ChatRequestErrorNotice";
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
import {
	Brain,
	Cpu,
	Paperclip,
	Save,
	Search,
	Settings2,
	X,
} from "lucide-react";
import {
	ChatMessageMarkers,
	formatReasoningEffort,
	getComparableModelSet,
	getRequestContextMarker,
	type ChatMessageMarker,
} from "@/components/(chat)/ChatMessageMarkers";
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
	onDismissRequestError?: () => void;
	scrollViewportRef: RefObject<HTMLDivElement | null>;
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
	onDismissRequestError,
	scrollViewportRef,
}: ChatConversationMessagesProps) {
	const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
	const [dismissedErrorMessageIds, setDismissedErrorMessageIds] = useState<
		Set<string>
	>(() => new Set());
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
			return <ChatMessagesEmptyState />;
		}

		const renderMessage = (
			message: ChatThread["messages"][number],
			messageIndex: number,
		) => {
			const isUser = message.role === "user";
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
			if (requestContext) {
				const currentModelSet = getComparableModelSet(requestContext);
				const previousModelSet = previousUserRequestContext
					? getComparableModelSet(previousUserRequestContext)
					: "";
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
								? `Comparing ${labels.join(", ")}`
								: `Switched to ${labels[0] ?? "selected model"}`,
					});
				}
				const previousReasoning =
					previousUserRequestContext?.reasoningEnabled
						? previousUserRequestContext.reasoningEffort
						: "off";
				const currentReasoning = requestContext.reasoningEnabled
					? requestContext.reasoningEffort
					: "off";
				if (currentReasoning !== previousReasoning) {
					requestContextMarkers.push({
						id: "reasoning",
						icon: Brain,
						label: requestContext.reasoningEnabled
							? `Reasoning set to ${formatReasoningEffort(requestContext.reasoningEffort)}`
							: "Reasoning disabled",
					});
				}
				if (
					requestContext.webSearchEnabled !==
					Boolean(previousUserRequestContext?.webSearchEnabled)
				) {
					requestContextMarkers.push({
						id: "web",
						icon: Search,
						label: requestContext.webSearchEnabled
							? "Web search enabled"
							: "Web search disabled",
					});
				}
				if (
					requestContext.apiServerToolsEnabled !==
					Boolean(previousUserRequestContext?.apiServerToolsEnabled)
				) {
					requestContextMarkers.push({
						id: "tools",
						icon: Settings2,
						label: requestContext.apiServerToolsEnabled
							? "API tools enabled"
							: "API tools disabled",
					});
				}
				if (requestContext.attachmentsCount > 0) {
					requestContextMarkers.push({
						id: "attachments",
						icon: Paperclip,
						label:
							requestContext.attachmentsCount === 1
								? "Added 1 attachment"
								: `Added ${requestContext.attachmentsCount} attachments`,
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
					lastMessageId === message.id &&
					!dismissedErrorMessageIds.has(message.id)
				) {
					messageRequestError = requestError;
				}
			}
			const showRequestError =
				Boolean(messageRequestError) &&
				!dismissedErrorMessageIds.has(message.id);
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
			const previousAssistantModelId =
				activeThread.messages
					.slice(0, messageIndex)
					.reverse()
					.find((item) => item.role !== "user" && item.modelId?.trim())
					?.modelId?.trim() ?? null;
			const precedingUserRequestContext =
				!isUser && messageIndex > 0
					? getRequestContextMarker(
							activeThread.messages[messageIndex - 1]?.role === "user"
								? activeThread.messages[messageIndex - 1]?.meta
								: undefined,
						)
					: null;
			const precedingUserModelSet = precedingUserRequestContext
				? new Set([
						precedingUserRequestContext.modelId,
						...precedingUserRequestContext.compareModelIds,
					])
				: null;
			const showModelMarker =
				!isUser &&
				Boolean(displayModelId) &&
				previousAssistantModelId !== displayModelId &&
				!precedingUserModelSet?.has(displayModelId);
			const modelMarkerLabel = previousAssistantModelId
				? `Switched to ${modelLabel}`
				: `Using ${modelLabel}`;
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
			const userBubbleStyle =
				isUser && hasAccent
					? { backgroundColor: accentColor }
					: undefined;

				return (
					<Fragment key={message.id}>
						<ChatMessageMarkers
							markers={requestContextMarkers}
							messageId={message.id}
						/>
						{showModelMarker ? (
							<ChatMessageMarkers
								markers={[
									{
										id: "assistant-model",
										icon: Cpu,
										label: modelMarkerLabel,
									},
								]}
								messageId={message.id}
							/>
						) : null}
						<MessageScroller.Item
							messageId={message.id}
							scrollAnchor={isUser}
						>
						<Message
							align={isUser ? "end" : "start"}
							data-chat-message-id={message.id}
							data-chat-message-role={message.role}
						>
							<MessageContent
								className={cn(isUser ? "items-end" : "items-start")}
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
											<span className="pl-6 text-[11px] text-muted-foreground/80">
												via {responseProviderLabel}
											</span>
										) : null}
									</MessageHeader>
								)}
								<Bubble
									align={isUser ? "end" : "start"}
									variant="ghost"
									className="max-w-[85%]"
								>
									<BubbleContent
										className={cn(
											"rounded-2xl px-4 py-3 text-sm leading-relaxed",
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
						) : isSending && (!content || content === "Generating...") ? (
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
								{showRequestError && messageRequestError ? (
									<ChatRequestErrorNotice
										error={messageRequestError}
										threadTitle={activeThread.title}
										className="not-prose"
										onDismiss={() => {
											setDismissedErrorMessageIds((current) => {
												const next = new Set(current);
												next.add(message.id);
												return next;
											});
											onDismissRequestError?.();
										}}
									/>
								) : !contentWithoutMediaLinks &&
									messageRequestError ? (
									<p className="not-prose text-sm text-muted-foreground">
										Request failed. Use Retry to run this message again.
									</p>
								) : null}
								{!showRequestError && contentWithoutMediaLinks ? (
									<Streamdown>{contentWithoutMediaLinks}</Streamdown>
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
									</BubbleContent>
								</Bubble>
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

		return messages.map((message, messageIndex) =>
			renderMessage(message, messageIndex),
		);
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
		onDismissRequestError,
		dismissedErrorMessageIds,
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
	]);

	return <>{messagesContent}</>;
}
