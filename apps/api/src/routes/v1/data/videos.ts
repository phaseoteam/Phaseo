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
import { loadPriceCard } from "@pipeline/pricing/loader";
import { computeBill } from "@pipeline/pricing/engine";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";
import { applyByokServiceFee } from "@pipeline/pricing/byok-fee";
import { loadByokKey } from "@providers/byok";
import { getVideoJobMeta, isVideoJobBilled, markVideoJobBilled, type VideoJobMeta } from "@core/video-jobs";
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

function resolveVideoUsageSeconds(videoMeta: VideoJobMeta | null, ...candidates: unknown[]): number | undefined {
	const preferred = toPositiveNumber(videoMeta?.seconds);
	if (preferred != null) return preferred;
	for (const candidate of candidates) {
		const parsed = toPositiveNumber(candidate);
		if (parsed != null) return parsed;
	}
	return undefined;
}

function normalizeVideoModelForPricing(providerId: string, model: string): string[] {
	const trimmed = model.trim();
	if (!trimmed) return [];
	const out: string[] = [trimmed];
	const provider = providerId.trim().toLowerCase();

	if (provider === "openai") {
		const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
		const bareModel = withoutModelsPrefix.replace(/^openai\//i, "");
		if (bareModel.length > 0) out.push(`openai/${bareModel}`);
		if (/^sora-2(?:-|$)/i.test(bareModel)) out.push("openai/sora-2");
		if (/^sora-2-pro(?:-|$)/i.test(bareModel)) out.push("openai/sora-2-pro-2025-10-03");
	}

	if (provider === "google-ai-studio" || provider === "google" || provider === "google-vertex") {
		const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
		const withoutGooglePrefix = withoutModelsPrefix.replace(/^google\//i, "");
		const googleAliasMap: Record<string, string> = {
			"veo-3.1-fast-generate-preview": "google/veo-3.1-fast-preview",
			"veo-3.1-generate-preview": "google/veo-3.1-preview",
			"veo-3.0-fast-generate-001": "google/veo-3-fast-preview",
			"veo-3.0-generate-001": "google/veo-3-preview",
			"veo-2.0-generate-001": "google/veo-2",
		};
		out.push(`google/${withoutGooglePrefix}`);
		const mapped = googleAliasMap[withoutGooglePrefix];
		if (mapped) out.push(mapped);
	}

	return [...new Set(out.map((value) => value.trim()).filter(Boolean))];
}

function resolveBillingModel(
	providerId: string,
	videoMeta: VideoJobMeta | null,
	...modelCandidates: Array<unknown>
): string {
	const orderedCandidates: string[] = [];
	if (typeof videoMeta?.model === "string") orderedCandidates.push(videoMeta.model);
	for (const candidate of modelCandidates) {
		if (typeof candidate === "string") orderedCandidates.push(candidate);
	}

	for (const candidate of orderedCandidates) {
		const normalized = normalizeVideoModelForPricing(providerId, candidate);
		if (normalized.length > 0) return normalized[0]!;
	}
	return "";
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

async function maybeChargeVideoCompletion(args: {
	auth: VideoRouteAuth;
	providerId: string;
	model: string;
	videoId: string;
	seconds?: number;
	requestOptions?: Record<string, any>;
	isByok?: boolean;
}): Promise<{ charged: boolean; pricedUsage?: any }> {
	const { auth, providerId, model, videoId, seconds, requestOptions, isByok = false } = args;
	if (!videoId || !model) return { charged: false };
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
		return { charged: false };
	}

	try {
		const alreadyBilled = await isVideoJobBilled(auth.teamId, videoId);

		const modelCandidates = normalizeVideoModelForPricing(providerId, model);
		const endpointCandidates = ["video.generate", "video.generation", "video.generations"];
		let resolvedModel = "";
		let card = null as Awaited<ReturnType<typeof loadPriceCard>>;
		for (const modelCandidate of modelCandidates.length > 0 ? modelCandidates : [model]) {
			for (const endpointCandidate of endpointCandidates) {
				card = await loadPriceCard(providerId, modelCandidate, endpointCandidate);
				if (card) {
					resolvedModel = modelCandidate;
					break;
				}
			}
			if (card) break;
		}
		if (!card) {
			return { charged: false };
		}

		const pricedBase = computeBill(
			{ output_video_seconds: seconds },
			card,
			{ ...(requestOptions ?? {}), model: resolvedModel || model }
		);
		if (alreadyBilled) {
			return { charged: false, pricedUsage: pricedBase };
		}
		const byokAdjusted = await applyByokServiceFee({
			teamId: auth.teamId,
			isByok,
			baseCostNanos: Number(pricedBase?.pricing?.total_nanos ?? 0) || 0,
			pricedUsage: pricedBase,
			currencyHint: "USD",
		});
		const pricedUsage = byokAdjusted.pricedUsage;
		const totalNanos = byokAdjusted.totalNanos;
		if (totalNanos <= 0) {
			await markVideoJobBilled(auth.teamId, videoId);
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

async function fetchGoogleVideoContent(uri: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GOOGLE_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "google_key_missing",
		});
	}

	let requestUrl = uri;
	try {
		const parsed = new URL(uri);
		if (parsed.hostname === "generativelanguage.googleapis.com" && !parsed.searchParams.has("key")) {
			parsed.searchParams.set("key", key);
		}
		requestUrl = parsed.toString();
	} catch {
		requestUrl = uri;
	}

	const res = await fetch(requestUrl, {
		method: "GET",
		headers: {
			"Accept": "*/*",
			"x-goog-api-key": key,
		},
	});
	return res;
}

async function fetchDashscopeTask(taskId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.ALIBABA_CLOUD_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "dashscope_key_missing",
		});
	}
	const baseUrl = (bindings.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
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
	const ownedVideo = await requireOwnedVideoJob(authValue, id);
	if (ownedVideo instanceof Response) return ownedVideo;
	const videoMeta = ownedVideo.meta;
	const operationName = decodeGoogleOperationId(id);
	if (operationName) {
		const res = await fetchGoogleOperation(operationName);
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
			const billingModel = resolveBillingModel(providerId, videoMeta, model);
			const seconds = resolveVideoUsageSeconds(
				videoMeta,
				json?.response?.videoMetadata?.durationSeconds ??
				json?.videoMetadata?.durationSeconds ??
				json?.metadata?.durationSeconds
			);
			const requestOptions = {
				size: String(json?.metadata?.aspectRatio ?? videoMeta.size ?? ""),
				quality: String(json?.metadata?.quality ?? videoMeta.quality ?? ""),
			};
			const charge = done && !failed
				? await maybeChargeVideoCompletion({
					auth: authValue,
					providerId,
					model: billingModel,
					videoId: id,
					seconds,
					requestOptions,
					isByok: videoMeta?.keySource === "byok",
				})
				: { charged: false };
			const usage = done && !failed ? buildVideoUsage(seconds, charge.pricedUsage) : undefined;
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
		const providerId = videoMeta.provider ?? "alibaba";
		const model = String(
			json?.output?.model ??
			json?.model ??
			videoMeta.model ??
			""
		).trim();
		const billingModel = resolveBillingModel(providerId, videoMeta, model);
		const seconds = resolveVideoUsageSeconds(
			videoMeta,
			json?.output?.duration ??
			json?.output?.video_duration ??
			json?.usage?.output_video_seconds
		);
		const requestOptions = {
			size: String(json?.output?.size ?? videoMeta.size ?? ""),
			quality: String(json?.output?.quality ?? videoMeta.quality ?? ""),
		};
		const charge = completed
			? await maybeChargeVideoCompletion({
				auth: authValue,
				providerId,
				model: billingModel,
				videoId: id,
				seconds,
				requestOptions,
				isByok: videoMeta?.keySource === "byok",
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
		const providerId = videoMeta.provider ?? XAI_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? videoMeta.model ?? "").trim();
		const billingModel = resolveBillingModel(providerId, videoMeta, model);
		const seconds = resolveVideoUsageSeconds(
			videoMeta,
			json?.seconds ??
			json?.duration_seconds ??
			json?.duration
		);
		const requestOptions = {
			size: String(json?.size ?? videoMeta.size ?? ""),
			quality: String(json?.quality ?? videoMeta.quality ?? ""),
		};
		const charge = status === "completed"
			? await maybeChargeVideoCompletion({
				auth: authValue,
				providerId,
				model: billingModel,
				videoId: id,
				seconds,
				requestOptions,
				isByok: videoMeta?.keySource === "byok",
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
		const providerId = videoMeta.provider ?? MINIMAX_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? videoMeta.model ?? "").trim();
		const billingModel = resolveBillingModel(providerId, videoMeta, model);
		const seconds = resolveVideoUsageSeconds(
			videoMeta,
			json?.seconds ??
			json?.duration_seconds ??
			json?.duration ??
			json?.data?.duration
		);
		const requestOptions = {
			size: String(json?.size ?? videoMeta.size ?? ""),
			quality: String(json?.quality ?? videoMeta.quality ?? ""),
		};
		const charge = status === "completed"
			? await maybeChargeVideoCompletion({
				auth: authValue,
				providerId,
				model: billingModel,
				videoId: id,
				seconds,
				requestOptions,
				isByok: videoMeta?.keySource === "byok",
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

	const status = mapOpenAiVideoStatus((statusJson as any).status);
	if (status === "completed") {
		const model = String((statusJson as any).model ?? videoMeta.model ?? "").trim();
		const billingModel = resolveBillingModel(OPENAI_PROVIDER_ID, videoMeta, model);
		const seconds = resolveVideoUsageSeconds(
			videoMeta,
			(statusJson as any).seconds ??
			(statusJson as any).duration_seconds ??
			(statusJson as any).result?.seconds
		);
		const requestOptions = {
			size: String((statusJson as any).size ?? videoMeta.size ?? ""),
			quality: String((statusJson as any).quality ?? videoMeta.quality ?? ""),
		};
		const charge = await maybeChargeVideoCompletion({
			auth: authValue,
			providerId: OPENAI_PROVIDER_ID,
			model: billingModel,
			videoId: id,
			seconds,
			requestOptions,
			isByok: videoMeta?.keySource === "byok",
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
		const res = await fetchGoogleOperation(operationName);
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
		const videoRes = await fetchGoogleVideoContent(uri);
		if (!(videoRes instanceof Response)) return videoRes;
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
		const statusRes = await fetchMiniMaxVideoTask(minimaxTaskId);
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
