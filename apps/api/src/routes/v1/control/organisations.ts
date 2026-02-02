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

type Organisation = {
    organisation_id: string;
    name: string | null;
    country_code: string | null;
    description: string | null;
    colour: string | null;
};

async function handleOrganisations(req: Request) {
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
            .from("data_organisations")
            .select("*", { count: "exact", head: true });

        if (countError) {
            throw new Error(countError.message || "Failed to count organisations");
        }

        // Get paginated data
        const { data: organisations, error: dataError } = await supabase
            .from("data_organisations")
            .select("organisation_id, name, country_code, description, colour")
            .order("name", { ascending: true })
            .range(offset, offset + limit - 1);

        if (dataError) {
            throw new Error(dataError.message || "Failed to load organisations");
        }

        const mapped: Organisation[] = (organisations ?? []).map((org) => ({
            organisation_id: org.organisation_id,
            name: org.name ?? null,
            country_code: org.country_code ?? null,
            description: org.description ?? null,
            colour: org.colour ?? null,
        }));

        const cacheOptions = {
            scope: `organisations:${auth.value.teamId}`,
            ttlSeconds: 300,
            staleSeconds: 600,
        };
        const response = json(
            {
                ok: true,
                limit,
                offset,
                total: count ?? 0,
                organisations: mapped,
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

export const organisationsRoutes = new Hono<Env>();

organisationsRoutes.get("/", withRuntime(handleOrganisations));

