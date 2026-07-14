// lib/fetchers/organisations/getAllOrganisations.ts
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export interface OrganisationCard {
    organisation_id: string;
    organisation_name: string | null;
    country_code: string | null;
    colour: string | null;
}

export async function getAllOrganisations(): Promise<OrganisationCard[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from("data_organisations")
        .select("organisation_id, name, country_code, colour")
        .order("name", { ascending: true });

    if (error) {
        // eslint-disable-next-line no-console
        console.warn("[getAllOrganisations] supabase error fetching organisations", error.message);
        throw error;
    }

    const rows: any[] = data ?? [];

    const organisations: OrganisationCard[] = rows.map((raw: any) => ({
        organisation_id: raw.organisation_id ?? raw.id ?? raw.slug ?? "",
        organisation_name: raw.name ?? raw.organisation_name ?? null,
        colour: raw.colour ?? raw.color ?? raw.colour_hex ?? null,
        country_code: raw.country_code ?? raw.country ?? null,
    })).filter(o => !!o.organisation_id);

    return organisations;
}

export async function getAllOrganisationsCached(): Promise<OrganisationCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("frontend:organisations");
    cacheTag("data:organisations");
    cacheTag("data:organisations:list");

    console.log("[fetch] HIT DB for organisations");
    return getAllOrganisations();
}
