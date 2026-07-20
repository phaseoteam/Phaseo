"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import { extractGenerationUrls } from "@/lib/chat/roomRequestBuilders";
import {
	normalizeMediaGenerationStatus,
	toMediaEntryStatus,
} from "@/lib/chat/mediaGenerationStatus";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
	listRoomHistory,
	deleteRoomHistory,
	upsertRoomHistory,
	type NonTextRoomId,
} from "@/lib/indexeddb/chatRoomHistory";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	MediaPlayer,
	MediaPlayerControls,
	MediaPlayerError,
	MediaPlayerLoading,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useRoomModelSettings,
	type RoomModelProfile,
} from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	buildImageRequestOptions,
	buildVideoRequestOptions,
	getDefaultImageRoomParams,
	getImageModelSchema,
	getDefaultVideoRoomParams,
	type ImageRoomParams,
	type VideoRoomParams,
} from "@/lib/chat/roomModelSettings";
import { ImageModelSettingsDialog } from "@/components/(chat)/rooms/settings/ImageModelSettingsDialog";
import { VideoModelSettingsDialog } from "@/components/(chat)/rooms/settings/VideoModelSettingsDialog";
import { RoomErrorNotice } from "@/components/(chat)/rooms/RoomErrorNotice";
import {
	ChevronRight,
	CircleAlert,
	Cpu,
	Download,
	Expand,
	Info,
	Loader2,
	MessageCircleDashed,
	RotateCcw,
	Settings as SettingsIcon,
	Trash2,
} from "lucide-react";

type MediaStudioRoomProps = {
	roomId: "image" | "video";
	models: GatewaySupportedModel[];
};

type MediaHistoryPayload = {
	modelId: string;
	prompt: string;
	url: string;
	status: "pending" | "completed" | "failed";
	statusLabel?: string | null;
	progressPercent?: number | null;
	resourceId?: string | null;
	requestId?: string | null;
	providerId?: string | null;
	providerName?: string | null;
	finishReason?: string | null;
	durationMs?: number | null;
	costUsd?: number | null;
	promptTokens?: number | null;
	completionTokens?: number | null;
	totalTokens?: number | null;
	videoSeconds?: number | null;
	videoResolution?: string | null;
	imageSettings?: ImageGenerationSettings | null;
	generationParams?: Record<string, unknown> | null;
};

type GenerationEntry = {
	id: string;
	createdAt: string;
	modelId: string;
	prompt: string;
	url: string;
	status: "pending" | "completed" | "failed";
	statusLabel?: string | null;
	progressPercent?: number | null;
	resourceId?: string | null;
	requestId?: string | null;
	providerId?: string | null;
	providerName?: string | null;
	finishReason?: string | null;
	durationMs?: number | null;
	costUsd?: number | null;
	promptTokens?: number | null;
	completionTokens?: number | null;
	totalTokens?: number | null;
	videoSeconds?: number | null;
	videoResolution?: string | null;
	imageSettings?: ImageGenerationSettings | null;
	generationParams?: Record<string, unknown> | null;
	isTemporary?: boolean;
};

type ImageGenerationSettings = {
	aspectRatio: string | null;
	imageSize: string | null;
	resolution: string | null;
	quality: string | null;
	style: string | null;
};

type EntryMetrics = {
	requestId: string | null;
	providerId: string | null;
	providerName: string | null;
	finishReason: string | null;
	statusLabel: string | null;
	progressPercent: number | null;
	durationMs: number | null;
	costUsd: number | null;
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	videoSeconds: number | null;
	videoResolution: string | null;
};

type VideoJobListItem = {
	resourceId: string;
	status: string;
	statusLabel: string | null;
	progressPercent: number | null;
	providerId: string | null;
	modelId: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	durationMs: number | null;
	costUsd: number | null;
	videoSeconds: number | null;
	videoResolution: string | null;
};

const VIDEO_POLL_INTERVAL_MS = 2500;
const VIDEO_POLL_INTERVAL_FAST_MS = 700;

function nowIso() {
	return new Date().toISOString();
}

function toLatestVideoEntry(entries: GenerationEntry[]): GenerationEntry[] {
	if (entries.length <= 1) return entries;
	return [...entries]
		.sort((a, b) => {
			const left = Date.parse(a.createdAt);
			const right = Date.parse(b.createdAt);
			const leftValue = Number.isFinite(left) ? left : 0;
			const rightValue = Number.isFinite(right) ? right : 0;
			return rightValue - leftValue;
		})
		.slice(0, 1);
}

function toOptionalString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function toOptionalNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const normalized = value.trim().replace(/[$,]/g, "");
		if (!normalized) return null;
		const parsed = Number(normalized);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeProgressPercent(value: unknown): number | null {
	const parsed = toOptionalNumber(value);
	if (parsed === null) return null;
	return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseImageGenerationSettings(value: unknown): ImageGenerationSettings | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	const settings: ImageGenerationSettings = {
		aspectRatio: toOptionalString(raw.aspectRatio ?? raw.aspect_ratio),
		imageSize: toOptionalString(raw.imageSize ?? raw.image_size),
		resolution: toOptionalString(
			raw.resolution ?? raw.outputSize ?? raw.output_size ?? raw.size,
		),
		quality: toOptionalString(raw.quality),
		style: toOptionalString(raw.style),
	};
	if (
		!settings.aspectRatio &&
		!settings.imageSize &&
		!settings.resolution &&
		!settings.quality &&
		!settings.style
	) {
		return null;
	}
	return settings;
}

function parseGenerationParams(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return { ...(value as Record<string, unknown>) };
}

function buildImageGenerationSettings(
	modelId: string,
	params: ImageRoomParams,
	requestOptions: Record<string, unknown>,
): ImageGenerationSettings | null {
	const schema = getImageModelSchema(modelId);
	const isGoogleImage = schema.variant.startsWith("google-");
	return parseImageGenerationSettings({
		aspectRatio: isGoogleImage ? params.size : null,
		imageSize: isGoogleImage ? params.quality : null,
		resolution:
			typeof requestOptions.size === "string" && requestOptions.size.trim()
				? requestOptions.size
				: params.size,
		quality: isGoogleImage ? null : params.quality,
		style: params.style,
	});
}

function getResourceId(payload: any): string | null {
	const candidates = [
		payload?.id,
		payload?.resource_id,
		payload?.video_id,
		payload?.video?.id,
		payload?.data?.id,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function buildVideoContentProxyUrl(resourceId: string): string {
	const trimmed = resourceId.trim();
	if (!trimmed) return "";
	return `/api/chat/video?resourceId=${encodeURIComponent(trimmed)}&content=1`;
}

function getGatewayRequestId(payload: any): string | null {
	const candidates = [
		payload?.generation_id,
		payload?.gateway_request_id,
		payload?.request_id,
		payload?.id,
		payload?.result?.id,
		payload?.response?.id,
	];
	for (const value of candidates) {
		const id = toOptionalString(value);
		if (id) return id;
	}
	return null;
}

function getProviderId(payload: any): string | null {
	const candidates = [
		payload?.provider,
		payload?.provider_id,
		payload?.upstream_provider,
		payload?.meta?.provider,
	];
	for (const value of candidates) {
		const providerId = toOptionalString(value);
		if (providerId) return providerId;
	}
	return null;
}

function getProviderName(payload: any): string | null {
	const candidates = [
		payload?.provider_name,
		payload?.meta?.provider_name,
		payload?.provider,
		payload?.provider_id,
	];
	for (const value of candidates) {
		const providerName = toOptionalString(value);
		if (providerName) return providerName;
	}
	return null;
}

function getFinishReason(payload: any): string | null {
	const candidates = [
		payload?.finish_reason,
		payload?.reason,
		payload?.video?.finish_reason,
		payload?.data?.finish_reason,
	];
	for (const value of candidates) {
		const finishReason = toOptionalString(value);
		if (finishReason) return finishReason;
	}
	return null;
}

function getDurationMs(payload: any): number | null {
	const candidates = [
		payload?.duration_ms,
		payload?.durationMs,
		payload?.latency_ms,
		payload?.latencyMs,
		payload?.generation_ms,
		payload?.generationMs,
		payload?.response_ms,
		payload?.responseMs,
		payload?.generation_time_ms,
		payload?.meta?.duration_ms,
		payload?.meta?.durationMs,
		payload?.meta?.latency_ms,
		payload?.meta?.latencyMs,
		payload?.metrics?.duration_ms,
		payload?.metrics?.durationMs,
		payload?.metrics?.latency_ms,
		payload?.metrics?.latencyMs,
		payload?.timings?.total_ms,
		payload?.timings?.totalMs,
	];
	for (const value of candidates) {
		const duration = toOptionalNumber(value);
		if (duration !== null) return Math.max(0, duration);
	}
	return null;
}

function getCostUsd(payload: any): number | null {
	const pricingBreakdown =
		payload?.usage?.pricing_breakdown && typeof payload.usage.pricing_breakdown === "object"
			? payload.usage.pricing_breakdown
			: null;
	const candidates = [
		payload?.costUsd,
		payload?.cost?.usd,
		payload?.total_cost_usd,
		payload?.usage?.costUsd,
		payload?.usage?.cost_usd,
		payload?.usage?.totalCostUsd,
		payload?.usage?.total_cost_usd,
		payload?.pricing?.cost?.usd,
		payload?.meta?.costUsd,
		payload?.meta?.cost_usd,
		pricingBreakdown?.total_usd_str,
		typeof pricingBreakdown?.total_nanos === "number"
			? pricingBreakdown.total_nanos / 1e9
			: null,
	];
	for (const value of candidates) {
		const cost = toOptionalNumber(value);
		if (cost !== null) return Math.max(0, cost);
	}
	return null;
}

function getVideoSeconds(payload: any): number | null {
	const candidates = [
		payload?.seconds,
		payload?.duration_seconds,
		payload?.duration,
		payload?.usage?.output_video_seconds,
		payload?.meta?.seconds,
		payload?.video?.seconds,
	];
	for (const value of candidates) {
		const seconds = toOptionalNumber(value);
		if (seconds !== null && seconds > 0) return Math.round(seconds);
	}
	return null;
}

function getVideoResolution(payload: any): string | null {
	const candidates = [
		payload?.resolution,
		payload?.size,
		payload?.input_resolution,
		payload?.video_resolution,
		payload?.meta?.resolution,
		payload?.usage?.resolution,
		payload?.usage?.video_resolution,
		payload?.usage?.video_params?.resolution,
		payload?.usage?.video_params?.input_resolution,
		payload?.usage?.video_params?.size,
	];
	for (const value of candidates) {
		const resolution = toOptionalString(value);
		if (resolution) return resolution;
	}
	return null;
}

function hasVideoCompletionSignal(payload: any, metrics?: Partial<EntryMetrics>): boolean {
	if (metrics?.costUsd != null && Number.isFinite(metrics.costUsd)) return true;
	const candidates = [
		payload?.meta?.charged,
		payload?.charged,
		payload?.meta?.billed_at,
		payload?.billed_at,
		payload?.meta?.finalized_at,
		payload?.finalized_at,
	];
	for (const value of candidates) {
		if (value === true) return true;
		if (typeof value === "string" && value.trim().length > 0) return true;
	}
	return false;
}

function getTokenUsage(payload: any): {
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
} {
	const usage = payload?.usage ?? payload?.meta?.usage ?? {};
	const promptTokens =
		toOptionalNumber(usage?.prompt_tokens) ??
		toOptionalNumber(usage?.input_tokens) ??
		toOptionalNumber(usage?.prompt_token_count) ??
		null;
	const completionTokens =
		toOptionalNumber(usage?.completion_tokens) ??
		toOptionalNumber(usage?.output_tokens) ??
		toOptionalNumber(usage?.completion_token_count) ??
		null;
	const totalTokens =
		toOptionalNumber(usage?.total_tokens) ??
		toOptionalNumber(usage?.total_token_count) ??
		(promptTokens !== null || completionTokens !== null
			? (promptTokens ?? 0) + (completionTokens ?? 0)
			: null);
	return {
		promptTokens,
		completionTokens,
		totalTokens,
	};
}

function extractEntryMetrics(payload: any): EntryMetrics {
	const usage = getTokenUsage(payload);
	return {
		requestId: getGatewayRequestId(payload),
		providerId: getProviderId(payload),
		providerName: getProviderName(payload),
		finishReason: getFinishReason(payload),
		statusLabel: getGenerationStatus(payload),
		progressPercent: getGenerationProgressPercent(payload),
		durationMs: getDurationMs(payload),
		costUsd: getCostUsd(payload),
		promptTokens: usage.promptTokens,
		completionTokens: usage.completionTokens,
		totalTokens: usage.totalTokens,
		videoSeconds: getVideoSeconds(payload),
		videoResolution: getVideoResolution(payload),
	};
}

function formatTimestamp(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatDuration(durationMs: number | null | undefined): string {
	if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return "N/A";
	if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
	return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatCost(costUsd: number | null | undefined): string {
	if (typeof costUsd !== "number" || !Number.isFinite(costUsd)) return "N/A";
	return `$${costUsd.toFixed(3)}`;
}

function formatCostFull(costUsd: number | null | undefined): string {
	if (typeof costUsd !== "number" || !Number.isFinite(costUsd)) return "N/A";
	return `$${costUsd.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 9,
	})}`;
}

function formatVideoSeconds(seconds: number | null | undefined): string {
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "N/A";
	return `${Math.round(seconds)}s`;
}

function getGenerationStatus(payload: any): string | null {
	const candidates = [
		payload?.status,
		payload?.state,
		payload?.video?.status,
		payload?.data?.status,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim().toLowerCase();
		}
	}
	return null;
}

function getGenerationProgressPercent(payload: any): number | null {
	const statusDetails =
		payload?.status_details && typeof payload.status_details === "object"
			? payload.status_details
			: null;
	const statusDetailsCamel =
		payload?.statusDetails && typeof payload.statusDetails === "object"
			? payload.statusDetails
			: null;
	const result =
		payload?.result && typeof payload.result === "object"
			? payload.result
			: null;
	const candidates = [
		statusDetails?.progress,
		statusDetailsCamel?.progress,
		payload?.progress,
		result?.progress,
		result?.status_details?.progress,
	];
	for (const value of candidates) {
		const progress = normalizeProgressPercent(value);
		if (progress !== null) return progress;
	}
	return null;
}

function formatPendingStatusLabel(value: string | null | undefined): string {
	const normalized = typeof value === "string" ? value.trim() : "";
	if (!normalized) return "Pending";
	return normalized
		.replace(/[_-]+/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPendingGenerationState(
	entry: GenerationEntry,
	roomId: "image" | "video",
): { label: string; progress: number | null; subtitle: string } {
	const progress = normalizeProgressPercent(entry.progressPercent);
	const statusLabel = formatPendingStatusLabel(entry.statusLabel ?? entry.status);
	return {
		label: progress !== null ? `${statusLabel} (${progress}%)` : statusLabel,
		progress,
		subtitle:
			progress !== null
				? `${progress}% complete`
				: roomId === "image"
					? "Generating image..."
					: "Generating video...",
	};
}

function wait(ms: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function toRecoveredVideoPrompt(): string {
	return "Recovered video generation";
}

function normalizeVideoEntryStatusFromJob(status: unknown): GenerationEntry["status"] {
	const normalized = normalizeMediaGenerationStatus(
		typeof status === "string" ? status : null,
	);
	if (normalized === "failed") return "failed";
	if (normalized === "completed") return "completed";
	return "pending";
}

function parseVideoJobList(payload: unknown): VideoJobListItem[] {
	if (!payload || typeof payload !== "object") return [];
	const data = (payload as { data?: unknown }).data;
	if (!Array.isArray(data)) return [];
	const out: VideoJobListItem[] = [];
	for (const rawItem of data) {
		if (!rawItem || typeof rawItem !== "object") continue;
		const item = rawItem as Record<string, unknown>;
		const resourceId = toOptionalString(item.id);
		if (!resourceId) continue;
		out.push({
			resourceId,
			status: toOptionalString(item.status) ?? "queued",
			statusLabel: toOptionalString(item.status),
			progressPercent: getGenerationProgressPercent(item),
			providerId: toOptionalString(item.provider),
			modelId: toOptionalString(item.model),
			createdAt: toOptionalString(item.createdAt),
			updatedAt: toOptionalString(item.updatedAt),
			durationMs: getDurationMs(item),
			costUsd: getCostUsd(item),
			videoSeconds: getVideoSeconds(item),
			videoResolution: getVideoResolution(item),
		});
	}
	return out;
}

function mergeVideoEntriesWithJobs(
	localEntries: GenerationEntry[],
	jobs: VideoJobListItem[],
): GenerationEntry[] {
	if (jobs.length === 0) return localEntries;

	const nextEntries = [...localEntries];
	const indexByResourceId = new Map<string, number>();
	for (let index = 0; index < nextEntries.length; index += 1) {
		const resourceId = nextEntries[index]?.resourceId?.trim();
		if (!resourceId || indexByResourceId.has(resourceId)) continue;
		indexByResourceId.set(resourceId, index);
	}

	for (const job of jobs) {
		const resourceId = job.resourceId.trim();
		if (!resourceId) continue;
		const existingIndex = indexByResourceId.get(resourceId);
		const nextStatus = normalizeVideoEntryStatusFromJob(job.status);
		const shouldUseContentProxyUrl = nextStatus === "completed";
		if (typeof existingIndex === "number") {
			const existing = nextEntries[existingIndex];
			if (!existing) continue;
			nextEntries[existingIndex] = {
				...existing,
				status: nextStatus,
				statusLabel: job.statusLabel ?? existing.statusLabel ?? existing.status,
				progressPercent:
					nextStatus === "completed"
						? 100
						: nextStatus === "failed"
							? null
							: (job.progressPercent ?? existing.progressPercent ?? null),
				resourceId,
				providerId: existing.providerId ?? job.providerId,
				durationMs: job.durationMs ?? existing.durationMs,
				costUsd: job.costUsd ?? existing.costUsd,
				videoSeconds: job.videoSeconds ?? existing.videoSeconds,
				videoResolution: job.videoResolution ?? existing.videoResolution,
				url:
					shouldUseContentProxyUrl
						? existing.url || buildVideoContentProxyUrl(resourceId)
						: existing.url,
			};
			continue;
		}

		const timestamp = job.updatedAt ?? job.createdAt ?? nowIso();
		nextEntries.push({
			id: `video-job:${resourceId}`,
			createdAt: timestamp,
			modelId: job.modelId ?? "video",
			prompt: toRecoveredVideoPrompt(),
			url: shouldUseContentProxyUrl ? buildVideoContentProxyUrl(resourceId) : "",
			status: nextStatus,
			statusLabel: job.statusLabel ?? job.status,
			progressPercent:
				nextStatus === "completed"
					? 100
					: nextStatus === "failed"
						? null
						: job.progressPercent,
			resourceId,
			requestId: null,
			providerId: job.providerId,
			providerName: job.providerId,
			finishReason: null,
			durationMs: job.durationMs,
			costUsd: job.costUsd,
			videoSeconds: job.videoSeconds,
			videoResolution: job.videoResolution,
			promptTokens: null,
			completionTokens: null,
			totalTokens: null,
		});
		indexByResourceId.set(resourceId, nextEntries.length - 1);
	}

	return nextEntries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: MediaHistoryPayload;
}): GenerationEntry {
	const payload = record.payload as any;
	return {
		id: record.id,
		createdAt: record.createdAt,
		modelId: payload.modelId,
		prompt: payload.prompt,
		url: payload.url,
		status: payload.status,
		statusLabel: toOptionalString(payload.statusLabel ?? payload.status_label ?? payload.rawStatus ?? payload.raw_status),
		progressPercent:
			normalizeProgressPercent(payload.progressPercent ?? payload.progress_percent) ??
			getGenerationProgressPercent(payload),
		resourceId: payload.resourceId ?? null,
		requestId: payload.requestId ?? null,
		providerId: payload.providerId ?? null,
		providerName: payload.providerName ?? null,
		finishReason: payload.finishReason ?? null,
		durationMs: getDurationMs(payload),
		costUsd: getCostUsd(payload),
		promptTokens:
			toOptionalNumber(payload.promptTokens ?? payload.prompt_tokens) ?? null,
		completionTokens:
			toOptionalNumber(
				payload.completionTokens ?? payload.completion_tokens,
			) ?? null,
		totalTokens:
			toOptionalNumber(payload.totalTokens ?? payload.total_tokens) ?? null,
		videoSeconds:
			toOptionalNumber(payload.videoSeconds ?? payload.video_seconds) ??
			getVideoSeconds(payload),
		videoResolution:
			toOptionalString(payload.videoResolution ?? payload.video_resolution) ??
			getVideoResolution(payload),
		imageSettings: parseImageGenerationSettings(
			payload.imageSettings ?? payload.image_settings,
		),
		generationParams: parseGenerationParams(
			payload.generationParams ?? payload.generation_params,
		),
	};
}

function buildResolvedEntries(args: {
	baseEntry: GenerationEntry;
	modelId: string;
	prompt: string;
	urls: string[];
	status: GenerationEntry["status"];
	resourceId?: string | null;
	metrics?: Partial<EntryMetrics>;
	imageSettings?: ImageGenerationSettings | null;
	generationParams?: Record<string, unknown> | null;
	isTemporary: boolean;
}): GenerationEntry[] {
	const {
		baseEntry,
		modelId,
		prompt,
		urls,
		status,
		resourceId,
		metrics,
		imageSettings,
		isTemporary,
	} = args;
	const metricsPatch = {
		requestId: metrics?.requestId ?? baseEntry.requestId ?? null,
		providerId: metrics?.providerId ?? baseEntry.providerId ?? null,
		providerName: metrics?.providerName ?? baseEntry.providerName ?? null,
		finishReason: metrics?.finishReason ?? baseEntry.finishReason ?? null,
		statusLabel: metrics?.statusLabel ?? baseEntry.statusLabel ?? baseEntry.status,
		progressPercent:
			status === "completed"
				? 100
				: status === "failed"
					? null
					: (metrics?.progressPercent ?? baseEntry.progressPercent ?? null),
		durationMs: metrics?.durationMs ?? baseEntry.durationMs ?? null,
		costUsd: metrics?.costUsd ?? baseEntry.costUsd ?? null,
		promptTokens: metrics?.promptTokens ?? baseEntry.promptTokens ?? null,
		completionTokens: metrics?.completionTokens ?? baseEntry.completionTokens ?? null,
		totalTokens: metrics?.totalTokens ?? baseEntry.totalTokens ?? null,
		videoSeconds: metrics?.videoSeconds ?? baseEntry.videoSeconds ?? null,
		videoResolution: metrics?.videoResolution ?? baseEntry.videoResolution ?? null,
	};
	if (urls.length > 0) {
		return urls.map((url, index) => ({
			...baseEntry,
			id: index === 0 ? baseEntry.id : crypto.randomUUID(),
			modelId,
			prompt,
			url,
			status,
			resourceId: resourceId ?? null,
			imageSettings: imageSettings ?? baseEntry.imageSettings ?? null,
			generationParams: baseEntry.generationParams ?? null,
			isTemporary,
			...metricsPatch,
		}));
	}
	return [
		{
			...baseEntry,
			modelId,
			prompt,
			url: "",
			status,
			resourceId: resourceId ?? null,
			imageSettings: imageSettings ?? baseEntry.imageSettings ?? null,
			generationParams: baseEntry.generationParams ?? null,
			isTemporary,
			...metricsPatch,
		},
	];
}

export function MediaStudioRoom({ roomId, models }: MediaStudioRoomProps) {
	const isImageRoom = roomId === "image";
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const filteredModels = useMemo(
		() => filterModelsForRoom(models, roomId).filter((model) => model.isAvailable),
		[models, roomId],
	);
	const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
	const [activeModelId, setActiveModelId] = useState("");
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [infoNotice, setInfoNotice] = useState<string | null>(null);
	const [entries, setEntries] = useState<GenerationEntry[]>([]);
	const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);
	const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
	const [retryingEntryId, setRetryingEntryId] = useState<string | null>(null);
	const [videoAspectRatios, setVideoAspectRatios] = useState<Record<string, number>>({});
	const entriesRef = useRef<GenerationEntry[]>([]);
	const pollingEntryIdsRef = useRef<Set<string>>(new Set());
	const modelSettings = useRoomModelSettings({
		roomId,
		models: filteredModels,
		selectedModelId: activeModelId,
		onModelChange: setActiveModelId,
		getDefaultParams: (nextModelId) =>
			(isImageRoom
				? getDefaultImageRoomParams(nextModelId)
				: getDefaultVideoRoomParams(nextModelId)) as ImageRoomParams | VideoRoomParams,
	});
	const modelSettingsCompat = modelSettings as any;
	const selectedProfile =
		modelSettingsCompat.selectedProfile ?? modelSettingsCompat.activeModelSettings ?? null;
	const selectedProviderId = selectedProfile?.providerId;
	const composerSelectedModel = useMemo(
		() =>
			filteredModels.find(
				(model) =>
					model.modelId === activeModelId &&
					(!selectedProviderId || model.providerId === selectedProviderId),
			) ??
			filteredModels.find((model) => model.modelId === activeModelId) ??
			null,
		[activeModelId, filteredModels, selectedProviderId],
	);
	const composerModelLogoId =
		composerSelectedModel?.organisationId?.trim() ||
		composerSelectedModel?.providerId ||
		(activeModelId.split("/")[0] || "phaseo");
	const composerModelLabel =
		(activeModelId &&
			(modelSettings.modelDisplayNameById[activeModelId] ||
				composerSelectedModel?.modelName ||
				activeModelId)) ||
		"Select model";
	const openComposerModelPicker = () => {
		const targetModelId =
			activeModelId || selectedModelIds[0] || filteredModels[0]?.modelId;
		if (!targetModelId) return;
		if (!selectedModelIds.includes(targetModelId)) {
			setSelectedModelIds((prev) =>
				roomId === "video" ? [targetModelId] : [...prev, targetModelId],
			);
		}
		if (targetModelId !== activeModelId) {
			setActiveModelId(targetModelId);
		}
		modelSettings.openModelSettingsForModel(targetModelId);
	};
	const dialogModelId: string | null = modelSettingsCompat.modelSettingsModelId ?? null;
	const dialogProfile =
		dialogModelId && typeof modelSettingsCompat.getProfileForModel === "function"
			? modelSettingsCompat.getProfileForModel(dialogModelId)
			: dialogModelId === activeModelId
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

	useEffect(() => {
		if (roomId !== "video") return;
		const rawHailuo = models
			.filter((model) => model.modelId.toLowerCase().startsWith("minimax/hailuo"))
			.map((model) => ({
				modelId: model.modelId,
				providerId: model.providerId,
				capabilities: model.capabilities,
				isAvailable: model.isAvailable,
				effectiveFrom: model.effectiveFrom,
				effectiveTo: model.effectiveTo,
			}));
		const filteredHailuo = filteredModels
			.filter((model) => model.modelId.toLowerCase().startsWith("minimax/hailuo"))
			.map((model) => ({
				modelId: model.modelId,
				providerId: model.providerId,
				capabilities: model.capabilities,
				isAvailable: model.isAvailable,
			}));
		console.log("[video-room] hailuo_model_debug", {
			rawModelCount: models.length,
			filteredModelCount: filteredModels.length,
			rawHailuo,
			filteredHailuo,
		});
	}, [filteredModels, models, roomId]);

	useEffect(() => {
		const availableModelIds = new Set(filteredModels.map((model) => model.modelId));
		setSelectedModelIds((current) => {
			const next = Array.from(
				new Set(current.filter((modelId) => availableModelIds.has(modelId))),
			);
			return roomId === "video" ? next.slice(0, 1) : next;
		});
	}, [filteredModels, roomId]);

	useEffect(() => {
		setActiveModelId((current) => {
			if (current && selectedModelIds.includes(current)) return current;
			return selectedModelIds[0] ?? "";
		});
	}, [selectedModelIds]);

	const handleSelectModel = useCallback((nextModelId: string) => {
		setSelectedModelIds((current) => {
			if (roomId === "video") return [nextModelId];
			if (current.includes(nextModelId)) return current;
			return [...current, nextModelId];
		});
		setActiveModelId(nextModelId);
	}, [roomId]);

	const handleRemoveModel = useCallback((removeModelId: string) => {
		setSelectedModelIds((current) => {
			if (roomId === "video") return current[0] === removeModelId ? [] : current;
			return current.filter((modelId) => modelId !== removeModelId);
		});
		setActiveModelId((current) => (current === removeModelId ? "" : current));
	}, [roomId]);

	const handleRemoveAllModels = useCallback(() => {
		setSelectedModelIds([]);
		setActiveModelId("");
	}, []);

	const handleModelSettingsModelChange = useCallback(
		(modelId: string) => {
			if (roomId === "video") {
				modelSettings.handleModelSettingsModelChange(modelId);
				setSelectedModelIds([modelId]);
				return;
			}
			const previousModelId = (dialogModelId ?? activeModelId).trim();
			modelSettings.handleModelSettingsModelChange(modelId);
			setSelectedModelIds((current) => {
				const deduped = Array.from(new Set(current));
				if (deduped.length === 0) return [modelId];
				const previousIndex = previousModelId
					? deduped.indexOf(previousModelId)
					: -1;
				if (previousIndex === -1) {
					if (deduped.includes(modelId)) return deduped;
					return [modelId, ...deduped];
				}
				if (deduped[previousIndex] === modelId) {
					return deduped;
				}
				const replaced = [...deduped];
				replaced[previousIndex] = modelId;
				return replaced.filter(
					(candidateId, index) => replaced.indexOf(candidateId) === index,
				);
			});
		},
		[activeModelId, dialogModelId, modelSettings, roomId],
	);

	const enabledSelectedModelIds = useMemo(
		() =>
			selectedModelIds.filter((selectedId) => {
				const profile = modelSettings.getProfileForModel(selectedId);
				return profile.enabled !== false;
			}),
		[modelSettings, selectedModelIds],
	);
	const submitModelIds = useMemo(() => {
		if (roomId !== "video") return enabledSelectedModelIds;
		const preferredModelId =
			activeModelId && enabledSelectedModelIds.includes(activeModelId)
				? activeModelId
				: enabledSelectedModelIds[0];
		return preferredModelId ? [preferredModelId] : [];
	}, [activeModelId, enabledSelectedModelIds, roomId]);

	useEffect(() => {
		if (!infoNotice) return;
		const timeoutId = window.setTimeout(() => {
			setInfoNotice((current) => (current === infoNotice ? null : current));
		}, 7000);
		return () => window.clearTimeout(timeoutId);
	}, [infoNotice]);

	useEffect(() => {
		let mounted = true;
		const loadEntries = async () => {
			const records = await listRoomHistory<MediaHistoryPayload>(roomId as NonTextRoomId);
			const localEntries = records.map((record) => toEntry(record));
			let nextEntries = localEntries;

			if (roomId === "video") {
				try {
					const response = await fetchChatWebApi("/api/chat/video?list=1&limit=100", {
						method: "GET",
						cache: "no-store",
					});
					if (response.ok) {
						const payload = await response.json().catch(() => null);
						const jobs = parseVideoJobList(payload);
						nextEntries = mergeVideoEntriesWithJobs(localEntries, jobs);
						const updatedAt = nowIso();
						await Promise.all(
							nextEntries
								.filter((entry) => !entry.isTemporary)
								.map((entry) =>
									upsertRoomHistory<MediaHistoryPayload>({
										id: entry.id,
										roomId,
										createdAt: entry.createdAt,
										updatedAt,
										payload: {
											modelId: entry.modelId,
											prompt: entry.prompt,
											url: entry.url,
											status: entry.status,
											statusLabel: entry.statusLabel ?? null,
											progressPercent: entry.progressPercent ?? null,
											resourceId: entry.resourceId ?? null,
											requestId: entry.requestId ?? null,
											providerId: entry.providerId ?? null,
											providerName: entry.providerName ?? null,
											finishReason: entry.finishReason ?? null,
											durationMs: entry.durationMs ?? null,
											costUsd: entry.costUsd ?? null,
											videoSeconds: entry.videoSeconds ?? null,
											videoResolution: entry.videoResolution ?? null,
											promptTokens: entry.promptTokens ?? null,
											completionTokens: entry.completionTokens ?? null,
											totalTokens: entry.totalTokens ?? null,
											imageSettings: entry.imageSettings ?? null,
											generationParams: entry.generationParams ?? null,
										},
									}),
								),
						);
					}
				} catch {
					// Keep local history when list hydration is unavailable.
				}
			}

			if (!mounted) return;
			setEntries(roomId === "video" ? toLatestVideoEntry(nextEntries) : nextEntries);
		};
		void loadEntries();
		return () => {
			mounted = false;
		};
	}, [roomId]);

	useEffect(() => {
		entriesRef.current = entries;
	}, [entries]);

	const persistEntries = useCallback(
		async (nextEntries: GenerationEntry[], updatedAt: string) => {
			const persistentEntries = nextEntries.filter((entry) => !entry.isTemporary);
			if (!persistentEntries.length) return;
			await Promise.all(
				persistentEntries.map((entry) =>
					upsertRoomHistory<MediaHistoryPayload>({
						id: entry.id,
						roomId,
						createdAt: entry.createdAt,
						updatedAt,
						payload: {
							modelId: entry.modelId,
							prompt: entry.prompt,
							url: entry.url,
							status: entry.status,
							statusLabel: entry.statusLabel ?? null,
							progressPercent: entry.progressPercent ?? null,
							resourceId: entry.resourceId ?? null,
							requestId: entry.requestId ?? null,
							providerId: entry.providerId ?? null,
							providerName: entry.providerName ?? null,
							finishReason: entry.finishReason ?? null,
							durationMs: entry.durationMs ?? null,
							costUsd: entry.costUsd ?? null,
							videoSeconds: entry.videoSeconds ?? null,
							videoResolution: entry.videoResolution ?? null,
							promptTokens: entry.promptTokens ?? null,
							completionTokens: entry.completionTokens ?? null,
							totalTokens: entry.totalTokens ?? null,
							imageSettings: entry.imageSettings ?? null,
							generationParams: entry.generationParams ?? null,
						},
					}),
				),
			);
		},
		[roomId],
	);

	const addEntries = useCallback(
		async (nextEntries: GenerationEntry[]) => {
			const entriesToAdd =
				roomId === "video" ? nextEntries.slice(0, 1) : nextEntries;
			if (entriesToAdd.length === 0) return;
			setEntries((prev) =>
				roomId === "video" ? entriesToAdd : [...entriesToAdd, ...prev],
			);
			await persistEntries(entriesToAdd, nowIso());
		},
		[persistEntries, roomId],
	);

	const replaceEntry = useCallback(
		async (entryId: string, replacements: GenerationEntry[]) => {
			const nextReplacements =
				roomId === "video" ? replacements.slice(0, 1) : replacements;
			if (nextReplacements.length === 0) return;
			setEntries((prev) => {
				if (roomId === "video") {
					return nextReplacements;
				}
				const index = prev.findIndex((entry) => entry.id === entryId);
				if (index === -1) return [...nextReplacements, ...prev];
				const next = [...prev];
				next.splice(index, 1, ...nextReplacements);
				return next;
			});
			await persistEntries(nextReplacements, nowIso());
		},
		[persistEntries, roomId],
	);

	const isVideoContentProxyReady = useCallback(async (resourceId: string) => {
		const trimmed = resourceId.trim();
		if (!trimmed) return false;
		try {
			const response = await fetchChatWebApi(
				`/api/chat/video?resourceId=${encodeURIComponent(trimmed)}&content=1`,
				{
					method: "GET",
					cache: "no-store",
				},
			);
			if (!response.ok) return false;
			const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
			const isJsonPayload = contentType.includes("application/json");
			try {
				await response.body?.cancel?.();
			} catch {
				// Ignore cancellation errors.
			}
			return !isJsonPayload;
		} catch {
			return false;
		}
	}, []);

	const pollVideoEntryUntilSettled = useCallback(
		async (entryId: string) => {
			if (roomId !== "video") return;
			if (pollingEntryIdsRef.current.has(entryId)) return;
			pollingEntryIdsRef.current.add(entryId);
			try {
				for (;;) {
					const currentEntry = entriesRef.current.find((entry) => entry.id === entryId);
					if (!currentEntry || currentEntry.status !== "pending") break;
					const currentResourceId = currentEntry.resourceId?.trim();
					if (!currentResourceId) break;

					let pollResponse: Response;
					try {
						pollResponse = await fetchChatWebApi(
							`/api/chat/video?resourceId=${encodeURIComponent(currentResourceId)}`,
							{ method: "GET", cache: "no-store" },
						);
					} catch {
						await wait(VIDEO_POLL_INTERVAL_MS);
						continue;
					}

					if (!pollResponse.ok) {
						if (
							pollResponse.status >= 400 &&
							pollResponse.status < 500 &&
							pollResponse.status !== 429
						) {
							await replaceEntry(entryId, [
								{
									...currentEntry,
									status: "failed",
									statusLabel: "failed",
									progressPercent: null,
								},
							]);
							break;
						}
						await wait(VIDEO_POLL_INTERVAL_MS);
						continue;
					}

					const contentType = pollResponse.headers.get("content-type") ?? "";
					if (!contentType.includes("application/json")) {
						await replaceEntry(entryId, [
							{
								...currentEntry,
								status: "completed",
								statusLabel: "completed",
								progressPercent: 100,
								url: buildVideoContentProxyUrl(currentResourceId),
							},
						]);
						break;
					}

					const payload = await pollResponse.json().catch(() => ({}));
					const metrics = extractEntryMetrics(payload);
					const rawStatus = getGenerationStatus(payload);
					const normalizedStatus = normalizeMediaGenerationStatus(rawStatus);
					const nextResourceId = getResourceId(payload) ?? currentResourceId;
					const extractedUrls = extractGenerationUrls(payload);
					const hasCompletionSignal = hasVideoCompletionSignal(payload, metrics);
					const shouldResolveViaContentProxy =
						extractedUrls.length === 0 &&
						(normalizedStatus === "completed" || hasCompletionSignal);
					if (shouldResolveViaContentProxy) {
						const ready = await isVideoContentProxyReady(nextResourceId);
						if (!ready) {
							await wait(
								hasCompletionSignal
									? VIDEO_POLL_INTERVAL_FAST_MS
									: VIDEO_POLL_INTERVAL_MS,
							);
							continue;
						}
					}
					const urls =
						extractedUrls.length > 0
							? extractedUrls
							: shouldResolveViaContentProxy
								? [buildVideoContentProxyUrl(nextResourceId)]
								: [];
					const nextStatus: GenerationEntry["status"] = toMediaEntryStatus({
						rawStatus,
						hasUrls: urls.length > 0,
					});
					const nextEntries = buildResolvedEntries({
						baseEntry: currentEntry,
						modelId: currentEntry.modelId,
						prompt: currentEntry.prompt,
						urls,
						status: nextStatus,
						resourceId: nextResourceId,
						metrics,
						isTemporary: Boolean(currentEntry.isTemporary),
					});
					await replaceEntry(entryId, nextEntries);
					if (nextStatus !== "pending") break;
					await wait(
						hasCompletionSignal
							? VIDEO_POLL_INTERVAL_FAST_MS
							: VIDEO_POLL_INTERVAL_MS,
					);
				}
			} finally {
				pollingEntryIdsRef.current.delete(entryId);
			}
		},
		[isVideoContentProxyReady, replaceEntry, roomId],
	);

	useEffect(() => {
		if (roomId !== "video") return;
		for (const entry of entries) {
			if (entry.status !== "pending") continue;
			if (!entry.resourceId) continue;
			void pollVideoEntryUntilSettled(entry.id);
		}
	}, [entries, pollVideoEntryUntilSettled, roomId]);

	const modelLabelById = useMemo(() => {
		const map = new Map<string, string>();
		for (const model of filteredModels) {
			if (map.has(model.modelId)) continue;
			map.set(
				model.modelId,
				modelSettings.modelDisplayNameById[model.modelId] ||
					model.modelName ||
					model.modelId,
			);
		}
		return map;
	}, [filteredModels, modelSettings.modelDisplayNameById]);

	const hasPendingEntries = useMemo(
		() => entries.some((entry) => entry.status === "pending"),
		[entries],
	);
	const currentVideoEntry = useMemo(
		() => (roomId === "video" ? entries[0] ?? null : null),
		[entries, roomId],
	);
	const recordVideoAspectRatio = useCallback(
		(entryId: string, event: SyntheticEvent<HTMLVideoElement>) => {
			const media = event.currentTarget;
			if (!media.videoWidth || !media.videoHeight) return;
			const ratio = media.videoWidth / media.videoHeight;
			if (!Number.isFinite(ratio) || ratio <= 0) return;
			setVideoAspectRatios((current) => {
				const previous = current[entryId];
				if (typeof previous === "number" && Math.abs(previous - ratio) < 0.001) {
					return current;
				}
				return { ...current, [entryId]: ratio };
			});
		},
		[],
	);
	const previewEntry = useMemo(
		() => entries.find((entry) => entry.id === previewEntryId) ?? null,
		[entries, previewEntryId],
	);
	const previewVideoAspectRatio = useMemo(() => {
		if (!previewEntry || roomId !== "video") return null;
		return videoAspectRatios[previewEntry.id] ?? null;
	}, [previewEntry, roomId, videoAspectRatios]);
	const previewVideoViewportStyle = useMemo(() => {
		if (roomId !== "video") return undefined;
		const fallbackRatio = 16 / 9;
		const ratio =
			typeof previewVideoAspectRatio === "number" && Number.isFinite(previewVideoAspectRatio)
				? previewVideoAspectRatio
				: fallbackRatio;
		return {
			aspectRatio: String(ratio),
			width: `min(100%, calc(68vh * ${ratio}))`,
			maxHeight: "68vh",
		};
	}, [previewVideoAspectRatio, roomId]);
	const previewImageSettingsItems = useMemo(() => {
		if (roomId !== "image" || !previewEntry?.imageSettings) return [];
		const settings = previewEntry.imageSettings;
		const items: Array<{ label: string; value: string }> = [];
		if (settings.aspectRatio) {
			items.push({ label: "Aspect Ratio", value: settings.aspectRatio });
		}
		if (settings.imageSize) {
			items.push({ label: "Image Size", value: settings.imageSize });
		}
		if (settings.resolution) {
			items.push({ label: "Resolution", value: settings.resolution });
		}
		if (settings.quality) {
			items.push({ label: "Quality", value: settings.quality });
		}
		if (settings.style) {
			items.push({ label: "Style", value: settings.style });
		}
		return items;
	}, [previewEntry, roomId]);

	const confirmDeleteEntry = useCallback(async (entryId: string) => {
		const targetEntry = entriesRef.current.find((entry) => entry.id === entryId);
		if (!targetEntry) {
			setDeleteEntryId(null);
			return;
		}
		try {
			if (!targetEntry.isTemporary) {
				await deleteRoomHistory(entryId);
			}
			pollingEntryIdsRef.current.delete(entryId);
			setEntries((current) => current.filter((entry) => entry.id !== entryId));
			setPreviewEntryId((current) =>
				current === entryId ? null : current,
			);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Unable to remove generation",
			);
		} finally {
			setDeleteEntryId(null);
		}
	}, []);

	const toggleTemporaryMode = () => {
		if (!temporaryMode) {
			setTemporaryMode(true);
			setPrompt("");
			setError(null);
			return;
		}
		setTemporaryMode(false);
		setEntries((current) => current.filter((entry) => !entry.isTemporary));
		setPrompt("");
		setError(null);
	};

	const submitGeneration = useCallback(
		async (options?: {
			prompt?: string;
			selectedModelIds?: string[];
			activeModelId?: string;
			temporaryMode?: boolean;
			clearPromptAfterSuccess?: boolean;
			retrySourceEntry?: GenerationEntry | null;
			retryEntryId?: string | null;
		}) => {
			const effectivePrompt = options?.prompt ?? prompt;
			const effectiveSelectedModelIds =
				options?.selectedModelIds ?? selectedModelIds;
			const effectiveActiveModelId = options?.activeModelId ?? activeModelId;
			const effectiveTemporaryMode = options?.temporaryMode ?? temporaryMode;
			const clearPromptAfterSuccess = options?.clearPromptAfterSuccess ?? true;
			const retrySourceEntry = options?.retrySourceEntry ?? null;
			const retryEntryId = options?.retryEntryId ?? null;
			const trimmedPrompt = effectivePrompt.trim();
			const enabledSelectedModelIds = effectiveSelectedModelIds.filter((selectedId) => {
				const profile = modelSettings.getProfileForModel(selectedId);
				return profile.enabled !== false;
			});
			const effectiveSubmitModelIds =
				roomId !== "video"
					? enabledSelectedModelIds
					: (() => {
							const preferredModelId =
								effectiveActiveModelId &&
								enabledSelectedModelIds.includes(effectiveActiveModelId)
									? effectiveActiveModelId
									: enabledSelectedModelIds[0];
							return preferredModelId ? [preferredModelId] : [];
						})();
			if (!trimmedPrompt || isLoading || effectiveSubmitModelIds.length === 0) return;
			if (roomId === "video" && hasPendingEntries) {
				setError("Please wait until the current video generation has completed.");
				return;
			}
			setError(null);
			setIsLoading(true);
			try {
				const pendingEntries = effectiveSubmitModelIds.map((selectedId) => {
					const profile = modelSettings.getProfileForModel(selectedId);
					let imageSettings: ImageGenerationSettings | null = null;
					let videoSeconds: number | null = null;
					let videoResolution: string | null = null;
					let generationParams: Record<string, unknown> | null = null;
					if (roomId === "image") {
						const imageParams =
							(selectedId === retrySourceEntry?.modelId
								? (retrySourceEntry.generationParams as ImageRoomParams | null)
								: null) ??
							(profile.params as ImageRoomParams) ??
							getDefaultImageRoomParams(selectedId);
						const imageRequestOptions = buildImageRequestOptions(
							selectedId,
							imageParams,
						);
						generationParams = { ...imageParams };
						imageSettings = buildImageGenerationSettings(
							selectedId,
							imageParams,
							imageRequestOptions,
						);
					} else {
						const videoParams =
							(selectedId === retrySourceEntry?.modelId
								? (retrySourceEntry.generationParams as VideoRoomParams | null)
								: null) ??
							(profile.params as VideoRoomParams) ??
							getDefaultVideoRoomParams(selectedId);
						const videoRequestOptions = buildVideoRequestOptions(
							selectedId,
							videoParams,
						);
						generationParams = { ...videoParams };
						videoSeconds = toOptionalNumber(
							videoRequestOptions.duration ?? 
								videoRequestOptions.duration_seconds ?? 
								videoRequestOptions.seconds,
						);
						videoResolution = toOptionalString(
							videoRequestOptions.size ??
								videoRequestOptions.resolution ??
								videoRequestOptions.input_resolution,
						);
					}
					return {
						id: crypto.randomUUID(),
						createdAt: nowIso(),
						modelId: selectedId,
						prompt: trimmedPrompt,
						url: "",
						status: "pending" as const,
						statusLabel: "queued",
						progressPercent: null,
						resourceId: null,
						requestId: null,
						providerId: null,
						providerName: null,
						finishReason: null,
						durationMs: null,
						costUsd: null,
						promptTokens: null,
						completionTokens: null,
						totalTokens: null,
						videoSeconds,
						videoResolution,
						imageSettings,
						generationParams,
						isTemporary: effectiveTemporaryMode,
					};
				});
				const pendingEntryByModelId = new Map(
					pendingEntries.map((entry) => [entry.modelId, entry]),
				);
				if (retryEntryId) {
					await replaceEntry(retryEntryId, pendingEntries);
				} else {
					await addEntries(pendingEntries);
				}

				let hasSuccess = false;
				const failures: string[] = [];
				await Promise.all(
					effectiveSubmitModelIds.map(async (targetModelId) => {
						const pendingEntry = pendingEntryByModelId.get(targetModelId);
						if (!pendingEntry) return;
						try {
							const profile = modelSettings.getProfileForModel(targetModelId);
							const requestBody: Record<string, unknown> = {
								model: targetModelId,
								prompt: trimmedPrompt,
							};
							let imageSettings: ImageGenerationSettings | null =
								pendingEntry.imageSettings ?? null;
							if (profile.providerId && profile.providerId !== "auto") {
								requestBody.provider = {
									only: [profile.providerId],
								};
							}
							if (roomId === "image") {
								const imageParams =
									(pendingEntry.generationParams as ImageRoomParams | null) ??
									(profile.params as ImageRoomParams) ??
									getDefaultImageRoomParams(targetModelId);
								const imageRequestOptions = buildImageRequestOptions(
									targetModelId,
									imageParams,
								);
								imageSettings = buildImageGenerationSettings(
									targetModelId,
									imageParams,
									imageRequestOptions,
								);
								Object.assign(requestBody, imageRequestOptions);
							} else {
								Object.assign(
									requestBody,
									buildVideoRequestOptions(
										targetModelId,
										(pendingEntry.generationParams as VideoRoomParams | null) ??
										(profile.params as VideoRoomParams) ??
											getDefaultVideoRoomParams(targetModelId),
									),
								);
							}

							const response = await fetchChatWebApi(`/api/chat/${roomId}`, {
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									requestBody,
									appHeaders: APP_HEADERS,
								}),
							});

							if (!response.ok) {
								const text = await response.text();
								throw new Error(text || `Request failed (${response.status})`);
							}

							const contentType = response.headers.get("content-type") ?? "";
							if (!contentType.includes("application/json")) {
								const blob = await response.blob();
								const objectUrl = URL.createObjectURL(blob);
								await replaceEntry(pendingEntry.id, [
									{
										...pendingEntry,
										url: objectUrl,
										status: "completed",
										statusLabel: "completed",
										progressPercent: 100,
									},
								]);
								hasSuccess = true;
								return;
							}

							const payload = await response.json().catch(() => ({}));
							const metrics = extractEntryMetrics(payload);
							const rawStatus = getGenerationStatus(payload);
							const resourceId = getResourceId(payload);
							const extractedUrls = extractGenerationUrls(payload);
							const normalizedStatus = normalizeMediaGenerationStatus(rawStatus);
							const hasCompletionSignal = hasVideoCompletionSignal(payload, metrics);
							let shouldResolveViaContentProxy =
								roomId === "video" &&
								Boolean(resourceId) &&
								extractedUrls.length === 0 &&
								(normalizedStatus === "completed" || hasCompletionSignal);
							if (shouldResolveViaContentProxy && resourceId) {
								const ready = await isVideoContentProxyReady(resourceId);
								if (!ready) shouldResolveViaContentProxy = false;
							}
							const urls =
								shouldResolveViaContentProxy && resourceId
									? [buildVideoContentProxyUrl(resourceId)]
									: extractedUrls;
							const nextStatus: GenerationEntry["status"] =
								roomId === "video" && resourceId && urls.length === 0
									? "pending"
									: toMediaEntryStatus({
											rawStatus,
											hasUrls: urls.length > 0,
										});
							const nextEntries = buildResolvedEntries({
								baseEntry: pendingEntry,
								modelId: targetModelId,
								prompt: trimmedPrompt,
								urls,
								status: nextStatus,
								resourceId: roomId === "video" ? resourceId : null,
								metrics,
								imageSettings,
								isTemporary: effectiveTemporaryMode,
							});
							await replaceEntry(pendingEntry.id, nextEntries);
							if (roomId === "video" && nextStatus === "pending") {
								void pollVideoEntryUntilSettled(nextEntries[0]?.id ?? pendingEntry.id);
							}
							if (nextStatus !== "failed") {
								hasSuccess = true;
							}
						} catch (err) {
							failures.push(
								err instanceof Error ? err.message : `Generation failed (${targetModelId})`,
							);
							await replaceEntry(pendingEntry.id, [
								{
									...pendingEntry,
									status: "failed",
									statusLabel: "failed",
									progressPercent: null,
								},
							]);
						}
					}),
				);

				if (hasSuccess && clearPromptAfterSuccess) {
					setPrompt("");
				}
				if (failures.length > 0) {
					setError(
						failures.length === 1
							? failures[0]
							: `${failures.length} generation requests failed.`,
					);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Generation failed");
			} finally {
				setIsLoading(false);
			}
		},
		[
			activeModelId,
			addEntries,
			hasPendingEntries,
			isLoading,
			isVideoContentProxyReady,
			modelSettings,
			prompt,
			pollVideoEntryUntilSettled,
			roomId,
			replaceEntry,
			selectedModelIds,
			temporaryMode,
		],
	);

	const retryEntry = useCallback(
		async (entry: GenerationEntry) => {
			if (isLoading) return;
			setRetryingEntryId(entry.id);
			try {
				await submitGeneration({
					prompt: entry.prompt,
					selectedModelIds: [entry.modelId],
					activeModelId: entry.modelId,
					temporaryMode: entry.isTemporary ?? temporaryMode,
					clearPromptAfterSuccess: false,
					retrySourceEntry: entry,
					retryEntryId: entry.id,
				});
			} finally {
				setRetryingEntryId((current) => (current === entry.id ? null : current));
			}
		},
		[isLoading, submitGeneration, temporaryMode],
	);

	const submit = useCallback(() => {
		void submitGeneration();
	}, [submitGeneration]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
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
						selectedModelIds={selectedModelIds}
						onSelectModel={handleSelectModel}
						onRemoveModel={handleRemoveModel}
						onRemoveAllModels={handleRemoveAllModels}
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
									if (!activeModelId) return;
									modelSettings.openModelSettingsForModel(activeModelId);
								}}
								disabled={!activeModelId}
							>
								<SettingsIcon className="h-5 w-5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Settings</TooltipContent>
					</Tooltip>
				</div>
				</header>

			<main className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5 md:px-6">
				{hasPendingEntries ? (
					<div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
						<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
						<p>
							{isImageRoom
								? "Image generation is in progress. Keep this page open until it completes."
								: "Please wait until video generation has completed before starting another one."}
						</p>
					</div>
				) : null}
				{entries.length === 0 ? (
					<div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 px-6 text-center text-sm text-muted-foreground">
						{isImageRoom ? "Your generated images will appear here." : "Your generated videos will appear here."}
					</div>
				) : isImageRoom ? (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
						{entries.map((entry) => {
							const modelLabel = modelLabelById.get(entry.modelId) ?? entry.modelId;
							const pendingState = getPendingGenerationState(entry, "image");
							return (
								<div
									key={entry.id}
									className="overflow-hidden rounded-xl border border-border bg-card"
								>
									<div className="relative aspect-[4/5] bg-muted/20">
										{entry.status === "failed" ? (
											<div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
												<CircleAlert className="h-5 w-5 text-destructive" />
												<p className="text-sm font-medium text-destructive">
													Generation Failed
												</p>
											</div>
										) : entry.url ? (
											<button
												type="button"
												onClick={() => {
													setPreviewEntryId(entry.id);
												}}
												className="group block h-full w-full text-left"
											>
												<img
													src={entry.url}
													alt={entry.prompt || "Generated image"}
													className="h-full w-full object-cover"
												/>
												<div className="pointer-events-none absolute inset-0 bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
												<span className="pointer-events-none absolute left-1/2 top-1/2 inline-flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 scale-95 items-center justify-center rounded-full bg-white/85 text-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
													<Expand className="h-4 w-4" />
												</span>
											</button>
										) : (
											<div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
												<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
												<p className="text-xs font-medium text-foreground">{pendingState.label}</p>
												{pendingState.progress !== null ? (
													<div className="w-24">
														<div className="h-1.5 overflow-hidden rounded-full bg-muted">
															<div
																className="h-full rounded-full bg-foreground/70 transition-all duration-300"
																style={{ width: `${pendingState.progress}%` }}
															/>
														</div>
													</div>
												) : (
													<p className="text-[11px] text-muted-foreground">{pendingState.subtitle}</p>
												)}
											</div>
										)}
									</div>
									<div className="space-y-2 p-3">
										<p
											className="truncate text-[12px] font-medium text-foreground"
											title={modelLabel}
										>
											{modelLabel}
										</p>
										<div className="flex items-center justify-between gap-2">
											<p className="text-[11px] text-muted-foreground">Cost: {formatCost(entry.costUsd)}</p>
											{entry.status === "failed" ? (
												<div className="flex items-center gap-1">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="h-7 w-7"
														onClick={() => {
															void retryEntry(entry);
														}}
														disabled={isLoading}
														aria-label="Retry failed generation"
													>
														{retryingEntryId === entry.id && isLoading ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															<RotateCcw className="h-3.5 w-3.5" />
														)}
													</Button>
													<AlertDialog
														open={deleteEntryId === entry.id}
														onOpenChange={(open) => {
															setDeleteEntryId(open ? entry.id : null);
														}}
													>
														<AlertDialogTrigger asChild>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
																aria-label="Delete failed generation"
															>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>
																	Remove failed generation?
																</AlertDialogTitle>
																<AlertDialogDescription>
																	This removes the failed item from your local room
																	history.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>Cancel</AlertDialogCancel>
																<AlertDialogAction
																	className="bg-destructive text-white hover:bg-destructive/90"
																	onClick={() => {
																		void confirmDeleteEntry(entry.id);
																	}}
																>
																	Delete
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</div>
											) : entry.url ? (
												<a
													className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
													href={entry.url}
													target="_blank"
													rel="noopener noreferrer"
													download
													aria-label="Download image"
												>
													<Download className="h-3.5 w-3.5" />
												</a>
											) : null}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				) : currentVideoEntry ? (
					<div className="mx-auto w-full max-w-6xl">
						{(() => {
							const entry = currentVideoEntry;
							const modelLabel = modelLabelById.get(entry.modelId) ?? entry.modelId;
							const pendingState = getPendingGenerationState(entry, "video");
							return (
								<div className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card">
									<div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-foreground" title={modelLabel}>
												{modelLabel}
											</p>
											<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
												{entry.prompt || "No prompt"}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<p className="text-xs text-muted-foreground">Cost: {formatCost(entry.costUsd)}</p>
											{entry.status === "failed" ? (
												<div className="flex items-center gap-1">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														onClick={() => {
															void retryEntry(entry);
														}}
														disabled={isLoading}
														aria-label="Retry failed generation"
													>
														{retryingEntryId === entry.id && isLoading ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<RotateCcw className="h-4 w-4" />
														)}
													</Button>
													<AlertDialog
														open={deleteEntryId === entry.id}
														onOpenChange={(open) => {
															setDeleteEntryId(open ? entry.id : null);
														}}
													>
														<AlertDialogTrigger asChild>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
																aria-label="Delete failed generation"
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>Remove failed generation?</AlertDialogTitle>
																<AlertDialogDescription>
																	This removes the failed item from your local room history.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>Cancel</AlertDialogCancel>
																<AlertDialogAction
																	className="bg-destructive text-white hover:bg-destructive/90"
																	onClick={() => {
																		void confirmDeleteEntry(entry.id);
																	}}
																>
																	Delete
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</div>
											) : entry.url ? (
												<a
													className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
													href={entry.url}
													target="_blank"
													rel="noopener noreferrer"
													download
													aria-label="Download video"
												>
													<Download className="h-4 w-4" />
												</a>
											) : null}
										</div>
									</div>
									<div className="relative flex min-h-[360px] flex-1 items-center justify-center bg-muted/20 p-4">
										{entry.status === "failed" ? (
											<div className="flex max-w-lg flex-col items-center gap-2 text-center">
												<CircleAlert className="h-8 w-8 text-destructive" />
												<p className="text-sm font-medium text-destructive">Generation failed</p>
												<p className="text-xs text-muted-foreground">
													Try updating the prompt or model settings and run again.
												</p>
											</div>
										) : entry.url ? (
											<MediaPlayer
												theme="surface"
												className="h-full w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-muted/80 to-background shadow-sm"
											>
												<div className="flex h-full min-h-[320px] items-center justify-center px-3 pb-2 pt-3">
													<MediaPlayerVideo
														src={entry.url}
														onLoadedMetadata={(event) => recordVideoAspectRatio(entry.id, event)}
														className="h-full max-h-[calc(100dvh-26rem)] w-full rounded-lg bg-background object-contain"
													/>
													<MediaPlayerLoading />
													<MediaPlayerError />
													<MediaPlayerVolumeIndicator />
												</div>
												<MediaPlayerControls
													layout="inline"
													className="gap-2 bg-background/70 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/50"
												>
													<MediaPlayerSeek />
													<div className="flex w-full flex-wrap items-center gap-1">
														<MediaPlayerPlay />
														<MediaPlayerSeekBackward />
														<MediaPlayerSeekForward />
														<MediaPlayerVolume className="mr-1" collapsed />
														<MediaPlayerTime className="mr-auto" />
														<MediaPlayerSettings showPiP={false} />
													</div>
												</MediaPlayerControls>
											</MediaPlayer>
										) : (
											<div className="flex max-w-lg flex-col items-center gap-3 text-center">
												<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
												<p className="text-sm font-medium text-foreground">{pendingState.label}</p>
												{pendingState.progress !== null ? (
													<div className="w-56 max-w-full">
														<div className="h-2 overflow-hidden rounded-full bg-muted">
															<div
																className="h-full rounded-full bg-foreground/70 transition-all duration-300"
																style={{ width: `${pendingState.progress}%` }}
															/>
														</div>
													</div>
												) : null}
												<p className="text-xs text-muted-foreground">
													Please wait until generation has completed.
												</p>
											</div>
										)}
									</div>
								</div>
							);
						})()}
					</div>
				) : (
					<div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 px-6 text-center text-sm text-muted-foreground">
						Your generated videos will appear here.
					</div>
				)}
			</main>

			<footer className="border-t border-border px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-3xl space-y-2">
					{roomId === "video" && hasPendingEntries ? (
						<p className="text-xs text-muted-foreground">
							Video generation is running. Please wait until it has completed before starting another generation.
						</p>
					) : null}
					{infoNotice ? (
						<div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/20">
							<div className="flex items-start gap-2">
								<Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
								<p className="text-xs text-blue-800 dark:text-blue-100">{infoNotice}</p>
							</div>
						</div>
					) : null}
					{error ? <RoomErrorNotice error={error} /> : null}
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									void submit();
								}
							}}
							placeholder={
								roomId === "image"
									? "Describe the image you want to create..."
									: "Describe the video you want to create..."
							}
							disabled={roomId === "video" && hasPendingEntries}
							rows={3}
							className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						<div className="flex items-center justify-between pt-2">
							<div className="flex items-center gap-1.5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											className="h-8 gap-1.5 px-2"
											onClick={openComposerModelPicker}
											disabled={filteredModels.length === 0 || (roomId === "video" && hasPendingEntries)}
										>
											{activeModelId ? (
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
								onClick={submit}
								disabled={
									!prompt.trim() ||
									isLoading ||
									submitModelIds.length === 0 ||
									(roomId === "video" && hasPendingEntries)
								}
							>
								{(roomId === "video" && hasPendingEntries) || isLoading
									? roomId === "video"
										? "Generating..."
										: "Creating..."
									: submitModelIds.length > 1
										? `Create (${submitModelIds.length})`
										: "Create"}
							</Button>
						</div>
					</div>
				</div>
			</footer>
			<Dialog
				open={Boolean(previewEntryId)}
				onOpenChange={(open) => {
					if (!open) setPreviewEntryId(null);
				}}
			>
				<DialogContent className="max-h-[90vh] max-w-5xl overflow-auto p-0">
					{previewEntry ? (
						roomId === "image" ? (
							<div className="flex flex-col">
								<div className="border-b border-border p-4">
									<DialogHeader className="space-y-2">
										<DialogTitle className="text-base">
											{modelLabelById.get(previewEntry.modelId) ?? previewEntry.modelId}
										</DialogTitle>
										<DialogDescription className="text-sm text-muted-foreground">
											{previewEntry.prompt || "No prompt"}
										</DialogDescription>
									</DialogHeader>
								</div>
								<div className="bg-muted/20 p-4">
									<div className="flex max-h-[62vh] min-h-[320px] items-center justify-center overflow-hidden rounded-lg border border-border bg-background/60">
										<img
											src={previewEntry.url}
											alt={previewEntry.prompt || "Generated image"}
											className="h-auto max-h-[60vh] w-auto max-w-full object-contain"
										/>
									</div>
								</div>
								<div className="border-t border-border p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="flex min-w-0 flex-1 flex-col gap-2">
											<div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
												<span>Timestamp: {formatTimestamp(previewEntry.createdAt)}</span>
												<span className="h-3 w-px bg-border" aria-hidden="true" />
												<span>Cost: {formatCostFull(previewEntry.costUsd)}</span>
												<span className="h-3 w-px bg-border" aria-hidden="true" />
												<span className="inline-flex items-center gap-1">
													<span>Generation Time: {formatDuration(previewEntry.durationMs)}</span>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
																<Info className="h-3.5 w-3.5" />
																<span className="sr-only">Generation time info</span>
															</span>
														</TooltipTrigger>
														<TooltipContent>
															Time it took to generate this image.
														</TooltipContent>
													</Tooltip>
												</span>
											</div>
											{previewImageSettingsItems.length > 0 ? (
												<div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
													{previewImageSettingsItems.map((item, index) => (
														<span key={item.label} className="inline-flex items-center gap-2">
															{index > 0 ? (
																<span className="h-3 w-px bg-border" aria-hidden="true" />
															) : null}
															<span>
																{item.label}: {item.value}
															</span>
														</span>
													))}
												</div>
											) : null}
										</div>
										<div className="flex items-center gap-2">
										<AlertDialog
											open={deleteEntryId === previewEntry.id}
											onOpenChange={(open) => {
												setDeleteEntryId(open ? previewEntry.id : null);
											}}
										>
											<AlertDialogTrigger asChild>
												<Button type="button" variant="outline" className="gap-2">
													<Trash2 className="h-4 w-4" />
													Delete
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Remove generation?
													</AlertDialogTitle>
													<AlertDialogDescription>
														This removes the item from your local room history.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Cancel</AlertDialogCancel>
													<AlertDialogAction
														className="bg-destructive text-white hover:bg-destructive/90"
														onClick={() => {
															void confirmDeleteEntry(previewEntry.id);
														}}
													>
														Delete
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
										{previewEntry.url ? (
											<a
												className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
												href={previewEntry.url}
												target="_blank"
												rel="noopener noreferrer"
												download
											>
												<Download className="h-4 w-4" />
												Download
											</a>
										) : null}
										</div>
									</div>
								</div>
							</div>
						) : (
							<div className="flex flex-col">
								<div className="border-b border-border p-4">
									<DialogHeader className="space-y-2">
										<DialogTitle className="text-base">
											{modelLabelById.get(previewEntry.modelId) ?? previewEntry.modelId}
										</DialogTitle>
										<DialogDescription className="text-sm text-muted-foreground">
											{previewEntry.prompt || "No prompt"}
										</DialogDescription>
									</DialogHeader>
								</div>
								<div className="bg-muted/20 p-4">
									<div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-lg border border-border bg-background/60 p-2">
										{previewEntry.url ? (
											<MediaPlayer
												theme="surface"
												className="w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-muted/80 to-background shadow-sm"
											>
												<div className="flex items-center justify-center px-3 pb-2 pt-3">
													<div
														className="relative max-w-full"
														style={previewVideoViewportStyle}
													>
														<MediaPlayerVideo
															src={previewEntry.url}
															onLoadedMetadata={(event) =>
																recordVideoAspectRatio(previewEntry.id, event)
															}
															className="h-full w-full rounded-lg bg-background object-contain"
														/>
														<MediaPlayerLoading />
														<MediaPlayerError />
														<MediaPlayerVolumeIndicator />
													</div>
												</div>
												<MediaPlayerControls
													layout="inline"
													className="gap-2 bg-background/70 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/50"
												>
													<MediaPlayerSeek />
													<div className="flex w-full flex-wrap items-center gap-1">
														<MediaPlayerPlay />
														<MediaPlayerSeekBackward />
														<MediaPlayerSeekForward />
														<MediaPlayerVolume className="mr-1" collapsed />
														<MediaPlayerTime className="mr-auto" />
														<MediaPlayerSettings showPiP={false} />
													</div>
												</MediaPlayerControls>
											</MediaPlayer>
										) : (
											<div className="space-y-2 p-4">
												<Skeleton className="h-[300px] w-full rounded-lg" />
											</div>
										)}
									</div>
								</div>
								<div className="border-t border-border p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="flex min-w-0 flex-1 flex-col gap-2">
											<div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
												<span>Timestamp: {formatTimestamp(previewEntry.createdAt)}</span>
												<span className="h-3 w-px bg-border" aria-hidden="true" />
												<span>Cost: {formatCostFull(previewEntry.costUsd)}</span>
												<span className="h-3 w-px bg-border" aria-hidden="true" />
												<span className="inline-flex items-center gap-1">
													<span>Generation Time: {formatDuration(previewEntry.durationMs)}</span>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
																<Info className="h-3.5 w-3.5" />
																<span className="sr-only">Generation time info</span>
															</span>
														</TooltipTrigger>
														<TooltipContent>
															Time it took to generate this video.
														</TooltipContent>
													</Tooltip>
												</span>
												<span className="h-3 w-px bg-border" aria-hidden="true" />
												<span>Seconds: {formatVideoSeconds(previewEntry.videoSeconds)}</span>
												<span className="h-3 w-px bg-border" aria-hidden="true" />
												<span>Resolution: {previewEntry.videoResolution ?? "N/A"}</span>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<AlertDialog
												open={deleteEntryId === previewEntry.id}
												onOpenChange={(open) => {
													setDeleteEntryId(open ? previewEntry.id : null);
												}}
											>
												<AlertDialogTrigger asChild>
													<Button
														type="button"
														variant="outline"
														size="icon"
														className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
														aria-label="Delete generation"
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															Remove generation?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This removes the item from your local room history.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction
															className="bg-destructive text-white hover:bg-destructive/90"
															onClick={() => {
																void confirmDeleteEntry(previewEntry.id);
															}}
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
											{previewEntry.url ? (
												<a
													className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
													href={previewEntry.url}
													target="_blank"
													rel="noopener noreferrer"
													download
												>
													<Download className="h-4 w-4" />
													Download
												</a>
											) : null}
										</div>
									</div>
								</div>
							</div>
						)
					) : null}
				</DialogContent>
			</Dialog>
			{roomId === "image" && dialogProfile ? (
				<ImageModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={dialogProfile as RoomModelProfile<ImageRoomParams>}
					selectedModelId={dialogModelId}
					modelChoices={modelSettings.modelSettingsChoices}
					onModelChange={handleModelSettingsModelChange}
					providerOptions={modelSettings.providerOptions}
					supportedProvidersForModel={modelSettings.supportedProvidersForModel}
					onUpdateBase={(partial) => updateModelBaseSettings(partial)}
					onUpdateParams={(partial) => updateModelParams(partial)}
					onReset={resetModelSettings}
				/>
			) : null}
			{roomId === "video" && dialogProfile ? (
				<VideoModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={dialogProfile as RoomModelProfile<VideoRoomParams>}
					selectedModelId={dialogModelId}
					modelChoices={modelSettings.modelSettingsChoices}
					onModelChange={handleModelSettingsModelChange}
					providerOptions={modelSettings.providerOptions}
					supportedProvidersForModel={modelSettings.supportedProvidersForModel}
					onUpdateBase={(partial) => updateModelBaseSettings(partial)}
					onUpdateParams={(partial) => updateModelParams(partial)}
					onAutoAdjustParams={(message: string) => {
						const label =
							(dialogModelId &&
								(modelSettings.modelDisplayNameById[dialogModelId] ||
									modelSettings.modelSettingsModelLabel ||
									dialogModelId)) ||
							"Selected model";
						setInfoNotice(`${label}: ${message}`);
					}}
					onReset={resetModelSettings}
				/>
			) : null}
		</div>
	);
}
