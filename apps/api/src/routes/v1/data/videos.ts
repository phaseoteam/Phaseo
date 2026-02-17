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
import { fetchGatewayContext } from "@pipeline/before/context";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatConfig } from "@providers/openai-compatible/config";
import { getBindings } from "@/runtime/env";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { computeBill } from "@pipeline/pricing/engine";
import { applyTierMarkupToUsage } from "@pipeline/pricing/tier-markup";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";
import { getVideoJobMeta, isVideoJobBilled, markVideoJobBilled } from "@core/video-jobs";
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

type VideoRouteAuth = {
	requestId: string;
	teamId: string;
	apiKeyId: string;
	apiKeyRef: string | null;
	apiKeyKid: string | null;
	internal?: boolean;
};

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

function inferGoogleModelFromOperation(operationName: string): string | undefined {
	const match = operationName.match(/models\/([^/]+)\//);
	return match?.[1];
}

function mapOpenAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

function mergeUsage(baseUsage: any, overlayUsage: any): any {
	if (!overlayUsage || typeof overlayUsage !== "object") return baseUsage;
	if (!baseUsage || typeof baseUsage !== "object") return overlayUsage;
	return {
		...baseUsage,
		...overlayUsage,
	};
}

function buildVideoUsage(seconds?: number, pricedUsage?: any) {
	const out: any = {};
	if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
		out.output_video_seconds = seconds;
	}
	const pricing = pricedUsage?.pricing;
	if (pricing && typeof pricing === "object") {
		out.pricing = pricing;
	}
	return Object.keys(out).length ? out : undefined;
}

async function resolveTeamTier(auth: VideoRouteAuth, model: string): Promise<string> {
	try {
		const context = await fetchGatewayContext({
			teamId: auth.teamId,
			model,
			endpoint: "video.generation",
			apiKeyId: auth.apiKeyId,
		});
		return context.teamEnrichment?.tier ?? "basic";
	} catch {
		return "basic";
	}
}

async function maybeChargeVideoCompletion(args: {
	auth: VideoRouteAuth;
	providerId: string;
	model: string;
	videoId: string;
	seconds?: number;
	requestOptions?: Record<string, any>;
}): Promise<{ charged: boolean; pricedUsage?: any }> {
	const { auth, providerId, model, videoId, seconds, requestOptions } = args;
	if (!videoId || !model) return { charged: false };
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
		return { charged: false };
	}

	try {
		const alreadyBilled = await isVideoJobBilled(auth.teamId, videoId);
		if (alreadyBilled) {
			return { charged: false };
		}

		const card = await loadPriceCard(providerId, model, "video.generation");
		if (!card) {
			return { charged: false };
		}

		const tier = await resolveTeamTier(auth, model);
		const pricedBase = computeBill(
			{ output_video_seconds: seconds },
			card,
			{ ...(requestOptions ?? {}), model }
		);
		const pricedUsage = applyTierMarkupToUsage(pricedBase, tier);
		const pricing = pricedUsage?.pricing ?? {};
		const totalNanos = Number(pricing.total_nanos ?? 0) || 0;
		if (totalNanos <= 0) {
			return { charged: false, pricedUsage };
		}

		await recordUsageAndCharge({
			requestId: auth.requestId,
			teamId: auth.teamId,
			cost_nanos: totalNanos,
		});
		await markVideoJobBilled(auth.teamId, videoId);
		return { charged: true, pricedUsage };
	} catch (chargeErr) {
		console.error("video_completion_charge_failed", {
			error: chargeErr,
			requestId: auth.requestId,
			teamId: auth.teamId,
			videoId,
			provider: providerId,
			model,
		});
		return { charged: false };
	}
}

async function proxyOpenAIVideoRequest(
	req: Request,
	auth: { requestId: string; teamId: string },
	path: string,
	method: string
) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const config = resolveOpenAICompatConfig(OPENAI_PROVIDER_ID);
	const key = bindings[config.apiKeyEnv ?? "OPENAI_API_KEY"];
	if (!key) {
		return err("upstream_error", {
			reason: "openai_key_missing",
			request_id: auth.requestId,
			team_id: auth.teamId,
		});
	}

	const requestUrl = new URL(req.url);
	const url = openAICompatUrl(OPENAI_PROVIDER_ID, path) + requestUrl.search;
	const res = await fetch(url, {
		method,
		headers: {
			...openAICompatHeaders(OPENAI_PROVIDER_ID, key),
			"Accept": req.headers.get("accept") ?? "*/*",
		},
	});

	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers: res.headers,
	});
}

async function fetchOpenAIVideoStatus(req: Request, auth: VideoRouteAuth, id: string): Promise<Response> {
	return proxyOpenAIVideoRequest(req, auth, `/videos/${encodeURIComponent(id)}`, "GET");
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

async function fetchGoogleOperation(operationName: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GOOGLE_API_KEY;
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

async function fetchDashscopeTask(taskId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.ALIBABA_API_KEY || bindings.QWEN_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "dashscope_key_missing",
		});
	}
	const baseUrl = (bindings.ALIBABA_BASE_URL || bindings.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
	return fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

async function fetchXAiVideoStatus(videoId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.X_AI_API_KEY || bindings.XAI_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "xai_key_missing",
		});
	}
	const res = await fetch(openAICompatUrl(XAI_PROVIDER_ID, `/videos/generations/${encodeURIComponent(videoId)}`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(XAI_PROVIDER_ID, key),
			"Accept": "application/json",
		},
	});
	return res;
}

async function fetchXAiVideoContent(videoId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.X_AI_API_KEY || bindings.XAI_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "xai_key_missing",
		});
	}
	const res = await fetch(openAICompatUrl(XAI_PROVIDER_ID, `/videos/generations/${encodeURIComponent(videoId)}/content`), {
		method: "GET",
		headers: {
			...openAICompatHeaders(XAI_PROVIDER_ID, key),
			"Accept": "*/*",
		},
	});
	return res;
}

async function fetchMiniMaxVideoTask(taskId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.MINIMAX_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "minimax_key_missing",
		});
	}
	const baseUrl = String(bindings.MINIMAX_BASE_URL || "https://api.minimax.io").replace(/\/+$/, "");
	return fetch(`${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
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
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function mapXAiVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
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
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		const res = await fetchGoogleOperation(operationName);
		if (res instanceof Response && res.headers?.get("content-type")?.includes("application/json")) {
			const json = await res.clone().json().catch(() => null);
			if (!res.ok) return res;
			const done = Boolean(json?.done);
			const output = done
				? (json?.response?.generateVideoResponse?.generatedSamples ?? []).map((sample: any, index: number) => ({
					index,
					uri: sample?.video?.uri ?? null,
					mime_type: sample?.video?.mimeType ?? null,
				}))
				: [];
			const meta = await getVideoJobMeta(authValue.teamId, id);
			const providerId = meta?.provider ?? "google-ai-studio";
			const model = String(
				json?.response?.model ??
				json?.metadata?.model ??
				inferGoogleModelFromOperation(operationName) ??
				meta?.model ??
				""
			).trim();
			const seconds = toPositiveNumber(
				json?.response?.videoMetadata?.durationSeconds ??
				json?.videoMetadata?.durationSeconds ??
				json?.metadata?.durationSeconds ??
				meta?.seconds
			);
			const requestOptions = {
				size: String(json?.metadata?.aspectRatio ?? meta?.size ?? ""),
				quality: String(json?.metadata?.quality ?? meta?.quality ?? ""),
			};
			const charge = done
				? await maybeChargeVideoCompletion({
					auth: authValue,
					providerId,
					model,
					videoId: id,
					seconds,
					requestOptions,
				})
				: { charged: false };
			const usage = done ? buildVideoUsage(seconds, charge.pricedUsage) : undefined;
			const body = {
				id,
				object: "video",
				status: done ? "completed" : "in_progress",
				provider: providerId,
				model: model || null,
				nativeResponseId: operationName,
				result: json,
				output,
				...(usage ? { usage } : {}),
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
		const res = await fetchDashscopeTask(dashscopeTaskId);
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
		const meta = await getVideoJobMeta(authValue.teamId, id);
		const providerId = meta?.provider ?? "alibaba";
		const model = String(
			json?.output?.model ??
			json?.model ??
			meta?.model ??
			""
		).trim();
		const seconds = toPositiveNumber(
			json?.output?.duration ??
			json?.output?.video_duration ??
			json?.usage?.output_video_seconds ??
			meta?.seconds
		);
		const requestOptions = {
			size: String(json?.output?.size ?? meta?.size ?? ""),
			quality: String(json?.output?.quality ?? meta?.quality ?? ""),
		};
		const charge = completed
			? await maybeChargeVideoCompletion({
				auth: authValue,
				providerId,
				model,
				videoId: id,
				seconds,
				requestOptions,
			})
			: { charged: false };
		const usage = completed ? buildVideoUsage(seconds, charge.pricedUsage) : undefined;
		return new Response(JSON.stringify({
			id,
			object: "video",
			status: completed ? "completed" : failed ? "failed" : "in_progress",
			provider: providerId,
			model: model || null,
			nativeResponseId: dashscopeTaskId,
			result: json,
			output,
			...(usage ? { usage } : {}),
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	const xaiVideoId = decodeXAiVideoId(id);
	if (xaiVideoId) {
		const res = await fetchXAiVideoStatus(xaiVideoId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const status = mapXAiVideoStatus(json?.status);
		const output = extractVideoOutputFromPayload(json);
		const meta = await getVideoJobMeta(authValue.teamId, id);
		const providerId = meta?.provider ?? XAI_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? meta?.model ?? "").trim();
		const seconds = toPositiveNumber(
			json?.seconds ??
			json?.duration_seconds ??
			json?.duration ??
			meta?.seconds
		);
		const requestOptions = {
			size: String(json?.size ?? meta?.size ?? ""),
			quality: String(json?.quality ?? meta?.quality ?? ""),
		};
		const charge = status === "completed"
			? await maybeChargeVideoCompletion({
				auth: authValue,
				providerId,
				model,
				videoId: id,
				seconds,
				requestOptions,
			})
			: { charged: false };
		const usage = status === "completed" ? buildVideoUsage(seconds, charge.pricedUsage) : undefined;
		return new Response(JSON.stringify({
			id,
			object: "video",
			status,
			provider: providerId,
			model: model || null,
			nativeResponseId: xaiVideoId,
			result: json,
			output,
			...(usage ? { usage } : {}),
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	const minimaxTaskId = decodeMiniMaxVideoId(id);
	if (minimaxTaskId) {
		const res = await fetchMiniMaxVideoTask(minimaxTaskId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const status = mapMiniMaxVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
		const output = extractVideoOutputFromPayload(json);
		const meta = await getVideoJobMeta(authValue.teamId, id);
		const providerId = meta?.provider ?? MINIMAX_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? meta?.model ?? "").trim();
		const seconds = toPositiveNumber(
			json?.seconds ??
			json?.duration_seconds ??
			json?.duration ??
			json?.data?.duration ??
			meta?.seconds
		);
		const requestOptions = {
			size: String(json?.size ?? meta?.size ?? ""),
			quality: String(json?.quality ?? meta?.quality ?? ""),
		};
		const charge = status === "completed"
			? await maybeChargeVideoCompletion({
				auth: authValue,
				providerId,
				model,
				videoId: id,
				seconds,
				requestOptions,
			})
			: { charged: false };
		const usage = status === "completed" ? buildVideoUsage(seconds, charge.pricedUsage) : undefined;
		return new Response(JSON.stringify({
			id,
			object: "video",
			status,
			provider: providerId,
			model: model || null,
			nativeResponseId: minimaxTaskId,
			result: json,
			output,
			...(usage ? { usage } : {}),
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	const openAiStatusRes = await fetchOpenAIVideoStatus(req, authValue, id);
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

	const status = mapOpenAiVideoStatus((statusJson as any).status);
	if (status === "completed") {
		const meta = await getVideoJobMeta(authValue.teamId, id);
		const model = String((statusJson as any).model ?? meta?.model ?? "").trim();
		const seconds = toPositiveNumber(
			(statusJson as any).seconds ??
			(statusJson as any).duration_seconds ??
			(statusJson as any).result?.seconds ??
			meta?.seconds
		);
		const requestOptions = {
			size: String((statusJson as any).size ?? meta?.size ?? ""),
			quality: String((statusJson as any).quality ?? meta?.quality ?? ""),
		};
		const charge = await maybeChargeVideoCompletion({
			auth: authValue,
			providerId: OPENAI_PROVIDER_ID,
			model,
			videoId: id,
			seconds,
			requestOptions,
		});
		const usage = buildVideoUsage(seconds, charge.pricedUsage);
		if (usage) {
			(statusJson as any).usage = mergeUsage((statusJson as any).usage, usage);
		}
	}

	return new Response(JSON.stringify(statusJson), {
		status: openAiStatusRes.status,
		headers: { "Content-Type": "application/json" },
	});
}));

videosRoutes.get("/:videoId/content", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const path = new URL(req.url).pathname;
	const parts = path.split("/");
	const id = parts[parts.length - 2] ?? "";
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		const res = await fetchGoogleOperation(operationName);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const done = Boolean(json?.done);
		if (!done) {
			return err("not_ready", {
				reason: "video_not_ready",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
			});
		}
		const uri = json?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
			});
		}
		const videoRes = await fetch(uri, {
			method: "GET",
		});
		return new Response(videoRes.body, {
			status: videoRes.status,
			headers: videoRes.headers,
		});
	}
	const dashscopeTaskId = decodeDashscopeTaskId(id);
	if (dashscopeTaskId) {
		const res = await fetchDashscopeTask(dashscopeTaskId);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const taskStatus = String(json?.output?.task_status ?? json?.status ?? "").toUpperCase();
		if (taskStatus !== "SUCCEEDED") {
			return err("not_ready", {
				reason: taskStatus === "FAILED" ? "video_generation_failed" : "video_not_ready",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
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
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
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
		const contentRes = await fetchXAiVideoContent(xaiVideoId);
		if (!(contentRes instanceof Response)) return contentRes;
		if (contentRes.ok) {
			return new Response(contentRes.body, {
				status: contentRes.status,
				headers: contentRes.headers,
			});
		}
		const statusRes = await fetchXAiVideoStatus(xaiVideoId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapXAiVideoStatus(json?.status);
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
			});
		}
		const uri = extractVideoOutputFromPayload(json)?.[0]?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
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
		const statusRes = await fetchMiniMaxVideoTask(minimaxTaskId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapMiniMaxVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
			});
		}
		const uri = extractVideoOutputFromPayload(json)?.[0]?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: auth.value.requestId,
				team_id: auth.value.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return new Response(videoRes.body, {
			status: videoRes.status,
			headers: videoRes.headers,
		});
	}
	return proxyOpenAIVideoRequest(req, auth.value, `/videos/${encodeURIComponent(id)}/content`, "GET");
}));

videosRoutes.delete("/:videoId", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		return err("not_supported", {
			reason: "google_video_delete_unsupported",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}
	const dashscopeTaskId = decodeDashscopeTaskId(id);
	if (dashscopeTaskId) {
		return err("not_supported", {
			reason: "dashscope_video_delete_unsupported",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}
	const xaiVideoId = decodeXAiVideoId(id);
	if (xaiVideoId) {
		return err("not_supported", {
			reason: "xai_video_delete_unsupported",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}
	const minimaxTaskId = decodeMiniMaxVideoId(id);
	if (minimaxTaskId) {
		return err("not_supported", {
			reason: "minimax_video_delete_unsupported",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}
	return proxyOpenAIVideoRequest(req, auth.value, `/videos/${encodeURIComponent(id)}`, "DELETE");
}));
