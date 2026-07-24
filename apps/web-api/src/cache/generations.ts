import type { SupabaseClient } from "@supabase/supabase-js";

export type CacheGeneration = {
	scope: string;
	generation: number;
	updatedAt: string | null;
};

export async function getCacheGeneration(
	db: SupabaseClient,
	scope: string,
): Promise<CacheGeneration> {
	const result = await db
		.from("web_cache_generations")
		.select("generation,updated_at")
		.eq("scope", scope)
		.maybeSingle();

	if (result.error) {
		console.warn("web_cache_generation_unavailable", {
			scope,
			code: result.error.code,
		});
		return { scope, generation: 1, updatedAt: null };
	}

	return {
		scope,
		generation: Math.max(1, Number(result.data?.generation ?? 1)),
		updatedAt: result.data?.updated_at ?? null,
	};
}
