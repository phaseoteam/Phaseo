// Purpose: Expose raw model metadata from the catalogue dataset.
// Why: Separates source-of-truth model data from gateway-servable API model listings.
// How: Reads data_models and applies lightweight filters/pagination.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime, cacheHeaders, cacheResponse } from "@/routes/utils";

type OrganisationDetails = {
    organisation_id?: string | null;
    name?: string | null;
    country_code?: string | null;
    colour?: string | null;
};

type DataModelRow = {
    model_id?: string | null;
    name?: string | null;
    release_date?: string | null;
    deprecation_date?: string | null;
    retirement_date?: string | null;
    status?: string | null;
    hidden?: boolean | null;
    input_types?: unknown;
    output_types?: unknown;
    organisation_id?: string | null;
    organisation?: OrganisationDetails | OrganisationDetails[] | null;
};

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

function parseBooleanParam(raw: string | null, fallback: boolean): boolean {
    if (!raw) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no") return false;
    return fallback;
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : String(item)))
            .filter((item) => item.length > 0);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const inner = trimmed.slice(1, -1);
            if (!inner) return [];
            return inner
                .split(",")
                .map((part) => part.trim().replace(/^"|"$/g, ""))
                .filter((part) => part.length > 0);
        }
        return trimmed
            .split(/[,\s]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    return [];
}

function parseMultiValue(params: URLSearchParams, name: string): string[] {
    const values = params.getAll(name);
    if (!values.length) return [];
    return values
        .flatMap((value) => toStringArray(value))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function parseDate(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function compareRows(a: DataModelRow, b: DataModelRow): number {
    const aPrimary = parseDate(a.release_date) ?? Number.NEGATIVE_INFINITY;
    const bPrimary = parseDate(b.release_date) ?? Number.NEGATIVE_INFINITY;
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;
    const aName = (a.name ?? "").toLowerCase();
    const bName = (b.name ?? "").toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);
    return String(a.model_id ?? "").localeCompare(String(b.model_id ?? ""));
}

async function handleDataModels(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    const url = new URL(req.url);
    const includeHidden = parseBooleanParam(url.searchParams.get("include_hidden"), false);
    const statuses = parseMultiValue(url.searchParams, "status");
    const organisationIds = parseMultiValue(url.searchParams, "organisation");
    const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseOffsetParam(url.searchParams.get("offset"));

    try {
        const supabase = getSupabaseAdmin();
        let query = supabase
            .from("data_models")
            .select(
                "model_id, name, release_date, deprecation_date, retirement_date, status, hidden, input_types, output_types, organisation_id, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name, country_code, colour)"
            );

        if (!includeHidden) {
            query = query.eq("hidden", false);
        }
        if (statuses.length) {
            query = query.in("status", statuses);
        }
        if (organisationIds.length) {
            query = query.in("organisation_id", organisationIds);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(error.message || "Failed to load model data");
        }

        const sortedRows = (data ?? [])
            .filter((row: DataModelRow) => Boolean(row?.model_id))
            .sort(compareRows);
        const paged = sortedRows.slice(offset, offset + limit);

        const models = paged.map((row: DataModelRow) => {
            const organisation = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation;
            return {
                model_id: row.model_id ?? null,
                name: row.name ?? null,
                release_date: row.release_date ?? null,
                deprecation_date: row.deprecation_date ?? null,
                retirement_date: row.retirement_date ?? null,
                status: row.status ?? null,
                hidden: Boolean(row.hidden),
                input_types: toStringArray(row.input_types),
                output_types: toStringArray(row.output_types),
                organisation: organisation
                    ? {
                        organisation_id: organisation.organisation_id ?? null,
                        name: organisation.name ?? null,
                        country_code: organisation.country_code ?? null,
                        colour: organisation.colour ?? null,
                    }
                    : null,
            };
        });

        const cacheOptions = {
            scope: `data-models:${auth.value.teamId}`,
            ttlSeconds: 300,
            staleSeconds: 600,
        };
        const response = json(
            {
                ok: true,
                limit,
                offset,
                total: sortedRows.length,
                include_hidden: includeHidden,
                models,
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

export const dataModelsRoutes = new Hono<Env>();

dataModelsRoutes.get("/", withRuntime(handleDataModels));

