"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatConversationComposer } from "@/components/(chat)/ChatConversationComposer";
import { ChatConversationMessages } from "@/components/(chat)/ChatConversationMessages";
import type { ChatSettings, ChatThread } from "@/lib/indexeddb/chats";
import { Square } from "lucide-react";
import {
	REASONING_OPTIONS,
	extensionForAudioMimeType,
	extractClipboardFiles,
	getRandomPlaceholder,
	getSupportedRecordingMimeType,
	sanitizeAttachmentMediaUrl,
} from "./chatConversationHelpers";

export type ChatSendPayload = {
	content: string;
	attachments: File[];
	webSearchEnabled: boolean;
};

type ChatConversationProps = {
	activeThread: ChatThread | null;
	isSending: boolean;
	isAuthenticated: boolean;
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

type SendGateType = "auth";

export function ChatConversation({
	activeThread,
	isSending,
	isAuthenticated,
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
	const [reasoningPickerOpen, setReasoningPickerOpen] = useState(false);
	const [sendGateType, setSendGateType] = useState<SendGateType | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const recordingChunksRef = useRef<Blob[]>([]);
	const appliedPresetRef = useRef<string | null>(null);

	const placeholder = useMemo(() => {
		return getRandomPlaceholder();
	}, [activeThread?.id]);
	const reasoningSelection: NonNullable<ChatSettings["reasoningEffort"]> =
		reasoningEffort ?? "medium";
	const attachmentPreviewUrls = useMemo(
		() =>
			attachments.map((file) =>
				file.type.startsWith("image/")
					? URL.createObjectURL(file)
					: null,
			),
		[attachments],
	);

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
		if (isAuthenticated && sendGateType === "auth") {
			setSendGateType(null);
		}
	}, [isAuthenticated, sendGateType]);

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
		return () => {
			for (const url of attachmentPreviewUrls) {
				if (url) URL.revokeObjectURL(url);
			}
		};
	}, [attachmentPreviewUrls]);

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
			const pastedFiles = extractClipboardFiles(event.clipboardData ?? null);
			const pastedText = event.clipboardData?.getData("text") ?? "";
			const isEditableTarget = Boolean(
				event.target &&
					(event.target as HTMLElement).closest(
						"input, textarea, [contenteditable='true']",
					),
			);
			if (
				isEditableTarget &&
				pastedFiles.length === 0
			) {
				return;
			}
			if (!pastedFiles.length && !pastedText) return;
			if (pastedFiles.length > 0) {
				setAttachments((prev) => prev.concat(pastedFiles));
			}
			if (pastedText) {
				if (isEditableTarget) {
					const textarea = textareaRef.current;
					if (textarea) {
						textarea.focus();
						setComposer((prev) => `${prev}${pastedText}`);
					}
				} else {
					const textarea = textareaRef.current;
					if (!textarea) return;
					textarea.focus();
					setComposer((prev) => `${prev}${pastedText}`);
				}
			} else if (!isEditableTarget) {
				textareaRef.current?.focus();
			}
			if (!isEditableTarget || pastedFiles.length > 0) {
				event.preventDefault();
			}
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

	const applyReasoningSelection = useCallback(
		(value: NonNullable<ChatSettings["reasoningEffort"]>) => {
			onReasoningEnabledChange?.(true);
			onReasoningEffortChange?.(value);
			setReasoningPickerOpen(false);
		},
		[onReasoningEffortChange, onReasoningEnabledChange],
	);

	const handleSubmit = () => {
		if (isSending) return;
		const text = composer.trim();
		if (!text && attachments.length === 0) return;
		if (!isAuthenticated) {
			setSendGateType("auth");
			return;
		}
		setSendGateType(null);
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
									className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
								>
									<span className="pointer-events-none absolute inset-0 rounded-full bg-destructive/10 animate-pulse" />
									<span className="pointer-events-none relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive/20">
										<Square className="h-4 w-4 fill-current" />
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
					<ChatConversationMessages
						activeThread={activeThread}
						isSending={isSending}
						lastMessageId={lastMessageId}
						editingId={editingId}
						editingValue={editingValue}
						metadataOpenId={metadataOpenId}
						onMetadataOpenIdChange={setMetadataOpenId}
						onEditingIdChange={setEditingId}
						onEditingValueChange={setEditingValue}
						orgNameById={orgNameById}
						accentColor={accentColor}
						onEditMessage={onEditMessage}
						onRetryAssistant={onRetryAssistant}
						onBranchAssistant={onBranchAssistant}
						onSelectVariant={onSelectVariant}
						onCopy={handleCopy}
					/>
				</div>
			</ScrollArea>
			<ChatConversationComposer
				sendGateType={sendGateType}
				isSending={isSending}
				composer={composer}
				attachments={attachments}
				attachmentPreviewUrls={attachmentPreviewUrls}
				placeholder={placeholder}
				textareaRef={textareaRef}
				fileInputRef={fileInputRef}
				audioInputRef={audioInputRef}
				isUnified={isUnified}
				webSearchEnabled={webSearchEnabled}
				onWebSearchEnabledChange={onWebSearchEnabledChange}
				reasoningEnabled={reasoningEnabled}
				reasoningPickerOpen={reasoningPickerOpen}
				onReasoningPickerOpenChange={setReasoningPickerOpen}
				reasoningSelection={reasoningSelection}
				reasoningOptions={REASONING_OPTIONS}
				onReasoningSelection={applyReasoningSelection}
				selectedModelCount={selectedModelCount}
				selectedModelsHint={selectedModelsHint}
				selectedModelId={selectedModelId}
				selectedModelLabel={selectedModelLabel}
				selectedOrgId={selectedOrgId}
				isRecording={isRecording}
				isStartingRecording={isStartingRecording}
				recordingSupported={recordingSupported}
				onToggleRecording={toggleRecording}
				onOpenModelPicker={onOpenModelPicker}
				onSubmit={handleSubmit}
				onComposerChange={setComposer}
				onRemoveAttachment={(index) =>
					setAttachments((prev) => prev.filter((_, i) => i !== index))
				}
				onFileSelect={handleFileSelect}
			/>

			{/* Metadata now handled via per-message popovers */}
		</main>
	);
}
