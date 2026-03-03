// lib/fetchers/models/getModelTimeline.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

export type RawEvent = {
    date: string;
    eventType: string;
    eventName?: string;
    description?: string;
    modelId?: string;
    modelName?: string;
};

type TimelineNode = {
    model_id: string;
    name: string | null;
    announcement_date: string | null;
    release_date: string | null;
};

export default async function getModelTimeline(
    modelId: string,
    includeHidden: boolean
): Promise<{ events: RawEvent[] } | null> {
    const supabase = await createClient();

    const { data: model, error } = await applyHiddenFilter(
        supabase.from("data_models").select(`
            model_id,
            name,
            previous_model_id,
            announcement_date,
            release_date,
            deprecation_date,
            retirement_date,
            hidden
        `),
        includeHidden
    )
        .eq("model_id", modelId)
        .single();

    if (error) {
        throw new Error(error.message || "Failed to fetch model timeline");
    }

    const events: RawEvent[] = [];

    const pushModelEvent = (date: string | null | undefined, eventName: string) => {
        if (!date) return;
        events.push({
            date,
            eventType: "ModelEvent",
            eventName,
        });
    };

    const versionDate = (row: {
        release_date?: string | null;
        announcement_date?: string | null;
    }) => row.release_date ?? row.announcement_date ?? null;

    // Core lifecycle events for this model
    pushModelEvent(model.announcement_date, "Announced");
    pushModelEvent(model.release_date, "Released");
    pushModelEvent(model.deprecation_date, "Deprecated");
    pushModelEvent(model.retirement_date, "Retired");

    // Immediate previous version
    if (model.previous_model_id) {
        const { data: previousModel, error: previousError } = await applyHiddenFilter(
            supabase.from("data_models").select(`
                model_id,
                name,
                announcement_date,
                release_date,
                hidden
            `),
            includeHidden
        )
            .eq("model_id", model.previous_model_id)
            .maybeSingle();

        if (previousError) {
            throw new Error(previousError.message || "Failed to fetch previous model timeline node");
        }

        const date = previousModel ? versionDate(previousModel) : null;
        if (previousModel && date) {
            events.push({
                date,
                eventType: "PreviousModel",
                modelId: previousModel.model_id,
                modelName: previousModel.name ?? previousModel.model_id,
            });
        }
    }

    // Immediate next version (first model that points back to this one)
    const { data: futureModels, error: futureError } = await applyHiddenFilter(
        supabase.from("data_models").select(`
            model_id,
            name,
            announcement_date,
            release_date,
            hidden
        `),
        includeHidden
    )
        .eq("previous_model_id", modelId);

    if (futureError) {
        throw new Error(futureError.message || "Failed to fetch future model timeline node");
    }

    const nextModel =
        (futureModels as TimelineNode[] | null)
            ?.map((candidate: TimelineNode) => ({ candidate, date: versionDate(candidate) }))
            .filter(
                (entry): entry is { candidate: TimelineNode; date: string } => Boolean(entry.date)
            )
            .sort((a, b) => {
                if (a.date === b.date) {
                    return a.candidate.model_id.localeCompare(b.candidate.model_id);
                }
                return a.date < b.date ? -1 : 1;
            })[0]?.candidate ?? null;
    if (nextModel) {
        const date = versionDate(nextModel);
        if (date) {
            events.push({
                date,
                eventType: "FutureModel",
                modelId: nextModel.model_id,
                modelName: nextModel.name ?? nextModel.model_id,
            });
        }
    }

    return {
        events: events.sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
}

/**
 * Cached version of getModelTimeline.
 *
 * Usage: await getModelTimelineCached(modelId)
 *
 * This wraps a fetcher with `unstable_cache` and includes the modelId in the
 * cache key and tags so you can target revalidation per-model.
 */
export async function getModelTimelineCached(
    modelId: string,
    includeHidden: boolean
) {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);

    return getModelTimeline(modelId, includeHidden);
}
