// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure, AuthSuccess } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";
import { generatePublicId } from "@pipeline/before/genId";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { getBatchFileMeta, saveBatchFileMeta } from "@core/batch-jobs";
import { getBatchApiFeatureGateName, isBatchApiAccessEnabled } from "@core/feature-flags";
import {
	buildUnsupportedBatchModePayload,
	resolveBatchPreviewProviderIds,
	resolveBatchProvidersForMode,
	resolveBatchProvidersFromModel,
	resolveRequestedBatchProviders,
} from "@core/batch-capabilities";
import {
	batchText,
	fetchProviderBatchApi,
	OPENAI_BATCH_PROVIDER_ID,
	parseUpstreamJson,
} from "@core/batch-provider-adapters";

const MAX_BATCH_FILE_UPLOAD_BYTES = 20 * 1024 * 1024;

function toText(value: unknown): string | null {
	return batchText(value);
}

function proxyResponse(upstream: Response): Response {
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: upstream.headers,
	});
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

async function requireBatchApiAccess(auth: AuthSuccess, requestId: string): Promise<Response | null> {
	if (await isBatchApiAccessEnabled(auth)) return null;
	return jsonPayload({
		error: "forbidden",
		reason: "batch_api_feature_flag_disabled",
		message: "The Batch API is currently limited to the enabled Statsig admin segment.",
		feature_gate: getBatchApiFeatureGateName(),
		request_id: requestId,
		workspace_id: auth.workspaceId,
		status_code: 403,
		error_type: "user",
		error_origin: "gateway",
		generation_id: requestId,
	}, 403);
}

function resolveUploadProvider(req: Request): { ok: true; providerId: string } | { ok: false; response: Response } {
	const url = new URL(req.url);
	const requested =
		toText(url.searchParams.get("provider")) ??
		toText(req.headers.get("x-phaseo-provider")) ??
		toText(req.headers.get("x-ai-stats-provider"));
	const model =
		toText(url.searchParams.get("model")) ??
		toText(req.headers.get("x-phaseo-model")) ??
		toText(req.headers.get("x-ai-stats-model"));
	const requestedProviders = requested
		? resolveRequestedBatchProviders(requested)
		: resolveBatchProvidersFromModel(model);
	const effectiveProviders = requestedProviders.length > 0 ? requestedProviders : [OPENAI_BATCH_PROVIDER_ID];
	const activeFileProviders = resolveBatchProvidersForMode({
		mode: "file",
		requestedProviders: effectiveProviders,
		activeOnly: true,
	});
	if (activeFileProviders.length === 0) {
		return {
			ok: false,
			response: jsonPayload(buildUnsupportedBatchModePayload({
				mode: "file",
				requestedProviders: effectiveProviders,
			}), 400),
		};
	}
	const previewProviderIds = resolveBatchPreviewProviderIds(getBindings().BATCH_API_PREVIEW_PROVIDERS);
	const previewProvider = activeFileProviders.find((provider) => previewProviderIds.includes(provider.providerId));
	if (!previewProvider) {
		return {
			ok: false,
			response: jsonPayload({
				error: {
					type: "forbidden",
					reason: "batch_provider_preview_disabled",
					message: "The selected provider is not enabled for the current Batch API preview.",
					requested_providers: effectiveProviders,
					enabled_providers: previewProviderIds,
				},
			}, 403),
		};
	}
	return { ok: true, providerId: previewProvider.providerId };
}

async function finishUploadClaim(args: {
	workspaceId: string;
	uploadId: string;
	status: "completed" | "failed";
	providerFileId?: string | null;
}): Promise<void> {
	try {
		const { error } = await getSupabaseAdmin().rpc("gateway_finish_batch_file_upload", {
			p_workspace_id: args.workspaceId,
			p_upload_id: args.uploadId,
			p_status: args.status,
			p_provider_file_id: args.providerFileId ?? null,
		});
		if (error) throw error;
	} catch (error) {
		console.error("batch_file_upload_claim_finalize_failed", {
			error,
			workspaceId: args.workspaceId,
			uploadId: args.uploadId,
			status: args.status,
		});
	}
}

async function handleUpload(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const providerResolution = resolveUploadProvider(req);
	if (providerResolution.ok === false) return providerResolution.response;
	const providerId = providerResolution.providerId;
	const declaredLength = Number(req.headers.get("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BATCH_FILE_UPLOAD_BYTES) {
		return jsonPayload({ error: { type: "validation_error", reason: "batch_file_too_large" } }, 413);
	}
	const uploadBody = await req.arrayBuffer();
	if (uploadBody.byteLength <= 0) {
		return jsonPayload({ error: { type: "validation_error", reason: "batch_file_empty" } }, 400);
	}
	if (uploadBody.byteLength > MAX_BATCH_FILE_UPLOAD_BYTES) {
		return jsonPayload({ error: { type: "validation_error", reason: "batch_file_too_large" } }, 413);
	}
	const claim = await getSupabaseAdmin().rpc("gateway_claim_batch_file_upload", {
		p_workspace_id: auth.workspaceId,
		p_upload_id: requestId,
		p_bytes: uploadBody.byteLength,
	});
	if (claim.error) throw claim.error;
	const claimRow = Array.isArray(claim.data) ? claim.data[0] : claim.data;
	if (!claimRow?.ok) {
		const reason = toText(claimRow?.reason) ?? "batch_file_quota_exceeded";
		const status = reason === "batch_file_too_large" ? 413 : reason === "insufficient_funds" ? 402 : 429;
		return jsonPayload({ error: { type: status === 402 ? "insufficient_funds" : "rate_limit_error", reason } }, status);
	}
	let upstream: Response;
	try {
		upstream = await fetchProviderBatchApi(providerId, {
			endpointPath: "/files",
			method: "POST",
			body: uploadBody,
			contentType: req.headers.get("content-type"),
		});
	} catch (error) {
		await finishUploadClaim({ workspaceId: auth.workspaceId, uploadId: requestId, status: "failed" });
		throw error;
	}
	const payload = await parseUpstreamJson(upstream);
	if (!upstream.ok) {
		await finishUploadClaim({ workspaceId: auth.workspaceId, uploadId: requestId, status: "failed" });
		return proxyResponse(upstream);
	}
	if (!payload) {
		await finishUploadClaim({ workspaceId: auth.workspaceId, uploadId: requestId, status: "failed" });
		return jsonPayload({ error: { type: "upstream_error", reason: "batch_file_upload_invalid_response" } }, 502);
	}
	if (upstream.ok && payload) {
		const fileId = toText(payload?.id);
		if (!fileId) {
			await finishUploadClaim({ workspaceId: auth.workspaceId, uploadId: requestId, status: "failed" });
			return jsonPayload({ error: { type: "upstream_error", reason: "batch_file_upload_missing_id" } }, 502);
		}
		try {
			await saveBatchFileMeta(auth.workspaceId, fileId, {
				provider: providerId,
				status: toText(payload?.status) ?? "uploaded",
				purpose: toText(payload?.purpose),
				filename: toText(payload?.filename),
				bytes: typeof payload?.bytes === "number" ? payload.bytes : uploadBody.byteLength,
				keySource: "gateway",
				byokKeyId: null,
			});
			await finishUploadClaim({
				workspaceId: auth.workspaceId,
				uploadId: requestId,
				status: "completed",
				providerFileId: fileId,
			});
		} catch (storeErr) {
			await fetchProviderBatchApi(providerId, {
				endpointPath: `/files/${encodeURIComponent(fileId)}`,
				method: "DELETE",
			}).catch(() => null);
			await finishUploadClaim({
				workspaceId: auth.workspaceId,
				uploadId: requestId,
				status: "failed",
				providerFileId: fileId,
			});
			console.error("file_job_meta_store_failed", {
				error: storeErr,
				workspaceId: auth.workspaceId,
				fileId,
			});
			return err("gateway_error", {
				reason: "batch_file_persistence_failed",
				request_id: requestId,
				workspace_id: auth.workspaceId,
			});
		}
	}
	return proxyResponse(upstream);
}

async function handleList(req: Request) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	return err("not_supported", {
		reason: "file_list_not_supported_with_shared_gateway_key",
		request_id: requestId,
		workspace_id: auth.workspaceId,
	});
}

async function handleRetrieve(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const fileId = String(id ?? "").trim();
	if (!fileId) {
		return err("validation_error", {
			reason: "missing_file_id",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const owned = await getBatchFileMeta(auth.workspaceId, fileId);
	if (!owned) {
		return err("not_found", {
			reason: "file_not_found_or_not_owned",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			file_id: fileId,
		});
	}

	const providerId = owned.provider || OPENAI_BATCH_PROVIDER_ID;
	const upstream = await fetchProviderBatchApi(providerId, {
		endpointPath: `/files/${encodeURIComponent(fileId)}`,
		method: "GET",
	});
	const payload = await parseUpstreamJson(upstream);
	if (upstream.ok && payload) {
		await saveBatchFileMeta(auth.workspaceId, fileId, {
			provider: providerId,
			status: toText(payload?.status) ?? owned.status ?? "available",
			purpose: toText(payload?.purpose) ?? owned.purpose ?? null,
			filename: toText(payload?.filename) ?? owned.filename ?? null,
			bytes: typeof payload?.bytes === "number" ? payload.bytes : owned.bytes ?? null,
			keySource: owned.keySource ?? "gateway",
			byokKeyId: owned.byokKeyId ?? null,
		}).catch((storeErr) => {
			console.error("file_job_meta_refresh_failed", {
				error: storeErr,
				workspaceId: auth.workspaceId,
				fileId,
			});
		});
	}
	return proxyResponse(upstream);
}

async function handleRetrieveContent(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const accessDenied = await requireBatchApiAccess(auth, requestId);
	if (accessDenied) return accessDenied;
	const fileId = String(id ?? "").trim();
	if (!fileId) {
		return err("validation_error", {
			reason: "missing_file_id",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const owned = await getBatchFileMeta(auth.workspaceId, fileId);
	if (!owned) {
		return err("not_found", {
			reason: "file_not_found_or_not_owned",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			file_id: fileId,
		});
	}

	const providerId = owned.provider || OPENAI_BATCH_PROVIDER_ID;
	const upstream = await fetchProviderBatchApi(providerId, {
		endpointPath: `/files/${encodeURIComponent(fileId)}/content`,
		method: "GET",
	});
	return proxyResponse(upstream);
}

export const filesRoutes = new Hono<Env>();

filesRoutes.post("/", withRuntime(handleUpload));
filesRoutes.get("/", withRuntime(handleList));
filesRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
filesRoutes.get("/:id/content", withRuntime((req) => handleRetrieveContent(req, (req as any).param?.("id") ?? new URL(req.url).pathname.split("/").slice(-2, -1)[0] ?? "")));

