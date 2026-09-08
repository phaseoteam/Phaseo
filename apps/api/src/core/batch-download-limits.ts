import { getBindings } from "@/runtime/env";

export const BATCH_DOWNLOAD_LIMIT = 10;
export const BATCH_DOWNLOAD_WINDOW_MS = 30 * 60 * 1000;

export type BatchDownloadAdmission = { allowed: boolean; retryAfterSeconds: number };

export async function admitBatchDownload(workspaceId: string, batchId: string): Promise<BatchDownloadAdmission> {
	const namespace = getBindings().PROVIDER_RATE_LIMITS;
	if (!namespace) throw new Error("batch_download_limiter_unavailable");
	const stub = namespace.getByName(`batch-download:${JSON.stringify([workspaceId, batchId])}`) as unknown as {
		admitBatchDownload(): Promise<BatchDownloadAdmission>;
	};
	return stub.admitBatchDownload();
}
