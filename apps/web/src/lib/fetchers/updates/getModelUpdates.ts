// lib/fetchers/landing/getModelUpdates.ts
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";
import { cacheLife, cacheTag } from "next/cache";

export type EventType = "Announced" | "Released" | "Deprecated" | "Retired";

export interface ModelEvent {
    model: {
        model_id: string;
        name: string;
        organisation_id: string;
        organisation: { organisation_id: string; name?: string | null };
    };
    types: EventType[];
    date: string; // ISO
}

export interface ModelEventSegments {
    past: ModelEvent[];
    future: ModelEvent[];
}

type Args = {
    limit?: number;
    offset?: number;
    now?: Date;
    upcomingLimit?: number;
    pastMonths?: number;
    includeHidden?: boolean;
};

type Row = {
    model_id: string;
    name: string;
    organisation_id: string;
    announcement_date: string | null;
    release_date: string | null;
    deprecation_date: string | null;
    retirement_date: string | null;
    organisation: { organisation_id: string; name: string | null } | null;
};

const TYPE_RANK: Record<EventType, number> = {
    Released: 0,
    Announced: 1,
    Deprecated: 2,
    Retired: 3,
};

function toIsoOrNull(v: string | null | undefined): string | null {
    if (!v) return null;
    const s = String(v).trim();
    if (!s || s === "-") return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function mergeEvent(
    target: Map<string, ModelEvent>,
    model: ModelEvent["model"],
    type: EventType,
    iso: string
) {
    const key = `${model.model_id}|${iso}`;
    const existing = target.get(key);

    if (existing) {
        if (!existing.types.includes(type)) {
            existing.types.push(type);
            existing.types.sort((a, b) => TYPE_RANK[a] - TYPE_RANK[b]);
        }
        return;
    }

    target.set(key, { model, types: [type], date: iso });
}

function compareDescending(a: ModelEvent, b: ModelEvent) {
    if (a.date === b.date) {
        const aOrg = a.model.organisation.organisation_id;
        const bOrg = b.model.organisation.organisation_id;
        if (aOrg === bOrg) {
            return a.model.model_id.localeCompare(b.model.model_id);
        }
        return aOrg.localeCompare(bOrg);
    }
    return a.date < b.date ? 1 : -1;
}

function compareAscending(a: ModelEvent, b: ModelEvent) {
    if (a.date === b.date) {
        const aOrg = a.model.organisation.organisation_id;
        const bOrg = b.model.organisation.organisation_id;
        if (aOrg === bOrg) {
            return a.model.model_id.localeCompare(b.model.model_id);
        }
        return aOrg.localeCompare(bOrg);
    }
    return a.date > b.date ? 1 : -1;
}

export async function getRecentModelUpdatesSplit(
    {
        limit = 5,
        offset = 0,
        now: nowInput,
        upcomingLimit = 5,
        pastMonths,
        includeHidden = false,
    }: Args = {}
): Promise<ModelEventSegments> {
    "use cache";
    cacheLife("hours");
    cacheTag("data:model-updates");
    cacheTag("data:models");

    const now = nowInput ?? new Date();
    const supabase = await createClient();

    const { data, error } = await applyHiddenFilter(
        supabase
            .from("data_models")
            .select(`
            model_id,
            name,
            organisation_id,
            announcement_date,
            release_date,
            deprecation_date,
            retirement_date,
            organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name)
        `)
            .or(
                "announcement_date.not.is.null,release_date.not.is.null,deprecation_date.not.is.null,retirement_date.not.is.null"
            )
            .overrideTypes<Row[], { merge: false }>(),
        includeHidden
    );

    if (error) throw error;

    const nowMs = +now;
    const pastMap = new Map<string, ModelEvent>();
    const futureMap = new Map<string, ModelEvent>();

    const routeEvent = (
        model: ModelEvent["model"],
        type: EventType,
        dateMaybe: string | null
    ) => {
        const iso = toIsoOrNull(dateMaybe);
        if (!iso) return;

        const target =
            Date.parse(iso) <= nowMs ? pastMap : futureMap;

        mergeEvent(target, model, type, iso);
    };

    for (const r of data ?? []) {
        const model = {
            model_id: r.model_id,
            name: r.name,
            organisation_id: r.organisation_id,
            organisation: {
                organisation_id: r.organisation?.organisation_id ?? r.organisation_id,
                name: r.organisation?.name ?? null,
            },
        };

        routeEvent(model, "Announced", r.announcement_date);
        routeEvent(model, "Released", r.release_date);
        routeEvent(model, "Deprecated", r.deprecation_date);
        routeEvent(model, "Retired", r.retirement_date);
    }

    const sortedPast = [...pastMap.values()].sort(compareDescending);
    const sortedFuture = [...futureMap.values()].sort(compareAscending);

    const since = pastMonths ? new Date(now.getTime() - pastMonths * 30 * 24 * 60 * 60 * 1000) : null;
    let filteredPast = sortedPast;
    if (since) {
        filteredPast = sortedPast.filter(e => new Date(e.date) >= since);
    }

    const effectiveLimit = pastMonths ? 10000 : limit;
    const past = filteredPast.slice(offset, offset + effectiveLimit);
    const future = sortedFuture.slice(0, upcomingLimit);

    return { past, future };
}

export default async function getRecentModelUpdates(
    args: Args = {}
): Promise<ModelEvent[]> {
    const { past } = await getRecentModelUpdatesSplit(args);
    return past;
}
