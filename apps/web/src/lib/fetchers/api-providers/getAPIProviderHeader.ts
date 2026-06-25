// lib/fetchers/api-providers/getAPIProviderHeader.ts
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAPIProviderHidden } from "./visibility";

export interface APIProviderHeader {
    api_provider_id: string;
    api_provider_name: string;
    country_code: string;
}

export async function fetchAPIProviderHeader(
    apiProviderId: string
): Promise<APIProviderHeader | null> {
    if (isAPIProviderHidden(apiProviderId)) {
        return null;
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from("data_api_providers")
        .select(
            `
            api_provider_id,
            api_provider_name,
            country_code
            `
        )
        .eq("api_provider_id", apiProviderId)
        .single();

    console.log("[fetch] HIT DB for API Provider header", apiProviderId);

    console.log("Data:", data);

    if (error) throw error;

    return {
        api_provider_id: data.api_provider_id,
        api_provider_name: data.api_provider_name,
        country_code: data.country_code,
    };
}

// --- Cached wrapper (default export) ---
// capture organisationId in both key and tags to retain the per-ID tag
export default async function getAPIProviderHeader(
    apiProviderId: string
): Promise<APIProviderHeader | null> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("frontend:api-providers");
    cacheTag("data:api_providers");
    cacheTag(`data:api_providers:${apiProviderId}`);
    cacheTag(`api_provider:header:${apiProviderId}`);

    console.log("[cache] COMPUTE getAPIProviderHeader", apiProviderId);
    return fetchAPIProviderHeader(apiProviderId);
}
