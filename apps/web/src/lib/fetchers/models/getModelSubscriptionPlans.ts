import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

export interface SubscriptionPlan { plan_id: string; plan_uuid: string; name: string; organisation_id: string; description: string | null; link: string | null; other_info: any; created_at: string; updated_at: string; organisation: { organisation_id: string; name: string; colour: string | null }; prices: Array<{ price: number; currency: string; frequency: string }>; model_info: { model_info: any; rate_limit: any; other_info: any } }

export default async function getModelSubscriptionPlans(modelId: string, includeHidden: boolean): Promise<SubscriptionPlan[]> {
	if (includeHidden) return (await fetchAdminModelSource(modelId)).subscriptionPlans as SubscriptionPlan[];
	return (await fetchOptionalPublicWebApi<{ subscription_plans: SubscriptionPlan[] }>(`/api/_web/models/${encodeURIComponent(modelId)}/subscription-plans`))?.subscription_plans ?? [];
}
export async function getModelSubscriptionPlansCached(modelId: string, includeHidden: boolean): Promise<SubscriptionPlan[]> { return getModelSubscriptionPlans(modelId, includeHidden); }
