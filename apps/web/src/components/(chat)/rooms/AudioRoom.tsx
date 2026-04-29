"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import { inferAudioMimeType } from "@/components/(chat)/chatConversationHelpers";
import { extractGenerationUrls } from "@/lib/chat/roomRequestBuilders";
import {
	deleteRoomHistory,
	listRoomHistory,
	upsertRoomHistory,
	type NonTextRoomId,
} from "@/lib/indexeddb/chatRoomHistory";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	MediaPlayer,
	MediaPlayerAudio,
	MediaPlayerControls,
	MediaPlayerError,
	MediaPlayerLoading,
	MediaPlayerPlay,
	MediaPlayerSeek,
	MediaPlayerSettings,
	MediaPlayerTime,
	MediaPlayerVolume,
	MediaPlayerVolumeIndicator,
} from "@/components/ui/media-player";
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
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	buildAudioRequestOptions,
	getDefaultAudioRoomParams,
	getAudioModeSupportForCapabilities,
	mergeAudioModeSupport,
	type AudioModeSupport,
	type AudioRoomParams,
} from "@/lib/chat/roomModelSettings";
import { AudioModelSettingsDialog } from "@/components/(chat)/rooms/settings/AudioModelSettingsDialog";
import { RoomErrorNotice } from "@/components/(chat)/rooms/RoomErrorNotice";
import {
	AudioLines,
	ArrowUpRight,
	Check,
	ChevronRight,
	Copy,
	Cpu,
	Database,
	Download,
	Info,
	Languages,
	Loader2,
	MessageCircleDashed,
	Mic,
	MoreHorizontal,
	Music2,
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

type AudioMode = "speech" | "transcription" | "translation" | "music";

type AudioHistoryPayload = {
	conversationId?: string;
	conversationTitle?: string;
	conversationMode?: AudioMode;
	modelId: string;
	providerId?: string;
	mode: AudioMode;
	promptText?: string;
	inputText?: string;
	musicLyrics?: string;
	text?: string;
	audioUrl?: string;
	audioDataUrl?: string;
	metrics?: AudioEntryMetrics;
	raw?: unknown;
};

type AudioEntryMetrics = {
	totalTokens?: number;
	promptTokens?: number;
	completionTokens?: number;
	cachedPromptTokens?: number;
	reasoningTokens?: number;
	latencyMs?: number;
	generationMs?: number;
	throughputTps?: number;
};

type AudioEntry = {
	id: string;
	createdAt: string;
	conversationId: string;
	conversationTitle: string;
	modelId: string;
	providerId?: string;
	mode: AudioMode;
	conversationMode?: AudioMode;
	inputText?: string;
	musicLyrics?: string;
	text?: string;
	audioSrc?: string;
	isTemporary?: boolean;
	isPending?: boolean;
	metrics?: AudioEntryMetrics;
	raw?: unknown;
};

type AudioConversation = {
	id: string;
	title: string;
	mode: AudioMode;
	updatedAt: string;
	messageCount: number;
	pinned: boolean;
};

type GroupedAudioConversations = {
	pinned: AudioConversation[];
	today: AudioConversation[];
	yesterday: AudioConversation[];
	week: AudioConversation[];
	month: AudioConversation[];
	older: AudioConversation[];
};

const AUDIO_MODE_SUPPORT_FALLBACK: AudioModeSupport = {
	speech: true,
	transcription: true,
	translation: true,
	music: false,
};

// Temporary UI clamp: keep audio room focused on prompt-driven generation flows for now.
const AUDIO_MODE_UI_ENABLED: AudioModeSupport = {
	speech: true,
	transcription: false,
	translation: false,
	music: true,
};

const AUDIO_MODE_OPTIONS: AudioMode[] = [
	"speech",
	"music",
	"transcription",
	"translation",
];
const AUDIO_PINNED_STORAGE_KEY = "ai-stats-audio-room-pinned-conversations-v1";
const MUSIC_POLL_INTERVAL_MS = 2_500;
const MUSIC_POLL_MAX_ATTEMPTS = 36;

function nowIso() {
	return new Date().toISOString();
}

function createConversationId(): string {
	return `audio-${crypto.randomUUID()}`;
}

function truncateTitle(value: string, max = 72): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function modeLabel(mode: AudioMode): string {
	if (mode === "speech") return "Speech";
	if (mode === "music") return "Music";
	if (mode === "transcription") return "Transcription";
	return "Translation";
}

function modeBusyLabel(mode: AudioMode): string {
	if (mode === "speech") return "Converting to speech...";
	if (mode === "music") return "Generating music...";
	if (mode === "transcription") return "Transcribing audio...";
	return "Translating audio...";
}

function modeIcon(mode: AudioMode) {
	if (mode === "speech") return <Mic className="h-3.5 w-3.5" />;
	if (mode === "music") return <Music2 className="h-3.5 w-3.5" />;
	if (mode === "transcription") return <AudioLines className="h-3.5 w-3.5" />;
	return <Languages className="h-3.5 w-3.5" />;
}

function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const [, b64 = ""] = result.split(",", 2);
			resolve(b64);
		};
		reader.readAsDataURL(file);
	});
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("Blob read failed"));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsDataURL(blob);
	});
}

function extractInlineAudioDataUrl(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const audio = (payload as Record<string, any>).audio;
	if (!audio || typeof audio !== "object") return undefined;
	const data = typeof audio.data === "string" ? audio.data.trim() : "";
	if (!data) return undefined;
	if (data.startsWith("data:")) return data;
	const mimeType =
		typeof (payload as Record<string, any>).mime_type === "string"
			? String((payload as Record<string, any>).mime_type).trim()
			: "audio/mpeg";
	return `data:${mimeType || "audio/mpeg"};base64,${data}`;
}

function normalizeAudioMimeType(mimeType: string | undefined): string {
	const value = (mimeType ?? "").trim().toLowerCase();
	if (!value) return "audio/mpeg";
	if (value.includes("/")) return value;
	if (value === "mp3") return "audio/mpeg";
	if (value === "wav") return "audio/wav";
	if (value === "pcm") return "audio/wav";
	if (value === "opus") return "audio/opus";
	return "audio/mpeg";
}

function isLikelyBase64(value: string): boolean {
	if (!value || value.length < 32) return false;
	const compact = value.replace(/\s+/g, "");
	return compact.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(compact);
}

function isLikelyHexEncodedAudio(value: string): boolean {
	if (!value || value.length < 64) return false;
	const compact = value.replace(/\s+/g, "");
	return compact.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(compact);
}

function hexToBase64(value: string): string | null {
	const compact = value.replace(/\s+/g, "");
	if (!isLikelyHexEncodedAudio(compact)) return null;
	try {
		const bytes = new Uint8Array(compact.length / 2);
		for (let i = 0; i < compact.length; i += 2) {
			bytes[i / 2] = Number.parseInt(compact.slice(i, i + 2), 16);
		}
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary);
	} catch {
		return null;
	}
}

function coerceAudioStringToSource(value: string, mimeType: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith("data:audio/")) return trimmed;
	if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("blob:")) {
		return trimmed;
	}
	if (isLikelyHexEncodedAudio(trimmed)) {
		const base64 = hexToBase64(trimmed);
		if (base64) return `data:${mimeType};base64,${base64}`;
		return undefined;
	}
	if (isLikelyBase64(trimmed)) {
		return `data:${mimeType};base64,${trimmed.replace(/\s+/g, "")}`;
	}
	return undefined;
}

function extractAudioFromPayload(payload: unknown): string | undefined {
	const asRecord =
		payload && typeof payload === "object"
			? (payload as Record<string, unknown>)
			: null;
	if (!asRecord) return undefined;

	const directInline = extractInlineAudioDataUrl(payload);
	if (directInline) return directInline;

	const mimeType = normalizeAudioMimeType(
		typeof asRecord.mime_type === "string"
			? asRecord.mime_type
			: typeof asRecord.format === "string"
				? asRecord.format
				: undefined,
	);
	const directAudioUrl =
		typeof asRecord.audio_url === "string"
			? asRecord.audio_url.trim()
			: typeof asRecord.url === "string"
				? asRecord.url.trim()
				: "";
	if (directAudioUrl) return directAudioUrl;
	const directData =
		typeof asRecord.data === "string" ? asRecord.data.trim() : "";
	if (directData) {
		const coerced = coerceAudioStringToSource(directData, mimeType);
		if (coerced) return coerced;
	}
	const directAudioBase64 =
		typeof asRecord.audio_base64 === "string"
			? asRecord.audio_base64.trim()
			: typeof asRecord.audio_b64 === "string"
				? asRecord.audio_b64.trim()
				: typeof asRecord.audio_data === "string"
					? asRecord.audio_data.trim()
					: typeof asRecord.b64_json === "string"
						? asRecord.b64_json.trim()
						: "";
	if (directAudioBase64) {
		const coerced = coerceAudioStringToSource(directAudioBase64, mimeType);
		if (coerced) return coerced;
	}
	const directAudio =
		typeof asRecord.audio === "string" ? asRecord.audio.trim() : "";
	if (directAudio) {
		const coerced = coerceAudioStringToSource(directAudio, mimeType);
		if (coerced) return coerced;
	}

	const chooseFromObject = (value: unknown): string | undefined => {
		if (!value || typeof value !== "object") return undefined;
		const record = value as Record<string, unknown>;
		const url =
			typeof record.url === "string"
				? record.url.trim()
				: typeof record.audio_url === "string"
					? record.audio_url.trim()
					: typeof record.content_url === "string"
						? record.content_url.trim()
						: typeof record.href === "string"
							? record.href.trim()
						: "";
		if (url) return url;
		const data =
			typeof record.data === "string"
				? record.data.trim()
				: typeof record.audio === "string"
					? record.audio.trim()
					: typeof record.audio_data === "string"
						? record.audio_data.trim()
						: typeof record.audio_b64 === "string"
							? record.audio_b64.trim()
							: typeof record.audio_base64 === "string"
								? record.audio_base64.trim()
				: typeof record.b64_json === "string"
					? record.b64_json.trim()
					: "";
		if (data) {
			const nodeMime = normalizeAudioMimeType(
				typeof record.mime_type === "string"
					? record.mime_type
					: typeof record.format === "string"
						? record.format
						: mimeType,
			);
			const coerced = coerceAudioStringToSource(data, nodeMime);
			if (coerced) return coerced;
		}
		const nestedFile = chooseFromObject(record.file);
		if (nestedFile) return nestedFile;
		const nestedAudio = chooseFromObject(record.audio);
		if (nestedAudio) return nestedAudio;
		return undefined;
	};

	const topLevelArrays = [asRecord.data, asRecord.output, asRecord.choices];
	for (const node of topLevelArrays) {
		if (!Array.isArray(node)) continue;
		for (const entry of node) {
			const direct = chooseFromObject(entry);
			if (direct) return direct;
			if (!entry || typeof entry !== "object") continue;
			const nested = entry as Record<string, unknown>;
			const nestedAudio = chooseFromObject(nested.audio ?? nested.message ?? nested.delta);
			if (nestedAudio) return nestedAudio;
			if (Array.isArray(nested.content)) {
				for (const contentNode of nested.content) {
					const fromContent = chooseFromObject(contentNode);
					if (fromContent) return fromContent;
				}
			}
		}
	}

	const resultRecord =
		asRecord.result && typeof asRecord.result === "object"
			? (asRecord.result as Record<string, unknown>)
			: null;
	const resultDirect = chooseFromObject(resultRecord);
	if (resultDirect) return resultDirect;
	const nestedArrays = [resultRecord?.output, resultRecord?.data];
	for (const node of nestedArrays) {
		if (node && typeof node === "object" && !Array.isArray(node)) {
			const direct = chooseFromObject(node);
			if (direct) return direct;
		}
		if (!Array.isArray(node)) continue;
		for (const entry of node) {
			const direct = chooseFromObject(entry);
			if (direct) return direct;
		}
	}

	const url = extractGenerationUrls(asRecord)[0];
	return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

function inferAudioMimeTypeFromSource(src: string): string {
	if (src.startsWith("data:")) {
		const match = src.match(/^data:([^;,]+)[;,]/i);
		if (match?.[1]) return match[1];
	}
	return inferAudioMimeType(src);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function normalizeMusicStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		if (value >= 2) return "completed";
		if (value === 1) return "in_progress";
		if (value <= -1) return "failed";
		return "queued";
	}
	const status = String(value ?? "").trim().toLowerCase();
	if (!status) return null;
	if (
		status === "completed" ||
		status === "success" ||
		status === "succeeded" ||
		status === "finished" ||
		status === "done"
	) {
		return "completed";
	}
	if (
		status === "failed" ||
		status === "error" ||
		status === "cancelled" ||
		status === "canceled"
	) {
		return "failed";
	}
	if (
		status === "in_progress" ||
		status === "running" ||
		status === "processing" ||
		status === "pending"
	) {
		return "in_progress";
	}
	if (status === "queued") return "queued";
	return null;
}

function extractMusicStatus(payload: unknown): "queued" | "in_progress" | "completed" | "failed" | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	const result =
		record.result && typeof record.result === "object"
			? (record.result as Record<string, unknown>)
			: null;
	return (
		normalizeMusicStatus(record.status) ??
		normalizeMusicStatus(record.task_status) ??
		normalizeMusicStatus(record.taskStatus) ??
		normalizeMusicStatus(result?.status) ??
		normalizeMusicStatus(result?.task_status) ??
		normalizeMusicStatus(
			result?.data && typeof result.data === "object"
				? (result.data as Record<string, unknown>).status
				: undefined,
		) ??
		null
	);
}

function extractMusicResourceId(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	const candidates = [
		record.nativeId,
		record.native_id,
		record.nativeResponseId,
		record.native_response_id,
		record.musicId,
		record.music_id,
		record.id,
	];
	for (const value of candidates) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return null;
}

function extractMusicErrorMessage(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
	if (
		record.error &&
		typeof record.error === "object" &&
		typeof (record.error as Record<string, unknown>).message === "string"
	) {
		const message = String((record.error as Record<string, unknown>).message).trim();
		if (message) return message;
	}
	if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
	if (typeof record.detail === "string" && record.detail.trim()) return record.detail.trim();
	return null;
}

async function pollMusicGeneration(resourceId: string): Promise<{
	payload: unknown;
	audioSrc: string | undefined;
	status: "queued" | "in_progress" | "completed" | "failed" | null;
}> {
	let latestPayload: unknown = null;
	let latestStatus: "queued" | "in_progress" | "completed" | "failed" | null = null;
	for (let attempt = 0; attempt < MUSIC_POLL_MAX_ATTEMPTS; attempt += 1) {
		const response = await fetch(
			`/api/chat/audio?action=music&resourceId=${encodeURIComponent(resourceId)}`,
			{ method: "GET" },
		);
		const rawText = await response.text();
		let payload: unknown = null;
		if (rawText.trim()) {
			try {
				payload = JSON.parse(rawText);
			} catch {
				payload = { raw_text: rawText };
			}
		}
		latestPayload = payload;

		if (!response.ok) {
			const message =
				extractMusicErrorMessage(payload) ||
				rawText.trim() ||
				`Music status request failed (${response.status}).`;
			throw new Error(message);
		}

		const audioSrc = extractAudioFromPayload(payload);
		if (audioSrc) {
			return { payload, audioSrc, status: "completed" };
		}

		const status = extractMusicStatus(payload);
		latestStatus = status;
		if (status === "failed") {
			throw new Error(extractMusicErrorMessage(payload) ?? "Music generation failed.");
		}
		if (status === "completed") {
			return { payload, audioSrc: undefined, status };
		}

		if (attempt < MUSIC_POLL_MAX_ATTEMPTS - 1) {
			await wait(MUSIC_POLL_INTERVAL_MS);
		}
	}

	return { payload: latestPayload, audioSrc: undefined, status: latestStatus };
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function formatMetric(
	value: number | string | null | undefined,
	suffix?: string,
): string {
	if (value === null || value === undefined || value === "") return "-";
	return suffix ? `${value}${suffix}` : `${value}`;
}

function getCostLabel(raw: unknown): string | null {
	if (!raw || typeof raw !== "object") return null;
	const usage =
		(raw as Record<string, unknown>).usage &&
		typeof (raw as Record<string, unknown>).usage === "object"
			? ((raw as Record<string, unknown>).usage as Record<string, unknown>)
			: null;
	const pricing =
		usage?.pricing_breakdown && typeof usage.pricing_breakdown === "object"
			? (usage.pricing_breakdown as Record<string, unknown>)
			: null;
	const costUsdStr =
		typeof pricing?.total_usd_str === "string"
			? pricing.total_usd_str
			: typeof pricing?.total_nanos === "number"
				? (pricing.total_nanos / 1e9).toFixed(7)
				: null;
	const fallbackCost =
		typeof (raw as Record<string, unknown>).total_cost_usd === "string"
			? ((raw as Record<string, unknown>).total_cost_usd as string)
			: null;
	const parsed = Number.parseFloat(costUsdStr ?? fallbackCost ?? "");
	if (!Number.isFinite(parsed)) return null;
	return `$${parsed.toFixed(5)}`;
}

function extractMetricsFromRaw(
	raw: unknown,
	latencyMs: number | undefined,
): AudioEntryMetrics {
	if (!raw || typeof raw !== "object") {
		return latencyMs ? { latencyMs, generationMs: latencyMs } : {};
	}
	const record = raw as Record<string, unknown>;
	const usage =
		record.usage && typeof record.usage === "object"
			? (record.usage as Record<string, unknown>)
			: null;
	const completionTokens =
		toFiniteNumber(usage?.completion_tokens) ??
		toFiniteNumber(usage?.output_tokens) ??
		toFiniteNumber(record.output_tokens) ??
		undefined;
	const promptTokens =
		toFiniteNumber(usage?.prompt_tokens) ??
		toFiniteNumber(usage?.input_tokens) ??
		toFiniteNumber(record.input_tokens) ??
		undefined;
	const totalTokens =
		toFiniteNumber(usage?.total_tokens) ??
		((completionTokens ?? 0) + (promptTokens ?? 0) || undefined);
	const completionDetails =
		usage?.completion_tokens_details &&
		typeof usage.completion_tokens_details === "object"
			? (usage.completion_tokens_details as Record<string, unknown>)
			: null;
	const promptDetails =
		usage?.prompt_tokens_details &&
		typeof usage.prompt_tokens_details === "object"
			? (usage.prompt_tokens_details as Record<string, unknown>)
			: null;
	const reasoningTokens = toFiniteNumber(completionDetails?.reasoning_tokens);
	const cachedPromptTokens = toFiniteNumber(promptDetails?.cached_tokens);
	const generationMs =
		toFiniteNumber(record.generation_ms) ??
		toFiniteNumber(record.generationMs) ??
		toFiniteNumber(
			record.client && typeof record.client === "object"
				? (record.client as Record<string, unknown>).generationMs
				: undefined,
		) ??
		latencyMs;
	const finalLatencyMs =
		toFiniteNumber(record.latency_ms) ??
		toFiniteNumber(record.latencyMs) ??
		toFiniteNumber(
			record.client && typeof record.client === "object"
				? (record.client as Record<string, unknown>).latencyMs
				: undefined,
		) ??
		latencyMs;
	const throughputTps =
		toFiniteNumber(record.throughput_tps) ??
		toFiniteNumber(record.throughput_tokens_per_second) ??
		toFiniteNumber(record.throughputTokensPerSecond) ??
		(completionTokens && generationMs && generationMs > 0
			? completionTokens / (generationMs / 1000)
			: undefined);
	return {
		totalTokens,
		promptTokens,
		completionTokens,
		cachedPromptTokens,
		reasoningTokens,
		latencyMs: finalLatencyMs,
		generationMs,
		throughputTps,
	};
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: AudioHistoryPayload;
}): AudioEntry {
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
				: "Past conversions",
		modelId: payload.modelId,
		providerId:
			typeof payload.providerId === "string" && payload.providerId.trim()
				? payload.providerId.trim()
				: undefined,
		mode: payload.mode,
		conversationMode: payload.conversationMode ?? payload.mode,
		inputText:
			(typeof payload.inputText === "string" && payload.inputText.trim()) ||
			(typeof payload.promptText === "string" && payload.promptText.trim()) ||
			undefined,
		musicLyrics:
			typeof payload.musicLyrics === "string" && payload.musicLyrics.trim()
				? payload.musicLyrics.trim()
				: undefined,
		text: payload.text,
		audioSrc:
			payload.audioDataUrl ||
			payload.audioUrl ||
			extractAudioFromPayload(payload.raw),
		metrics:
			payload.metrics && typeof payload.metrics === "object"
				? payload.metrics
				: undefined,
		raw: payload.raw,
	};
}

function toHistoryPayload(entry: AudioEntry): AudioHistoryPayload {
	const audioDataUrl =
		typeof entry.audioSrc === "string" && entry.audioSrc.startsWith("data:")
			? entry.audioSrc
			: undefined;
	return {
		conversationId: entry.conversationId,
		conversationTitle: entry.conversationTitle,
		conversationMode: entry.conversationMode ?? entry.mode,
		modelId: entry.modelId,
		providerId: entry.providerId,
		mode: entry.mode,
		promptText: entry.inputText,
		inputText: entry.inputText,
		musicLyrics: entry.musicLyrics,
		text: entry.text,
		audioUrl: audioDataUrl ? undefined : entry.audioSrc,
		audioDataUrl,
		metrics: entry.metrics,
		raw: entry.raw,
	};
}

function intersectAudioModeSupport(
	left: AudioModeSupport,
	right: AudioModeSupport,
): AudioModeSupport {
	return {
		speech: left.speech && right.speech,
		transcription: left.transcription && right.transcription,
		translation: left.translation && right.translation,
		music: left.music && right.music,
	};
}

function getModelModeSupport(
	models: GatewaySupportedModel[],
	modelId: string,
	providerId: string | undefined,
): AudioModeSupport {
	if (!modelId) return AUDIO_MODE_SUPPORT_FALLBACK;
	const restrictedProviderId =
		typeof providerId === "string" && providerId.trim() ? providerId.trim() : "auto";
	const relevant = models.filter(
		(model) =>
			model.modelId === modelId &&
			(restrictedProviderId === "auto" || model.providerId === restrictedProviderId),
	);
	if (relevant.length === 0) return AUDIO_MODE_SUPPORT_FALLBACK;
	return mergeAudioModeSupport(
		relevant.map((model) =>
			getAudioModeSupportForCapabilities(model.capabilities),
		),
	);
}

function buildConversations(
	entries: AudioEntry[],
	pinnedById: Record<string, boolean>,
): AudioConversation[] {
	const byId = new Map<string, AudioConversation>();
	for (const entry of entries) {
		const existing = byId.get(entry.conversationId);
		if (!existing) {
			byId.set(entry.conversationId, {
				id: entry.conversationId,
				title: entry.conversationTitle,
				mode: entry.conversationMode ?? entry.mode,
				updatedAt: entry.createdAt,
				messageCount: 1,
				pinned: Boolean(pinnedById[entry.conversationId]),
			});
			continue;
		}
		existing.messageCount += 1;
		existing.pinned = Boolean(pinnedById[existing.id]);
		existing.mode = existing.mode ?? entry.conversationMode ?? entry.mode;
		if (entry.createdAt > existing.updatedAt) existing.updatedAt = entry.createdAt;
		if (
			(existing.title === "Past conversions" || !existing.title.trim()) &&
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
	conversations: AudioConversation[],
	nowMs: number,
): GroupedAudioConversations {
	const groups: GroupedAudioConversations = {
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

export function AudioRoom({ models }: { models: GatewaySupportedModel[] }) {
	const { toggleSidebar, state: sidebarState, isMobile } = useSidebar();
	const collapsed = sidebarState === "collapsed" && !isMobile;
	const [mode, setMode] = useState<AudioMode>("speech");
	const allAudioModels = useMemo(
		() => filterModelsForRoom(models, "audio"),
		[models],
	);
	const filteredModels = useMemo(
		() =>
			allAudioModels.filter((model) => {
				const support = intersectAudioModeSupport(
					getAudioModeSupportForCapabilities(model.capabilities),
					AUDIO_MODE_UI_ENABLED,
				);
				return support[mode];
			}),
		[allAudioModels, mode],
	);
	const [modelId, setModelId] = useState("");
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [textInput, setTextInput] = useState("");
	const [musicLyricsInput, setMusicLyricsInput] = useState("");
	const [audioUrlInput, setAudioUrlInput] = useState("");
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<AudioEntry[]>([]);
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(null);
	const [pinnedConversationIds, setPinnedConversationIds] = useState<Record<string, boolean>>({});
	const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
	const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [metadataOpenEntryId, setMetadataOpenEntryId] = useState<string | null>(null);
	const [copiedPromptEntryId, setCopiedPromptEntryId] = useState<string | null>(null);
	const [conversationGroupingNowMs, setConversationGroupingNowMs] = useState<number | null>(
		null,
	);
	const copiedPromptTimeoutRef = useRef<number | null>(null);

	const modelSettings = useRoomModelSettings({
		roomId: "audio",
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: getDefaultAudioRoomParams,
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

	const selectedModeSupport = useMemo(
		() => getModelModeSupport(allAudioModels, modelId, selectedProviderId),
		[allAudioModels, modelId, selectedProviderId],
	);
	const effectiveModeSupport = useMemo(
		() => intersectAudioModeSupport(selectedModeSupport, AUDIO_MODE_UI_ENABLED),
		[selectedModeSupport],
	);
	const availableModes = useMemo(() => {
		const supported: AudioMode[] = [];
		if (effectiveModeSupport.speech) supported.push("speech");
		if (effectiveModeSupport.music) supported.push("music");
		if (effectiveModeSupport.transcription) supported.push("transcription");
		if (effectiveModeSupport.translation) supported.push("translation");
		return supported.length ? supported : (["speech"] as AudioMode[]);
	}, [effectiveModeSupport]);
	const uiAvailableModes = useMemo(() => {
		const enabled: AudioMode[] = [];
		if (AUDIO_MODE_UI_ENABLED.speech) enabled.push("speech");
		if (AUDIO_MODE_UI_ENABLED.music) enabled.push("music");
		if (AUDIO_MODE_UI_ENABLED.transcription) enabled.push("transcription");
		if (AUDIO_MODE_UI_ENABLED.translation) enabled.push("translation");
		return enabled.length ? enabled : (["speech"] as AudioMode[]);
	}, []);
	const conversations = useMemo(
		() => buildConversations(entries, pinnedConversationIds),
		[entries, pinnedConversationIds],
	);
	const groupedConversations = useMemo(
		() =>
			groupConversations(
				conversations,
				conversationGroupingNowMs ??
					(conversations[0]
						? Date.parse(conversations[0].updatedAt)
						: 0),
			),
		[conversationGroupingNowMs, conversations],
	);
	const activeConversation = useMemo(
		() => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
		[activeConversationId, conversations],
	);
	const activeEntries = useMemo(() => {
		const targetId = activeConversationId ?? conversations[0]?.id ?? null;
		if (!targetId) return [];
		return entries
			.filter((entry) => entry.conversationId === targetId)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}, [activeConversationId, conversations, entries]);
	const conversationModeById = useMemo(() => {
		const map = new Map<string, AudioMode>();
		for (const entry of entries) {
			if (map.has(entry.conversationId)) continue;
			map.set(entry.conversationId, entry.conversationMode ?? entry.mode);
		}
		return map;
	}, [entries]);
	const activeConversationResolvedId =
		activeConversationId ?? conversations[0]?.id ?? null;
	const activeConversationMode =
		(activeConversationResolvedId
			? conversationModeById.get(activeConversationResolvedId)
			: null) ?? null;

	const dialogModelId: string | null = modelSettingsCompat.modelSettingsModelId ?? null;
	const dialogProfile =
		dialogModelId && typeof modelSettingsCompat.getProfileForModel === "function"
			? modelSettingsCompat.getProfileForModel(dialogModelId)
			: dialogModelId === modelId
				? selectedProfile
				: null;
	const dialogModeSupport = useMemo(() => {
		const detected = getModelModeSupport(
			allAudioModels,
			dialogModelId ?? "",
			(dialogProfile?.providerId as string | undefined) ?? "auto",
		);
		return intersectAudioModeSupport(detected, AUDIO_MODE_UI_ENABLED);
	}, [allAudioModels, dialogModelId, dialogProfile?.providerId]);
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

	useEffect(() => {
		setModelId((current) => {
			if (current && filteredModels.some((model) => model.modelId === current)) {
				return current;
			}
			return filteredModels[0]?.modelId ?? "";
		});
	}, [filteredModels]);

	useEffect(() => {
		if (uiAvailableModes.includes(mode)) return;
		setMode(uiAvailableModes[0] ?? "speech");
	}, [mode, uiAvailableModes]);

	useEffect(() => {
		if (!activeConversationMode) return;
		if (mode === activeConversationMode) return;
		setMode(activeConversationMode);
	}, [activeConversationMode, mode]);

	const handleModeSelect = (targetMode: AudioMode) => {
		if (activeConversationMode) return;
		if (!uiAvailableModes.includes(targetMode)) return;
		if (!availableModes.includes(targetMode)) {
			const fallbackModel = allAudioModels.find((model) => {
				const support = intersectAudioModeSupport(
					getAudioModeSupportForCapabilities(model.capabilities),
					AUDIO_MODE_UI_ENABLED,
				);
				return support[targetMode];
			});
			if (fallbackModel) {
				setModelId(fallbackModel.modelId);
			}
		}
		setMode(targetMode);
	};

	useEffect(() => {
		setSidebarSlotEl(document.getElementById(ROOM_SIDEBAR_SLOT_ID));
	}, []);

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
		const stored = window.localStorage.getItem(AUDIO_PINNED_STORAGE_KEY);
		setPinnedConversationIds(safeParsePinned(stored));
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(
			AUDIO_PINNED_STORAGE_KEY,
			JSON.stringify(pinnedConversationIds),
		);
	}, [pinnedConversationIds]);

	useEffect(() => {
		let mounted = true;
		void listRoomHistory<AudioHistoryPayload>("audio" as NonTextRoomId).then(
			(records) => {
				if (!mounted) return;
				const nextEntries = records.map((record) => toEntry(record));
				setEntries(nextEntries);
				const nextConversations = buildConversations(
					nextEntries,
					pinnedConversationIds,
				);
				if (nextConversations.length > 0) {
					setActiveConversationId(nextConversations[0].id);
				} else {
					setActiveConversationId(createConversationId());
				}
			},
		);
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
		};
	}, []);

	const startNewConversation = () => {
		setModelId("");
		setActiveConversationId(createConversationId());
		setTextInput("");
		setMusicLyricsInput("");
		setAudioUrlInput("");
		setAudioFile(null);
		setError(null);
	};

	const toggleTemporaryMode = () => {
		if (!temporaryMode) {
			setTemporaryMode(true);
			setActiveConversationId(createConversationId());
			setTextInput("");
			setMusicLyricsInput("");
			setAudioUrlInput("");
			setAudioFile(null);
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
		setMusicLyricsInput("");
		setAudioUrlInput("");
		setAudioFile(null);
		setError(null);
	};

	const addEntry = async (entry: AudioEntry) => {
		setEntries((prev) => [entry, ...prev]);
		if (entry.isTemporary) return;
		await upsertRoomHistory<AudioHistoryPayload>({
			id: entry.id,
			roomId: "audio",
			createdAt: entry.createdAt,
			updatedAt: entry.createdAt,
			payload: toHistoryPayload(entry),
		});
	};

	const updateEntry = async (
		entryId: string,
		transform: (entry: AudioEntry) => AudioEntry,
	) => {
		const current = entries.find((entry) => entry.id === entryId);
		if (!current) return;
		const updated = transform(current);
		setEntries((prev) =>
			prev.map((entry) => (entry.id === entryId ? updated : entry)),
		);
		if (updated.isTemporary) return;
		await upsertRoomHistory<AudioHistoryPayload>({
			id: updated.id,
			roomId: "audio",
			createdAt: updated.createdAt,
			updatedAt: nowIso(),
			payload: toHistoryPayload(updated),
		});
	};

	const removeEntry = (entryId: string) => {
		setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
	};

	const toggleConversationPin = (conversation: AudioConversation) => {
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

	const renameConversation = async (conversation: AudioConversation) => {
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
				const updatedEntry: AudioEntry = {
					...entry,
					conversationTitle: nextTitle,
				};
				return upsertRoomHistory<AudioHistoryPayload>({
					id: updatedEntry.id,
					roomId: "audio",
					createdAt: updatedEntry.createdAt,
					updatedAt: nowIso(),
					payload: toHistoryPayload(updatedEntry),
				});
			}),
		);
	};

	const deleteConversation = async (conversation: AudioConversation) => {
		if (typeof window === "undefined") return;
		const confirmed = window.confirm(
			`Delete "${conversation.title}" and all generations inside it?`,
		);
		if (!confirmed) return;
		const entriesToDelete = entries.filter(
			(entry) => entry.conversationId === conversation.id,
		);
		const persistentEntries = entriesToDelete.filter(
			(entry) => !entry.isTemporary,
		);
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
			setActiveConversationId(
				remainingConversations[0]?.id ?? createConversationId(),
			);
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
			// final fallback below
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

	const startEditPrompt = (entry: AudioEntry) => {
		setEditingEntryId(entry.id);
		setEditingValue(entry.inputText ?? "");
	};

	const cancelEditPrompt = () => {
		setEditingEntryId(null);
		setEditingValue("");
	};

	const saveEditedPrompt = async (entry: AudioEntry) => {
		const nextPrompt = editingValue.trim();
		if (!nextPrompt) return;
		await updateEntry(entry.id, (current) => ({
			...current,
			inputText: nextPrompt,
			conversationTitle:
				current.conversationTitle === "Past conversions"
					? truncateTitle(nextPrompt)
					: current.conversationTitle,
		}));
		cancelEditPrompt();
	};

	const retryEntry = async (entry: AudioEntry) => {
		const prompt = entry.inputText?.trim();
		if (!prompt || !selectedModelEnabled || isLoading) return;
		const retryMode: AudioMode = entry.mode === "music" ? "music" : "speech";
		setModelId(entry.modelId);
		setMode(retryMode);
		setTextInput(prompt);
		if (retryMode === "music") {
			setMusicLyricsInput(entry.musicLyrics ?? "");
		}
		requestAnimationFrame(() => {
			void submit({
				forcedPrompt: prompt,
				forcedLyrics: retryMode === "music" ? (entry.musicLyrics ?? "") : undefined,
				forcedMode: retryMode,
				forcedModelId: entry.modelId,
				forcedConversationId: entry.conversationId,
				forcedConversationTitle: entry.conversationTitle,
			});
		});
	};

	const downloadAudio = async (entry: AudioEntry) => {
		const source = entry.audioSrc?.trim();
		if (!source) {
			setError("No audio available to download.");
			return;
		}

		const mimeType = inferAudioMimeTypeFromSource(source);
		const extension = mimeType.includes("wav")
			? "wav"
			: mimeType.includes("mpeg") || mimeType.includes("mp3")
				? "mp3"
				: mimeType.includes("opus")
					? "opus"
					: "bin";
		const timestamp = new Date(entry.createdAt)
			.toISOString()
			.replace(/[:.]/g, "-");
		const prefix = entry.mode === "music" ? "music" : "audio";
		const filename = `${prefix}-${timestamp}.${extension}`;

		const triggerDownload = (href: string) => {
			const anchor = document.createElement("a");
			anchor.href = href;
			anchor.download = filename;
			anchor.rel = "noopener noreferrer";
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
		};

		try {
			if (/^https?:\/\//i.test(source)) {
				try {
					const response = await fetch(source);
					if (!response.ok) {
						throw new Error(`Download failed (${response.status})`);
					}
					const blob = await response.blob();
					const objectUrl = URL.createObjectURL(blob);
					triggerDownload(objectUrl);
					setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
					return;
				} catch {
					// Some providers serve signed URLs without permissive CORS headers.
					// Fall back to direct navigation/download so browser handles it.
					const anchor = document.createElement("a");
					anchor.href = source;
					anchor.download = filename;
					anchor.target = "_blank";
					anchor.rel = "noopener noreferrer";
					document.body.appendChild(anchor);
					anchor.click();
					document.body.removeChild(anchor);
					return;
				}
			}
			triggerDownload(source);
		} catch {
			setError("Could not download audio.");
		}
	};

	const submit = async (overrides?: {
		forcedPrompt?: string;
		forcedLyrics?: string;
		forcedMode?: AudioMode;
		forcedModelId?: string;
		forcedConversationId?: string;
		forcedConversationTitle?: string;
	}) => {
		const targetModelId = overrides?.forcedModelId ?? modelId;
		if (!targetModelId || isLoading || !selectedModelEnabled) return;
		const requestedMode = overrides?.forcedMode ?? mode;
		const conversationId =
			overrides?.forcedConversationId ?? activeConversationId ?? createConversationId();
		const lockedConversationMode = conversationModeById.get(conversationId);
		const targetMode = lockedConversationMode ?? requestedMode;
		const targetModeSupport =
			targetModelId === modelId
				? effectiveModeSupport
				: intersectAudioModeSupport(
						getModelModeSupport(allAudioModels, targetModelId, selectedProviderId),
						AUDIO_MODE_UI_ENABLED,
					);
		if (
			(targetMode === "speech" && !targetModeSupport.speech) ||
			(targetMode === "music" && !targetModeSupport.music) ||
			(targetMode === "transcription" && !targetModeSupport.transcription) ||
			(targetMode === "translation" && !targetModeSupport.translation)
		) {
			setError(`Model "${targetModelId}" does not support ${targetMode}.`);
			return;
		}
		const promptTextSource = overrides?.forcedPrompt ?? textInput;
		if (
			(targetMode === "speech" || targetMode === "music") &&
			!promptTextSource.trim()
		) {
			return;
		}
		if (
			(targetMode === "transcription" || targetMode === "translation") &&
			!audioUrlInput.trim() &&
			!audioFile
		) {
			return;
		}
		const promptText =
			targetMode === "speech" || targetMode === "music"
				? promptTextSource.trim()
				: "";
		if (!activeConversationId) {
			setActiveConversationId(conversationId);
		}
		const existingTitle = activeConversation?.title?.trim() ?? "";
		const candidateTitle = promptText
			? truncateTitle(promptText)
			: `${targetMode === "music" ? "Music" : "Speech"} ${new Date().toLocaleDateString()}`;
		const conversationTitle =
			overrides?.forcedConversationTitle ||
			(temporaryMode ? "Temporary chat" : existingTitle || candidateTitle);
		let pendingEntryId: string | null = null;

		setError(null);
		setIsLoading(true);
		if (targetMode === "speech" || targetMode === "music") {
			const musicLyrics =
				targetMode === "music"
					? (overrides?.forcedLyrics ?? musicLyricsInput).trim() || undefined
					: undefined;
			pendingEntryId = crypto.randomUUID();
			await addEntry({
				id: pendingEntryId,
				createdAt: nowIso(),
				conversationId,
				conversationTitle,
				modelId: targetModelId,
				providerId:
					selectedProviderId && selectedProviderId !== "auto"
						? selectedProviderId
						: undefined,
				mode: targetMode,
				conversationMode: lockedConversationMode ?? targetMode,
				inputText: promptText,
				musicLyrics,
				isTemporary: true,
				isPending: true,
			});
			setTextInput("");
			if (targetMode === "music") {
				setMusicLyricsInput("");
			}
		}
		const requestStartedAt = performance.now();
		try {
			const requestBody: Record<string, unknown> = {
				model: targetModelId,
			};
			if (
				selectedProviderId &&
				selectedProviderId !== "auto" &&
				targetModelId === modelId
			) {
				requestBody.provider = {
					only: [selectedProviderId],
				};
			}
			if (targetMode === "speech") {
				requestBody.input = promptText;
			} else if (targetMode === "music") {
				requestBody.prompt = promptText;
				const lyrics = (overrides?.forcedLyrics ?? musicLyricsInput).trim();
				const existingMiniMax =
					requestBody.minimax && typeof requestBody.minimax === "object"
						? (requestBody.minimax as Record<string, unknown>)
						: {};
				const existingMiniMaxRequest =
					existingMiniMax.request && typeof existingMiniMax.request === "object"
						? (existingMiniMax.request as Record<string, unknown>)
						: {};
				requestBody.minimax = {
					...existingMiniMax,
					request: {
						...existingMiniMaxRequest,
						...(lyrics ? { lyrics, is_instrumental: false } : { is_instrumental: true }),
					},
				};
			} else {
				if (audioUrlInput.trim()) {
					requestBody.audio_url = audioUrlInput.trim();
				}
				if (audioFile) {
					requestBody.audio_b64 = await readFileAsBase64(audioFile);
				}
			}
			Object.assign(
				requestBody,
				buildAudioRequestOptions(
					targetMode,
					targetModelId,
					targetModelId === modelId
						? ((selectedProfile?.params as AudioRoomParams) ??
							getDefaultAudioRoomParams(targetModelId))
						: getDefaultAudioRoomParams(targetModelId),
				),
			);

			const response = await fetch("/api/chat/audio", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: targetMode,
					requestBody,
					appHeaders: APP_HEADERS,
				}),
			});
			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `Request failed (${response.status})`);
			}

			const contentType = response.headers.get("content-type") ?? "";
			let payload: any = null;
			let audioSrc: string | undefined;
			let text: string | undefined;
			let metrics: AudioEntryMetrics | undefined;
			const normalizedContentType = contentType.toLowerCase();
			const isJsonLike =
				normalizedContentType.includes("application/json") ||
				normalizedContentType.includes("application/problem+json") ||
				normalizedContentType.startsWith("text/");
			if (isJsonLike) {
				const rawText = await response.text();
				const trimmed = rawText.trim();
				let musicPollingNotice: string | undefined;
				if (trimmed) {
					try {
						payload = JSON.parse(trimmed);
					} catch {
						payload = { raw_text: trimmed };
					}
				}
				audioSrc = extractAudioFromPayload(payload);
				if (!audioSrc && payload?.raw_text && typeof payload.raw_text === "string") {
					const rawValue = payload.raw_text.trim();
					if (rawValue.startsWith("data:audio/")) {
						audioSrc = rawValue;
					} else if (/^https?:\/\//i.test(rawValue)) {
						audioSrc = rawValue;
					} else if (isLikelyHexEncodedAudio(rawValue)) {
						const base64 = hexToBase64(rawValue);
						if (base64) {
							audioSrc = `data:audio/mpeg;base64,${base64}`;
						}
					} else if (isLikelyBase64(rawValue)) {
						audioSrc = `data:audio/mpeg;base64,${rawValue.replace(/\s+/g, "")}`;
					}
				}
				if (targetMode === "music" && !audioSrc) {
					const resourceId = extractMusicResourceId(payload);
					const normalizedModel = targetModelId.trim().toLowerCase();
					const responseProvider =
						typeof payload?.provider === "string"
							? payload.provider.trim().toLowerCase()
							: "";
					const isMiniMaxMusicResponse =
						normalizedModel.startsWith("minimax/") ||
						responseProvider === "minimax" ||
						(resourceId?.startsWith("mmxmus_") ?? false);
					if (resourceId && !isMiniMaxMusicResponse) {
						try {
							const polled = await pollMusicGeneration(resourceId);
							if (polled.payload) {
								payload = polled.payload;
							}
							audioSrc = polled.audioSrc ?? extractAudioFromPayload(payload);
							if (!audioSrc && (polled.status === "queued" || polled.status === "in_progress")) {
								musicPollingNotice = `Music generation is still processing (id: ${resourceId}).`;
							}
						} catch (pollError) {
							const message =
								pollError instanceof Error && pollError.message.trim()
									? pollError.message.trim()
									: "Music status polling failed.";
							musicPollingNotice = `Music generation started but polling failed: ${message}`;
						}
					}
				}
				text =
					typeof musicPollingNotice === "string" && musicPollingNotice.trim()
						? musicPollingNotice
						: typeof payload?.text === "string"
						? payload.text
						: typeof payload?.output_text === "string"
							? payload.output_text
							: typeof payload?.transcript === "string"
								? payload.transcript
								: typeof payload?.raw_text === "string" && !audioSrc
									? payload.raw_text
									: undefined;
			} else {
				const blob = await response.blob();
				audioSrc = await blobToDataUrl(blob);
			}
			const elapsedMs = Math.max(0, Math.round(performance.now() - requestStartedAt));
			metrics = extractMetricsFromRaw(payload, elapsedMs);
			if (pendingEntryId) {
				removeEntry(pendingEntryId);
			}

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
				mode: targetMode,
				conversationMode: lockedConversationMode ?? targetMode,
				inputText:
					targetMode === "speech" || targetMode === "music"
						? promptText
						: undefined,
				musicLyrics:
					targetMode === "music"
						? (overrides?.forcedLyrics ?? musicLyricsInput).trim() || undefined
						: undefined,
				text,
				audioSrc,
				isTemporary: temporaryMode,
				metrics,
				raw: payload,
			});
			if ((targetMode === "speech" || targetMode === "music") && !pendingEntryId) {
				setTextInput("");
				if (targetMode === "music") {
					setMusicLyricsInput("");
				}
			} else {
				setAudioUrlInput("");
				setAudioFile(null);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Audio request failed";
			if (pendingEntryId) {
				await updateEntry(pendingEntryId, (entry) => ({
					...entry,
					isPending: false,
					text: errorMessage,
				}));
			}
			setError(errorMessage);
		} finally {
			setIsLoading(false);
		}
	};

	const renderConversationSection = (
		label: string,
		items: AudioConversation[],
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
							<span className="shrink-0 text-muted-foreground">
								{modeIcon(conversation.mode)}
							</span>
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
								<DropdownMenuItem
									onClick={() => toggleConversationPin(conversation)}
								>
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
										className={`h-8 min-w-0 w-full text-sm font-medium ${
											collapsed
												? "justify-center px-0"
												: "flex-1 justify-start gap-2 px-2"
										}`}
										onClick={startNewConversation}
										aria-label="New Chat"
									>
										<SquarePen className="h-4 w-4 shrink-0" />
										{collapsed ? null : (
											<span className="truncate text-left">New Chat</span>
										)}
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
									{renderConversationSection(
										"Yesterday",
										groupedConversations.yesterday,
									)}
									{renderConversationSection("This week", groupedConversations.week)}
									{renderConversationSection(
										"This month",
										groupedConversations.month,
									)}
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
									{mode === "music"
										? "Describe the track you want to generate."
										: "Type your prompt and convert it to speech."}
								</p>
							</div>
						</div>
					) : (
						activeEntries.map((entry) => {
						const resolvedModel =
							allAudioModels.find(
								(model) =>
									model.modelId === entry.modelId &&
									(!entry.providerId || model.providerId === entry.providerId),
							) ??
							allAudioModels.find((model) => model.modelId === entry.modelId) ??
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
							const metrics = entry.metrics ?? extractMetricsFromRaw(entry.raw, undefined);
							const throughputDisplay =
								typeof metrics.throughputTps === "number"
									? Math.round(metrics.throughputTps)
									: undefined;
							const generationSeconds =
								typeof metrics.generationMs === "number"
									? Math.round(metrics.generationMs / 1000)
									: undefined;
							const costLabel = getCostLabel(entry.raw);
							const isEditing = editingEntryId === entry.id;
							const promptCopied = copiedPromptEntryId === entry.id;
							const pendingEntry = entry.isPending === true;
							return (
								<div key={entry.id} className="space-y-3">
									{entry.inputText ? (
										<div className="ml-auto w-full max-w-[85%]">
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
													<p className="whitespace-pre-wrap">{entry.inputText}</p>
													{entry.mode === "music" && entry.musicLyrics ? (
														<div className="mt-3 border-t border-white/20 pt-3">
															<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
																Lyrics
															</p>
															<p className="whitespace-pre-wrap">{entry.musicLyrics}</p>
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
																const copied = copyText(entry.inputText ?? "");
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
															onClick={() => startEditPrompt(entry)}
														>
															<Pencil className="h-3.5 w-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent side="top">Edit prompt</TooltipContent>
												</Tooltip>
											</div>
										</div>
									) : null}
									<div className="mr-auto w-full max-w-[90%]">
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
										<div className="space-y-2">
											{entry.audioSrc ? (
												<MediaPlayer
													theme="surface"
													className="w-full border border-border bg-muted text-foreground"
												>
													<MediaPlayerAudio>
														<source
															src={entry.audioSrc}
															type={inferAudioMimeTypeFromSource(entry.audioSrc)}
														/>
													</MediaPlayerAudio>
													<MediaPlayerLoading />
													<MediaPlayerError />
													<MediaPlayerVolumeIndicator />
													<MediaPlayerControls>
														<MediaPlayerSeek />
														<div className="flex flex-wrap items-center gap-1">
															<MediaPlayerPlay />
															<MediaPlayerTime className="mr-auto px-1 text-xs tabular-nums" />
															<MediaPlayerVolume />
															<MediaPlayerSettings />
														</div>
													</MediaPlayerControls>
												</MediaPlayer>
											) : pendingEntry ? (
												<div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
													<span>{modeBusyLabel(entry.mode)}</span>
												</div>
											) : entry.text ? null : (
												<p className="text-xs text-muted-foreground">
													No playable audio returned by this response.
												</p>
											)}
											{entry.text ? (
												<pre className="overflow-auto rounded-lg border border-border bg-background px-3 py-2 text-xs whitespace-pre-wrap">
													{entry.text}
												</pre>
											) : null}
											{pendingEntry ? null : (
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															type="button"
															size="icon"
															variant="ghost"
															className="h-7 w-7"
															onClick={() => {
																void downloadAudio(entry);
															}}
															disabled={!entry.audioSrc}
														>
															<Download className="h-3.5 w-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent side="top">Download</TooltipContent>
												</Tooltip>
												{(entry.mode === "speech" || entry.mode === "music") &&
												entry.inputText ? (
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
												) : null}
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
																	<span className="text-muted-foreground">Total tokens</span>
																	<span>{formatMetric(metrics.totalTokens)}</span>
																</div>
																<div className="flex items-center justify-between">
																	<span className="text-muted-foreground">Generation</span>
																	<span>{formatMetric(generationSeconds, " s")}</span>
																</div>
																<div className="flex items-center justify-between">
																	<span className="text-muted-foreground">Throughput</span>
																	<span>{formatMetric(throughputDisplay, " tps")}</span>
																</div>
																<div className="flex items-center justify-between">
																	<span className="text-muted-foreground">Total cost</span>
																	<span>{costLabel ?? "-"}</span>
																</div>
															</div>
														</div>
													</PopoverContent>
												</Popover>
											</div>
											)}
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
						{activeConversationMode ? (
							<div className="flex items-center px-1 py-1 text-xs text-muted-foreground">
								<span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1">
									{modeIcon(activeConversationMode)}
									{modeLabel(activeConversationMode)}
								</span>
							</div>
						) : (
							<div className="flex flex-wrap gap-2 px-1 py-1">
								{AUDIO_MODE_OPTIONS.map((option) => {
									const isDisabled = !uiAvailableModes.includes(option);
									const showComingSoon = isDisabled && option !== "speech";
									const button = (
										<Button
											key={option}
											type="button"
											variant={mode === option ? "default" : "outline"}
											size="sm"
											onClick={() => handleModeSelect(option)}
											className="h-7 gap-1.5 text-xs"
											disabled={isDisabled}
										>
											{modeIcon(option)}
											{modeLabel(option)}
										</Button>
									);
									if (!showComingSoon) return button;
									return (
										<Tooltip key={option}>
											<TooltipTrigger asChild>
												<span className="inline-flex cursor-not-allowed">
													{button}
												</span>
											</TooltipTrigger>
											<TooltipContent side="top">Coming Soon</TooltipContent>
										</Tooltip>
									);
								})}
							</div>
						)}
						{mode === "speech" ? (
							<Textarea
								value={textInput}
								onChange={(event) => setTextInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										void submit();
									}
								}}
								rows={3}
								placeholder="Type text to generate speech..."
								className="min-h-[72px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
							/>
						) : mode === "music" ? (
							<div className="grid gap-2 px-1 py-2">
								<div className="grid gap-1">
									<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
										Prompt
									</p>
									<Textarea
										value={textInput}
										onChange={(event) => setTextInput(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter" && !event.shiftKey) {
												event.preventDefault();
												void submit();
											}
										}}
										rows={3}
										placeholder="Describe the music style, mood, instruments, and structure..."
										className="min-h-[72px] max-h-40 overflow-y-auto resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
									/>
								</div>
								<div className="grid gap-1">
									<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
										Lyrics (Optional)
									</p>
									<Textarea
										value={musicLyricsInput}
										onChange={(event) => setMusicLyricsInput(event.target.value)}
										rows={3}
										placeholder="Add lyrics to generate a vocal track. Leave empty for instrumental."
										className="min-h-[72px] max-h-40 overflow-y-auto resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
									/>
								</div>
							</div>
						) : (
							<div className="grid gap-2 px-1 py-2 md:grid-cols-2">
								<Input
									value={audioUrlInput}
									onChange={(event) => setAudioUrlInput(event.target.value)}
									placeholder="Audio URL (optional if file is attached)"
								/>
								<Input
									type="file"
									accept="audio/*"
									onChange={(event) =>
										setAudioFile(event.target.files?.[0] ?? null)
									}
								/>
							</div>
						)}
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
							</div>
							<Button
								className="ml-auto"
								onClick={() => {
									void submit();
								}}
								disabled={isLoading || !modelId || !selectedModelEnabled}
							>
								{isLoading
									? <Loader2 className="h-4 w-4 animate-spin" />
									: mode === "music"
										? "Generate"
										: "Convert"}
							</Button>
						</div>
					</div>
				</div>
			</footer>
			{dialogProfile ? (
				<AudioModelSettingsDialog
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
					modeSupport={dialogModeSupport}
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

