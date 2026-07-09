"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { ChatConversationComposer } from "@/components/(chat)/ChatConversationComposer";
import { ChatConversationMessages } from "@/components/(chat)/ChatConversationMessages";
import type { ChatRequestErrorDetails } from "@/components/(chat)/ChatRequestErrorNotice";
import type {
	ChatServerToolConfigs,
	ChatServerToolType,
	ChatSettings,
	ChatThread,
} from "@/lib/indexeddb/chats";
import { ArrowDown } from "lucide-react";
import {
	DEFAULT_CHAT_PLACEHOLDER,
	REASONING_OPTIONS,
	extensionForAudioMimeType,
	extractClipboardFiles,
	getRandomPlaceholder,
	getSupportedRecordingMimeType,
} from "./chatConversationHelpers";
import { startChatSendPerformanceRun } from "@/components/(chat)/playground/chat-performance";
import type {
	ChatResponseLayout,
	ModelOption,
} from "@/components/(chat)/playground/chat-playground-core";

export type ChatSendPayload = {
	content: string;
	attachments: File[];
	webSearchEnabled: boolean;
	apiServerToolsEnabled: boolean;
	serverTools: ChatServerToolType[];
	serverToolConfigs: ChatServerToolConfigs;
	performanceRunId?: string | null;
};

type QueuedChatPrompt = Omit<ChatSendPayload, "performanceRunId"> & {
	id: string;
	threadId: string;
};

const RECORDING_WAVEFORM_BAR_COUNT = 96;
const DEFAULT_RECORDING_WAVEFORM = Array.from(
	{ length: RECORDING_WAVEFORM_BAR_COUNT },
	() => 4,
);

function formatRecordingFilename(date = new Date()) {
	const [day = "", time = ""] = date.toISOString().split("T");
	const normalizedTime = time.slice(0, 8).replace(/:/g, "-");
	return `Voice note ${day} ${normalizedTime}`;
}

type ChatConversationProps = {
	activeThread: ChatThread | null;
	isSending: boolean;
	isAuthenticated: boolean;
	temporaryMode?: boolean;
	mode?: "classic" | "unified";
	webSearchEnabled?: boolean;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	apiServerToolsEnabled?: boolean;
	serverTools?: ChatServerToolType[];
	onServerToolsChange?: (tools: ChatServerToolType[]) => void;
	serverToolConfigs?: ChatServerToolConfigs;
	onServerToolConfigsChange?: (configs: ChatServerToolConfigs) => void;
	reasoningEnabled?: boolean;
	reasoningEffort?: ChatSettings["reasoningEffort"];
	onReasoningEnabledChange?: (enabled: boolean) => void;
	onReasoningEffortChange?: (effort: NonNullable<ChatSettings["reasoningEffort"]>) => void;
	presetPrompt?: string;
	onSend: (payload: ChatSendPayload) => boolean | Promise<boolean>;
	onEditMessage: (messageId: string, content: string) => void;
	onRetryAssistant: (messageId: string) => void;
	onBranchAssistant: (messageId: string) => void;
	onSelectVariant: (messageId: string, variantIndex: number) => void;
	orgNameById: Record<string, string>;
	modelDisplayNameById: Record<string, string>;
	modelOrgIdById: Record<string, string>;
	modelLinkById: Record<string, string>;
	accentColor: string;
	selectedModelId: string;
	selectedModelLabel: string;
	selectedModelCount?: number;
	selectedModelsHint?: string;
	selectedModelIds: string[];
	modelOptions: ModelOption[];
	onToggleModel: (modelId: string) => void;
	onAddModelSet: (modelIds: string[]) => void;
	onAudioAttachmentRequirementChange?: (requiresAudioInput: boolean) => void;
	requestError?: ChatRequestErrorDetails | null;
	responseLayout?: ChatResponseLayout;
};

type SendGateType = "auth";

function shouldFocusComposerAfterThreadChange() {
	if (typeof window === "undefined") return false;
	if (typeof window.matchMedia !== "function") return true;
	return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function ChatConversation({
	activeThread,
	isSending,
	isAuthenticated,
	temporaryMode = false,
	mode = "classic",
	webSearchEnabled = false,
	onWebSearchEnabledChange,
	apiServerToolsEnabled = false,
	serverTools = [],
	onServerToolsChange,
	serverToolConfigs = {},
	onServerToolConfigsChange,
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
	modelDisplayNameById,
	modelOrgIdById,
	modelLinkById,
	accentColor,
	selectedModelId,
	selectedModelLabel,
	selectedModelCount = selectedModelId ? 1 : 0,
	selectedModelsHint,
	selectedModelIds,
	modelOptions,
	onToggleModel,
	onAddModelSet,
	onAudioAttachmentRequirementChange,
	requestError = null,
	responseLayout = "sequential",
}: ChatConversationProps) {
	const isUnified = mode === "unified";
	const [composer, setComposer] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [metadataOpenId, setMetadataOpenId] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const scrollViewportRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const audioInputRef = useRef<HTMLInputElement | null>(null);
	const [attachments, setAttachments] = useState<File[]>([]);
	const [queuedPrompts, setQueuedPrompts] = useState<QueuedChatPrompt[]>([]);
	const [editingQueuedPromptIndex, setEditingQueuedPromptIndex] = useState<
		number | null
	>(null);
	const [recordingSupported, setRecordingSupported] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [isStartingRecording, setIsStartingRecording] = useState(false);
	const [recordingWaveformBars, setRecordingWaveformBars] = useState<number[]>(
		DEFAULT_RECORDING_WAVEFORM,
	);
	const [recordingDurationMs, setRecordingDurationMs] = useState(0);
	const [reasoningPickerOpen, setReasoningPickerOpen] = useState(false);
	const [sendGateType, setSendGateType] = useState<SendGateType | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const waveformAnimationRef = useRef<number | null>(null);
	const waveformLastUpdateRef = useRef(0);
	const recordingStartedAtRef = useRef(0);
	const recordingTimerRef = useRef<number | null>(null);
	const recordingChunksRef = useRef<Blob[]>([]);
	const appliedPresetRef = useRef<string | null>(null);

	const [placeholder, setPlaceholder] = useState<string>(
		DEFAULT_CHAT_PLACEHOLDER,
	);

	useEffect(() => {
		setPlaceholder(getRandomPlaceholder());
	}, []);

	useEffect(() => {
		setRecordingSupported(
			typeof MediaRecorder !== "undefined" &&
				typeof navigator.mediaDevices?.getUserMedia === "function",
		);
	}, []);
	const reasoningSelection: NonNullable<ChatSettings["reasoningEffort"]> =
		reasoningEffort ?? "medium";
	const attachmentPreviewUrls = useMemo(
		() =>
			attachments.map((file) =>
				file.type.startsWith("image/") || file.type.startsWith("audio/")
					? URL.createObjectURL(file)
					: null,
			),
		[attachments],
	);

	const activeThreadId = activeThread?.id ?? null;
	const lastMessageId =
		activeThread?.messages[activeThread.messages.length - 1]?.id ?? null;

	useEffect(() => {
		const raf = requestAnimationFrame(() => {
			setComposer("");
			setAttachments([]);
			setQueuedPrompts([]);
			setEditingQueuedPromptIndex(null);
			if (shouldFocusComposerAfterThreadChange()) {
				textareaRef.current?.focus();
			}
		});
		return () => cancelAnimationFrame(raf);
	}, [activeThreadId]);

	useEffect(() => {
		const requiresAudioInput = attachments.some((attachment) =>
			attachment.type.startsWith("audio/"),
		);
		onAudioAttachmentRequirementChange?.(requiresAudioInput);
	}, [attachments, onAudioAttachmentRequirementChange]);

	const stopWaveformAnalysis = useCallback(() => {
		if (waveformAnimationRef.current !== null) {
			cancelAnimationFrame(waveformAnimationRef.current);
			waveformAnimationRef.current = null;
		}
		void audioContextRef.current?.close().catch(() => undefined);
		audioContextRef.current = null;
		waveformLastUpdateRef.current = 0;
		setRecordingWaveformBars(DEFAULT_RECORDING_WAVEFORM);
	}, []);

	const stopRecordingTimer = useCallback(() => {
		if (recordingTimerRef.current !== null) {
			window.clearInterval(recordingTimerRef.current);
			recordingTimerRef.current = null;
		}
		recordingStartedAtRef.current = 0;
		setRecordingDurationMs(0);
	}, []);

	const startRecordingTimer = useCallback(() => {
		stopRecordingTimer();
		recordingStartedAtRef.current = performance.now();
		setRecordingDurationMs(0);
		recordingTimerRef.current = window.setInterval(() => {
			setRecordingDurationMs(performance.now() - recordingStartedAtRef.current);
		}, 200);
	}, [stopRecordingTimer]);

	const startWaveformAnalysis = useCallback(
		(stream: MediaStream) => {
			stopWaveformAnalysis();
			const AudioContextConstructor =
				window.AudioContext ??
				(window as typeof window & { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (!AudioContextConstructor) return;

			try {
				const audioContext = new AudioContextConstructor();
				const analyser = audioContext.createAnalyser();
				analyser.fftSize = 512;
				analyser.smoothingTimeConstant = 0.72;
				audioContext.createMediaStreamSource(stream).connect(analyser);
				audioContextRef.current = audioContext;

				const samples = new Uint8Array(analyser.fftSize);
				const tick = (timestamp: number) => {
					analyser.getByteTimeDomainData(samples);
					if (timestamp - waveformLastUpdateRef.current >= 58) {
						let total = 0;
						for (const sample of samples) {
							const centered = (sample - 128) / 128;
							total += centered * centered;
						}
						const rms = Math.sqrt(total / samples.length);
						const nextHeight = Math.max(4, Math.min(30, 4 + rms * 96));
						setRecordingWaveformBars((prev) => [
							...prev.slice(1),
							Math.round(nextHeight),
						]);
						waveformLastUpdateRef.current = timestamp;
					}
					waveformAnimationRef.current = requestAnimationFrame(tick);
				};
				waveformAnimationRef.current = requestAnimationFrame(tick);
			} catch (error) {
				console.error("Audio waveform analysis failed", error);
			}
		},
		[stopWaveformAnalysis],
	);

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
		stopWaveformAnalysis();
		stopRecordingTimer();
		setIsRecording(false);
		setIsStartingRecording(false);
	}, [stopRecordingTimer, stopWaveformAnalysis]);

	const startRecording = useCallback(async () => {
		if (!recordingSupported) return;
		setIsStartingRecording(true);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			mediaStreamRef.current = stream;
			startRecordingTimer();
			startWaveformAnalysis(stream);
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
						`${formatRecordingFilename()}.${extension}`,
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
				stopWaveformAnalysis();
				stopRecordingTimer();
				setIsRecording(false);
			};
			recorder.start(200);
			setIsRecording(true);
		} catch (error) {
			console.error("Audio recording failed", error);
			setRecordingSupported(false);
			stopWaveformAnalysis();
			stopRecordingTimer();
			audioInputRef.current?.click();
			setIsRecording(false);
		} finally {
			setIsStartingRecording(false);
		}
	}, [
		recordingSupported,
		startRecordingTimer,
		startWaveformAnalysis,
		stopRecordingTimer,
		stopWaveformAnalysis,
	]);

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
			stopWaveformAnalysis();
			stopRecordingTimer();
		};
	}, [stopRecordingTimer, stopWaveformAnalysis]);

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
						' [data-state="open"][data-radix-popper-content-wrapper],' +
						' [data-slot="dialog-content"]',
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
						' [data-state="open"][data-radix-popper-content-wrapper],' +
						' [data-slot="dialog-content"]',
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
		const value = text ?? "";
		if (!value.trim()) return false;
		try {
			await navigator.clipboard.writeText(value);
			return true;
		} catch {
			// fall through to legacy fallback
		}
		try {
			const textArea = document.createElement("textarea");
			textArea.value = value;
			textArea.setAttribute("readonly", "");
			textArea.style.position = "fixed";
			textArea.style.left = "-9999px";
			textArea.style.top = "0";
			textArea.style.opacity = "0";
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			textArea.setSelectionRange(0, textArea.value.length);
			const copied = document.execCommand("copy");
			document.body.removeChild(textArea);
			return copied;
		} catch {
			return false;
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

	const handleSelectEvaluationPrompt = useCallback((prompt: string) => {
		setComposer(prompt);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
		});
	}, []);

	const buildQueuedPrompt = useCallback(
		(content: string, queuedAttachments: File[]): QueuedChatPrompt | null => {
			if (!activeThreadId) return null;
			return {
				id: crypto.randomUUID(),
				threadId: activeThreadId,
				content,
				attachments: queuedAttachments,
				webSearchEnabled: isUnified ? webSearchEnabled : false,
				apiServerToolsEnabled: isUnified ? apiServerToolsEnabled : false,
				serverTools: isUnified ? serverTools : [],
				serverToolConfigs: isUnified ? serverToolConfigs : {},
			};
		},
		[
			activeThreadId,
			apiServerToolsEnabled,
			isUnified,
			serverToolConfigs,
			serverTools,
			webSearchEnabled,
		],
	);

	const sendPrompt = useCallback(
		async (prompt: QueuedChatPrompt) => {
			const performanceRunId = startChatSendPerformanceRun({
				contentLength: prompt.content.length,
				attachmentCount: prompt.attachments.length,
			});
			try {
				return await onSend({
					content: prompt.content,
					attachments: prompt.attachments,
					webSearchEnabled: prompt.webSearchEnabled,
					apiServerToolsEnabled: prompt.apiServerToolsEnabled,
					serverTools: prompt.serverTools,
					serverToolConfigs: prompt.serverToolConfigs,
					performanceRunId,
				});
			} catch {
				return false;
			}
		},
		[onSend],
	);

	const queueDrainInFlightRef = useRef(false);

	useEffect(() => {
		if (isSending) {
			queueDrainInFlightRef.current = false;
			return;
		}
		if (
			queueDrainInFlightRef.current ||
			!activeThreadId ||
			queuedPrompts.length === 0 ||
			(editingQueuedPromptIndex !== null && editingQueuedPromptIndex <= 0)
		) {
			return;
		}
		const nextPrompt = queuedPrompts[0];
		if (!nextPrompt || nextPrompt.threadId !== activeThreadId) return;
		queueDrainInFlightRef.current = true;
		queueMicrotask(() => {
			void (async () => {
				const accepted = await sendPrompt(nextPrompt);
				if (!accepted) {
					queueDrainInFlightRef.current = false;
					return;
				}
				setQueuedPrompts((prev) =>
					prev[0]?.id === nextPrompt.id
						? prev.slice(1)
						: prev.filter((prompt) => prompt.id !== nextPrompt.id),
				);
				setEditingQueuedPromptIndex((prev) =>
					prev === null ? null : Math.max(0, prev - 1),
				);
			})();
		});
	}, [
		activeThreadId,
		editingQueuedPromptIndex,
		isSending,
		queuedPrompts,
		sendPrompt,
	]);

	const handleSubmit = () => {
		const text = composer.trim();
		if (!text && attachments.length === 0) return;
		const hasSelectedModel =
			selectedModelIds.length > 0 ||
			selectedModelCount > 0 ||
			Boolean(selectedModelId);
		if (!hasSelectedModel) return;
		if (!isAuthenticated) {
			setSendGateType("auth");
			return;
		}
		setSendGateType(null);
		const nextPrompt = buildQueuedPrompt(text, attachments);
		if (!nextPrompt) return;
		if (isSending) {
			setQueuedPrompts((prev) => {
				if (editingQueuedPromptIndex === null) {
					return [...prev, nextPrompt];
				}
				const next = [...prev];
				next.splice(
					Math.min(editingQueuedPromptIndex, next.length),
					0,
					nextPrompt,
				);
				return next;
			});
		} else {
			void sendPrompt(nextPrompt);
		}
		setEditingQueuedPromptIndex(null);
		setComposer("");
		setAttachments([]);
	};

	const handleEditQueuedPrompt = (id: string) => {
		const promptIndex = queuedPrompts.findIndex((prompt) => prompt.id === id);
		if (promptIndex === -1) return;
		const prompt = queuedPrompts[promptIndex];
		setQueuedPrompts((prev) =>
			prev.filter((candidate) => candidate.id !== id),
		);
		setComposer(prompt.content);
		setAttachments(prompt.attachments);
		setEditingQueuedPromptIndex(promptIndex);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
		});
	};

	const handleReorderQueuedPrompt = useCallback(
		(activeId: string, targetId: string) => {
			setQueuedPrompts((prev) => {
				const activeIndex = prev.findIndex((prompt) => prompt.id === activeId);
				const targetIndex = prev.findIndex((prompt) => prompt.id === targetId);
				if (
					activeIndex === -1 ||
					targetIndex === -1 ||
					activeIndex === targetIndex
				) {
					return prev;
				}
				const next = [...prev];
				const [activePrompt] = next.splice(activeIndex, 1);
				if (!activePrompt) return prev;
				next.splice(targetIndex, 0, activePrompt);
				return next;
			});
		},
		[],
	);

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
	}, [
		isRecording,
		isStartingRecording,
		recordingSupported,
		startRecording,
		stopRecording,
	]);
	const effectiveSendGateType =
		isAuthenticated && sendGateType === "auth" ? null : sendGateType;
	const hasNoMessages = (activeThread?.messages.length ?? 0) === 0;
	const promptHistory = useMemo(
		() =>
			(activeThread?.messages ?? [])
				.filter((message) => message.role === "user" && message.content.trim())
				.map((message) => message.content),
		[activeThread?.messages],
	);

	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<MessageScroller.Provider
				autoScroll
				defaultScrollPosition="end"
				scrollEdgeThreshold={48}
				scrollMargin={24}
			>
				<MessageScroller.Root className="relative flex min-h-0 flex-1 overflow-hidden overscroll-contain">
					<MessageScroller.Viewport
						ref={scrollViewportRef}
						className="h-full w-full overflow-y-auto overscroll-contain"
					>
						<MessageScroller.Content
							className={`mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8 ${hasNoMessages ? "min-h-full" : ""}`}
						>
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
								modelDisplayNameById={modelDisplayNameById}
								modelOrgIdById={modelOrgIdById}
								modelLinkById={modelLinkById}
								accentColor={accentColor}
								onEditMessage={onEditMessage}
								onRetryAssistant={onRetryAssistant}
								onBranchAssistant={onBranchAssistant}
								onSelectVariant={onSelectVariant}
								onCopy={handleCopy}
								requestError={requestError}
								scrollViewportRef={scrollViewportRef}
								responseLayout={responseLayout}
								modelOrderIds={selectedModelIds}
								modelOptions={modelOptions}
								selectedModelIds={selectedModelIds}
								onAddModelSet={onAddModelSet}
								temporaryMode={temporaryMode}
							/>
						</MessageScroller.Content>
					</MessageScroller.Viewport>
					<MessageScroller.Button
						aria-label="Scroll to latest message"
						className="absolute bottom-4 left-1/2 z-20 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=false]:pointer-events-none data-[active=false]:opacity-0"
						direction="end"
					>
						<ArrowDown className="h-4 w-4" />
					</MessageScroller.Button>
				</MessageScroller.Root>
			</MessageScroller.Provider>
			<ChatConversationComposer
				sendGateType={effectiveSendGateType}
				isSending={isSending}
				composer={composer}
				promptHistory={promptHistory}
				attachments={attachments}
				attachmentPreviewUrls={attachmentPreviewUrls}
				placeholder={placeholder}
				textareaRef={textareaRef}
				fileInputRef={fileInputRef}
				audioInputRef={audioInputRef}
				isUnified={isUnified}
				accentColor={accentColor}
				webSearchEnabled={webSearchEnabled}
				onWebSearchEnabledChange={onWebSearchEnabledChange}
				serverTools={serverTools}
				onServerToolsChange={onServerToolsChange}
				serverToolConfigs={serverToolConfigs}
				onServerToolConfigsChange={onServerToolConfigsChange}
				showEvaluationPrompts={hasNoMessages}
				reasoningEnabled={reasoningEnabled}
				reasoningPickerOpen={reasoningPickerOpen}
				onReasoningPickerOpenChange={setReasoningPickerOpen}
				reasoningSelection={reasoningSelection}
				reasoningOptions={REASONING_OPTIONS}
				onReasoningSelection={applyReasoningSelection}
				selectedModelCount={selectedModelCount}
				selectedModelsHint={selectedModelsHint}
				selectedModelIds={selectedModelIds}
				selectedModelId={selectedModelId}
				selectedModelLabel={selectedModelLabel}
				modelOptions={modelOptions}
				isRecording={isRecording}
				recordingWaveformBars={recordingWaveformBars}
				recordingDurationMs={recordingDurationMs}
				isStartingRecording={isStartingRecording}
				recordingSupported={recordingSupported}
				onToggleRecording={toggleRecording}
				onToggleModel={onToggleModel}
				onSubmit={handleSubmit}
				queuedPrompts={queuedPrompts.map((prompt) => ({
					id: prompt.id,
					content: prompt.content,
					attachmentCount: prompt.attachments.length,
				}))}
				onRemoveQueuedPrompt={(id) =>
					setQueuedPrompts((prev) =>
						prev.filter((prompt) => prompt.id !== id),
					)
				}
				onEditQueuedPrompt={handleEditQueuedPrompt}
				onReorderQueuedPrompt={handleReorderQueuedPrompt}
				onSelectEvaluationPrompt={handleSelectEvaluationPrompt}
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
