"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import {
	buildEmbeddingsMultimodalInput,
	extractEmbeddingVectors,
	projectVectorsPca2d,
	splitEmbeddingTextInput,
	type EmbeddingContentPart,
} from "@/lib/chat/roomRequestBuilders";
import {
	deleteRoomHistory,
	listRoomHistory,
	upsertRoomHistory,
	type NonTextRoomId,
} from "@/lib/indexeddb/chatRoomHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { RoomSearchDialog } from "@/components/(chat)/RoomSearchDialog";
import { useSidebar } from "@/components/ui/sidebar";
import { ROOM_SIDEBAR_SLOT_ID } from "@/components/(chat)/RoomScaffold";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	buildEmbeddingsRequestOptions,
	getDefaultEmbeddingsRoomParams,
	type EmbeddingsRoomParams,
} from "@/lib/chat/roomModelSettings";
import { EmbeddingsModelSettingsDialog } from "@/components/(chat)/rooms/settings/EmbeddingsModelSettingsDialog";
import { RoomErrorNotice } from "@/components/(chat)/rooms/RoomErrorNotice";
import {
	AudioLines,
	ArrowUpRight,
	Check,
	ChevronRight,
	Clapperboard,
	Copy,
	Cpu,
	Database,
	ImagePlus,
	Info,
	MessageCircleDashed,
	MoreHorizontal,
	Paperclip,
	PencilLine,
	Pin,
	PinOff,
	RotateCcw,
	Search,
	Settings as SettingsIcon,
	SquarePen,
	Trash2,
	X,
} from "lucide-react";

type ScatterPoint = {
	x: number;
	y: number;
	index: number;
	label: string;
};

type EmbeddingRow = {
	index: number;
	vector: number[];
	meta: Record<string, unknown>;
};

type EmbeddingHistoryPayload = {
	conversationId?: string;
	conversationTitle?: string;
	modelId: string;
	providerId?: string;
	inputText?: string;
	imageUrl?: string;
	audioUrl?: string;
	videoUrl?: string;
	fileNames?: string[];
	summary: string;
	raw: unknown;
};

type EmbeddingEntry = {
	id: string;
	createdAt: string;
	conversationId: string;
	conversationTitle: string;
	modelId: string;
	providerId?: string;
	inputText?: string;
	imageUrl?: string;
	audioUrl?: string;
	videoUrl?: string;
	fileNames?: string[];
	summary: string;
	raw: unknown;
	isTemporary?: boolean;
};

type EmbeddingConversation = {
	id: string;
	title: string;
	updatedAt: string;
	messageCount: number;
	pinned: boolean;
};

type GroupedEmbeddingConversations = {
	pinned: EmbeddingConversation[];
	today: EmbeddingConversation[];
	yesterday: EmbeddingConversation[];
	week: EmbeddingConversation[];
	month: EmbeddingConversation[];
	older: EmbeddingConversation[];
};

const EMBEDDINGS_PINNED_STORAGE_KEY =
	"ai-stats-embeddings-room-pinned-conversations-v1";

function nowIso() {
	return new Date().toISOString();
}

function createConversationId(): string {
	return `embeddings-${crypto.randomUUID()}`;
}

function truncateTitle(value: string, max = 72): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsDataURL(file);
	});
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) {
		return { mimeType: "application/octet-stream", data: "" };
	}
	return { mimeType: match[1], data: match[2] };
}

function normalizePoints(points: ScatterPoint[]): ScatterPoint[] {
	if (!points.length) return [];
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const spanX = Math.max(1e-9, maxX - minX);
	const spanY = Math.max(1e-9, maxY - minY);
	return points.map((point) => ({
		...point,
		x: (point.x - minX) / spanX,
		y: (point.y - minY) / spanY,
	}));
}

function projectPayload(payload: any): {
	rows: EmbeddingRow[];
	points: ScatterPoint[];
} {
	const vectors = extractEmbeddingVectors(payload);
	const points = projectVectorsPca2d(vectors).map((point, index) => ({
		x: point.x,
		y: point.y,
		index,
		label: `Vector ${index + 1}`,
	}));
	const normalizedPoints = normalizePoints(points);
	const rows: EmbeddingRow[] = vectors.map((vector, index) => ({
		index,
		vector,
		meta:
			(payload?.data?.[index] && typeof payload.data[index] === "object"
				? payload.data[index]
				: {}) ?? {},
	}));
	return { rows, points: normalizedPoints };
}

function truncateInlineText(value: string, max = 72): string {
	const text = value.trim();
	if (!text) return "No source text";
	if (text.length <= max) return text;
	return `${text.slice(0, max - 3).trimEnd()}...`;
}

function buildEmbeddingResultCopyText(args: {
	modelLabel: string;
	vectorCount: number;
	dimensions: number;
	rows: EmbeddingRow[];
	rowLabelByIndex: Map<number, string>;
}): string {
	const lines = [
		"Embedding Result",
		`Model: ${args.modelLabel}`,
		`Vectors: ${args.vectorCount}`,
		`Dimensions: ${args.dimensions}`,
		"",
		"Items:",
	];
	for (const row of args.rows) {
		const label = truncateInlineText(args.rowLabelByIndex.get(row.index) ?? "", 120);
		const preview = row.vector
			.slice(0, 8)
			.map((value) => value.toFixed(4))
			.join(", ");
		lines.push(`- #${row.index + 1}: ${label}`);
		lines.push(`  Preview: ${preview}`);
	}
	return lines.join("\n");
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: EmbeddingHistoryPayload;
}): EmbeddingEntry {
	const payload = record.payload;
	const conversationId =
		typeof payload.conversationId === "string" && payload.conversationId.trim()
			? payload.conversationId.trim()
			: "legacy";
	return {
		id: record.id,
		createdAt: record.createdAt,
		conversationId,
		conversationTitle:
			typeof payload.conversationTitle === "string" &&
			payload.conversationTitle.trim()
				? payload.conversationTitle.trim()
				: "Past embeddings",
		modelId: payload.modelId,
		providerId:
			typeof payload.providerId === "string" && payload.providerId.trim()
				? payload.providerId.trim()
				: undefined,
		inputText: payload.inputText,
		imageUrl: payload.imageUrl,
		audioUrl: payload.audioUrl,
		videoUrl: payload.videoUrl,
		fileNames: Array.isArray(payload.fileNames)
			? payload.fileNames.filter((value) => typeof value === "string")
			: [],
		summary: payload.summary,
		raw: payload.raw,
	};
}

function toHistoryPayload(entry: EmbeddingEntry): EmbeddingHistoryPayload {
	return {
		conversationId: entry.conversationId,
		conversationTitle: entry.conversationTitle,
		modelId: entry.modelId,
		providerId: entry.providerId,
		inputText: entry.inputText,
		imageUrl: entry.imageUrl,
		audioUrl: entry.audioUrl,
		videoUrl: entry.videoUrl,
		fileNames: entry.fileNames,
		summary: entry.summary,
		raw: entry.raw,
	};
}

function buildConversations(
	entries: EmbeddingEntry[],
	pinnedById: Record<string, boolean>,
): EmbeddingConversation[] {
	const byId = new Map<string, EmbeddingConversation>();
	for (const entry of entries) {
		const existing = byId.get(entry.conversationId);
		if (!existing) {
			byId.set(entry.conversationId, {
				id: entry.conversationId,
				title: entry.conversationTitle,
				updatedAt: entry.createdAt,
				messageCount: 1,
				pinned: Boolean(pinnedById[entry.conversationId]),
			});
			continue;
		}
		existing.messageCount += 1;
		existing.pinned = Boolean(pinnedById[existing.id]);
		if (entry.createdAt > existing.updatedAt) existing.updatedAt = entry.createdAt;
		if (
			(existing.title === "Past embeddings" || !existing.title.trim()) &&
			entry.conversationTitle.trim()
		) {
			existing.title = entry.conversationTitle.trim();
		}
	}
	return Array.from(byId.values()).sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);
}

function groupConversations(
	conversations: EmbeddingConversation[],
	nowMs: number,
): GroupedEmbeddingConversations {
	const groups: GroupedEmbeddingConversations = {
		pinned: [],
		today: [],
		yesterday: [],
		week: [],
		month: [],
		older: [],
	};
	const now = new Date(nowMs);
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	const startOfYesterday = new Date(startOfToday);
	startOfYesterday.setDate(startOfToday.getDate() - 1);
	const startOfWeek = new Date(startOfToday);
	const weekday = (startOfToday.getDay() + 6) % 7;
	startOfWeek.setDate(startOfToday.getDate() - weekday);
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfTodayMs = startOfToday.getTime();
	const startOfYesterdayMs = startOfYesterday.getTime();
	const startOfWeekMs = startOfWeek.getTime();
	const startOfMonthMs = startOfMonth.getTime();

	for (const conversation of conversations) {
		if (conversation.pinned) {
			groups.pinned.push(conversation);
			continue;
		}
		const updatedMs = Date.parse(conversation.updatedAt);
		if (!Number.isFinite(updatedMs)) {
			groups.older.push(conversation);
			continue;
		}
		if (updatedMs >= startOfTodayMs) {
			groups.today.push(conversation);
		} else if (updatedMs >= startOfYesterdayMs) {
			groups.yesterday.push(conversation);
		} else if (updatedMs >= startOfWeekMs) {
			groups.week.push(conversation);
		} else if (updatedMs >= startOfMonthMs) {
			groups.month.push(conversation);
		} else {
			groups.older.push(conversation);
		}
	}
	return groups;
}

function safeParsePinned(value: string | null): Record<string, boolean> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		const normalized: Record<string, boolean> = {};
		for (const [key, entry] of Object.entries(parsed)) {
			if (entry === true) normalized[key] = true;
		}
		return normalized;
	} catch {
		return {};
	}
}

export function EmbeddingsRoom({ models }: { models: GatewaySupportedModel[] }) {
	const { toggleSidebar, state: sidebarState, isMobile } = useSidebar();
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const filteredModels = useMemo(
		() =>
			filterModelsForRoom(models, "embeddings").filter(
				(model) => model.isAvailable,
			),
		[models],
	);
	const [modelId, setModelId] = useState("");
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [textInput, setTextInput] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [audioUrl, setAudioUrl] = useState("");
	const [videoUrl, setVideoUrl] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [showImageUrlInput, setShowImageUrlInput] = useState(false);
	const [showAudioUrlInput, setShowAudioUrlInput] = useState(false);
	const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<EmbeddingEntry[]>([]);
	const [activeConversationId, setActiveConversationId] = useState<string | null>(
		null,
	);
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(null);
	const [pinnedConversationIds, setPinnedConversationIds] = useState<Record<string, boolean>>({});
	const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
	const [copiedPromptEntryId, setCopiedPromptEntryId] = useState<string | null>(null);
	const [copiedResultEntryId, setCopiedResultEntryId] = useState<string | null>(null);
	const [metadataOpenEntryId, setMetadataOpenEntryId] = useState<string | null>(null);
	const [conversationGroupingNowMs, setConversationGroupingNowMs] = useState<number | null>(
		null,
	);
	const [activeIndicesByEntryId, setActiveIndicesByEntryId] = useState<
		Record<string, number>
	>({});
	const imageUrlInputRef = useRef<HTMLInputElement | null>(null);
	const audioUrlInputRef = useRef<HTMLInputElement | null>(null);
	const videoUrlInputRef = useRef<HTMLInputElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const copiedPromptTimeoutRef = useRef<number | null>(null);
	const copiedResultTimeoutRef = useRef<number | null>(null);
	const modelSettings = useRoomModelSettings({
		roomId: "embeddings",
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: () => getDefaultEmbeddingsRoomParams(),
	});
	const modelSettingsCompat = modelSettings as any;
	const selectedProfile =
		modelSettingsCompat.selectedProfile ?? modelSettingsCompat.activeModelSettings ?? null;
	const selectedModelEnabled = selectedProfile?.enabled !== false;
	const selectedProviderId = selectedProfile?.providerId;
	const composerSelectedModel = useMemo(
		() =>
			filteredModels.find(
				(model) =>
					model.modelId === modelId &&
					(!selectedProviderId || model.providerId === selectedProviderId),
			) ??
			filteredModels.find((model) => model.modelId === modelId) ??
			null,
		[filteredModels, modelId, selectedProviderId],
	);
	const composerModelLogoId =
		composerSelectedModel?.organisationId?.trim() ||
		composerSelectedModel?.providerId ||
		(modelId.split("/")[0] || "ai-stats");
	const composerModelLabel =
		(modelId &&
			(modelSettings.modelDisplayNameById[modelId] ||
				composerSelectedModel?.modelName ||
				modelId)) ||
		"Select model";
	const openComposerModelPicker = () => {
		const targetModelId = modelId || filteredModels[0]?.modelId;
		if (!targetModelId) return;
		if (targetModelId !== modelId) {
			setModelId(targetModelId);
		}
		modelSettings.openModelSettingsForModel(targetModelId);
	};
	const dialogModelId: string | null = modelSettingsCompat.modelSettingsModelId ?? null;
	const dialogProfile =
		dialogModelId && typeof modelSettingsCompat.getProfileForModel === "function"
			? modelSettingsCompat.getProfileForModel(dialogModelId)
			: dialogModelId === modelId
				? selectedProfile
				: null;
	const updateModelBaseSettings = (partial: Record<string, unknown>) => {
		if (typeof modelSettingsCompat.updateModelBaseSettings === "function") {
			modelSettingsCompat.updateModelBaseSettings(partial);
			return;
		}
		if (typeof modelSettingsCompat.updateModelSettings === "function") {
			modelSettingsCompat.updateModelSettings(partial);
		}
	};
	const updateModelParams = (partial: Record<string, unknown>) => {
		if (typeof modelSettingsCompat.updateModelParams === "function") {
			modelSettingsCompat.updateModelParams(partial);
		}
	};
	const resetModelSettings = () => {
		if (typeof modelSettingsCompat.resetModelSettings === "function") {
			modelSettingsCompat.resetModelSettings();
		}
	};
	const conversations = useMemo(
		() => buildConversations(entries, pinnedConversationIds),
		[entries, pinnedConversationIds],
	);
	const groupedConversations = useMemo(
		() =>
			groupConversations(
				conversations,
				conversationGroupingNowMs ??
					(conversations[0] ? Date.parse(conversations[0].updatedAt) : 0),
			),
		[conversationGroupingNowMs, conversations],
	);
	const activeConversation = useMemo(
		() =>
			conversations.find((conversation) => conversation.id === activeConversationId) ??
			null,
		[activeConversationId, conversations],
	);
	const activeEntries = useMemo(() => {
		const targetId = activeConversationId ?? conversations[0]?.id ?? null;
		if (!targetId) return [];
		return entries
			.filter((entry) => entry.conversationId === targetId)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}, [activeConversationId, conversations, entries]);
	const splitTextEntries = useMemo(
		() => splitEmbeddingTextInput(textInput),
		[textInput],
	);
	const splitTextModeActive =
		splitTextEntries.length > 1 &&
		!imageUrl.trim() &&
		!audioUrl.trim() &&
		!videoUrl.trim() &&
		files.length === 0;

	useEffect(() => {
		setModelId((current) => {
			if (current && filteredModels.some((model) => model.modelId === current)) {
				return current;
			}
			return "";
		});
	}, [filteredModels]);

	useEffect(() => {
		setSidebarSlotEl(document.getElementById(ROOM_SIDEBAR_SLOT_ID));
	}, []);

	useEffect(() => {
		if (!showImageUrlInput) return;
		requestAnimationFrame(() => {
			imageUrlInputRef.current?.focus();
		});
	}, [showImageUrlInput]);

	useEffect(() => {
		if (!showAudioUrlInput) return;
		requestAnimationFrame(() => {
			audioUrlInputRef.current?.focus();
		});
	}, [showAudioUrlInput]);

	useEffect(() => {
		if (!showVideoUrlInput) return;
		requestAnimationFrame(() => {
			videoUrlInputRef.current?.focus();
		});
	}, [showVideoUrlInput]);

	useEffect(() => {
		setConversationGroupingNowMs(Date.now());
		const timer = window.setInterval(() => {
			setConversationGroupingNowMs(Date.now());
		}, 60_000);
		return () => {
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const stored = window.localStorage.getItem(EMBEDDINGS_PINNED_STORAGE_KEY);
		setPinnedConversationIds(safeParsePinned(stored));
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(
			EMBEDDINGS_PINNED_STORAGE_KEY,
			JSON.stringify(pinnedConversationIds),
		);
	}, [pinnedConversationIds]);

	useEffect(() => {
		let mounted = true;
		void listRoomHistory<EmbeddingHistoryPayload>(
			"embeddings" as NonTextRoomId,
		).then((records) => {
			if (!mounted) return;
			const nextEntries = records.map((record) => toEntry(record));
			setEntries(nextEntries);
			const nextConversations = buildConversations(nextEntries, pinnedConversationIds);
			if (nextConversations.length > 0) {
				setActiveConversationId(nextConversations[0].id);
			} else {
				setActiveConversationId(createConversationId());
			}
		});
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (!activeConversationId && conversations.length > 0) {
			setActiveConversationId(conversations[0].id);
		}
	}, [activeConversationId, conversations]);

	useEffect(() => {
		return () => {
			if (copiedPromptTimeoutRef.current !== null) {
				window.clearTimeout(copiedPromptTimeoutRef.current);
			}
			if (copiedResultTimeoutRef.current !== null) {
				window.clearTimeout(copiedResultTimeoutRef.current);
			}
		};
	}, []);
	const projectionsByEntryId = useMemo(() => {
		const map = new Map<string, { rows: EmbeddingRow[]; points: ScatterPoint[] }>();
		for (const entry of activeEntries) {
			map.set(entry.id, projectPayload(entry.raw));
		}
		return map;
	}, [activeEntries]);

	useEffect(() => {
		setActiveIndicesByEntryId((prev) => {
			const next: Record<string, number> = {};
			for (const entry of activeEntries) {
				const projection = projectionsByEntryId.get(entry.id);
				const existing = prev[entry.id];
				if (
					typeof existing === "number" &&
					projection?.rows.some((row) => row.index === existing)
				) {
					next[entry.id] = existing;
					continue;
				}
				const fallback = projection?.points[0]?.index;
				if (typeof fallback === "number") {
					next[entry.id] = fallback;
				}
			}
			return next;
		});
	}, [activeEntries, projectionsByEntryId]);

	const startNewConversation = () => {
		setModelId("");
		setActiveConversationId(createConversationId());
		setTextInput("");
		setImageUrl("");
		setAudioUrl("");
		setVideoUrl("");
		setFiles([]);
		setShowImageUrlInput(false);
		setShowAudioUrlInput(false);
		setShowVideoUrlInput(false);
		setError(null);
	};

	const addEntry = async (entry: EmbeddingEntry) => {
		setEntries((prev) => [entry, ...prev]);
		if (entry.isTemporary) return;
		await upsertRoomHistory<EmbeddingHistoryPayload>({
			id: entry.id,
			roomId: "embeddings",
			createdAt: entry.createdAt,
			updatedAt: entry.createdAt,
			payload: toHistoryPayload(entry),
		});
	};

	type EmbeddingSubmitInputOverride = {
		textInput?: string;
		imageUrl?: string;
		audioUrl?: string;
		videoUrl?: string;
		files?: File[];
	};

	const submit = async (overrides?: {
		forcedModelId?: string;
		forcedConversationId?: string;
		forcedConversationTitle?: string;
		inputOverride?: EmbeddingSubmitInputOverride;
	}) => {
		const targetModelId = overrides?.forcedModelId ?? modelId;
		if (!targetModelId || isLoading || !selectedModelEnabled) return;
		setError(null);
		setIsLoading(true);
		try {
			const effectiveTextInput = overrides?.inputOverride?.textInput ?? textInput;
			const effectiveImageUrl = overrides?.inputOverride?.imageUrl ?? imageUrl;
			const effectiveAudioUrl = overrides?.inputOverride?.audioUrl ?? audioUrl;
			const effectiveVideoUrl = overrides?.inputOverride?.videoUrl ?? videoUrl;
			const effectiveFiles = overrides?.inputOverride?.files ?? files;
			const textLines = splitEmbeddingTextInput(effectiveTextInput);
			const trimmedText = effectiveTextInput.trim();
			const hasMediaInputs =
				Boolean(effectiveImageUrl.trim()) ||
				Boolean(effectiveAudioUrl.trim()) ||
				Boolean(effectiveVideoUrl.trim()) ||
				effectiveFiles.length > 0;
			const shouldSplitTextLines = textLines.length > 1 && !hasMediaInputs;
			let requestInput: unknown;

			if (shouldSplitTextLines) {
				requestInput = textLines;
			} else {
				const parts: EmbeddingContentPart[] = [];
				if (textLines.length) {
					parts.push({
						type: "input_text",
						text: textLines.join("\n"),
					});
				}
				if (effectiveImageUrl.trim()) {
					parts.push({ type: "input_image", image_url: effectiveImageUrl.trim() });
				}
				if (effectiveAudioUrl.trim()) {
					parts.push({
						type: "input_audio",
						input_audio: {
							url: effectiveAudioUrl.trim(),
						},
					});
				}
				if (effectiveVideoUrl.trim()) {
					parts.push({ type: "input_video", url: effectiveVideoUrl.trim() });
				}

				for (const file of effectiveFiles) {
					const dataUrl = await readFileAsDataUrl(file);
					if (file.type.startsWith("image/")) {
						parts.push({ type: "input_image", image_url: dataUrl });
						continue;
					}
					if (file.type.startsWith("audio/")) {
						const { data, mimeType } = splitDataUrl(dataUrl);
						const format = mimeType.split("/")[1]?.split(";")[0] || "wav";
						parts.push({
							type: "input_audio",
							input_audio: {
								data,
								format,
							},
						});
						continue;
					}
					if (file.type.startsWith("video/")) {
						parts.push({ type: "input_video", url: dataUrl });
						continue;
					}
					if (file.type.startsWith("text/")) {
						const text = await file.text();
						if (text.trim()) {
							parts.push({ type: "input_text", text: text.trim() });
						}
					}
				}

				if (!parts.length) {
					throw new Error("Provide at least one text/image/audio/video input.");
				}
				requestInput = buildEmbeddingsMultimodalInput(parts);
			}
			const conversationId =
				overrides?.forcedConversationId ??
				activeConversationId ??
				createConversationId();
			if (!activeConversationId) {
				setActiveConversationId(conversationId);
			}
			const existingTitle = activeConversation?.title?.trim() ?? "";
			const candidateTitle = textLines[0]
				? truncateTitle(textLines[0])
				: imageUrl.trim() || audioUrl.trim() || videoUrl.trim()
					? truncateTitle(imageUrl.trim() || audioUrl.trim() || videoUrl.trim())
					: `Embedding ${new Date().toLocaleDateString()}`;
			const conversationTitle =
				overrides?.forcedConversationTitle ||
				(temporaryMode ? "Temporary chat" : existingTitle || candidateTitle);

			const response = await fetch("/api/chat/embeddings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
						requestBody: {
							model: targetModelId,
							...(selectedProviderId &&
							selectedProviderId !== "auto"
								? {
										provider: {
											only: [selectedProviderId],
										},
									}
								: {}),
							...buildEmbeddingsRequestOptions(
								targetModelId,
								(selectedProfile?.params as EmbeddingsRoomParams) ??
									getDefaultEmbeddingsRoomParams(),
							),
							meta: true,
							input: requestInput,
						},
						appHeaders: APP_HEADERS,
				}),
			});
			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `Request failed (${response.status})`);
			}
			const payload = await response.json();
			const summary = [
				shouldSplitTextLines
					? `${textLines.length} text lines`
					: trimmedText
						? `text: ${trimmedText.slice(0, 80)}`
						: null,
				effectiveImageUrl.trim() ? "image url" : null,
				effectiveAudioUrl.trim() ? "audio url" : null,
				effectiveVideoUrl.trim() ? "video url" : null,
				effectiveFiles.length ? `${effectiveFiles.length} file(s)` : null,
			]
				.filter(Boolean)
				.join(" | ");
			await addEntry({
				id: crypto.randomUUID(),
				createdAt: nowIso(),
				conversationId,
				conversationTitle,
				modelId: targetModelId,
				providerId:
					selectedProviderId && selectedProviderId !== "auto"
						? selectedProviderId
						: undefined,
				inputText: trimmedText || undefined,
				imageUrl: effectiveImageUrl.trim() || undefined,
				audioUrl: effectiveAudioUrl.trim() || undefined,
				videoUrl: effectiveVideoUrl.trim() || undefined,
				fileNames: effectiveFiles.map((file) => file.name),
				summary: summary || "Embedding request",
				raw: payload,
				isTemporary: temporaryMode,
			});
			if (!overrides?.inputOverride) {
				setTextInput("");
				setImageUrl("");
				setAudioUrl("");
				setVideoUrl("");
				setFiles([]);
				setShowImageUrlInput(false);
				setShowAudioUrlInput(false);
				setShowVideoUrlInput(false);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Embeddings request failed");
		} finally {
			setIsLoading(false);
		}
	};

	const toggleTemporaryMode = () => {
		if (!temporaryMode) {
			setTemporaryMode(true);
			setActiveConversationId(createConversationId());
			setTextInput("");
			setImageUrl("");
			setAudioUrl("");
			setVideoUrl("");
			setFiles([]);
			setShowImageUrlInput(false);
			setShowAudioUrlInput(false);
			setShowVideoUrlInput(false);
			setError(null);
			return;
		}
		setTemporaryMode(false);
		const nextEntries = entries.filter((entry) => !entry.isTemporary);
		setEntries(nextEntries);
		const remainingConversations = buildConversations(
			nextEntries,
			pinnedConversationIds,
		);
		setActiveConversationId(remainingConversations[0]?.id ?? createConversationId());
		setTextInput("");
		setImageUrl("");
		setAudioUrl("");
		setVideoUrl("");
		setFiles([]);
		setShowImageUrlInput(false);
		setShowAudioUrlInput(false);
		setShowVideoUrlInput(false);
		setError(null);
	};

	const toggleConversationPin = (conversation: EmbeddingConversation) => {
		setPinnedConversationIds((prev) => {
			const next = { ...prev };
			if (conversation.pinned) {
				delete next[conversation.id];
			} else {
				next[conversation.id] = true;
			}
			return next;
		});
	};

	const renameConversation = async (conversation: EmbeddingConversation) => {
		if (typeof window === "undefined") return;
		const renamed = window.prompt("Rename chat", conversation.title);
		if (renamed === null) return;
		const nextTitle = truncateTitle(renamed, 72);
		if (!nextTitle.trim() || nextTitle === conversation.title) return;
		const updates = entries.filter(
			(entry) => entry.conversationId === conversation.id,
		);
		if (updates.length === 0) return;
		const nextEntries = entries.map((entry) =>
			entry.conversationId === conversation.id
				? { ...entry, conversationTitle: nextTitle }
				: entry,
		);
		setEntries(nextEntries);
		const persistentUpdates = updates.filter((entry) => !entry.isTemporary);
		if (persistentUpdates.length === 0) return;
		await Promise.all(
			persistentUpdates.map((entry) => {
				const updatedEntry: EmbeddingEntry = {
					...entry,
					conversationTitle: nextTitle,
				};
				return upsertRoomHistory<EmbeddingHistoryPayload>({
					id: updatedEntry.id,
					roomId: "embeddings",
					createdAt: updatedEntry.createdAt,
					updatedAt: nowIso(),
					payload: toHistoryPayload(updatedEntry),
				});
			}),
		);
	};

	const deleteConversation = async (conversation: EmbeddingConversation) => {
		if (typeof window === "undefined") return;
		const confirmed = window.confirm(
			`Delete "${conversation.title}" and all embeddings inside it?`,
		);
		if (!confirmed) return;
		const entriesToDelete = entries.filter(
			(entry) => entry.conversationId === conversation.id,
		);
		const persistentEntries = entriesToDelete.filter((entry) => !entry.isTemporary);
		await Promise.all(persistentEntries.map((entry) => deleteRoomHistory(entry.id)));
		const remainingEntries = entries.filter(
			(entry) => entry.conversationId !== conversation.id,
		);
		setEntries(remainingEntries);
		setPinnedConversationIds((prev) => {
			if (!prev[conversation.id]) return prev;
			const next = { ...prev };
			delete next[conversation.id];
			return next;
		});
		if (activeConversationId === conversation.id) {
			const remainingConversations = buildConversations(
				remainingEntries,
				pinnedConversationIds,
			);
			setActiveConversationId(remainingConversations[0]?.id ?? createConversationId());
		}
	};

	const copyText = (value: string): boolean => {
		const nextValue = value;
		if (!nextValue.trim()) return false;
		try {
			const textArea = document.createElement("textarea");
			textArea.value = nextValue;
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
			if (copied) return true;
		} catch {
			// fall through to prompt fallback
		}
		window.prompt("Copy text:", nextValue);
		return false;
	};

	const markPromptCopied = (entryId: string) => {
		setCopiedPromptEntryId(entryId);
		if (copiedPromptTimeoutRef.current !== null) {
			window.clearTimeout(copiedPromptTimeoutRef.current);
		}
		copiedPromptTimeoutRef.current = window.setTimeout(() => {
			setCopiedPromptEntryId((current) => (current === entryId ? null : current));
			copiedPromptTimeoutRef.current = null;
		}, 1500);
	};

	const markResultCopied = (entryId: string) => {
		setCopiedResultEntryId(entryId);
		if (copiedResultTimeoutRef.current !== null) {
			window.clearTimeout(copiedResultTimeoutRef.current);
		}
		copiedResultTimeoutRef.current = window.setTimeout(() => {
			setCopiedResultEntryId((current) => (current === entryId ? null : current));
			copiedResultTimeoutRef.current = null;
		}, 1500);
	};

	const retryEntry = async (entry: EmbeddingEntry) => {
		setActiveConversationId(entry.conversationId);
		setError(null);
		await submit({
			forcedModelId: entry.modelId,
			forcedConversationId: entry.conversationId,
			forcedConversationTitle: entry.conversationTitle,
			inputOverride: {
				textInput: entry.inputText ?? "",
				imageUrl: entry.imageUrl ?? "",
				audioUrl: entry.audioUrl ?? "",
				videoUrl: entry.videoUrl ?? "",
				files: [],
			},
		});
	};

	const renderConversationSection = (
		label: string,
		items: EmbeddingConversation[],
	) => {
		if (items.length === 0) return null;
		return (
			<div>
				<p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase text-muted-foreground">
					{label}
				</p>
				{items.map((conversation) => (
					<SidebarMenuItem key={conversation.id} className="w-full overflow-hidden">
						<SidebarMenuButton
							isActive={activeConversationId === conversation.id}
							onClick={() => {
								setActiveConversationId(conversation.id);
								setError(null);
							}}
						>
							<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
								{conversation.title}
							</span>
						</SidebarMenuButton>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuAction showOnHover>
									<MoreHorizontal className="h-4 w-4" />
								</SidebarMenuAction>
							</DropdownMenuTrigger>
							<DropdownMenuContent side="right">
								<DropdownMenuItem
									onClick={() => {
										void renameConversation(conversation);
									}}
								>
									<PencilLine className="mr-2 h-4 w-4" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => toggleConversationPin(conversation)}>
									{conversation.pinned ? (
										<PinOff className="mr-2 h-4 w-4" />
									) : (
										<Pin className="mr-2 h-4 w-4" />
									)}
									{conversation.pinned ? "Unpin" : "Pin"}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => {
										void deleteConversation(conversation);
									}}
									className="group text-foreground focus:text-destructive data-highlighted:text-destructive"
								>
									<Trash2 className="mr-2 h-4 w-4 text-muted-foreground group-data-highlighted:text-destructive" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				))}
			</div>
		);
	};

	const sidebarHistory = sidebarSlotEl
		? createPortal(
				<>
					<div className="px-2 py-1.5">
						{collapsed ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										className="h-8 min-w-0 w-full justify-center px-0 text-sm font-medium"
										onClick={startNewConversation}
										aria-label="New Chat"
									>
										<SquarePen className="h-4 w-4 shrink-0" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="right" align="center" sideOffset={10}>
									New Chat
								</TooltipContent>
							</Tooltip>
						) : (
							<Button
								variant="ghost"
								className="h-8 min-w-0 w-full flex-1 justify-start gap-2 px-2 text-sm font-medium"
								onClick={startNewConversation}
								aria-label="New Chat"
							>
								<SquarePen className="h-4 w-4 shrink-0" />
								<span className="truncate text-left">New Chat</span>
							</Button>
						)}
						{collapsed ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										className="h-8 min-w-0 w-full justify-center px-0 text-sm font-medium"
										asChild
										aria-label="Database"
									>
										<Link
											href="/"
											className="group/db flex w-full min-w-0 items-center justify-center"
										>
											<Database className="h-4 w-4 shrink-0" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="right" align="center" sideOffset={10}>
									Database
								</TooltipContent>
							</Tooltip>
						) : (
							<Button
								variant="ghost"
								className="h-8 min-w-0 w-full flex-1 justify-start gap-0 px-2 text-sm font-medium"
								asChild
								aria-label="Database"
							>
								<Link href="/" className="group/db flex w-full min-w-0 items-center gap-2">
									<Database className="h-4 w-4 shrink-0" />
									<span className="flex-1 min-w-0 truncate text-left">Database</span>
									<ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover/db:opacity-100" />
								</Link>
							</Button>
						)}
						{collapsed ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										className="h-8 min-w-0 w-full justify-center px-0 text-sm font-medium"
										onClick={() => setConversationSearchOpen(true)}
										aria-label="Search Chats"
									>
										<Search className="h-4 w-4 shrink-0" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="right" align="center" sideOffset={10}>
									Search Chats
								</TooltipContent>
							</Tooltip>
						) : (
							<Button
								variant="ghost"
								className="h-8 min-w-0 w-full flex-1 justify-start gap-2 px-2 text-sm font-medium"
								onClick={() => setConversationSearchOpen(true)}
								aria-label="Search Chats"
							>
								<Search className="h-4 w-4 shrink-0" />
								<span className="truncate text-left">Search Chats</span>
							</Button>
						)}
					</div>
					<SidebarSeparator className="my-0" />
					<ScrollArea className="h-full group-data-[collapsible=icon]:hidden">
						<SidebarGroup className="pt-0 px-2 pb-2">
							<SidebarGroupLabel>Chats</SidebarGroupLabel>
							<SidebarGroupContent className="overflow-hidden">
								<SidebarMenu>
									{renderConversationSection("Pinned", groupedConversations.pinned)}
									{renderConversationSection("Today", groupedConversations.today)}
									{renderConversationSection("Yesterday", groupedConversations.yesterday)}
									{renderConversationSection("This week", groupedConversations.week)}
									{renderConversationSection("This month", groupedConversations.month)}
									{renderConversationSection("Older", groupedConversations.older)}
									{conversations.length === 0 ? (
										<p className="px-2 py-3 text-xs text-muted-foreground">
											No chats found.
										</p>
									) : null}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</ScrollArea>
				</>,
				sidebarSlotEl,
			)
		: null;

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			{sidebarHistory}
			<header className="border-b border-border px-3 py-3 md:px-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="group -ml-1 h-8 w-8"
								onClick={toggleSidebar}
							>
								<ChevronRight
									className={`h-4 w-4 transition-transform duration-200 ${
										sidebarState === "expanded"
											? "rotate-180 group-hover:-translate-x-1"
											: "group-hover:translate-x-1"
									}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent side={sidebarState === "collapsed" ? "right" : "bottom"} align="center" sideOffset={8}>Toggle sidebar</TooltipContent>
					</Tooltip>
						<RoomModelSelector
							models={filteredModels}
							selectedModelIds={modelId ? [modelId] : []}
							onSelectModel={setModelId}
							modelDisplayNameById={modelSettings.modelDisplayNameById}
							modelEnabledById={modelSettings.modelEnabledById}
							onOpenModelSettingsForModel={modelSettings.openModelSettingsForModel}
						/>
				</div>
					<div className="flex items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant={temporaryMode ? "secondary" : "ghost"}
									size="icon"
									onClick={toggleTemporaryMode}
								>
									<MessageCircleDashed className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Temporary chat</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => {
										if (!modelId) return;
										modelSettings.openModelSettingsForModel(modelId);
									}}
									disabled={!modelId}
								>
									<SettingsIcon className="h-5 w-5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Settings</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</header>

			<main className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5 md:px-6">
				<div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
					{activeEntries.length === 0 ? (
						<div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
							No embeddings history yet.
						</div>
					) : (
						activeEntries.map((entry) => {
							const entryProjection = projectionsByEntryId.get(entry.id) ?? {
								rows: [],
								points: [],
							};
							const resolvedModel =
								filteredModels.find(
									(model) =>
										model.modelId === entry.modelId &&
										(!entry.providerId || model.providerId === entry.providerId),
								) ??
								filteredModels.find((model) => model.modelId === entry.modelId) ??
								null;
							const logoId =
								resolvedModel?.organisationId?.trim() ||
								resolvedModel?.providerId ||
								"ai-stats";
							const logoAlt =
								resolvedModel?.organisationName ||
								resolvedModel?.providerName ||
								logoId;
							const modelLabel =
								modelSettings.modelDisplayNameById[entry.modelId] ||
								resolvedModel?.modelName ||
								entry.modelId;
							const organisationId =
								resolvedModel?.organisationId?.trim() ||
								entry.modelId.split("/")[0] ||
								null;
							const modelHref =
								getModelDetailsHref(organisationId, entry.modelId) ?? "#";
							const promptCopied = copiedPromptEntryId === entry.id;
							const resultCopied = copiedResultEntryId === entry.id;
							const rawResponse = entry.raw as any;
							const inputLines = splitEmbeddingTextInput(entry.inputText ?? "");
							const vectorCount = entryProjection.rows.length;
							const dimensions = entryProjection.rows[0]?.vector.length ?? 0;
							const resolvedActiveIndex =
								typeof activeIndicesByEntryId[entry.id] === "number" &&
								entryProjection.rows.some(
									(row) => row.index === activeIndicesByEntryId[entry.id],
								)
									? activeIndicesByEntryId[entry.id]
									: entryProjection.rows[0]?.index ?? null;
							const activeRow =
								resolvedActiveIndex === null
									? null
									: entryProjection.rows.find(
											(row) => row.index === resolvedActiveIndex,
										) ?? null;
							const rowLabelByIndex = new Map<number, string>(
								entryProjection.rows.map((row, rowPosition) => {
									const modalityRaw = row.meta?.["modality"];
									const modality =
										typeof modalityRaw === "string" && modalityRaw.trim()
											? modalityRaw.trim()
											: null;
									const label =
										inputLines[rowPosition] ??
										modality ??
										(rowPosition === 0
											? entry.inputText || entry.summary
											: `Item ${row.index + 1}`);
									return [row.index, label];
								}),
							);
							const activeLabel =
								activeRow ? rowLabelByIndex.get(activeRow.index) ?? "No source text" : null;
							return (
								<div key={entry.id} className="space-y-3">
									<div className="ml-auto w-full max-w-[85%]">
										<div className="rounded-2xl bg-foreground px-4 py-3 text-sm text-background">
											<p className="whitespace-pre-wrap">
												{entry.inputText || entry.summary}
											</p>
										</div>
										<div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="h-7 w-7"
													onClick={() => {
														const copied = copyText(
															entry.inputText || entry.summary,
														);
															if (copied) {
																markPromptCopied(entry.id);
															}
														}}
													>
														{promptCopied ? (
															<Check className="h-3.5 w-3.5" />
														) : (
															<Copy className="h-3.5 w-3.5" />
														)}
													</Button>
												</TooltipTrigger>
												<TooltipContent side="top">
													{promptCopied ? "Copied" : "Copy prompt"}
												</TooltipContent>
											</Tooltip>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="h-7 w-7"
														onClick={() => {
															setTextInput(entry.inputText ?? "");
															setImageUrl(entry.imageUrl ?? "");
															setAudioUrl(entry.audioUrl ?? "");
															setVideoUrl(entry.videoUrl ?? "");
															setShowImageUrlInput(Boolean(entry.imageUrl));
															setShowAudioUrlInput(Boolean(entry.audioUrl));
															setShowVideoUrlInput(Boolean(entry.videoUrl));
															setError(null);
														}}
													>
														<PencilLine className="h-3.5 w-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent side="top">Edit prompt</TooltipContent>
											</Tooltip>
										</div>
									</div>
									<div className="mr-auto w-full max-w-[92%]">
										<Link
											href={modelHref}
											className="mb-2 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
										>
											<Logo
												id={logoId}
												alt={logoAlt}
												width={18}
												height={18}
												className="shrink-0 rounded-none"
											/>
											<span className="truncate">{modelLabel}</span>
										</Link>
										<div className="space-y-3 rounded-2xl border border-border bg-card p-4">
											<div className="flex flex-wrap items-center gap-2">
												<h2 className="text-sm font-semibold">2D projection (PCA)</h2>
												<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
													{vectorCount} vectors
												</span>
												<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
													{dimensions} dims
												</span>
											</div>
											<svg
												viewBox="0 0 560 320"
												className="h-[260px] w-full rounded-lg bg-muted/20"
											>
												<rect x="0" y="0" width="560" height="320" fill="transparent" />
												<line x1="24" y1="296" x2="536" y2="296" stroke="currentColor" opacity="0.18" />
												<line x1="24" y1="160" x2="536" y2="160" stroke="currentColor" opacity="0.12" />
												<line x1="24" y1="24" x2="536" y2="24" stroke="currentColor" opacity="0.18" />
												<line x1="24" y1="24" x2="24" y2="296" stroke="currentColor" opacity="0.18" />
												<line x1="280" y1="24" x2="280" y2="296" stroke="currentColor" opacity="0.12" />
												<line x1="536" y1="24" x2="536" y2="296" stroke="currentColor" opacity="0.18" />
												{entryProjection.points.map((point) => {
													const cx = 24 + point.x * 512;
													const cy = 296 - point.y * 272;
													const active = point.index === resolvedActiveIndex;
													return (
														<g
															key={`${entry.id}-${point.index}`}
															onPointerDown={() =>
																setActiveIndicesByEntryId((prev) => ({
																	...prev,
																	[entry.id]: point.index,
																}))
															}
															onClick={() =>
																setActiveIndicesByEntryId((prev) => ({
																	...prev,
																	[entry.id]: point.index,
																}))
															}
															className="cursor-pointer"
														>
															<circle
																cx={cx}
																cy={cy}
																r={active ? 11 : 9}
																fill={active ? "#2563eb" : "#64748b"}
																fillOpacity={active ? 0.9 : 0.55}
															/>
															<text
																x={cx}
																y={cy + 3}
																textAnchor="middle"
																fontSize="10"
																fontWeight="600"
																fill="#ffffff"
															>
																{point.index + 1}
															</text>
															<title>{point.label}</title>
														</g>
													);
												})}
											</svg>
											{activeRow ? (
												<div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
													<p className="font-medium text-foreground">
														Selected #{activeRow.index + 1}
													</p>
													<p className="text-muted-foreground">
														{truncateInlineText(activeLabel ?? "")}
													</p>
												</div>
											) : null}
											<div className="max-h-[280px] overflow-auto rounded-md border border-border">
												<table className="w-full text-xs">
													<thead className="sticky top-0 bg-muted/60">
														<tr>
															<th className="px-2 py-1 text-left">#</th>
															<th className="px-2 py-1 text-left">Input</th>
															<th className="px-2 py-1 text-left">Preview</th>
															<th className="px-2 py-1 text-left">Dims</th>
														</tr>
													</thead>
													<tbody>
														{entryProjection.rows.map((row) => (
															<tr
																key={`${entry.id}-${row.index}`}
																className={`cursor-pointer hover:bg-muted/40 ${
																	row.index === resolvedActiveIndex ? "bg-muted/40" : ""
																}`}
																onClick={() =>
																	setActiveIndicesByEntryId((prev) => ({
																		...prev,
																		[entry.id]: row.index,
																	}))
																}
															>
																<td className="px-2 py-1">{row.index + 1}</td>
																<td className="max-w-[280px] truncate px-2 py-1 text-muted-foreground">
																	{truncateInlineText(
																		rowLabelByIndex.get(row.index) ?? "",
																		52,
																	)}
																</td>
																<td className="px-2 py-1 font-mono">
																	{row.vector
																		.slice(0, 6)
																		.map((value) => value.toFixed(4))
																		.join(", ")}
																</td>
																<td className="px-2 py-1">{row.vector.length}</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>
										<div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="h-7 w-7"
														onClick={() => {
															void retryEntry(entry);
														}}
													>
														<RotateCcw className="h-3.5 w-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent side="top">Retry</TooltipContent>
											</Tooltip>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="h-7 w-7"
														onClick={() => {
															const copied = copyText(
																buildEmbeddingResultCopyText({
																	modelLabel,
																	vectorCount,
																	dimensions,
																	rows: entryProjection.rows,
																	rowLabelByIndex,
																}),
															);
															if (copied) {
																markResultCopied(entry.id);
															}
														}}
													>
														{resultCopied ? (
															<Check className="h-3.5 w-3.5" />
														) : (
															<Copy className="h-3.5 w-3.5" />
														)}
													</Button>
												</TooltipTrigger>
												<TooltipContent side="top">
													{resultCopied ? "Copied" : "Copy result"}
												</TooltipContent>
											</Tooltip>
											<Popover
												open={metadataOpenEntryId === entry.id}
												onOpenChange={(open) =>
													setMetadataOpenEntryId(open ? entry.id : null)
												}
											>
												<Tooltip>
													<TooltipTrigger asChild>
														<PopoverTrigger asChild>
															<Button
																type="button"
																size="icon"
																variant="ghost"
																className="h-7 w-7"
															>
																<Info className="h-3.5 w-3.5" />
															</Button>
														</PopoverTrigger>
													</TooltipTrigger>
													<TooltipContent side="top">Metadata</TooltipContent>
												</Tooltip>
												<PopoverContent align="start" className="w-72">
													<div className="grid gap-1.5 text-sm">
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">Total tokens</span>
															<span>
																{typeof rawResponse?.usage?.total_tokens === "number"
																	? rawResponse.usage.total_tokens
																	: "-"}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">Generation</span>
															<span>
																{typeof rawResponse?.meta?.generation_ms === "number"
																	? `${(rawResponse.meta.generation_ms / 1000).toFixed(1)} s`
																	: "-"}
															</span>
														</div>
													</div>
												</PopoverContent>
											</Popover>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</main>

			<footer className="border-t border-border px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-3xl">
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<input
							ref={fileInputRef}
							type="file"
							multiple
							accept="image/*,audio/*,video/*,text/*"
							className="hidden"
							onChange={(event) => {
								const nextFiles = Array.from(event.target.files ?? []);
								if (nextFiles.length) {
									setFiles((prev) => [...prev, ...nextFiles]);
								}
								event.target.value = "";
							}}
						/>
						<Textarea
							value={textInput}
							onChange={(event) => setTextInput(event.target.value)}
							rows={3}
							placeholder="Text input for embeddings (optional if using URLs/files)..."
							className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						{splitTextModeActive ? (
							<p className="px-1 pb-1 text-[11px] text-muted-foreground">
								Embedding {splitTextEntries.length} text entries (one per line).
							</p>
						) : null}
						{showImageUrlInput || showAudioUrlInput || showVideoUrlInput ? (
							<div className="grid gap-2 px-1 pb-1 md:grid-cols-3">
								{showImageUrlInput ? (
									<Input
										ref={imageUrlInputRef}
										value={imageUrl}
										onChange={(event) => setImageUrl(event.target.value)}
										placeholder="Image URL"
										className="h-8"
									/>
								) : null}
								{showAudioUrlInput ? (
									<Input
										ref={audioUrlInputRef}
										value={audioUrl}
										onChange={(event) => setAudioUrl(event.target.value)}
										placeholder="Audio URL"
										className="h-8"
									/>
								) : null}
								{showVideoUrlInput ? (
									<Input
										ref={videoUrlInputRef}
										value={videoUrl}
										onChange={(event) => setVideoUrl(event.target.value)}
										placeholder="Video URL"
										className="h-8"
									/>
								) : null}
							</div>
						) : null}
						{imageUrl.trim() || audioUrl.trim() || videoUrl.trim() || files.length ? (
							<div className="flex flex-wrap gap-1 px-1 pb-1">
								{imageUrl.trim() ? (
									<button
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
										onClick={() => setImageUrl("")}
									>
										<span className="max-w-[220px] truncate">Image URL</span>
										<X className="h-3 w-3" />
									</button>
								) : null}
								{audioUrl.trim() ? (
									<button
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
										onClick={() => setAudioUrl("")}
									>
										<span className="max-w-[220px] truncate">Audio URL</span>
										<X className="h-3 w-3" />
									</button>
								) : null}
								{videoUrl.trim() ? (
									<button
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
										onClick={() => setVideoUrl("")}
									>
										<span className="max-w-[220px] truncate">Video URL</span>
										<X className="h-3 w-3" />
									</button>
								) : null}
								{files.map((file, index) => (
									<button
										key={`${file.name}-${file.lastModified}-${index}`}
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
										onClick={() =>
											setFiles((prev) =>
												prev.filter((_, fileIndex) => fileIndex !== index),
											)
										}
									>
										<span className="max-w-[220px] truncate">{file.name}</span>
										<X className="h-3 w-3" />
									</button>
								))}
							</div>
						) : null}
						{error ? <RoomErrorNotice error={error} className="mb-2" /> : null}
						<div className="flex items-center justify-between pt-2">
							<div className="flex items-center gap-1.5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											className="h-8 gap-1.5 px-2"
											onClick={openComposerModelPicker}
											disabled={!modelId && filteredModels.length === 0}
										>
											{modelId ? (
												<Logo
													id={composerModelLogoId}
													alt={composerModelLabel}
													width={16}
													height={16}
													className="shrink-0 rounded-none"
												/>
											) : (
												<Cpu className="h-4 w-4 text-muted-foreground" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">{composerModelLabel}</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className={`h-8 w-8 ${
												showImageUrlInput || imageUrl.trim()
													? "bg-muted text-foreground"
													: ""
											}`}
											onClick={() => setShowImageUrlInput((prev) => !prev)}
										>
											<ImagePlus className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">Add image URL</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className={`h-8 w-8 ${
												showAudioUrlInput || audioUrl.trim()
													? "bg-muted text-foreground"
													: ""
											}`}
											onClick={() => setShowAudioUrlInput((prev) => !prev)}
										>
											<AudioLines className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">Add audio URL</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className={`h-8 w-8 ${
												showVideoUrlInput || videoUrl.trim()
													? "bg-muted text-foreground"
													: ""
											}`}
											onClick={() => setShowVideoUrlInput((prev) => !prev)}
										>
											<Clapperboard className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">Add video URL</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className={`h-8 w-8 ${files.length ? "bg-muted text-foreground" : ""}`}
											onClick={() => fileInputRef.current?.click()}
										>
											<Paperclip className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">Upload files</TooltipContent>
								</Tooltip>
							</div>
							<Button
								className="ml-auto"
								onClick={() => {
									void submit();
								}}
								disabled={isLoading || !modelId || !selectedModelEnabled}
							>
								{isLoading ? "Embedding..." : "Embed"}
							</Button>
						</div>
					</div>
				</div>
			</footer>
			{dialogProfile ? (
				<EmbeddingsModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={dialogProfile}
					selectedModelId={dialogModelId}
					modelChoices={modelSettings.modelSettingsChoices}
					onModelChange={modelSettings.handleModelSettingsModelChange}
					providerOptions={modelSettings.providerOptions}
					supportedProvidersForModel={modelSettings.supportedProvidersForModel}
					onUpdateBase={(partial) => updateModelBaseSettings(partial)}
					onUpdateParams={(partial) => updateModelParams(partial)}
					onReset={resetModelSettings}
				/>
			) : null}
			<RoomSearchDialog
				open={conversationSearchOpen}
				onOpenChange={setConversationSearchOpen}
				conversations={conversations}
				onSelectConversation={(conversation) => {
					setActiveConversationId(conversation.id);
					setConversationSearchOpen(false);
					setError(null);
				}}
			/>
		</div>
	);
}
