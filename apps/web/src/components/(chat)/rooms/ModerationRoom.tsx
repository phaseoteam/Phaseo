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
	buildModerationInput,
	normalizeModerationResult,
	type NormalizedModerationResult,
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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	getDefaultModerationRoomParams,
	getModerationThreshold,
	type ModerationRoomParams,
} from "@/lib/chat/roomModelSettings";
import { ModerationModelSettingsDialog } from "@/components/(chat)/rooms/settings/ModerationModelSettingsDialog";
import { RoomErrorNotice } from "@/components/(chat)/rooms/RoomErrorNotice";
import {
	ArrowUpRight,
	Check,
	ChevronRight,
	Copy,
	Cpu,
	Database,
	ImagePlus,
	Info,
	Link2,
	MessageCircleDashed,
	MoreHorizontal,
	Pencil,
	PencilLine,
	Pin,
	PinOff,
	RotateCcw,
	Save,
	Search,
	Settings as SettingsIcon,
	SquarePen,
	Trash2,
	X,
} from "lucide-react";

type ModerationHistoryPayload = {
	conversationId?: string;
	conversationTitle?: string;
	modelId: string;
	providerId?: string;
	text: string;
	imageUrls: string[];
	scoreThreshold: number;
	generationMs?: number;
	result: NormalizedModerationResult | null;
	raw: unknown;
};

type ModerationEntry = {
	id: string;
	createdAt: string;
	conversationId: string;
	conversationTitle: string;
	modelId: string;
	providerId?: string;
	text: string;
	imageUrls: string[];
	scoreThreshold: number;
	generationMs?: number;
	result: NormalizedModerationResult | null;
	raw: unknown;
	isTemporary?: boolean;
};

type ModerationConversation = {
	id: string;
	title: string;
	updatedAt: string;
	messageCount: number;
	pinned: boolean;
};

type GroupedModerationConversations = {
	pinned: ModerationConversation[];
	today: ModerationConversation[];
	yesterday: ModerationConversation[];
	week: ModerationConversation[];
	month: ModerationConversation[];
	older: ModerationConversation[];
};

type ModerationCategoryViewMode = "combined" | "text" | "image";

const MODERATION_PINNED_STORAGE_KEY =
	"ai-stats-moderation-room-pinned-conversations-v1";

const SUPPORTED_MODERATION_UPLOAD_MIME_TYPES = new Set<string>([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);

const IMAGE_WRAPPER_QUERY_KEYS = [
	"mediaurl",
	"mediaUrl",
	"imgurl",
	"image_url",
	"imageUrl",
];

function normalizeImageMimeType(value: string | undefined | null): string {
	const normalized = (value ?? "").trim().toLowerCase();
	if (!normalized) return "";
	if (normalized === "image/jpg") return "image/jpeg";
	return normalized;
}

function hostIsDomainOrSubdomain(hostname: string, domain: string): boolean {
	const host = hostname.toLowerCase();
	const normalizedDomain = domain.toLowerCase();
	return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
}

function isGoogleSearchDomain(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (hostIsDomainOrSubdomain(host, "google.com")) return true;
	return /^google\.[a-z.]+$/.test(host) || /^www\.google\.[a-z.]+$/.test(host);
}

function isYandexDomain(hostname: string): boolean {
	return /(^|\.)yandex\./.test(hostname.toLowerCase());
}

function isLikelyImageSearchPage(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith("data:image/")) return false;
	if (!/^https?:\/\//i.test(trimmed)) return false;
	try {
		const parsed = new URL(trimmed);
		const host = parsed.hostname.toLowerCase();
		const pathname = parsed.pathname.toLowerCase();
		if (
			hostIsDomainOrSubdomain(host, "bing.com") &&
			pathname.startsWith("/images/search")
		) {
			return true;
		}
		if (
			isGoogleSearchDomain(host) &&
			(pathname.startsWith("/imgres") || pathname.startsWith("/search"))
		) {
			return true;
		}
		if (hostIsDomainOrSubdomain(host, "duckduckgo.com") && pathname.startsWith("/")) {
			const ia = parsed.searchParams.get("ia")?.toLowerCase();
			if (ia === "images") return true;
		}
		if (isYandexDomain(host) && pathname.includes("/images/")) {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

function normalizeImageUrlForModeration(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("data:image/")) return trimmed;
	try {
		const parsed = new URL(trimmed);
		for (const key of IMAGE_WRAPPER_QUERY_KEYS) {
			const candidate = parsed.searchParams.get(key)?.trim();
			if (!candidate) continue;
			if (candidate.startsWith("data:image/")) return candidate;
			if (/^https?:\/\//i.test(candidate)) return candidate;
		}
		return trimmed;
	} catch {
		return trimmed;
	}
}

function detectImageMimeType(bytes: Uint8Array): string | null {
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	if (
		bytes.length >= 3 &&
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff
	) {
		return "image/jpeg";
	}
	if (
		bytes.length >= 6 &&
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif";
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function fileToDataUrl(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let mimeType = normalizeImageMimeType(file.type);
	if (!mimeType || !SUPPORTED_MODERATION_UPLOAD_MIME_TYPES.has(mimeType)) {
		const detected = detectImageMimeType(bytes);
		mimeType = normalizeImageMimeType(detected ?? mimeType);
	}
	if (!SUPPORTED_MODERATION_UPLOAD_MIME_TYPES.has(mimeType)) {
		throw new Error(
			'Unsupported image format. Use PNG, JPEG, WEBP, or GIF for moderation uploads.',
		);
	}
	return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function nowIso() {
	return new Date().toISOString();
}

function createConversationId(): string {
	return `moderation-${crypto.randomUUID()}`;
}

function truncateTitle(value: string, max = 72): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: ModerationHistoryPayload;
}): ModerationEntry {
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
				: "Past moderations",
		modelId: payload.modelId,
		providerId:
			typeof payload.providerId === "string" && payload.providerId.trim()
				? payload.providerId.trim()
				: undefined,
		text: payload.text,
		imageUrls: Array.isArray(payload.imageUrls)
			? payload.imageUrls.filter((value) => typeof value === "string")
			: [],
		scoreThreshold: payload.scoreThreshold,
		generationMs:
			typeof payload.generationMs === "number" &&
			Number.isFinite(payload.generationMs)
				? payload.generationMs
				: getGenerationMs(payload.raw) ?? undefined,
		result: payload.result,
		raw: payload.raw,
	};
}

function toHistoryPayload(entry: ModerationEntry): ModerationHistoryPayload {
	return {
		conversationId: entry.conversationId,
		conversationTitle: entry.conversationTitle,
		modelId: entry.modelId,
		providerId: entry.providerId,
		text: entry.text,
		imageUrls: entry.imageUrls,
		scoreThreshold: entry.scoreThreshold,
		generationMs:
			typeof entry.generationMs === "number" && Number.isFinite(entry.generationMs)
				? entry.generationMs
				: undefined,
		result: entry.result,
		raw: entry.raw,
	};
}

function isEntryFlagged(entry: ModerationEntry) {
	if (entry.result?.flagged) return true;
	const threshold = Math.max(0, Math.min(1, entry.scoreThreshold || 0.5));
	const scores = Object.values(entry.result?.categoryScores ?? {});
	return scores.some((score) => Number(score) >= threshold);
}

function formatCategoryLabel(category: string): string {
	const toTitleCase = (value: string) =>
		value
			.split(/[\s_-]+/)
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	return category
		.split("/")
		.map((segment) => toTitleCase(segment.trim()))
		.join(" / ");
}

function formatAppliedInputTypes(types: Array<"text" | "image">): string {
	const hasText = types.includes("text");
	const hasImage = types.includes("image");
	if (hasText && hasImage) return "Text + Image";
	if (hasText) return "Text";
	if (hasImage) return "Image";
	return "Unknown";
}

function getGenerationMs(raw: unknown): number | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, any>;
	const fromMeta = record.meta?.generation_ms ?? record.meta?.generationMs;
	const direct = record.generation_ms ?? record.generationMs;
	const candidate = fromMeta ?? direct;
	return typeof candidate === "number" && Number.isFinite(candidate)
		? candidate
		: null;
}

function mapModerationErrorMessage(rawText: string): string {
	const fallback = rawText.trim();
	try {
		const parsed = JSON.parse(rawText) as Record<string, any>;
		const upstreamCode =
			parsed?.upstream_error?.code ??
			parsed?.failure_sample?.[0]?.upstream_error_code ??
			null;
		if (
			upstreamCode === "invalid_image_format" ||
			upstreamCode === "unsupported_image_format"
		) {
			return "Unsupported image format. Use a direct image URL (PNG/JPEG/WEBP/GIF) or upload an image file. If using Bing/Google image search links, open the image itself and copy that direct image URL.";
		}
		if (upstreamCode === "invalid_image_url") {
			return "Invalid image URL. Please use a publicly reachable direct image URL (or upload a local image file).";
		}
		const description =
			typeof parsed?.description === "string" ? parsed.description.trim() : "";
		if (description) return description;
		const upstreamMessage =
			typeof parsed?.upstream_error?.message === "string"
				? parsed.upstream_error.message.trim()
				: "";
		if (upstreamMessage) return upstreamMessage;
	} catch {
		// keep fallback
	}
	return fallback || "Moderation request failed.";
}

function buildConversations(
	entries: ModerationEntry[],
	pinnedById: Record<string, boolean>,
): ModerationConversation[] {
	const byId = new Map<string, ModerationConversation>();
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
			(existing.title === "Past moderations" || !existing.title.trim()) &&
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
	conversations: ModerationConversation[],
	nowMs: number,
): GroupedModerationConversations {
	const groups: GroupedModerationConversations = {
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

export function ModerationRoom({ models }: { models: GatewaySupportedModel[] }) {
	const { toggleSidebar, state: sidebarState, isMobile } = useSidebar();
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const filteredModels = useMemo(
		() =>
			filterModelsForRoom(models, "moderation").filter(
				(model) => model.isAvailable,
			),
		[models],
	);
	const [modelId, setModelId] = useState("");
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [text, setText] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<ModerationEntry[]>([]);
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(null);
	const [pinnedConversationIds, setPinnedConversationIds] = useState<Record<string, boolean>>({});
	const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [metadataOpenEntryId, setMetadataOpenEntryId] = useState<string | null>(null);
	const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [categoryViewByEntryId, setCategoryViewByEntryId] = useState<
		Record<string, ModerationCategoryViewMode>
	>({});
	const [showImageUrlInput, setShowImageUrlInput] = useState(false);
	const [conversationGroupingNowMs, setConversationGroupingNowMs] = useState<number | null>(
		null,
	);
	const imageUrlInputRef = useRef<HTMLInputElement | null>(null);
	const imageFileInputRef = useRef<HTMLInputElement | null>(null);
	const copiedTimeoutRef = useRef<number | null>(null);
	const modelSettings = useRoomModelSettings({
		roomId: "moderation",
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: () => getDefaultModerationRoomParams(),
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
		const stored = window.localStorage.getItem(MODERATION_PINNED_STORAGE_KEY);
		setPinnedConversationIds(safeParsePinned(stored));
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(
			MODERATION_PINNED_STORAGE_KEY,
			JSON.stringify(pinnedConversationIds),
		);
	}, [pinnedConversationIds]);

	useEffect(() => {
		let mounted = true;
		void listRoomHistory<ModerationHistoryPayload>(
			"moderation" as NonTextRoomId,
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
			if (copiedTimeoutRef.current !== null) {
				window.clearTimeout(copiedTimeoutRef.current);
			}
		};
	}, []);

	const startNewConversation = () => {
		setModelId("");
		setActiveConversationId(createConversationId());
		setText("");
		setImageUrl("");
		setImageFile(null);
		setError(null);
	};

	const toggleTemporaryMode = () => {
		if (!temporaryMode) {
			setTemporaryMode(true);
			setActiveConversationId(createConversationId());
			setText("");
			setImageUrl("");
			setImageFile(null);
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
		setText("");
		setImageUrl("");
		setImageFile(null);
		setError(null);
	};

	const addEntry = async (entry: ModerationEntry) => {
		setEntries((prev) => [entry, ...prev]);
		if (entry.isTemporary) return;
		await upsertRoomHistory<ModerationHistoryPayload>({
			id: entry.id,
			roomId: "moderation",
			createdAt: entry.createdAt,
			updatedAt: entry.createdAt,
			payload: toHistoryPayload(entry),
		});
	};

	const updateEntry = async (
		entryId: string,
		transform: (entry: ModerationEntry) => ModerationEntry,
	) => {
		const current = entries.find((entry) => entry.id === entryId);
		if (!current) return;
		const updated = transform(current);
		setEntries((prev) =>
			prev.map((entry) => (entry.id === entryId ? updated : entry)),
		);
		if (updated.isTemporary) return;
		await upsertRoomHistory<ModerationHistoryPayload>({
			id: updated.id,
			roomId: "moderation",
			createdAt: updated.createdAt,
			updatedAt: nowIso(),
			payload: toHistoryPayload(updated),
		});
	};

	const toggleConversationPin = (conversation: ModerationConversation) => {
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

	const renameConversation = async (conversation: ModerationConversation) => {
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
				const updatedEntry: ModerationEntry = {
					...entry,
					conversationTitle: nextTitle,
				};
				return upsertRoomHistory<ModerationHistoryPayload>({
					id: updatedEntry.id,
					roomId: "moderation",
					createdAt: updatedEntry.createdAt,
					updatedAt: nowIso(),
					payload: toHistoryPayload(updatedEntry),
				});
			}),
		);
	};

	const deleteConversation = async (conversation: ModerationConversation) => {
		if (typeof window === "undefined") return;
		const confirmed = window.confirm(
			`Delete "${conversation.title}" and all checks inside it?`,
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

	const markCopied = (key: string) => {
		setCopiedKey(key);
		if (copiedTimeoutRef.current !== null) {
			window.clearTimeout(copiedTimeoutRef.current);
		}
		copiedTimeoutRef.current = window.setTimeout(() => {
			setCopiedKey((current) => (current === key ? null : current));
			copiedTimeoutRef.current = null;
		}, 1500);
	};

	const startEditPrompt = (entry: ModerationEntry) => {
		setEditingEntryId(entry.id);
		setEditingValue(entry.text);
	};

	const cancelEditPrompt = () => {
		setEditingEntryId(null);
		setEditingValue("");
	};

	const saveEditedPrompt = async (entry: ModerationEntry) => {
		const nextText = editingValue.trim();
		if (!nextText) return;
		await updateEntry(entry.id, (current) => ({
			...current,
			text: nextText,
			conversationTitle:
				current.conversationTitle === "Past moderations"
					? truncateTitle(nextText)
					: current.conversationTitle,
		}));
		cancelEditPrompt();
	};

	const retryEntry = async (entry: ModerationEntry) => {
		if (!selectedModelEnabled || isLoading) return;
		setModelId(entry.modelId);
		setText(entry.text);
		setImageUrl(entry.imageUrls[0] ?? "");
		setImageFile(null);
		requestAnimationFrame(() => {
			void submit({
				forcedText: entry.text,
				forcedImageUrls: entry.imageUrls,
				forcedModelId: entry.modelId,
				forcedConversationId: entry.conversationId,
				forcedConversationTitle: entry.conversationTitle,
			});
		});
	};

	const buildResultCopyText = (params: {
		entry: ModerationEntry;
		modelLabel: string;
		flagged: boolean;
		threshold: number;
		generationMs: number | null;
		rows: Array<{
			category: string;
			score: number;
			categoryFlagged: boolean;
			aboveThreshold: boolean;
			appliedInputTypes: Array<"text" | "image">;
		}>;
	}) => {
		const { entry, modelLabel, flagged, threshold, generationMs, rows } = params;
		const lines: string[] = [];
		lines.push("Moderation Result");
		lines.push(`Model: ${modelLabel}`);
		lines.push(`Status: ${flagged ? "Flagged" : "Clear"}`);
		lines.push(`Threshold: ${(threshold * 100).toFixed(0)}%`);
		const flaggedTypes = Array.from(
			new Set(
				rows
					.filter((row) => row.categoryFlagged || row.aboveThreshold)
					.flatMap((row) => row.appliedInputTypes),
			),
		).filter((type): type is "text" | "image" => type === "text" || type === "image");
		if (flaggedTypes.length) {
			lines.push(`Flag source: ${formatAppliedInputTypes(flaggedTypes)}`);
		}
		if (typeof generationMs === "number" && Number.isFinite(generationMs)) {
			lines.push(`Generation: ${(generationMs / 1000).toFixed(2)} s`);
		}
		if (entry.text.trim()) {
			lines.push(`Input: ${entry.text.trim()}`);
		}
		if (entry.imageUrls.length) {
			lines.push(`Images: ${entry.imageUrls.length}`);
		}
		lines.push(
			"Scoring note: each category has one combined score. Source indicates which input type(s) were applied for that category.",
		);
		lines.push("");
		lines.push("Categories:");
		for (const row of rows) {
			const status = row.categoryFlagged || row.aboveThreshold ? "Risk" : "Clear";
			const source =
				row.appliedInputTypes.length > 0
					? formatAppliedInputTypes(row.appliedInputTypes)
					: "Unknown";
			lines.push(
				`- ${formatCategoryLabel(row.category)}: ${status} (${(row.score * 100).toFixed(2)}%, ${source})`,
			);
		}
		return lines.join("\n");
	};

	const submit = async (overrides?: {
		forcedText?: string;
		forcedImageUrls?: string[];
		forcedModelId?: string;
		forcedConversationId?: string;
		forcedConversationTitle?: string;
	}) => {
		const targetModelId = overrides?.forcedModelId ?? modelId;
		if (isLoading || !targetModelId || !selectedModelEnabled) return;
		const inputText = (overrides?.forcedText ?? text).trim();
		if (!inputText && !imageUrl.trim() && !imageFile && !overrides?.forcedImageUrls?.length) {
			return;
		}
		setError(null);
		setIsLoading(true);
		try {
			const resolvedImageUrls: string[] = [];
			if (overrides?.forcedImageUrls?.length) {
				for (const value of overrides.forcedImageUrls) {
					if (typeof value === "string" && value.trim()) {
						resolvedImageUrls.push(value.trim());
					}
				}
			} else {
				if (imageUrl.trim()) {
					const normalizedInputUrl = normalizeImageUrlForModeration(imageUrl);
					if (normalizedInputUrl) {
						resolvedImageUrls.push(normalizedInputUrl);
					}
				}
				if (imageFile) {
					const dataUrl = await fileToDataUrl(imageFile);
					resolvedImageUrls.push(dataUrl);
				}
			}

			if (
				resolvedImageUrls.length &&
				resolvedImageUrls.some(
					(url) =>
						!url.startsWith("data:image/") &&
						isLikelyImageSearchPage(url),
				)
			) {
				throw new Error(
					"Please use a direct image URL (not an image search results page link).",
				);
			}
			const conversationId =
				overrides?.forcedConversationId ??
				activeConversationId ??
				createConversationId();
			if (!activeConversationId) {
				setActiveConversationId(conversationId);
			}
			const existingTitle = activeConversation?.title?.trim() ?? "";
			const candidateTitle = inputText
				? truncateTitle(inputText)
				: resolvedImageUrls[0]
					? truncateTitle(resolvedImageUrls[0])
					: `Moderation ${new Date().toLocaleDateString()}`;
			const conversationTitle =
				overrides?.forcedConversationTitle ||
				(temporaryMode ? "Temporary chat" : existingTitle || candidateTitle);

			const input = buildModerationInput({
				text: inputText,
				imageUrls: resolvedImageUrls,
			});

			const response = await fetch("/api/chat/moderation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: targetModelId,
						...(selectedProviderId &&
						selectedProviderId !== "auto" &&
						targetModelId === modelId
							? {
									provider: {
										only: [selectedProviderId],
									},
								}
							: {}),
						input,
						meta: true,
					},
					appHeaders: APP_HEADERS,
				}),
			});
			if (!response.ok) {
				const body = await response.text();
				throw new Error(
					mapModerationErrorMessage(body) ||
						`Moderation request failed (${response.status}).`,
				);
			}
			const payload = await response.json();
			const normalized = normalizeModerationResult(payload);
			const generationMs = getGenerationMs(payload);
			const scoreThreshold = getModerationThreshold(
				(selectedProfile?.params as ModerationRoomParams) ??
					getDefaultModerationRoomParams(),
			);
			const entry: ModerationEntry = {
				id: crypto.randomUUID(),
				createdAt: nowIso(),
				conversationId,
				conversationTitle,
				modelId: targetModelId,
				providerId:
					selectedProviderId && selectedProviderId !== "auto"
						? selectedProviderId
						: undefined,
				text: inputText,
				imageUrls: resolvedImageUrls,
				scoreThreshold,
				generationMs: generationMs ?? undefined,
				result: normalized,
				raw: payload,
				isTemporary: temporaryMode,
			};
			await addEntry(entry);
			if (!overrides?.forcedText) {
				setText("");
				setImageUrl("");
				setImageFile(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Moderation failed");
		} finally {
			setIsLoading(false);
		}
	};

	const renderConversationSection = (
		label: string,
		items: ModerationConversation[],
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
						<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
							<div>
								<p className="text-base font-semibold">Start a new conversation</p>
								<p className="text-sm text-muted-foreground">
									Submit text or an image to run moderation.
								</p>
							</div>
						</div>
					) : (
						activeEntries.map((entry) => {
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
							const flagged = isEntryFlagged(entry);
							const threshold = Math.max(0, Math.min(1, entry.scoreThreshold || 0.5));
							const categoryRows = entry.result
								? Array.from(
										new Set([
										...Object.keys(entry.result.categories ?? {}),
										...Object.keys(entry.result.categoryScores ?? {}),
										...Object.keys(
											entry.result.categoryAppliedInputTypes ?? {},
										),
									]),
								)
									.map((category) => {
											const score = Number(
												entry.result?.categoryScores?.[category] ?? 0,
											);
											const scoreSafe = Number.isFinite(score) ? score : 0;
											const categoryFlagged = Boolean(
												entry.result?.categories?.[category],
											);
											const appliedInputTypes = Array.from(
												new Set(
													entry.result?.categoryAppliedInputTypes?.[
														category
													] ?? [],
												),
											).filter(
												(type): type is "text" | "image" =>
													type === "text" || type === "image",
											);
											return {
												category,
												score: scoreSafe,
												categoryFlagged,
												aboveThreshold: scoreSafe >= threshold,
												appliedInputTypes,
											};
										})
										.sort((a, b) => b.score - a.score)
								: [];
							const highestCategory = categoryRows[0] ?? null;
							const maxScore = highestCategory?.score ?? 0;
							const aboveThresholdCount = categoryRows.filter(
								(row) => row.aboveThreshold,
							).length;
							const hasTextCategories = categoryRows.some((row) =>
								row.appliedInputTypes.includes("text"),
							);
							const hasImageCategories = categoryRows.some((row) =>
								row.appliedInputTypes.includes("image"),
							);
							const showCategoryViewSelector =
								hasTextCategories && hasImageCategories;
							const selectedCategoryView = showCategoryViewSelector
								? categoryViewByEntryId[entry.id] ?? "combined"
								: "combined";
							const visibleCategoryRows = categoryRows.filter((row) => {
								if (selectedCategoryView === "combined") return true;
								return row.appliedInputTypes.includes(selectedCategoryView);
							});
							const generationMs =
								(typeof entry.generationMs === "number" &&
								Number.isFinite(entry.generationMs)
									? entry.generationMs
									: getGenerationMs(entry.raw));
							const generationSeconds =
								typeof generationMs === "number"
									? Math.max(0, Math.round(generationMs / 100) / 10)
									: null;
							const promptCopyKey = `prompt:${entry.id}`;
							const resultCopyKey = `result:${entry.id}`;
							const promptCopied = copiedKey === promptCopyKey;
							const resultCopied = copiedKey === resultCopyKey;
							const isEditing = editingEntryId === entry.id;

							return (
								<div key={entry.id} className="space-y-3">
									<div className="ml-auto w-full max-w-2xl">
										{isEditing ? (
											<div className="grid gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-background">
												<Textarea
													value={editingValue}
													onChange={(event) =>
														setEditingValue(event.target.value)
													}
													rows={3}
													className="min-h-[100px] resize-none border-white/20 bg-transparent text-background"
												/>
												<div className="flex items-center justify-end gap-2">
													<Button
														size="sm"
														variant="ghost"
														className="text-background hover:bg-white/10 hover:text-background"
														onClick={cancelEditPrompt}
													>
														<X className="mr-1 h-4 w-4" />
														Cancel
													</Button>
													<Button
														size="sm"
														variant="secondary"
														onClick={() => {
															void saveEditedPrompt(entry);
														}}
													>
														<Save className="mr-1 h-4 w-4" />
														Save
													</Button>
												</div>
											</div>
										) : (
											<div className="rounded-2xl bg-foreground px-4 py-3 text-sm text-background">
												{entry.text ? (
													<p className="whitespace-pre-wrap">{entry.text}</p>
												) : null}
												{entry.imageUrls.length ? (
													<div className="mt-2 grid gap-2 sm:grid-cols-2">
														{entry.imageUrls.slice(0, 4).map((url, index) => (
															<img
																key={`${entry.id}-input-${index}`}
																src={url}
																alt="Moderation input"
																className="max-h-44 w-full rounded-md border border-white/20 object-cover"
															/>
														))}
													</div>
												) : null}
											</div>
										)}
										<div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="h-7 w-7"
														onClick={() => {
															const copied = copyText(entry.text);
															if (copied) {
																markCopied(promptCopyKey);
															}
														}}
														disabled={!entry.text.trim()}
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
														onClick={() => startEditPrompt(entry)}
													>
														<Pencil className="h-3.5 w-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent side="top">Edit prompt</TooltipContent>
											</Tooltip>
										</div>
									</div>

									<div className="mr-auto w-full max-w-3xl">
										<Link
											href={modelHref}
											className="mb-2 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
										>
											<Logo
												id={logoId}
												alt={logoAlt}
												width={16}
												height={16}
												className="shrink-0 rounded-none"
											/>
											<span className="truncate">{modelLabel}</span>
										</Link>
										<div className="space-y-3 rounded-2xl border border-border bg-card p-3">
											<div className="flex items-center justify-end">
												<span
													className={`rounded-full px-2 py-1 text-xs font-medium ${
														flagged
															? "bg-destructive/10 text-destructive"
															: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													}`}
												>
													{flagged ? "Flagged" : "Clear"}
												</span>
											</div>
											{entry.result ? (
												<div className="space-y-3">
													<div className="rounded-xl border border-border bg-muted/20 p-3">
														<div className="mb-2 flex items-center justify-between">
															<p className="text-xs font-semibold uppercase text-muted-foreground">
																Top signal
															</p>
															<p className="text-xs text-muted-foreground">
																Threshold {(threshold * 100).toFixed(0)}%
															</p>
														</div>
														{highestCategory ? (
															<div className="flex flex-wrap items-center justify-between gap-2">
																<div>
																	<p className="text-sm font-medium">
																		{formatCategoryLabel(
																			highestCategory.category,
																		)}
																	</p>
																	<p className="text-xs text-muted-foreground">
																		{aboveThresholdCount} categories at or above threshold
																		{highestCategory.appliedInputTypes.length
																			? ` • ${formatAppliedInputTypes(
																					highestCategory.appliedInputTypes,
																				)}`
																			: ""}
																	</p>
																</div>
																<span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
																	{(highestCategory.score * 100).toFixed(2)}%
																</span>
															</div>
														) : (
															<p className="text-xs text-muted-foreground">
																No category scores returned.
															</p>
														)}
													</div>

													<div className="space-y-2">
														<div className="flex items-center justify-between gap-2">
															<p className="text-xs font-semibold uppercase text-muted-foreground">
																Categories
															</p>
															{showCategoryViewSelector ? (
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			type="button"
																			variant="ghost"
																			className="h-6 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
																		>
																			{selectedCategoryView === "combined"
																				? "All"
																				: selectedCategoryView === "text"
																					? "Text Only"
																					: "Image Only"}
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end" className="w-28">
																		<DropdownMenuItem
																			onClick={() =>
																				setCategoryViewByEntryId((prev) => ({
																					...prev,
																					[entry.id]: "combined",
																				}))
																			}
																		>
																			All
																		</DropdownMenuItem>
																		<DropdownMenuItem
																			onClick={() =>
																				setCategoryViewByEntryId((prev) => ({
																					...prev,
																					[entry.id]: "text",
																				}))
																			}
																		>
																			Text Only
																		</DropdownMenuItem>
																		<DropdownMenuItem
																			onClick={() =>
																				setCategoryViewByEntryId((prev) => ({
																					...prev,
																					[entry.id]: "image",
																				}))
																			}
																		>
																			Image Only
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															) : null}
														</div>
														<p className="text-[11px] text-muted-foreground">
															{selectedCategoryView === "combined"
																? "Scores are combined per category. Source indicates whether text, image, or both contributed."
																: `Showing categories attributed to ${selectedCategoryView}. Scores are still combined per category.`}
														</p>
														{visibleCategoryRows.length ? (
															<div className="grid gap-2 md:grid-cols-2">
																{visibleCategoryRows.map((row) => (
																<div
																	key={row.category}
																	className="rounded-md border border-border px-2 py-2 text-xs"
																>
																	<div className="mb-1.5 flex items-center justify-between gap-2">
																		<span className="truncate">
																			{formatCategoryLabel(row.category)}
																		</span>
																		<div className="flex items-center gap-2">
																			{row.appliedInputTypes.length ? (
																				<span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
																					{formatAppliedInputTypes(
																						row.appliedInputTypes,
																					)}
																				</span>
																			) : null}
																			<span
																				className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
																					row.categoryFlagged ||
																					row.aboveThreshold
																						? "bg-destructive/10 text-destructive"
																						: "bg-muted text-muted-foreground"
																				}`}
																			>
																				{row.categoryFlagged ||
																				row.aboveThreshold
																					? "Risk"
																					: "Clear"}
																			</span>
																			<span className="font-medium">
																				{(row.score * 100).toFixed(2)}%
																			</span>
																		</div>
																	</div>
																	<div className="h-1.5 overflow-hidden rounded-full bg-muted">
																		<div
																			className={`h-full ${
																				row.categoryFlagged ||
																				row.aboveThreshold
																					? "bg-destructive/70"
																					: "bg-foreground/35"
																			}`}
																			style={{
																				width: `${Math.max(
																					2,
																					Math.min(
																						100,
																						row.score * 100,
																					),
																				)}%`,
																			}}
																		/>
																	</div>
																</div>
																))}
															</div>
														) : (
															<p className="text-xs text-muted-foreground">
																No categories for this view.
															</p>
														)}
													</div>
												</div>
											) : (
												<p className="text-xs text-muted-foreground">
													No moderation categories returned.
												</p>
											)}
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
																buildResultCopyText({
																	entry,
																	modelLabel,
																	flagged,
																	threshold,
																	generationMs,
																	rows: categoryRows,
																}),
															);
															if (copied) {
																markCopied(resultCopyKey);
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
													<div className="grid gap-3 text-sm">
														<div className="grid gap-1.5">
															<div className="flex items-center justify-between">
																<span className="text-muted-foreground">
																	Generation
																</span>
																<span>
																	{generationSeconds === null
																		? "-"
																		: `${generationSeconds.toFixed(1)} s`}
																</span>
															</div>
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
							ref={imageFileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp,image/gif"
							className="hidden"
							onChange={(event) =>
								setImageFile(event.target.files?.[0] ?? null)
							}
						/>
						<Textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									void submit();
								}
							}}
							rows={3}
							placeholder="Text to moderate..."
							className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						{showImageUrlInput ? (
							<div className="px-1 pb-1">
								<Input
									ref={imageUrlInputRef}
									value={imageUrl}
									onChange={(event) => setImageUrl(event.target.value)}
									placeholder="Paste image URL..."
									className="h-8"
								/>
							</div>
						) : null}
						{imageUrl.trim() || imageFile ? (
							<div className="flex flex-wrap gap-1 px-1 pb-1">
								{imageUrl.trim() ? (
									<button
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
										onClick={() => setImageUrl("")}
									>
										<span className="max-w-[220px] truncate">Image URL added</span>
										<X className="h-3 w-3" />
									</button>
								) : null}
								{imageFile ? (
									<button
										type="button"
										className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
										onClick={() => {
											setImageFile(null);
											if (imageFileInputRef.current) {
												imageFileInputRef.current.value = "";
											}
										}}
									>
										<span className="max-w-[220px] truncate">{imageFile.name}</span>
										<X className="h-3 w-3" />
									</button>
								) : null}
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
											onClick={() =>
												setShowImageUrlInput((prev) => !prev)
											}
										>
											<Link2 className="h-4 w-4" />
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
											className={`h-8 w-8 ${imageFile ? "bg-muted text-foreground" : ""}`}
											onClick={() => imageFileInputRef.current?.click()}
										>
											<ImagePlus className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">Upload image</TooltipContent>
								</Tooltip>
							</div>
							<Button
								className="ml-auto"
								onClick={() => {
									void submit();
								}}
								disabled={isLoading || !modelId || !selectedModelEnabled}
							>
								{isLoading ? "Moderating..." : "Moderate"}
							</Button>
						</div>
					</div>
				</div>
			</footer>
			{dialogProfile ? (
				<ModerationModelSettingsDialog
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
