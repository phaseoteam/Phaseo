// lib/fetchers/landing/dbStats.ts
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

export type DbStats = {
    models: number;
    organisations: number;
    benchmarks: number;
    benchmark_results: number;
    api_providers: number;
    // pricing?: number;            // dropped per your note
    // subscription_plans?: number; // dropped per your note
};

function getCount(res: { count: number | null; error: any }) {
    if (res.error) {
        // Optional: log to your telemetry
        return 0;
    }
    return res.count ?? 0;
}

export default async function getDbStats(): Promise<DbStats> {
    "use cache";

    cacheLife("hours");
    cacheTag("landing:db-stats");
    cacheTag("data:models");
    cacheTag("data:organisations");
    cacheTag("data:benchmarks");
    cacheTag("data:api_providers");

    const supabase = createAdminClient();
    const includeHidden = false;

    // Use a HEAD count to avoid transferring rows
    const [
        modelsRes,
        orgsRes,
        benchesRes,
        benchResultsRes,
        providersRes,
    ] = await Promise.all([
        applyHiddenFilter(
            supabase.from("data_models").select("*", { count: "exact", head: true }),
            includeHidden
        ),
        supabase.from("data_organisations").select("*", { count: "exact", head: true }),
        supabase.from("data_benchmarks").select("*", { count: "exact", head: true }),
        supabase.from("data_benchmark_results").select("*", { count: "exact", head: true }),
        supabase.from("data_api_providers").select("*", { count: "exact", head: true }),
    ]);

    return {
        models: getCount(modelsRes),
        organisations: getCount(orgsRes),
        benchmarks: getCount(benchesRes),
        benchmark_results: getCount(benchResultsRes),
        api_providers: getCount(providersRes),
    };
}
