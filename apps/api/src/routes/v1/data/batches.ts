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

async function persistBatchFileOwnership(teamId: string, payload: any): Promise<void> {
	const outputFileId = toText(payload?.output_file_id);
	if (outputFileId) {
		await saveBatchFileMeta(teamId, outputFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
	const errorFileId = toText(payload?.error_file_id);
	if (errorFileId) {
		await saveBatchFileMeta(teamId, errorFileId, {
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
			team_id: auth.teamId,
		});
	}

	const upstream = await fetchOpenAiBatches({
		endpointPath: "/batches",
		method: "POST",
		body: rawBody,
		contentType: req.headers.get("content-type") ?? "application/json",
	});
	const upstreamJson = await parseUpstreamJson(upstream);

	if (upstream.ok) {
		const batchId = toText(upstreamJson?.id);
		const keySource = "gateway" as const;
		if (batchId) {
			await saveBatchJobMeta(auth.teamId, batchId, batchMetaFromPayload(upstreamJson, {
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
				keySource,
				byokKeyId: null,
			})).catch((lookupErr) => {
				console.error("batch_job_meta_store_failed", {
					error: lookupErr,
					teamId: auth.teamId,
					batchId,
				});
			});
		}

		const inputFileId = toText(payload.input_file_id);
		if (inputFileId) {
			await saveBatchFileMeta(auth.teamId, inputFileId, {
				provider: OPENAI_PROVIDER_ID,
				status: "uploaded",
				keySource,
				byokKeyId: null,
			}).catch((lookupErr) => {
				console.error("batch_input_file_meta_store_failed", {
					error: lookupErr,
					teamId: auth.teamId,
					fileId: inputFileId,
				});
			});
		}
		await persistBatchFileOwnership(auth.teamId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				teamId: auth.teamId,
			});
		});
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
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, team_id: auth.teamId });
	}
	let meta = null;
	try {
		meta = await getBatchJobMeta(auth.teamId, batchId);
	} catch (lookupErr) {
		console.error("batch_job_meta_lookup_failed", {
			error: lookupErr,
			teamId: auth.teamId,
			batchId,
		});
	}
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			team_id: auth.teamId,
		});
	}

	const upstream = await fetchOpenAiBatches({
		endpointPath: `/batches/${encodeURIComponent(batchId)}`,
		method: "GET",
	});
	const upstreamJson = await parseUpstreamJson(upstream);

	if (upstream.ok && upstreamJson) {
		await saveBatchJobMeta(auth.teamId, batchId, batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
		})).catch((lookupErr) => {
			console.error("batch_job_meta_refresh_failed", {
				error: lookupErr,
				teamId: auth.teamId,
				batchId,
			});
		});
		await persistBatchFileOwnership(auth.teamId, upstreamJson).catch((lookupErr) => {
			console.error("batch_output_file_meta_store_failed", {
				error: lookupErr,
				teamId: auth.teamId,
				batchId,
			});
		});
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
		return err("validation_error", { reason: "missing_batch_id", request_id: requestId, team_id: auth.teamId });
	}

	const meta = await getBatchJobMeta(auth.teamId, batchId);
	if (!meta) {
		return err("not_found", {
			reason: "batch_not_found_or_not_owned",
			request_id: requestId,
			batch_id: batchId,
			team_id: auth.teamId,
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
		await saveBatchJobMeta(auth.teamId, batchId, batchMetaFromPayload(upstreamJson, {
			...meta,
			provider: OPENAI_PROVIDER_ID,
			status: "cancelling",
		})).catch((lookupErr) => {
			console.error("batch_job_meta_cancel_refresh_failed", {
				error: lookupErr,
				teamId: auth.teamId,
				batchId,
			});
		});
	}

	return toJsonResponse(upstream);
}

export const batchRoutes = new Hono<Env>();

batchRoutes.post("/", withRuntime(handleCreate));
batchRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
batchRoutes.post("/:id/cancel", withRuntime((req) => handleCancel(req, (req as any).param?.("id") ?? req.url.split("/").slice(-2, -1)[0] ?? "")));

