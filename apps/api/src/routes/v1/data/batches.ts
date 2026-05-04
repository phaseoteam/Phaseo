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
import { dispatchAsyncWebhookEventInBackground, parseAsyncWebhookConfig } from "@core/async-notifications";
import {
	getBatchJobMeta,
	saveBatchFileMeta,
	saveBatchJobMeta,
	type BatchJobMeta,
} from "@core/batch-jobs";

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

async function parseUpstreamJson(response: Response): Promise<any | null> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return null;
	return response.clone().json().catch(() => null);
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
	};
}

export function splitGatewayBatchCreatePayload(payload: Record<string, unknown>): {
	upstreamPayload: Record<string, unknown>;
	webhook: Record<string, unknown> | null;
} {
	const upstreamPayload = { ...payload };
	const rawWebhook = upstreamPayload.webhook;
	delete upstreamPayload.webhook;
	return {
		upstreamPayload,
		webhook:
			rawWebhook && typeof rawWebhook === "object" && !Array.isArray(rawWebhook)
				? (rawWebhook as Record<string, unknown>)
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
	const normalizedWebhook = webhook ? parseAsyncWebhookConfig("batch", webhook) : null;
	if (webhook && !normalizedWebhook) {
		return err("validation_error", {
			reason: "invalid_batch_webhook",
			request_id: requestId,
			workspace_id: auth.workspaceId,
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
		if (batchId) {
			await saveBatchJobMeta(auth.workspaceId, batchId, batchMetaFromPayload(upstreamJson, {
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
				keySource,
				byokKeyId: null,
			})).catch((lookupErr) => {
				console.error("batch_job_meta_store_failed", {
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

	if (upstream.ok && upstreamJson) {
		const previousStatus = String(meta.status ?? "").toLowerCase();
		await saveBatchJobMeta(auth.workspaceId, batchId, batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
		})).catch((lookupErr) => {
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

	if (upstream.ok && upstreamJson) {
		await saveBatchJobMeta(auth.workspaceId, batchId, batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
			status: "cancelling",
		})).catch((lookupErr) => {
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
	}

	return toJsonResponse(upstream);
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
batchRoutes.post("/:id/cancel", withRuntime((req) => handleCancel(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));

