import { getBindings } from "@/runtime/env";
import { listAsyncOperations } from "@core/async-operations";
import {
	getVideoJobRecord,
	patchVideoJobMeta,
	type VideoJobMeta,
	type VideoJobRecord,
	type VideoStoredAssetMeta,
} from "@core/video-jobs";
import { loadByokKey } from "@providers/byok";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { resolveGoogleVideoAuth } from "@providers/google-video/shared";
import { resolveGoogleCloudStorageMediaUrl, resolveVertexAccessToken } from "@providers/google-vertex/auth";

const DEFAULT_VIDEO_ASSET_RETENTION_SECONDS = 900;
const MINIMAX_PROVIDER_ID = "minimax";
const OPENAI_PROVIDER_ID = "openai";
const XAI_PROVIDER_ID = "x-ai";

type OutputSource =
	| { kind: "inline"; base64: string; mimeType: string | null }
	| { kind: "uri"; uri: string; mimeType: string | null };

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return buffer;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function resolveAssetBucket(): R2Bucket | null {
	const bindings = getBindings();
	return bindings.VIDEO_ASSETS_BUCKET ?? null;
}

export function getVideoAssetRetentionSeconds(): number {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const parsed = Number(bindings.VIDEO_ASSET_RETENTION_SECONDS ?? "");
	if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_ASSET_RETENTION_SECONDS;
	return Math.max(60, Math.min(86400, Math.trunc(parsed)));
}

function buildVideoAssetKey(args: { teamId: string; videoId: string; index: number; mimeType?: string | null }): string {
	const extension = String(args.mimeType ?? "video/mp4").toLowerCase().includes("quicktime") ? "mov" : "mp4";
	return `video-assets/${encodeURIComponent(args.teamId)}/${encodeURIComponent(args.videoId)}/${args.index}.${extension}`;
}

function selectStoredOutput(meta: VideoJobMeta | null, index: number): VideoStoredAssetMeta | null {
	const outputs = Array.isArray(meta?.storedOutputs) ? meta.storedOutputs : [];
	const now = Date.now();
	for (const output of outputs) {
		if (output.index !== index) continue;
		const expiresAtMs = Date.parse(output.expiresAt);
		if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) continue;
		return output;
	}
	return null;
}

async function resolveProviderKey(args: {
	job: VideoJobRecord;
	providerId: string;
	defaultEnvKey: string;
}): Promise<string | null> {
	const { job, providerId, defaultEnvKey } = args;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	let key = bindings[defaultEnvKey] ?? null;
	if (job.meta?.keySource === "byok" && job.meta.byokKeyId) {
		const byok = await loadByokKey({
			teamId: job.teamId,
			providerId,
			metaList: [{
				id: job.meta.byokKeyId,
				providerId,
				fingerprintSha256: "",
				keyVersion: null,
				alwaysUse: true,
			}],
		});
		if (byok?.key) key = byok.key;
	}
	return key;
}

function extractGenericOutputSources(payload: any): OutputSource[] {
	const output = Array.isArray(payload?.output)
		? payload.output
		: Array.isArray(payload?.data)
			? payload.data
			: [];
	if (output.length > 0) {
		return output
			.map((item: any) => ({
				uri:
					typeof item?.url === "string"
						? item.url
						: typeof item?.uri === "string"
							? item.uri
							: typeof item?.video_url === "string"
								? item.video_url
								: typeof item?.videoUrl === "string"
									? item.videoUrl
									: null,
				mimeType:
					typeof item?.mime_type === "string"
						? item.mime_type
						: typeof item?.mimeType === "string"
							? item.mimeType
							: "video/mp4",
				base64:
					typeof item?.b64_json === "string"
						? item.b64_json
						: typeof item?.b64Json === "string"
							? item.b64Json
							: null,
			}))
			.flatMap((item) => {
				if (item.base64) return [{ kind: "inline" as const, base64: item.base64, mimeType: item.mimeType }];
				if (item.uri) return [{ kind: "uri" as const, uri: item.uri, mimeType: item.mimeType }];
				return [];
			});
	}
	const fallbackUri =
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
	if (typeof fallbackUri === "string" && fallbackUri.trim().length > 0) {
		return [{ kind: "uri", uri: fallbackUri.trim(), mimeType: "video/mp4" }];
	}
	return [];
}

async function resolveMinimaxDownloadUrl(job: VideoJobRecord, rawPayload: any): Promise<string | null> {
	const fileId =
		typeof rawPayload?.file_id === "string"
			? rawPayload.file_id
			: typeof rawPayload?.data?.file_id === "string"
				? rawPayload.data.file_id
				: null;
	if (!fileId) return null;
	const key = await resolveProviderKey({
		job,
		providerId: String(job.provider ?? MINIMAX_PROVIDER_ID).trim() || MINIMAX_PROVIDER_ID,
		defaultEnvKey: "MINIMAX_API_KEY",
	});
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || "https://api.minimax.io").replace(/\/+$/, "");
	const res = await fetch(`${baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) return null;
	const json = await res.json().catch(() => null);
	return normalizeText(json?.file?.download_url) ?? normalizeText(json?.download_url);
}

async function resolveOutputSource(job: VideoJobRecord, rawPayload?: unknown, index = 0): Promise<OutputSource | null> {
	const provider = String(job.provider ?? job.meta?.provider ?? "").trim().toLowerCase();
	const payload = rawPayload && typeof rawPayload === "object" ? rawPayload as Record<string, any> : null;
	if (provider === "google-vertex") {
		const sample = Array.isArray(payload?.response?.videos) ? payload.response.videos[index] ?? payload.response.videos[0] : null;
		if (typeof sample?.bytesBase64Encoded === "string" && sample.bytesBase64Encoded.trim().length > 0) {
			return { kind: "inline", base64: sample.bytesBase64Encoded.trim(), mimeType: normalizeText(sample?.mimeType) };
		}
		const uri = normalizeText(sample?.gcsUri) ?? normalizeText(sample?.uri) ?? normalizeText(job.meta?.googleVideoUri);
		if (uri) return { kind: "uri", uri, mimeType: normalizeText(sample?.mimeType) ?? normalizeText(job.meta?.googleVideoMimeType) };
	}
	if (provider === "google-ai-studio") {
		const sample = Array.isArray(payload?.response?.generateVideoResponse?.generatedSamples)
			? payload.response.generateVideoResponse.generatedSamples[index]?.video ?? payload.response.generateVideoResponse.generatedSamples[0]?.video
			: null;
		const uri = normalizeText(sample?.uri) ?? normalizeText(job.meta?.googleVideoUri);
		if (uri) return { kind: "uri", uri, mimeType: normalizeText(sample?.mimeType) ?? normalizeText(job.meta?.googleVideoMimeType) };
	}
	const generic = extractGenericOutputSources(payload);
	if (generic[index]) return generic[index]!;
	if (generic[0]) return generic[0]!;
	if ((provider === "minimax" || provider === "minimax-lightning") && payload) {
		const uri = await resolveMinimaxDownloadUrl(job, payload);
		if (uri) return { kind: "uri", uri, mimeType: "video/mp4" };
	}
	return null;
}

async function fetchGoogleAiStudioUri(job: VideoJobRecord, uri: string): Promise<Response | null> {
	const providerId = String(job.provider ?? "google-ai-studio").trim() || "google-ai-studio";
	const key = await resolveProviderKey({ job, providerId, defaultEnvKey: "GOOGLE_AI_STUDIO_API_KEY" });
	if (!key) return null;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const oauthOverride = job.meta?.keySource === "byok" ? "" : String(bindings.GOOGLE_VIDEO_OAUTH_BEARER_TOKEN ?? "").trim();
	const googleAuth = resolveGoogleVideoAuth(oauthOverride || key);
	return fetch(uri, {
		method: "GET",
		headers: {
			Accept: "*/*",
			...(googleAuth.kind === "api_key"
				? { "x-goog-api-key": googleAuth.value }
				: { Authorization: `Bearer ${googleAuth.value}` }),
		},
	});
}

async function fetchGoogleVertexUri(job: VideoJobRecord, uri: string): Promise<Response | null> {
	const credential =
		await resolveProviderKey({ job, providerId: "google-vertex", defaultEnvKey: "GOOGLE_VERTEX_ACCESS_TOKEN" }) ??
		(getBindings() as unknown as Record<string, string | undefined>).GOOGLE_VERTEX_API_KEY ??
		null;
	if (!credential) return null;
	const accessToken = await resolveVertexAccessToken(credential);
	const mediaUrl = resolveGoogleCloudStorageMediaUrl(uri) ?? uri;
	return fetch(mediaUrl, {
		method: "GET",
		headers: {
			Accept: "*/*",
			Authorization: `Bearer ${accessToken}`,
		},
	});
}

async function fetchOpenAiContent(job: VideoJobRecord): Promise<Response | null> {
	const key = await resolveProviderKey({ job, providerId: OPENAI_PROVIDER_ID, defaultEnvKey: "OPENAI_API_KEY" });
	if (!key) return null;
	const nativeId = normalizeText(job.nativeId) ?? job.videoId;
	return fetch(openAICompatUrl("openai", `/videos/${encodeURIComponent(nativeId)}/content`), {
		method: "GET",
		headers: {
			...openAICompatHeaders("openai", key),
			Accept: "*/*",
		},
	});
}

async function fetchXAiContent(job: VideoJobRecord): Promise<Response | null> {
	const key = await resolveProviderKey({ job, providerId: XAI_PROVIDER_ID, defaultEnvKey: "X_AI_API_KEY" });
	if (!key) return null;
	const nativeId = normalizeText(job.nativeId) ?? normalizeText(job.meta?.providerTaskId) ?? job.videoId;
	return fetch(openAICompatUrl("x-ai", `/videos/${encodeURIComponent(nativeId)}/content`), {
		method: "GET",
		headers: {
			...openAICompatHeaders("x-ai", key),
			Accept: "*/*",
		},
	});
}

async function fetchUriForProvider(job: VideoJobRecord, uri: string): Promise<Response | null> {
	const provider = String(job.provider ?? job.meta?.provider ?? "").trim().toLowerCase();
	if (provider === "google-ai-studio") return fetchGoogleAiStudioUri(job, uri);
	if (provider === "google-vertex") return fetchGoogleVertexUri(job, uri);
	return fetch(uri, { method: "GET" });
}

async function fetchOutputBytes(job: VideoJobRecord, source: OutputSource | null): Promise<{ buffer: ArrayBuffer; mimeType: string | null; sourceUrl: string | null } | null> {
	if (source?.kind === "inline") {
		return {
			buffer: decodeBase64ToArrayBuffer(source.base64),
			mimeType: source.mimeType ?? "video/mp4",
			sourceUrl: null,
		};
	}
	if (source?.kind === "uri") {
		const res = await fetchUriForProvider(job, source.uri);
		if (!res || !res.ok) return null;
		return {
			buffer: await res.arrayBuffer(),
			mimeType: normalizeText(res.headers.get("content-type")) ?? source.mimeType ?? "video/mp4",
			sourceUrl: source.uri,
		};
	}
	const provider = String(job.provider ?? job.meta?.provider ?? "").trim().toLowerCase();
	if (provider === OPENAI_PROVIDER_ID) {
		const res = await fetchOpenAiContent(job);
		if (!res || !res.ok) return null;
		return {
			buffer: await res.arrayBuffer(),
			mimeType: normalizeText(res.headers.get("content-type")) ?? "video/mp4",
			sourceUrl: null,
		};
	}
	if (provider === XAI_PROVIDER_ID || provider === "xai") {
		const res = await fetchXAiContent(job);
		if (!res || !res.ok) return null;
		return {
			buffer: await res.arrayBuffer(),
			mimeType: normalizeText(res.headers.get("content-type")) ?? "video/mp4",
			sourceUrl: null,
		};
	}
	return null;
}

export async function persistVideoAsset(args: {
	teamId: string;
	videoId: string;
	index: number;
	buffer: ArrayBuffer;
	mimeType?: string | null;
	sourceUrl?: string | null;
	width?: number | null;
	height?: number | null;
	durationSeconds?: number | null;
}): Promise<VideoStoredAssetMeta | null> {
	const bucket = resolveAssetBucket();
	if (!bucket) return null;
	const mimeType = normalizeText(args.mimeType) ?? "video/mp4";
	const key = buildVideoAssetKey({
		teamId: args.teamId,
		videoId: args.videoId,
		index: args.index,
		mimeType,
	});
	const bytes = args.buffer.byteLength;
	const sha256 = await sha256Hex(args.buffer);
	const storedAt = new Date().toISOString();
	const expiresAt = new Date(Date.now() + getVideoAssetRetentionSeconds() * 1000).toISOString();
	await bucket.put(key, args.buffer, {
		httpMetadata: {
			contentType: mimeType,
		},
		customMetadata: {
			teamId: args.teamId,
			videoId: args.videoId,
			index: String(args.index),
			expiresAt,
			sha256,
		},
	});
	const nextAsset: VideoStoredAssetMeta = {
		index: args.index,
		storageProvider: "r2",
		storageKey: key,
		mimeType,
		bytes,
		sha256,
		sourceUrl: args.sourceUrl ?? null,
		width: args.width ?? null,
		height: args.height ?? null,
		durationSeconds: args.durationSeconds ?? null,
		storedAt,
		expiresAt,
	};
	const record = await getVideoJobRecord(args.teamId, args.videoId);
	const existingOutputs = Array.isArray(record?.meta?.storedOutputs) ? record!.meta!.storedOutputs! : [];
	const mergedOutputs = [
		...existingOutputs.filter((item) => item.index !== args.index),
		nextAsset,
	].sort((a, b) => a.index - b.index);
	await patchVideoJobMeta(args.teamId, args.videoId, {
		storedOutputs: mergedOutputs,
		assetStorageProvider: nextAsset.storageProvider,
		assetStorageKey: nextAsset.storageKey,
		assetMimeType: nextAsset.mimeType,
		assetBytes: nextAsset.bytes,
		assetSha256: nextAsset.sha256,
		assetStoredAt: nextAsset.storedAt,
		assetExpiresAt: nextAsset.expiresAt,
		assetSourceUrl: nextAsset.sourceUrl,
	});
	return nextAsset;
}

export async function ensureVideoAssetStored(args: {
	job: VideoJobRecord;
	rawPayload?: unknown;
	index?: number;
}): Promise<VideoStoredAssetMeta | null> {
	const index = typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0;
	const existing = selectStoredOutput(args.job.meta, index);
	if (existing) return existing;
	if (!resolveAssetBucket()) return null;
	const outputSource = await resolveOutputSource(args.job, args.rawPayload, index);
	const fetched = await fetchOutputBytes(args.job, outputSource);
	if (!fetched) return null;
	return persistVideoAsset({
		teamId: args.job.teamId,
		videoId: args.job.videoId,
		index,
		buffer: fetched.buffer,
		mimeType: fetched.mimeType,
		sourceUrl: fetched.sourceUrl,
		durationSeconds: toFiniteNumber(args.job.meta?.seconds),
	});
}

export async function serveStoredVideoAsset(args: {
	meta: VideoJobMeta | null;
	index?: number;
	contentDisposition?: "attachment" | "inline" | null;
	filename?: string | null;
}): Promise<Response | null> {
	const bucket = resolveAssetBucket();
	if (!bucket) return null;
	const index = typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0;
	const asset = selectStoredOutput(args.meta, index);
	if (!asset) return null;
	const object = await bucket.get(asset.storageKey);
	if (!object || !object.body) return null;
	const headers = new Headers();
	headers.set("Content-Type", asset.mimeType || "video/mp4");
	headers.set("Cache-Control", "private, no-store");
	if (args.contentDisposition) {
		headers.set("Content-Disposition", `${args.contentDisposition}; filename="${normalizeText(args.filename) ?? "video.mp4"}"`);
	}
	return new Response(object.body, {
		status: 200,
		headers,
	});
}

export async function pruneExpiredVideoAssets(limit = 200): Promise<{ scanned: number; deleted: number }> {
	const bucket = resolveAssetBucket();
	if (!bucket) return { scanned: 0, deleted: 0 };
	const rows = await listAsyncOperations({
		kind: "video",
		limit: Math.max(1, Math.min(500, Math.trunc(limit))),
		statuses: ["completed", "failed", "cancelled", "expired"],
	});
	let deleted = 0;
	const now = Date.now();
	for (const row of rows) {
		const record = await getVideoJobRecord(row.teamId, row.internalId);
		const outputs = Array.isArray(record?.meta?.storedOutputs) ? record!.meta!.storedOutputs! : [];
		if (outputs.length === 0) continue;
		const keep: VideoStoredAssetMeta[] = [];
		for (const asset of outputs) {
			const expiresAtMs = Date.parse(asset.expiresAt);
			const tombstoned = Boolean(record?.meta?.tombstoned);
			if (tombstoned || (Number.isFinite(expiresAtMs) && expiresAtMs <= now)) {
				await bucket.delete(asset.storageKey).catch(() => null);
				deleted += 1;
				continue;
			}
			keep.push(asset);
		}
		if (keep.length !== outputs.length) {
			await patchVideoJobMeta(row.teamId, row.internalId, {
				storedOutputs: keep,
				...(keep[0]
					? {
						assetStorageProvider: keep[0].storageProvider,
						assetStorageKey: keep[0].storageKey,
						assetMimeType: keep[0].mimeType,
						assetBytes: keep[0].bytes,
						assetSha256: keep[0].sha256,
						assetStoredAt: keep[0].storedAt,
						assetExpiresAt: keep[0].expiresAt,
						assetSourceUrl: keep[0].sourceUrl ?? null,
					}
					: {
						assetStorageProvider: null,
						assetStorageKey: null,
						assetMimeType: null,
						assetBytes: null,
						assetSha256: null,
						assetStoredAt: null,
						assetExpiresAt: null,
						assetSourceUrl: null,
					}),
			});
		}
	}
	return {
		scanned: rows.length,
		deleted,
	};
}

export async function deleteStoredVideoAssets(args: {
	teamId: string;
	videoId: string;
	meta: VideoJobMeta | null;
}): Promise<number> {
	const bucket = resolveAssetBucket();
	if (!bucket) return 0;
	const outputs = Array.isArray(args.meta?.storedOutputs) ? args.meta!.storedOutputs! : [];
	let deleted = 0;
	for (const asset of outputs) {
		await bucket.delete(asset.storageKey).catch(() => null);
		deleted += 1;
	}
	await patchVideoJobMeta(args.teamId, args.videoId, {
		storedOutputs: [],
		assetStorageProvider: null,
		assetStorageKey: null,
		assetMimeType: null,
		assetBytes: null,
		assetSha256: null,
		assetStoredAt: null,
		assetExpiresAt: null,
		assetSourceUrl: null,
	});
	return deleted;
}
