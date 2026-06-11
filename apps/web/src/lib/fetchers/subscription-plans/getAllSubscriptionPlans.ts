// lib/fetchers/subscription-plans/getAllSubscriptionPlans.ts
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export interface SubscriptionPlanSummary {
    plan_uuid: string;
    plan_id: string;
    name: string;
    organisation_id: string | null;
    description: string | null;
    link: string | null;
    other_info: any;
    organisation: {
        organisation_id: string;
        name: string;
        colour: string | null;
    } | null;
    prices: {
        frequency: string;
        price: number;
        currency: string;
        plan_uuid: string;
    }[];
}

export async function getAllSubscriptionPlans(): Promise<SubscriptionPlanSummary[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
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
                country_code,
                colour
            )
        `)
        .order('name', { ascending: true });

    if (error) {
        console.warn("[getAllSubscriptionPlans] supabase error fetching subscription plans", error.message);
        throw error;
    }

    const rows: any[] = data ?? [];

    // Group by plan_id
    const grouped = new Map<string, any>();
    for (const raw of rows) {
        const key = raw.plan_id;
        if (!grouped.has(key)) {
            grouped.set(key, {
                plan_uuid: raw.plan_uuid, // Use the first one's UUID as representative
                plan_id: raw.plan_id,
                name: raw.name,
                organisation_id: raw.organisation_id,
                description: raw.description,
                link: raw.link,
                other_info: raw.other_info,
                organisation: raw.organisation,
                prices: [],
            });
        }
        grouped.get(key).prices.push({
            frequency: raw.frequency,
            price: raw.price,
            currency: raw.currency,
            plan_uuid: raw.plan_uuid,
        });
    }

    const plans: SubscriptionPlanSummary[] = Array.from(grouped.values()).filter(p => p.prices.length > 0);

    return plans;
}

export async function getAllSubscriptionPlansCached(): Promise<SubscriptionPlanSummary[]> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("frontend:subscription-plans");
    cacheTag("data:subscription_plans");

    console.log("[fetch] HIT DB for subscription plans");
    return getAllSubscriptionPlans();
}
