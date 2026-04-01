// Purpose: Track async batch jobs with team ownership.
// Why: Batch APIs are long-running and require team-scoped lookup on retrieval.
// How: Persist/read batch metadata from shared async-operations storage.

import {
	getAsyncOperation,
	isAsyncOperationBilled,
	markAsyncOperationBilled,
	upsertAsyncOperation,
} from "@core/async-operations";

export type BatchJobMeta = {
	provider: string;
	requestId?: string | null;
	sessionId?: string | null;
	appId?: string | null;
	model?: string | null;
	status?: string | null;
	nativeBatchId?: string | null;
	endpoint?: string | null;
	completionWindow?: string | null;
	inputFileId?: string | null;
	outputFileId?: string | null;
	errorFileId?: string | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	createdAt?: number;
};

export type BatchFileMeta = {
	provider: string;
	status?: string | null;
	purpose?: string | null;
	filename?: string | null;
	bytes?: number | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	createdAt?: number;
};

const BATCH_FILE_INTERNAL_PREFIX = "__file__:";

function parseBatchMeta(value: unknown): BatchJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: BatchJobMeta = { provider };
	if (typeof source.requestId === "string") out.requestId = source.requestId;
	if (typeof source.request_id === "string") out.requestId = source.request_id;
	if (typeof source.sessionId === "string") out.sessionId = source.sessionId;
	if (typeof source.session_id === "string") out.sessionId = source.session_id;
	if (typeof source.appId === "string") out.appId = source.appId;
	if (typeof source.app_id === "string") out.appId = source.app_id;
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.status === "string") out.status = source.status;
	if (typeof source.nativeBatchId === "string") out.nativeBatchId = source.nativeBatchId;
	if (typeof source.endpoint === "string") out.endpoint = source.endpoint;
	if (typeof source.completionWindow === "string") out.completionWindow = source.completionWindow;
	if (typeof source.inputFileId === "string") out.inputFileId = source.inputFileId;
	if (typeof source.outputFileId === "string") out.outputFileId = source.outputFileId;
	if (typeof source.errorFileId === "string") out.errorFileId = source.errorFileId;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
	if (typeof source.createdAt === "number") out.createdAt = source.createdAt;
	return out;
}

function parseBatchFileMeta(value: unknown): BatchFileMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	if (source.resource !== "file") return null;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: BatchFileMeta = { provider };
	if (typeof source.status === "string") out.status = source.status;
	if (typeof source.purpose === "string") out.purpose = source.purpose;
	if (typeof source.filename === "string") out.filename = source.filename;
	if (typeof source.bytes === "number") out.bytes = source.bytes;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
	if (typeof source.createdAt === "number") out.createdAt = source.createdAt;
	return out;
}

export async function saveBatchJobMeta(
	teamId: string,
	batchId: string,
	meta: BatchJobMeta,
): Promise<void> {
	if (!teamId || !batchId) return;
	const payload = { ...meta, createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		teamId,
		kind: "batch",
		internalId: batchId,
		requestId: payload.requestId ?? null,
		sessionId: payload.sessionId ?? null,
		appId: payload.appId ?? null,
		nativeId: payload.nativeBatchId ?? batchId,
		provider: payload.provider,
		model: payload.model ?? null,
		status: payload.status ?? null,
		meta: payload as unknown as Record<string, unknown>,
	});
}

export async function getBatchJobMeta(teamId: string, batchId: string): Promise<BatchJobMeta | null> {
	if (!teamId || !batchId) return null;
	const record = await getAsyncOperation(teamId, "batch", batchId);
	if (!record) return null;
	const merged = {
		...(record.meta ?? {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.model ? { model: record.model } : {}),
		...(record.status ? { status: record.status } : {}),
	};
	return parseBatchMeta(merged);
}

export async function saveBatchFileMeta(
	teamId: string,
	fileId: string,
	meta: BatchFileMeta,
): Promise<void> {
	if (!teamId || !fileId) return;
	const payload = { ...meta, resource: "file", createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		teamId,
		kind: "batch",
		internalId: `${BATCH_FILE_INTERNAL_PREFIX}${fileId}`,
		nativeId: fileId,
		provider: payload.provider,
		model: null,
		status: payload.status ?? null,
		meta: payload as unknown as Record<string, unknown>,
	});
}

export async function getBatchFileMeta(teamId: string, fileId: string): Promise<BatchFileMeta | null> {
	if (!teamId || !fileId) return null;
	const record = await getAsyncOperation(teamId, "batch", `${BATCH_FILE_INTERNAL_PREFIX}${fileId}`);
	if (!record) return null;
	const merged = {
		...(record.meta ?? {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.status ? { status: record.status } : {}),
	};
	return parseBatchFileMeta(merged);
}

export async function isBatchJobBilled(teamId: string, batchId: string): Promise<boolean> {
	return isAsyncOperationBilled(teamId, "batch", batchId);
}

export async function markBatchJobBilled(teamId: string, batchId: string): Promise<boolean> {
	return markAsyncOperationBilled(teamId, "batch", batchId);
}
