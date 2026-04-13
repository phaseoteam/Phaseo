import { setVideoJobStatus, type VideoJobMeta, type VideoJobRecord } from "@core/video-jobs";
import { guardAuth } from "@pipeline/before/guards";
import { err } from "@pipeline/before/http";
import { generatePublicId } from "@pipeline/before/genId";
import { isOpenAICompatProvider } from "@providers/openai-compatible/config";

import * as videoHelpers from "./videos.helpers";

type VideoRouteAuth = videoHelpers.VideoRouteAuth;

const {
	normalizeText,
	verifySignedVideoDownloadRequest,
	buildContentHeaders,
	logGoogleVideoTrace,
	inferGoogleModelFromOperation,
	extractGoogleOperationError,
	isGoogleOperationsGetAuthFailure,
	mapOpenAiVideoStatus,
	mapBytedanceVideoStatus,
	mapRunwayVideoStatus,
	mapAtlasVideoStatus,
	requireOwnedVideoJob,
	toFiniteNumber,
	finalizeVideoStatusIfTerminal,
	proxyOpenAIVideoRequest,
	fetchOpenAIVideoStatus,
	extractGoogleGeneratedVideoPayload,
	extractGoogleVertexGeneratedVideoPayload,
	decodeBase64ToBuffer,
	persistBufferedVideoResponse,
	persistFetchedVideoResponse,
	fetchGoogleOperation,
	fetchGoogleVideoContent,
	fetchGoogleVertexOperation,
	fetchGoogleVertexVideoContent,
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
	fetchMiniMaxVideoTask,
	fetchMiniMaxFile,
	fetchBytedanceTask,
	fetchRunwayTask,
	extractAtlasPredictionPayload,
	fetchAtlasPrediction,
	mapMiniMaxVideoStatus,
	mapXAiVideoStatus,
	extractVideoOutputFromPayload,
	OPENAI_PROVIDER_ID,
	XAI_PROVIDER_ID,
	MINIMAX_PROVIDER_ID,
	BYTEDANCE_PROVIDER_ID,
	RUNWAY_PROVIDER_ID,
	ATLAS_PROVIDER_ID,
} = videoHelpers;

export async function getVideoContentHandler(req: Request): Promise<Response> {	const path = new URL(req.url).pathname;
	const parts = path.split("/");
	const id = parts[parts.length - 2] ?? "";
	if (!id) {
		return err("validation_error", {
			reason: "missing_video_id",
			request_id: null,
			team_id: null,
		});
	}
	const signedDownload = await verifySignedVideoDownloadRequest(req.url);
	let authValue: VideoRouteAuth;
	if (signedDownload) {
		if (signedDownload.videoId !== id) {
			return err("validation_error", {
				reason: "signed_download_video_mismatch",
				request_id: null,
				team_id: signedDownload.teamId,
				video_id: id,
			});
		}
		authValue = {
			requestId: generatePublicId(),
			teamId: signedDownload.teamId,
			apiKeyId: "signed-download",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: true,
		};
	} else {
		const auth = await guardAuth(req);
		if (!auth.ok) return (auth as { ok: false; response: Response }).response;
		authValue = auth.value as VideoRouteAuth;
	}
	const requestedIndex = signedDownload?.index ?? Math.max(0, Math.trunc(toFiniteNumber(new URL(req.url).searchParams.get("index")) ?? 0));
	const contentDisposition = signedDownload?.disposition ?? null;
	const contentFilename = `${id}.mp4`;
	const ownedVideo = await requireOwnedVideoJob(authValue, id);
	if (ownedVideo instanceof Response) return ownedVideo;
	if (ownedVideo.meta?.tombstoned) {
		return err("not_found", {
			reason: "video_deleted",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
			video_id: id,
		});
	}
	const videoMeta = ownedVideo.meta;
	const vertexOperationName = resolveGoogleVertexOperationName(ownedVideo.record, videoMeta, id);
	if (vertexOperationName) {
		const cachedUri =
			typeof videoMeta?.googleVideoUri === "string" && videoMeta.googleVideoUri.trim().length > 0
				? videoMeta.googleVideoUri.trim()
				: null;
		logGoogleVideoTrace("vertex_content_request_start", {
			requestId: authValue.requestId,
			teamId: authValue.teamId,
			videoId: id,
			operationName: vertexOperationName,
			provider: videoMeta?.provider ?? "google-vertex",
			model: videoMeta?.model ?? null,
			hasCachedUri: Boolean(cachedUri),
			jobStatus: ownedVideo.record?.status ?? null,
		});
		if (cachedUri) {
			const cachedVideoRes = await fetchGoogleVertexVideoContent(authValue, videoMeta, cachedUri);
			if (cachedVideoRes instanceof Response && cachedVideoRes.ok) {
				logGoogleVideoTrace("vertex_content_served_from_cached_uri", {
					requestId: authValue.requestId,
					teamId: authValue.teamId,
					videoId: id,
					operationName: vertexOperationName,
					cachedUri,
				});
				return new Response(cachedVideoRes.body, {
					status: cachedVideoRes.status,
					headers: buildContentHeaders(cachedVideoRes.headers, {
						contentDisposition,
						filename: contentFilename,
					}),
				});
			}
		}
		const res = await fetchGoogleVertexOperation(authValue, videoMeta, vertexOperationName);
		if (!res.ok) {
			const upstreamBody = await res.clone().text().catch(() => "");
			return err("upstream_error", {
				reason: "google_vertex_operation_fetch_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_status: res.status,
				upstream_status_text: res.statusText || null,
				upstream_body_preview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
				operation_name: vertexOperationName,
			});
		}
		const json = await res.clone().json().catch(() => null);
		const generatedVideo = extractGoogleVertexGeneratedVideoPayload(json, requestedIndex);
		const providerId = videoMeta?.provider ?? "google-vertex";
		const model = inferGoogleModelFromOperation(vertexOperationName) ?? videoMeta?.model ?? null;
		const seconds =
			toFiniteNumber(json?.response?.videoMetadata?.durationSeconds) ??
			toFiniteNumber(videoMeta?.seconds);
		const resolution =
			(typeof json?.response?.videoMetadata?.resolution === "string"
				? json.response.videoMetadata.resolution
				: typeof json?.metadata?.resolution === "string"
					? json.metadata.resolution
					: videoMeta?.resolution) ?? null;
		const quality =
			(typeof json?.metadata?.quality === "string"
				? json.metadata.quality
				: videoMeta?.quality) ?? null;
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
			await finalizeVideoStatusIfTerminal({
				auth: authValue,
				videoId: id,
				videoMeta,
				providerId,
				status: "failed",
				model,
				seconds,
				resolution,
				quality,
				metaPatch: {
					googleOperationName: vertexOperationName,
				},
			});
			return err("upstream_error", {
				reason: "video_generation_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_error: operationError,
			});
		}
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status: "completed",
			model,
			seconds,
			resolution,
			quality,
			metaPatch: {
				googleOperationName: vertexOperationName,
				...(generatedVideo.uri ? { googleVideoUri: generatedVideo.uri } : {}),
				...(generatedVideo.mimeType ? { googleVideoMimeType: generatedVideo.mimeType } : {}),
			},
		});
		const uri = generatedVideo.uri;
		const b64Json = generatedVideo.b64Json;
		if (!uri && b64Json) {
			return persistBufferedVideoResponse({
				teamId: authValue.teamId,
				videoId: id,
				index: requestedIndex,
				buffer: decodeBase64ToBuffer(b64Json),
				mimeType: generatedVideo.mimeType,
				contentDisposition,
				filename: contentFilename,
			});
		}
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetchGoogleVertexVideoContent(authValue, videoMeta, uri);
		if (!(videoRes instanceof Response)) return videoRes;
		if (!videoRes.ok) {
			const upstreamBody = await videoRes.clone().text().catch(() => "");
			return err("upstream_error", {
				reason: "google_vertex_video_content_fetch_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_status: videoRes.status,
				upstream_status_text: videoRes.statusText || null,
				upstream_body_preview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
				content_uri: uri,
			});
		}
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const operationName = resolveGoogleAiStudioOperationName(ownedVideo.record, videoMeta, id);
	if (operationName) {
		const cachedUri =
			typeof videoMeta?.googleVideoUri === "string" && videoMeta.googleVideoUri.trim().length > 0
				? videoMeta.googleVideoUri.trim()
				: null;
		logGoogleVideoTrace("content_request_start", {
			requestId: authValue.requestId,
			teamId: authValue.teamId,
			videoId: id,
			operationName,
			provider: videoMeta?.provider ?? "google-ai-studio",
			model: videoMeta?.model ?? null,
			hasCachedUri: Boolean(cachedUri),
			jobStatus: ownedVideo.record?.status ?? null,
		});
		if (cachedUri) {
			const cachedVideoRes = await fetchGoogleVideoContent(authValue, videoMeta, cachedUri);
			if (cachedVideoRes instanceof Response && cachedVideoRes.ok) {
				logGoogleVideoTrace("content_served_from_cached_uri", {
					requestId: authValue.requestId,
					teamId: authValue.teamId,
					videoId: id,
					operationName,
					cachedUri,
				});
				return new Response(cachedVideoRes.body, {
					status: cachedVideoRes.status,
					headers: buildContentHeaders(cachedVideoRes.headers, {
						contentDisposition,
						filename: contentFilename,
					}),
				});
			}
		}
		const res = await fetchGoogleOperation(authValue, videoMeta, operationName);
		if (!res.ok) {
			const upstreamBody = await res.clone().text().catch(() => "");
			const upstreamJson = await res.clone().json().catch(() => null);
			if (isGoogleOperationsGetAuthFailure(res.status, upstreamJson)) {
				await finalizeVideoStatusIfTerminal({
					auth: authValue,
					videoId: id,
					videoMeta,
					providerId: videoMeta?.provider ?? "google-ai-studio",
					status: "failed",
					model: videoMeta?.model ?? null,
					seconds: toFiniteNumber(videoMeta?.seconds),
					resolution: videoMeta?.resolution ?? null,
					quality: videoMeta?.quality ?? null,
					metaPatch: {
						googleOperationName: operationName,
						googlePollingAuthUnsupported: true,
						googlePollingAuthFailureAt: new Date().toISOString(),
					},
				});
				return err("upstream_error", {
					reason: "google_operation_auth_unsupported",
					request_id: authValue.requestId,
					team_id: authValue.teamId,
					operation_name: operationName,
					hint: "Google native operation polling requires OAuth principal auth for this endpoint.",
				});
			}
			return err("upstream_error", {
				reason: "google_video_operation_fetch_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_status: res.status,
				upstream_status_text: res.statusText || null,
				upstream_body_preview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
				operation_name: operationName,
			});
		}
		const json = await res.clone().json().catch(() => null);
		const generatedVideo = extractGoogleGeneratedVideoPayload(json, requestedIndex);
		const providerId = videoMeta?.provider ?? "google-ai-studio";
		const model = inferGoogleModelFromOperation(operationName) ?? videoMeta?.model ?? null;
		const seconds =
			toFiniteNumber(json?.response?.videoMetadata?.durationSeconds) ??
			toFiniteNumber(videoMeta?.seconds);
		const resolution =
			(typeof json?.response?.videoMetadata?.resolution === "string"
				? json.response.videoMetadata.resolution
				: typeof json?.metadata?.resolution === "string"
					? json.metadata.resolution
					: videoMeta?.resolution) ?? null;
		const quality =
			(typeof json?.metadata?.quality === "string"
				? json.metadata.quality
				: videoMeta?.quality) ?? null;
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
			await finalizeVideoStatusIfTerminal({
				auth: authValue,
				videoId: id,
				videoMeta,
				providerId,
				status: "failed",
				model,
				seconds,
				resolution,
				quality,
				metaPatch: {
					googleOperationName: operationName,
				},
			});
			return err("upstream_error", {
				reason: "video_generation_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_error: operationError,
			});
		}
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status: "completed",
			model,
			seconds,
			resolution,
			quality,
			metaPatch: {
				googleOperationName: operationName,
				...(generatedVideo.uri ? { googleVideoUri: generatedVideo.uri } : {}),
				...(generatedVideo.mimeType ? { googleVideoMimeType: generatedVideo.mimeType } : {}),
			},
		});
		const uri = generatedVideo.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetchGoogleVideoContent(authValue, videoMeta, uri);
		if (!(videoRes instanceof Response)) return videoRes;
		if (!videoRes.ok) {
			const upstreamBody = await videoRes.clone().text().catch(() => "");
			return err("upstream_error", {
				reason: "google_video_content_fetch_failed",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				upstream_status: videoRes.status,
				upstream_status_text: videoRes.statusText || null,
				upstream_body_preview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
				content_uri: uri,
			});
		}
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const dashscopeTaskId = resolveDashscopeTaskId(ownedVideo.record, videoMeta, id);
	if (dashscopeTaskId) {
		const res = await fetchDashscopeTask(authValue, videoMeta, dashscopeTaskId);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const taskStatus = String(json?.output?.task_status ?? json?.status ?? "").toUpperCase();
		const completed = taskStatus === "SUCCEEDED";
		const failed = taskStatus === "FAILED" || taskStatus === "CANCELED" || taskStatus === "CANCELLED";
		const status: "queued" | "in_progress" | "completed" | "failed" = completed
			? "completed"
			: failed
				? "failed"
				: "in_progress";
		const providerId = videoMeta?.provider ?? "alibaba";
		const model = String(
			json?.output?.model ??
			json?.model ??
			videoMeta?.model ??
			"",
		).trim();
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status,
			model: model || videoMeta?.model || null,
			seconds:
				toFiniteNumber(json?.output?.duration) ??
				toFiniteNumber(json?.output?.video_duration) ??
				toFiniteNumber(videoMeta?.seconds),
			resolution:
				(typeof json?.output?.resolution === "string"
					? json.output.resolution
					: typeof json?.output?.size === "string"
						? json.output.size
						: videoMeta?.resolution) ?? null,
			quality:
				(typeof json?.output?.quality === "string"
					? json.output.quality
					: videoMeta?.quality) ?? null,
		});
		if (status !== "completed") {
			return err("not_ready", {
				reason: failed ? "video_generation_failed" : "video_not_ready",
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
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const xaiVideoId = resolveXAiNativeId(ownedVideo.record, videoMeta, id);
	if (xaiVideoId) {
		const statusRes = await fetchXAiVideoStatus(authValue, videoMeta, xaiVideoId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapXAiVideoStatus(json?.status);
		const providerId = videoMeta?.provider ?? XAI_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? videoMeta?.model ?? "").trim();
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status,
			model: model || videoMeta?.model || null,
			seconds:
				toFiniteNumber(json?.seconds) ??
				toFiniteNumber(json?.duration_seconds) ??
				toFiniteNumber(json?.duration) ??
				toFiniteNumber(videoMeta?.seconds),
			resolution:
				(typeof json?.resolution === "string"
					? json.resolution
					: typeof json?.size === "string"
						? json.size
						: videoMeta?.resolution) ?? null,
			quality:
				(typeof json?.quality === "string"
					? json.quality
					: videoMeta?.quality) ?? null,
		});
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const xaiOutputs = extractVideoOutputFromPayload(json);
		const uri = xaiOutputs[requestedIndex]?.uri ?? xaiOutputs[0]?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const minimaxTaskId = resolveMiniMaxTaskId(ownedVideo.record, videoMeta, id);
	if (minimaxTaskId) {
		const statusRes = await fetchMiniMaxVideoTask(authValue, videoMeta, minimaxTaskId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapMiniMaxVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
		const providerId = videoMeta?.provider ?? MINIMAX_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? videoMeta?.model ?? "").trim();
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status,
			model: model || videoMeta?.model || null,
			seconds:
				toFiniteNumber(json?.duration) ??
				toFiniteNumber(json?.data?.duration) ??
				toFiniteNumber(videoMeta?.seconds),
			resolution:
				(typeof json?.resolution === "string"
					? json.resolution
					: typeof json?.size === "string"
						? json.size
						: videoMeta?.resolution) ?? null,
			quality:
				(typeof json?.quality === "string"
					? json.quality
					: videoMeta?.quality) ?? null,
		});
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const minimaxOutputs = extractVideoOutputFromPayload(json);
		let uri = minimaxOutputs[requestedIndex]?.uri ?? minimaxOutputs[0]?.uri;
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
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const bytedanceTaskId = resolveByteplusTaskId(ownedVideo.record, videoMeta, id);
	if (bytedanceTaskId) {
		const statusRes = await fetchBytedanceTask(authValue, videoMeta, bytedanceTaskId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapBytedanceVideoStatus(json?.status ?? json?.data?.status ?? json?.task_status);
		const providerId = videoMeta?.provider ?? BYTEDANCE_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? videoMeta?.model ?? "").trim();
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status,
			model: model || videoMeta?.model || null,
			seconds:
				toFiniteNumber(json?.duration) ??
				toFiniteNumber(json?.data?.duration) ??
				toFiniteNumber(json?.parameters?.duration) ??
				toFiniteNumber(json?.data?.parameters?.duration) ??
				toFiniteNumber(videoMeta?.seconds),
			resolution:
				(typeof json?.size === "string"
					? json.size
					: typeof json?.resolution === "string"
						? json.resolution
						: typeof json?.parameters?.size === "string"
							? json.parameters.size
							: typeof json?.parameters?.resolution === "string"
								? json.parameters.resolution
								: videoMeta?.resolution) ?? null,
			quality:
				(typeof json?.quality === "string"
					? json.quality
					: typeof json?.parameters?.quality === "string"
						? json.parameters.quality
						: videoMeta?.quality) ?? null,
		});
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const byteplusOutputs = extractVideoOutputFromPayload(json);
		const uri = byteplusOutputs[requestedIndex]?.uri ?? byteplusOutputs[0]?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const runwayTaskId = resolveRunwayTaskId(ownedVideo.record, videoMeta, id);
	if (runwayTaskId) {
		const statusRes = await fetchRunwayTask(authValue, videoMeta, runwayTaskId);
		if (!(statusRes instanceof Response)) return statusRes;
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const status = mapRunwayVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
		const providerId = videoMeta?.provider ?? RUNWAY_PROVIDER_ID;
		const model = String(json?.model ?? json?.data?.model ?? videoMeta?.model ?? "").trim();
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status,
			model: model || videoMeta?.model || null,
			seconds:
				toFiniteNumber(json?.duration) ??
				toFiniteNumber(json?.data?.duration) ??
				toFiniteNumber(json?.task?.duration) ??
				toFiniteNumber(videoMeta?.seconds),
			resolution:
				(typeof json?.resolution === "string"
					? json.resolution
					: typeof json?.size === "string"
						? json.size
						: typeof json?.task?.resolution === "string"
							? json.task.resolution
							: typeof json?.task?.size === "string"
								? json.task.size
								: videoMeta?.resolution) ?? null,
			quality:
				(typeof json?.quality === "string"
					? json.quality
					: typeof json?.task?.quality === "string"
						? json.task.quality
						: videoMeta?.quality) ?? null,
		});
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const runwayOutputs = extractVideoOutputFromPayload(json);
		const uri = runwayOutputs[requestedIndex]?.uri ?? runwayOutputs[0]?.uri;
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
			headers: buildContentHeaders(videoRes.headers, {
				contentDisposition,
				filename: contentFilename,
			}),
		});
	}
	const atlasTaskId = resolveAtlasTaskId(ownedVideo.record, videoMeta, id);
	if (atlasTaskId) {
		const statusRes = await fetchAtlasPrediction(authValue, videoMeta, atlasTaskId);
		if (!statusRes.ok) return statusRes;
		const json = await statusRes.clone().json().catch(() => null);
		const payload = extractAtlasPredictionPayload(json);
		const status = mapAtlasVideoStatus(payload.status);
		const providerId = videoMeta?.provider ?? ATLAS_PROVIDER_ID;
		const model = String(payload.model ?? videoMeta?.model ?? "").trim();
		await finalizeVideoStatusIfTerminal({
			auth: authValue,
			videoId: id,
			videoMeta,
			providerId,
			status,
			model: model || videoMeta?.model || null,
			seconds:
				toFiniteNumber(payload.seconds) ??
				toFiniteNumber(payload.duration_seconds) ??
				toFiniteNumber(payload.duration) ??
				toFiniteNumber(payload.video_duration) ??
				toFiniteNumber(videoMeta?.seconds),
			resolution:
				(typeof payload.resolution === "string"
					? payload.resolution
					: typeof payload.size === "string"
						? payload.size
						: videoMeta?.resolution) ?? null,
			quality:
				(typeof payload.quality === "string"
					? payload.quality
					: videoMeta?.quality) ?? null,
			metaPatch: {
				providerTaskId: atlasTaskId,
			},
		});
		if (status !== "completed") {
			return err("not_ready", {
				reason: status === "failed" ? "video_generation_failed" : "video_not_ready",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
				...(status === "failed"
					? { upstream_error: payload.error ?? ((json as any)?.error ?? null) }
					: {}),
			});
		}
		const atlasOutputs = extractVideoOutputFromPayload(payload);
		const uri = atlasOutputs[requestedIndex]?.uri ?? atlasOutputs[0]?.uri;
		if (!uri) {
			return err("upstream_error", {
				reason: "missing_video_uri",
				request_id: authValue.requestId,
				team_id: authValue.teamId,
			});
		}
		const videoRes = await fetch(uri, { method: "GET" });
		return persistFetchedVideoResponse({
			teamId: authValue.teamId,
			videoId: id,
			index: requestedIndex,
			response: videoRes,
			sourceUrl: uri,
			contentDisposition,
			filename: contentFilename,
		});
	}
	const resolvedProviderForFallback =
		normalizeText(ownedVideo.record?.provider)?.toLowerCase() ??
		normalizeText(videoMeta?.provider)?.toLowerCase() ??
		OPENAI_PROVIDER_ID;
	if ((resolvedProviderForFallback === "atlascloud" || resolvedProviderForFallback === "atlas-cloud") && !atlasTaskId) {
		return err("not_ready", {
			reason: "atlas_prediction_id_missing",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
			video_id: id,
		});
	}
	const openAiCompatProviderId = resolvedProviderForFallback;
	if (!isOpenAICompatProvider(openAiCompatProviderId)) {
		return err("not_supported", {
			reason: "video_content_unsupported",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
			video_id: id,
			provider: openAiCompatProviderId,
		});
	}
	const openAiNativeId = normalizeText(ownedVideo.record?.nativeId) ?? id;
	const openAiStatusRes = await fetchOpenAIVideoStatus(
		req,
		authValue,
		openAiCompatProviderId,
		openAiNativeId,
		videoMeta,
	);
	const openAiStatusContentType = openAiStatusRes.headers.get("content-type") ?? "";
	if (openAiStatusRes.ok && openAiStatusContentType.includes("application/json")) {
		const statusJson = await openAiStatusRes.clone().json().catch(() => null);
		if (statusJson && typeof statusJson === "object") {
			const openAiStatus = mapOpenAiVideoStatus((statusJson as any)?.status);
			await finalizeVideoStatusIfTerminal({
				auth: authValue,
				videoId: id,
				videoMeta,
				providerId: videoMeta?.provider ?? openAiCompatProviderId,
				status: openAiStatus,
				model: String((statusJson as any)?.model ?? videoMeta?.model ?? "").trim() || null,
				seconds:
					toFiniteNumber((statusJson as any)?.seconds) ??
					toFiniteNumber((statusJson as any)?.duration_seconds) ??
					toFiniteNumber(videoMeta?.seconds),
				resolution:
					(typeof (statusJson as any)?.size === "string"
						? (statusJson as any).size
						: typeof (statusJson as any)?.resolution === "string"
							? (statusJson as any).resolution
							: videoMeta?.resolution) ?? null,
				quality:
					(typeof (statusJson as any)?.quality === "string"
						? (statusJson as any).quality
						: videoMeta?.quality) ?? null,
			});
			if (openAiStatus === "failed") {
				return err("upstream_error", {
					reason: "video_generation_failed",
					request_id: authValue.requestId,
					team_id: authValue.teamId,
					upstream_error: (statusJson as any)?.error ?? null,
				});
			}
			if (openAiStatus !== "completed") {
				return err("not_ready", {
					reason: "video_not_ready",
					request_id: authValue.requestId,
					team_id: authValue.teamId,
				});
			}
		}
	}
	const openAiContentRes = await proxyOpenAIVideoRequest(
		req,
		authValue,
		openAiCompatProviderId,
		`/videos/${encodeURIComponent(openAiNativeId)}/content`,
		"GET",
		{
			videoMeta,
		},
	);
	if (!(openAiContentRes instanceof Response)) return openAiContentRes;
	if (!openAiContentRes.ok) return openAiContentRes;
	return persistFetchedVideoResponse({
		teamId: authValue.teamId,
		videoId: id,
		index: requestedIndex,
		response: openAiContentRes,
		contentDisposition,
		filename: contentFilename,
	});
}

