"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatConversationComposer } from "@/components/(chat)/ChatConversationComposer";
import { ChatConversationMessages } from "@/components/(chat)/ChatConversationMessages";
import type { ChatRequestErrorDetails } from "@/components/(chat)/ChatRequestErrorNotice";
import type {
	ChatServerToolAdvisor,
	ChatSettings,
	ChatThread,
} from "@/lib/indexeddb/chats";
import { Square } from "lucide-react";
import {
	REASONING_OPTIONS,
	extensionForAudioMimeType,
	extractClipboardFiles,
	getRandomPlaceholder,
	getSupportedRecordingMimeType,
	sanitizeAttachmentMediaUrl,
} from "./chatConversationHelpers";
import { shouldShowEvaluationPrompts } from "./chatConversationPrompts";

export type ChatSendPayload = {
	content: string;
	attachments: File[];
	webSearchEnabled: boolean;
	serverToolWebSearchEngine: string;
	serverToolWebSearchContextSize: "low" | "medium" | "high";
	serverToolWebSearchMaxResults: number | null;
	serverToolWebSearchMaxTotalResults: number | null;
	serverToolWebSearchMaxCharacters: number | null;
	serverToolWebSearchAllowedDomains: string;
	serverToolWebSearchBlockedDomains: string;
	apiServerToolsEnabled: boolean;
	serverToolTimezone: string;
	serverToolWebFetchEnabled: boolean;
	serverToolWebFetchEngine: string;
	serverToolWebFetchMaxContentTokens: number | null;
	serverToolWebFetchAllowedDomains: string;
	serverToolWebFetchBlockedDomains: string;
	serverToolAdvisorEnabled: boolean;
	serverToolAdvisors: ChatServerToolAdvisor[];
	serverToolImageGenerationEnabled: boolean;
	serverToolImageGenerationModel: string;
	serverToolImageGenerationQuality: string;
	serverToolImageGenerationAspectRatio: string;
	serverToolImageGenerationSize: string;
	serverToolImageGenerationBackground: string;
	serverToolImageGenerationOutputFormat: string;
	serverToolImageGenerationOutputCompression: number | null;
	serverToolImageGenerationModeration: string;
	serverToolSubagentEnabled: boolean;
	serverToolSubagentModel: string;
	serverToolSubagentInstructions: string;
	serverToolSubagentMaxUses: number | null;
	serverToolFusionEnabled: boolean;
	serverToolFusionAnalysisModels: string[];
	serverToolFusionJudgeModel: string;
	serverToolFusionMaxUses: number | null;
};

export type ServerToolModelChoice = {
	id: string;
	label: string;
	orgId: string;
	orgName: string;
	releaseDate?: string | null;
};

type ChatConversationProps = {
	activeThread: ChatThread | null;
	temporaryMode?: boolean;
	isSending: boolean;
	isAuthenticated: boolean;
	mode?: "classic" | "unified";
	webSearchEnabled?: boolean;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	serverToolWebSearchEngine?: string;
	onServerToolWebSearchEngineChange?: (engine: string) => void;
	serverToolWebSearchContextSize?: "low" | "medium" | "high";
	onServerToolWebSearchContextSizeChange?: (
		contextSize: "low" | "medium" | "high",
	) => void;
	serverToolWebSearchMaxResults?: number | null;
	onServerToolWebSearchMaxResultsChange?: (maxResults: number | null) => void;
	serverToolWebSearchMaxTotalResults?: number | null;
	onServerToolWebSearchMaxTotalResultsChange?: (
		maxTotalResults: number | null,
	) => void;
	serverToolWebSearchMaxCharacters?: number | null;
	onServerToolWebSearchMaxCharactersChange?: (
		maxCharacters: number | null,
	) => void;
	serverToolWebSearchAllowedDomains?: string;
	onServerToolWebSearchAllowedDomainsChange?: (domains: string) => void;
	serverToolWebSearchBlockedDomains?: string;
	onServerToolWebSearchBlockedDomainsChange?: (domains: string) => void;
	apiServerToolsEnabled?: boolean;
	onApiServerToolsEnabledChange?: (enabled: boolean) => void;
	serverToolTimezone?: string;
	onServerToolTimezoneChange?: (timezone: string) => void;
	serverToolWebFetchEnabled?: boolean;
	onServerToolWebFetchEnabledChange?: (enabled: boolean) => void;
	serverToolWebFetchEngine?: string;
	onServerToolWebFetchEngineChange?: (engine: string) => void;
	serverToolWebFetchMaxContentTokens?: number | null;
	onServerToolWebFetchMaxContentTokensChange?: (
		maxContentTokens: number | null,
	) => void;
	serverToolWebFetchAllowedDomains?: string;
	onServerToolWebFetchAllowedDomainsChange?: (domains: string) => void;
	serverToolWebFetchBlockedDomains?: string;
	onServerToolWebFetchBlockedDomainsChange?: (domains: string) => void;
	serverToolAdvisorEnabled?: boolean;
	onServerToolAdvisorEnabledChange?: (enabled: boolean) => void;
	serverToolAdvisors?: ChatServerToolAdvisor[];
	onServerToolAdvisorsChange?: (advisors: ChatServerToolAdvisor[]) => void;
	serverToolImageGenerationEnabled?: boolean;
	onServerToolImageGenerationEnabledChange?: (enabled: boolean) => void;
	serverToolImageGenerationModel?: string;
	onServerToolImageGenerationModelChange?: (model: string) => void;
	serverToolImageGenerationQuality?: string;
	onServerToolImageGenerationQualityChange?: (quality: string) => void;
	serverToolImageGenerationAspectRatio?: string;
	onServerToolImageGenerationAspectRatioChange?: (aspectRatio: string) => void;
	serverToolImageGenerationSize?: string;
	onServerToolImageGenerationSizeChange?: (size: string) => void;
	serverToolImageGenerationBackground?: string;
	onServerToolImageGenerationBackgroundChange?: (background: string) => void;
	serverToolImageGenerationOutputFormat?: string;
	onServerToolImageGenerationOutputFormatChange?: (format: string) => void;
	serverToolImageGenerationOutputCompression?: number | null;
	onServerToolImageGenerationOutputCompressionChange?: (
		compression: number | null,
	) => void;
	serverToolImageGenerationModeration?: string;
	onServerToolImageGenerationModerationChange?: (moderation: string) => void;
	serverToolSubagentEnabled?: boolean;
	onServerToolSubagentEnabledChange?: (enabled: boolean) => void;
	serverToolSubagentModel?: string;
	onServerToolSubagentModelChange?: (model: string) => void;
	serverToolSubagentInstructions?: string;
	onServerToolSubagentInstructionsChange?: (instructions: string) => void;
	serverToolSubagentMaxUses?: number | null;
	onServerToolSubagentMaxUsesChange?: (maxUses: number | null) => void;
	serverToolFusionEnabled?: boolean;
	onServerToolFusionEnabledChange?: (enabled: boolean) => void;
	serverToolFusionAnalysisModels?: string[];
	onServerToolFusionAnalysisModelsChange?: (models: string[]) => void;
	serverToolFusionJudgeModel?: string;
	onServerToolFusionJudgeModelChange?: (model: string) => void;
	serverToolFusionMaxUses?: number | null;
	onServerToolFusionMaxUsesChange?: (maxUses: number | null) => void;
	serverToolModelChoices?: ServerToolModelChoice[];
	serverToolLatestModelChoices?: ServerToolModelChoice[];
	serverToolImageGenerationModelChoices?: ServerToolModelChoice[];
	serverToolImageGenerationLatestModelChoices?: ServerToolModelChoice[];
	contextMessageLimit?: ChatSettings["contextMessageLimit"];
	onContextMessageLimitChange?: (
		limit: NonNullable<ChatSettings["contextMessageLimit"]>,
	) => void;
	reasoningEnabled?: boolean;
	reasoningEffort?: ChatSettings["reasoningEffort"];
	supportedReasoningEfforts?: Array<
		NonNullable<ChatSettings["reasoningEffort"]>
	>;
	onReasoningEnabledChange?: (enabled: boolean) => void;
	onReasoningEffortChange?: (effort: NonNullable<ChatSettings["reasoningEffort"]>) => void;
	presetPrompt?: string;
	onSend: (payload: ChatSendPayload) => void;
	onEditMessage: (messageId: string, content: string) => void;
	onRetryAssistant: (messageId: string) => void;
	onBranchAssistant: (messageId: string) => void;
	onSelectVariant: (messageId: string, variantIndex: number) => void;
	orgNameById: Record<string, string>;
	modelDisplayNameById: Record<string, string>;
	modelOrgIdById: Record<string, string>;
	modelLinkById: Record<string, string>;
	modelDefaultProviderById?: Record<string, { id: string; name: string }>;
	accentColor: string;
	onAudioAttachmentRequirementChange?: (requiresAudioInput: boolean) => void;
	requestError?: ChatRequestErrorDetails | null;
};

type SendGateType = "auth";

export function ChatConversation({
	activeThread,
	temporaryMode = false,
	isSending,
	isAuthenticated,
	mode = "classic",
	webSearchEnabled = false,
	onWebSearchEnabledChange,
	serverToolWebSearchEngine = "auto",
	onServerToolWebSearchEngineChange,
	serverToolWebSearchContextSize = "medium",
	onServerToolWebSearchContextSizeChange,
	serverToolWebSearchMaxResults = null,
	onServerToolWebSearchMaxResultsChange,
	serverToolWebSearchMaxTotalResults = null,
	onServerToolWebSearchMaxTotalResultsChange,
	serverToolWebSearchMaxCharacters = null,
	onServerToolWebSearchMaxCharactersChange,
	serverToolWebSearchAllowedDomains = "",
	onServerToolWebSearchAllowedDomainsChange,
	serverToolWebSearchBlockedDomains = "",
	onServerToolWebSearchBlockedDomainsChange,
	apiServerToolsEnabled = false,
	onApiServerToolsEnabledChange,
	serverToolTimezone = "",
	onServerToolTimezoneChange,
	serverToolWebFetchEnabled = false,
	onServerToolWebFetchEnabledChange,
	serverToolWebFetchEngine = "auto",
	onServerToolWebFetchEngineChange,
	serverToolWebFetchMaxContentTokens = null,
	onServerToolWebFetchMaxContentTokensChange,
	serverToolWebFetchAllowedDomains = "",
	onServerToolWebFetchAllowedDomainsChange,
	serverToolWebFetchBlockedDomains = "",
	onServerToolWebFetchBlockedDomainsChange,
	serverToolAdvisorEnabled = false,
	onServerToolAdvisorEnabledChange,
	serverToolAdvisors = [],
	onServerToolAdvisorsChange,
	serverToolImageGenerationEnabled = false,
	onServerToolImageGenerationEnabledChange,
	serverToolImageGenerationModel = "",
	onServerToolImageGenerationModelChange,
	serverToolImageGenerationQuality = "auto",
	onServerToolImageGenerationQualityChange,
	serverToolImageGenerationAspectRatio = "auto",
	onServerToolImageGenerationAspectRatioChange,
	serverToolImageGenerationSize = "auto",
	onServerToolImageGenerationSizeChange,
	serverToolImageGenerationBackground = "auto",
	onServerToolImageGenerationBackgroundChange,
	serverToolImageGenerationOutputFormat = "auto",
	onServerToolImageGenerationOutputFormatChange,
	serverToolImageGenerationOutputCompression = null,
	onServerToolImageGenerationOutputCompressionChange,
	serverToolImageGenerationModeration = "auto",
	onServerToolImageGenerationModerationChange,
	serverToolSubagentEnabled = false,
	onServerToolSubagentEnabledChange,
	serverToolSubagentModel = "",
	onServerToolSubagentModelChange,
	serverToolSubagentInstructions = "",
	onServerToolSubagentInstructionsChange,
	serverToolSubagentMaxUses = null,
	onServerToolSubagentMaxUsesChange,
	serverToolFusionEnabled = false,
	onServerToolFusionEnabledChange,
	serverToolFusionAnalysisModels = [],
	onServerToolFusionAnalysisModelsChange,
	serverToolFusionJudgeModel = "",
	onServerToolFusionJudgeModelChange,
	serverToolFusionMaxUses = null,
	onServerToolFusionMaxUsesChange,
	serverToolModelChoices = [],
	serverToolLatestModelChoices = [],
	serverToolImageGenerationModelChoices = [],
	serverToolImageGenerationLatestModelChoices = [],
	contextMessageLimit = 10,
	onContextMessageLimitChange,
	reasoningEnabled = false,
	reasoningEffort = "medium",
	supportedReasoningEfforts = REASONING_OPTIONS.map((option) => option.value),
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
	modelDefaultProviderById = {},
	accentColor,
	onAudioAttachmentRequirementChange,
	requestError = null,
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
	const [hasSubmittedMessage, setHasSubmittedMessage] = useState(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const recordingChunksRef = useRef<Blob[]>([]);
	const appliedPresetRef = useRef<string | null>(null);

	const placeholder = useMemo(() => {
		return getRandomPlaceholder(activeThread?.id ?? "new-chat");
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
			setHasSubmittedMessage(false);
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
			// react-doctor-disable-next-line
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
			onReasoningEnabledChange?.(value !== "none");
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

	const handleSubmit = () => {
		if (isSending) return;
		const text = composer.trim();
		if (!text && attachments.length === 0) return;
		if (!isAuthenticated) {
			setSendGateType("auth");
			return;
		}
		setSendGateType(null);
		setHasSubmittedMessage(true);
		onSend({
			content: text,
			attachments,
			webSearchEnabled: isUnified ? webSearchEnabled : false,
			serverToolWebSearchEngine: isUnified
				? serverToolWebSearchEngine
				: "auto",
			serverToolWebSearchContextSize: isUnified
				? serverToolWebSearchContextSize
				: "medium",
			serverToolWebSearchMaxResults: isUnified
				? serverToolWebSearchMaxResults
				: null,
			serverToolWebSearchMaxTotalResults: isUnified
				? serverToolWebSearchMaxTotalResults
				: null,
			serverToolWebSearchMaxCharacters: isUnified
				? serverToolWebSearchMaxCharacters
				: null,
			serverToolWebSearchAllowedDomains: isUnified
				? serverToolWebSearchAllowedDomains
				: "",
			serverToolWebSearchBlockedDomains: isUnified
				? serverToolWebSearchBlockedDomains
				: "",
			apiServerToolsEnabled: isUnified ? apiServerToolsEnabled : false,
			serverToolTimezone: isUnified ? serverToolTimezone : "",
			serverToolWebFetchEnabled: isUnified
				? serverToolWebFetchEnabled
				: false,
			serverToolWebFetchEngine: isUnified ? serverToolWebFetchEngine : "auto",
			serverToolWebFetchMaxContentTokens: isUnified
				? serverToolWebFetchMaxContentTokens
				: null,
			serverToolWebFetchAllowedDomains: isUnified
				? serverToolWebFetchAllowedDomains
				: "",
			serverToolWebFetchBlockedDomains: isUnified
				? serverToolWebFetchBlockedDomains
				: "",
			serverToolAdvisorEnabled: isUnified ? serverToolAdvisorEnabled : false,
			serverToolAdvisors: isUnified ? serverToolAdvisors : [],
			serverToolImageGenerationEnabled: isUnified
				? serverToolImageGenerationEnabled
				: false,
			serverToolImageGenerationModel: isUnified
				? serverToolImageGenerationModel
				: "",
			serverToolImageGenerationQuality: isUnified
				? serverToolImageGenerationQuality
				: "auto",
			serverToolImageGenerationAspectRatio: isUnified
				? serverToolImageGenerationAspectRatio
				: "auto",
			serverToolImageGenerationSize: isUnified
				? serverToolImageGenerationSize
				: "auto",
			serverToolImageGenerationBackground: isUnified
				? serverToolImageGenerationBackground
				: "auto",
			serverToolImageGenerationOutputFormat: isUnified
				? serverToolImageGenerationOutputFormat
				: "auto",
			serverToolImageGenerationOutputCompression: isUnified
				? serverToolImageGenerationOutputCompression
				: null,
			serverToolImageGenerationModeration: isUnified
				? serverToolImageGenerationModeration
				: "auto",
			serverToolSubagentEnabled: isUnified
				? serverToolSubagentEnabled
				: false,
			serverToolSubagentModel: isUnified ? serverToolSubagentModel : "",
			serverToolSubagentInstructions: isUnified
				? serverToolSubagentInstructions
				: "",
			serverToolSubagentMaxUses: isUnified
				? serverToolSubagentMaxUses
				: null,
			serverToolFusionEnabled: isUnified ? serverToolFusionEnabled : false,
			serverToolFusionAnalysisModels: isUnified
				? serverToolFusionAnalysisModels
				: [],
			serverToolFusionJudgeModel: isUnified ? serverToolFusionJudgeModel : "",
			serverToolFusionMaxUses: isUnified ? serverToolFusionMaxUses : null,
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
			<ScrollArea className="flex-1 overscroll-contain" ref={scrollAreaRef}>
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
						temporaryMode={temporaryMode}
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
						modelDefaultProviderById={modelDefaultProviderById}
						accentColor={accentColor}
						onEditMessage={onEditMessage}
						onRetryAssistant={onRetryAssistant}
						onBranchAssistant={onBranchAssistant}
						onSelectVariant={onSelectVariant}
						onCopy={handleCopy}
						requestError={requestError}
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
				temporaryMode={temporaryMode}
				webSearchEnabled={webSearchEnabled}
				onWebSearchEnabledChange={onWebSearchEnabledChange}
				serverToolWebSearchEngine={serverToolWebSearchEngine}
				onServerToolWebSearchEngineChange={
					onServerToolWebSearchEngineChange
				}
				serverToolWebSearchContextSize={serverToolWebSearchContextSize}
				onServerToolWebSearchContextSizeChange={
					onServerToolWebSearchContextSizeChange
				}
				serverToolWebSearchMaxResults={serverToolWebSearchMaxResults}
				onServerToolWebSearchMaxResultsChange={
					onServerToolWebSearchMaxResultsChange
				}
				serverToolWebSearchMaxTotalResults={
					serverToolWebSearchMaxTotalResults
				}
				onServerToolWebSearchMaxTotalResultsChange={
					onServerToolWebSearchMaxTotalResultsChange
				}
				serverToolWebSearchMaxCharacters={serverToolWebSearchMaxCharacters}
				onServerToolWebSearchMaxCharactersChange={
					onServerToolWebSearchMaxCharactersChange
				}
				serverToolWebSearchAllowedDomains={
					serverToolWebSearchAllowedDomains
				}
				onServerToolWebSearchAllowedDomainsChange={
					onServerToolWebSearchAllowedDomainsChange
				}
				serverToolWebSearchBlockedDomains={
					serverToolWebSearchBlockedDomains
				}
				onServerToolWebSearchBlockedDomainsChange={
					onServerToolWebSearchBlockedDomainsChange
				}
				apiServerToolsEnabled={apiServerToolsEnabled}
				onApiServerToolsEnabledChange={onApiServerToolsEnabledChange}
				serverToolTimezone={serverToolTimezone}
				onServerToolTimezoneChange={onServerToolTimezoneChange}
				serverToolWebFetchEnabled={serverToolWebFetchEnabled}
				onServerToolWebFetchEnabledChange={
					onServerToolWebFetchEnabledChange
				}
				serverToolWebFetchEngine={serverToolWebFetchEngine}
				onServerToolWebFetchEngineChange={
					onServerToolWebFetchEngineChange
				}
				serverToolWebFetchMaxContentTokens={
					serverToolWebFetchMaxContentTokens
				}
				onServerToolWebFetchMaxContentTokensChange={
					onServerToolWebFetchMaxContentTokensChange
				}
				serverToolWebFetchAllowedDomains={
					serverToolWebFetchAllowedDomains
				}
				onServerToolWebFetchAllowedDomainsChange={
					onServerToolWebFetchAllowedDomainsChange
				}
				serverToolWebFetchBlockedDomains={
					serverToolWebFetchBlockedDomains
				}
				onServerToolWebFetchBlockedDomainsChange={
					onServerToolWebFetchBlockedDomainsChange
				}
				serverToolAdvisorEnabled={serverToolAdvisorEnabled}
				onServerToolAdvisorEnabledChange={
					onServerToolAdvisorEnabledChange
				}
				serverToolAdvisors={serverToolAdvisors}
				onServerToolAdvisorsChange={onServerToolAdvisorsChange}
				serverToolImageGenerationEnabled={
					serverToolImageGenerationEnabled
				}
				onServerToolImageGenerationEnabledChange={
					onServerToolImageGenerationEnabledChange
				}
				serverToolImageGenerationModel={serverToolImageGenerationModel}
				onServerToolImageGenerationModelChange={
					onServerToolImageGenerationModelChange
				}
				serverToolImageGenerationQuality={serverToolImageGenerationQuality}
				onServerToolImageGenerationQualityChange={
					onServerToolImageGenerationQualityChange
				}
				serverToolImageGenerationAspectRatio={
					serverToolImageGenerationAspectRatio
				}
				onServerToolImageGenerationAspectRatioChange={
					onServerToolImageGenerationAspectRatioChange
				}
				serverToolImageGenerationSize={serverToolImageGenerationSize}
				onServerToolImageGenerationSizeChange={
					onServerToolImageGenerationSizeChange
				}
				serverToolImageGenerationBackground={
					serverToolImageGenerationBackground
				}
				onServerToolImageGenerationBackgroundChange={
					onServerToolImageGenerationBackgroundChange
				}
				serverToolImageGenerationOutputFormat={
					serverToolImageGenerationOutputFormat
				}
				onServerToolImageGenerationOutputFormatChange={
					onServerToolImageGenerationOutputFormatChange
				}
				serverToolImageGenerationOutputCompression={
					serverToolImageGenerationOutputCompression
				}
				onServerToolImageGenerationOutputCompressionChange={
					onServerToolImageGenerationOutputCompressionChange
				}
				serverToolImageGenerationModeration={
					serverToolImageGenerationModeration
				}
				onServerToolImageGenerationModerationChange={
					onServerToolImageGenerationModerationChange
				}
				serverToolSubagentEnabled={serverToolSubagentEnabled}
				onServerToolSubagentEnabledChange={
					onServerToolSubagentEnabledChange
				}
				serverToolSubagentModel={serverToolSubagentModel}
				onServerToolSubagentModelChange={
					onServerToolSubagentModelChange
				}
				serverToolSubagentInstructions={serverToolSubagentInstructions}
				onServerToolSubagentInstructionsChange={
					onServerToolSubagentInstructionsChange
				}
				serverToolSubagentMaxUses={serverToolSubagentMaxUses}
				onServerToolSubagentMaxUsesChange={
					onServerToolSubagentMaxUsesChange
				}
				serverToolFusionEnabled={serverToolFusionEnabled}
				onServerToolFusionEnabledChange={
					onServerToolFusionEnabledChange
				}
				serverToolFusionAnalysisModels={
					serverToolFusionAnalysisModels
				}
				onServerToolFusionAnalysisModelsChange={
					onServerToolFusionAnalysisModelsChange
				}
				serverToolFusionJudgeModel={serverToolFusionJudgeModel}
				onServerToolFusionJudgeModelChange={
					onServerToolFusionJudgeModelChange
				}
				serverToolFusionMaxUses={serverToolFusionMaxUses}
				onServerToolFusionMaxUsesChange={
					onServerToolFusionMaxUsesChange
				}
				serverToolModelChoices={serverToolModelChoices}
				serverToolLatestModelChoices={serverToolLatestModelChoices}
				serverToolImageGenerationModelChoices={
					serverToolImageGenerationModelChoices
				}
				serverToolImageGenerationLatestModelChoices={
					serverToolImageGenerationLatestModelChoices
				}
				contextMessageLimit={contextMessageLimit}
				onContextMessageLimitChange={onContextMessageLimitChange}
				showEvaluationPrompts={shouldShowEvaluationPrompts(
					activeThread?.messages.length ?? 0,
					hasSubmittedMessage,
				)}
				reasoningEnabled={reasoningEnabled}
				reasoningPickerOpen={reasoningPickerOpen}
				onReasoningPickerOpenChange={setReasoningPickerOpen}
				reasoningSelection={reasoningSelection}
				reasoningOptions={REASONING_OPTIONS}
				supportedReasoningEfforts={supportedReasoningEfforts}
				onReasoningSelection={applyReasoningSelection}
				isRecording={isRecording}
				isStartingRecording={isStartingRecording}
				recordingSupported={recordingSupported}
				onToggleRecording={toggleRecording}
				onSubmit={handleSubmit}
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
