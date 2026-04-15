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
import { generatePublicId } from "@pipeline/before/genId";
import { isOpenAICompatProvider } from "@providers/openai-compatible/config";
import {
	listTeamVideoJobs,
	setVideoJobStatus,
	type VideoJobMeta,
	type VideoJobRecord,
} from "@core/video-jobs";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";
import { fetchCatalogue } from "../control/models.catalogue";
import { withRuntime } from "../../utils";
import { getVideoByIdHandler } from "./videos.get-by-id";
import { getVideoContentHandler } from "./videos.get-content";

import * as videoHelpers from "./videos.helpers";

type VideoRouteAuth = videoHelpers.VideoRouteAuth;

const {
	normalizeText,
	toPublicVideoProviderId,
	toPublicVideoStatus,
	buildVideoPollingUrl,
	buildVideoContentUrl,
	base64UrlEncodeText,
	base64UrlDecodeText,
	hmacSha256Hex,
	resolveVideoDownloadSigningSecret,
	issueSignedVideoDownloadUrl,
	verifySignedVideoDownloadRequest,
	inferOutputBytes,
	buildContentHeaders,
	toPublicVideoOutputs,
	buildVideoBilling,
	resolveVideoOutputAccess,
	toPublicVideoResponse,
	logGoogleVideoTrace,
	resolveGoogleVideoAuth,
	redactSensitiveUrl,
	inferGoogleModelFromOperation,
	extractGoogleOperationError,
	isGoogleOperationsGetAuthFailure,
	resolveOpenAIVideoProxyTimeoutMs,
	mapOpenAiVideoStatus,
	mapBytedanceVideoStatus,
	mapRunwayVideoStatus,
	mapAtlasVideoStatus,
	normalizeVideoStatus,
	normalizeVideoStatusFilter,
	parseVideoListStatuses,
	parseVideoListLimit,
	requireOwnedVideoJob,
	refreshOwnedVideoJob,
	toFiniteNumber,
	normalizeProgressPercent,
	resolveStatusDetailsProgress,
	resolveMetaCostNanos,
	resolveMetaCostUsd,
	resolveMetaDurationMs,
	enrichVideoPayloadWithJobMetrics,
	finalizeVideoStatusIfTerminal,
	resolveVideoProviderKey,
	proxyOpenAIVideoRequest,
	fetchOpenAIVideoStatus,
	decodeGoogleOperationId,
	decodeDashscopeTaskId,
	decodeXAiVideoId,
	decodeMiniMaxVideoId,
	decodeAtlasVideoId,
	extractGoogleGeneratedVideoPayload,
	extractGoogleVertexGeneratedVideoPayload,
	decodeBase64ToBuffer,
	persistBufferedVideoResponse,
	persistFetchedVideoResponse,
	resolveGoogleVertexVideoCredential,
	fetchGoogleOperation,
	fetchGoogleVideoContent,
	fetchGoogleVertexOperation,
	fetchGoogleVertexVideoContent,
	decodeBytedanceVideoId,
	decodeRunwayVideoId,
	resolveGoogleVertexOperationName,
	resolveGoogleAiStudioOperationName,
	resolveDashscopeTaskId,
	resolveXAiNativeId,
	resolveMiniMaxTaskId,
	resolveByteplusTaskId,
	resolveRunwayTaskId,
	resolveAtlasTaskId,
	fetchDashscopeTask,
	fetchXAiVideoStatus,
	fetchXAiVideoContent,
	fetchMiniMaxVideoTask,
	fetchMiniMaxFile,
	resolveRunwayApiVersion,
	fetchBytedanceTask,
	fetchRunwayTask,
	extractAtlasPredictionPayload,
	fetchAtlasPrediction,
	mapMiniMaxVideoStatus,
	mapXAiVideoStatus,
	extractVideoOutputFromPayload,
} = videoHelpers;

const videoHandler = makeEndpointHandler({ endpoint: "video.generation", schema: VideoGenerationSchema });

export const videosRoutes = new Hono<Env>();

const OPENAI_PROVIDER_ID = "openai";
const XAI_PROVIDER_ID = "x-ai";
const MINIMAX_PROVIDER_ID = "minimax";
const BYTEDANCE_PROVIDER_ID = "bytedance-seed";
const RUNWAY_PROVIDER_ID = "runway";
const ATLAS_PROVIDER_ID = "atlascloud";
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_BYTEDANCE_BASE_URL = "https://ark.ap-southeast.bytepluses.com";
const DEFAULT_RUNWAY_BASE_URL = "https://api.dev.runwayml.com";
const DEFAULT_ATLASCLOUD_BASE_URL = "https://api.atlascloud.ai";
const GOOGLE_OPERATION_PREFIX = "gaiop_";
const DASHSCOPE_TASK_PREFIX = "dscope_";
const XAI_VIDEO_PREFIX = "xaivid_";
const MINIMAX_VIDEO_PREFIX = "mmxvid_";
const BYTEDANCE_VIDEO_PREFIX = "bdvid_";
const RUNWAY_VIDEO_PREFIX = "rwyvid_";
const ATLAS_VIDEO_PREFIX = "atlsvid_";
const DEFAULT_OPENAI_VIDEO_PROXY_TIMEOUT_MS = 30000;
const DEFAULT_VIDEO_POLL_SECONDS = 20;
const DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS = 900;
const MAX_VIDEO_DOWNLOAD_TTL_SECONDS = 3600;

function notImplementedYetResponse(): Response {
	return new Response(JSON.stringify({
		error: {
			code: "not_implemented_yet",
			message: "Video endpoints are temporarily disabled while the public contract is finalized.",
		},
	}), {
		status: 501,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

videosRoutes.use("*", async (c, next) => {
	const raw = String(c.env.VIDEO_API_ENABLED ?? "").trim().toLowerCase();
	const enabled = raw === "1" || raw === "true" || raw === "yes" || raw === "on";
	if (!enabled) {
		return notImplementedYetResponse();
	}
	await next();
});

videosRoutes.post("/", withRuntime(videoHandler));

videosRoutes.get("/", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const authValue = auth.value as VideoRouteAuth;
	const url = new URL(req.url);
	const limit = parseVideoListLimit(url);
	const statuses = parseVideoListStatuses(url);
	const records = await listTeamVideoJobs({
		teamId: authValue.teamId,
		limit,
		statuses: statuses.length > 0 ? statuses : undefined,
	});
	const data = await Promise.all(records.map((record) =>
		toPublicVideoResponse({
			requestUrl: req.url,
			id: record.videoId,
			payload: enrichVideoPayloadWithJobMetrics(
				{
					id: record.videoId,
					status: normalizeVideoStatus(record.status),
					provider: record.provider ?? record.meta?.provider ?? null,
					model: record.model ?? record.meta?.model ?? null,
					createdAt: record.createdAt,
					updatedAt: record.updatedAt,
				},
				record,
				record.meta,
			),
			record,
			meta: record.meta,
		}),
	));

	return new Response(JSON.stringify({
		object: "list",
		data,
	}), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}));

videosRoutes.get("/models", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const catalogue = await fetchCatalogue({
		endpoints: ["video.generation"],
		statuses: ["active"],
	});
	return new Response(JSON.stringify({
		object: "list",
		data: catalogue.map((model) => ({
			model: model.model_id,
			name: model.name,
			status: model.status,
			input_types: model.input_types,
			output_types: model.output_types,
			supported_params: model.supported_params,
			providers: model.providers.map((provider) => ({
				id: toPublicVideoProviderId(provider.api_provider_id),
				supported_params: provider.params,
			})),
			pricing: model.pricing,
		})),
	}), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}));

videosRoutes.get("/:videoId", withRuntime(getVideoByIdHandler));

videosRoutes.get("/:videoId/content", withRuntime(getVideoContentHandler));

videosRoutes.post("/:videoId/cancel", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const authValue = auth.value as VideoRouteAuth;
	const id = decodeURIComponent(new URL(req.url).pathname.split("/").slice(-2, -1)[0] ?? "");
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
		});
	}
	return new Response(JSON.stringify({
		error: "not_implemented_yet",
		reason: "video_cancel_temporarily_disabled",
		request_id: authValue.requestId,
		team_id: authValue.teamId,
		video_id: id,
	}), {
		status: 501,
		headers: { "Content-Type": "application/json" },
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
	const publicStatus = toPublicVideoStatus(ownedVideo.record.status);
	if (publicStatus !== "completed" && publicStatus !== "failed" && publicStatus !== "cancelled") {
		return err("validation_error", {
			reason: "video_delete_requires_terminal_status",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
			video_id: id,
			status: publicStatus,
		});
	}
	await setVideoJobStatus(authValue.teamId, id, ownedVideo.record.status === "cancelled" ? "cancelled" : (ownedVideo.record.status === "completed" ? "completed" : (ownedVideo.record.status === "expired" ? "expired" : "failed")), {
		tombstoned: true,
		tombstonedAt: new Date().toISOString(),
	});
	return new Response(JSON.stringify({
		id,
		object: "video",
		deleted: true,
	}), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}));


