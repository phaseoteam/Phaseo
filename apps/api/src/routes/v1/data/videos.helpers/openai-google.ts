import { getBindings } from "@/runtime/env";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatConfig,
} from "@providers/openai-compatible/config";
import { loadByokKey } from "@providers/byok";
import {
	resolveGoogleCloudStorageMediaUrl,
	resolveVertexAccessToken,
	resolveVertexApiBase,
} from "@providers/google-vertex/auth";
import { decodeGoogleVertexOperationId, normalizeGoogleVideoModelName } from "@providers/google-video/shared";
import { err } from "@pipeline/before/http";

import {
	ATLAS_VIDEO_PREFIX,
	DASHSCOPE_TASK_PREFIX,
	GOOGLE_BASE_URL,
	GOOGLE_OPERATION_PREFIX,
	MINIMAX_VIDEO_PREFIX,
	XAI_VIDEO_PREFIX,
	normalizeText,
	type VideoJobMeta,
	type VideoRouteAuth,
} from "./shared";
import {
	inferGoogleModelFromOperation,
	logGoogleVideoTrace,
	redactSensitiveUrl,
	resolveGoogleVideoAuth,
	resolveOpenAIVideoProxyTimeoutMs,
} from "./status";
import { buildContentHeaders } from "./public";
export async function resolveVideoProviderKey(
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

export async function proxyOpenAIVideoRequest(
	req: Request,
	auth: { requestId: string; teamId: string },
	providerId: string,
	path: string,
	method: string,
	options?: { videoMeta?: VideoJobMeta | null }
) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const config = resolveOpenAICompatConfig(providerId);
	let key = bindings[config.apiKeyEnv ?? "OPENAI_API_KEY"];
	const videoMeta = options?.videoMeta;
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
	if (!key) {
		return err("upstream_error", {
			reason: "video_provider_key_missing",
			request_id: auth.requestId,
			team_id: auth.teamId,
			provider: providerId,
		});
	}

	const requestUrl = new URL(req.url);
	requestUrl.searchParams.delete("download_token");
	requestUrl.searchParams.delete("download_sig");
	requestUrl.searchParams.delete("expires_at");
	const url = openAICompatUrl(providerId, path) + requestUrl.search;
	const timeoutMs = resolveOpenAIVideoProxyTimeoutMs(bindings);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers: {
				...openAICompatHeaders(providerId, key),
				"Accept": req.headers.get("accept") ?? "*/*",
			},
			signal: controller.signal,
		});
	} catch (fetchErr) {
		const name = typeof fetchErr === "object" && fetchErr ? String((fetchErr as any).name ?? "") : "";
		const isTimeout = name === "AbortError";
		return err("upstream_error", {
			reason: isTimeout ? "video_provider_timeout" : "video_provider_request_failed",
			request_id: auth.requestId,
			team_id: auth.teamId,
			provider: providerId,
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

export async function fetchOpenAIVideoStatus(
	req: Request,
	auth: VideoRouteAuth,
	providerId: string,
	id: string,
	videoMeta: VideoJobMeta | null,
): Promise<Response> {
	return proxyOpenAIVideoRequest(req, auth, providerId, `/videos/${encodeURIComponent(id)}`, "GET", {
		videoMeta,
	});
}

export function decodeGoogleOperationId(videoId: string): string | null {
	if (!videoId.startsWith(GOOGLE_OPERATION_PREFIX)) return null;
	const b64 = videoId.slice(GOOGLE_OPERATION_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function decodeDashscopeTaskId(videoId: string): string | null {
	if (!videoId.startsWith(DASHSCOPE_TASK_PREFIX)) return null;
	const b64 = videoId.slice(DASHSCOPE_TASK_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function decodeXAiVideoId(videoId: string): string | null {
	if (!videoId.startsWith(XAI_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(XAI_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function decodeMiniMaxVideoId(videoId: string): string | null {
	if (!videoId.startsWith(MINIMAX_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(MINIMAX_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function decodeAtlasVideoId(videoId: string): string | null {
	if (!videoId.startsWith(ATLAS_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(ATLAS_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function extractGoogleGeneratedVideoPayload(payload: unknown, index = 0): { uri: string | null; mimeType: string | null } {
	const samples = Array.isArray((payload as any)?.response?.generateVideoResponse?.generatedSamples)
		? (payload as any).response.generateVideoResponse.generatedSamples
		: [];
	const sample = samples[Math.max(0, Math.trunc(index))]?.video;
	const uri = typeof sample?.uri === "string" && sample.uri.trim().length > 0 ? sample.uri.trim() : null;
	const mimeType = typeof sample?.mimeType === "string" && sample.mimeType.trim().length > 0 ? sample.mimeType.trim() : null;
	return { uri, mimeType };
}

export function extractGoogleVertexGeneratedVideoPayload(payload: unknown, index = 0): { uri: string | null; mimeType: string | null; b64Json: string | null } {
	const samples = Array.isArray((payload as any)?.response?.videos) ? (payload as any).response.videos : [];
	const sample = samples[Math.max(0, Math.trunc(index))];
	const uri =
		typeof sample?.gcsUri === "string" && sample.gcsUri.trim().length > 0
			? sample.gcsUri.trim()
			: typeof sample?.uri === "string" && sample.uri.trim().length > 0
				? sample.uri.trim()
				: null;
	const mimeType = typeof sample?.mimeType === "string" && sample.mimeType.trim().length > 0 ? sample.mimeType.trim() : null;
	const b64Json =
		typeof sample?.bytesBase64Encoded === "string" && sample.bytesBase64Encoded.trim().length > 0
			? sample.bytesBase64Encoded.trim()
			: null;
	return { uri, mimeType, b64Json };
}

export function decodeBase64ToBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return buffer;
}

export async function persistBufferedVideoResponse(args: {
	teamId: string;
	videoId: string;
	index: number;
	buffer: ArrayBuffer;
	mimeType?: string | null;
	sourceUrl?: string | null;
	contentDisposition?: "attachment" | "inline" | null;
	filename?: string | null;
}): Promise<Response> {
	return new Response(args.buffer.slice(0), {
		status: 200,
		headers: buildContentHeaders(undefined, {
			contentType: args.mimeType ?? "video/mp4",
			contentDisposition: args.contentDisposition ?? null,
			filename: args.filename ?? null,
		}),
	});
}

export async function persistFetchedVideoResponse(args: {
	teamId: string;
	videoId: string;
	index: number;
	response: Response;
	sourceUrl?: string | null;
	contentDisposition?: "attachment" | "inline" | null;
	filename?: string | null;
}): Promise<Response> {
	const buffer = await args.response.arrayBuffer();
	return persistBufferedVideoResponse({
		teamId: args.teamId,
		videoId: args.videoId,
		index: args.index,
		buffer,
		mimeType: args.response.headers.get("content-type"),
		sourceUrl: args.sourceUrl ?? null,
		contentDisposition: args.contentDisposition ?? null,
		filename: args.filename ?? null,
	});
}

export async function resolveGoogleVertexVideoCredential(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
): Promise<string | null> {
	const providerId = String(videoMeta?.provider ?? "google-vertex").trim() || "google-vertex";
	const gatewayOrByok = await resolveVideoProviderKey(
		auth,
		videoMeta,
		providerId,
		"GOOGLE_VERTEX_ACCESS_TOKEN",
	);
	if (gatewayOrByok) return gatewayOrByok;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	return bindings.GOOGLE_VERTEX_API_KEY ?? null;
}

export async function fetchGoogleOperation(
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
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const oauthOverride =
		videoMeta?.keySource === "byok"
			? ""
			: String(bindings.GOOGLE_VIDEO_OAUTH_BEARER_TOKEN ?? "").trim();
	const credentialForVideo = oauthOverride || key;
	const googleAuth = resolveGoogleVideoAuth(credentialForVideo);
	const statusUrl = new URL(`${GOOGLE_BASE_URL}/v1beta/${operationName}`);
	const requestHeaders: Record<string, string> = {
		Accept: "application/json",
		...(googleAuth.kind === "api_key"
			? { "x-goog-api-key": googleAuth.value }
			: { Authorization: `Bearer ${googleAuth.value}` }),
	};
	const res = await fetch(statusUrl.toString(), {
		method: "GET",
		headers: requestHeaders,
	});
	if (!res.ok) {
		const upstreamBody = await res.clone().text().catch(() => "");
		logGoogleVideoTrace("operation_fetch_failed", {
			requestId: auth.requestId,
			teamId: auth.teamId,
			operationName,
			provider: videoMeta?.provider ?? "google-ai-studio",
			model: videoMeta?.model ?? null,
			keySource: videoMeta?.keySource ?? "gateway",
			authKind: googleAuth.kind,
			outboundHeaderNames: Object.keys(requestHeaders),
			hasApiKeyHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "x-goog-api-key"),
			hasAuthorizationHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "Authorization"),
			statusUrl: redactSensitiveUrl(statusUrl),
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			upstreamBodyPreview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
		});
	}
	return res;
}

export async function fetchGoogleVideoContent(
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
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const oauthOverride =
		videoMeta?.keySource === "byok"
			? ""
			: String(bindings.GOOGLE_VIDEO_OAUTH_BEARER_TOKEN ?? "").trim();
	const credentialForVideo = oauthOverride || key;
	const googleAuth = resolveGoogleVideoAuth(credentialForVideo);
	const contentUrl = new URL(uri);
	const requestHeaders: Record<string, string> = {
		Accept: "*/*",
		...(googleAuth.kind === "api_key"
			? { "x-goog-api-key": googleAuth.value }
			: { Authorization: `Bearer ${googleAuth.value}` }),
	};
	const res = await fetch(contentUrl.toString(), {
		method: "GET",
		headers: requestHeaders,
	});
	if (!res.ok) {
		const upstreamBody = await res.clone().text().catch(() => "");
		logGoogleVideoTrace("content_fetch_failed", {
			requestId: auth.requestId,
			teamId: auth.teamId,
			contentUri: uri,
			contentUrl: redactSensitiveUrl(contentUrl),
			provider: videoMeta?.provider ?? "google-ai-studio",
			model: videoMeta?.model ?? null,
			keySource: videoMeta?.keySource ?? "gateway",
			authKind: googleAuth.kind,
			outboundHeaderNames: Object.keys(requestHeaders),
			hasApiKeyHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "x-goog-api-key"),
			hasAuthorizationHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "Authorization"),
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			upstreamBodyPreview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
		});
	}
	return res;
}

export async function fetchGoogleVertexOperation(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	operationName: string,
) {
	const credential = await resolveGoogleVertexVideoCredential(auth, videoMeta);
	if (!credential) {
		return err("upstream_error", {
			reason: "google_vertex_key_missing",
		});
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const accessToken = await resolveVertexAccessToken(credential);
	const apiBase = resolveVertexApiBase(bindings);
	const model = normalizeGoogleVideoModelName(String(videoMeta?.model ?? inferGoogleModelFromOperation(operationName) ?? "").trim());
	if (!model) {
		return err("upstream_error", {
			reason: "google_vertex_model_missing",
		});
	}
	const statusUrl = `${apiBase}/publishers/google/models/${encodeURIComponent(model)}:fetchPredictOperation`;
	const requestHeaders: Record<string, string> = {
		Accept: "application/json",
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
	};
	const res = await fetch(statusUrl, {
		method: "POST",
		headers: requestHeaders,
		body: JSON.stringify({ operationName }),
	});
	if (!res.ok) {
		const upstreamBody = await res.clone().text().catch(() => "");
		logGoogleVideoTrace("vertex_operation_fetch_failed", {
			requestId: auth.requestId,
			teamId: auth.teamId,
			operationName,
			provider: videoMeta?.provider ?? "google-vertex",
			model,
			keySource: videoMeta?.keySource ?? "gateway",
			outboundHeaderNames: Object.keys(requestHeaders),
			hasAuthorizationHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "Authorization"),
			statusUrl,
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			upstreamBodyPreview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
		});
	}
	return res;
}

export async function fetchGoogleVertexVideoContent(
	auth: VideoRouteAuth,
	videoMeta: VideoJobMeta | null,
	uri: string,
) {
	const credential = await resolveGoogleVertexVideoCredential(auth, videoMeta);
	if (!credential) {
		return err("upstream_error", {
			reason: "google_vertex_key_missing",
		});
	}
	const accessToken = await resolveVertexAccessToken(credential);
	const contentUrl = resolveGoogleCloudStorageMediaUrl(uri) ?? uri;
	const requestHeaders: Record<string, string> = {
		Accept: "*/*",
		Authorization: `Bearer ${accessToken}`,
	};
	const res = await fetch(contentUrl, {
		method: "GET",
		headers: requestHeaders,
	});
	if (!res.ok) {
		const upstreamBody = await res.clone().text().catch(() => "");
		logGoogleVideoTrace("vertex_content_fetch_failed", {
			requestId: auth.requestId,
			teamId: auth.teamId,
			contentUri: uri,
			contentUrl,
			provider: videoMeta?.provider ?? "google-vertex",
			model: videoMeta?.model ?? null,
			keySource: videoMeta?.keySource ?? "gateway",
			outboundHeaderNames: Object.keys(requestHeaders),
			hasAuthorizationHeader: Object.prototype.hasOwnProperty.call(requestHeaders, "Authorization"),
			upstreamStatus: res.status,
			upstreamStatusText: res.statusText || null,
			upstreamBodyPreview: upstreamBody ? upstreamBody.slice(0, 1200) : null,
		});
	}
	return res;
}


