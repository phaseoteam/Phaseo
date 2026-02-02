// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime, cacheHeaders, cacheResponse } from "@/routes/utils";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function parsePaginationParam(raw: string | null, fallback: number, max: number): number {
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    const normalized = Math.floor(parsed);
    if (normalized <= 0) return fallback;
    if (normalized > max) return max;
    return normalized;
}

function parseOffsetParam(raw: string | null): number {
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
}

type Provider = {
    api_provider_id: string;
    api_provider_name: string | null;
    description: string | null;
    link: string | null;
    country_code: string | null;
};

async function handleProviders(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    const url = new URL(req.url);
    const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseOffsetParam(url.searchParams.get("offset"));

    try {
        const supabase = getSupabaseAdmin();

        // Get total count
        const { count, error: countError } = await supabase
            .from("data_api_providers")
            .select("*", { count: "exact", head: true });

        if (countError) {
            throw new Error(countError.message || "Failed to count providers");
        }

        // Get paginated data
        const { data: providers, error: dataError } = await supabase
            .from("data_api_providers")
            .select("api_provider_id, api_provider_name, description, link, country_code")
            .order("api_provider_name", { ascending: true })
            .range(offset, offset + limit - 1);

        if (dataError) {
            throw new Error(dataError.message || "Failed to load providers");
        }

        const mapped: Provider[] = (providers ?? []).map((provider) => ({
            api_provider_id: provider.api_provider_id,
            api_provider_name: provider.api_provider_name ?? null,
            description: provider.description ?? null,
            link: provider.link ?? null,
            country_code: provider.country_code ?? null,
        }));

        const cacheOptions = {
            scope: `providers:${auth.value.teamId}`,
            ttlSeconds: 300,
            staleSeconds: 600,
        };
        const response = json(
            {
                ok: true,
                limit,
                offset,
                total: count ?? 0,
                providers: mapped,
            },
            200,
            cacheHeaders(cacheOptions)
        );
        return cacheResponse(req, response, cacheOptions);
    } catch (error: any) {
        return json(
            { ok: false, error: "failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

export const providersRoutes = new Hono<Env>();

providersRoutes.get("/", withRuntime(handleProviders));

