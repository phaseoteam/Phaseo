// lib/fetchers/organisations/getOrganisation.ts
import { cacheLife, cacheTag } from "next/cache";
import {
    ModelCard,
    mapRawToModelCard,
} from "@/lib/fetchers/models/getAllModels";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

const DEFAULT_LATEST_MODELS_LIMIT = 8;

export interface OrganisationOverview {
    organisation_id: string;
    name: string;
    country_code: string | null;
    description: string | null;
    colour: string | null;
    updated_at?: string | null;
    organisation_links: { platform: string; url: string }[];
    recent_models: OrganisationModelCards[]; // up to the latestModelsLimit (default 8)
}

export interface OrganisationModelCards extends ModelCard {
    status: string | null;
}

export type OrganisationData = OrganisationOverview & { models: OrganisationModelsGrouped };

export interface OrganisationModelsGrouped {
    [status: string]: OrganisationModelCards[];
}

export async function getOrganisationData(
    organisationId: string,
    latestModelsLimit: number = DEFAULT_LATEST_MODELS_LIMIT,
    includeHidden: boolean
): Promise<OrganisationData> {
    if (!organisationId || typeof organisationId !== "string") {
        throw new Error("getOrganisationData: organisationId must be a non-empty string");
    }

    const parsedLimit = Number.isFinite(latestModelsLimit)
        ? Math.max(1, Math.floor(latestModelsLimit))
        : DEFAULT_LATEST_MODELS_LIMIT;

    const supabase = await createClient();

    // Fetch organisation and links in one query via joins
    const { data: orgs, error: orgError } = await supabase
        .from("data_organisations")
        .select(`organisation_id, name, country_code, description, colour, updated_at, organisation_links: data_organisation_links(url, platform)`)
        .eq("organisation_id", organisationId)
        .limit(1)
        .maybeSingle();

    if (orgError) {
        console.warn("[getOrganisation] supabase error fetching organisation", orgError.message);
        throw orgError;
    }

    const organisationRaw: any = orgs ?? {};

    // Fetch all models for the org ordered by release_date desc
    const { data: modelsData, error: modelsError } = await applyHiddenFilter(
        supabase.from("data_models").select(`model_id, name, status, release_date, announcement_date, hidden`),
        includeHidden
    )
        .eq("organisation_id", organisationId)
        .not("release_date", "is", null)
        .not("announcement_date", "is", null)
        .order("release_date", { ascending: false })
        .limit(parsedLimit);

    if (modelsError) {
        console.warn("[getOrganisation] supabase error fetching models", modelsError.message);
        throw modelsError;
    }

    const organisationOverrides = {
        organisation_id: organisationId,
        organisation_name: organisationRaw?.name ?? null,
        organisation_colour: organisationRaw?.colour ?? null,
    };

    const allModels: OrganisationModelCards[] = (modelsData ?? []).map(
        (raw: any) => ({
            ...mapRawToModelCard(raw, organisationOverrides),
            status: raw?.status ?? null,
        })
    );

    // recent_models: sort by release_date (desc), fallback to announcement_date (desc), then take up to latestModelsLimit
    const getTimestamp = (model: OrganisationModelCards) =>
        model.primary_timestamp ?? 0;
    const sortedByDate: OrganisationModelCards[] = [...allModels].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    );

    const recent_models: OrganisationModelCards[] = sortedByDate
        .slice(0, parsedLimit)
        .map((m) => ({ ...m }));

    const groups: OrganisationModelsGrouped = {};
    for (const card of allModels) {
        const statusKey = card.status ?? "unknown";
        if (!groups[statusKey]) groups[statusKey] = [];
        groups[statusKey].push(card);
    }

    const overview: OrganisationOverview = {
        organisation_id: organisationRaw.organisation_id ?? organisationId,
        name: organisationRaw.name ?? organisationId,
        country_code: organisationRaw.country_code ?? null,
        description: organisationRaw.description ?? null,
        colour: organisationRaw.colour ?? null,
        updated_at: organisationRaw.updated_at ?? null,
        organisation_links: (organisationRaw.organisation_links ?? []).map((l: any) => ({ platform: l.platform, url: l.url })),
        recent_models,
    };

    // Return the organisation object directly (so callers can do organisation.name)
    return { ...overview, models: groups };
}

export async function getOrganisationDataCached(
    organisationId: string,
    latestModelsLimit: number = DEFAULT_LATEST_MODELS_LIMIT,
    includeHidden: boolean
): Promise<OrganisationData> {
    "use cache";

    cacheLife("days");
    cacheTag("data:organisations");

    console.log(`[fetch] HIT JSON for organisation data ${organisationId}`);
    return getOrganisationData(organisationId, latestModelsLimit, includeHidden);
}

// Fetch all models for an organisation (raw, mapped to OrganisationModelCards)
export async function getOrganisationModels(
    organisationId: string,
    includeHidden: boolean
): Promise<OrganisationModelCards[]> {
    if (!organisationId || typeof organisationId !== 'string') {
        throw new Error('getOrganisationModels: organisationId must be a non-empty string');
    }

    const supabase = await createClient();

    // Fetch organisation metadata (name and colour) so we can include it on each model card
    const { data: orgData, error: orgError } = await supabase
        .from('data_organisations')
        .select('name, colour')
        .eq('organisation_id', organisationId)
        .limit(1)
        .maybeSingle();

    if (orgError) {
        console.warn('[getOrganisationModels] supabase error fetching organisation', orgError.message);
        throw orgError;
    }

    const orgName: string | null = orgData?.name ?? null;
    const orgColour: string | null = orgData?.colour ?? null;

    const { data: modelsData, error: modelsError } = await applyHiddenFilter(
        supabase.from("data_models").select(
            `model_id, name, status, release_date, announcement_date, organisation_id, hidden`
        ),
        includeHidden
    )
        .eq("organisation_id", organisationId)
        .order("release_date", { ascending: false });

    if (modelsError) {
        console.warn('[getOrganisationModels] supabase error fetching models', modelsError.message);
        throw modelsError;
    }

    const allModels: OrganisationModelCards[] = (modelsData ?? []).map(
        (raw: any) => ({
            ...mapRawToModelCard(raw, {
                organisation_id: organisationId,
                organisation_name: orgName,
                organisation_colour: orgColour,
            }),
            status: raw?.status ?? null,
        })
    );

    return allModels;
}

export async function getOrganisationModelsCached(
    organisationId: string,
    includeHidden: boolean
): Promise<OrganisationModelCards[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:organisations");

    console.log(`[fetch] HIT JSON for organisation models ${organisationId}`);
    return getOrganisationModels(organisationId, includeHidden);
}
