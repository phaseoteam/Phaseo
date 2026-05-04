import { dispatchBackground } from "@/runtime/env";
import {
	getAsyncOperation,
	listAsyncOperations,
	patchAsyncOperationMeta,
	type AsyncOperationRecord,
} from "@core/async-operations";
import {
	buildVideoContentUrl,
	buildVideoPollingUrl,
	issueSignedVideoDownloadUrl,
	resolveGatewayPublicBaseUrl,
	toPublicVideoProviderId,
	toPublicVideoStatus,
} from "@core/video-public";

export type SupportedAsyncNotificationKind = "video" | "batch";
export type AsyncNotificationPhase = "created" | "progress" | "completed" | "failed" | "cancelled";
export type AsyncNotificationEventType =
	| `job.${AsyncNotificationPhase}`
	| `video.${AsyncNotificationPhase}`
	| `batch.${AsyncNotificationPhase}`;
export type AsyncWebhookAttemptStatus = "delivered" | "scheduled_retry" | "failed_permanently";
export type AsyncWebhookDeliveryAttempt = {
	id: string;
	delivery_key: string;
	event_type: AsyncNotificationEventType;
	status: AsyncWebhookAttemptStatus;
	attempt_number: number;
	max_attempts: number;
	tried_at: string;
	delivered_at: string | null;
	next_retry_at: string | null;
	response_status: number | null;
	error_message: string | null;
	response_body_preview: string | null;
};

type AsyncNotificationMeta = Record<string, unknown>;
type AsyncWebhookRetryState = {
	deliveryKey: string;
	eventType: AsyncNotificationEventType;
	phase: AsyncNotificationPhase;
	progress: number | null;
	attemptCount: number;
	nextRetryAt: string | null;
	lastTriedAt: string | null;
	lastStatusCode: number | null;
	lastErrorMessage: string | null;
	responseBodyPreview: string | null;
};
type AsyncWebhookRetryQueue = Record<string, AsyncWebhookRetryState>;

const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_WEBHOOK_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;
const MAX_WEBHOOK_ATTEMPT_HISTORY = 50;

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoDate(value: unknown): string | null {
	const text = normalizeText(value);
	if (!text) return null;
	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function resolveNotificationBaseUrl(value: unknown): string {
	const text = normalizeText(value);
	if (text) {
		try {
			return new URL(text).toString().replace(/\/+$/, "");
		} catch {
			// Fall through to configured runtime/public default.
		}
	}
	return resolveGatewayPublicBaseUrl(null);
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function toBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (value === 1) return true;
		if (value === 0) return false;
		return null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim().toLowerCase();
		if (["1", "true", "yes", "on"].includes(trimmed)) return true;
		if (["0", "false", "no", "off"].includes(trimmed)) return false;
	}
	return null;
}

function normalizeAsyncWebhookAttempts(value: unknown): AsyncWebhookDeliveryAttempt[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry, index) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
			const record = entry as Record<string, unknown>;
			const eventType = normalizeText(record.event_type) as AsyncNotificationEventType | null;
			const status = normalizeText(record.status) as AsyncWebhookAttemptStatus | null;
			const triedAt = normalizeIsoDate(record.tried_at);
			const attemptNumber = toFiniteNumber(record.attempt_number);
			const maxAttempts = toFiniteNumber(record.max_attempts);
			if (
				!eventType ||
				!status ||
				!triedAt ||
				attemptNumber == null ||
				maxAttempts == null
			) {
				return null;
			}
			return {
				id: normalizeText(record.id) ?? `${eventType}:${triedAt}:${index}`,
				delivery_key: normalizeText(record.delivery_key) ?? eventType,
				event_type: eventType,
				status,
				attempt_number: Math.max(1, Math.trunc(attemptNumber)),
				max_attempts: Math.max(1, Math.trunc(maxAttempts)),
				tried_at: triedAt,
				delivered_at: normalizeIsoDate(record.delivered_at),
				next_retry_at: normalizeIsoDate(record.next_retry_at),
				response_status: toFiniteNumber(record.response_status),
				error_message: normalizeText(record.error_message),
				response_body_preview: normalizeText(record.response_body_preview),
			};
		})
		.filter((entry): entry is AsyncWebhookDeliveryAttempt => Boolean(entry));
}

function normalizeAsyncWebhookRetryQueue(value: unknown): AsyncWebhookRetryQueue {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: AsyncWebhookRetryQueue = {};
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
		const record = raw as Record<string, unknown>;
		const deliveryKey = normalizeText(record.deliveryKey) ?? normalizeText(record.delivery_key) ?? key;
		const eventType = normalizeText(record.eventType ?? record.event_type) as AsyncNotificationEventType | null;
		const phase = normalizeText(record.phase) as AsyncNotificationPhase | null;
		const attemptCount = toFiniteNumber(record.attemptCount ?? record.attempt_count);
		if (!deliveryKey || !eventType || !phase || attemptCount == null) continue;
		out[key] = {
			deliveryKey,
			eventType,
			phase,
			progress: toFiniteNumber(record.progress),
			attemptCount: Math.max(0, Math.trunc(attemptCount)),
			nextRetryAt: normalizeIsoDate(record.nextRetryAt ?? record.next_retry_at),
			lastTriedAt: normalizeIsoDate(record.lastTriedAt ?? record.last_tried_at),
			lastStatusCode: toFiniteNumber(record.lastStatusCode ?? record.last_status_code),
			lastErrorMessage: normalizeText(record.lastErrorMessage ?? record.last_error_message),
			responseBodyPreview: normalizeText(record.responseBodyPreview ?? record.response_body_preview),
		};
	}
	return out;
}

function appendWebhookAttempt(
	existing: AsyncWebhookDeliveryAttempt[],
	attempt: AsyncWebhookDeliveryAttempt,
): AsyncWebhookDeliveryAttempt[] {
	return [...existing, attempt]
		.sort((a, b) => a.tried_at.localeCompare(b.tried_at))
		.slice(-MAX_WEBHOOK_ATTEMPT_HISTORY);
}

function computeNextRetryAtFromQueue(queue: AsyncWebhookRetryQueue): string | null {
	return Object.values(queue)
		.map((entry) => normalizeIsoDate(entry.nextRetryAt))
		.filter((entry): entry is string => Boolean(entry))
		.sort((a, b) => a.localeCompare(b))[0] ?? null;
}

function computeRetryDelayMsForAttempt(attemptNumber: number): number | null {
	const retryIndex = Math.max(0, attemptNumber - 1);
	return WEBHOOK_RETRY_DELAYS_MS[retryIndex] ?? null;
}

type AsyncWebhookRequestResult = {
	ok: boolean;
	statusCode: number | null;
	bodyPreview: string | null;
	errorMessage: string | null;
};

function resolveWebhookUrl(value: unknown): string | null {
	const text = normalizeText(value);
	if (!text) return null;
	try {
		const parsed = new URL(text);
		if (parsed.protocol === "https:") return parsed.toString();
		if (
			parsed.protocol === "http:" &&
			(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1")
		) {
			return parsed.toString();
		}
		return null;
	} catch {
		return null;
	}
}

function normalizeWebhookEvent(kind: SupportedAsyncNotificationKind, value: unknown): AsyncNotificationEventType | null {
	const text = normalizeText(value)?.toLowerCase();
	if (!text) return null;
	const supportedPhases: AsyncNotificationPhase[] = ["created", "progress", "completed", "failed", "cancelled"];
	const matchPhase = supportedPhases.find((phase) => phase === text);
	if (matchPhase) return `job.${matchPhase}`;
	if (
		text.startsWith("job.") ||
		text.startsWith("video.") ||
		text.startsWith("batch.")
	) {
		const [, phase] = text.split(".", 2);
		if (phase && supportedPhases.includes(phase as AsyncNotificationPhase)) {
			return text as AsyncNotificationEventType;
		}
	}
	if (text === `${kind}.created`) return `${kind}.created`;
	if (text === `${kind}.progress`) return `${kind}.progress`;
	if (text === `${kind}.completed`) return `${kind}.completed`;
	if (text === `${kind}.failed`) return `${kind}.failed`;
	if (text === `${kind}.cancelled`) return `${kind}.cancelled`;
	return null;
}

export function parseAsyncWebhookConfig(
	kind: SupportedAsyncNotificationKind,
	value: unknown,
): {
	url: string;
	secret?: string | null;
	events: AsyncNotificationEventType[];
} | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const url = resolveWebhookUrl(record.url);
	if (!url) return null;
	const secret = normalizeText(record.secret);
	const rawEvents = Array.isArray(record.events) ? record.events : [];
	const normalizedEvents = rawEvents
		.map((entry) => normalizeWebhookEvent(kind, entry))
		.filter((entry): entry is AsyncNotificationEventType => Boolean(entry));
	return {
		url,
		secret,
		events: normalizedEvents.length > 0 ? normalizedEvents : ["job.completed", "job.failed", "job.cancelled"],
	};
}

function normalizeProgressBucket(progress: number | null | undefined): number | null {
	if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
	if (progress <= 0 || progress >= 100) return null;
	const rounded = Math.round(progress);
	const bucket = Math.round(rounded / 10) * 10;
	return Math.max(5, Math.min(95, bucket));
}

function resolveKind(value: unknown): SupportedAsyncNotificationKind | null {
	const text = normalizeText(value)?.toLowerCase();
	return text === "video" || text === "batch" ? text : null;
}

export function resolveAsyncNotificationKind(value: unknown): SupportedAsyncNotificationKind | null {
	return resolveKind(value);
}

function resolveSpecificEvent(kind: SupportedAsyncNotificationKind, phase: AsyncNotificationPhase): AsyncNotificationEventType {
	return `${kind}.${phase}` as AsyncNotificationEventType;
}

function isWebhookEventSubscribed(args: {
	kind: SupportedAsyncNotificationKind;
	phase: AsyncNotificationPhase;
	configuredEvents: AsyncNotificationEventType[];
}): boolean {
	const generic = `job.${args.phase}` as AsyncNotificationEventType;
	const specific = resolveSpecificEvent(args.kind, args.phase);
	return args.configuredEvents.includes(generic) || args.configuredEvents.includes(specific);
}

function resolveVideoBilling(record: AsyncOperationRecord, meta: AsyncNotificationMeta) {
	const estimated = toFiniteNumber(meta.costUsd);
	const status = toPublicVideoStatus(record.status);
	const isVoided = status === "failed" || status === "cancelled" || status === "expired";
	const settled = status === "completed" ? estimated : isVoided ? 0 : null;
	return {
		currency: "usd",
		estimated_provider_cost: estimated != null ? estimated.toFixed(2) : null,
		estimated_user_cost: estimated != null ? estimated.toFixed(2) : null,
		settled_provider_cost: settled != null ? settled.toFixed(2) : null,
		settled_user_cost: settled != null ? settled.toFixed(2) : null,
		state: status === "completed" ? "settled" : isVoided ? "void" : "estimated",
		billable: status === "completed",
		...(record.billedAt ? { billed_at: record.billedAt } : {}),
	};
}

function toPublicBatchStatus(value: unknown): "pending" | "in_progress" | "completed" | "failed" | "cancelled" {
	const status = normalizeText(value)?.toLowerCase() ?? "";
	if (status === "completed") return "completed";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "failed" || status === "expired") return "failed";
	if (status === "in_progress" || status === "finalizing" || status === "cancelling") return "in_progress";
	return "pending";
}

function buildBatchPollingUrl(baseUrlOrRequestUrl: string, id: string): string {
	return new URL(`/v1/batches/${encodeURIComponent(id)}`, resolveNotificationBaseUrl(baseUrlOrRequestUrl)).toString();
}

function buildBatchCancelUrl(baseUrlOrRequestUrl: string, id: string): string {
	return new URL(
		`/v1/batches/${encodeURIComponent(id)}/cancel`,
		resolveNotificationBaseUrl(baseUrlOrRequestUrl),
	).toString();
}

function buildAsyncWebSocketUrl(baseUrlOrRequestUrl: string, kind: SupportedAsyncNotificationKind, id: string): string {
	const url = new URL(
		`/v1/async/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/ws`,
		resolveNotificationBaseUrl(baseUrlOrRequestUrl),
	);
	if (url.protocol === "https:") url.protocol = "wss:";
	if (url.protocol === "http:") url.protocol = "ws:";
	return url.toString();
}

async function buildVideoJobData(baseUrl: string, record: AsyncOperationRecord, meta: AsyncNotificationMeta, progress?: number | null) {
	const status = toPublicVideoStatus(record.status);
	const download = status === "completed"
		? await issueSignedVideoDownloadUrl({
			baseUrl,
			workspaceId: record.workspaceId,
			videoId: record.internalId,
			index: 0,
		})
		: null;
	return {
		id: record.internalId,
		object: "video",
		kind: "video",
		status,
		progress: typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : status === "completed" ? 100 : 0,
		provider: toPublicVideoProviderId(record.provider ?? normalizeText(meta.provider)),
		model: normalizeText(record.model) ?? normalizeText(meta.model),
		polling_url: buildVideoPollingUrl(baseUrl, record.internalId),
		websocket_url: buildAsyncWebSocketUrl(baseUrl, "video", record.internalId),
		content_url: buildVideoContentUrl(baseUrl, record.internalId, 0),
		download_url: download?.download_url ?? null,
		expires_at: download?.expires_at ?? null,
		duration_seconds: toFiniteNumber(meta.seconds),
		resolution: normalizeText(meta.resolution),
		quality: normalizeText(meta.quality),
		billing: resolveVideoBilling(record, meta),
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

function buildBatchJobData(baseUrl: string, record: AsyncOperationRecord, meta: AsyncNotificationMeta) {
	const status = toPublicBatchStatus(record.status ?? meta.status);
	const cancellable = status === "pending" || status === "in_progress";
	return {
		id: record.internalId,
		object: "batch",
		kind: "batch",
		status,
		provider: normalizeText(record.provider) ?? normalizeText(meta.provider),
		model: normalizeText(record.model) ?? normalizeText(meta.model),
		polling_url: buildBatchPollingUrl(baseUrl, record.internalId),
		websocket_url: buildAsyncWebSocketUrl(baseUrl, "batch", record.internalId),
		cancel_url: cancellable ? buildBatchCancelUrl(baseUrl, record.internalId) : null,
		endpoint: normalizeText(meta.endpoint),
		completion_window: normalizeText(meta.completionWindow) ?? normalizeText(meta.completion_window),
		input_file_id: normalizeText(meta.inputFileId) ?? normalizeText(meta.input_file_id),
		output_file_id: normalizeText(meta.outputFileId) ?? normalizeText(meta.output_file_id),
		error_file_id: normalizeText(meta.errorFileId) ?? normalizeText(meta.error_file_id),
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

export async function buildAsyncNotificationData(args: {
	baseUrl?: string | null;
	record: AsyncOperationRecord;
	progress?: number | null;
}): Promise<Record<string, unknown> | null> {
	const kind = resolveKind(args.record.kind);
	if (!kind) return null;
	const baseUrl = resolveNotificationBaseUrl(args.baseUrl ?? null);
	const meta = (args.record.meta ?? {}) as AsyncNotificationMeta;
	if (kind === "video") {
		return buildVideoJobData(baseUrl, args.record, meta, args.progress);
	}
	if (kind === "batch") {
		return buildBatchJobData(baseUrl, args.record, meta);
	}
	return null;
}

async function signWebhook(secret: string, timestamp: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
	return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sendAsyncWebhookRequest(args: {
	url: string;
	secret?: string | null;
	body: string;
}): Promise<AsyncWebhookRequestResult> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "AI-Stats-Async-Webhook/1.0",
	};
	if (args.secret) {
		const timestamp = String(Math.floor(Date.now() / 1000));
		headers["x-ai-stats-timestamp"] = timestamp;
		headers["x-ai-stats-signature"] = await signWebhook(args.secret, timestamp, args.body);
	}
	try {
		const response = await fetch(args.url, {
			method: "POST",
			headers,
			body: args.body,
		});
		const preview = await response.text().catch(() => "");
		if (!response.ok) {
			return {
				ok: false,
				statusCode: response.status,
				bodyPreview: preview.slice(0, 500) || null,
				errorMessage: `Webhook returned HTTP ${response.status}`,
			};
		}
		return {
			ok: true,
			statusCode: response.status,
			bodyPreview: preview.slice(0, 500) || null,
			errorMessage: null,
		};
	} catch (error) {
		return {
			ok: false,
			statusCode: null,
			bodyPreview: null,
			errorMessage: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function dispatchAsyncWebhookEvent(args: {
	workspaceId: string;
	kind: SupportedAsyncNotificationKind;
	internalId: string;
	phase: AsyncNotificationPhase;
	progress?: number | null;
	force?: boolean;
	baseUrl?: string | null;
}): Promise<boolean> {
	const record = await getAsyncOperation(args.workspaceId, args.kind, args.internalId);
	if (!record) return false;
	const meta = (record.meta ?? {}) as AsyncNotificationMeta;
	const webhook = parseAsyncWebhookConfig(args.kind, meta.webhook);
	if (!webhook) return false;
	if (!isWebhookEventSubscribed({ kind: args.kind, phase: args.phase, configuredEvents: webhook.events })) {
		return false;
	}
	const progressBucket = args.phase === "progress" ? normalizeProgressBucket(args.progress ?? null) : null;
	if (args.phase === "progress" && progressBucket == null) return false;
	const deliveries =
		meta.webhookDeliveries && typeof meta.webhookDeliveries === "object" && !Array.isArray(meta.webhookDeliveries)
			? (meta.webhookDeliveries as Record<string, string>)
			: {};
	const webhookAttempts = normalizeAsyncWebhookAttempts(
		meta.webhookAttempts ?? meta.webhook_attempts,
	);
	const retryQueue = normalizeAsyncWebhookRetryQueue(
		meta.webhookRetryQueue ?? meta.webhook_retry_queue,
	);
	const specificEvent = resolveSpecificEvent(args.kind, args.phase);
	const deliveryKey = progressBucket != null ? `${specificEvent}:${progressBucket}` : specificEvent;
	if (!args.force && deliveries[deliveryKey]) return false;
	if (!args.force && retryQueue[deliveryKey]) return false;
	const payload = {
		type: specificEvent,
		created_at: Math.floor(Date.now() / 1000),
		data: await buildAsyncNotificationData({
			baseUrl: args.baseUrl ?? null,
			record,
			progress: args.progress ?? null,
		}),
	};
	if (!payload.data) return false;
	const body = JSON.stringify(payload);
	const nowIso = new Date().toISOString();
	const existingRetry = retryQueue[deliveryKey];
	const attemptNumber = Math.max(1, (existingRetry?.attemptCount ?? 0) + 1);
	const requestResult = await sendAsyncWebhookRequest({
		url: webhook.url,
		secret: webhook.secret,
		body,
	});
	if (!requestResult.ok) {
		const nextRetryDelayMs = computeRetryDelayMsForAttempt(attemptNumber);
		const nextRetryAt = nextRetryDelayMs != null
			? new Date(Date.now() + nextRetryDelayMs).toISOString()
			: null;
		const status: AsyncWebhookAttemptStatus = nextRetryAt
			? "scheduled_retry"
			: "failed_permanently";
		const nextRetryQueue = { ...retryQueue };
		if (nextRetryAt) {
			nextRetryQueue[deliveryKey] = {
				deliveryKey,
				eventType: specificEvent,
				phase: args.phase,
				progress: progressBucket,
				attemptCount: attemptNumber,
				nextRetryAt,
				lastTriedAt: nowIso,
				lastStatusCode: requestResult.statusCode,
				lastErrorMessage: requestResult.errorMessage,
				responseBodyPreview: requestResult.bodyPreview,
			};
		} else {
			delete nextRetryQueue[deliveryKey];
		}
		const attempts = appendWebhookAttempt(webhookAttempts, {
			id: `${deliveryKey}:${attemptNumber}:${nowIso}`,
			delivery_key: deliveryKey,
			event_type: specificEvent,
			status,
			attempt_number: attemptNumber,
			max_attempts: MAX_WEBHOOK_ATTEMPTS,
			tried_at: nowIso,
			delivered_at: null,
			next_retry_at: nextRetryAt,
			response_status: requestResult.statusCode,
			error_message: requestResult.errorMessage,
			response_body_preview: requestResult.bodyPreview,
		});
		console.error("async_user_webhook_failed", {
			workspaceId: args.workspaceId,
			kind: args.kind,
			internalId: args.internalId,
			eventType: specificEvent,
			status: requestResult.statusCode,
			bodyPreview: requestResult.bodyPreview,
			errorMessage: requestResult.errorMessage,
			attemptNumber,
			nextRetryAt,
		});
		await patchAsyncOperationMeta({
			workspaceId: args.workspaceId,
			kind: args.kind,
			internalId: args.internalId,
			metaPatch: {
				webhookAttempts: attempts,
				webhookRetryQueue: nextRetryQueue,
				nextWebhookRetryAt: computeNextRetryAtFromQueue(nextRetryQueue),
				lastWebhookDispatchedAt: nowIso,
			},
		});
		return false;
	}
	const nextRetryQueue = { ...retryQueue };
	delete nextRetryQueue[deliveryKey];
	const attempts = appendWebhookAttempt(webhookAttempts, {
		id: `${deliveryKey}:${attemptNumber}:${nowIso}`,
		delivery_key: deliveryKey,
		event_type: specificEvent,
		status: "delivered",
		attempt_number: attemptNumber,
		max_attempts: MAX_WEBHOOK_ATTEMPTS,
		tried_at: nowIso,
		delivered_at: nowIso,
		next_retry_at: null,
		response_status: requestResult.statusCode,
		error_message: null,
		response_body_preview: requestResult.bodyPreview,
	});
	await patchAsyncOperationMeta({
		workspaceId: args.workspaceId,
		kind: args.kind,
		internalId: args.internalId,
		metaPatch: {
			webhookDeliveries: {
				...deliveries,
				[deliveryKey]: nowIso,
			},
			webhookAttempts: attempts,
			webhookRetryQueue: nextRetryQueue,
			nextWebhookRetryAt: computeNextRetryAtFromQueue(nextRetryQueue),
			...(progressBucket != null ? { lastWebhookProgress: progressBucket, lastWebhookProgressAt: new Date().toISOString() } : {}),
			lastWebhookDispatchedAt: nowIso,
		},
	});
	return true;
}

export function dispatchAsyncWebhookEventInBackground(args: {
	workspaceId: string;
	kind: SupportedAsyncNotificationKind;
	internalId: string;
	phase: AsyncNotificationPhase;
	progress?: number | null;
	force?: boolean;
	baseUrl?: string | null;
}) {
	dispatchBackground(
		dispatchAsyncWebhookEvent(args).catch((error) => {
			console.error("async_user_webhook_background_failed", {
				error,
				workspaceId: args.workspaceId,
				kind: args.kind,
				internalId: args.internalId,
				phase: args.phase,
			});
		}),
	);
}

export type AsyncWebhookRetrySummary = {
	startedAt: string;
	finishedAt: string;
	jobsScanned: number;
	deliveriesRetried: number;
	deliveriesSucceeded: number;
	deliveriesStillPending: number;
	deliveriesFailedPermanently: number;
};

export async function runAsyncWebhookRetriesJob(args?: {
	limitPerKind?: number;
	maxDeliveries?: number;
	baseUrl?: string | null;
}): Promise<AsyncWebhookRetrySummary> {
	const startedAt = new Date().toISOString();
	const limitPerKind = Math.max(1, Math.min(500, Math.trunc(args?.limitPerKind ?? 200)));
	const maxDeliveries = Math.max(1, Math.min(500, Math.trunc(args?.maxDeliveries ?? 100)));
	const nowMs = Date.now();
	const [videoRecords, batchRecords] = await Promise.all([
		listAsyncOperations({ kind: "video", limit: limitPerKind }),
		listAsyncOperations({ kind: "batch", limit: limitPerKind }),
	]);
	const allRecords = [...videoRecords, ...batchRecords];
	const dueDeliveries = allRecords.flatMap((record) => {
		const kind = resolveKind(record.kind);
		if (!kind) return [];
		const meta = (record.meta ?? {}) as AsyncNotificationMeta;
		const retryQueue = normalizeAsyncWebhookRetryQueue(
			meta.webhookRetryQueue ?? meta.webhook_retry_queue,
		);
		return Object.values(retryQueue)
			.filter((entry) => {
				const nextRetryAtMs = entry.nextRetryAt ? Date.parse(entry.nextRetryAt) : Number.NaN;
				return Number.isFinite(nextRetryAtMs) && nextRetryAtMs <= nowMs;
			})
			.map((entry) => ({
				workspaceId: record.workspaceId,
				kind,
				internalId: record.internalId,
				phase: entry.phase,
				progress: entry.progress,
				nextRetryAt: entry.nextRetryAt ?? "",
			}));
	})
		.sort((a, b) => a.nextRetryAt.localeCompare(b.nextRetryAt))
		.slice(0, maxDeliveries);

	let deliveriesSucceeded = 0;
	let deliveriesStillPending = 0;
	let deliveriesFailedPermanently = 0;

	for (const retry of dueDeliveries) {
		await dispatchAsyncWebhookEvent({
			workspaceId: retry.workspaceId,
			kind: retry.kind,
			internalId: retry.internalId,
			phase: retry.phase,
			progress: retry.progress,
			force: true,
			baseUrl: args?.baseUrl ?? null,
		});
		const record = await getAsyncOperation(retry.workspaceId, retry.kind, retry.internalId);
		const meta = (record?.meta ?? {}) as AsyncNotificationMeta;
		const retryQueue = normalizeAsyncWebhookRetryQueue(
			meta.webhookRetryQueue ?? meta.webhook_retry_queue,
		);
		const attempts = normalizeAsyncWebhookAttempts(
			meta.webhookAttempts ?? meta.webhook_attempts,
		);
		const latestAttempt = attempts[attempts.length - 1] ?? null;
		if (!record || !latestAttempt) continue;
		if (retryQueue[latestAttempt.delivery_key]) {
			deliveriesStillPending += 1;
		} else if (latestAttempt.status === "delivered") {
			deliveriesSucceeded += 1;
		} else if (latestAttempt.status === "failed_permanently") {
			deliveriesFailedPermanently += 1;
		}
	}

	return {
		startedAt,
		finishedAt: new Date().toISOString(),
		jobsScanned: allRecords.length,
		deliveriesRetried: dueDeliveries.length,
		deliveriesSucceeded,
		deliveriesStillPending,
		deliveriesFailedPermanently,
	};
}
