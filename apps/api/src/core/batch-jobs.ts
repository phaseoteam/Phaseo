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
	model?: string | null;
	status?: string | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	createdAt?: number;
};

function parseBatchMeta(value: unknown): BatchJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: BatchJobMeta = { provider };
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.status === "string") out.status = source.status;
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
		nativeId: batchId,
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

export async function isBatchJobBilled(teamId: string, batchId: string): Promise<boolean> {
	return isAsyncOperationBilled(teamId, "batch", batchId);
}

export async function markBatchJobBilled(teamId: string, batchId: string): Promise<boolean> {
	return markAsyncOperationBilled(teamId, "batch", batchId);
}
