// lib/fetchers/subscription-plans/getSubscriptionPlan.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { SubscriptionPlanSummary } from "./getAllSubscriptionPlans";

export interface SubscriptionPlanDetails extends SubscriptionPlanSummary {
    features: SubscriptionPlanFeature[];
    models: SubscriptionPlanModel[];
    prices: {
        price: number;
        currency: string;
        frequency: string;
        plan_uuid: string;
    }[];
}

export interface SubscriptionPlanFeature {
    feature_name: string;
    feature_value: string | null;
    feature_description: string | null;
    other_info: any;
}

export interface SubscriptionPlanModel {
    model_id: string;
    model_info: any;
    rate_limit: any;
    other_info: any;
    model: {
        model_id: string;
        name: string;
        organisation_id: string;
        organisation_name: string | null;
    };
}

export async function getSubscriptionPlan(
    baseId: string,
    includeHidden: boolean
): Promise<SubscriptionPlanDetails | null> {
    const supabase = await createClient();

    // Get the plan details (all variants)
    const { data: planData, error: planError } = await supabase
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
        .eq("plan_id", baseId);

    if (planError) {
        if (planError.code === 'PGRST116') {
            return null; // Plan not found
        }
        console.warn("[getSubscriptionPlan] supabase error fetching plan", planError.message);
        throw planError;
    }

    const plans = Array.isArray(planData) ? planData : [planData];
    if (plans.length === 0) return null;

    const primaryPlan = plans[0]; // Use the first one for details

    const allPrices = plans.map(p => ({
        price: p.price,
        currency: p.currency,
        frequency: p.frequency,
        plan_uuid: p.plan_uuid,
    }));

    console.log("Fetched prices for plan", baseId, ":", allPrices);

    // Get features
    const { data: featuresData, error: featuresError } = await supabase
        .from("data_subscription_plan_features")
        .select(`
            feature_name,
            feature_value,
            feature_description,
            other_info
        `)
        .eq("plan_uuid", primaryPlan.plan_uuid)
        .order('feature_name', { ascending: true });

    if (featuresError) {
        console.warn("[getSubscriptionPlan] supabase error fetching features", featuresError.message);
        throw featuresError;
    }

    // Get models
    const { data: modelsData, error: modelsError } = await supabase
        .from("data_subscription_plan_models")
        .select(`
            model_id,
            model_info,
            rate_limit,
            other_info,
            model: data_models (
                model_id,
                name,
                organisation_id,
                hidden,
                organisation: data_organisations (name)
            )
        `)
        .eq("plan_uuid", primaryPlan.plan_uuid)
        .order('model_id', { ascending: true });

    if (modelsError) {
        console.warn("[getSubscriptionPlan] supabase error fetching models", modelsError.message);
        throw modelsError;
    }

    const features: SubscriptionPlanFeature[] = (featuresData ?? []).map((raw: any) => ({
        feature_name: raw.feature_name,
        feature_value: raw.feature_value,
        feature_description: raw.feature_description,
        other_info: raw.other_info,
    }));

    const models: SubscriptionPlanModel[] = (modelsData ?? [])
        .filter((raw: any) => includeHidden || !raw?.model?.hidden)
        .map((raw: any) => ({
            model_id: raw.model_id,
            model_info: raw.model_info,
            rate_limit: raw.rate_limit,
            other_info: raw.other_info,
            model: {
                model_id: raw.model.model_id,
                name: raw.model.name,
                organisation_id: raw.model.organisation_id,
                organisation_name: raw.model.organisation?.name ?? null,
            },
        }));

    return {
        plan_uuid: primaryPlan.plan_uuid,
        plan_id: primaryPlan.plan_id,
        name: primaryPlan.name,
        organisation_id: primaryPlan.organisation_id,
        description: primaryPlan.description,
        link: primaryPlan.link,
        other_info: primaryPlan.other_info,
        organisation: Array.isArray(primaryPlan.organisation) ? primaryPlan.organisation[0] : primaryPlan.organisation,
        features,
        models,
        prices: allPrices,
    };
}

export async function getSubscriptionPlanCached(
    baseId: string,
    includeHidden: boolean
): Promise<SubscriptionPlanDetails | null> {
    "use cache";

    cacheLife("days");
    cacheTag("data:subscription_plans");
    cacheTag(`data:subscription_plans:${baseId}`);

    console.log("[fetch] HIT DB for subscription plan", baseId);
    return getSubscriptionPlan(baseId, includeHidden);
}
