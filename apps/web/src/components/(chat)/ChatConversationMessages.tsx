"use client";

import { useMemo } from "react";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatThread } from "@/lib/indexeddb/chats";
import {
	ChevronLeft,
	ChevronRight,
	Copy,
	GitBranch,
	Info,
	MessageSquare,
	Pencil,
	RotateCcw,
	Save,
	X,
} from "lucide-react";
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

function formatMetric(
	value: number | string | null | undefined,
	suffix?: string,
) {
	if (value === null || value === undefined || value === "") return "-";
	return suffix ? `${value}${suffix}` : `${value}`;
}

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
	accentColor: string;
	onEditMessage: (messageId: string, content: string) => void;
	onRetryAssistant: (messageId: string) => void;
	onBranchAssistant: (messageId: string) => void;
	onSelectVariant: (messageId: string, variantIndex: number) => void;
	onCopy: (text: string) => void;
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
	accentColor,
	onEditMessage,
	onRetryAssistant,
	onBranchAssistant,
	onSelectVariant,
	onCopy,
}: ChatConversationMessagesProps) {
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
			const displayModelId = message.modelId ?? activeThread.modelId;
			const linkModelId = displayModelId
				? isInternalModelId(displayModelId)
					? displayModelId
					: activeThread.modelId
				: activeThread.modelId;
			const orgId = linkModelId ? getOrgId(linkModelId) : "ai-stats";
			const modelLabel = displayModelId
				? formatModelLabel(displayModelId)
				: "Model";
			const orgName = orgNameById[orgId] ?? orgId;
			const modelLink = buildModelLink(linkModelId);
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
				<div
					key={message.id}
					className={cn(
						"flex flex-col",
						isUser ? "items-end" : "items-start",
					)}
				>
					{!isUser && linkModelId && (
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
								{contentWithoutMediaLinks ? (
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
					</div>
					{isUser ? (
						<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className="h-7 w-7"
										onClick={() => onCopy(message.content)}
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
											onEditingIdChange(message.id);
											onEditingValueChange(message.content);
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
												onClick={() => onCopy(content)}
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
											onMetadataOpenIdChange(
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
															{formatMetric(totalTokens)}
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
										{activeVariantIndex + 1}/{variants.length}
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
											activeVariantIndex >= variants.length - 1
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
		onCopy,
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
		onMetadataOpenIdChange,
	]);

	return <>{messagesContent}</>;
}
