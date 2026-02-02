// lib/fetchers/models/getModelSubscriptionPlans.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

export interface SubscriptionPlan {
    plan_id: string;
    plan_uuid: string;
    name: string;
    organisation_id: string;
    description: string | null;
    link: string | null;
    other_info: any;
    created_at: string;
    updated_at: string;
    organisation: {
        organisation_id: string;
        name: string;
        colour: string | null;
    };
    prices: {
        price: number;
        currency: string;
        frequency: string;
    }[];
    model_info: {
        model_info: any;
        rate_limit: any;
        other_info: any;
    };
}

export default async function getModelSubscriptionPlans(
    modelId: string,
    includeHidden: boolean
): Promise<SubscriptionPlan[]> {
    const supabase = await createClient();

    const { data: modelRow, error: modelError } = await supabase
        .from("data_models")
        .select("hidden")
        .eq("model_id", modelId)
        .maybeSingle();

    if (modelError) {
        throw new Error(modelError.message || "Failed to load model metadata");
    }
    if (!modelRow || (!includeHidden && modelRow.hidden)) {
        throw new Error("Model not found");
    }

    // First, get all plan_uuid for this model
    const { data: modelPlansData, error: modelPlansError } = await supabase
        .from("data_subscription_plan_models")
        .select("plan_uuid, model_info, rate_limit, other_info")
        .eq("model_id", modelId);

    if (modelPlansError) {
        throw new Error(modelPlansError.message || "Failed to fetch model subscription plan models");
    }

    if (!modelPlansData || modelPlansData.length === 0) {
        return [];
    }

    const planUuids = modelPlansData.map(item => item.plan_uuid);

    // Get all plan variants
    const { data: plansData, error: plansError } = await supabase
        .from("data_subscription_plans")
        .select(`
            plan_uuid,
            plan_id,
            name,
            organisation_id,
            description,
            frequency,
            price,
            currency,
            link,
            other_info,
            created_at,
            updated_at,
            organisation: data_organisations!organisation_id (
                organisation_id,
                name,
                colour
            )
        `)
        .in("plan_uuid", planUuids)
        .order("plan_id", { ascending: true })
        .order("frequency", { ascending: true });

    if (plansError) {
        throw new Error(plansError.message || "Failed to fetch subscription plans");
    }

    if (!plansData || plansData.length === 0) {
        return [];
    }

    // Group plans by plan_id and collect model_info
    const plansById = new Map<string, any>();

    for (const plan of plansData) {
        const modelInfo = modelPlansData.find(mp => mp.plan_uuid === plan.plan_uuid);
        
        if (!plansById.has(plan.plan_id)) {
            plansById.set(plan.plan_id, {
                plan_id: plan.plan_id,
                plan_uuid: plan.plan_uuid, // Use the first one
                name: plan.name,
                organisation_id: plan.organisation_id,
                description: plan.description,
                link: plan.link,
                other_info: plan.other_info,
                created_at: plan.created_at,
                updated_at: plan.updated_at,
                organisation: plan.organisation,
                prices: [],
                model_info: {
                    model_info: modelInfo?.model_info,
                    rate_limit: modelInfo?.rate_limit,
                    other_info: modelInfo?.other_info,
                },
            });
        }

        // Add price variant
        plansById.get(plan.plan_id).prices.push({
            price: plan.price,
            currency: plan.currency,
            frequency: plan.frequency,
        });
    }

    return Array.from(plansById.values());
}

/**
 * Cached version of getModelSubscriptionPlans.
 *
 * Usage: await getModelSubscriptionPlansCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelSubscriptionPlansCached(
    modelId: string,
    includeHidden: boolean
): Promise<SubscriptionPlan[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag("data:subscription_plans");
    cacheTag("data:subscription_plan_models");

    console.log("[fetch] HIT DB for model subscription plans", modelId);
    return getModelSubscriptionPlans(modelId, includeHidden);
}
