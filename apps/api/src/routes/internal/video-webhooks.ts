// Purpose: Provider webhook receiver for async video job finalization.
// Why: Completion billing must be triggered by provider terminal events.
// How: Verifies signatures, deduplicates events, and finalizes in background.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { dispatchBackground, ensureRuntimeForBackground, getBindings } from "@/runtime/env";
import { findVideoJobRecordByNativeId } from "@core/video-jobs";
import { finalizeVideoJob } from "@core/video-finalization";
import { insertProviderEvent, markProviderEventProcessed } from "@core/provider-events";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { json, withRuntime } from "@/routes/utils";

const OPENAI_PROVIDER_ID = "openai";
const ALIBABA_PROVIDER_ID = "alibaba";
const DASHSCOPE_TASK_PREFIX = "dscope_";

function timingSafeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i++) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

function parseOpenAiSignatureCandidates(headerValue: string | null): string[] {
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let out = "";
	for (const byte of bytes) out += String.fromCharCode(byte);
	return btoa(out);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
}

async function signHmacSha256(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	return arrayBufferToBase64(signed);
}

async function sha256Hex(message: string): Promise<string> {
	const encoder = new TextEncoder();
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
	return arrayBufferToHex(digest);
}

async function verifyOpenAiWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
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

	const payload = `${id}.${timestamp}.${rawBody}`;
	const expected = await signHmacSha256(secret, payload);
	return signatures.some((value) => timingSafeEqual(value, expected));
}

function extractOpenAiEventId(req: Request, jsonBody: any): string | null {
	const headerId = req.headers.get("webhook-id")?.trim();
	if (headerId) return headerId;
	const payloadId = typeof jsonBody?.id === "string" ? jsonBody.id.trim() : "";
	return payloadId || null;
}

function extractOpenAiVideoId(jsonBody: any): string | null {
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

function encodeDashscopeTaskId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${DASHSCOPE_TASK_PREFIX}${b64}`;
}

function verifyAlibabaWebhookAuth(req: Request): boolean {
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

function extractAlibabaEventType(payload: any): string {
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

function extractAlibabaTaskId(payload: any): string | null {
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

function mapAlibabaTerminalStatus(eventType: string, payload: any): "completed" | "failed" | null {
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
		joined.includes("fail") ||
		joined.includes("error") ||
		joined.includes("cancel")
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

function extractAlibabaModel(payload: any): string | undefined {
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

function extractAlibabaSeconds(payload: any): number | undefined {
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

function extractAlibabaOptions(payload: any): { resolution?: string; quality?: string } {
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

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

async function processOpenAiVideoWebhook(args: {
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

	const isCompleted = eventType === "video.completed";
	const isFailed = eventType === "video.failed";
	if (!isCompleted && !isFailed) {
		await markProviderEventProcessed({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
			teamId: job.teamId,
			internalId: job.videoId,
		});
		return;
	}

	const data = payload?.data ?? {};
	await finalizeVideoJob({
		teamId: job.teamId,
		videoId: job.videoId,
		providerId: OPENAI_PROVIDER_ID,
		status: isCompleted ? "completed" : "failed",
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

	await markProviderEventProcessed({
		provider: OPENAI_PROVIDER_ID,
		providerEventId: eventId,
		teamId: job.teamId,
		internalId: job.videoId,
	});
}

async function processAlibabaVideoWebhook(args: {
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
			teamId: job.teamId,
			internalId: job.videoId,
		});
		return;
	}

	const requestOptions = extractAlibabaOptions(payload);
	await finalizeVideoJob({
		teamId: job.teamId,
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

	await markProviderEventProcessed({
		provider: ALIBABA_PROVIDER_ID,
		providerEventId: eventId,
		teamId: job.teamId,
		internalId: job.videoId,
	});
}

function pickHeaders(req: Request): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of req.headers.entries()) {
		if (
			key.startsWith("webhook-") ||
			key.startsWith("x-openai") ||
			key.startsWith("x-acs-") ||
			key.startsWith("x-eventbridge-")
		) {
			out[key] = value;
		}
	}
	return out;
}

export const internalVideoWebhookRoutes = new Hono<Env>();

internalVideoWebhookRoutes.post("/openai", withRuntime(async (req) => {
	const rawBody = await req.text();
	const signatureOk = await verifyOpenAiWebhookSignature(req, rawBody);
	if (!signatureOk) {
		return json({ ok: false, error: "invalid_signature" }, 401, { "Cache-Control": "no-store" });
	}

	let payload: any = {};
	try {
		payload = rawBody.length ? JSON.parse(rawBody) : {};
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400, { "Cache-Control": "no-store" });
	}
	const eventType = String(payload?.type ?? payload?.event ?? "").trim();
	if (!eventType) {
		return json({ ok: false, error: "invalid_event_type" }, 400, { "Cache-Control": "no-store" });
	}
	const eventId = extractOpenAiEventId(req, payload);
	if (!eventId) {
		return json({ ok: false, error: "missing_event_id" }, 400, { "Cache-Control": "no-store" });
	}

	const dedupe = await insertProviderEvent({
		provider: OPENAI_PROVIDER_ID,
		providerEventId: eventId,
		kind: eventType,
		payload,
		headers: pickHeaders(req),
	});
	if (!dedupe.inserted) {
		return json({ ok: true, deduped: true, processed: Boolean(dedupe.record?.processedAt) }, 200, {
			"Cache-Control": "no-store",
		});
	}

	dispatchBackground((async () => {
		const releaseRuntime = ensureRuntimeForBackground();
		try {
			await processOpenAiVideoWebhook({
				eventId,
				eventType,
				payload,
			});
		} catch (error) {
			console.error("openai_video_webhook_processing_failed", {
				error,
				eventId,
				eventType,
			});
		} finally {
			releaseRuntime();
		}
	})());

	return json({ ok: true, accepted: true }, 202, { "Cache-Control": "no-store" });
}));

internalVideoWebhookRoutes.post("/alibaba", withRuntime(async (req) => {
	if (!verifyAlibabaWebhookAuth(req)) {
		return json({ ok: false, error: "invalid_signature" }, 401, { "Cache-Control": "no-store" });
	}

	const rawBody = await req.text();
	let payload: any = {};
	try {
		payload = rawBody.length ? JSON.parse(rawBody) : {};
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400, { "Cache-Control": "no-store" });
	}

	const eventType = extractAlibabaEventType(payload);
	if (!eventType) {
		return json({ ok: false, error: "invalid_event_type" }, 400, { "Cache-Control": "no-store" });
	}

	const taskId = extractAlibabaTaskId(payload);
	if (!taskId) {
		return json({ ok: true, accepted: true, ignored: "missing_task_id" }, 202, { "Cache-Control": "no-store" });
	}

	const eventIdCandidates = [
		req.headers.get("x-acs-event-id"),
		req.headers.get("x-event-id"),
		payload?.id,
		payload?.eventId,
		payload?.event_id,
		payload?.data?.id,
	];
	let eventId = "";
	for (const candidate of eventIdCandidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			eventId = candidate.trim();
			break;
		}
	}
	if (!eventId) {
		const bodyHash = await sha256Hex(rawBody);
		eventId = `${ALIBABA_PROVIDER_ID}:${eventType}:${taskId}:${bodyHash}`;
	}

	const dedupe = await insertProviderEvent({
		provider: ALIBABA_PROVIDER_ID,
		providerEventId: eventId,
		kind: eventType,
		payload,
		headers: pickHeaders(req),
	});
	if (!dedupe.inserted) {
		return json({ ok: true, deduped: true, processed: Boolean(dedupe.record?.processedAt) }, 200, {
			"Cache-Control": "no-store",
		});
	}

	dispatchBackground((async () => {
		const releaseRuntime = ensureRuntimeForBackground();
		try {
			await processAlibabaVideoWebhook({
				eventId,
				eventType,
				payload,
				taskId,
			});
		} catch (error) {
			console.error("alibaba_video_webhook_processing_failed", {
				error,
				eventId,
				eventType,
			});
		} finally {
			releaseRuntime();
		}
	})());

	return json({ ok: true, accepted: true }, 202, { "Cache-Control": "no-store" });
}));
