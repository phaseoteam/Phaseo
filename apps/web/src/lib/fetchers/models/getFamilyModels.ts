import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type FamilyModelStatus =
    | "Rumoured"
    | "Announced"
    | "Limited Access"
    | "Withheld"
    | "Available"
    | "Deprecated"
    | "Retired"
    | null;

export interface FamilyModelItem {
    model_id: string;
    name: string;
    organisation_id: string;
    status?: FamilyModelStatus;
    release_date?: string | null;
    announcement_date?: string | null;
    organisation?: {
        name?: string | null;
        colour?: string | null;
        country_code?: string | null;
    } | null;
}

export interface FamilyInfo {
    family_id: string;
    family_name: string;
    models: FamilyModelItem[];
}

export default async function getFamilyModels(
    familyId: string,
    includeHidden: boolean
): Promise<FamilyInfo | null> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from("data_model_families")
        .select(`family_id, family_name, models:data_models(
            model_id,
            name,
            organisation_id,
            status,
            hidden,
            release_date,
            announcement_date,
            organisation:data_organisations!data_models_organisation_id_fkey(name, colour, country_code)
        )`)
        .eq("family_id", familyId)
        .single();

    console.log("[fetch] HIT DB for family models", familyId);
    // console.log("Family data:", data, "Error:", error);

    if (error) {
        throw error;
    }

    if (!data) return null;

    const models = Array.isArray(data.models)
        ? data.models
            .filter((m: any) => includeHidden || !m.hidden)
            .map((m: any) => ({
                model_id: m.model_id,
                name: m.name,
                organisation_id: m.organisation_id,
                status: m.status ?? null,
                release_date: m.release_date ?? null,
                announcement_date: m.announcement_date ?? null,
                organisation: m.organisation
                    ? {
                        name: m.organisation.name ?? null,
                        colour: m.organisation.colour ?? null,
                        country_code: m.organisation.country_code ?? null,
                    }
                    : null,
            }))
        : [];

    return {
        family_id: data.family_id,
        family_name: data.family_name,
        models,
    };
}

/**
 * Cached version of getFamilyModels.
 *
 * Usage: await getFamilyModelsCached(familyId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getFamilyModelsCached(
    familyId: string,
    includeHidden: boolean
): Promise<FamilyInfo | null> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("data:models");
    cacheTag("data:families");
    cacheTag(`data:families:${familyId}`);
    cacheTag("frontend:families");

    console.log("[fetch] HIT DB for family models", familyId);
    return getFamilyModels(familyId, includeHidden);
}
