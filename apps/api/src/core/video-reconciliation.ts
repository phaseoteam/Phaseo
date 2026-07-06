// Purpose: Poll provider status for pending async video jobs.
// Why: Webhooks are not guaranteed for every provider/state transition.
// How: Reads pending jobs and checks provider-native status APIs.

import { getBindings } from "@/runtime/env";
import {
	isOpenAICompatProvider,
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatConfig,
} from "@providers/openai-compatible/config";
import { loadByokKey } from "@providers/byok";
import {
	decodeGoogleAiStudioOperationId,
	decodeGoogleVertexOperationId,
	extractGoogleOperationError,
	inferGoogleModelFromOperation,
	isGoogleOperationsGetAuthFailure,
	mapGoogleOperationErrorToVideoStatus,
	normalizeGoogleVideoModelName,
	redactSensitiveUrl,
	resolveGoogleVideoAuth,
} from "@providers/google-video/shared";
import { resolveVertexAccessToken, resolveVertexApiBase } from "@providers/google-vertex/auth";
import type { VideoJobRecord } from "@core/video-jobs";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_BYTEDANCE_BASE_URL = "https://ark.ap-southeast.bytepluses.com";
const DEFAULT_RUNWAY_BASE_URL = "https://api.dev.runwayml.com";
const DASHSCOPE_TASK_PREFIX = "dscope_";
const XAI_VIDEO_PREFIX = "xaivid_";
const MINIMAX_VIDEO_PREFIX = "mmxvid_";
const BYTEDANCE_VIDEO_PREFIX = "bdvid_";
const RUNWAY_VIDEO_PREFIX = "rwyvid_";
const ATLAS_VIDEO_PREFIX = "atlsvid_";

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

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

function toNonNegativeNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed >= 0) return parsed;
	}
	return undefined;
}

type VideoProviderLifecycleStatus = "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";

function mapOpenAiVideoStatus(value: unknown): VideoProviderLifecycleStatus {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

function mapXAiVideoStatus(value: unknown): VideoProviderLifecycleStatus {
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
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") return "failed";
	if (status === "pending" || status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	return "queued";
}

function mapMiniMaxVideoStatus(value: unknown): VideoProviderLifecycleStatus {
	const status = String(value ?? "").toLowerCase();
	if (status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
		return "completed";
	}
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "fail" || status === "failed" || status === "error") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function mapBytedanceVideoStatus(value: unknown): VideoProviderLifecycleStatus {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function mapRunwayVideoStatus(value: unknown): VideoProviderLifecycleStatus {
	const status = String(value ?? "").toLowerCase();
	if (status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
		return "completed";
	}
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	if (status === "throttled") return "queued";
	return "queued";
}

function mapAtlasCloudVideoStatus(value: unknown): VideoProviderLifecycleStatus {
	const status = String(value ?? "").toLowerCase();
	if (status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
		return "completed";
	}
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress" || status === "pending") {
		return "in_progress";
	}
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

function resolveStoredProviderTaskId(
	job: VideoJobRecord,
	decodeLegacy: (value: string) => string | null,
): string | null {
	return (
		toNonEmptyString(job.nativeId) ??
		toNonEmptyString(job.meta?.providerTaskId) ??
		decodeLegacy(job.videoId)
	);
}

function resolveRunwayApiVersion(job: VideoJobRecord, bindings: Record<string, string | undefined>): string | undefined {
	const model = String(job.model ?? job.meta?.model ?? "");
	const forceLegacy = model.toLowerCase().includes("gen3");
	if (forceLegacy) return "2024-11-06";
	const configured = String(bindings.RUNWAY_API_VERSION ?? "").trim();
	return configured.length > 0 ? configured : undefined;
}

type VideoProviderStatusResult = {
	status: VideoProviderLifecycleStatus;
	providerId: string;
	model?: string;
	seconds?: number;
	progress?: number;
	requestOptions?: Record<string, unknown>;
	metaPatch?: Record<string, unknown>;
	raw?: unknown;
};

function normalizeProgressPercent(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(0, Math.min(100, Math.round(value)));
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) {
			return Math.max(0, Math.min(100, Math.round(parsed)));
		}
	}
	return undefined;
}

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
			workspaceId: job.workspaceId,
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

async function resolveGoogleVertexPollingCredential(job: VideoJobRecord): Promise<string | null> {
	const gatewayOrByok = await resolveProviderPollingKey({
		job,
		providerId: "google-vertex",
		defaultEnvKey: "GOOGLE_VERTEX_ACCESS_TOKEN",
	});
	if (gatewayOrByok) return gatewayOrByok;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	return bindings.GOOGLE_VERTEX_API_KEY ?? null;
}

async function fetchOpenAiVideoStatus(
	job: VideoJobRecord,
	providerId: string,
): Promise<VideoProviderStatusResult | null> {
	const config = resolveOpenAICompatConfig(providerId);
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: config.apiKeyEnv ?? "OPENAI_API_KEY",
	});
	if (!key) return null;
	const nativeId =
		typeof job.nativeId === "string" && job.nativeId.trim().length > 0
			? job.nativeId.trim()
			: job.videoId;
	const res = await fetch(openAICompatUrl(providerId, `/videos/${encodeURIComponent(nativeId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(providerId, key),
			"Accept": "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	const status = mapOpenAiVideoStatus((json as any).status);
	return {
		status,
		providerId,
		model: String((json as any).model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber((json as any).seconds ?? (json as any).duration_seconds ?? (json as any).result?.seconds),
		progress:
			normalizeProgressPercent((json as any).progress) ??
			normalizeProgressPercent((json as any).status_details?.progress) ??
			normalizeProgressPercent((json as any).result?.progress),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: (json as any).resolution ?? (json as any).size ?? job.meta?.resolution,
			quality: (json as any).quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

function extractAtlasCloudPayload(json: unknown): Record<string, unknown> | null {
	if (!json || typeof json !== "object" || Array.isArray(json)) return null;
	const top = json as Record<string, unknown>;
	const nestedData = top.data;
	if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
		return nestedData as Record<string, unknown>;
	}
	return top;
}

function extractAtlasCloudOutputUrl(payload: Record<string, unknown>): string | undefined {
	const directOutputs = Array.isArray(payload.outputs) ? payload.outputs : [];
	for (const item of directOutputs) {
		if (typeof item === "string" && item.trim().length > 0) return item.trim();
		if (item && typeof item === "object" && !Array.isArray(item)) {
			const record = item as Record<string, unknown>;
			const uri =
				toNonEmptyString(record.url) ??
				toNonEmptyString(record.uri) ??
				toNonEmptyString(record.video_url) ??
				toNonEmptyString(record.videoUrl);
			if (uri) return uri;
		}
	}
	const outputArray = Array.isArray(payload.output) ? payload.output : [];
	for (const item of outputArray) {
		if (item && typeof item === "object" && !Array.isArray(item)) {
			const record = item as Record<string, unknown>;
			const uri =
				toNonEmptyString(record.url) ??
				toNonEmptyString(record.uri) ??
				toNonEmptyString(record.video_url) ??
				toNonEmptyString(record.videoUrl);
			if (uri) return uri;
		}
	}
	const urls = payload.urls;
	if (urls && typeof urls === "object" && !Array.isArray(urls)) {
		for (const value of Object.values(urls as Record<string, unknown>)) {
			const uri = toNonEmptyString(value);
			if (uri) return uri;
		}
	}
	return (
		toNonEmptyString((payload as any).video_url) ??
		toNonEmptyString((payload as any).videoUrl)
	);
}

async function fetchAtlasCloudVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const taskId = resolveStoredProviderTaskId(job, (value) => decodePrefixedBase64Id(value, ATLAS_VIDEO_PREFIX));
	if (!taskId) return null;
	const providerId = String(job.provider ?? "atlascloud").trim().toLowerCase() || "atlascloud";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: "ATLAS_CLOUD_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.ATLAS_CLOUD_BASE_URL || "https://api.atlascloud.ai").replace(/\/+$/, "");
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
		Accept: "application/json",
	};

	const predictionRes = await fetch(`${baseUrl}/api/v1/model/prediction/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers,
	});
	let finalRes = predictionRes;
	if (!predictionRes.ok) {
		const resultRes = await fetch(`${baseUrl}/api/v1/model/result/${encodeURIComponent(taskId)}`, {
			method: "GET",
			headers,
		});
		if (resultRes.ok) {
			finalRes = resultRes;
		}
	}
	if (!finalRes.ok) return null;
	const json = await finalRes.json().catch(() => null);
	const payload = extractAtlasCloudPayload(json);
	if (!payload) return null;
	const status = mapAtlasCloudVideoStatus(payload.status);
	const outputUrl = extractAtlasCloudOutputUrl(payload);
	return {
		status,
		providerId,
		model: String(payload.model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber(
			payload.seconds ??
			payload.duration_seconds ??
			payload.duration ??
			payload.video_duration ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: payload.resolution ?? payload.size ?? job.meta?.resolution,
			quality: payload.quality ?? job.meta?.quality,
		}),
		metaPatch: {
			providerTaskId: taskId,
			...(outputUrl ? { atlasOutputUrl: outputUrl } : {}),
		},
		raw: json,
	};
}

async function fetchGoogleAiStudioVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const operationName =
		toNonEmptyString(job.nativeId) ??
		toNonEmptyString(job.meta?.googleOperationName) ??
		toNonEmptyString(job.meta?.providerTaskId) ??
		decodeGoogleAiStudioOperationId(job.videoId);
	if (!operationName) return null;
	const providerId = String(job.provider ?? "google-ai-studio").trim() || "google-ai-studio";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: "GOOGLE_AI_STUDIO_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const oauthOverride =
		job.meta?.keySource === "byok"
			? ""
			: String(bindings.GOOGLE_VIDEO_OAUTH_BEARER_TOKEN ?? "").trim();
	const credentialForVideo = oauthOverride || key;
	const googleAuth = resolveGoogleVideoAuth(credentialForVideo);
	const statusUrlObj = new URL(`${GOOGLE_BASE_URL}/v1beta/${operationName}`);
	const statusUrl = statusUrlObj.toString();
	const requestHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		...(googleAuth.kind === "api_key"
			? { "x-goog-api-key": googleAuth.value }
			: { Authorization: `Bearer ${googleAuth.value}` }),
	};
	console.info("video_reconcile_google_poll_start", {
		workspaceId: job.workspaceId,
		videoId: job.videoId,
		providerId,
		operationName,
		authKind: googleAuth.kind,
		outboundHeaderNames: Object.keys(requestHeaders),
		hasApiKeyHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "x-goog-api-key"),
		hasAuthorizationHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "Authorization"),
		statusUrl: redactSensitiveUrl(statusUrl),
		keySource: job.meta?.keySource ?? "gateway",
	});
	const res = await fetch(statusUrl, {
		method: "GET",
		headers: requestHeaders,
	});
	if (!res.ok) {
		const bodyJson = await res.clone().json().catch(() => null);
		const bodyPreview = await res
			.clone()
			.text()
			.then((text) => text.slice(0, 1200))
			.catch(() => "");
		console.error("video_reconcile_google_poll_failed", {
			workspaceId: job.workspaceId,
			videoId: job.videoId,
			providerId,
			operationName,
			authKind: googleAuth.kind,
			outboundHeaderNames: Object.keys(requestHeaders),
			hasApiKeyHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "x-goog-api-key"),
			hasAuthorizationHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "Authorization"),
			statusUrl: redactSensitiveUrl(statusUrl),
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			bodyPreview,
		});
		if (isGoogleOperationsGetAuthFailure(res.status, bodyJson)) {
			return {
				status: "failed",
				providerId,
				model: String(job.model ?? job.meta?.model ?? "").trim() || undefined,
				seconds: toPositiveNumber(job.meta?.seconds),
				requestOptions: buildVideoPricingRequestOptions({
					resolution: job.meta?.resolution,
					quality: job.meta?.quality,
				}),
				metaPatch: {
					googleOperationName: operationName,
					googlePollingAuthUnsupported: true,
					googlePollingAuthFailureAt: new Date().toISOString(),
				},
				raw: bodyJson ?? bodyPreview,
			};
		}
		return null;
	}
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;

	const done = Boolean((json as any).done);
	const operationError = done ? extractGoogleOperationError(json) : undefined;
	const failed = done && operationError !== undefined;
	const status: VideoProviderStatusResult["status"] = operationError !== undefined
		? mapGoogleOperationErrorToVideoStatus(operationError)
		: done
			? "completed"
			: "in_progress";
	const generatedVideo = (json as any)?.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
	const generatedVideoUri =
		typeof generatedVideo?.uri === "string" && generatedVideo.uri.trim().length > 0
			? generatedVideo.uri.trim()
			: null;
	const generatedVideoMimeType =
		typeof generatedVideo?.mimeType === "string" && generatedVideo.mimeType.trim().length > 0
			? generatedVideo.mimeType.trim()
			: null;
	console.info("video_reconcile_google_poll_success", {
		workspaceId: job.workspaceId,
		videoId: job.videoId,
		providerId,
		operationName,
		done,
		failed,
		status,
		hasGeneratedVideoUri: Boolean(generatedVideoUri),
	});

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
		metaPatch: {
			googleOperationName: operationName,
			...(generatedVideoUri ? { googleVideoUri: generatedVideoUri } : {}),
			...(generatedVideoMimeType ? { googleVideoMimeType: generatedVideoMimeType } : {}),
		},
		raw: json,
	};
}

async function fetchGoogleVertexVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const operationName =
		toNonEmptyString(job.nativeId) ??
		toNonEmptyString(job.meta?.googleOperationName) ??
		toNonEmptyString(job.meta?.providerTaskId) ??
		decodeGoogleVertexOperationId(job.videoId);
	if (!operationName) return null;
	const credential = await resolveGoogleVertexPollingCredential(job);
	if (!credential) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const accessToken = await resolveVertexAccessToken(credential);
	const apiBase = resolveVertexApiBase(bindings);
	const providerId = String(job.provider ?? "google-vertex").trim() || "google-vertex";
	const model = normalizeGoogleVideoModelName(String(
		job.model ??
		job.meta?.model ??
		inferGoogleModelFromOperation(operationName) ??
		"",
	).trim());
	if (!model) return null;

	const endpoint = `${apiBase}/publishers/google/models/${encodeURIComponent(model)}:fetchPredictOperation`;
	const requestBody = JSON.stringify({ operationName });
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: requestBody,
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;

	const done = Boolean((json as any).done);
	const operationError = done ? extractGoogleOperationError(json) : undefined;
	const failed = done && operationError !== undefined;
	const status: VideoProviderStatusResult["status"] = operationError !== undefined
		? mapGoogleOperationErrorToVideoStatus(operationError)
		: done
			? "completed"
			: "in_progress";
	const generatedVideo = (json as any)?.response?.videos?.[0];
	const generatedVideoUri =
		typeof generatedVideo?.gcsUri === "string" && generatedVideo.gcsUri.trim().length > 0
			? generatedVideo.gcsUri.trim()
			: typeof generatedVideo?.uri === "string" && generatedVideo.uri.trim().length > 0
				? generatedVideo.uri.trim()
				: null;
	const generatedVideoMimeType =
		typeof generatedVideo?.mimeType === "string" && generatedVideo.mimeType.trim().length > 0
			? generatedVideo.mimeType.trim()
			: null;

	return {
		status,
		providerId,
		model,
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
		metaPatch: {
			googleOperationName: operationName,
			...(generatedVideoUri ? { googleVideoUri: generatedVideoUri } : {}),
			...(generatedVideoMimeType ? { googleVideoMimeType: generatedVideoMimeType } : {}),
		},
		raw: json,
	};
}

async function fetchAlibabaVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const taskId = resolveStoredProviderTaskId(job, (value) => decodePrefixedBase64Id(value, DASHSCOPE_TASK_PREFIX));
	if (!taskId) return null;
	const providerId = String(job.provider ?? "alibaba").trim() || "alibaba";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
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
	const cancelled = taskStatus === "CANCELED" || taskStatus === "CANCELLED";
	const failed = taskStatus === "FAILED";
	const status: VideoProviderStatusResult["status"] = completed
		? "completed"
		: cancelled
			? "cancelled"
			: failed
				? "failed"
				: "in_progress";

	return {
		status,
		providerId,
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
	const nativeId = resolveStoredProviderTaskId(job, (value) => decodePrefixedBase64Id(value, XAI_VIDEO_PREFIX));
	if (!nativeId) return null;
	const providerId = String(job.provider ?? "x-ai").trim().toLowerCase() || "x-ai";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: "X_AI_API_KEY",
	});
	if (!key) return null;

	const res = await fetch(openAICompatUrl(providerId, `/videos/${encodeURIComponent(nativeId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(providerId, key),
			Accept: "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	return {
		status: mapXAiVideoStatus((json as any).status),
		providerId,
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
	const taskId = resolveStoredProviderTaskId(job, (value) => decodePrefixedBase64Id(value, MINIMAX_VIDEO_PREFIX));
	if (!taskId) return null;
	const providerId = String(job.provider ?? "minimax").trim().toLowerCase() || "minimax";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
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
		providerId,
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

async function fetchBytedanceVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const taskId = resolveStoredProviderTaskId(job, (value) => decodePrefixedBase64Id(value, BYTEDANCE_VIDEO_PREFIX));
	if (!taskId) return null;
	const providerId = String(job.provider ?? "bytedance-seed").trim() || "bytedance-seed";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: "BYTEDANCE_SEED_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.BYTEDANCE_SEED_BASE_URL || DEFAULT_BYTEDANCE_BASE_URL).replace(/\/+$/, "");
	const res = await fetch(`${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	const inputVideoSeconds =
		toNonNegativeNumber((json as any).input_video_seconds) ??
		toNonNegativeNumber((json as any).parameters?.input_video_seconds) ??
		toNonNegativeNumber((json as any).data?.input_video_seconds) ??
		toNonNegativeNumber((json as any).data?.parameters?.input_video_seconds) ??
		toNonNegativeNumber(job.meta?.inputVideoSeconds);
	const inputVideoCount =
		toNonNegativeNumber((json as any).input_video_count) ??
		toNonNegativeNumber((json as any).parameters?.input_video_count) ??
		toNonNegativeNumber((json as any).data?.input_video_count) ??
		toNonNegativeNumber((json as any).data?.parameters?.input_video_count) ??
		toNonNegativeNumber(job.meta?.inputVideoCount);
	const frameRate =
		toPositiveNumber((json as any).frame_rate) ??
		toPositiveNumber((json as any).parameters?.frame_rate) ??
		toPositiveNumber((json as any).data?.frame_rate) ??
		toPositiveNumber((json as any).data?.parameters?.frame_rate) ??
		toPositiveNumber(job.meta?.frameRate);
	const totalTokens =
		toPositiveNumber((json as any).usage?.total_tokens) ??
		toPositiveNumber((json as any).usage?.totalTokens) ??
		toPositiveNumber((json as any).data?.usage?.total_tokens) ??
		toPositiveNumber((json as any).data?.usage?.totalTokens);
	return {
		status: mapBytedanceVideoStatus((json as any).status ?? (json as any).task_status ?? (json as any).data?.status),
		providerId,
		model: String((json as any).model ?? (json as any).data?.model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber(
			(json as any).duration ??
			(json as any).data?.duration ??
			(json as any).parameters?.duration ??
			(json as any).data?.parameters?.duration ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution:
				(json as any).size ??
				(json as any).resolution ??
				(json as any).parameters?.size ??
				(json as any).parameters?.resolution ??
				(json as any).data?.size ??
				(json as any).data?.resolution ??
				(json as any).data?.parameters?.size ??
				(json as any).data?.parameters?.resolution ??
				job.meta?.resolution,
			quality:
				(json as any).quality ??
				(json as any).parameters?.quality ??
				(json as any).data?.quality ??
				(json as any).data?.parameters?.quality ??
				job.meta?.quality,
			input_video_seconds: inputVideoSeconds,
			input_video_count: inputVideoCount,
			frame_rate: frameRate,
			total_tokens: totalTokens,
		}),
		raw: json,
	};
}

async function fetchRunwayVideoStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const taskId = resolveStoredProviderTaskId(job, (value) => decodePrefixedBase64Id(value, RUNWAY_VIDEO_PREFIX));
	if (!taskId) return null;
	const providerId = String(job.provider ?? "runway").trim() || "runway";
	const key = await resolveProviderPollingKey({
		job,
		providerId,
		defaultEnvKey: "RUNWAY_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.RUNWAY_BASE_URL || DEFAULT_RUNWAY_BASE_URL).replace(/\/+$/, "");
	const apiVersion = resolveRunwayApiVersion(job, bindings);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
	};
	if (apiVersion) headers["X-Runway-Version"] = apiVersion;
	const res = await fetch(`${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers,
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	if (!json || typeof json !== "object") return null;
	return {
		status: mapRunwayVideoStatus((json as any).status ?? (json as any).task_status ?? (json as any).data?.status),
		providerId,
		model: String((json as any).model ?? (json as any).data?.model ?? job.model ?? "").trim() || undefined,
		seconds: toPositiveNumber(
			(json as any).duration ??
			(json as any).data?.duration ??
			(json as any).task?.duration ??
			job.meta?.seconds,
		),
		requestOptions: buildVideoPricingRequestOptions({
			resolution:
				(json as any).resolution ??
				(json as any).size ??
				(json as any).task?.resolution ??
				(json as any).task?.size ??
				job.meta?.resolution,
			quality: (json as any).quality ?? (json as any).task?.quality ?? job.meta?.quality,
		}),
		raw: json,
	};
}

export async function fetchVideoProviderStatus(job: VideoJobRecord): Promise<VideoProviderStatusResult | null> {
	const provider = String(job.provider ?? job.meta?.provider ?? "").trim().toLowerCase();
	if (provider === "google-ai-studio") return fetchGoogleAiStudioVideoStatus(job);
	if (provider === "google-vertex") return fetchGoogleVertexVideoStatus(job);
	if (provider === "alibaba" || provider === "alibaba-cloud" || provider === "qwen") return fetchAlibabaVideoStatus(job);
	if (provider === "atlascloud" || provider === "atlas-cloud") return fetchAtlasCloudVideoStatus(job);
	if (provider === "x-ai" || provider === "xai") return fetchXAiVideoStatus(job);
	if (provider === "minimax" || provider === "minimax-lightning") return fetchMiniMaxVideoStatus(job);
	if (provider === "bytedance-seed" || provider === "byteplus") return fetchBytedanceVideoStatus(job);
	if (provider === "runway" || provider === "runwayml") return fetchRunwayVideoStatus(job);
	if (provider === "openai" || isOpenAICompatProvider(provider)) return fetchOpenAiVideoStatus(job, provider || "openai");
	return null;
}
