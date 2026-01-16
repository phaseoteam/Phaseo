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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatThread } from "@/lib/indexeddb/chats";
import {
	ChevronLeft,
	ChevronRight,
	Copy,
	Cpu,
	GitBranch,
	Info,
	MessageSquare,
	Pencil,
	Paperclip,
	RotateCcw,
	Search,
	SendHorizontal,
	Save,
	X,
} from "lucide-react";

type ChatConversationProps = {
    activeThread: ChatThread | null;
    isSending: boolean;
    isAuthenticated: boolean;
    hasApiKey: boolean;
    presetPrompt?: string;
    onSend: (content: string) => void;
    onEditMessage: (messageId: string, content: string) => void;
    onRetryAssistant: (messageId: string) => void;
	onBranchAssistant: (messageId: string) => void;
	onSelectVariant: (messageId: string, variantIndex: number) => void;
	orgNameById: Record<string, string>;
	onOpenSettings: () => void;
	accentColor: string;
	selectedOrgId: string;
	selectedModelLabel: string;
	onOpenModelPicker: () => void;
};

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

export function ChatConversation({
    activeThread,
    isSending,
    isAuthenticated,
    hasApiKey,
    presetPrompt,
    onSend,
    onEditMessage,
    onRetryAssistant,
	onBranchAssistant,
	onSelectVariant,
	orgNameById,
	onOpenSettings,
	accentColor,
	selectedOrgId,
	selectedModelLabel,
	onOpenModelPicker,
}: ChatConversationProps) {
	const [composer, setComposer] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
    const [metadataOpenId, setMetadataOpenId] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [searchEnabled, setSearchEnabled] = useState(false);
    const appliedPresetRef = useRef<string | null>(null);

	const latestMessageContent =
		activeThread?.messages[activeThread.messages.length - 1]?.content ?? "";
	const lastMessageId =
		activeThread?.messages[activeThread.messages.length - 1]?.id ?? null;

	useEffect(() => {
		const root = scrollAreaRef.current;
		if (!root) return;
		const viewport = root.querySelector(
			"[data-radix-scroll-area-viewport]"
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
        });
        return () => cancelAnimationFrame(raf);
    }, [activeThread?.id]);

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
						' [data-state="open"][data-radix-popper-content-wrapper]'
				)
			);
			if (overlayOpen) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (
				event.target &&
				(event.target as HTMLElement).closest(
					"input, textarea, [contenteditable='true']"
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
						' [data-state="open"][data-radix-popper-content-wrapper]'
				)
			);
			if (overlayOpen) return;
			if (
				event.target &&
				(event.target as HTMLElement).closest(
					"input, textarea, [contenteditable='true']"
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
		suffix?: string
	) => {
		if (value === null || value === undefined || value === "") return "-";
		return suffix ? `${value}${suffix}` : `${value}`;
	};

	const metadataMessage = useMemo(() => {
		if (!metadataOpenId || !activeThread) return null;
		return (
			activeThread.messages.find(
				(message) => message.id === metadataOpenId
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
						isUser ? "items-end" : "items-start"
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
								className="rounded-full shrink-0"
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
								: "border border-border bg-muted text-foreground"
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
													editingValue.trim()
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
											isPendingAssistant
										)}
									>
										<ReasoningTrigger />
										<ReasoningContent>
											{reasoningText}
										</ReasoningContent>
									</Reasoning>
								) : null}
								<Streamdown>{content}</Streamdown>
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
														message.id
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
												open ? message.id : null
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
																totalTokens
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
																" ms"
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
																" s"
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
																" tps"
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
													activeVariantIndex - 1
												)
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
													activeVariantIndex + 1
												)
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
		if (!text) return;
		onSend(text);
		setComposer("");
		setAttachments([]);
	};

	const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		if (!files.length) return;
		setAttachments((prev) => prev.concat(files));
		event.target.value = "";
	};

	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<ScrollArea className="flex-1" ref={scrollAreaRef}>
				<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
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
							placeholder="Send a message..."
							className="min-h-[56px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						<div className="flex items-center justify-between pt-2">
							<div className="flex items-center gap-1">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											onClick={onOpenModelPicker}
											className="h-8 w-8"
										>
											{selectedModelLabel ===
											"Select model" ? (
												<Cpu className="h-4 w-4 text-muted-foreground" />
											) : (
												<Logo
													id={selectedOrgId}
													alt={selectedOrgId}
													width={16}
													height={16}
													className="rounded-full shrink-0"
												/>
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{selectedModelLabel || "Select model"}
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<span>
											<Button
												variant="ghost"
												size="icon"
												disabled={true}
												className="h-8 w-8"
											>
												<Paperclip className="h-4 w-4" />
											</Button>
										</span>
									</TooltipTrigger>
									<TooltipContent>Coming soon</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<span>
											<Button
												variant="ghost"
												size="icon"
												disabled={true}
												className="h-8 w-8"
											>
												<Search className="h-4 w-4" />
											</Button>
										</span>
									</TooltipTrigger>
									<TooltipContent>Coming soon</TooltipContent>
								</Tooltip>
							</div>
							<Button
								size="icon"
								onClick={handleSubmit}
								disabled={
									isSending ||
									!composer.trim() ||
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
