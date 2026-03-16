// src/routes/v1/generation/videos.ts
// Purpose: Data-plane route handler for videos requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { VideoGenerationSchema } from "@core/schemas";
import { guardAuth } from "@pipeline/before/guards";
import { err } from "@pipeline/before/http";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatConfig } from "@providers/openai-compatible/config";
import { getBindings } from "@/runtime/env";
import { loadByokKey } from "@providers/byok";
import { getVideoJobMeta, type VideoJobMeta } from "@core/video-jobs";
import { withRuntime } from "../../utils";

const videoHandler = makeEndpointHandler({ endpoint: "video.generation", schema: VideoGenerationSchema });

export const videosRoutes = new Hono<Env>();

videosRoutes.post("/", withRuntime(videoHandler));

const OPENAI_PROVIDER_ID = "openai";
const XAI_PROVIDER_ID = "x-ai";
const MINIMAX_PROVIDER_ID = "minimax";
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const GOOGLE_OPERATION_PREFIX = "gaiop_";
const DASHSCOPE_TASK_PREFIX = "dscope_";
const XAI_VIDEO_PREFIX = "xaivid_";
const MINIMAX_VIDEO_PREFIX = "mmxvid_";
const DEFAULT_OPENAI_VIDEO_PROXY_TIMEOUT_MS = 30000;

type VideoRouteAuth = {
	requestId: string;
	teamId: string;
	apiKeyId: string;
	apiKeyRef: string | null;
	apiKeyKid: string | null;
	internal?: boolean;
};

function isTrustedGoogleApiHost(hostname: string): boolean {
	const host = hostname.trim().toLowerCase();
	if (!host) return false;
	return host === "generativelanguage.googleapis.com" || host.endsWith(".googleapis.com");
}

function inferGoogleModelFromOperation(operationName: string): string | undefined {
	const match = operationName.match(/models\/([^/]+)\//);
	return match?.[1];
}

function extractGoogleOperationError(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return undefined;
	return (payload as any).error;
}

function resolveOpenAIVideoProxyTimeoutMs(bindings: Record<string, string | undefined>): number {
	const raw = bindings.OPENAI_VIDEO_PROXY_TIMEOUT_MS;
	if (typeof raw === "string" && raw.trim().length > 0) {
		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= 300000) {
			return parsed;
		}
	}
	return DEFAULT_OPENAI_VIDEO_PROXY_TIMEOUT_MS;
}

function mapOpenAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

async function requireOwnedVideoJob(auth: VideoRouteAuth, videoId: string): Promise<{ meta: VideoJobMeta } | Response> {
	const meta = await getVideoJobMeta(auth.teamId, videoId);
	if (meta) return { meta };
	return err("not_found", {
		reason: "video_not_found_or_not_owned",
		request_id: auth.requestId,
		team_id: auth.teamId,
		video_id: videoId,
	});
}

async function resolveVideoProviderKey(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	providerId: string,
	envKey: string,
): Promise<string | null> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	let key = bindings[envKey] ?? null;
	if (videoMeta?.keySource === "byok" && videoMeta.byokKeyId) {
		const byok = await loadByokKey({
			teamId: auth.teamId,
			providerId,
			metaList: [{
				id: videoMeta.byokKeyId,
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

async function proxyOpenAIVideoRequest(
	req: Request,
	auth: { requestId: string; teamId: string },
	path: string,
	method: string,
	options?: { videoMeta?: VideoJobMeta | null }
) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const config = resolveOpenAICompatConfig(OPENAI_PROVIDER_ID);
	let key = bindings[config.apiKeyEnv ?? "OPENAI_API_KEY"];
	const videoMeta = options?.videoMeta;
	if (videoMeta?.keySource === "byok" && videoMeta.byokKeyId) {
		const byok = await loadByokKey({
			teamId: auth.teamId,
			providerId: OPENAI_PROVIDER_ID,
			metaList: [{
				id: videoMeta.byokKeyId,
				providerId: OPENAI_PROVIDER_ID,
				fingerprintSha256: "",
				keyVersion: null,
				alwaysUse: true,
			}],
		});
		if (byok?.key) {
			key = byok.key;
		}
	}
	if (!key) {
		return err("upstream_error", {
			reason: "openai_key_missing",
			request_id: auth.requestId,
			team_id: auth.teamId,
		});
	}

	const requestUrl = new URL(req.url);
	const url = openAICompatUrl(OPENAI_PROVIDER_ID, path) + requestUrl.search;
	const timeoutMs = resolveOpenAIVideoProxyTimeoutMs(bindings);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers: {
				...openAICompatHeaders(OPENAI_PROVIDER_ID, key),
				"Accept": req.headers.get("accept") ?? "*/*",
			},
			signal: controller.signal,
		});
	} catch (fetchErr) {
		const name = typeof fetchErr === "object" && fetchErr ? String((fetchErr as any).name ?? "") : "";
		const isTimeout = name === "AbortError";
		return err("upstream_error", {
			reason: isTimeout ? "openai_video_timeout" : "openai_video_request_failed",
			request_id: auth.requestId,
			team_id: auth.teamId,
			...(isTimeout ? { timeout_ms: timeoutMs } : {}),
			...(isTimeout ? {} : { message: String((fetchErr as any)?.message ?? "unknown_fetch_error") }),
		});
	} finally {
		clearTimeout(timeoutId);
	}

	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers: res.headers,
	});
}

async function fetchOpenAIVideoStatus(
	req: Request,
	auth: VideoRouteAuth,
	id: string,
	videoMeta: VideoJobMeta | null,
): Promise<Response> {
	return proxyOpenAIVideoRequest(req, auth, `/videos/${encodeURIComponent(id)}`, "GET", {
		videoMeta,
	});
}

function decodeGoogleOperationId(videoId: string): string | null {
	if (!videoId.startsWith(GOOGLE_OPERATION_PREFIX)) return null;
	const b64 = videoId.slice(GOOGLE_OPERATION_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function decodeDashscopeTaskId(videoId: string): string | null {
	if (!videoId.startsWith(DASHSCOPE_TASK_PREFIX)) return null;
	const b64 = videoId.slice(DASHSCOPE_TASK_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function decodeXAiVideoId(videoId: string): string | null {
	if (!videoId.startsWith(XAI_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(XAI_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function decodeMiniMaxVideoId(videoId: string): string | null {
	if (!videoId.startsWith(MINIMAX_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(MINIMAX_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

async function fetchGoogleOperation(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	operationName: string,
) {
	const key = await resolveVideoProviderKey(
		auth,
		videoMeta,
		videoMeta?.provider ?? "google-ai-studio",
		"GOOGLE_AI_STUDIO_API_KEY",
	);
	if (!key) {
		return err("upstream_error", {
			reason: "google_key_missing",
		});
	}
	const res = await fetch(`${GOOGLE_BASE_URL}/v1beta/${operationName}?key=${key}`, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	});
	return res;
}

async function fetchGoogleVideoContent(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	uri: string,
) {
	const key = await resolveVideoProviderKey(
		auth,
		videoMeta,
		videoMeta?.provider ?? "google-ai-studio",
		"GOOGLE_AI_STUDIO_API_KEY",
	);
	if (!key) {
		return err("upstream_error", {
			reason: "google_key_missing",
		});
	}

	let requestUrl = uri;
	let shouldAttachGoogleKey = false;
	try {
		const parsed = new URL(uri);
		shouldAttachGoogleKey = isTrustedGoogleApiHost(parsed.hostname);
		if (shouldAttachGoogleKey && parsed.hostname === "generativelanguage.googleapis.com" && !parsed.searchParams.has("key")) {
			parsed.searchParams.set("key", key);
		}
		requestUrl = parsed.toString();
	} catch {
		requestUrl = uri;
	}

	const headers: Record<string, string> = {
		"Accept": "*/*",
	};
	if (shouldAttachGoogleKey) {
		headers["x-goog-api-key"] = key;
	}

	const res = await fetch(requestUrl, {
		method: "GET",
		headers,
	});
	return res;
}

async function fetchDashscopeTask(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	taskId: string,
) {
	const key = await resolveVideoProviderKey(auth, videoMeta, "alibaba", "ALIBABA_CLOUD_API_KEY");
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

async function fetchXAiVideoStatus(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	videoId: string,
) {
	const key = await resolveVideoProviderKey(auth, videoMeta, XAI_PROVIDER_ID, "X_AI_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "xai_key_missing",
		});
	}
	const res = await fetch(openAICompatUrl(XAI_PROVIDER_ID, `/videos/${encodeURIComponent(videoId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(XAI_PROVIDER_ID, key),
			"Accept": "application/json",
		},
	});
	return res;
}

async function fetchXAiVideoContent(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	videoId: string,
) {
	const key = await resolveVideoProviderKey(auth, videoMeta, XAI_PROVIDER_ID, "X_AI_API_KEY");
	if (!key) {
		return err("upstream_error", {
			reason: "xai_key_missing",
		});
	}
	const res = await fetch(openAICompatUrl(XAI_PROVIDER_ID, `/videos/${encodeURIComponent(videoId)}/content`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(XAI_PROVIDER_ID, key),
			"Accept": "*/*",
		},
	});
	return res;
}

async function fetchMiniMaxVideoTask(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	taskId: string,
) {
	const key = await resolveVideoProviderKey(auth, videoMeta, MINIMAX_PROVIDER_ID, "MINIMAX_API_KEY");
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

async function fetchMiniMaxFile(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	fileId: string,
) {
	const key = await resolveVideoProviderKey(auth, videoMeta, MINIMAX_PROVIDER_ID, "MINIMAX_API_KEY");
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

function mapXAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
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

function extractVideoOutputFromPayload(payload: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const output = Array.isArray(payload?.output)
		? payload.output
		: Array.isArray(payload?.data)
			? payload.data
			: [];
	if (output.length > 0) {
		return output.map((item: any, index: number) => ({
			index,
			uri: item?.url ?? item?.uri ?? item?.video_url ?? item?.videoUrl ?? null,
			mime_type: item?.mime_type ?? item?.mimeType ?? "video/mp4",
		}));
	}
	const videoUrl =
		payload?.video?.url ??
		payload?.data?.video?.url ??
		payload?.video_url ??
		payload?.videoUrl ??
		payload?.output?.video_url ??
		payload?.output?.videoUrl ??
		payload?.data?.video_url ??
		payload?.data?.videoUrl;
	if (typeof videoUrl === "string" && videoUrl.length > 0) {
		return [{ index: 0, uri: videoUrl, mime_type: "video/mp4" }];
	}
	return [];
}

videosRoutes.get("/:videoId", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const authValue = auth.value as VideoRouteAuth;
	const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	const ownedVideo = await requireOwnedVideoJob(authValue, id);
	if (ownedVideo instanceof Response) return ownedVideo;
	const videoMeta = ownedVideo.meta;
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		const res = await fetchGoogleOperation(authValue, videoMeta, operationName);
		if (res instanceof Response && res.headers?.get("content-type")?.includes("application/json")) {
			const json = await res.clone().json().catch(() => null);
			if (!res.ok) return res;
			const done = Boolean(json?.done);
			const operationError = done ? extractGoogleOperationError(json) : undefined;
			const failed = done && operationError !== undefined;
			const output = done && !failed
				? (json?.response?.generateVideoResponse?.generatedSamples ?? []).map((sample: any, index: number) => ({
					index,
					uri: sample?.video?.uri ?? null,
					mime_type: sample?.video?.mimeType ?? null,
				}))
				: [];
				const providerId = videoMeta.provider ?? "google-ai-studio";
				const model = String(
					json?.response?.model ??
					json?.metadata?.model ??
					inferGoogleModelFromOperation(operationName) ??
					videoMeta.model ??
					""
				).trim();
				const body = {
					id,
					object: "video",
					status: failed ? "failed" : done ? "completed" : "in_progress",
					provider: providerId,
					model: model || null,
					nativeResponseId: operationName,
					result: json,
					output,
					...(failed ? { error: operationError } : {}),
				};
			return new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return res;
	}
	const dashscopeTaskId = decodeDashscopeTaskId(id);
	if (dashscopeTaskId) {
		const res = await fetchDashscopeTask(authValue, videoMeta, dashscopeTaskId);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const taskStatus = String(json?.output?.task_status ?? json?.status ?? "").toUpperCase();
		const completed = taskStatus === "SUCCEEDED";
		const failed = taskStatus === "FAILED" || taskStatus === "CANCELED" || taskStatus === "CANCELLED";
		const videoUrl =
			json?.output?.video_url ??
			json?.output?.videoUrl ??
			(Array.isArray(json?.output?.video_urls) ? json.output.video_urls[0] : undefined) ??
			(Array.isArray(json?.output?.results) ? json.output.results[0]?.url : undefined);
		const output = videoUrl ? [{ index: 0, uri: videoUrl, mime_type: "video/mp4" }] : [];
			const providerId = videoMeta.provider ?? "alibaba";
			const model = String(
				json?.output?.model ??
				json?.model ??
				videoMeta.model ??
				""
			).trim();
			return new Response(JSON.stringify({
				id,
				object: "video",
				status: completed ? "completed" : failed ? "failed" : "in_progress",
				provider: providerId,
				model: model || null,
				nativeResponseId: dashscopeTaskId,
				result: json,
				output,
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
	}
	const xaiVideoId = decodeXAiVideoId(id);
	if (xaiVideoId) {
		const res = await fetchXAiVideoStatus(authValue, videoMeta, xaiVideoId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
			const status = mapXAiVideoStatus(json?.status);
			const output = extractVideoOutputFromPayload(json);
			const providerId = videoMeta.provider ?? XAI_PROVIDER_ID;
			const model = String(json?.model ?? json?.data?.model ?? videoMeta.model ?? "").trim();
			return new Response(JSON.stringify({
				id,
				object: "video",
				status,
				provider: providerId,
				model: model || null,
				nativeResponseId: xaiVideoId,
				result: json,
				output,
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
	}
	const minimaxTaskId = decodeMiniMaxVideoId(id);
	if (minimaxTaskId) {
		const res = await fetchMiniMaxVideoTask(authValue, videoMeta, minimaxTaskId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
			const status = mapMiniMaxVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
			const output = extractVideoOutputFromPayload(json);
			const providerId = videoMeta.provider ?? MINIMAX_PROVIDER_ID;
			const model = String(json?.model ?? json?.data?.model ?? videoMeta.model ?? "").trim();
			return new Response(JSON.stringify({
				id,
				object: "video",
				status,
				provider: providerId,
				model: model || null,
				nativeResponseId: minimaxTaskId,
				result: json,
				output,
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

	const openAiStatusRes = await fetchOpenAIVideoStatus(req, authValue, id, videoMeta);
	const contentType = openAiStatusRes.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return openAiStatusRes;
	}
	const statusJson = await openAiStatusRes.clone().json().catch(() => null);
	if (!statusJson || typeof statusJson !== "object") {
		return openAiStatusRes;
	}
	if (!openAiStatusRes.ok) {
		return openAiStatusRes;
	}

	return new Response(JSON.stringify(statusJson), {
		status: openAiStatusRes.status,
		headers: { "Content-Type": "application/json" },
	});
}));

videosRoutes.get("/:videoId/content", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const authValue = auth.value as VideoRouteAuth;
	const path = new URL(req.url).pathname;
	const parts = path.split("/");
	const id = parts[parts.length - 2] ?? "";
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	const ownedVideo = await requireOwnedVideoJob(authValue, id);
	if (ownedVideo instanceof Response) return ownedVideo;
	const videoMeta = ownedVideo.meta;
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		const res = await fetchGoogleOperation(authValue, videoMeta, operationName);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const done = Boolean(json?.done);
		if (!done) {
			return err("not_ready", {
				reason: "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const operationError = extractGoogleOperationError(json);
		if (operationError !== undefined) {
			return err("upstream_error", {
				reason: "video_generation_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_error: operationError,
			});
		}
		const uri = json?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetchGoogleVideoContent(authValue, videoMeta, uri);
		if (!(videoRes instanceof Response)) return videoRes;
		return new Response(videoRes.body, {
			status: videoRes.status,
			headers: videoRes.headers,
		});
	}
	const dashscopeTaskId = decodeDashscopeTaskId(id);
	if (dashscopeTaskId) {
		const res = await fetchDashscopeTask(authValue, videoMeta, dashscopeTaskId);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const taskStatus = String(json?.output?.task_status ?? json?.status ?? "").toUpperCase();
		if (taskStatus !== "SUCCEEDED") {
			return err("not_ready", {
				reason: taskStatus === "FAILED" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const uri =
			json?.output?.video_url ??
			json?.output?.videoUrl ??
			(Array.isArray(json?.output?.video_urls) ? json.output.video_urls[0] : undefined) ??
			(Array.isArray(json?.output?.results) ? json.output.results[0]?.url : undefined);
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return new Response(videoRes.body, {
			status: videoRes.status,
			headers: videoRes.headers,
		});
	}
	const xaiVideoId = decodeXAiVideoId(id);
	if (xaiVideoId) {
		const statusRes = await fetchXAiVideoStatus(authValue, videoMeta, xaiVideoId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapXAiVideoStatus(json?.status);
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const uri = extractVideoOutputFromPayload(json)?.[0]?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return new Response(videoRes.body, {
			status: videoRes.status,
			headers: videoRes.headers,
		});
	}
	const minimaxTaskId = decodeMiniMaxVideoId(id);
	if (minimaxTaskId) {
		const statusRes = await fetchMiniMaxVideoTask(authValue, videoMeta, minimaxTaskId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapMiniMaxVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		let uri = extractVideoOutputFromPayload(json)?.[0]?.uri;
		if (!uri) {
			const fileId =
				typeof json?.file_id === "string"
					? json.file_id
					: typeof json?.data?.file_id === "string"
						? json.data.file_id
						: null;
			if (fileId) {
				const fileRes = await fetchMiniMaxFile(authValue, videoMeta, fileId);
				if (!(fileRes instanceof Response)) return fileRes;
				if (!fileRes.ok) return fileRes;
				const fileJson = await fileRes.clone().json().catch(() => null);
				uri =
					fileJson?.file?.download_url ??
					fileJson?.download_url ??
					null;
			}
		}
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return new Response(videoRes.body, {
			status: videoRes.status,
			headers: videoRes.headers,
		});
	}
	return proxyOpenAIVideoRequest(req, authValue, `/videos/${encodeURIComponent(id)}/content`, "GET", {
		videoMeta,
	});
}));

videosRoutes.delete("/:videoId", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const authValue = auth.value as VideoRouteAuth;
	const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	const ownedVideo = await requireOwnedVideoJob(authValue, id);
	if (ownedVideo instanceof Response) return ownedVideo;
	const videoMeta = ownedVideo.meta;
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		return err("not_supported", {
			reason: "google_video_delete_unsupported",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	const dashscopeTaskId = decodeDashscopeTaskId(id);
	if (dashscopeTaskId) {
		return err("not_supported", {
			reason: "dashscope_video_delete_unsupported",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	const xaiVideoId = decodeXAiVideoId(id);
	if (xaiVideoId) {
		return err("not_supported", {
			reason: "xai_video_delete_unsupported",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	const minimaxTaskId = decodeMiniMaxVideoId(id);
	if (minimaxTaskId) {
		return err("not_supported", {
			reason: "minimax_video_delete_unsupported",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	return proxyOpenAIVideoRequest(req, authValue, `/videos/${encodeURIComponent(id)}`, "DELETE", {
		videoMeta,
	});
}));


