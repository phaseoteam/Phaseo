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
import {
	isOpenAICompatProvider,
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatConfig,
} from "@providers/openai-compatible/config";
import { getBindings } from "@/runtime/env";
import { loadByokKey } from "@providers/byok";
import { decodeGoogleVertexOperationId, normalizeGoogleVideoModelName } from "@providers/google-video/shared";
import {
	resolveGoogleCloudStorageMediaUrl,
	resolveVertexAccessToken,
	resolveVertexApiBase,
} from "@providers/google-vertex/auth";
import { finalizeVideoJob } from "@core/video-finalization";
import { deleteStoredVideoAssets, ensureVideoAssetStored, persistVideoAsset, serveStoredVideoAsset } from "@core/video-assets";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import {
	getVideoJobRecord,
	listTeamVideoJobs,
	setVideoJobStatus,
	type VideoJobMeta,
	type VideoJobRecord,
} from "@core/video-jobs";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";
import { fetchCatalogue } from "../control/models.catalogue";
import { withRuntime } from "../../utils";

const videoHandler = makeEndpointHandler({ endpoint: "video.generation", schema: VideoGenerationSchema });

export const videosRoutes = new Hono<Env>();

const OPENAI_PROVIDER_ID = "openai";
const XAI_PROVIDER_ID = "x-ai";
const MINIMAX_PROVIDER_ID = "minimax";
const BYTEDANCE_PROVIDER_ID = "bytedance-seed";
const RUNWAY_PROVIDER_ID = "runway";
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_BYTEDANCE_BASE_URL = "https://ark.ap-southeast.bytepluses.com";
const DEFAULT_RUNWAY_BASE_URL = "https://api.dev.runwayml.com";
const GOOGLE_OPERATION_PREFIX = "gaiop_";
const DASHSCOPE_TASK_PREFIX = "dscope_";
const XAI_VIDEO_PREFIX = "xaivid_";
const MINIMAX_VIDEO_PREFIX = "mmxvid_";
const BYTEDANCE_VIDEO_PREFIX = "bdvid_";
const RUNWAY_VIDEO_PREFIX = "rwyvid_";
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

type VideoRouteAuth = {
	requestId: string;
	teamId: string;
	apiKeyId: string;
	apiKeyRef: string | null;
	apiKeyKid: string | null;
	internal?: boolean;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toPublicVideoProviderId(value: string | null | undefined): string | null {
	const provider = normalizeText(value)?.toLowerCase() ?? null;
	if (!provider) return null;
	if (provider === "bytedance-seed") return "byteplus";
	if (provider === "xai") return "x-ai";
	return provider;
}

function toPublicVideoStatus(value: unknown): "pending" | "in_progress" | "completed" | "failed" | "cancelled" {
	const status = normalizeText(value)?.toLowerCase() ?? "";
	if (status === "completed" || status === "succeeded" || status === "success") return "completed";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "failed";
	if (status === "failed" || status === "error") return "failed";
	if (status === "in_progress" || status === "processing" || status === "running") return "in_progress";
	if (status === "pending" || status === "queued") return "pending";
	return "pending";
}

function buildVideoPollingUrl(requestUrl: string, id: string): string {
	return new URL(`/v1/videos/${encodeURIComponent(id)}`, requestUrl).toString();
}

function buildVideoContentUrl(requestUrl: string, id: string, index: number): string {
	const url = new URL(`/v1/videos/${encodeURIComponent(id)}/content`, requestUrl);
	if (index > 0) url.searchParams.set("index", String(index));
	return url.toString();
}

function base64UrlEncodeText(value: string): string {
	return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value: string): string | null {
	try {
		const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "===".slice((normalized.length + 3) % 4);
		return atob(padded);
	} catch {
		return null;
	}
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function resolveVideoDownloadSigningSecret(): string | null {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	return normalizeText(bindings.VIDEO_DOWNLOAD_SIGNING_SECRET) ?? normalizeText(bindings.KEY_PEPPER);
}

async function issueSignedVideoDownloadUrl(args: {
	requestUrl: string;
	teamId: string;
	videoId: string;
	index?: number;
	ttlSeconds?: number | null;
	disposition?: "attachment" | "inline";
}): Promise<{ download_url: string; expires_at: number } | null> {
	const secret = resolveVideoDownloadSigningSecret();
	if (!secret) return null;
	const ttlSeconds = Math.max(60, Math.min(MAX_VIDEO_DOWNLOAD_TTL_SECONDS, Math.trunc(args.ttlSeconds ?? DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS)));
	const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
	const disposition = args.disposition === "inline" ? "inline" : "attachment";
	const tokenPayload = base64UrlEncodeText(JSON.stringify({
		team_id: args.teamId,
		video_id: args.videoId,
		index: typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0,
		disposition,
	}));
	const signature = await hmacSha256Hex(secret, `${tokenPayload}.${expiresAt}`);
	const index = typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0;
	const url = new URL(buildVideoContentUrl(args.requestUrl, args.videoId, index));
	url.searchParams.set("download_token", tokenPayload);
	url.searchParams.set("download_sig", signature);
	url.searchParams.set("expires_at", String(expiresAt));
	return {
		download_url: url.toString(),
		expires_at: expiresAt,
	};
}

async function verifySignedVideoDownloadRequest(requestUrl: string): Promise<{
	teamId: string;
	videoId: string;
	index: number;
	disposition: "attachment" | "inline";
} | null> {
	const secret = resolveVideoDownloadSigningSecret();
	if (!secret) return null;
	const url = new URL(requestUrl);
	const token = normalizeText(url.searchParams.get("download_token"));
	const signature = normalizeText(url.searchParams.get("download_sig"));
	const expiresAtRaw = Number(url.searchParams.get("expires_at") ?? "");
	if (!token || !signature || !Number.isFinite(expiresAtRaw)) return null;
	if (Math.floor(Date.now() / 1000) > expiresAtRaw) return null;
	const expected = await hmacSha256Hex(secret, `${token}.${Math.trunc(expiresAtRaw)}`);
	if (expected !== signature) return null;
	const decoded = base64UrlDecodeText(token);
	if (!decoded) return null;
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(decoded) as Record<string, unknown>;
	} catch {
		return null;
	}
	const teamId = normalizeText(payload.team_id);
	const videoId = normalizeText(payload.video_id);
	const indexRaw = toFiniteNumber(payload.index);
	const disposition = payload.disposition === "inline" ? "inline" : "attachment";
	if (!teamId || !videoId) return null;
	return {
		teamId,
		videoId,
		index: indexRaw != null ? Math.max(0, Math.trunc(indexRaw)) : 0,
		disposition,
	};
}

function inferOutputBytes(base64Value: string | null | undefined): number | null {
	if (!base64Value) return null;
	try {
		const normalized = base64Value.replace(/\s+/g, "");
		const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
		return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
	} catch {
		return null;
	}
}

function buildContentHeaders(
	headers: HeadersInit | undefined,
	options?: {
		contentDisposition?: "attachment" | "inline" | null;
		filename?: string | null;
		contentType?: string | null;
	},
): Headers {
	const out = new Headers(headers);
	if (options?.contentType && !out.has("Content-Type")) {
		out.set("Content-Type", options.contentType);
	}
	if (options?.contentDisposition) {
		const filename = normalizeText(options.filename) ?? "video.mp4";
		out.set("Content-Disposition", `${options.contentDisposition}; filename="${filename}"`);
	}
	out.set("Cache-Control", out.get("Cache-Control") ?? "private, no-store");
	return out;
}

function toPublicVideoOutputs(requestUrl: string, id: string, payload: Record<string, unknown>, meta: VideoJobMeta | null) {
	const storedOutputs = Array.isArray(meta?.storedOutputs) ? meta.storedOutputs : [];
	if (storedOutputs.length > 0) {
		return storedOutputs.map((item) => ({
			index: item.index,
			mime_type: item.mimeType ?? "video/mp4",
			bytes_available: true,
			content_url: buildVideoContentUrl(requestUrl, id, item.index),
		}));
	}
	const output = Array.isArray(payload.output) ? payload.output : [];
	return output.map((item: any, index: number) => ({
		index,
		mime_type:
			typeof item?.mime_type === "string"
				? item.mime_type
				: typeof item?.mimeType === "string"
					? item.mimeType
					: meta?.googleVideoMimeType ?? "video/mp4",
		bytes_available: typeof item?.b64_json === "string" || typeof item?.b64Json === "string",
		content_url: buildVideoContentUrl(requestUrl, id, index),
	}));
}

function buildVideoBilling(record: VideoJobRecord | null, meta: VideoJobMeta | null, status: "pending" | "in_progress" | "completed" | "failed" | "cancelled") {
	const estimated = resolveMetaCostUsd(meta);
	const settled = status === "completed" ? estimated : status === "failed" || status === "cancelled" ? 0 : null;
	const state = status === "completed" ? "settled" : status === "failed" || status === "cancelled" ? "void" : "estimated";
	return {
		currency: "usd",
		estimated_provider_cost: estimated != null ? estimated.toFixed(2) : null,
		estimated_user_cost: estimated != null ? estimated.toFixed(2) : null,
		settled_provider_cost: settled != null ? settled.toFixed(2) : null,
		settled_user_cost: settled != null ? settled.toFixed(2) : null,
		state,
		billable: status === "completed",
		...(record?.billedAt ? { billed_at: record.billedAt } : {}),
	};
}

function resolveVideoOutputAccess(payload: Record<string, unknown>, meta: VideoJobMeta | null): "bytes" | "signed_url" | "both" {
	const payloadOutput =
		payload.output && typeof payload.output === "object" && !Array.isArray(payload.output)
			? (payload.output as Record<string, unknown>)
			: null;
	const payloadAccess = normalizeText(payloadOutput?.access)?.toLowerCase();
	if (payloadAccess === "bytes" || payloadAccess === "signed_url" || payloadAccess === "both") {
		return payloadAccess;
	}
	const metaAccess = normalizeText(meta?.outputAccess)?.toLowerCase();
	if (metaAccess === "bytes" || metaAccess === "signed_url" || metaAccess === "both") {
		return metaAccess;
	}
	return "both";
}

async function toPublicVideoResponse(args: {
	requestUrl: string;
	id: string;
	payload: Record<string, unknown>;
	record: VideoJobRecord | null;
	meta: VideoJobMeta | null;
}): Promise<Record<string, unknown>> {
	const provider = toPublicVideoProviderId(
		typeof args.payload.provider === "string" ? args.payload.provider : args.record?.provider ?? args.meta?.provider ?? null,
	);
	const status = toPublicVideoStatus(args.payload.status);
	const createdAt =
		(typeof args.payload.created_at === "number" ? args.payload.created_at : null) ??
		normalizeText(args.record?.createdAt) ??
		null;
	const outputs = toPublicVideoOutputs(args.requestUrl, args.id, args.payload, args.meta);
	const outputAccess = resolveVideoOutputAccess(args.payload, args.meta);
	const includeUnsignedUrls = outputAccess === "bytes" || outputAccess === "both";
	const includeSignedUrls = outputAccess === "signed_url" || outputAccess === "both";
	const outputsWithSigned = includeUnsignedUrls
		? [...outputs]
		: outputs.map((item: any) => {
			const copy = { ...(item as Record<string, unknown>) };
			delete (copy as any).content_url;
			return copy;
		});
	const firstOutput = outputs[0] ?? null;
	const outputRaw = Array.isArray(args.payload.output) ? (args.payload.output[0] as Record<string, unknown> | undefined) : undefined;
	const storedAsset = Array.isArray(args.meta?.storedOutputs) ? args.meta?.storedOutputs?.find((item) => item.index === 0) ?? null : null;
	let download: { download_url: string; expires_at: number } | null = null;
	if (status === "completed" && includeSignedUrls && args.record?.teamId) {
		const signedPerOutput = await Promise.all(
			outputsWithSigned.map(async (item: any) => ({
				index: typeof item?.index === "number" ? item.index : 0,
				signed: await issueSignedVideoDownloadUrl({
					requestUrl: args.requestUrl,
					teamId: args.record?.teamId ?? "",
					videoId: args.id,
					index: typeof item?.index === "number" ? item.index : 0,
				}),
			})),
		);
		for (const entry of signedPerOutput) {
			if (!entry.signed) continue;
			const outputIndex = outputsWithSigned.findIndex((item: any) => item?.index === entry.index);
			if (outputIndex >= 0) {
				(outputsWithSigned as any[])[outputIndex] = {
					...(outputsWithSigned as any[])[outputIndex],
					download_url: entry.signed.download_url,
					expires_at: entry.signed.expires_at,
				};
			}
			if (entry.index === 0) download = entry.signed;
		}
		if (!download) {
			download = (signedPerOutput.find((entry) => Boolean(entry.signed))?.signed ?? null) as
				| { download_url: string; expires_at: number }
				| null;
		}
		if (!download) {
			download = await issueSignedVideoDownloadUrl({
				requestUrl: args.requestUrl,
				teamId: args.record?.teamId ?? "",
				videoId: args.id,
				index: 0,
			});
		}
	}
	const progress = typeof args.payload.progress === "number"
		? Math.max(0, Math.min(100, Math.round(args.payload.progress)))
		: status === "completed"
			? 100
			: 0;
	const progressSource = typeof args.payload.progress === "number" ? "provider" : "none";
	const durationSeconds =
		typeof args.meta?.seconds === "number"
			? args.meta.seconds
			: typeof (args.payload as any)?.seconds === "number"
				? (args.payload as any).seconds
				: null;
	const generationId =
		normalizeText((args.payload as any)?.generation_id) ??
		normalizeText(args.record?.requestId) ??
		normalizeText(args.meta?.requestId);
	const usageSource =
		args.payload.usage && typeof args.payload.usage === "object" && !Array.isArray(args.payload.usage)
			? { ...(args.payload.usage as Record<string, unknown>) }
			: {};
	const usageCost =
		toFiniteNumber((usageSource as any)?.cost) ??
		toFiniteNumber((usageSource as any)?.cost_usd) ??
		toFiniteNumber((usageSource as any)?.costUsd) ??
		resolveMetaCostUsd(args.meta);
	const isByok = args.meta?.keySource === "byok";
	if (usageCost != null && usageSource.cost == null) {
		usageSource.cost = usageCost;
	}
	if (usageCost != null && usageSource.cost_usd == null) {
		usageSource.cost_usd = usageCost;
	}
	if (usageSource.is_byok == null) {
		usageSource.is_byok = isByok;
	}
	const errorValue =
		typeof args.payload.error === "string"
			? args.payload.error
			: typeof (args.payload.error as any)?.message === "string"
				? (args.payload.error as any).message
				: args.payload.error;
	const asset = status === "completed" && firstOutput
		? storedAsset
			? {
				id: `ast_${args.id.replace(/^G-/, "")}`,
				mime_type: storedAsset.mimeType ?? "video/mp4",
				bytes: storedAsset.bytes,
				sha256: storedAsset.sha256,
				width: storedAsset.width ?? null,
				height: storedAsset.height ?? null,
				duration_seconds: storedAsset.durationSeconds ?? durationSeconds,
			}
			: {
			id: `ast_${args.id.replace(/^G-/, "")}`,
			mime_type: firstOutput.mime_type ?? "video/mp4",
			bytes: inferOutputBytes(typeof (outputRaw as any)?.b64_json === "string" ? (outputRaw as any).b64_json : typeof (outputRaw as any)?.b64Json === "string" ? (outputRaw as any).b64Json : null),
			sha256: null,
			width: null,
			height: null,
			duration_seconds: durationSeconds,
		}
		: null;
	const response: Record<string, unknown> = {
		id: args.id,
		object: "video",
		status,
		output_access: outputAccess,
		progress,
		progress_source: progressSource,
		polling_url: buildVideoPollingUrl(args.requestUrl, args.id),
		poll_after_seconds: DEFAULT_VIDEO_POLL_SECONDS,
		generation_id: generationId ?? null,
		created_at: createdAt,
		started_at: normalizeText((args.payload as any)?.started_at) ?? null,
		completed_at: normalizeText((args.payload as any)?.completed_at) ?? (status === "completed" || status === "failed" || status === "cancelled" ? normalizeText(args.meta?.finalizedAt) : null),
		provider,
		model:
			normalizeText(args.payload.model) ??
			normalizeText(args.record?.model) ??
			normalizeText(args.meta?.model),
		seconds: durationSeconds,
		size: normalizeText(args.meta?.resolution) ?? null,
		audio: typeof (args.payload as any)?.audio === "boolean" ? (args.payload as any).audio : null,
		asset,
		outputs: outputsWithSigned,
		...(Object.keys(usageSource).length > 0 ? { usage: usageSource } : {}),
		...(errorValue ? { error: errorValue } : {}),
		billing: buildVideoBilling(args.record, args.meta, status),
	};
	if (includeUnsignedUrls) {
		response.content_url = buildVideoContentUrl(args.requestUrl, args.id, 0);
	}
	if (includeSignedUrls) {
		response.download_url = download?.download_url ?? null;
		response.expires_at = download?.expires_at ?? null;
	}
	return response;
}

function logGoogleVideoTrace(event: string, payload: Record<string, unknown>) {
	console.info("google_video_trace", {
		event,
		...payload,
	});
}

type GoogleVideoAuth =
	| { kind: "api_key"; value: string }
	| { kind: "oauth_bearer"; value: string };

function resolveGoogleVideoAuth(rawCredential: string): GoogleVideoAuth {
	const trimmed = rawCredential.trim();
	if (/^Bearer\s+/i.test(trimmed)) {
		return { kind: "oauth_bearer", value: trimmed.replace(/^Bearer\s+/i, "").trim() };
	}
	if (trimmed.startsWith("ya29.") || trimmed.startsWith("eyJ")) {
		return { kind: "oauth_bearer", value: trimmed };
	}
	return { kind: "api_key", value: trimmed };
}

function redactSensitiveUrl(url: URL): string {
	const clone = new URL(url.toString());
	if (clone.searchParams.has("key")) clone.searchParams.set("key", "[redacted]");
	return clone.toString();
}

function inferGoogleModelFromOperation(operationName: string): string | undefined {
	const match = operationName.match(/models\/([^/]+)\//);
	return match?.[1];
}

function extractGoogleOperationError(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return undefined;
	return (payload as any).error;
}

function isGoogleOperationsGetAuthFailure(status: number, payload: unknown): boolean {
	if (status !== 401) return false;
	if (!payload || typeof payload !== "object") return false;
	const error = (payload as any).error;
	const details = Array.isArray(error?.details) ? error.details : [];
	for (const detail of details) {
		const method = String(detail?.metadata?.method ?? "");
		const reason = String(detail?.reason ?? "");
		if (method === "google.longrunning.Operations.GetOperation" && reason === "CREDENTIALS_MISSING") {
			return true;
		}
	}
	return false;
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

function mapBytedanceVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	return "queued";
}

function mapRunwayVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (
		status === "failed" ||
		status === "error" ||
		status === "canceled" ||
		status === "cancelled"
	) {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	if (status === "throttled") return "queued";
	return "queued";
}

function normalizeVideoStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").trim().toLowerCase();
	if (!status) return "queued";
	if (status === "completed" || status === "complete" || status === "succeeded" || status === "success") {
		return "completed";
	}
	if (
		status === "failed" ||
		status === "error" ||
		status === "cancelled" ||
		status === "canceled" ||
		status === "expired"
	) {
		return "failed";
	}
	if (status === "in_progress" || status === "processing" || status === "running" || status === "pending") {
		return "in_progress";
	}
	return "queued";
}

function normalizeVideoStatusFilter(value: string): "queued" | "in_progress" | "completed" | "failed" | null {
	const status = value.trim().toLowerCase();
	if (!status) return null;
	if (status === "queued" || status === "pending") return "queued";
	if (status === "in_progress" || status === "processing" || status === "running") return "in_progress";
	if (status === "completed" || status === "complete" || status === "success" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	return null;
}

function parseVideoListStatuses(url: URL): Array<"queued" | "in_progress" | "completed" | "failed"> {
	const values = url.searchParams.getAll("status");
	const expanded = values.flatMap((value) =>
		value
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
	);
	const normalized = expanded
		.map((value) => normalizeVideoStatusFilter(value))
		.filter((value): value is "queued" | "in_progress" | "completed" | "failed" => value !== null);
	return [...new Set(normalized)];
}

function parseVideoListLimit(url: URL): number {
	const parsed = Number(url.searchParams.get("limit") ?? "");
	if (!Number.isFinite(parsed)) return 50;
	return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

async function requireOwnedVideoJob(
	auth: VideoRouteAuth,
	videoId: string,
): Promise<{ record: VideoJobRecord; meta: VideoJobMeta | null } | Response> {
	const record = await getVideoJobRecord(auth.teamId, videoId);
	if (record) return { record, meta: record.meta };
	return err("not_found", {
		reason: "video_not_found_or_not_owned",
		request_id: auth.requestId,
		team_id: auth.teamId,
		video_id: videoId,
	});
}

async function refreshOwnedVideoJob(
	auth: VideoRouteAuth,
	videoId: string,
): Promise<{ record: VideoJobRecord; meta: VideoJobMeta | null } | null> {
	const record = await getVideoJobRecord(auth.teamId, videoId);
	if (!record) return null;
	return { record, meta: record.meta };
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeProgressPercent(value: unknown): number | null {
	const parsed = toFiniteNumber(value);
	if (parsed == null) return null;
	return Math.max(0, Math.min(100, Math.round(parsed)));
}

function resolveStatusDetailsProgress(
	providerId: string | null | undefined,
	payload: Record<string, unknown>,
): number | null {
	const normalizedProvider = String(providerId ?? "").trim().toLowerCase();
	if (normalizedProvider !== OPENAI_PROVIDER_ID) return null;
	const statusDetails =
		payload.status_details &&
		typeof payload.status_details === "object" &&
		!Array.isArray(payload.status_details)
			? (payload.status_details as Record<string, unknown>)
			: null;
	const result =
		payload.result &&
		typeof payload.result === "object" &&
		!Array.isArray(payload.result)
			? (payload.result as Record<string, unknown>)
			: null;
	return (
		normalizeProgressPercent(payload.progress) ??
		normalizeProgressPercent(statusDetails?.progress) ??
		normalizeProgressPercent(result?.progress)
	);
}

function resolveMetaCostNanos(meta: VideoJobMeta | null): number | null {
	if (!meta) return null;
	const direct = toFiniteNumber(meta.costNanos);
	if (direct != null) return Math.max(0, direct);
	const pricedUsage =
		meta.pricedUsage && typeof meta.pricedUsage === "object" ? (meta.pricedUsage as Record<string, unknown>) : null;
	const pricedNanos =
		toFiniteNumber((pricedUsage as any)?.pricing?.total_nanos) ??
		toFiniteNumber((pricedUsage as any)?.total_nanos) ??
		toFiniteNumber((meta.pricingBreakdown as any)?.total_nanos);
	if (pricedNanos != null) return Math.max(0, pricedNanos);
	const reserved = toFiniteNumber(meta.reservedNanos);
	return reserved != null ? Math.max(0, reserved) : null;
}

function resolveMetaCostUsd(meta: VideoJobMeta | null): number | null {
	if (!meta) return null;
	const direct = toFiniteNumber(meta.costUsd);
	if (direct != null) return Math.max(0, direct);
	const pricedUsage =
		meta.pricedUsage && typeof meta.pricedUsage === "object" ? (meta.pricedUsage as Record<string, unknown>) : null;
	const pricedUsd =
		toFiniteNumber((pricedUsage as any)?.pricing?.cost_usd) ??
		toFiniteNumber((pricedUsage as any)?.cost_usd) ??
		toFiniteNumber((meta.pricingBreakdown as any)?.total_usd);
	if (pricedUsd != null) return Math.max(0, pricedUsd);
	const nanos = resolveMetaCostNanos(meta);
	return nanos != null ? Math.max(0, nanos / 1e9) : null;
}

function resolveMetaDurationMs(record: VideoJobRecord | null, meta: VideoJobMeta | null): number | null {
	const direct = toFiniteNumber(meta?.durationMs);
	if (direct != null) return Math.max(0, Math.round(direct));
	const finalizedAtMs =
		typeof meta?.finalizedAt === "string" && meta.finalizedAt.trim().length > 0
			? Date.parse(meta.finalizedAt)
			: NaN;
	const createdAtMs =
		typeof record?.createdAt === "string" && record.createdAt.trim().length > 0
			? Date.parse(record.createdAt)
			: toFiniteNumber(meta?.createdAt) ?? NaN;
	if (Number.isFinite(finalizedAtMs) && Number.isFinite(createdAtMs)) {
		return Math.max(0, Math.round(finalizedAtMs - createdAtMs));
	}
	return null;
}

function enrichVideoPayloadWithJobMetrics(
	payload: Record<string, unknown>,
	record: VideoJobRecord | null,
	meta: VideoJobMeta | null,
): Record<string, unknown> {
	const durationMs = resolveMetaDurationMs(record, meta);
	const costUsd = resolveMetaCostUsd(meta);
	const costNanos = resolveMetaCostNanos(meta);
	const out = { ...payload } as Record<string, unknown>;
	const usage =
		out.usage && typeof out.usage === "object" && !Array.isArray(out.usage)
			? { ...(out.usage as Record<string, unknown>) }
			: {};
	if (typeof meta?.seconds === "number" && usage.output_video_seconds == null) {
		usage.output_video_seconds = meta.seconds;
	}
	if (costUsd != null) {
		if (usage.cost_usd == null) usage.cost_usd = costUsd;
		if (usage.costUsd == null) usage.costUsd = costUsd;
		if (out.cost_usd == null) out.cost_usd = costUsd;
	}
	if (costNanos != null) {
		const breakdown =
			usage.pricing_breakdown &&
			typeof usage.pricing_breakdown === "object" &&
			!Array.isArray(usage.pricing_breakdown)
				? { ...(usage.pricing_breakdown as Record<string, unknown>) }
				: {};
		if (breakdown.total_nanos == null) breakdown.total_nanos = Math.max(0, Math.round(costNanos));
		if (costUsd != null && breakdown.total_usd_str == null) {
			breakdown.total_usd_str = Math.max(0, costUsd).toFixed(9);
		}
		if (Object.keys(breakdown).length > 0) usage.pricing_breakdown = breakdown;
		if (out.cost_nanos == null) out.cost_nanos = Math.max(0, Math.round(costNanos));
	}
	if (Object.keys(usage).length > 0) out.usage = usage;
	if (durationMs != null && out.duration_ms == null) out.duration_ms = durationMs;

	const metaOut =
		out.meta && typeof out.meta === "object" && !Array.isArray(out.meta)
			? { ...(out.meta as Record<string, unknown>) }
			: {};
	if (durationMs != null && metaOut.duration_ms == null) metaOut.duration_ms = durationMs;
	if (costUsd != null && metaOut.cost_usd == null) metaOut.cost_usd = costUsd;
	if (record?.billedAt && metaOut.billed_at == null) metaOut.billed_at = record.billedAt;
	if (meta?.finalizedAt && metaOut.finalized_at == null) metaOut.finalized_at = meta.finalizedAt;
	if (typeof meta?.charged === "boolean" && metaOut.charged == null) metaOut.charged = meta.charged;
	if (meta?.billingReason && metaOut.billing_reason == null) metaOut.billing_reason = meta.billingReason;
	if (Object.keys(metaOut).length > 0) out.meta = metaOut;

	const providerId =
		typeof out.provider === "string" && out.provider.trim().length > 0
			? out.provider.trim().toLowerCase()
			: typeof record?.provider === "string" && record.provider.trim().length > 0
				? record.provider.trim().toLowerCase()
				: typeof meta?.provider === "string" && meta.provider.trim().length > 0
					? meta.provider.trim().toLowerCase()
					: null;
	const existingStatusDetails =
		out.status_details &&
		typeof out.status_details === "object" &&
		!Array.isArray(out.status_details)
			? { ...(out.status_details as Record<string, unknown>) }
			: {};
	const progress = resolveStatusDetailsProgress(providerId, out);
	existingStatusDetails.progress = progress;
	out.status_details = existingStatusDetails;
	if (providerId !== OPENAI_PROVIDER_ID) {
		out.progress = null;
	} else if (progress != null) {
		out.progress = progress;
	}

	return out;
}

async function finalizeVideoStatusIfTerminal(args: {
	auth: VideoRouteAuth;
	videoId: string;
	videoMeta: VideoJobMeta | null;
	providerId: string;
	status: "queued" | "in_progress" | "completed" | "failed";
	model?: string | null;
	seconds?: number | null;
	resolution?: string | null;
	quality?: string | null;
	metaPatch?: Record<string, unknown>;
	rawPayload?: unknown;
}): Promise<void> {
	if (args.status !== "completed" && args.status !== "failed") return;
	await finalizeVideoJob({
		teamId: args.auth.teamId,
		videoId: args.videoId,
		providerId: args.providerId,
		status: args.status,
		model: args.model ?? args.videoMeta?.model ?? null,
		seconds: args.seconds ?? args.videoMeta?.seconds ?? null,
		requestOptions: buildVideoPricingRequestOptions({
			resolution: args.resolution ?? args.videoMeta?.resolution ?? null,
			quality: args.quality ?? args.videoMeta?.quality ?? null,
		}),
		isByok: args.videoMeta?.keySource === "byok",
		metaPatch: {
			...(args.metaPatch ?? {}),
			lastPolledAt: new Date().toISOString(),
			polledStatus: args.status,
		},
	});
	const refreshed = await getVideoJobRecord(args.auth.teamId, args.videoId);
	if (args.status === "completed" && refreshed) {
		await ensureVideoAssetStored({
			job: refreshed,
			rawPayload: args.rawPayload,
			index: 0,
		}).catch((error) => {
			console.error("video_asset_store_after_finalize_failed", {
				error,
				teamId: args.auth.teamId,
				videoId: args.videoId,
				providerId: args.providerId,
			});
		});
	}
	dispatchVideoWebhookEventInBackground({
		teamId: args.auth.teamId,
		videoId: args.videoId,
		eventType: args.status === "completed" ? "video.completed" : "video.failed",
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

async function fetchOpenAIVideoStatus(
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

function extractGoogleGeneratedVideoPayload(payload: unknown, index = 0): { uri: string | null; mimeType: string | null } {
	const samples = Array.isArray((payload as any)?.response?.generateVideoResponse?.generatedSamples)
		? (payload as any).response.generateVideoResponse.generatedSamples
		: [];
	const sample = samples[Math.max(0, Math.trunc(index))]?.video;
	const uri = typeof sample?.uri === "string" && sample.uri.trim().length > 0 ? sample.uri.trim() : null;
	const mimeType = typeof sample?.mimeType === "string" && sample.mimeType.trim().length > 0 ? sample.mimeType.trim() : null;
	return { uri, mimeType };
}

function extractGoogleVertexGeneratedVideoPayload(payload: unknown, index = 0): { uri: string | null; mimeType: string | null; b64Json: string | null } {
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

function decodeBase64ToBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return buffer;
}

async function persistBufferedVideoResponse(args: {
	teamId: string;
	videoId: string;
	index: number;
	buffer: ArrayBuffer;
	mimeType?: string | null;
	sourceUrl?: string | null;
	contentDisposition?: "attachment" | "inline" | null;
	filename?: string | null;
}): Promise<Response> {
	await persistVideoAsset({
		teamId: args.teamId,
		videoId: args.videoId,
		index: args.index,
		buffer: args.buffer,
		mimeType: args.mimeType,
		sourceUrl: args.sourceUrl,
	}).catch((error) => {
		console.error("video_asset_persist_failed", {
			error,
			teamId: args.teamId,
			videoId: args.videoId,
			index: args.index,
			sourceUrl: args.sourceUrl ?? null,
		});
	});
	return new Response(args.buffer.slice(0), {
		status: 200,
		headers: buildContentHeaders(undefined, {
			contentType: args.mimeType ?? "video/mp4",
			contentDisposition: args.contentDisposition ?? null,
			filename: args.filename ?? null,
		}),
	});
}

async function persistFetchedVideoResponse(args: {
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

async function resolveGoogleVertexVideoCredential(
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

async function fetchGoogleVertexOperation(
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

async function fetchGoogleVertexVideoContent(
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

function decodeBytedanceVideoId(videoId: string): string | null {
	if (!videoId.startsWith(BYTEDANCE_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(BYTEDANCE_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function decodeRunwayVideoId(videoId: string): string | null {
	if (!videoId.startsWith(RUNWAY_VIDEO_PREFIX)) return null;
	const b64 = videoId.slice(RUNWAY_VIDEO_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function resolveGoogleVertexOperationName(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ??
		normalizeText(meta?.googleOperationName) ??
		decodeGoogleVertexOperationId(videoId);
}

function resolveGoogleAiStudioOperationName(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ??
		normalizeText(meta?.googleOperationName) ??
		decodeGoogleOperationId(videoId);
}

function resolveDashscopeTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ?? normalizeText(meta?.providerTaskId) ?? decodeDashscopeTaskId(videoId);
}

function resolveXAiNativeId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ?? normalizeText(meta?.providerTaskId) ?? decodeXAiVideoId(videoId);
}

function resolveMiniMaxTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ?? normalizeText(meta?.providerTaskId) ?? decodeMiniMaxVideoId(videoId);
}

function resolveByteplusTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ?? normalizeText(meta?.providerTaskId) ?? decodeBytedanceVideoId(videoId);
}

function resolveRunwayTaskId(record: VideoJobRecord | null, meta: VideoJobMeta | null, videoId: string): string | null {
	return normalizeText(record?.nativeId) ?? normalizeText(meta?.providerTaskId) ?? decodeRunwayVideoId(videoId);
}

async function fetchDashscopeTask(
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

async function fetchXAiVideoStatus(
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

async function fetchXAiVideoContent(
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

async function fetchMiniMaxVideoTask(
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

async function fetchMiniMaxFile(
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

function resolveRunwayApiVersion(
	videoMeta: VideoJobMeta | null,
	bindings: Record<string, string | undefined>,
): string | undefined {
	const model = String(videoMeta?.model ?? "");
	const forceLegacy = model.toLowerCase().includes("gen3");
	if (forceLegacy) return "2024-11-06";
	const configured = String(bindings.RUNWAY_API_VERSION ?? "").trim();
	return configured.length > 0 ? configured : undefined;
}

async function fetchBytedanceTask(
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

async function fetchRunwayTask(
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
	const catalogue = await fetchCatalogue({ endpoints: ["video.generation"] });
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

	const openAiCompatProviderId =
		normalizeText(videoRecord?.provider)?.toLowerCase() ??
		normalizeText(videoMeta?.provider)?.toLowerCase() ??
		OPENAI_PROVIDER_ID;
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
}));

videosRoutes.get("/:videoId/content", withRuntime(async (req) => {
	const path = new URL(req.url).pathname;
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
	const storedVideo = await serveStoredVideoAsset({
		meta: videoMeta,
		index: requestedIndex,
		contentDisposition,
		filename: contentFilename,
	});
	if (storedVideo) return storedVideo;
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
	const openAiCompatProviderId =
		normalizeText(ownedVideo.record?.provider)?.toLowerCase() ??
		normalizeText(videoMeta?.provider)?.toLowerCase() ??
		OPENAI_PROVIDER_ID;
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
}));

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
	await deleteStoredVideoAssets({
		teamId: authValue.teamId,
		videoId: id,
		meta: ownedVideo.meta,
	}).catch((error) => {
		console.error("video_asset_delete_failed", {
			error,
			teamId: authValue.teamId,
			videoId: id,
		});
	});
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


