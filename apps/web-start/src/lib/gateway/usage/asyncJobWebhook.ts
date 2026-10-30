export type AsyncWebhookAttemptStatus =
	| "delivered"
	| "scheduled_retry"
	| "failed_permanently";

export interface AsyncJobWebhookAttemptRow {
	id: string;
	delivery_key: string;
	event_type: string;
	status: AsyncWebhookAttemptStatus;
	attempt_number: number;
	max_attempts: number;
	tried_at: string;
	delivered_at: string | null;
	next_retry_at: string | null;
	response_status: number | null;
	error_message: string | null;
	response_body_preview: string | null;
}

export interface AsyncJobWebhookSummaryRow {
	configured: boolean;
	url: string | null;
	events: string[];
	has_secret: boolean;
	delivered_events: number;
	delivered_event_types: string[];
	attempt_count: number;
	pending_retries: number;
	next_retry_at: string | null;
	last_attempt_at: string | null;
	last_attempt_status: AsyncWebhookAttemptStatus | null;
	last_response_status: number | null;
	last_delivered_at: string | null;
	last_failure_at: string | null;
	last_error_message: string | null;
}

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

function normalizeFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function parseWebhookRetryQueue(value: unknown): Array<{ next_retry_at: string | null }> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	return Object.values(value as Record<string, unknown>)
		.map((entry) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
			const record = entry as Record<string, unknown>;
			return {
				next_retry_at: normalizeIsoDate(record.nextRetryAt ?? record.next_retry_at),
			};
		})
		.filter((entry): entry is { next_retry_at: string | null } => Boolean(entry));
}

export function parseAsyncJobWebhookAttempts(value: unknown): AsyncJobWebhookAttemptRow[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry, index) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
			const record = entry as Record<string, unknown>;
			const eventType = normalizeText(record.event_type);
			const status = normalizeText(record.status) as AsyncWebhookAttemptStatus | null;
			const triedAt = normalizeIsoDate(record.tried_at);
			const attemptNumber = normalizeFiniteNumber(record.attempt_number);
			const maxAttempts = normalizeFiniteNumber(record.max_attempts);
			if (!eventType || !status || !triedAt || attemptNumber == null || maxAttempts == null) {
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
				response_status: normalizeFiniteNumber(record.response_status),
				error_message: normalizeText(record.error_message),
				response_body_preview: normalizeText(record.response_body_preview),
			};
		})
		.filter((entry): entry is AsyncJobWebhookAttemptRow => Boolean(entry))
		.sort((a, b) => b.tried_at.localeCompare(a.tried_at));
}

export function buildAsyncJobWebhookSummary(
	meta: Record<string, unknown> | null | undefined,
): AsyncJobWebhookSummaryRow {
	const webhook =
		meta?.webhook && typeof meta.webhook === "object" && !Array.isArray(meta.webhook)
			? (meta.webhook as Record<string, unknown>)
			: null;
	const delivery =
		webhook?.delivery && typeof webhook.delivery === "object" && !Array.isArray(webhook.delivery)
			? (webhook.delivery as Record<string, unknown>)
			: null;
	const attempts =
		Array.isArray(webhook?.attempts)
			? parseAsyncJobWebhookAttempts(webhook.attempts)
			: parseAsyncJobWebhookAttempts(meta?.webhookAttempts ?? meta?.webhook_attempts);
	const retryQueue = parseWebhookRetryQueue(meta?.webhookRetryQueue ?? meta?.webhook_retry_queue);
	const lastAttempt = attempts[0] ?? null;
	const lastDeliveredAttempt =
		attempts.find((attempt) => attempt.delivered_at != null) ?? null;
	const lastFailedAttempt =
		attempts.find((attempt) => attempt.status !== "delivered") ?? null;
	const rawDeliveredEventTypes =
		meta?.webhookDeliveries && typeof meta.webhookDeliveries === "object" && !Array.isArray(meta.webhookDeliveries)
			? Object.keys(meta.webhookDeliveries as Record<string, unknown>)
			: meta?.webhook_deliveries && typeof meta.webhook_deliveries === "object" && !Array.isArray(meta.webhook_deliveries)
				? Object.keys(meta.webhook_deliveries as Record<string, unknown>)
				: [];
	const deliveryEventTypes = Array.isArray(delivery?.delivered_event_types)
		? delivery.delivered_event_types
				.map((event) => normalizeText(event))
				.filter((event): event is string => Boolean(event))
		: rawDeliveredEventTypes
				.map((event) => normalizeText(event))
				.filter((event): event is string => Boolean(event))
				.sort((a, b) => a.localeCompare(b));
	const nextRetryAt =
		normalizeIsoDate(delivery?.next_retry_at) ??
		retryQueue
			.map((entry) => entry.next_retry_at)
			.filter((entry): entry is string => Boolean(entry))
			.sort((a, b) => a.localeCompare(b))[0] ??
		null;
	const events = Array.isArray(webhook?.events)
		? webhook.events
				.map((event) => normalizeText(event))
				.filter((event): event is string => Boolean(event))
		: [];
	const configured = Boolean(webhook?.url) || events.length > 0;
	return {
		configured,
		url: normalizeText(webhook?.url),
		events,
		has_secret:
			typeof webhook?.has_secret === "boolean"
				? webhook.has_secret
				: Boolean(normalizeText(webhook?.secret)),
		delivered_events:
			normalizeFiniteNumber(delivery?.delivered_events) ?? deliveryEventTypes.length,
		delivered_event_types: deliveryEventTypes,
		attempt_count:
			normalizeFiniteNumber(delivery?.total_attempts) ?? attempts.length,
		pending_retries:
			normalizeFiniteNumber(delivery?.pending_retries) ?? retryQueue.length,
		next_retry_at: nextRetryAt,
		last_attempt_at:
			normalizeIsoDate(delivery?.last_attempt_at) ?? lastAttempt?.tried_at ?? null,
		last_attempt_status:
			(normalizeText(delivery?.last_attempt_status) as AsyncWebhookAttemptStatus | null) ??
			lastAttempt?.status ??
			null,
		last_response_status:
			normalizeFiniteNumber(delivery?.last_response_status) ?? lastAttempt?.response_status ?? null,
		last_delivered_at:
			normalizeIsoDate(delivery?.last_delivered_at) ?? lastDeliveredAttempt?.delivered_at ?? null,
		last_failure_at:
			normalizeIsoDate(delivery?.last_failure_at) ?? lastFailedAttempt?.tried_at ?? null,
		last_error_message:
			normalizeText(delivery?.last_error_message) ?? lastFailedAttempt?.error_message ?? null,
	};
}
