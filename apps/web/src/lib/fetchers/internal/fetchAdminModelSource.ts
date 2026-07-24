import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export type AdminModelSource = {
	requestedModelId: string;
	canonicalApiId: string;
	internalModelId: string | null;
	model: Record<string, any> | null;
	providerRows: Array<Record<string, any>>;
	pricingRules: Array<Record<string, any>>;
	subscriptionPlans: Array<Record<string, any>>;
	aliases: Array<{ api_model_id: string; alias_slug: string }>;
};

export async function fetchAdminModelSource(modelId: string): Promise<AdminModelSource> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Authentication required");
	return (await fetchAccountWebApi<{ source: AdminModelSource }>(
		`/api/account/models/${encodeURIComponent(modelId)}/source`,
		accessToken,
	)).source;
}
