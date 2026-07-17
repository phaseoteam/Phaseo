// Purpose: Shared helpers for internal video provider webhook routes.

import { getBindings } from "@/runtime/env";
import { findVideoJobRecordByNativeId } from "@core/video-jobs";
import { finalizeVideoJob } from "@core/video-finalization";
import { markProviderEventProcessed } from "@core/provider-events";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";

export const OPENAI_PROVIDER_ID = "openai";
export const ALIBABA_PROVIDER_ID = "alibaba";
export const DASHSCOPE_TASK_PREFIX = "dscope_";

export function timingSafeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i++) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

export function parseOpenAiSignatureCandidates(headerValue: string | null): string[] {
	if (!headerValue) return [];
	return headerValue
		.split(/\s+/)
		.flatMap((part) => part.split(";"))
		.flatMap((part) => part.split(","))
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			if (part.startsWith("v1=")) return part.slice(3).trim();
			if (part.startsWith("v1,")) return part.slice(3).trim();
			return part;
		})
		.filter((value) => value.length > 8);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let out = "";
	for (const byte of bytes) out += String.fromCharCode(byte);
	return btoa(out);
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
}

function openAiWebhookSecretKeyBytes(secret: string): Uint8Array {
	if (!secret.startsWith("whsec_")) return new TextEncoder().encode(secret);
	const encoded = secret.slice("whsec_".length);
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function signHmacSha256(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder();
	const secretBytes = openAiWebhookSecretKeyBytes(secret);
	const secretBuffer = new ArrayBuffer(secretBytes.byteLength);
	new Uint8Array(secretBuffer).set(secretBytes);
	const key = await crypto.subtle.importKey(
		"raw",
		secretBuffer,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	return arrayBufferToBase64(signed);
}

export async function sha256Hex(message: string): Promise<string> {
	const encoder = new TextEncoder();
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
	return arrayBufferToHex(digest);
}

export async function verifyOpenAiWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const secret = String(bindings.OPENAI_VIDEO_WEBHOOK_SECRET ?? bindings.OPENAI_WEBHOOK_SECRET ?? "").trim();
	if (!secret) {
		console.error("openai_video_webhook_secret_missing");
		return false;
	}

	const id = req.headers.get("webhook-id")?.trim() ?? "";
	const timestamp = req.headers.get("webhook-timestamp")?.trim() ?? "";
	const signatures = parseOpenAiSignatureCandidates(req.headers.get("webhook-signature"));
	if (!id || !timestamp || signatures.length === 0) return false;
	const timestampSeconds = Number(timestamp);
	if (!Number.isFinite(timestampSeconds)) return false;
	const skewSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
	if (skewSeconds > 300) return false;

	const payload = `${id}.${timestamp}.${rawBody}`;
	const expected = await signHmacSha256(secret, payload);
	return signatures.some((value) => timingSafeEqual(value, expected));
}

export function extractOpenAiEventId(req: Request, jsonBody: any): string | null {
	const headerId = req.headers.get("webhook-id")?.trim();
	if (headerId) return headerId;
	const payloadId = typeof jsonBody?.id === "string" ? jsonBody.id.trim() : "";
	return payloadId || null;
}

export function extractOpenAiVideoId(jsonBody: any): string | null {
	const data = jsonBody?.data;
	const candidates = [
		data?.id,
		data?.video_id,
		data?.videoId,
		jsonBody?.video_id,
		jsonBody?.videoId,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return null;
}

export function encodeDashscopeTaskId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${DASHSCOPE_TASK_PREFIX}${b64}`;
}

export function verifyAlibabaWebhookAuth(req: Request): boolean {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const secret = String(bindings.ALIBABA_VIDEO_WEBHOOK_SECRET ?? "").trim();
	if (!secret) return false;

	const authHeader = req.headers.get("authorization")?.trim() ?? "";
	const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
		? authHeader.slice(7).trim()
		: "";
	const headerToken =
		req.headers.get("x-webhook-token")?.trim() ??
		req.headers.get("x-alibaba-webhook-token")?.trim() ??
		"";
	const provided = headerToken || bearerToken;
	if (!provided) return false;
	return timingSafeEqual(provided, secret);
}

export function extractAlibabaEventType(payload: any): string {
	const candidates = [
		payload?.type,
		payload?.eventType,
		payload?.event_type,
		payload?.["detail-type"],
		payload?.detailType,
		payload?.data?.eventType,
		payload?.data?.event_type,
		payload?.detail?.eventType,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return "";
}

export function extractAlibabaTaskId(payload: any): string | null {
	const detail = payload?.data ?? payload?.detail ?? payload;
	const candidates = [
		detail?.task_id,
		detail?.taskId,
		detail?.output?.task_id,
		detail?.output?.taskId,
		detail?.result?.task_id,
		detail?.result?.taskId,
		payload?.task_id,
		payload?.taskId,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return null;
}

export function mapAlibabaTerminalStatus(eventType: string, payload: any): "completed" | "failed" | "cancelled" | "expired" | null {
	const joined = [
		eventType,
		payload?.status,
		payload?.task_status,
		payload?.data?.status,
		payload?.data?.task_status,
		payload?.detail?.status,
	]
		.map((value) => String(value ?? "").toLowerCase())
		.join(" ");

	if (
		joined.includes("cancel")
	) {
		return "cancelled";
	}
	if (joined.includes("expire")) {
		return "expired";
	}
	if (
		joined.includes("fail") ||
		joined.includes("error")
	) {
		return "failed";
	}
	if (
		joined.includes("finish") ||
		joined.includes("success") ||
		joined.includes("complete") ||
		joined.includes("succeed")
	) {
		return "completed";
	}
	return null;
}

export function mapOpenAiTerminalStatus(eventType: string, payload: any): "completed" | "failed" | "cancelled" | "expired" | null {
	const joined = [
		eventType,
		payload?.status,
		payload?.data?.status,
		payload?.data?.task_status,
		payload?.data?.error?.code,
	]
		.map((value) => String(value ?? "").toLowerCase())
		.join(" ");
	if (joined.includes("cancel")) return "cancelled";
	if (joined.includes("expire")) return "expired";
	if (joined.includes("fail") || joined.includes("error")) return "failed";
	if (
		joined.includes("complete") ||
		joined.includes("succeed") ||
		joined.includes("success")
	) {
		return "completed";
	}
	return null;
}

function videoWebhookEventForTerminalStatus(
	status: string,
): "video.completed" | "video.failed" | "video.cancelled" | "video.expired" | null {
	if (status === "completed") return "video.completed";
	if (status === "cancelled") return "video.cancelled";
	if (status === "expired") return "video.expired";
	if (status === "failed") return "video.failed";
	return null;
}

export function extractAlibabaModel(payload: any): string | undefined {
	const detail = payload?.data ?? payload?.detail ?? payload;
	const candidates = [
		detail?.model,
		detail?.request?.model,
		detail?.output?.model,
		payload?.model,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return undefined;
}

export function extractAlibabaSeconds(payload: any): number | undefined {
	const detail = payload?.data ?? payload?.detail ?? payload;
	const candidates = [
		detail?.duration,
		detail?.duration_seconds,
		detail?.durationSeconds,
		detail?.video_duration,
		detail?.output?.duration,
		detail?.output?.duration_seconds,
	];
	for (const candidate of candidates) {
		const parsed = toPositiveNumber(candidate);
		if (parsed != null) return parsed;
	}
	return undefined;
}

export function extractAlibabaOptions(payload: any): { resolution?: string; quality?: string } {
	const detail = payload?.data ?? payload?.detail ?? payload;
	const sizeCandidates = [
		detail?.size,
		detail?.resolution,
		detail?.parameters?.size,
		detail?.parameters?.resolution,
	];
	const qualityCandidates = [
		detail?.quality,
		detail?.parameters?.quality,
	];
	const out: { resolution?: string; quality?: string } = {};
	for (const candidate of sizeCandidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			const normalized = candidate.trim();
			out.resolution = normalized;
			break;
		}
	}
	for (const candidate of qualityCandidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			out.quality = candidate.trim();
			break;
		}
	}
	return out;
}

export function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

export async function processOpenAiVideoWebhook(args: {
	eventId: string;
	eventType: string;
	payload: any;
}): Promise<void> {
	const { eventId, eventType, payload } = args;
	const videoNativeId = extractOpenAiVideoId(payload);
	if (!videoNativeId) {
		await markProviderEventProcessed({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
		});
		return;
	}

	const job = await findVideoJobRecordByNativeId(OPENAI_PROVIDER_ID, videoNativeId);
	if (!job) {
		console.warn("openai_video_webhook_job_not_found", {
			eventId,
			videoNativeId,
		});
		return;
	}

	const terminal = mapOpenAiTerminalStatus(eventType, payload);
	if (!terminal) {
		await markProviderEventProcessed({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
			workspaceId: job.workspaceId,
			internalId: job.videoId,
		});
		return;
	}

	const data = payload?.data ?? {};
	const finalized = await finalizeVideoJob({
		workspaceId: job.workspaceId,
		videoId: job.videoId,
		providerId: OPENAI_PROVIDER_ID,
		status: terminal,
		model: typeof data?.model === "string" ? data.model : job.model,
		seconds: toPositiveNumber(data?.seconds ?? data?.duration_seconds ?? data?.duration),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: data?.resolution ?? data?.size ?? job.meta?.resolution,
			quality: data?.quality ?? job.meta?.quality,
		}),
		isByok: job.meta?.keySource === "byok",
		metaPatch: {
			webhookEventType: eventType,
			lastWebhookAt: new Date().toISOString(),
		},
	});
	const finalizedEventType = videoWebhookEventForTerminalStatus(finalized.status);
	if (finalizedEventType) {
		dispatchVideoWebhookEventInBackground({
			workspaceId: job.workspaceId,
			videoId: job.videoId,
			eventType: finalizedEventType,
		});
	}

	await markProviderEventProcessed({
		provider: OPENAI_PROVIDER_ID,
		providerEventId: eventId,
		workspaceId: job.workspaceId,
		internalId: job.videoId,
	});
}

export async function processAlibabaVideoWebhook(args: {
	eventId: string;
	eventType: string;
	payload: any;
	taskId: string;
}): Promise<void> {
	const { eventId, eventType, payload, taskId } = args;
	const nativeId = encodeDashscopeTaskId(taskId);
	const job = await findVideoJobRecordByNativeId(ALIBABA_PROVIDER_ID, nativeId);
	if (!job) {
		console.warn("alibaba_video_webhook_job_not_found", {
			eventId,
			nativeId,
		});
		return;
	}

	const terminal = mapAlibabaTerminalStatus(eventType, payload);
	if (!terminal) {
		await markProviderEventProcessed({
			provider: ALIBABA_PROVIDER_ID,
			providerEventId: eventId,
			workspaceId: job.workspaceId,
			internalId: job.videoId,
		});
		return;
	}

	const requestOptions = extractAlibabaOptions(payload);
	const finalized = await finalizeVideoJob({
		workspaceId: job.workspaceId,
		videoId: job.videoId,
		providerId: ALIBABA_PROVIDER_ID,
		status: terminal,
		model: extractAlibabaModel(payload) ?? job.model,
		seconds: extractAlibabaSeconds(payload),
		requestOptions: buildVideoPricingRequestOptions({
			resolution: requestOptions.resolution ?? job.meta?.resolution,
			quality: requestOptions.quality ?? job.meta?.quality,
		}),
		isByok: job.meta?.keySource === "byok",
		metaPatch: {
			webhookEventType: eventType,
			lastWebhookAt: new Date().toISOString(),
		},
	});
	const finalizedEventType = videoWebhookEventForTerminalStatus(finalized.status);
	if (finalizedEventType) {
		dispatchVideoWebhookEventInBackground({
			workspaceId: job.workspaceId,
			videoId: job.videoId,
			eventType: finalizedEventType,
		});
	}

	await markProviderEventProcessed({
		provider: ALIBABA_PROVIDER_ID,
		providerEventId: eventId,
		workspaceId: job.workspaceId,
		internalId: job.videoId,
	});
}

export function pickHeaders(req: Request): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of req.headers.entries()) {
		const containsCredentialMaterial = /authorization|cookie|signature|token|secret|api-key/.test(key);
		if (
			!containsCredentialMaterial &&
			(
				key.startsWith("webhook-") ||
				key.startsWith("x-openai") ||
				key.startsWith("x-acs-") ||
				key.startsWith("x-eventbridge-")
			)
		) {
			out[key] = value;
		}
	}
	return out;
}
