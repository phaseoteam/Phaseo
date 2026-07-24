// Purpose: Shared helpers for internal batch provider webhook routes.
// Why: Native provider webhooks should wake reconciliation/finalization without being a public API.

import { getBindings } from "@/runtime/env";
import { dispatchAsyncWebhookEvent } from "@core/async-notifications";
import {
	batchMetaFromProviderPayload,
	fetchProviderBatchStatus,
	GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
} from "@core/batch-provider-adapters";
import { finalizeBatchJob } from "@core/batch-finalization";
import {
	findBatchJobRecordByNativeId,
	saveBatchFileMeta,
	saveBatchJobMeta,
	type BatchJobMeta,
} from "@core/batch-jobs";
import { deferProviderEvent, listUnprocessedProviderEvents, markProviderEventProcessed } from "@core/provider-events";
import {
	OPENAI_PROVIDER_ID,
	extractOpenAiEventId,
	parseOpenAiSignatureCandidates,
	pickHeaders,
	signHmacSha256,
	timingSafeEqual,
} from "./video-webhooks.helpers";

type OpenAiBatchTerminal =
	| { status: "completed"; phase: "completed" }
	| { status: "failed"; phase: "failed" }
	| { status: "expired"; phase: "failed" }
	| { status: "cancelled"; phase: "cancelled" };

type BatchTerminal = OpenAiBatchTerminal;

function customerWebhookPhase(status: string): "completed" | "failed" | "cancelled" {
	const normalized = status.trim().toLowerCase();
	if (normalized === "completed") return "completed";
	if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
	return "failed";
}

const OPENAI_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const MAX_PROVIDER_WEBHOOK_BODY_BYTES = 1024 * 1024;

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeOpenAiBatchStatus(value: unknown): string | null {
	const text = normalizeText(value)?.toLowerCase();
	if (!text) return null;
	if (text === "canceled") return "cancelled";
	return text;
}

function isFreshOpenAiWebhookTimestamp(value: string): boolean {
	if (!/^\d+$/.test(value)) return false;
	const timestampSeconds = Number(value);
	if (!Number.isFinite(timestampSeconds)) return false;
	const nowSeconds = Math.floor(Date.now() / 1000);
	return Math.abs(nowSeconds - timestampSeconds) <= OPENAI_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
}

function batchMetaFromOpenAiPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = normalizeText(payload?.id);
	return {
		...base,
		status: normalizeOpenAiBatchStatus(payload?.status) ?? base.status ?? null,
		model: normalizeText(payload?.model) ?? base.model ?? null,
		nativeBatchId: id ?? base.nativeBatchId ?? null,
		endpoint: normalizeText(payload?.endpoint) ?? base.endpoint ?? null,
		completionWindow: normalizeText(payload?.completion_window) ?? base.completionWindow ?? null,
		inputFileId: normalizeText(payload?.input_file_id) ?? base.inputFileId ?? null,
		outputFileId: normalizeText(payload?.output_file_id) ?? base.outputFileId ?? null,
		errorFileId: normalizeText(payload?.error_file_id) ?? base.errorFileId ?? null,
		requestCounts:
			payload?.request_counts && typeof payload.request_counts === "object" && !Array.isArray(payload.request_counts)
				? {
					total: typeof payload.request_counts.total === "number" ? payload.request_counts.total : null,
					completed: typeof payload.request_counts.completed === "number" ? payload.request_counts.completed : null,
					failed: typeof payload.request_counts.failed === "number" ? payload.request_counts.failed : null,
				}
				: base.requestCounts ?? null,
	};
}

async function persistBatchFileOwnership(workspaceId: string, payload: any): Promise<void> {
	const outputFileId = normalizeText(payload?.output_file_id);
	if (outputFileId) {
		await saveBatchFileMeta(workspaceId, outputFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
	const errorFileId = normalizeText(payload?.error_file_id);
	if (errorFileId) {
		await saveBatchFileMeta(workspaceId, errorFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
}

export async function verifyOpenAiBatchWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const secret = String(bindings.OPENAI_BATCH_WEBHOOK_SECRET ?? bindings.OPENAI_WEBHOOK_SECRET ?? "").trim();
	if (!secret) {
		console.error("openai_batch_webhook_secret_missing");
		return false;
	}

	const id = req.headers.get("webhook-id")?.trim() ?? "";
	const timestamp = req.headers.get("webhook-timestamp")?.trim() ?? "";
	const signatures = parseOpenAiSignatureCandidates(req.headers.get("webhook-signature"));
	if (!id || !timestamp || signatures.length === 0) return false;
	if (!isFreshOpenAiWebhookTimestamp(timestamp)) return false;

	const expected = await signHmacSha256(secret, `${id}.${timestamp}.${rawBody}`);
	return signatures.some((value) => timingSafeEqual(value, expected));
}

export async function verifyGoogleAiStudioBatchWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const secret = String(
		bindings.GOOGLE_AI_STUDIO_BATCH_WEBHOOK_SECRET ??
		bindings.GEMINI_BATCH_WEBHOOK_SECRET ??
		"",
	).trim();
	if (!secret) {
		console.error("google_ai_studio_batch_webhook_secret_missing");
		return false;
	}

	const id = req.headers.get("webhook-id")?.trim() ?? "";
	const timestamp = req.headers.get("webhook-timestamp")?.trim() ?? "";
	const signatures = parseOpenAiSignatureCandidates(req.headers.get("webhook-signature"));
	if (!id || !timestamp || signatures.length === 0) return false;
	if (!isFreshOpenAiWebhookTimestamp(timestamp)) return false;

	const expected = await signHmacSha256(secret, `${id}.${timestamp}.${rawBody}`);
	return signatures.some((value) => timingSafeEqual(value, expected));
}

export function extractOpenAiBatchId(payload: any): string | null {
	const data = payload?.data;
	const candidates = [
		data?.id,
		data?.batch_id,
		data?.batchId,
		payload?.batch_id,
		payload?.batchId,
		payload?.id,
	];
	for (const candidate of candidates) {
		const text = normalizeText(candidate);
		if (text) return text;
	}
	return null;
}

export function extractGoogleAiStudioBatchId(payload: any): string | null {
	const data = payload?.data;
	const candidates = [
		data?.id,
		data?.name,
		data?.batch_id,
		data?.batchId,
		payload?.batch_id,
		payload?.batchId,
		payload?.name,
		payload?.id,
	];
	for (const candidate of candidates) {
		const text = normalizeText(candidate);
		if (text) return text;
	}
	return null;
}

export function mapOpenAiBatchTerminal(eventType: string, payload: any): OpenAiBatchTerminal | null {
	const normalizedEvent = normalizeText(eventType)?.toLowerCase() ?? "";
	if (normalizedEvent === "batch.completed") return { status: "completed", phase: "completed" };
	if (normalizedEvent === "batch.failed") return { status: "failed", phase: "failed" };
	if (normalizedEvent === "batch.expired") return { status: "expired", phase: "failed" };
	if (normalizedEvent === "batch.cancelled" || normalizedEvent === "batch.canceled") {
		return { status: "cancelled", phase: "cancelled" };
	}

	const status = normalizeOpenAiBatchStatus(payload?.data?.status ?? payload?.status);
	if (status === "completed") return { status, phase: "completed" };
	if (status === "failed") return { status, phase: "failed" };
	if (status === "expired") return { status, phase: "failed" };
	if (status === "cancelled") return { status, phase: "cancelled" };
	return null;
}

export function mapGoogleAiStudioBatchTerminal(eventType: string, payload: any): BatchTerminal | null {
	const normalizedEvent = normalizeText(eventType)?.toLowerCase() ?? "";
	if (normalizedEvent === "batch.succeeded") return { status: "completed", phase: "completed" };
	if (normalizedEvent === "batch.failed") return { status: "failed", phase: "failed" };
	if (normalizedEvent === "batch.expired") return { status: "expired", phase: "failed" };
	if (normalizedEvent === "batch.cancelled" || normalizedEvent === "batch.canceled") {
		return { status: "cancelled", phase: "cancelled" };
	}

	const status = normalizeOpenAiBatchStatus(payload?.data?.status ?? payload?.status);
	if (status === "completed" || status === "succeeded") return { status: "completed", phase: "completed" };
	if (status === "failed") return { status: "failed", phase: "failed" };
	if (status === "expired") return { status: "expired", phase: "failed" };
	if (status === "cancelled") return { status: "cancelled", phase: "cancelled" };
	return null;
}

async function findGoogleAiStudioBatchJob(nativeBatchId: string) {
	const candidates = [
		nativeBatchId,
		nativeBatchId.includes("/") ? nativeBatchId.split("/").filter(Boolean).pop() : null,
		nativeBatchId.includes("/") ? null : `batches/${nativeBatchId}`,
	]
		.filter((value): value is string => Boolean(value))
		.filter((value, index, values) => values.indexOf(value) === index);

	for (const candidate of candidates) {
		const job = await findBatchJobRecordByNativeId(GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID, candidate);
		if (job) return job;
	}
	return null;
}

export async function processOpenAiBatchWebhook(args: {
	eventId: string;
	eventType: string;
	payload: any;
}): Promise<boolean> {
	const { eventId, eventType, payload } = args;
	const nativeBatchId = extractOpenAiBatchId(payload);
	if (!nativeBatchId) {
		await markProviderEventProcessed({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
		});
		return true;
	}

	const job = await findBatchJobRecordByNativeId(OPENAI_PROVIDER_ID, nativeBatchId);
	if (!job) {
		console.warn("openai_batch_webhook_job_not_found", {
			eventId,
			nativeBatchId,
		});
		await deferProviderEvent({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
			reason: "batch_job_not_found",
		});
		return false;
	}

	const authoritativePayload = await fetchProviderBatchStatus(OPENAI_PROVIDER_ID, nativeBatchId);
	const data = authoritativePayload ?? (payload?.data && typeof payload.data === "object" ? payload.data : payload);
	await saveBatchJobMeta(
		job.workspaceId,
		job.batchId,
		batchMetaFromOpenAiPayload(data, {
			...(job.meta ?? { provider: OPENAI_PROVIDER_ID }),
			provider: OPENAI_PROVIDER_ID,
		}),
	);
	await persistBatchFileOwnership(job.workspaceId, data);

	const terminal = mapOpenAiBatchTerminal(eventType, { ...payload, data });
	if (!terminal) {
		await markProviderEventProcessed({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
			workspaceId: job.workspaceId,
			internalId: job.batchId,
		});
		return true;
	}

	const finalization = await finalizeBatchJob({
		workspaceId: job.workspaceId,
		batchId: job.batchId,
		status: terminal.status,
	});
	if (!finalization.billed) {
		await deferProviderEvent({
			provider: OPENAI_PROVIDER_ID,
			providerEventId: eventId,
			reason: `batch_finalization_pending:${finalization.reason}`,
		});
		return false;
	}
	await dispatchAsyncWebhookEvent({
		workspaceId: job.workspaceId,
		kind: "batch",
		internalId: job.batchId,
		phase: customerWebhookPhase(finalization.status),
	});

	await markProviderEventProcessed({
		provider: OPENAI_PROVIDER_ID,
		providerEventId: eventId,
		workspaceId: job.workspaceId,
		internalId: job.batchId,
	});
	return true;
}

export async function readProviderWebhookBody(req: Request): Promise<
	| { ok: true; rawBody: string }
	| { ok: false }
> {
	const declaredLength = Number(req.headers.get("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_WEBHOOK_BODY_BYTES) {
		return { ok: false };
	}
	if (!req.body) return { ok: true, rawBody: "" };

	const reader = req.body.getReader();
	const decoder = new TextDecoder();
	let bytesRead = 0;
	let rawBody = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytesRead += value.byteLength;
		if (bytesRead > MAX_PROVIDER_WEBHOOK_BODY_BYTES) {
			await reader.cancel("payload_too_large").catch(() => undefined);
			return { ok: false };
		}
		rawBody += decoder.decode(value, { stream: true });
	}
	return { ok: true, rawBody: rawBody + decoder.decode() };
}

export async function processGoogleAiStudioBatchWebhook(args: {
	eventId: string;
	eventType: string;
	payload: any;
}): Promise<boolean> {
	const { eventId, eventType, payload } = args;
	const nativeBatchId = extractGoogleAiStudioBatchId(payload);
	if (!nativeBatchId) {
		await markProviderEventProcessed({
			provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
			providerEventId: eventId,
		});
		return true;
	}

	const job = await findGoogleAiStudioBatchJob(nativeBatchId);
	if (!job) {
		console.warn("google_ai_studio_batch_webhook_job_not_found", {
			eventId,
			nativeBatchId,
		});
		await deferProviderEvent({
			provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
			providerEventId: eventId,
			reason: "batch_job_not_found",
		});
		return false;
	}

	const authoritativePayload = await fetchProviderBatchStatus(
		GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
		job.nativeId ?? job.meta?.nativeBatchId ?? nativeBatchId,
	);
	const status = normalizeText(authoritativePayload?.status);
	const terminal =
		status === "completed"
			? { status, phase: "completed" as const }
			: status === "failed" || status === "expired"
				? { status, phase: "failed" as const }
				: status === "cancelled" || status === "canceled"
					? { status: "cancelled" as const, phase: "cancelled" as const }
					: mapGoogleAiStudioBatchTerminal(eventType, payload);

	await saveBatchJobMeta(
		job.workspaceId,
		job.batchId,
		batchMetaFromProviderPayload(authoritativePayload ?? {}, {
			...(job.meta ?? { provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID }),
			provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
			webhook: {
				...(job.meta?.webhook ?? {}),
				lastProviderEventId: eventId,
				lastProviderEventType: eventType,
				lastProviderEventAt: new Date().toISOString(),
				outputFileUri: normalizeText(payload?.data?.output_file_uri) ?? undefined,
			},
		}),
	);

	if (!terminal) {
		await markProviderEventProcessed({
			provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
			providerEventId: eventId,
			workspaceId: job.workspaceId,
			internalId: job.batchId,
		});
		return true;
	}

	const finalization = await finalizeBatchJob({
		workspaceId: job.workspaceId,
		batchId: job.batchId,
		status: terminal.status,
	});
	if (!finalization.billed) {
		await deferProviderEvent({
			provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
			providerEventId: eventId,
			reason: `batch_finalization_pending:${finalization.reason}`,
		});
		return false;
	}
	await dispatchAsyncWebhookEvent({
		workspaceId: job.workspaceId,
		kind: "batch",
		internalId: job.batchId,
		phase: customerWebhookPhase(finalization.status),
	});

	await markProviderEventProcessed({
		provider: GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
		providerEventId: eventId,
		workspaceId: job.workspaceId,
		internalId: job.batchId,
	});
	return true;
}

export async function runBatchProviderWebhookReplayJob(args?: { limit?: number }): Promise<{
	eventsScanned: number;
	eventsProcessed: number;
	eventsFailed: number;
}> {
	const events = await listUnprocessedProviderEvents({
		providers: [OPENAI_PROVIDER_ID, GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID],
		limit: args?.limit ?? 100,
		workerId: `batch-provider-event-replay:${crypto.randomUUID()}`,
		leaseSeconds: 120,
	});
	let eventsProcessed = 0;
	let eventsFailed = 0;
	for (const event of events) {
		try {
			const eventType = normalizeText(event.kind) ?? normalizeText(event.payload.type) ?? normalizeText(event.payload.event);
			if (!eventType) {
				await markProviderEventProcessed({
					provider: event.provider,
					providerEventId: event.providerEventId,
				});
				eventsProcessed += 1;
				continue;
			}
			let processed: boolean;
			if (event.provider === OPENAI_PROVIDER_ID) {
				processed = await processOpenAiBatchWebhook({
					eventId: event.providerEventId,
					eventType,
					payload: event.payload,
				});
			} else {
				processed = await processGoogleAiStudioBatchWebhook({
					eventId: event.providerEventId,
					eventType,
					payload: event.payload,
				});
			}
			if (processed) eventsProcessed += 1;
		} catch (error) {
			eventsFailed += 1;
			console.error("batch_provider_webhook_replay_failed", {
				error,
				provider: event.provider,
				providerEventId: event.providerEventId,
			});
			try {
				await deferProviderEvent({
					provider: event.provider,
					providerEventId: event.providerEventId,
					reason: error instanceof Error ? error.message : "batch_provider_webhook_replay_failed",
				});
			} catch (deferError) {
				console.error("batch_provider_webhook_replay_defer_failed", {
					error: deferError,
					provider: event.provider,
					providerEventId: event.providerEventId,
				});
			}
		}
	}
	return {
		eventsScanned: events.length,
		eventsProcessed,
		eventsFailed,
	};
}

export {
	OPENAI_PROVIDER_ID,
	GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID,
	extractOpenAiEventId,
	pickHeaders,
};
