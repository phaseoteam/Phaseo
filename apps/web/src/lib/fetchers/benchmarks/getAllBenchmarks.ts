// lib/fetchers/benchmarks/getAllBenchmarks.ts
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export interface BenchmarkCard {
    benchmark_id: string;
    benchmark_name: string;
    total_models: number;
}

/**
 * Fetch all benchmarks exclusively from the database `data_benchmarks` table.
 */
export async function getAllBenchmarks(sorted = false): Promise<BenchmarkCard[]> {
    const supabase = createAdminClient();

    // Base query
    let query = supabase.from("data_benchmarks").select("id, name, total_models");

    // Apply ordering based on flag
    if (sorted) {
        // Sort by total_models DESC, then name ASC
        query = query.order("total_models", { ascending: false, nullsFirst: false }).order("name", { ascending: true });
    } else {
        // Sort alphabetically A-Z only
        query = query.order("name", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
        // Surface DB errors to caller
        throw error;
    }

    if (!data || !Array.isArray(data)) return [];

    return data
        .map((r: any) => ({
            benchmark_id: r.id,
            benchmark_name: r.name ?? '',
            total_models: r.total_models ?? 0,
        }))
        .filter((b) => b.benchmark_id);
}

export async function getAllBenchmarksCached(sorted = false): Promise<BenchmarkCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("frontend:benchmarks");
    cacheTag("data:benchmarks");
    cacheTag("data:benchmarks:list");

    console.log("[fetch] HIT for benchmarks");
    return getAllBenchmarks(sorted);
}
