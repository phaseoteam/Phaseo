// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";
import { generatePublicId } from "@pipeline/before/genId";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import {
	buildAsyncWebSocketUrl,
	buildPublicAsyncWebhook,
	dispatchAsyncWebhookEventInBackground,
	parseAsyncWebhookConfig,
	toAsyncLifecycleStatus,
} from "@core/async-notifications";
import {
	getBatchJobMeta,
	listTeamBatchJobs,
	saveBatchFileMeta,
	saveBatchJobMeta,
	type BatchJobMeta,
	type BatchJobRecord,
} from "@core/batch-jobs";
import { finalizeBatchJob, type FinalizeBatchJobResult } from "@core/batch-finalization";
import { reserveBatchCredits } from "@core/batch-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { fetchCatalogue } from "../control/models.catalogue";

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_BASE_URL = "https://api.openai.com";
const OPENAI_BATCH_ENDPOINTS = [
	"/v1/responses",
	"/v1/chat/completions",
	"/v1/embeddings",
	"/v1/completions",
	"/v1/moderations",
	"/v1/images/generations",
	"/v1/images/edits",
	"/v1/videos",
] as const;
const OPENAI_BATCH_ENDPOINT_SET = new Set<string>(OPENAI_BATCH_ENDPOINTS);

export function isBatchApiEnabled(raw: unknown): boolean {
	const normalized = String(raw ?? "").trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveOpenAiBaseUrl(bindings: Record<string, string | undefined>): string {
	const base = String(bindings.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
	return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function normalizeOpenAiBatchEndpoint(endpoint: unknown): string | null {
	const text = toText(endpoint);
	if (!text) return null;
	try {
		const url = new URL(text, "https://gateway.local");
		const path = url.pathname.replace(/\/+$/, "") || "/";
		return /^\/v1(?=\/|$)/i.test(path) ? path : `/v1${path.startsWith("/") ? path : `/${path}`}`;
	} catch {
		const path = text.replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "") || "/";
		return /^\/v1(?=\/|$)/i.test(path) ? path : `/v1${path.startsWith("/") ? path : `/${path}`}`;
	}
}

function buildBatchEndpointValidationError(args: {
	endpoint: unknown;
	requestId: string;
	workspaceId: string;
}): Response | null {
	const normalizedEndpoint = normalizeOpenAiBatchEndpoint(args.endpoint);
	if (!normalizedEndpoint) {
		return err("validation_error", {
			reason: "batch_missing_endpoint",
			request_id: args.requestId,
			workspace_id: args.workspaceId,
			supported_endpoints: [...OPENAI_BATCH_ENDPOINTS],
		});
	}
	if (!OPENAI_BATCH_ENDPOINT_SET.has(normalizedEndpoint)) {
		return err("validation_error", {
			reason: "batch_unsupported_endpoint",
			endpoint: normalizedEndpoint,
			request_id: args.requestId,
			workspace_id: args.workspaceId,
			supported_endpoints: [...OPENAI_BATCH_ENDPOINTS],
		});
	}
	return null;
}

function batchAsyncPersistenceFailureResponse(args: {
	message: string;
	batchId: string;
	nativeBatchId?: string | null;
	status?: string | null;
	reservationId?: string | null;
	reservationStatus?: string | null;
}): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "async_job_persistence_failed",
				message: args.message,
				batch_id: args.batchId,
				native_batch_id: args.nativeBatchId ?? args.batchId,
				status: args.status ?? null,
				reservation_id: args.reservationId ?? null,
				reservation_status: args.reservationStatus ?? null,
			},
		}),
		{ status: 502, headers: { "Content-Type": "application/json" } },
	);
}

function toText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toIsoDate(value: unknown): string | null {
	const text = toText(value);
	if (!text) return null;
	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function normalizeBatchStatus(value: unknown): string | null {
	const text = toText(value)?.toLowerCase() ?? null;
	if (text === "canceled") return "cancelled";
	return text;
}

function isTerminalBatchStatusValue(status: string | null): boolean {
	return status === "completed" || status === "failed" || status === "expired" || status === "cancelled";
}

function resolveMergedBatchStatus(payload: any, base: BatchJobMeta): string | null {
	const incomingText = toText(payload?.status);
	const incomingStatus = normalizeBatchStatus(incomingText);
	const currentStatus = normalizeBatchStatus(base.status);
	if (isTerminalBatchStatusValue(currentStatus) && incomingStatus && incomingStatus !== currentStatus) {
		console.warn("batch_stale_terminal_status_ignored", {
			nativeBatchId: toText(payload?.id) ?? base.nativeBatchId ?? null,
			currentStatus,
			incomingStatus,
		});
		return base.status ?? currentStatus;
	}
	return incomingText ?? base.status ?? null;
}

function toJsonResponse(upstream: Response): Response {
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: upstream.headers,
	});
}

function toDecoratedJsonResponse(upstream: Response, payload: unknown): Response {
	const headers = new Headers(upstream.headers);
	headers.set("Content-Type", "application/json");
	return new Response(JSON.stringify(payload), {
		status: upstream.status,
		statusText: upstream.statusText,
		headers,
	});
}

async function parseUpstreamJson(response: Response): Promise<any | null> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return null;
	return response.clone().json().catch(() => null);
}

function batchMetaFromPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = toText(payload?.id);
	const status = resolveMergedBatchStatus(payload, base);
	return {
		...base,
		status,
		model: toText(payload?.model) ?? base.model ?? null,
		nativeBatchId: id ?? base.nativeBatchId ?? null,
		endpoint: toText(payload?.endpoint) ?? base.endpoint ?? null,
		completionWindow: toText(payload?.completion_window) ?? base.completionWindow ?? null,
		inputFileId: toText(payload?.input_file_id) ?? base.inputFileId ?? null,
		outputFileId: toText(payload?.output_file_id) ?? base.outputFileId ?? null,
		errorFileId: toText(payload?.error_file_id) ?? base.errorFileId ?? null,
		requestCounts:
			payload?.request_counts && typeof payload.request_counts === "object" && !Array.isArray(payload.request_counts)
				? {
					total: typeof payload.request_counts.total === "number" ? payload.request_counts.total : null,
					completed: typeof payload.request_counts.completed === "number" ? payload.request_counts.completed : null,
					failed: typeof payload.request_counts.failed === "number" ? payload.request_counts.failed : null,
				}
				: base.requestCounts ?? null,
		lastPolledAt: new Date().toISOString(),
		polledStatus: normalizeBatchStatus(status) ?? status,
	};
}

function resolveBatchProgressPercentFromCounts(meta: BatchJobMeta | null | undefined): number | null {
	const counts = meta?.requestCounts;
	const total = toFiniteNumber(counts?.total);
	if (total == null || total <= 0) return null;
	const completed = Math.max(0, toFiniteNumber(counts?.completed) ?? 0);
	const failed = Math.max(0, toFiniteNumber(counts?.failed) ?? 0);
	const finished = Math.max(0, Math.min(total, completed + failed));
	const progress = Math.round((finished / total) * 100);
	return Math.max(0, Math.min(100, progress));
}

function buildBatchPricingLines(meta: BatchJobMeta | null | undefined): Record<string, unknown>[] {
	const lines = (meta?.pricedUsage as any)?.pricing?.lines;
	if (Array.isArray(lines)) {
		const filtered = lines.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object");
		if (filtered.length > 0) return filtered;
	}
	const totalNanos = typeof meta?.costNanos === "number" ? meta.costNanos : null;
	if (totalNanos == null) return [];
	return [
		{
			dimension: "batch_requests",
			pricing_plan: "batch",
			service_tier: "batch",
			endpoint: meta?.endpoint ?? null,
			units:
				typeof meta?.requestCounts?.completed === "number"
					? meta.requestCounts.completed
					: typeof meta?.requestCounts?.total === "number"
						? meta.requestCounts.total
						: null,
			total_nanos: totalNanos,
			total_usd_str:
				typeof meta?.costUsd === "number"
					? meta.costUsd.toFixed(9)
					: typeof (meta?.pricingBreakdown as any)?.total_usd_str === "string"
						? (meta?.pricingBreakdown as any).total_usd_str
						: null,
		},
	];
}

function getEstimatedUsage(meta: BatchJobMeta | null | undefined): Record<string, unknown> | null {
	return meta?.estimatedUsage && typeof meta.estimatedUsage === "object" && !Array.isArray(meta.estimatedUsage)
		? meta.estimatedUsage
		: null;
}

function buildBatchBilling(
	meta: BatchJobMeta | null | undefined,
	finalization?: FinalizeBatchJobResult | null,
): Record<string, unknown> | null {
	const hasStoredBilling =
		typeof meta?.charged === "boolean" ||
		typeof meta?.billingReason === "string" ||
		typeof meta?.costNanos === "number" ||
		typeof meta?.costUsd === "number" ||
		typeof meta?.finalizedAt === "string" ||
		Boolean(meta?.pricingBreakdown) ||
		Boolean(meta?.estimatedUsage) ||
		typeof meta?.reservedNanos === "number" ||
		typeof meta?.reservationStatus === "string";
	if (!hasStoredBilling && !finalization) return null;
	const status = String(meta?.status ?? "").trim().toLowerCase();
	const isVoided =
		status === "failed" ||
		status === "expired" ||
		status === "cancelled" ||
		status === "canceled";
	const estimatedUsage = getEstimatedUsage(meta);
	const estimatedPricing =
		estimatedUsage?.pricing && typeof estimatedUsage.pricing === "object" && !Array.isArray(estimatedUsage.pricing)
			? (estimatedUsage.pricing as Record<string, unknown>)
			: null;
	const estimatedNanos =
		typeof meta?.reservedNanos === "number"
			? meta.reservedNanos
			: toFiniteNumber(estimatedPricing?.total_nanos);
	const settledNanos = typeof meta?.costNanos === "number" ? meta.costNanos : null;
	const estimatedUsd = estimatedNanos != null ? Math.max(0, estimatedNanos) / 1e9 : null;
	const settledUsd =
		typeof meta?.costUsd === "number"
			? meta.costUsd
			: settledNanos != null
				? Math.max(0, settledNanos) / 1e9
				: isVoided
					? 0
					: null;
	return {
		currency: "usd",
		billed:
			typeof finalization?.billed === "boolean"
				? finalization.billed
				: typeof meta?.finalizedAt === "string" || typeof meta?.billingReason === "string",
		charged: typeof finalization?.charged === "boolean" ? finalization.charged : Boolean(meta?.charged),
		reason: finalization?.reason ?? meta?.billingReason ?? null,
		state:
			isVoided
				? "void"
				: typeof meta?.costNanos === "number"
					? "settled"
					: meta?.reservationStatus === "held"
						? "estimated"
						: "pending",
		reservation_id: meta?.reservationId ?? null,
		reservation_status: meta?.reservationStatus ?? null,
		estimated_provider_cost: estimatedUsd != null ? estimatedUsd.toFixed(2) : null,
		estimated_user_cost: estimatedUsd != null ? estimatedUsd.toFixed(2) : null,
		settled_provider_cost: settledUsd != null ? settledUsd.toFixed(2) : null,
		settled_user_cost: settledUsd != null ? settledUsd.toFixed(2) : null,
		estimated_nanos: estimatedNanos,
		reserved_nanos: estimatedNanos,
		estimation_truncated: estimatedUsage?.estimation_truncated === true ? true : null,
		estimation_sample_size: toFiniteNumber(estimatedUsage?.estimation_sample_size),
		estimation_total_rows: toFiniteNumber(estimatedUsage?.estimation_total_rows),
		total_nanos: settledNanos,
		cost_nanos: settledNanos,
		cost_usd: typeof meta?.costUsd === "number" ? meta.costUsd : null,
		finalized_at: meta?.finalizedAt ?? null,
		pricing_breakdown:
			meta?.pricingBreakdown && typeof meta.pricingBreakdown === "object" && !Array.isArray(meta.pricingBreakdown)
				? meta.pricingBreakdown
				: null,
	};
}

function buildBatchPollingUrl(requestUrl: string, batchId: string): string {
	const url = new URL(requestUrl);
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments[segments.length - 1] === "cancel") {
		segments.pop();
	}
	if (segments[segments.length - 1] !== batchId) {
		segments.push(batchId);
	}
	url.pathname = `/${segments.join("/")}`;
	url.search = "";
	url.hash = "";
	return url.toString();
}

function buildBatchCancelUrl(requestUrl: string, batchId: string): string {
	return new URL(`${buildBatchPollingUrl(requestUrl, batchId).replace(/\/+$/, "")}/cancel`).toString();
}

function isCancellableBatchStatus(status: string): boolean {
	switch (status.toLowerCase()) {
		case "queued":
		case "pending":
		case "validating":
		case "in_progress":
		case "cancelling":
			return true;
		default:
			return false;
	}
}

function isBatchCancelSupportedProvider(value: unknown): boolean {
	const provider = toText(value)?.toLowerCase();
	return provider === OPENAI_PROVIDER_ID;
}

function buildBatchReservationGateError(args: {
	reservation: Awaited<ReturnType<typeof reserveBatchCredits>>;
	requestId: string;
	workspaceId: string;
}): Response | null {
	switch (args.reservation.status) {
		case "skip_missing_input_file":
			return err("validation_error", {
				reason: "batch_reservation_missing_input_file",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		case "skip_empty_input":
			return err("validation_error", {
				reason: "batch_reservation_empty_input_file",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		case "skip_invalid_input_row":
			return err("validation_error", {
				reason: "batch_reservation_invalid_input_row",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		case "skip_missing_model":
			return err("validation_error", {
				reason: "batch_reservation_missing_model",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		case "skip_input_unavailable":
			return err("gateway_error", {
				reason: "batch_reservation_input_unavailable",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		case "skip_price_card_missing":
			return err("gateway_error", {
				reason: "batch_reservation_pricing_unavailable",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		case "skip_unsupported_endpoint":
			return err("validation_error", {
				reason: "batch_reservation_unsupported_endpoint",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
				supported_endpoints: [...OPENAI_BATCH_ENDPOINTS],
			});
		case "skip_missing_video_seconds":
			return err("validation_error", {
				reason: "batch_reservation_missing_video_duration",
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			});
		default:
			return null;
	}
}

function isInsufficientBatchReservationStatus(status: unknown): boolean {
	const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
	return normalized === "insufficient_funds" || normalized === "insufficient_balance";
}

function parseBatchListLimit(url: URL): number {
	const raw = Number(url.searchParams.get("limit") ?? "");
	if (!Number.isFinite(raw)) return 20;
	return Math.max(1, Math.min(100, Math.trunc(raw)));
}

function parseBatchListStatuses(url: URL): string[] {
	const rawValues = [
		...url.searchParams.getAll("status"),
		...String(url.searchParams.get("statuses") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	].flatMap((value) =>
		String(value)
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
	);
	const normalized = rawValues.flatMap((value) => {
		switch (value.trim().toLowerCase()) {
			case "queued":
			case "pending":
				return ["pending", "queued", "validating"];
			case "running":
			case "in_progress":
			case "processing":
				return ["in_progress", "finalizing", "cancelling"];
			case "completed":
				return ["completed"];
			case "expired":
				return ["expired"];
			case "failed":
				return ["failed"];
			case "cancelled":
			case "canceled":
				return ["cancelled", "canceled"];
			default:
				return [];
		}
	});
	return Array.from(new Set(normalized));
}

function parseModelQueryValues(url: URL, name: string): string[] {
	return Array.from(new Set(url.searchParams.getAll(name).flatMap((value) =>
		String(value)
			.split(",")
			.map((part) => part.trim())
			.filter((part) => part.length > 0),
	)));
}

function batchPayloadFromRecord(record: BatchJobRecord): Record<string, unknown> {
	const meta = record.meta;
	const status = record.status ?? meta?.status ?? "pending";
	return {
		id: record.batchId,
		object: "batch",
		status,
		endpoint: meta?.endpoint ?? null,
		completion_window: meta?.completionWindow ?? null,
		input_file_id: meta?.inputFileId ?? null,
		output_file_id: meta?.outputFileId ?? null,
		error_file_id: meta?.errorFileId ?? null,
		request_counts: meta?.requestCounts ?? null,
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

export function decorateBatchPayload(args: {
	requestUrl: string;
	payload: any;
	meta: BatchJobMeta | null | undefined;
	gatewayBatchId?: string | null;
	finalization?: FinalizeBatchJobResult | null;
}): Record<string, unknown> {
	const out: Record<string, unknown> =
		args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
			? { ...args.payload }
			: {};
	const payloadBatchId = toText(out.id);
	const upstreamBatchId = toText(args.meta?.nativeBatchId) ?? payloadBatchId;
	const gatewayBatchId = toText(args.gatewayBatchId) ?? upstreamBatchId;
	if (gatewayBatchId) {
		out.id = gatewayBatchId;
		if (upstreamBatchId && upstreamBatchId !== gatewayBatchId) {
			out.native_batch_id = upstreamBatchId;
		}
	}
	if (args.meta?.requestId) out.request_id = args.meta.requestId;
	if (args.meta?.provider) out.provider = args.meta.provider;
	if (args.meta?.sessionId) out.session_id = args.meta.sessionId;
	if (args.meta) {
		const webhook = buildPublicAsyncWebhook("batch", args.meta);
		if (webhook) out.webhook = webhook;
	}
	const nextWebhookRetryAt = toIsoDate(args.meta?.nextWebhookRetryAt ?? (args.meta as any)?.next_webhook_retry_at);
	if (nextWebhookRetryAt) out.next_webhook_retry_at = nextWebhookRetryAt;
	const lastWebhookProgress = toFiniteNumber(args.meta?.lastWebhookProgress ?? (args.meta as any)?.last_webhook_progress);
	if (lastWebhookProgress != null) out.last_webhook_progress = lastWebhookProgress;
	const lastWebhookProgressAt = toIsoDate(args.meta?.lastWebhookProgressAt ?? (args.meta as any)?.last_webhook_progress_at);
	if (lastWebhookProgressAt) out.last_webhook_progress_at = lastWebhookProgressAt;
	const lastWebhookDispatchedAt = toIsoDate(args.meta?.lastWebhookDispatchedAt ?? (args.meta as any)?.last_webhook_dispatched_at);
	if (lastWebhookDispatchedAt) out.last_webhook_dispatched_at = lastWebhookDispatchedAt;
	const lastPolledAt = toIsoDate(args.meta?.lastPolledAt ?? (args.meta as any)?.last_polled_at);
	if (lastPolledAt) out.last_polled_at = lastPolledAt;
	const polledStatus = toText(args.meta?.polledStatus ?? (args.meta as any)?.polled_status);
	if (polledStatus) out.polled_status = polledStatus;
	const finalizedAt = toIsoDate(args.meta?.finalizedAt ?? (args.meta as any)?.finalized_at);
	if (finalizedAt) out.finalized_at = finalizedAt;
	const rawStatus = toText(out.status);
	const rawNormalizedStatus = normalizeBatchStatus(rawStatus);
	const metaStatus = args.meta?.status ?? null;
	const metaNormalizedStatus = normalizeBatchStatus(metaStatus);
	if (
		isTerminalBatchStatusValue(metaNormalizedStatus) &&
		rawNormalizedStatus &&
		rawNormalizedStatus !== metaNormalizedStatus
	) {
		out.status = metaStatus;
	}
	const status = toText(out.status) ?? metaStatus;
	if (status) {
		out.lifecycle_status = toAsyncLifecycleStatus(status);
	}
	const payloadProgress = toFiniteNumber(out.progress);
	const derivedProgress =
		payloadProgress != null
			? Math.max(0, Math.min(100, Math.round(payloadProgress)))
			: normalizeBatchStatus(status) === "completed"
				? 100
				: resolveBatchProgressPercentFromCounts(args.meta);
	if (derivedProgress != null) {
		out.progress = derivedProgress;
	}
	if (gatewayBatchId) {
		out.polling_url = buildBatchPollingUrl(args.requestUrl, gatewayBatchId);
		out.websocket_url = buildAsyncWebSocketUrl(args.requestUrl, "batch", gatewayBatchId);
		out.cancel_url =
			status && isCancellableBatchStatus(status) && isBatchCancelSupportedProvider(args.meta?.provider)
				? buildBatchCancelUrl(args.requestUrl, gatewayBatchId)
				: null;
	}
	out.pricing_lines = buildBatchPricingLines(args.meta);
	const billing = buildBatchBilling(args.meta, args.finalization);
	if (billing) {
		out.billing = billing;
	}
	return out;
}

export function splitGatewayBatchCreatePayload(payload: Record<string, unknown>): {
	upstreamPayload: Record<string, unknown>;
	webhook: Record<string, unknown> | null;
	invalidWebhook: boolean;
} {
	const upstreamPayload = { ...payload };
	const hasWebhook = Object.prototype.hasOwnProperty.call(upstreamPayload, "webhook");
	const rawWebhook = upstreamPayload.webhook;
	delete upstreamPayload.webhook;
	delete upstreamPayload.session_id;
	delete upstreamPayload.sessionId;
	const webhook =
		rawWebhook && typeof rawWebhook === "object" && !Array.isArray(rawWebhook)
			? (rawWebhook as Record<string, unknown>)
			: null;
	return {
		upstreamPayload,
		webhook,
		invalidWebhook: hasWebhook && rawWebhook != null && !webhook,
	};
}

async function persistBatchFileOwnership(workspaceId: string, payload: any): Promise<void> {
	const outputFileId = toText(payload?.output_file_id);
	if (outputFileId) {
		await saveBatchFileMeta(workspaceId, outputFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
	const errorFileId = toText(payload?.error_file_id);
	if (errorFileId) {
		await saveBatchFileMeta(workspaceId, errorFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
}

async function fetchOpenAiBatches(args: {
	endpointPath: string;
	method: string;
	body?: BodyInit | null;
	contentType?: string | null;
}): Promise<Response> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	let keyInfo: { key: string };
	try {
		keyInfo = resolveProviderKey(
			{ providerId: OPENAI_PROVIDER_ID, byokMeta: [] },
			() => bindings.OPENAI_API_KEY,
		);
	} catch {
		return new Response(
			JSON.stringify({
				error: {
					type: "upstream_error",
					reason: "openai_key_missing",
				},
			}),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		);
	}
	const headers = new Headers({
		Authorization: `Bearer ${keyInfo.key}`,
	});
	if (args.contentType) {
		headers.set("Content-Type", args.contentType);
	}
	return fetch(`${resolveOpenAiBaseUrl(bindings)}${args.endpointPath}`, {
		method: args.method,
		headers,
		body: args.body ?? undefined,
	});
}

async function handleCreate(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}

	const rawBody = await req.text();
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return err("invalid_json", {
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const { upstreamPayload, webhook, invalidWebhook } = splitGatewayBatchCreatePayload(payload);
	if (invalidWebhook) {
		return err("validation_error", {
			reason: "invalid_batch_webhook",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const normalizedWebhook = webhook ? parseAsyncWebhookConfig("batch", webhook) : null;
	if (webhook && !normalizedWebhook) {
		return err("validation_error", {
			reason: "invalid_batch_webhook",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const endpointValidationError = buildBatchEndpointValidationError({
		endpoint: payload.endpoint,
		requestId,
		workspaceId: auth.workspaceId,
	});
	if (endpointValidationError) return endpointValidationError;
	const upstreamBody = JSON.stringify(upstreamPayload);
	const inputFileId = toText(payload.input_file_id);
	let reservation: Awaited<ReturnType<typeof reserveBatchCredits>>;
	try {
		reservation = await reserveBatchCredits({
			workspaceId: auth.workspaceId,
			batchId: requestId,
			inputFileId,
			endpoint: toText(payload.endpoint),
			model: toText(payload.model),
		});
	} catch (reservationErr) {
		console.error("batch_reservation_failed", {
			error: reservationErr,
			workspaceId: auth.workspaceId,
			requestId,
			inputFileId,
		});
		return err("gateway_error", {
			reason: "batch_reservation_unavailable",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const reservationGateError = buildBatchReservationGateError({
		reservation,
		requestId,
		workspaceId: auth.workspaceId,
	});
	if (reservationGateError) return reservationGateError;
	if (
		reservation &&
		reservation.amountNanos > 0 &&
		!reservation.held &&
		isInsufficientBatchReservationStatus(reservation.status)
	) {
		return err("insufficient_funds", {
			reason: "batch_reservation_insufficient_credits",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			reservation_status: reservation.status,
			required_nanos: reservation.amountNanos,
		});
	}
	if (reservation && reservation.amountNanos > 0 && !reservation.held && !reservation.status.startsWith("skip_")) {
		return err("gateway_error", {
			reason: "batch_reservation_failed",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			reservation_status: reservation.status,
		});
	}

	let upstream: Response;
	try {
		upstream = await fetchOpenAiBatches({
			endpointPath: "/batches",
			method: "POST",
			body: upstreamBody,
			contentType: req.headers.get("content-type") ?? "application/json",
		});
	} catch (upstreamErr) {
		if (reservation?.held) {
			await releaseWalletReservation({
				workspaceId: auth.workspaceId,
				reservationId: reservation.reservationId,
				releaseRefId: requestId,
			}).catch((releaseErr) => {
				console.error("batch_reservation_release_after_create_throw_failed", {
					error: releaseErr,
					workspaceId: auth.workspaceId,
					requestId,
					reservationId: reservation.reservationId,
				});
			});
		}
		console.error("batch_upstream_create_threw", {
			error: upstreamErr,
			workspaceId: auth.workspaceId,
			requestId,
		});
		return err("gateway_error", {
			reason: "batch_upstream_create_failed",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const upstreamJson = await parseUpstreamJson(upstream);

	if (upstream.ok) {
		const batchId = toText(upstreamJson?.id);
		const keySource = "gateway" as const;
		let persistedMeta: BatchJobMeta | null = null;
		let batchMetaPersisted = false;
		if (!batchId) {
			if (reservation?.held) {
				await releaseWalletReservation({
					workspaceId: auth.workspaceId,
					reservationId: reservation.reservationId,
					releaseRefId: requestId,
				}).catch((releaseErr) => {
					console.error("batch_reservation_release_after_missing_id_failed", {
						error: releaseErr,
						workspaceId: auth.workspaceId,
						requestId,
						reservationId: reservation.reservationId,
					});
				});
			}
			return err("upstream_error", {
				reason: "batch_upstream_missing_id",
				request_id: requestId,
				workspace_id: auth.workspaceId,
			});
		}
		if (batchId) {
			persistedMeta = batchMetaFromPayload(upstreamJson, {
				provider: OPENAI_PROVIDER_ID,
				requestId,
				sessionId:
					typeof payload?.session_id === "string"
						? payload.session_id
						: typeof payload?.sessionId === "string"
							? payload.sessionId
							: null,
				model: toText(payload.model),
				status: toText(upstreamJson?.status) ?? "validating",
				nativeBatchId: batchId,
				endpoint: toText(payload.endpoint),
				completionWindow: toText(payload.completion_window),
				inputFileId: toText(payload.input_file_id),
				webhook: normalizedWebhook,
				reservationId: reservation?.reservationId ?? null,
				reservedNanos: reservation?.amountNanos ?? null,
				reservationStatus: reservation?.status ?? null,
				estimatedUsage: reservation?.estimatedUsage ?? null,
				keySource,
				byokKeyId: null,
			});
			try {
				await saveBatchJobMeta(auth.workspaceId, batchId, persistedMeta);
				batchMetaPersisted = true;
			} catch (lookupErr) {
				await fetchOpenAiBatches({
					endpointPath: `/batches/${encodeURIComponent(batchId)}/cancel`,
					method: "POST",
				}).catch((cancelErr) => {
					console.error("batch_upstream_cancel_after_meta_store_failed", {
						error: cancelErr,
						workspaceId: auth.workspaceId,
						batchId,
						requestId,
					});
				});
				if (reservation?.held) {
					await releaseWalletReservation({
						workspaceId: auth.workspaceId,
						reservationId: reservation.reservationId,
						releaseRefId: requestId,
					}).catch((releaseErr) => {
						console.error("batch_reservation_release_after_meta_store_failed", {
							error: releaseErr,
							workspaceId: auth.workspaceId,
							batchId,
							requestId,
							reservationId: reservation.reservationId,
						});
					});
				}
				console.error("batch_job_meta_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					batchId,
					requestId,
					reservationId: reservation?.reservationId ?? null,
					reservationStatus: reservation?.status ?? null,
					note: "upstream_cancel_and_reservation_release_attempted",
				});
				return batchAsyncPersistenceFailureResponse({
					message: "Batch job was created upstream, but AI Stats could not persist gateway ownership metadata.",
					batchId,
					nativeBatchId: batchId,
					status: toText(upstreamJson?.status),
					reservationId: reservation?.reservationId ?? null,
					reservationStatus: reservation?.status ?? null,
				});
			}
		}

		if (inputFileId) {
			await saveBatchFileMeta(auth.workspaceId, inputFileId, {
				provider: OPENAI_PROVIDER_ID,
				status: "uploaded",
				keySource,
				byokKeyId: null,
			}).catch((lookupErr) => {
				console.error("batch_input_file_meta_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					fileId: inputFileId,
				});
			});
		}
		await persistBatchFileOwnership(auth.workspaceId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
			});
		});
		if (batchId && batchMetaPersisted) {
			dispatchAsyncWebhookEventInBackground({
				workspaceId: auth.workspaceId,
				kind: "batch",
				internalId: batchId,
				phase: "created",
			});
		}
		if (upstreamJson) {
			return toDecoratedJsonResponse(upstream, decorateBatchPayload({
				requestUrl: req.url,
				payload: upstreamJson,
				meta: persistedMeta,
				gatewayBatchId: batchId,
			}));
		}
	}

	let createFailureReservationStatus: string | null = null;
	if (!upstream.ok && reservation?.held) {
		const released = await releaseWalletReservation({
			workspaceId: auth.workspaceId,
			reservationId: reservation.reservationId,
			releaseRefId: requestId,
		}).catch((releaseErr) => {
			console.error("batch_reservation_release_after_create_failure_failed", {
				error: releaseErr,
				workspaceId: auth.workspaceId,
				requestId,
				reservationId: reservation.reservationId,
			});
			return null;
		});
		createFailureReservationStatus = released?.status ?? "release_failed";
	}

	if (!upstream.ok && upstreamJson && typeof upstreamJson === "object" && !Array.isArray(upstreamJson)) {
		return toDecoratedJsonResponse(upstream, {
			...upstreamJson,
			...(reservation?.held
				? {
					billing: {
						currency: "usd",
						state: "void",
						billed: true,
						charged: false,
						reason: "upstream_create_failed",
						reservation_id: reservation.reservationId,
						reservation_status: createFailureReservationStatus,
						estimated_nanos: reservation.amountNanos,
						reserved_nanos: reservation.amountNanos,
						settled_provider_cost: "0.00",
						settled_user_cost: "0.00",
						total_nanos: 0,
						cost_nanos: 0,
						cost_usd: 0,
					},
				}
				: {}),
		});
	}

	return toJsonResponse(upstream);
}

async function handleList(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const url = new URL(req.url);
	const limit = parseBatchListLimit(url);
	const statuses = parseBatchListStatuses(url);
	const records = await listTeamBatchJobs({
		workspaceId: auth.workspaceId,
		limit,
		statuses: statuses.length > 0 ? statuses : undefined,
	});
	const data = records.map((record) =>
		decorateBatchPayload({
			requestUrl: req.url,
			payload: batchPayloadFromRecord(record),
			meta: record.meta,
			gatewayBatchId: record.batchId,
		}),
	);
	return new Response(JSON.stringify({
		object: "list",
		data,
		first_id: typeof data[0]?.id === "string" ? data[0].id : null,
		last_id: typeof data[data.length - 1]?.id === "string" ? data[data.length - 1].id : null,
		has_more: false,
	}), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

async function handleModels(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const url = new URL(req.url);
	const catalogue = await fetchCatalogue({
		endpoints: ["batch"],
		params: parseModelQueryValues(url, "params"),
		statuses: ["active"],
	});
	return new Response(JSON.stringify({
		object: "list",
		data: catalogue.map((model) => ({
			model: model.model_id,
			name: model.name,
			status: model.status,
			input_types: model.input_types,
			output_types: model.output_types,
			supported_params: model.supported_params,
			supported_parameters: model.supported_params,
			supported_params_detail: model.supported_params_detail,
			supported_parameters_detail: model.supported_params_detail,
			providers: model.providers.map((provider) => ({
				id: provider.api_provider_id,
				supported_params: provider.params,
				supported_parameters: provider.params,
				supported_params_detail: provider.params_detail,
				supported_parameters_detail: provider.params_detail,
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
}

async function handleRetrieve(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const batchId = String(id ?? "").trim();
	if (!batchId) {
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, workspace_id: auth.workspaceId });
	}
	let meta = null;
	try {
		meta = await getBatchJobMeta(auth.workspaceId, batchId);
	} catch (lookupErr) {
		console.error("batch_job_meta_lookup_failed", {
			error: lookupErr,
			workspaceId: auth.workspaceId,
			batchId,
		});
	}
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			workspace_id: auth.workspaceId,
		});
	}
	const providerId = meta.provider ?? OPENAI_PROVIDER_ID;
	if (!isBatchCancelSupportedProvider(providerId)) {
		return err("not_implemented_yet", {
			reason: "batch_status_provider_not_supported",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			batch_id: batchId,
			provider: providerId,
			native_batch_id: meta.nativeBatchId ?? batchId,
		});
	}

	const upstreamBatchId = meta.nativeBatchId ?? batchId;
	const upstream = await fetchOpenAiBatches({
		endpointPath: `/batches/${encodeURIComponent(upstreamBatchId)}`,
		method: "GET",
	});
	const upstreamJson = await parseUpstreamJson(upstream);
	let refreshedMeta = meta;
	let finalization: FinalizeBatchJobResult | null = null;

	if (upstream.ok && upstreamJson) {
		const previousStatus = normalizeBatchStatus(meta.status);
		refreshedMeta = batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
		});
		try {
			await saveBatchJobMeta(auth.workspaceId, batchId, refreshedMeta);
		} catch (lookupErr) {
			console.error("batch_job_meta_refresh_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
				status: toText(upstreamJson?.status),
			});
			return batchAsyncPersistenceFailureResponse({
				message: "Batch status was refreshed upstream, but AI Stats could not persist the refreshed gateway metadata.",
				batchId,
				nativeBatchId: meta.nativeBatchId ?? batchId,
				status: toText(upstreamJson?.status),
				reservationId: meta.reservationId ?? null,
				reservationStatus: meta.reservationStatus ?? null,
			});
		}
		await persistBatchFileOwnership(auth.workspaceId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
			});
		});
		const nextStatus = normalizeBatchStatus(refreshedMeta.status) ?? "";
		if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "expired" || nextStatus === "cancelled") {
			finalization = await finalizeBatchJob({
				workspaceId: auth.workspaceId,
				batchId,
				status: nextStatus,
			}).catch((finalizeErr) => {
				console.error("batch_job_finalize_failed", {
					error: finalizeErr,
					workspaceId: auth.workspaceId,
					batchId,
					status: nextStatus,
				});
				return null;
			});
		}
		const dispatchStatus = finalization ? normalizeBatchStatus(finalization.status) : null;
		if (!dispatchStatus && !isTerminalBatchStatusValue(nextStatus)) {
			const progress = resolveBatchProgressPercentFromCounts(refreshedMeta);
			if (progress != null) {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "progress",
					progress,
				});
			}
		} else if (dispatchStatus && dispatchStatus !== previousStatus) {
			if (dispatchStatus === "completed") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "completed",
				});
			} else if (dispatchStatus === "expired") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "expired",
				});
			} else if (dispatchStatus === "failed") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "failed",
				});
			} else if (dispatchStatus === "cancelled") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "cancelled",
				});
			}
		}
		const persistedMeta = await getBatchJobMeta(auth.workspaceId, batchId).catch(() => refreshedMeta);
		return toDecoratedJsonResponse(upstream, decorateBatchPayload({
			requestUrl: req.url,
			payload: upstreamJson,
			meta: persistedMeta ?? refreshedMeta,
			gatewayBatchId: batchId,
			finalization,
		}));
	}

	return toJsonResponse(upstream);
}

async function handleCancel(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const batchId = String(id ?? "").trim();
	if (!batchId) {
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, workspace_id: auth.workspaceId });
	}

	const meta = await getBatchJobMeta(auth.workspaceId, batchId);
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			workspace_id: auth.workspaceId,
		});
	}
	const currentStatus = normalizeBatchStatus(meta.status);
	if (currentStatus && !isCancellableBatchStatus(currentStatus)) {
		if (currentStatus === "cancelled") {
			return toDecoratedJsonResponse(new Response(null, { status: 200 }), decorateBatchPayload({
				requestUrl: req.url,
				payload: {
					id: batchId,
					status: meta.status ?? currentStatus,
				},
				meta,
				gatewayBatchId: batchId,
			}));
		}
		return err("validation_error", {
			reason: "batch_cancel_requires_non_terminal_status",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			batch_id: batchId,
			status: currentStatus,
		});
	}
	if (!isBatchCancelSupportedProvider(meta.provider)) {
		return err("not_implemented_yet", {
			reason: "batch_cancel_provider_not_supported",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			batch_id: batchId,
			provider: meta.provider ?? null,
			native_batch_id: meta.nativeBatchId ?? batchId,
		});
	}

	const upstreamBatchId = meta.nativeBatchId ?? batchId;
	const upstream = await fetchOpenAiBatches({
		endpointPath: `/batches/${encodeURIComponent(upstreamBatchId)}/cancel`,
		method: "POST",
		contentType: "application/json",
		body: "{}",
	});
	const upstreamJson = await parseUpstreamJson(upstream);
	let refreshedMeta = meta;
	let finalization: FinalizeBatchJobResult | null = null;

	if (upstream.ok && upstreamJson) {
		const previousStatus = normalizeBatchStatus(meta.status);
		refreshedMeta = batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
			status: "cancelling",
		});
		try {
			await saveBatchJobMeta(auth.workspaceId, batchId, refreshedMeta);
		} catch (lookupErr) {
			console.error("batch_job_meta_cancel_refresh_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
				status: toText(upstreamJson?.status),
			});
			return batchAsyncPersistenceFailureResponse({
				message: "Batch cancellation was accepted upstream, but AI Stats could not persist the refreshed gateway metadata.",
				batchId,
				nativeBatchId: meta.nativeBatchId ?? batchId,
				status: toText(upstreamJson?.status),
				reservationId: meta.reservationId ?? null,
				reservationStatus: meta.reservationStatus ?? null,
			});
		}
		const nextStatus = normalizeBatchStatus(upstreamJson?.status) ?? "";
		if (nextStatus === "cancelled") {
			finalization = await finalizeBatchJob({
				workspaceId: auth.workspaceId,
				batchId,
				status: nextStatus,
			}).catch((finalizeErr) => {
				console.error("batch_job_finalize_failed", {
					error: finalizeErr,
					workspaceId: auth.workspaceId,
					batchId,
					status: nextStatus,
				});
				return null;
			});
			const dispatchStatus = finalization ? normalizeBatchStatus(finalization.status) : null;
			if (dispatchStatus === "cancelled" && previousStatus !== "cancelled") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "cancelled",
				});
			}
		}
		const persistedMeta = await getBatchJobMeta(auth.workspaceId, batchId).catch(() => refreshedMeta);
		return toDecoratedJsonResponse(upstream, decorateBatchPayload({
			requestUrl: req.url,
			payload: upstreamJson,
			meta: persistedMeta ?? refreshedMeta,
			gatewayBatchId: batchId,
			finalization,
		}));
	}

	return toJsonResponse(upstream);
}

export const batchRoutes = new Hono<Env>();

function batchNotImplementedYetResponse(): Response {
	return err("not_implemented_yet", {
		reason: "batch_api_temporarily_disabled",
		message: "Batch endpoints are temporarily disabled while the public contract is finalized.",
	});
}

batchRoutes.use("*", async (c, next) => {
	if (c.env && !isBatchApiEnabled(c.env.BATCH_API_ENABLED)) {
		return batchNotImplementedYetResponse();
	}
	await next();
});

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/", withRuntime(handleList));
batchRoutes.get("/models", withRuntime(handleModels));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
batchRoutes.post("/:id/cancel", withRuntime((req) => handleCancel(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));

