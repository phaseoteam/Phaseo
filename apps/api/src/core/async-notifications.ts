import { dispatchBackground } from "@/runtime/env";
import {
	claimAsyncWebhookDelivery,
	completeAsyncWebhookDelivery,
	getAsyncOperation,
	listAsyncOperations,
	patchAsyncOperationMeta,
	releaseAsyncWebhookDeliveryClaim,
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
import {
	getWebhookEndpointSigningConfig,
	validateWebhookEndpointUrl,
	validateWebhookEndpointUrlForDelivery,
} from "@core/webhook-endpoints";

export type SupportedAsyncNotificationKind = "video" | "batch";
export type AsyncNotificationPhase = "created" | "progress" | "completed" | "failed" | "cancelled" | "expired";
export type AsyncNotificationEventType =
	| `job.${AsyncNotificationPhase}`
	| `video.${AsyncNotificationPhase}`
	| `batch.${AsyncNotificationPhase}`;
export type AsyncJobLifecycleStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
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
	const validated = validateWebhookEndpointUrl(value);
	return validated.ok ? validated.url : null;
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

function normalizePlainObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function normalizeAsyncUpstreamError(value: unknown): Record<string, unknown> | null {
	const record = normalizePlainObject(value);
	if (!record) return null;
	const normalized = {
		code: normalizeText(record.code),
		type: normalizeText(record.type),
		message: normalizeText(record.message),
		description: normalizeText(record.description),
		param: normalizeText(record.param),
		status: toFiniteNumber(record.status),
	};
	if (Object.values(normalized).every((entry) => entry == null)) return null;
	return normalized;
}

function normalizeAsyncFailureSample(value: unknown): Record<string, unknown>[] | null {
	if (!Array.isArray(value)) return null;
	const entries = value
		.map((entry) => {
			const record = normalizePlainObject(entry);
			if (!record) return null;
			const normalized = {
				provider: normalizeText(record.provider),
				type: normalizeText(record.type),
				status: toFiniteNumber(record.status),
				retryable: toBoolean(record.retryable),
				upstream_error_code: normalizeText(record.upstream_error_code),
				upstream_error_message: normalizeText(record.upstream_error_message),
				upstream_error_description: normalizeText(record.upstream_error_description),
				upstream_error_param: normalizeText(record.upstream_error_param),
			};
			if (Object.values(normalized).every((field) => field == null)) return null;
			return normalized;
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
	return entries.length > 0 ? entries : null;
}

function resolveAsyncErrorMeta(meta: AsyncNotificationMeta) {
	const errorRoot = normalizePlainObject(meta.error);
	return {
		upstreamError:
			normalizeAsyncUpstreamError(meta.upstreamError ?? meta.upstream_error) ??
			normalizeAsyncUpstreamError(errorRoot?.upstream_error) ??
			normalizeAsyncUpstreamError(errorRoot),
		providerFailureDiagnostics:
			normalizePlainObject(meta.providerFailureDiagnostics ?? meta.provider_failure_diagnostics) ??
			normalizePlainObject(errorRoot?.provider_failure_diagnostics),
		failureSample:
			normalizeAsyncFailureSample(meta.failureSample ?? meta.failure_sample) ??
			normalizeAsyncFailureSample(errorRoot?.failure_sample),
		routingDiagnostics:
			normalizePlainObject(meta.routingDiagnostics ?? meta.routing_diagnostics) ??
			normalizePlainObject(errorRoot?.routing_diagnostics),
		providerEnablement:
			normalizePlainObject(meta.providerEnablement ?? meta.provider_enablement) ??
			normalizePlainObject(errorRoot?.provider_enablement),
		providerCandidateDiagnostics:
			normalizePlainObject(meta.providerCandidateDiagnostics ?? meta.provider_candidate_diagnostics) ??
			normalizePlainObject(errorRoot?.provider_candidate_diagnostics),
	};
}

function sanitizePublicWebhookConfig(
	kind: SupportedAsyncNotificationKind,
	value: unknown,
): { endpoint_id?: string | null; url: string | null; events: AsyncNotificationEventType[]; has_secret: boolean } | null {
	const parsed = parseAsyncWebhookConfig(kind, value);
	if (!parsed) return null;
	return {
		endpoint_id: parsed.endpointId ?? null,
		url: parsed.url ?? null,
		events: parsed.events,
		has_secret: Boolean(parsed.secret) || Boolean(parsed.endpointId),
	};
}

function buildPublicWebhookDelivery(args: {
	deliveries: Record<string, string>;
	attempts: AsyncWebhookDeliveryAttempt[];
	retryQueue: AsyncWebhookRetryQueue;
}): Record<string, unknown> {
	const deliveredEventTypes = Object.entries(args.deliveries)
		.filter(([, deliveredAt]) => Boolean(normalizeIsoDate(deliveredAt)))
		.map(([deliveryKey]) => deliveryKey)
		.sort((a, b) => a.localeCompare(b));
	const lastAttempt = args.attempts[args.attempts.length - 1] ?? null;
	const lastDeliveredAttempt =
		[...args.attempts].reverse().find((attempt) => attempt.status === "delivered") ?? null;
	const lastFailedAttempt =
		[...args.attempts]
			.reverse()
			.find((attempt) => attempt.status === "scheduled_retry" || attempt.status === "failed_permanently") ?? null;
	return {
		total_attempts: args.attempts.length,
		delivered_events: deliveredEventTypes.length,
		delivered_event_types: deliveredEventTypes,
		pending_retries: Object.keys(args.retryQueue).length,
		next_retry_at: computeNextRetryAtFromQueue(args.retryQueue),
		last_attempt_at: lastAttempt?.tried_at ?? null,
		last_attempt_status: lastAttempt?.status ?? null,
		last_response_status: lastAttempt?.response_status ?? null,
		last_delivered_at: lastDeliveredAttempt?.delivered_at ?? null,
		last_failure_at: lastFailedAttempt?.tried_at ?? null,
		last_error_message: lastFailedAttempt?.error_message ?? null,
	};
}

export function buildPublicAsyncWebhook(
	kind: SupportedAsyncNotificationKind,
	value: unknown,
): Record<string, unknown> | null {
	const meta = normalizePlainObject(value);
	const configSource =
		meta?.webhook && typeof meta.webhook === "object" && !Array.isArray(meta.webhook)
			? meta.webhook
			: value;
	const config = sanitizePublicWebhookConfig(kind, configSource);
	const deliveries =
		meta?.webhookDeliveries && typeof meta.webhookDeliveries === "object" && !Array.isArray(meta.webhookDeliveries)
			? (meta.webhookDeliveries as Record<string, string>)
			: meta?.webhook_deliveries && typeof meta.webhook_deliveries === "object" && !Array.isArray(meta.webhook_deliveries)
				? (meta.webhook_deliveries as Record<string, string>)
				: {};
	const attempts = normalizeAsyncWebhookAttempts(
		meta?.webhookAttempts ?? meta?.webhook_attempts,
	);
	const retryQueue = normalizeAsyncWebhookRetryQueue(
		meta?.webhookRetryQueue ?? meta?.webhook_retry_queue,
	);
	if (!config && attempts.length === 0 && Object.keys(retryQueue).length === 0 && Object.keys(deliveries).length === 0) {
		return null;
	}
	return {
		endpoint_id: config?.endpoint_id ?? null,
		url: config?.url ?? null,
		events: config?.events ?? [],
		has_secret: config?.has_secret ?? false,
		delivery: buildPublicWebhookDelivery({
			deliveries,
			attempts,
			retryQueue,
		}),
		attempts,
	};
}

export function parseAsyncWebhookConfig(
	kind: SupportedAsyncNotificationKind,
	value: unknown,
): {
	endpointId?: string | null;
	url?: string | null;
	secret?: string | null;
	events: AsyncNotificationEventType[];
} | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const endpointId = normalizeText(record.endpoint_id ?? record.endpointId);
	const url = resolveWebhookUrl(record.url);
	if (!url && !endpointId) return null;
	const secret = normalizeText(record.secret);
	const rawEvents = Array.isArray(record.events) ? record.events : [];
	const normalizedEvents = rawEvents
		.map((entry) => normalizeWebhookEvent(kind, entry))
		.filter((entry): entry is AsyncNotificationEventType => Boolean(entry));
	const out: {
		endpointId?: string | null;
		url?: string | null;
		secret?: string | null;
		events: AsyncNotificationEventType[];
	} = {
		secret,
		events: normalizedEvents.length > 0 ? normalizedEvents : ["job.completed", "job.failed", "job.cancelled"],
	};
	if (endpointId) out.endpointId = endpointId;
	if (url) out.url = url;
	return out;
}

async function resolveAsyncWebhookConfig(args: {
	workspaceId: string;
	kind: SupportedAsyncNotificationKind;
	value: unknown;
}): Promise<{ url: string; secret?: string | null; events: AsyncNotificationEventType[] } | null> {
	const parsed = parseAsyncWebhookConfig(args.kind, args.value);
	if (!parsed) return null;
	if (parsed.endpointId) {
		const endpoint = await getWebhookEndpointSigningConfig({
			workspaceId: args.workspaceId,
			endpointId: parsed.endpointId,
		});
		if (!endpoint) return null;
		const endpointEvents = endpoint.events
			.map((entry) => normalizeWebhookEvent(args.kind, entry))
			.filter((entry): entry is AsyncNotificationEventType => Boolean(entry));
		return {
			url: endpoint.url,
			secret: endpoint.secret,
			events: parsed.events.length > 0 ? parsed.events : endpointEvents,
		};
	}
	if (!parsed.url) return null;
	return {
		url: parsed.url,
		secret: parsed.secret,
		events: parsed.events,
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
	const settledNanos = toFiniteNumber(meta.costNanos ?? meta.cost_nanos);
	const settledUsd =
		toFiniteNumber(meta.costUsd ?? meta.cost_usd) ??
		(settledNanos != null ? settledNanos / 1e9 : null);
	const estimated = settledUsd;
	const status = toPublicVideoStatus(record.status);
	const chargeReason = normalizeText(meta.billingReason ?? meta.billing_reason);
	const charged = toBoolean(meta.charged);
	const isVoided = status === "failed" || status === "cancelled" || status === "expired";
	const settled =
		status === "completed"
			? settledUsd
			: isVoided
				? 0
				: null;
	return {
		currency: "usd",
		estimated_provider_cost: estimated != null ? estimated.toFixed(2) : null,
		estimated_user_cost: estimated != null ? estimated.toFixed(2) : null,
		settled_provider_cost: settled != null ? settled.toFixed(2) : null,
		settled_user_cost: settled != null ? settled.toFixed(2) : null,
		state: status === "completed" ? "settled" : isVoided ? "void" : "estimated",
		billable: charged === true || status === "completed",
		total_nanos: settledNanos,
		charge_reason: chargeReason,
		charged,
		...(record.billedAt ? { billed_at: record.billedAt } : {}),
	};
}

function resolveBatchBilling(record: AsyncOperationRecord, meta: AsyncNotificationMeta) {
	const settledNanos = toFiniteNumber(meta.costNanos ?? meta.cost_nanos);
	const settledUsd =
		toFiniteNumber(meta.costUsd ?? meta.cost_usd) ??
		(settledNanos != null ? settledNanos / 1e9 : null);
	const status = toPublicBatchStatus(record.status ?? meta.status);
	const chargeReason = normalizeText(meta.billingReason ?? meta.billing_reason);
	const charged = toBoolean(meta.charged);
	const isVoided = status === "failed" || status === "cancelled";
	return {
		currency: "usd",
		settled_provider_cost: settledUsd != null ? settledUsd.toFixed(2) : null,
		settled_user_cost: settledUsd != null ? settledUsd.toFixed(2) : null,
		state:
			settledUsd != null
				? "settled"
				: isVoided
					? "void"
					: "pending",
		billable: charged === true || (settledNanos != null && settledNanos > 0),
		total_nanos: settledNanos,
		charge_reason: chargeReason,
		charged,
		...(record.billedAt ? { billed_at: record.billedAt } : {}),
	};
}

function resolveBatchRequestCounts(meta: AsyncNotificationMeta): {
	total: number | null;
	completed: number | null;
	failed: number | null;
} | null {
	const counts =
		meta.requestCounts && typeof meta.requestCounts === "object" && !Array.isArray(meta.requestCounts)
			? (meta.requestCounts as Record<string, unknown>)
			: meta.request_counts && typeof meta.request_counts === "object" && !Array.isArray(meta.request_counts)
				? (meta.request_counts as Record<string, unknown>)
				: null;
	if (!counts) return null;
	return {
		total: toFiniteNumber(counts.total),
		completed: toFiniteNumber(counts.completed),
		failed: toFiniteNumber(counts.failed),
	};
}

function resolveBatchPricingLines(meta: AsyncNotificationMeta): Record<string, unknown>[] {
	const directLines =
		meta.pricingLines && Array.isArray(meta.pricingLines)
			? meta.pricingLines
			: meta.pricing_lines && Array.isArray(meta.pricing_lines)
				? meta.pricing_lines
				: meta.pricedUsage &&
					  typeof meta.pricedUsage === "object" &&
					  !Array.isArray(meta.pricedUsage) &&
					  (meta.pricedUsage as Record<string, unknown>).pricing &&
					  typeof (meta.pricedUsage as Record<string, unknown>).pricing === "object" &&
					  !Array.isArray((meta.pricedUsage as Record<string, unknown>).pricing) &&
					  Array.isArray(((meta.pricedUsage as Record<string, unknown>).pricing as Record<string, unknown>).lines)
					? (((meta.pricedUsage as Record<string, unknown>).pricing as Record<string, unknown>).lines as unknown[])
					: meta.priced_usage &&
						  typeof meta.priced_usage === "object" &&
						  !Array.isArray(meta.priced_usage) &&
						  (meta.priced_usage as Record<string, unknown>).pricing &&
						  typeof (meta.priced_usage as Record<string, unknown>).pricing === "object" &&
						  !Array.isArray((meta.priced_usage as Record<string, unknown>).pricing) &&
						  Array.isArray(((meta.priced_usage as Record<string, unknown>).pricing as Record<string, unknown>).lines)
						? (((meta.priced_usage as Record<string, unknown>).pricing as Record<string, unknown>).lines as unknown[])
						: null;
	if (directLines) {
		return directLines.filter(
			(line): line is Record<string, unknown> =>
				Boolean(line) && typeof line === "object" && !Array.isArray(line),
		);
	}

	const totalNanos = toFiniteNumber(meta.costNanos ?? meta.cost_nanos);
	if (totalNanos == null) return [];

	const requestCounts = resolveBatchRequestCounts(meta);
	const pricingBreakdown =
		meta.pricingBreakdown && typeof meta.pricingBreakdown === "object" && !Array.isArray(meta.pricingBreakdown)
			? (meta.pricingBreakdown as Record<string, unknown>)
			: meta.pricing_breakdown && typeof meta.pricing_breakdown === "object" && !Array.isArray(meta.pricing_breakdown)
				? (meta.pricing_breakdown as Record<string, unknown>)
				: null;

	return [
		{
			dimension: "batch_requests",
			pricing_plan: "batch",
			service_tier: "batch",
			endpoint: normalizeText(meta.endpoint),
			units:
				requestCounts?.completed ??
				requestCounts?.total ??
				null,
			total_nanos: totalNanos,
			total_usd_str:
				typeof meta.costUsd === "number"
					? meta.costUsd.toFixed(9)
					: typeof meta.cost_usd === "number"
						? meta.cost_usd.toFixed(9)
						: normalizeText(pricingBreakdown?.total_usd_str),
		},
	];
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

export function buildAsyncWebSocketUrl(baseUrlOrRequestUrl: string, kind: SupportedAsyncNotificationKind, id: string): string {
	const url = new URL(
		`/v1/async/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/ws`,
		resolveNotificationBaseUrl(baseUrlOrRequestUrl),
	);
	if (url.protocol === "https:") url.protocol = "wss:";
	if (url.protocol === "http:") url.protocol = "ws:";
	return url.toString();
}

export function toAsyncLifecycleStatus(status: string): AsyncJobLifecycleStatus {
	switch (status) {
		case "completed":
			return "completed";
		case "failed":
		case "expired":
			return "failed";
		case "cancelled":
			return "cancelled";
		case "processing":
		case "in_progress":
			return "running";
		default:
			return "pending";
	}
}

async function buildVideoJobData(baseUrl: string, record: AsyncOperationRecord, meta: AsyncNotificationMeta, progress?: number | null) {
	const status = toPublicVideoStatus(record.status);
	const errorMeta = resolveAsyncErrorMeta(meta);
	const webhook = buildPublicAsyncWebhook("video", meta);
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
		lifecycle_status: toAsyncLifecycleStatus(status),
		request_id: normalizeText(record.requestId),
		native_id: normalizeText(record.nativeId),
		session_id: normalizeText(record.sessionId),
		app_id: normalizeText(record.appId),
		progress: typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : status === "completed" ? 100 : 0,
		provider: toPublicVideoProviderId(record.provider ?? normalizeText(meta.provider)),
		model: normalizeText(record.model) ?? normalizeText(meta.model),
		polling_url: buildVideoPollingUrl(baseUrl, record.internalId),
		websocket_url: buildAsyncWebSocketUrl(baseUrl, "video", record.internalId),
		content_url: buildVideoContentUrl(baseUrl, record.internalId, 0),
		download_url: download?.download_url ?? null,
		expires_at: download?.expires_at ?? null,
		duration_seconds: toFiniteNumber(meta.seconds),
		duration_ms: toFiniteNumber(meta.durationMs ?? meta.duration_ms),
		total_duration_ms: toFiniteNumber(meta.durationMs ?? meta.duration_ms),
		latency_ms: toFiniteNumber(meta.latencyMs ?? meta.latency_ms),
		generation_ms: toFiniteNumber(meta.generationMs ?? meta.generation_ms),
		resolution: normalizeText(meta.resolution),
		quality: normalizeText(meta.quality),
		output_access: normalizeText(meta.outputAccess ?? meta.output_access),
		...(webhook ? { webhook } : {}),
		key_source: normalizeText(meta.keySource ?? meta.key_source),
		byok_key_id: normalizeText(meta.byokKeyId ?? meta.byok_key_id),
		reservation_id: normalizeText(meta.reservationId ?? meta.reservation_id),
		reservation_status: normalizeText(meta.reservationStatus ?? meta.reservation_status),
		next_webhook_retry_at: normalizeIsoDate(meta.nextWebhookRetryAt ?? meta.next_webhook_retry_at),
		last_webhook_progress: toFiniteNumber(meta.lastWebhookProgress ?? meta.last_webhook_progress),
		last_webhook_progress_at: normalizeIsoDate(meta.lastWebhookProgressAt ?? meta.last_webhook_progress_at),
		last_webhook_dispatched_at: normalizeIsoDate(meta.lastWebhookDispatchedAt ?? meta.last_webhook_dispatched_at),
		finalized_at: normalizeIsoDate(meta.finalizedAt ?? meta.finalized_at),
		last_polled_at: normalizeIsoDate(meta.lastPolledAt ?? meta.last_polled_at),
		polled_status: normalizeText(meta.polledStatus ?? meta.polled_status),
		last_reconciled_at: normalizeIsoDate(meta.lastReconciledAt ?? meta.last_reconciled_at),
		upstream_error: errorMeta.upstreamError,
		provider_failure_diagnostics: errorMeta.providerFailureDiagnostics,
		failure_sample: errorMeta.failureSample,
		routing_diagnostics: errorMeta.routingDiagnostics,
		provider_enablement: errorMeta.providerEnablement,
		provider_candidate_diagnostics: errorMeta.providerCandidateDiagnostics,
		pricing_breakdown:
			meta.pricingBreakdown && typeof meta.pricingBreakdown === "object" && !Array.isArray(meta.pricingBreakdown)
				? meta.pricingBreakdown
				: meta.pricing_breakdown && typeof meta.pricing_breakdown === "object" && !Array.isArray(meta.pricing_breakdown)
					? meta.pricing_breakdown
					: null,
		billing: resolveVideoBilling(record, meta),
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

function buildBatchJobData(baseUrl: string, record: AsyncOperationRecord, meta: AsyncNotificationMeta) {
	const status = toPublicBatchStatus(record.status ?? meta.status);
	const cancellable = status === "pending" || status === "in_progress";
	const requestCounts = resolveBatchRequestCounts(meta);
	const errorMeta = resolveAsyncErrorMeta(meta);
	const webhook = buildPublicAsyncWebhook("batch", meta);
	return {
		id: record.internalId,
		object: "batch",
		kind: "batch",
		status,
		lifecycle_status: toAsyncLifecycleStatus(status),
		request_id: normalizeText(record.requestId),
		session_id: normalizeText(record.sessionId),
		app_id: normalizeText(record.appId),
		native_id: normalizeText(record.nativeId),
		provider: normalizeText(record.provider) ?? normalizeText(meta.provider),
		model: normalizeText(record.model) ?? normalizeText(meta.model),
		polling_url: buildBatchPollingUrl(baseUrl, record.internalId),
		websocket_url: buildAsyncWebSocketUrl(baseUrl, "batch", record.internalId),
		cancel_url: cancellable ? buildBatchCancelUrl(baseUrl, record.internalId) : null,
		...(webhook ? { webhook } : {}),
		endpoint: normalizeText(meta.endpoint),
		completion_window: normalizeText(meta.completionWindow) ?? normalizeText(meta.completion_window),
		input_file_id: normalizeText(meta.inputFileId) ?? normalizeText(meta.input_file_id),
		output_file_id: normalizeText(meta.outputFileId) ?? normalizeText(meta.output_file_id),
		error_file_id: normalizeText(meta.errorFileId) ?? normalizeText(meta.error_file_id),
		key_source: normalizeText(meta.keySource ?? meta.key_source),
		byok_key_id: normalizeText(meta.byokKeyId ?? meta.byok_key_id),
		pricing_lines: resolveBatchPricingLines(meta),
		next_webhook_retry_at: normalizeIsoDate(meta.nextWebhookRetryAt ?? meta.next_webhook_retry_at),
		last_webhook_progress: toFiniteNumber(meta.lastWebhookProgress ?? meta.last_webhook_progress),
		last_webhook_progress_at: normalizeIsoDate(meta.lastWebhookProgressAt ?? meta.last_webhook_progress_at),
		last_webhook_dispatched_at: normalizeIsoDate(meta.lastWebhookDispatchedAt ?? meta.last_webhook_dispatched_at),
		finalized_at: normalizeIsoDate(meta.finalizedAt ?? meta.finalized_at),
		request_counts: requestCounts,
		upstream_error: errorMeta.upstreamError,
		provider_failure_diagnostics: errorMeta.providerFailureDiagnostics,
		failure_sample: errorMeta.failureSample,
		routing_diagnostics: errorMeta.routingDiagnostics,
		provider_enablement: errorMeta.providerEnablement,
		provider_candidate_diagnostics: errorMeta.providerCandidateDiagnostics,
		billing: resolveBatchBilling(record, meta),
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
	eventId: string;
	eventType: AsyncNotificationEventType;
	deliveryKey: string;
	attemptNumber: number;
	maxAttempts: number;
}): Promise<AsyncWebhookRequestResult> {
	const validatedUrl = await validateWebhookEndpointUrlForDelivery(args.url);
	if (validatedUrl.ok === false) {
		return {
			ok: false,
			statusCode: null,
			bodyPreview: null,
			errorMessage: `Webhook URL rejected: ${validatedUrl.reason}`,
		};
	}
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "Phaseo-Async-Webhook/1.0",
		"x-phaseo-event-id": args.eventId,
		"x-phaseo-event-type": args.eventType,
		"x-phaseo-delivery-key": args.deliveryKey,
		"x-phaseo-attempt": String(args.attemptNumber),
		"x-phaseo-max-attempts": String(args.maxAttempts),
	};
	if (args.secret) {
		const timestamp = String(Math.floor(Date.now() / 1000));
		headers["x-phaseo-timestamp"] = timestamp;
		headers["x-phaseo-signature"] = await signWebhook(args.secret, timestamp, args.body);
	}
	try {
		const response = await fetch(validatedUrl.url, {
			method: "POST",
			headers,
			body: args.body,
			redirect: "manual",
		});
		if (response.status >= 300 && response.status < 400) {
			return {
				ok: false,
				statusCode: response.status,
				bodyPreview: null,
				errorMessage: "Webhook redirects are not allowed",
			};
		}
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
	const webhook = await resolveAsyncWebhookConfig({
		workspaceId: args.workspaceId,
		kind: args.kind,
		value: meta.webhook,
	});
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
	const claimToken = crypto.randomUUID();
	const claimed = await claimAsyncWebhookDelivery({
		workspaceId: args.workspaceId,
		kind: args.kind,
		internalId: args.internalId,
		deliveryKey,
		claimToken,
	});
	if (!claimed) return false;
	const eventId = `evt_${args.kind}_${args.internalId}_${deliveryKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
	const attemptNumber = Math.max(1, (retryQueue[deliveryKey]?.attemptCount ?? 0) + 1);
	const payload = {
		id: eventId,
		type: specificEvent,
		created_at: Math.floor(Date.now() / 1000),
		delivery: {
			key: deliveryKey,
			attempt: attemptNumber,
			max_attempts: MAX_WEBHOOK_ATTEMPTS,
		},
		data: await buildAsyncNotificationData({
			baseUrl: args.baseUrl ?? null,
			record,
			progress: progressBucket ?? args.progress ?? null,
		}),
	};
	if (!payload.data) {
		await releaseAsyncWebhookDeliveryClaim({
			workspaceId: args.workspaceId,
			kind: args.kind,
			internalId: args.internalId,
			deliveryKey,
			claimToken,
		}).catch(() => null);
		return false;
	}
	const body = JSON.stringify(payload);
	const nowIso = new Date().toISOString();
	const requestResult = await sendAsyncWebhookRequest({
		url: webhook.url,
		secret: webhook.secret,
		body,
		eventId,
		eventType: specificEvent,
		deliveryKey,
		attemptNumber,
		maxAttempts: MAX_WEBHOOK_ATTEMPTS,
	});
	if (!requestResult.ok) {
		await releaseAsyncWebhookDeliveryClaim({
			workspaceId: args.workspaceId,
			kind: args.kind,
			internalId: args.internalId,
			deliveryKey,
			claimToken,
		}).catch((error) => console.error("async_user_webhook_claim_release_failed", { error, deliveryKey }));
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
	const completedClaim = await completeAsyncWebhookDelivery({
		workspaceId: args.workspaceId,
		kind: args.kind,
		internalId: args.internalId,
		deliveryKey,
		claimToken,
	});
	if (!completedClaim) {
		console.error("async_user_webhook_claim_completion_failed", {
			workspaceId: args.workspaceId,
			kind: args.kind,
			internalId: args.internalId,
			deliveryKey,
		});
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
