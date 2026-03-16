// Purpose: Poll provider status for pending async video jobs.
// Why: Webhooks are not guaranteed for every provider/state transition.
// How: Reads pending jobs and checks provider-native status APIs.

import { getBindings } from "@/runtime/env";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { loadByokKey } from "@providers/byok";
import type { VideoJobRecord } from "@core/video-jobs";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const GOOGLE_OPERATION_PREFIX = "gaiop_";
const DASHSCOPE_TASK_PREFIX = "dscope_";
const XAI_VIDEO_PREFIX = "xaivid_";
const MINIMAX_VIDEO_PREFIX = "mmxvid_";

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function mapOpenAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

function mapXAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (
		status === "done" ||
		status === "success" ||
		status === "succeeded" ||
		status === "completed" ||
		status === "finished"
	) {
		return "completed";
	}
	if (
		status === "expired" ||
		status === "failed" ||
		status === "error" ||
		status === "cancelled" ||
		status === "canceled"
	) {
		return "failed";
	}
	if (status === "pending" || status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	return "queued";
}

function mapMiniMaxVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
		return "completed";
	}
	if (status === "fail" || status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function decodePrefixedBase64Id(value: string, prefix: string): string | null {
	if (!value.startsWith(prefix)) return null;
	const b64 = value.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function inferGoogleModelFromOperation(operationName: string): string | undefined {
	const match = operationName.match(/models\/([^/]+)\//);
	return match?.[1];
}

function extractGoogleOperationError(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return undefined;
	return (payload as any).error;
}

type VideoProviderStatusResult = {
	status: "queued" | "in_progress" | "completed" | "failed";
	providerId: string;
	model?: string;
	seconds?: number;
	requestOptions?: Record<string, unknown>;
	raw?: unknown;
};

async function resolveProviderPollingKey(args: {
	job: VideoJobRecord;
	providerId: string;
	defaultEnvKey: string;
}): Promise<string | null> {
	const { job, providerId, defaultEnvKey } = args;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	let key = bindings[defaultEnvKey] ?? null;
	if (job.meta?.keySource === "byok" && job.meta.byokKeyId) {
		const byok = await loadByokKey({
			teamId: job.teamId,
			providerId,
			metaList: [{
				id: job.meta.byokKeyId,
				providerId,
				fingerprintSha256: "",
				keyVersion: null,
				alwaysUse: true,
			}],
		});
		if (byok?.key) {
			key = byok.key;
		}
	}
	return key;
}

async function fetchOpenAiVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const key = await resolveProviderPollingKey({
		job,
		providerId: "openai",
		defaultEnvKey: "OPENAI_API_KEY",
	});
	if (!key) return null;
	const res = await fetch(openAICompatUrl("openai", `/videos/${encodeURIComponent(job.videoId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders("openai", key),
			"Accept": "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	const status = mapOpenAiVideoStatus((json as any).status);
	return {
		status,
		providerId: "openai",
		model: String((json as any).model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber((json as any).seconds ?? (json as any).duration_seconds ?? (json as any).result?.seconds),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: (json as any).resolution ?? (json as any).size ?? job.meta?.resolution,
			quality: (json as any).quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

async function fetchGoogleVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const operationName = decodePrefixedBase64Id(job.videoId, GOOGLE_OPERATION_PREFIX);
	if (!operationName) return null;
	const providerId = String(job.provider ?? "google-ai-studio").trim() || "google-ai-studio";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: "GOOGLE_AI_STUDIO_API_KEY",
	});
	if (!key) return null;

	const res = await fetch(`${GOOGLE_BASE_URL}/v1beta/${operationName}?key=${key}`, {
		method: "GET",
		headers: { "Content-Type": "application/json" },
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;

	const done = Boolean((json as any).done);
	const operationError = done ? extractGoogleOperationError(json) : undefined;
	const failed = done && operationError !== undefined;
	const status: VideoProviderStatusResult["status"] = failed ? "failed" : done ? "completed" : "in_progress";

	return {
		status,
		providerId,
		model: String(
			(json as any)?.response?.model ??
			(json as any)?.metadata?.model ??
			inferGoogleModelFromOperation(operationName) ??
			job.model ??
			"",
		).trim() || undefined,
		seconds: toPositiveNumber(
			(json as any)?.response?.videoMetadata?.durationSeconds ??
			(json as any)?.videoMetadata?.durationSeconds ??
			(json as any)?.metadata?.durationSeconds ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution:
				(json as any)?.response?.videoMetadata?.resolution ??
				(json as any)?.metadata?.resolution ??
				job.meta?.resolution,
			quality: (json as any)?.metadata?.quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

async function fetchAlibabaVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const taskId = decodePrefixedBase64Id(job.videoId, DASHSCOPE_TASK_PREFIX);
	if (!taskId) return null;
	const key = await resolveProviderPollingKey({
		job,
		providerId: "alibaba",
		defaultEnvKey: "ALIBABA_CLOUD_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;

	const baseUrl = (bindings.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
	const res = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;

	const taskStatus = String((json as any)?.output?.task_status ?? (json as any)?.status ?? "").toUpperCase();
	const completed = taskStatus === "SUCCEEDED";
	const failed = taskStatus === "FAILED" || taskStatus === "CANCELED" || taskStatus === "CANCELLED";
	const status: VideoProviderStatusResult["status"] = completed ? "completed" : failed ? "failed" : "in_progress";

	return {
		status,
		providerId: "alibaba",
		model: String((json as any)?.output?.model ?? (json as any)?.model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber(
			(json as any)?.output?.duration ??
			(json as any)?.output?.video_duration ??
			(json as any)?.usage?.output_video_seconds ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: (json as any)?.output?.resolution ?? (json as any)?.output?.size ?? job.meta?.resolution,
			quality: (json as any)?.output?.quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

async function fetchXAiVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const nativeId = decodePrefixedBase64Id(job.videoId, XAI_VIDEO_PREFIX);
	if (!nativeId) return null;
	const key = await resolveProviderPollingKey({
		job,
		providerId: "x-ai",
		defaultEnvKey: "X_AI_API_KEY",
	});
	if (!key) return null;

	const res = await fetch(openAICompatUrl("x-ai", `/videos/${encodeURIComponent(nativeId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders("x-ai", key),
			Accept: "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	return {
		status: mapXAiVideoStatus((json as any).status),
		providerId: "x-ai",
		model: String((json as any).model ?? (json as any).data?.model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber(
			(json as any).seconds ??
			(json as any).duration_seconds ??
			(json as any).duration ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: (json as any).resolution ?? (json as any).size ?? job.meta?.resolution,
			quality: (json as any).quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

async function fetchMiniMaxVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const taskId = decodePrefixedBase64Id(job.videoId, MINIMAX_VIDEO_PREFIX);
	if (!taskId) return null;
	const key = await resolveProviderPollingKey({
		job,
		providerId: "minimax",
		defaultEnvKey: "MINIMAX_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || "https://api.minimax.io").replace(/\/+$/, "");
	const res = await fetch(`${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	return {
		status: mapMiniMaxVideoStatus((json as any).status ?? (json as any).task_status ?? (json as any).data?.status),
		providerId: "minimax",
		model: String((json as any).model ?? (json as any).data?.model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber(
			(json as any).duration ??
			(json as any).data?.duration ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: (json as any).resolution ?? (json as any).size ?? job.meta?.resolution,
			quality: (json as any).quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

export async function fetchVideoProviderStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const provider = String(job.provider ?? job.meta?.provider ?? "").trim().toLowerCase();
	if (provider === "openai") return fetchOpenAiVideoStatus(job);
	if (provider === "google-ai-studio" || provider === "google-vertex" || provider === "google") {
		return fetchGoogleVideoStatus(job);
	}
	if (provider === "alibaba") return fetchAlibabaVideoStatus(job);
	if (provider === "x-ai") return fetchXAiVideoStatus(job);
	if (provider === "minimax") return fetchMiniMaxVideoStatus(job);
	return null;
}
