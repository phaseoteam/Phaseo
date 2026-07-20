type WorkersCacheContext = {
	purge(options: { tags: string[] }): Promise<{ success: boolean; errors?: unknown }>;
};

export async function purgeWorkerCacheTags(executionCtx: ExecutionContext, tags: string[]) {
	const uniqueTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
	const cache = (executionCtx as ExecutionContext & { cache?: WorkersCacheContext }).cache;
	if (!cache || uniqueTags.length === 0) return { success: false, unavailable: true, tags: uniqueTags };
	const result = await cache.purge({ tags: uniqueTags });
	return { ...result, unavailable: false, tags: uniqueTags };
}
