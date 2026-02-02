// lib/fetchers/benchmarks/getBenchmark.ts
import { createClient } from "@/utils/supabase/client";
import { cacheLife, cacheTag } from "next/cache";

// BenchmarkPage (with results) is defined later in this file.
export interface Organisation {
    organisation_id: string;
    name?: string | null;
    colour?: string | null;
    // optional display name / logo fields - may be null or absent depending on the DB
    display_name?: string | null;
    logo?: string | null;
    logo_url?: string | null;
}

export interface ModelInfo {
    model_id: string;
    name?: string | null;
    release_date?: string | null;
    announcement_date?: string | null;
    organisation?: Organisation | null;
}

export interface BenchmarkResult {
    id: string;
    model_id: string;
    // score can be a string or number in the DB; allow nulls too
    score: string | number | null;
    is_self_reported: boolean;
    model?: ModelInfo | null;
    // Additional optional fields returned by the nested query
    other_info?: any | null;
    source_link?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    rank?: number | null;
}

export interface BenchmarkPage {
    id: string;
    // name may be null in the database
    name: string | null;
    category: string | null;
    total_models: number | null;
    link: string | null;
    results: BenchmarkResult[];
    type?: string | null;
}

export default async function getBenchmark(
    benchmark_id: string,
    includeHidden: boolean
): Promise<BenchmarkPage | null> {
    const supabase = await createClient(); // must allow read via RLS for these tables

    // Fetch the single benchmark and include nested results -> models -> organisations
    const { data: benchmarks, error } = await supabase
        .from("data_benchmarks")
        .select(
            `
            id,
            name,
            category,
            total_models,
            link,
            type,
            data_benchmark_results(
                id,
                model_id,
                score,
                is_self_reported,
                other_info,
                source_link,
                created_at,
                updated_at,
                rank,
                data_models(
                    model_id,
                    name,
                    release_date,
                    announcement_date,
                    organisation_id,
                    hidden,
                    data_organisations(*)
                )
            )
        `
        )
        .eq("id", benchmark_id)
        .single();

    console.log("Fetched benchmark data:", { data: benchmarks, error });

    if (error) {
        throw new Error(error.message || "Failed to fetch benchmark");
    }

    const row = benchmarks as any | undefined;
    if (!row) return null;

    const results: BenchmarkResult[] = (row.data_benchmark_results ?? [])
        .filter((r: any) => {
            if (includeHidden) return true;
            return !r?.data_models?.hidden;
        })
        .map((r: any) => {
        const modelRow = r.data_models ?? null;
        const orgRow = modelRow?.data_organisations ?? null;

        const organisation: Organisation | null = orgRow
            ? {
                organisation_id: orgRow.organisation_id,
                name: orgRow.name ?? null,
                colour: orgRow.colour ?? null,
                display_name: orgRow.display_name ?? orgRow.name ?? null,
                // some schemas use `logo` or `logo_url`
                logo: orgRow.logo ?? null,
                logo_url: orgRow.logo_url ?? null,
            }
            : null;

        const model: ModelInfo | null = modelRow
            ? {
                model_id: modelRow.model_id,
                name: modelRow.name ?? null,
                release_date: modelRow.release_date ?? null,
                announcement_date: modelRow.announcement_date ?? null,
                organisation: organisation,
            }
            : null;

        return {
            id: r.id,
            model_id: r.model_id,
            score: r.score,
            is_self_reported: !!r.is_self_reported,
            other_info: r.other_info ?? null,
            source_link: r.source_link ?? null,
            created_at: r.created_at ?? null,
            updated_at: r.updated_at ?? null,
            rank: r.rank ?? null,
            model,
        } as BenchmarkResult;
    });

    const formatted: BenchmarkPage = {
        id: row.id,
        name: row.name ?? null,
        category: row.category ?? null,
        total_models: row.total_models ?? null,
        link: row.link ?? null,
        results,
        type: row.type ?? null,
    };

    return formatted;
}

export async function getBenchmarkCached(
    benchmark_id: string,
    includeHidden: boolean
): Promise<BenchmarkPage | null> {
    "use cache";

    cacheLife("days");
    cacheTag("data:benchmarks");

    console.log("[fetch] HIT DB for benchmark:", benchmark_id);
    return getBenchmark(benchmark_id, includeHidden);
}
