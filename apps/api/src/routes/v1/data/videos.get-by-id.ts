import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";
import { setVideoJobStatus, type VideoJobMeta, type VideoJobRecord } from "@core/video-jobs";
import { guardAuth } from "@pipeline/before/guards";
import { err } from "@pipeline/before/http";
import { isOpenAICompatProvider } from "@providers/openai-compatible/config";

import * as videoHelpers from "./videos.helpers";

type VideoRouteAuth = videoHelpers.VideoRouteAuth;

const {
	normalizeText,
	toPublicVideoResponse,
	logGoogleVideoTrace,
	inferGoogleModelFromOperation,
	extractGoogleOperationError,
	isGoogleOperationsGetAuthFailure,
	mapOpenAiVideoStatus,
	mapBytedanceVideoStatus,
	mapRunwayVideoStatus,
	mapAtlasVideoStatus,
	requireOwnedVideoJob,
	refreshOwnedVideoJob,
	toFiniteNumber,
	enrichVideoPayloadWithJobMetrics,
	finalizeVideoStatusIfTerminal,
	fetchOpenAIVideoStatus,
	extractGoogleGeneratedVideoPayload,
	extractGoogleVertexGeneratedVideoPayload,
	fetchGoogleOperation,
	fetchGoogleVertexOperation,
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

export async function getVideoByIdHandler(req: Request): Promise<Response> {	const auth = await guardAuth(req);
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
	let videoRecord: VideoJobRecord | null = ownedVideo.record;
	let videoMeta: VideoJobMeta | null = ownedVideo.meta;
	if (videoMeta?.tombstoned) {
		return err("not_found", {
			reason: "video_deleted",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
			video_id: id,
		});
	}
	const vertexOperationName = resolveGoogleVertexOperationName(videoRecord, videoMeta, id);
	if (vertexOperationName) {
		logGoogleVideoTrace("vertex_status_request_start", {
			requestId: authValue.requestId,
			teamId: authValue.teamId,
			videoId: id,
			operationName: vertexOperationName,
			provider: videoMeta?.provider ?? "google-vertex",
			model: videoMeta?.model ?? null,
			jobStatus: videoRecord?.status ?? null,
			hasCachedUri:
				typeof videoMeta?.googleVideoUri === "string" && videoMeta.googleVideoUri.trim().length > 0,
		});
		const res = await fetchGoogleVertexOperation(authValue, videoMeta, vertexOperationName);
		if (res instanceof Response && res.headers?.get("content-type")?.includes("application/json")) {
			const json = await res.clone().json().catch(() => null);
			if (!res.ok) return res;
			const done = Boolean(json?.done);
			const operationError = done ? extractGoogleOperationError(json) : undefined;
			const failed = done && operationError !== undefined;
			const generatedVideo = extractGoogleVertexGeneratedVideoPayload(json);
			const status: "queued" | "in_progress" | "completed" | "failed" = failed
				? "failed"
				: done
					? "completed"
					: "in_progress";
			const output = done && !failed
				? (Array.isArray(json?.response?.videos) ? json.response.videos : []).map((sample: any, index: number) => ({
					index,
					uri: sample?.gcsUri ?? sample?.uri ?? null,
					mime_type: sample?.mimeType ?? null,
					...(typeof sample?.bytesBase64Encoded === "string" ? { b64_json: sample.bytesBase64Encoded } : {}),
				}))
				: [];
			const providerId = videoMeta?.provider ?? "google-vertex";
			const model = String(
				json?.response?.model ??
				json?.metadata?.model ??
				inferGoogleModelFromOperation(vertexOperationName) ??
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
					toFiniteNumber(json?.response?.videoMetadata?.durationSeconds) ??
					toFiniteNumber(json?.videoMetadata?.durationSeconds) ??
					toFiniteNumber(videoMeta?.seconds),
				resolution:
					(typeof json?.response?.videoMetadata?.resolution === "string"
						? json.response.videoMetadata.resolution
						: typeof json?.metadata?.resolution === "string"
							? json.metadata.resolution
							: videoMeta?.resolution) ?? null,
				quality:
					(typeof json?.metadata?.quality === "string"
						? json.metadata.quality
						: videoMeta?.quality) ?? null,
				metaPatch: {
					googleOperationName: vertexOperationName,
					...(generatedVideo.uri ? { googleVideoUri: generatedVideo.uri } : {}),
					...(generatedVideo.mimeType ? { googleVideoMimeType: generatedVideo.mimeType } : {}),
				},
			});
			if (status === "completed" || status === "failed") {
				const refreshed = await refreshOwnedVideoJob(authValue, id);
				if (refreshed) {
					videoRecord = refreshed.record;
					videoMeta = refreshed.meta;
				}
			}
			const body = enrichVideoPayloadWithJobMetrics({
				id,
				object: "video",
				status,
				provider: providerId,
				model: model || null,
				nativeResponseId: vertexOperationName,
				result: json,
				output,
				...(failed ? { error: operationError } : {}),
			}, videoRecord, videoMeta);
			return new Response(JSON.stringify(await toPublicVideoResponse({
				requestUrl: req.url,
				id,
				payload: body,
				record: videoRecord,
				meta: videoMeta,
			})), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		logGoogleVideoTrace("vertex_status_request_non_json_response", {
			requestId: authValue.requestId,
			teamId: authValue.teamId,
			videoId: id,
			operationName: vertexOperationName,
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			contentType: res.headers?.get("content-type") ?? null,
		});
		return res;
	}
	const operationName = resolveGoogleAiStudioOperationName(videoRecord, videoMeta, id);
	if (operationName) {
		logGoogleVideoTrace("status_request_start", {
			requestId: authValue.requestId,
			teamId: authValue.teamId,
			videoId: id,
			operationName,
			provider: videoMeta?.provider ?? "google-ai-studio",
			model: videoMeta?.model ?? null,
			jobStatus: videoRecord?.status ?? null,
			hasCachedUri:
				typeof videoMeta?.googleVideoUri === "string" && videoMeta.googleVideoUri.trim().length > 0,
		});
		const res = await fetchGoogleOperation(authValue, videoMeta, operationName);
		if (res instanceof Response && res.headers?.get("content-type")?.includes("application/json")) {
			const json = await res.clone().json().catch(() => null);
			if (!res.ok) {
				if (isGoogleOperationsGetAuthFailure(res.status, json)) {
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
					const refreshed = await refreshOwnedVideoJob(authValue, id);
					return new Response(JSON.stringify(await toPublicVideoResponse({
						requestUrl: req.url,
						id,
						payload: enrichVideoPayloadWithJobMetrics({
						id,
						status: "failed",
						provider: videoMeta?.provider ?? "google-ai-studio",
						model: videoMeta?.model ?? null,
						error: {
							type: "google_operation_auth_unsupported",
							message:
								"Google native operation polling rejected API-key auth for this job. Use OAuth bearer auth for native polling.",
						},
						result: json,
					}, refreshed?.record ?? videoRecord, refreshed?.meta ?? videoMeta),
						record: refreshed?.record ?? videoRecord,
						meta: refreshed?.meta ?? videoMeta,
					})), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				return res;
			}
			const done = Boolean(json?.done);
			const operationError = done ? extractGoogleOperationError(json) : undefined;
			const failed = done && operationError !== undefined;
			const generatedVideo = extractGoogleGeneratedVideoPayload(json);
			const status: "queued" | "in_progress" | "completed" | "failed" = failed
				? "failed"
				: done
					? "completed"
					: "in_progress";
			const output = done && !failed
				? (json?.response?.generateVideoResponse?.generatedSamples ?? []).map((sample: any, index: number) => ({
					index,
					uri: sample?.video?.uri ?? null,
					mime_type: sample?.video?.mimeType ?? null,
				}))
				: [];
				const providerId = videoMeta?.provider ?? "google-ai-studio";
				const model = String(
					json?.response?.model ??
					json?.metadata?.model ??
					inferGoogleModelFromOperation(operationName) ??
					videoMeta?.model ??
					""
				).trim();
				await finalizeVideoStatusIfTerminal({
					auth: authValue,
					videoId: id,
					videoMeta,
					providerId,
					status,
					model: model || videoMeta?.model || null,
					seconds:
						toFiniteNumber(json?.response?.videoMetadata?.durationSeconds) ??
						toFiniteNumber(json?.videoMetadata?.durationSeconds) ??
						toFiniteNumber(videoMeta?.seconds),
					resolution:
						(typeof json?.response?.videoMetadata?.resolution === "string"
							? json.response.videoMetadata.resolution
							: typeof json?.metadata?.resolution === "string"
								? json.metadata.resolution
								: videoMeta?.resolution) ?? null,
					quality:
						(typeof json?.metadata?.quality === "string"
							? json.metadata.quality
							: videoMeta?.quality) ?? null,
					metaPatch: {
						googleOperationName: operationName,
						...(generatedVideo.uri ? { googleVideoUri: generatedVideo.uri } : {}),
						...(generatedVideo.mimeType ? { googleVideoMimeType: generatedVideo.mimeType } : {}),
					},
				});
				if (status === "completed" || status === "failed") {
					const refreshed = await refreshOwnedVideoJob(authValue, id);
					if (refreshed) {
						videoRecord = refreshed.record;
						videoMeta = refreshed.meta;
					}
				}
				const body = enrichVideoPayloadWithJobMetrics({
					id,
					object: "video",
					status,
					provider: providerId,
					model: model || null,
					nativeResponseId: operationName,
					result: json,
					output,
					...(failed ? { error: operationError } : {}),
				}, videoRecord, videoMeta);
			return new Response(JSON.stringify(await toPublicVideoResponse({
				requestUrl: req.url,
				id,
				payload: body,
				record: videoRecord,
				meta: videoMeta,
			})), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		logGoogleVideoTrace("status_request_non_json_response", {
			requestId: authValue.requestId,
			teamId: authValue.teamId,
			videoId: id,
			operationName,
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			contentType: res.headers?.get("content-type") ?? null,
		});
		return res;
	}
	const dashscopeTaskId = resolveDashscopeTaskId(videoRecord, videoMeta, id);
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
		const videoUrl =
			json?.output?.video_url ??
			json?.output?.videoUrl ??
			(Array.isArray(json?.output?.video_urls) ? json.output.video_urls[0] : undefined) ??
			(Array.isArray(json?.output?.results) ? json.output.results[0]?.url : undefined);
		const output = videoUrl ? [{ index: 0, uri: videoUrl, mime_type: "video/mp4" }] : [];
			const providerId = videoMeta?.provider ?? "alibaba";
			const model = String(
				json?.output?.model ??
				json?.model ??
				videoMeta?.model ??
				""
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
			if (status === "completed" || status === "failed") {
				const refreshed = await refreshOwnedVideoJob(authValue, id);
				if (refreshed) {
					videoRecord = refreshed.record;
					videoMeta = refreshed.meta;
				}
			}
			return new Response(JSON.stringify(await toPublicVideoResponse({
				requestUrl: req.url,
				id,
				payload: enrichVideoPayloadWithJobMetrics({
				id,
				status,
				provider: providerId,
				model: model || null,
				result: json,
				output,
			}, videoRecord, videoMeta),
				record: videoRecord,
				meta: videoMeta,
			})), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
	}
	const xaiVideoId = resolveXAiNativeId(videoRecord, videoMeta, id);
	if (xaiVideoId) {
		const res = await fetchXAiVideoStatus(authValue, videoMeta, xaiVideoId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
			const status = mapXAiVideoStatus(json?.status);
			const output = extractVideoOutputFromPayload(json);
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
			if (status === "completed" || status === "failed") {
				const refreshed = await refreshOwnedVideoJob(authValue, id);
				if (refreshed) {
					videoRecord = refreshed.record;
					videoMeta = refreshed.meta;
				}
			}
			return new Response(JSON.stringify(await toPublicVideoResponse({
				requestUrl: req.url,
				id,
				payload: enrichVideoPayloadWithJobMetrics({
				id,
				status,
				provider: providerId,
				model: model || null,
				result: json,
				output,
			}, videoRecord, videoMeta),
				record: videoRecord,
				meta: videoMeta,
			})), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
	}
	const minimaxTaskId = resolveMiniMaxTaskId(videoRecord, videoMeta, id);
	if (minimaxTaskId) {
		const res = await fetchMiniMaxVideoTask(authValue, videoMeta, minimaxTaskId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
			const status = mapMiniMaxVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
			const output = extractVideoOutputFromPayload(json);
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
			if (status === "completed" || status === "failed") {
				const refreshed = await refreshOwnedVideoJob(authValue, id);
				if (refreshed) {
					videoRecord = refreshed.record;
					videoMeta = refreshed.meta;
				}
			}
			return new Response(JSON.stringify(await toPublicVideoResponse({
				requestUrl: req.url,
				id,
				payload: enrichVideoPayloadWithJobMetrics({
				id,
				status,
				provider: providerId,
				model: model || null,
				result: json,
				output,
			}, videoRecord, videoMeta),
				record: videoRecord,
				meta: videoMeta,
			})), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
	const bytedanceTaskId = resolveByteplusTaskId(videoRecord, videoMeta, id);
	if (bytedanceTaskId) {
		const res = await fetchBytedanceTask(authValue, videoMeta, bytedanceTaskId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const status = mapBytedanceVideoStatus(json?.status ?? json?.data?.status ?? json?.task_status);
		const output = extractVideoOutputFromPayload(json);
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
		if (status === "completed" || status === "failed") {
			const refreshed = await refreshOwnedVideoJob(authValue, id);
			if (refreshed) {
				videoRecord = refreshed.record;
				videoMeta = refreshed.meta;
			}
		}
		return new Response(JSON.stringify(await toPublicVideoResponse({
			requestUrl: req.url,
			id,
			payload: enrichVideoPayloadWithJobMetrics({
			id,
			status,
			provider: providerId,
			model: model || null,
			result: json,
			output,
		}, videoRecord, videoMeta),
			record: videoRecord,
			meta: videoMeta,
		})), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	const runwayTaskId = resolveRunwayTaskId(videoRecord, videoMeta, id);
	if (runwayTaskId) {
		const res = await fetchRunwayTask(authValue, videoMeta, runwayTaskId);
		if (!(res instanceof Response)) return res;
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const status = mapRunwayVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status);
		const output = extractVideoOutputFromPayload(json);
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
		if (status === "completed" || status === "failed") {
			const refreshed = await refreshOwnedVideoJob(authValue, id);
			if (refreshed) {
				videoRecord = refreshed.record;
				videoMeta = refreshed.meta;
			}
		}
		return new Response(JSON.stringify(await toPublicVideoResponse({
			requestUrl: req.url,
			id,
			payload: enrichVideoPayloadWithJobMetrics({
			id,
			status,
			provider: providerId,
			model: model || null,
			result: json,
			output,
		}, videoRecord, videoMeta),
			record: videoRecord,
			meta: videoMeta,
		})), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	const atlasTaskId = resolveAtlasTaskId(videoRecord, videoMeta, id);
	if (atlasTaskId) {
		const res = await fetchAtlasPrediction(authValue, videoMeta, atlasTaskId);
		if (!res.ok) return res;
		const json = await res.clone().json().catch(() => null);
		const payload = extractAtlasPredictionPayload(json);
		const status = mapAtlasVideoStatus(payload.status);
		const output = extractVideoOutputFromPayload(payload);
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
		if (status === "completed" || status === "failed") {
			const refreshed = await refreshOwnedVideoJob(authValue, id);
			if (refreshed) {
				videoRecord = refreshed.record;
				videoMeta = refreshed.meta;
			}
		}
		return new Response(JSON.stringify(await toPublicVideoResponse({
			requestUrl: req.url,
			id,
			payload: enrichVideoPayloadWithJobMetrics({
				id,
				status,
				provider: providerId,
				model: model || null,
				result: json ?? payload,
				output,
				...(status === "failed"
					? { error: payload.error ?? ((json as any)?.error ?? "atlas_video_generation_failed") }
					: {}),
			}, videoRecord, videoMeta),
			record: videoRecord,
			meta: videoMeta,
		})), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	const resolvedProviderForFallback =
		normalizeText(videoRecord?.provider)?.toLowerCase() ??
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
			reason: "video_status_unsupported",
			request_id: authValue.requestId,
			team_id: authValue.teamId,
			video_id: id,
			provider: openAiCompatProviderId,
		});
	}
	const openAiNativeId = normalizeText(videoRecord?.nativeId) ?? id;
	const openAiStatusRes = await fetchOpenAIVideoStatus(
		req,
		authValue,
		openAiCompatProviderId,
		openAiNativeId,
		videoMeta,
	);
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
	if (openAiStatus === "completed" || openAiStatus === "failed") {
		const refreshed = await refreshOwnedVideoJob(authValue, id);
		if (refreshed) {
			videoRecord = refreshed.record;
			videoMeta = refreshed.meta;
		}
	}
	const enriched = enrichVideoPayloadWithJobMetrics(statusJson as Record<string, unknown>, videoRecord, videoMeta);
	if (openAiStatus === "in_progress" && typeof (enriched as any).progress === "number") {
		dispatchVideoWebhookEventInBackground({
			teamId: authValue.teamId,
			videoId: id,
			eventType: "video.progress",
			progress: (enriched as any).progress,
		});
	}
	return new Response(JSON.stringify(await toPublicVideoResponse({
		requestUrl: req.url,
		id,
		payload: enriched,
		record: videoRecord,
		meta: videoMeta,
	})), {
		status: openAiStatusRes.status,
		headers: { "Content-Type": "application/json" },
	});
}

