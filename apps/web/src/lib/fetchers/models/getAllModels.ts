// lib/fetchers/models/getAllModels.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "./visibility";

export interface ModelCard {
    model_id: string;
    name: string;
    organisation_id: string;
    organisation_name: string | null;
    organisation_colour: string | null;
    status?: string | null;
    hidden?: boolean;
    release_date?: string | null;
    announcement_date?: string | null;
    primary_date: string | null;
    primary_timestamp: number | null;
    primary_group_key: string | null;
}

type PrimaryDateInfo = {
    primary_date: string | null;
    primary_timestamp: number | null;
    primary_group_key: string | null;
};

function derivePrimaryDate(raw: any): PrimaryDateInfo {
    const candidates = [raw.release_date, raw.announcement_date];
    const primary_date = candidates.find(
        (value) => value && typeof value === "string"
    ) ?? null;

    if (!primary_date) {
        return {
            primary_date: null,
            primary_timestamp: null,
            primary_group_key: null,
        };
    }

    const parsed = new Date(primary_date);
    if (Number.isNaN(parsed.getTime())) {
        return {
            primary_date,
            primary_timestamp: null,
            primary_group_key: null,
        };
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    return {
        primary_date,
        primary_timestamp: parsed.getTime(),
        primary_group_key: `${year}-${month}`,
    };
}

export function mapRawToModelCard(
    raw: any,
    overrides: Partial<ModelCard> = {}
): ModelCard {
    const baseCard: ModelCard = {
        model_id: raw.model_id ?? raw.id ?? raw.slug ?? '',
        name: raw.name ?? '',
        organisation_id: raw.organisation_id ?? '',
        organisation_name: raw.organisation?.name ?? null,
        organisation_colour:
            raw.organisation?.colour ?? raw.organisation?.color ?? null,
        status: raw.status ?? null,
        hidden: Boolean(raw.hidden),
        release_date: raw.release_date ?? null,
        announcement_date: raw.announcement_date ?? null,
        primary_date: null,
        primary_timestamp: null,
        primary_group_key: null,
    };

    return {
        ...baseCard,
        ...derivePrimaryDate(raw),
        ...overrides,
    };
}

type GetModelsFilter = {
    search?: string;
    includeHidden?: boolean;
};

async function fetchModelsFromDb(filters: GetModelsFilter): Promise<any[]> {
    const supabase = await createClient();
    const includeHidden = Boolean(filters.includeHidden);

    const search = filters.search?.trim() ?? "";

    const baseSelect = `
            model_id,
            name,
            status,
            organisation_id,
            hidden,
            release_date,
            announcement_date,
            organisation: data_organisations (name, colour)
        `;

    // No search filter: simple ordered query
    if (!search) {
        const query = applyHiddenFilter(
            supabase.from("data_models").select(baseSelect),
            includeHidden
        );
        const { data, error } = await query.order("name", { ascending: true });

        if (error) {
            // eslint-disable-next-line no-console
            console.warn(
                "[getAllModels] supabase error fetching models",
                error.message
            );
            throw error;
        }

        return (data ?? []) as any[];
    }

    const like = `%${search}%`;

    // 1) Models whose name matches the search
    const [
        { data: byNameData, error: byNameError },
        { data: orgsData, error: orgsError },
    ] = await Promise.all([
        applyHiddenFilter(
            supabase.from("data_models").select(baseSelect),
            includeHidden
        ).ilike("name", like),
        supabase
            .from("data_organisations")
            .select("organisation_id")
            .ilike("name", like),
    ]);

    if (byNameError) {
        // eslint-disable-next-line no-console
        console.warn(
            "[getAllModels] supabase error fetching models by name",
            byNameError.message
        );
        throw byNameError;
    }

    if (orgsError) {
        // eslint-disable-next-line no-console
        console.warn(
            "[getAllModels] supabase error fetching organisations by name",
            orgsError.message
        );
        throw orgsError;
    }

    const orgIds = (orgsData ?? [])
        .map((row: any) => row.organisation_id)
        .filter((id: unknown): id is string => typeof id === "string");

    let byOrgData: any[] = [];

    if (orgIds.length > 0) {
        const {
            data: modelsByOrg,
            error: modelsByOrgError,
        } = await applyHiddenFilter(
            supabase.from("data_models").select(baseSelect),
            includeHidden
        ).in("organisation_id", orgIds);

        if (modelsByOrgError) {
            // eslint-disable-next-line no-console
            console.warn(
                "[getAllModels] supabase error fetching models by organisation",
                modelsByOrgError.message
            );
            throw modelsByOrgError;
        }

        byOrgData = (modelsByOrg ?? []) as any[];
    }

    // Merge and de-duplicate by model_id
    const combined = [...(byNameData ?? []), ...byOrgData];

    const byId = new Map<string, any>();
    for (const row of combined) {
        const id =
            (row as any).model_id ?? (row as any).id ?? (row as any).slug;
        if (!id) continue;
        if (!byId.has(id)) {
            byId.set(id, row);
        }
    }

    const uniqueRows = Array.from(byId.values());

    // Sort by name ascending to match previous behaviour
    uniqueRows.sort((a: any, b: any) => {
        const nameA = (a?.name ?? "").toString();
        const nameB = (b?.name ?? "").toString();
        return nameA.localeCompare(nameB);
    });

    return uniqueRows;
}

export async function getAllModels(includeHidden: boolean): Promise<ModelCard[]> {
    const rows = await fetchModelsFromDb({ includeHidden });

    const models: ModelCard[] = rows
        .map((raw: any) => mapRawToModelCard(raw))
        .filter((m) => !!m.model_id);

    return models;
}

export async function getModelsFiltered(
    filters: GetModelsFilter & { includeHidden: boolean }
): Promise<ModelCard[]> {
    const rows = await fetchModelsFromDb(filters);

    const models: ModelCard[] = rows
        .map((raw: any) => mapRawToModelCard(raw))
        .filter((m) => !!m.model_id);

    return models;
}

export async function getAllModelsCached(includeHidden: boolean): Promise<ModelCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");

    console.log("[fetch] HIT DB for models");
    return getAllModels(includeHidden);
}
