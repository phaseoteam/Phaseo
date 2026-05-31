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
	buildPublicAsyncWebhook,
	dispatchAsyncWebhookEventInBackground,
	parseAsyncWebhookConfig,
	toAsyncLifecycleStatus,
} from "@core/async-notifications";
import {
	buildUnsupportedBatchModePayload,
	listBatchProviderCapabilities,
	resolveBatchInputMode,
	resolveBatchProvidersForMode,
	resolveRequestedBatchProviders,
	type BatchInputMode,
} from "@core/batch-capabilities";
import {
	getBatchJobMeta,
	saveBatchFileMeta,
	saveBatchJobMeta,
	type BatchJobMeta,
} from "@core/batch-jobs";
import {
	hashBatchRequestBody,
	listBatchRequestRows,
	saveBatchRequestRows,
	type BatchRequestRowInput,
} from "@core/batch-requests";
import { finalizeBatchJob, type FinalizeBatchJobResult } from "@core/batch-finalization";

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_BASE_URL = "https://api.openai.com";

function resolveOpenAiBaseUrl(bindings: Record<string, string | undefined>): string {
	const base = String(bindings.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
	return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function toText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
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

function jsonPayload(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

function resolveBatchProviderForCurrentAdapter(args: {
	mode: BatchInputMode;
	provider: unknown;
}): { ok: true; providerId: string } | { ok: false; response: Response } {
	const requestedProviders = resolveRequestedBatchProviders(args.provider);
	const providersForMode = resolveBatchProvidersForMode({
		mode: args.mode,
		requestedProviders,
	});
	if (providersForMode.length === 0) {
		return {
			ok: false,
			response: jsonPayload(buildUnsupportedBatchModePayload({
				mode: args.mode,
				requestedProviders,
			}), 400),
		};
	}
	const activeProvidersForMode = resolveBatchProvidersForMode({
		mode: args.mode,
		requestedProviders,
		activeOnly: true,
	});
	const openAi = activeProvidersForMode.find((provider) => provider.providerId === OPENAI_PROVIDER_ID);
	if (openAi) return { ok: true, providerId: OPENAI_PROVIDER_ID };
	return {
		ok: false,
		response: jsonPayload({
			error: {
				type: "not_implemented",
				reason: "batch_provider_adapter_not_ready",
				message: "This batch input mode is recognised, but the selected provider adapter is not enabled yet.",
				input_mode: args.mode,
				requested_providers: requestedProviders,
				providers: providersForMode.map((provider) => ({
					id: provider.providerId,
					name: provider.displayName,
					status: provider.status,
					gateway_input_modes: provider.gatewayInputModes,
					native_input_modes: provider.nativeInputModes,
					documentation_url: provider.documentationUrl,
				})),
			},
		}, 501),
	};
}

type InlineBatchRequest = {
	customId: string;
	method: string;
	url: string;
	body: unknown;
	index: number;
	requestBodyHash: string;
};

async function normalizeInlineBatchRequests(payload: Record<string, unknown>): Promise<InlineBatchRequest[]> {
	const requests = Array.isArray(payload.requests) ? payload.requests : [];
	const endpoint = toText(payload.endpoint);
	if (!endpoint) throw new Error("missing_endpoint");
	const out: InlineBatchRequest[] = [];
	for (let index = 0; index < requests.length; index += 1) {
		const raw = requests[index];
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new Error("invalid_inline_request");
		}
		const record = raw as Record<string, unknown>;
		const body = record.body && typeof record.body === "object" && !Array.isArray(record.body)
			? record.body
			: record.request && typeof record.request === "object" && !Array.isArray(record.request)
				? record.request
				: null;
		if (!body) throw new Error("invalid_inline_request_body");
		const customId = toText(record.custom_id) ?? toText(record.customId) ?? `request-${index + 1}`;
		out.push({
			customId,
			method: (toText(record.method) ?? "POST").toUpperCase(),
			url: toText(record.url) ?? endpoint,
			body,
			index,
			requestBodyHash: await hashBatchRequestBody(body),
		});
	}
	const seen = new Set<string>();
	for (const row of out) {
		if (seen.has(row.customId)) throw new Error("duplicate_custom_id");
		seen.add(row.customId);
	}
	return out;
}

function toOpenAiJsonl(rows: InlineBatchRequest[]): string {
	return rows
		.map((row) => JSON.stringify({
			custom_id: row.customId,
			method: row.method,
			url: row.url,
			body: row.body,
		}))
		.join("\n");
}

async function uploadOpenAiBatchInputFile(args: {
	requestId: string;
	rows: InlineBatchRequest[];
}): Promise<{ ok: true; fileId: string; payload: any } | { ok: false; response: Response }> {
	const form = new FormData();
	form.append("purpose", "batch");
	form.append(
		"file",
		new Blob([toOpenAiJsonl(args.rows)], { type: "application/jsonl" }),
		`aistats-batch-${args.requestId}.jsonl`,
	);
	const upstream = await fetchOpenAiBatches({
		endpointPath: "/files",
		method: "POST",
		body: form,
	});
	const upstreamJson = await parseUpstreamJson(upstream);
	if (!upstream.ok) return { ok: false, response: toJsonResponse(upstream) };
	const fileId = toText(upstreamJson?.id);
	if (!fileId) {
		return {
			ok: false,
			response: jsonPayload({
				error: {
					type: "upstream_error",
					reason: "batch_file_upload_missing_id",
				},
			}, 502),
		};
	}
	return { ok: true, fileId, payload: upstreamJson };
}

function batchMetaFromPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = toText(payload?.id);
	return {
		...base,
		status: toText(payload?.status) ?? base.status ?? null,
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
	};
}

function buildBatchPricingLines(meta: BatchJobMeta | null | undefined): Record<string, unknown>[] {
	const lines = (meta?.pricedUsage as any)?.pricing?.lines;
	if (Array.isArray(lines)) {
		return lines.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object");
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
		Boolean(meta?.pricingBreakdown);
	if (!hasStoredBilling && !finalization) return null;
	return {
		billed:
			typeof finalization?.billed === "boolean"
				? finalization.billed
				: typeof meta?.finalizedAt === "string" || typeof meta?.billingReason === "string",
		charged: typeof finalization?.charged === "boolean" ? finalization.charged : Boolean(meta?.charged),
		reason: finalization?.reason ?? meta?.billingReason ?? null,
		cost_nanos: typeof meta?.costNanos === "number" ? meta.costNanos : null,
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

function decorateBatchPayload(args: {
	requestUrl: string;
	payload: any;
	meta: BatchJobMeta | null | undefined;
	finalization?: FinalizeBatchJobResult | null;
}): Record<string, unknown> {
	const out: Record<string, unknown> =
		args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
			? { ...args.payload }
			: {};
	if (args.meta?.requestId) out.request_id = args.meta.requestId;
	if (args.meta?.provider) out.provider = args.meta.provider;
	if (args.meta?.sessionId) out.session_id = args.meta.sessionId;
	if (args.meta?.webhook && typeof args.meta.webhook === "object" && !Array.isArray(args.meta.webhook)) {
		const webhook = buildPublicAsyncWebhook("batch", args.meta);
		if (webhook) out.webhook = webhook;
	}
	const status = toText(out.status) ?? args.meta?.status ?? null;
	if (status) {
		out.lifecycle_status = toAsyncLifecycleStatus(status);
	}
	const batchId = toText(out.id) ?? args.meta?.nativeBatchId ?? null;
	if (batchId) {
		out.polling_url = buildBatchPollingUrl(args.requestUrl, batchId);
		out.cancel_url = status && isCancellableBatchStatus(status) ? buildBatchCancelUrl(args.requestUrl, batchId) : null;
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
} {
	const upstreamPayload = { ...payload };
	const rawWebhook = upstreamPayload.webhook;
	delete upstreamPayload.webhook;
	delete upstreamPayload.webhook_endpoint_id;
	delete upstreamPayload.requests;
	delete upstreamPayload.session_id;
	delete upstreamPayload.sessionId;
	return {
		upstreamPayload,
		webhook:
			rawWebhook && typeof rawWebhook === "object" && !Array.isArray(rawWebhook)
				? (rawWebhook as Record<string, unknown>)
				: typeof payload.webhook_endpoint_id === "string" && payload.webhook_endpoint_id.trim().length > 0
					? { endpoint_id: payload.webhook_endpoint_id }
				: null,
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
	const { upstreamPayload, webhook } = splitGatewayBatchCreatePayload(payload);
	const inputMode = resolveBatchInputMode(payload);
	if (inputMode.ok === false) {
		return err("validation_error", {
			reason: inputMode.reason,
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const providerResolution = resolveBatchProviderForCurrentAdapter({
		mode: inputMode.mode,
		provider: payload.provider,
	});
	if (providerResolution.ok === false) return providerResolution.response;
	const normalizedWebhook = webhook ? parseAsyncWebhookConfig("batch", webhook) : null;
	if (webhook && !normalizedWebhook) {
		return err("validation_error", {
			reason: "invalid_batch_webhook",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	let inlineRows: InlineBatchRequest[] | null = null;
	if (inputMode.mode === "inline") {
		try {
			inlineRows = await normalizeInlineBatchRequests(payload);
		} catch (error) {
			return err("validation_error", {
				reason: error instanceof Error ? error.message : "invalid_inline_requests",
				request_id: requestId,
				workspace_id: auth.workspaceId,
			});
		}
		const upload = await uploadOpenAiBatchInputFile({ requestId, rows: inlineRows });
		if (upload.ok === false) return upload.response;
		upstreamPayload.input_file_id = upload.fileId;
		await saveBatchFileMeta(auth.workspaceId, upload.fileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "uploaded",
			purpose: "batch",
			filename: `aistats-batch-${requestId}.jsonl`,
			keySource: "gateway",
			byokKeyId: null,
		}).catch((lookupErr) => {
			console.error("batch_inline_input_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				fileId: upload.fileId,
			});
		});
	}
	const upstreamBody = JSON.stringify(upstreamPayload);

	const upstream = await fetchOpenAiBatches({
		endpointPath: "/batches",
		method: "POST",
		body: upstreamBody,
		contentType: req.headers.get("content-type") ?? "application/json",
	});
	const upstreamJson = await parseUpstreamJson(upstream);

	if (upstream.ok) {
		const batchId = toText(upstreamJson?.id);
		const keySource = "gateway" as const;
		let persistedMeta: BatchJobMeta | null = null;
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
				inputFileId: toText(upstreamPayload.input_file_id) ?? toText(payload.input_file_id),
				inputMode: inputMode.mode,
				webhook: normalizedWebhook,
				keySource,
				byokKeyId: null,
			});
			await saveBatchJobMeta(auth.workspaceId, batchId, persistedMeta).catch((lookupErr) => {
				console.error("batch_job_meta_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					batchId,
				});
			});
		}
		if (batchId && inlineRows?.length) {
			const requestRows: BatchRequestRowInput[] = inlineRows.map((row) => ({
				provider: OPENAI_PROVIDER_ID,
				nativeBatchId: batchId,
				customId: row.customId,
				requestIndex: row.index,
				method: row.method,
				endpoint: row.url,
				model: toText((row.body as any)?.model) ?? toText(payload.model),
				status: "queued",
				requestBodyHash: row.requestBodyHash,
				meta: {
					input_mode: "inline",
				},
			}));
			await saveBatchRequestRows({
				workspaceId: auth.workspaceId,
				batchId,
				rows: requestRows,
			}).catch((lookupErr) => {
				console.error("batch_request_rows_store_failed", {
					error: lookupErr,
					workspaceId: auth.workspaceId,
					batchId,
				});
			});
		}

		const inputFileId = toText(payload.input_file_id);
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
		if (batchId) {
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
			}));
		}
	}

	return toJsonResponse(upstream);
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

	const upstream = await fetchOpenAiBatches({
		endpointPath: `/batches/${encodeURIComponent(batchId)}`,
		method: "GET",
	});
	const upstreamJson = await parseUpstreamJson(upstream);
	let refreshedMeta = meta;
	let finalization: FinalizeBatchJobResult | null = null;

	if (upstream.ok && upstreamJson) {
		const previousStatus = String(meta.status ?? "").toLowerCase();
		refreshedMeta = batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
		});
		await saveBatchJobMeta(auth.workspaceId, batchId, refreshedMeta).catch((lookupErr) => {
			console.error("batch_job_meta_refresh_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
			});
		});
		await persistBatchFileOwnership(auth.workspaceId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
			});
		});
		const nextStatus = String(upstreamJson?.status ?? meta.status ?? "").toLowerCase();
		if (nextStatus !== previousStatus) {
			if (nextStatus === "completed") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "completed",
				});
			} else if (nextStatus === "failed" || nextStatus === "expired") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "failed",
				});
			} else if (nextStatus === "cancelled" || nextStatus === "canceled") {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: auth.workspaceId,
					kind: "batch",
					internalId: batchId,
					phase: "cancelled",
				});
			}
		}
		if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "expired" || nextStatus === "cancelled" || nextStatus === "canceled") {
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
		const persistedMeta = await getBatchJobMeta(auth.workspaceId, batchId).catch(() => refreshedMeta);
		return toDecoratedJsonResponse(upstream, decorateBatchPayload({
			requestUrl: req.url,
			payload: upstreamJson,
			meta: persistedMeta ?? refreshedMeta,
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

	const upstream = await fetchOpenAiBatches({
		endpointPath: `/batches/${encodeURIComponent(batchId)}/cancel`,
		method: "POST",
		contentType: "application/json",
		body: "{}",
	});
	const upstreamJson = await parseUpstreamJson(upstream);
	let refreshedMeta = meta;
	let finalization: FinalizeBatchJobResult | null = null;

	if (upstream.ok && upstreamJson) {
		refreshedMeta = batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
			status: "cancelling",
		});
		await saveBatchJobMeta(auth.workspaceId, batchId, refreshedMeta).catch((lookupErr) => {
			console.error("batch_job_meta_cancel_refresh_failed", {
				error: lookupErr,
				workspaceId: auth.workspaceId,
				batchId,
			});
		});
		const nextStatus = String(upstreamJson?.status ?? "").toLowerCase();
		if (nextStatus === "cancelled" || nextStatus === "canceled") {
			dispatchAsyncWebhookEventInBackground({
				workspaceId: auth.workspaceId,
				kind: "batch",
				internalId: batchId,
				phase: "cancelled",
			});
		}
		if (nextStatus === "cancelled" || nextStatus === "canceled") {
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
		const persistedMeta = await getBatchJobMeta(auth.workspaceId, batchId).catch(() => refreshedMeta);
		return toDecoratedJsonResponse(upstream, decorateBatchPayload({
			requestUrl: req.url,
			payload: upstreamJson,
			meta: persistedMeta ?? refreshedMeta,
			finalization,
		}));
	}

	return toJsonResponse(upstream);
}

async function handleCapabilities(_req: Request) {
	return jsonPayload({
		object: "list",
		data: listBatchProviderCapabilities().map((provider) => ({
			id: provider.providerId,
			name: provider.displayName,
			status: provider.status,
			gateway_input_modes: provider.gatewayInputModes,
			native_input_modes: provider.nativeInputModes,
			documentation_url: provider.documentationUrl,
			notes: provider.notes ?? null,
		})),
	});
}

async function handleListRequests(req: Request, id: string) {
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
	const url = new URL(req.url);
	const rows = await listBatchRequestRows({
		workspaceId: auth.workspaceId,
		batchId,
		limit: Number(url.searchParams.get("limit") ?? 100),
		offset: Number(url.searchParams.get("offset") ?? 0),
		status: url.searchParams.get("status"),
	});
	return jsonPayload({
		object: "list",
		batch_id: batchId,
		data: rows.map((row) => ({
			id: row.id,
			custom_id: row.customId,
			request_index: row.requestIndex,
			provider: row.provider,
			native_batch_id: row.nativeBatchId,
			method: row.method,
			endpoint: row.endpoint,
			model: row.model,
			status: row.status,
			request_body_hash: row.requestBodyHash,
			response_status: row.responseStatus,
			response_body: row.responseBody,
			error_body: row.errorBody,
			usage: row.usage,
			cost_nanos: row.costNanos,
			cost_usd: row.costUsd,
			meta: row.meta,
			created_at: row.createdAt,
			updated_at: row.updatedAt,
			completed_at: row.completedAt,
		})),
	});
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/capabilities", withRuntime(handleCapabilities));
batchRoutes.get("/:id/requests", withRuntime((req) => handleListRequests(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
batchRoutes.post("/:id/cancel", withRuntime((req) => handleCancel(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));
