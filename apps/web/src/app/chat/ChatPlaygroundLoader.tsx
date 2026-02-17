import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { createAdminClient } from "@/utils/supabase/admin";

type ChatPlaygroundLoaderProps = {
    modelParam?: string | null;
    promptParam?: string | null;
};

type ProviderModelRow = {
	api_model_id: string | null;
	is_active_gateway: boolean | null;
	effective_from: string | null;
	effective_to: string | null;
};

const resolveGatewayModelIdFromInternalId = async (
	internalModelId: string,
	nowIso = new Date().toISOString()
): Promise<string | null> => {
	const client = createAdminClient();
	const { data, error } = await client
		.from("data_api_provider_models")
		.select("api_model_id, is_active_gateway, effective_from, effective_to")
		.eq("internal_model_id", internalModelId);

	if (error) {
		// Don't fail the whole page for a deep-link hint.
		console.warn(
			"[chat] Failed to resolve internal model id to gateway model id",
			{ internalModelId, error: error.message }
		);
		return null;
	}

	const rows = (data ?? []) as ProviderModelRow[];
	const candidates = rows
		.map((row) => (row?.api_model_id ?? "").trim())
		.filter(Boolean);
	if (candidates.length === 0) return null;

	// Prefer an active, currently-effective gateway mapping if present.
	const preferred = rows.find((row) => {
		const apiModelId = (row?.api_model_id ?? "").trim();
		if (!apiModelId) return false;
		if (!row?.is_active_gateway) return false;
		const fromOk = !row.effective_from || row.effective_from <= nowIso;
		const toOk = !row.effective_to || row.effective_to > nowIso;
		return fromOk && toOk;
	});

	return (preferred?.api_model_id ?? candidates[0])?.trim() ?? null;
};

export default async function ChatPlaygroundLoader({
    modelParam,
    promptParam,
}: ChatPlaygroundLoaderProps) {
    const models = await fetchFrontendGatewayModels();
	const trimmedModelParam = (modelParam ?? "").trim();
	const modelIdSet = new Set(models.map((m) => m.modelId));
	let resolvedModelParam: string | null = trimmedModelParam || null;

	if (resolvedModelParam && !modelIdSet.has(resolvedModelParam)) {
		const resolved = await resolveGatewayModelIdFromInternalId(
			resolvedModelParam
		);
		resolvedModelParam = resolved ?? resolvedModelParam;
		if (!modelIdSet.has(resolvedModelParam)) {
			// Unknown/unsupported model; let the playground fall back to its default.
			resolvedModelParam = null;
		}
	}

    return (
        <ChatPlayground
            models={models}
            modelParam={resolvedModelParam}
            promptParam={promptParam ?? null}
        />
    );
}
