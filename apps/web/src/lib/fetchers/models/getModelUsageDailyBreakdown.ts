export type ModelUsageDailyBreakdownRow = {
	dayBucket: string; modelId: string; providerId: string; endpoint: string; requests: number; successRequests: number; failedRequests: number; neutralRequests: number; rateLimitedRequests: number; totalTokens: number; inputTokens: number; outputTokens: number; reasoningTokens: number; inputTextTokens: number; outputTextTokens: number; inputImageTokens: number; outputImageTokens: number; inputAudioTokens: number; outputAudioTokens: number; inputVideoTokens: number; outputVideoTokens: number; imageInputs: number; imageOutputs: number; audioInputs: number; audioOutputs: number; videoInputs: number; videoOutputs: number; cachedReadTokens: number; cachedWriteTokens: number; cachedReadTextTokens: number; cachedWriteTextTokens: number; cachedWriteTextTokens5m: number; cachedWriteTextTokens1h: number; cachedReadImageTokens: number; cachedWriteImageTokens: number; cachedReadAudioTokens: number; cachedWriteAudioTokens: number; cachedReadVideoTokens: number; cachedWriteVideoTokens: number; inputQuadTokens: number; outputQuadTokens: number; totalQuadTokens: number; textQuadTokens: number; rerankQuadTokens: number; embeddingQuadTokens: number; moderationQuadTokens: number; ocrQuadTokens: number; imageMegapixels: number; audioSeconds: number; videoPixelSeconds: number; inputCharacters: number; outputCharacters: number; totalCharacters: number; totalCostNanos: number; avgLatencyMs: number | null; avgGenerationMs: number | null; avgThroughput: number | null;
};

export async function getModelUsageDailyBreakdown(args: {
	modelId: string; modelAliases?: string[]; providerIds?: string[]; days?: number; since?: string; until?: string;
}): Promise<ModelUsageDailyBreakdownRow[]> {
	const query = new URLSearchParams();
	if (args.providerIds?.length) query.set("provider_ids", [...new Set(args.providerIds)].sort().join(","));
	if (args.days != null) query.set("days", String(args.days));
	if (args.since) query.set("since", args.since);
	if (args.until) query.set("until", args.until);
	void args.modelAliases;
	return (await fetchPublicWebApi<{ rows: ModelUsageDailyBreakdownRow[] }>(
		`/api/_web/models/${encodeURIComponent(args.modelId)}/usage-daily?${query.toString()}`,
	)).rows;
}
import { fetchPublicWebApi } from "@/lib/web-api/client";
