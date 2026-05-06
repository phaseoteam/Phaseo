import { getBindings } from "@/runtime/env";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { decodeGoogleVertexOperationId } from "@providers/google-video/shared";
import { err } from "@pipeline/before/http";

import {
	ATLAS_PROVIDER_ID,
	BYTEDANCE_PROVIDER_ID,
	BYTEDANCE_VIDEO_PREFIX,
	DEFAULT_ATLASCLOUD_BASE_URL,
	DEFAULT_BYTEDANCE_BASE_URL,
	DEFAULT_RUNWAY_BASE_URL,
	MINIMAX_PROVIDER_ID,
	RUNWAY_PROVIDER_ID,
	RUNWAY_VIDEO_PREFIX,
	XAI_PROVIDER_ID,
	normalizeText,
	type VideoJobMeta,
	type VideoJobRecord,
	type VideoRouteAuth,
} from "./shared";
import {
	decodeAtlasVideoId,
	decodeDashscopeTaskId,
	decodeGoogleOperationId,
	decodeMiniMaxVideoId,
	decodeXAiVideoId,
	resolveVideoProviderKey,
} from "./openai-google";

function normalizedProvider(record: VideoJobRecord | null, meta: VideoJobMeta | null): string | null {
	return normalizeText(record?.provider ?? meta?.provider)?.toLowerCase() ?? null;
}

function nativeIdForProviders(
	record: VideoJobRecord | null,
	meta: VideoJobMeta | null,
	expectedProviders: string[],
): string | null {
	const provider = normalizedProvider(record, meta);
	if (!provider || !expectedProviders.includes(provider)) return null;
	return normalizeText(record?.nativeId);
}

export function decodeBytedanceVideoId(videoId: string): string | null {
	if (!videoId.startsWith(BYTEDANCE_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(BYTEDANCE_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function decodeRunwayVideoId(videoId: string): string | null {
	if (!videoId.startsWith(RUNWAY_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(RUNWAY_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function resolveGoogleVertexOperationName(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, ["google-vertex"]) ??
		normalizeText(meta?.googleOperationName) ??
		decodeGoogleVertexOperationId(videoId);
}

export function resolveGoogleAiStudioOperationName(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, ["google-ai-studio", "google"]) ??
		normalizeText(meta?.googleOperationName) ??
		decodeGoogleOperationId(videoId);
}

export function resolveDashscopeTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, ["alibaba", "alibaba-cloud", "qwen"]) ??
		normalizeText(meta?.providerTaskId) ??
		decodeDashscopeTaskId(videoId);
}

export function resolveXAiNativeId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, [XAI_PROVIDER_ID]) ??
		normalizeText(meta?.providerTaskId) ??
		decodeXAiVideoId(videoId);
}

export function resolveMiniMaxTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, [MINIMAX_PROVIDER_ID]) ??
		normalizeText(meta?.providerTaskId) ??
		decodeMiniMaxVideoId(videoId);
}

export function resolveByteplusTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, [BYTEDANCE_PROVIDER_ID]) ??
		normalizeText(meta?.providerTaskId) ??
		decodeBytedanceVideoId(videoId);
}

export function resolveRunwayTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, [RUNWAY_PROVIDER_ID]) ??
		normalizeText(meta?.providerTaskId) ??
		decodeRunwayVideoId(videoId);
}

export function resolveAtlasTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return nativeIdForProviders(record, meta, [ATLAS_PROVIDER_ID, "atlas-cloud"]) ??
		normalizeText(meta?.providerTaskId) ??
		decodeAtlasVideoId(videoId);
}

export async function fetchDashscopeTask(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	taskId: string,
) {
	const providerId = String(videoMeta?.provider ?? "alibaba").trim() || "alibaba";
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "ALIBABA_CLOUD_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "dashscope_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = (bindings.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
	return fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

export async function fetchXAiVideoStatus(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	videoId: string,
) {
	const providerId = String(videoMeta?.provider ?? XAI_PROVIDER_ID).trim().toLowerCase() || XAI_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "X_AI_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "xai_key_missing",
		});
	}
	const res = await fetch(openAICompatUrl(providerId, `/videos/${encodeURIComponent(videoId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(providerId, key),
			"Accept": "application/json",
		},
	});
	return res;
}

export async function fetchXAiVideoContent(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	videoId: string,
) {
	const providerId = String(videoMeta?.provider ?? XAI_PROVIDER_ID).trim().toLowerCase() || XAI_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "X_AI_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "xai_key_missing",
		});
	}
	const res = await fetch(openAICompatUrl(providerId, `/videos/${encodeURIComponent(videoId)}/content`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(providerId, key),
			"Accept": "*/*",
		},
	});
	return res;
}

export async function fetchMiniMaxVideoTask(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	taskId: string,
) {
	const providerId = String(videoMeta?.provider ?? MINIMAX_PROVIDER_ID).trim() || MINIMAX_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "MINIMAX_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "minimax_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || "https://api.minimax.io").replace(/\/+$/, "");
	return fetch(`${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

export async function fetchMiniMaxFile(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	fileId: string,
) {
	const providerId = String(videoMeta?.provider ?? MINIMAX_PROVIDER_ID).trim() || MINIMAX_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "MINIMAX_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "minimax_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || "https://api.minimax.io").replace(/\/+$/, "");
	return fetch(`${baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

export function resolveRunwayApiVersion(
	videoMeta: VideoJobMeta | null,
	bindings: Record<string, string | undefined>,
): string | undefined {
	const model = String(videoMeta?.model ?? "");
	const forceLegacy = model.toLowerCase().includes("gen3");
	if (forceLegacy) return "2024-11-06";
	const configured = String(bindings.RUNWAY_API_VERSION ?? "").trim();
	return configured.length > 0 ? configured : undefined;
}

export async function fetchBytedanceTask(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	taskId: string,
) {
	const providerId = String(videoMeta?.provider ?? BYTEDANCE_PROVIDER_ID).trim() || BYTEDANCE_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "BYTEDANCE_SEED_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "bytedance_seed_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.BYTEDANCE_SEED_BASE_URL || DEFAULT_BYTEDANCE_BASE_URL).replace(/\/+$/, "");
	return fetch(`${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

export async function fetchRunwayTask(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	taskId: string,
) {
	const providerId = String(videoMeta?.provider ?? RUNWAY_PROVIDER_ID).trim() || RUNWAY_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "RUNWAY_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "runway_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.RUNWAY_BASE_URL || DEFAULT_RUNWAY_BASE_URL).replace(/\/+$/, "");
	const apiVersion = resolveRunwayApiVersion(videoMeta, bindings);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
	};
	if (apiVersion) headers["X-Runway-Version"] = apiVersion;
	return fetch(`${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers,
	});
}

export function extractAtlasPredictionPayload(payload: unknown): Record<string, unknown> {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
	const top = payload as Record<string, unknown>;
	const nestedData = top.data;
	if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
		return nestedData as Record<string, unknown>;
	}
	return top;
}

export async function fetchAtlasPrediction(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	predictionId: string,
): Promise<Response> {
	const providerId = String(videoMeta?.provider ?? ATLAS_PROVIDER_ID).trim().toLowerCase() || ATLAS_PROVIDER_ID;
	const key = await resolveVideoProviderKey(auth, videoMeta, providerId, "ATLAS_CLOUD_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "atlascloud_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.ATLAS_CLOUD_BASE_URL || DEFAULT_ATLASCLOUD_BASE_URL).replace(/\/+$/, "");
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
		Accept: "application/json",
	};
	const predictionRes = await fetch(`${baseUrl}/api/v1/model/prediction/${encodeURIComponent(predictionId)}`, {
		method: "GET",
		headers,
	});
	if (predictionRes.ok) return predictionRes;
	const resultRes = await fetch(`${baseUrl}/api/v1/model/result/${encodeURIComponent(predictionId)}`, {
		method: "GET",
		headers,
	});
	if (resultRes.ok) return resultRes;
	return predictionRes;
}

export function mapMiniMaxVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
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

export function mapXAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "done" || status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
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

export function extractVideoOutputFromPayload(payload: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const output = Array.isArray(payload?.output)
		? payload.output
		: Array.isArray(payload?.outputs)
			? payload.outputs
			: Array.isArray(payload?.data)
				? payload.data
				: Array.isArray(payload?.data?.output)
					? payload.data.output
					: Array.isArray(payload?.data?.outputs)
						? payload.data.outputs
						: [];
	if (output.length > 0) {
		return output.map((item: any, index: number) => ({
			index,
			uri:
				typeof item === "string"
					? item
					: item?.url ?? item?.uri ?? item?.video_url ?? item?.videoUrl ?? null,
			mime_type:
				typeof item === "object" && item
					? (item?.mime_type ?? item?.mimeType ?? "video/mp4")
					: "video/mp4",
		}));
	}
	const urls =
		payload?.urls && typeof payload.urls === "object" && !Array.isArray(payload.urls)
			? Object.values(payload.urls as Record<string, unknown>).filter(
				(value): value is string => typeof value === "string" && value.trim().length > 0,
			)
			: payload?.data?.urls && typeof payload.data.urls === "object" && !Array.isArray(payload.data.urls)
				? Object.values(payload.data.urls as Record<string, unknown>).filter(
					(value): value is string => typeof value === "string" && value.trim().length > 0,
				)
				: [];
	if (urls.length > 0) {
		return urls.map((uri, index) => ({ index, uri, mime_type: "video/mp4" }));
	}
	const videoUrl =
		payload?.content?.video_url ??
		payload?.assets?.video ??
		payload?.asset?.url ??
		payload?.video?.url ??
		payload?.data?.video?.url ??
		payload?.video_url ??
		payload?.videoUrl ??
		payload?.output?.video_url ??
		payload?.output?.videoUrl ??
		payload?.data?.video_url ??
		payload?.data?.videoUrl ??
		payload?.data?.content?.video_url;
	if (typeof videoUrl === "string" && videoUrl.length > 0) {
		return [{ index: 0, uri: videoUrl, mime_type: "video/mp4" }];
	}
	return [];
}


