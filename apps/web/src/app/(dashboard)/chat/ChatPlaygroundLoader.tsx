import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { fetchChatEffectivePolicy } from "@/lib/fetchers/internal/fetchChatEffectivePolicy";
import { applyChatEffectivePolicy } from "@/lib/chat/effectivePolicy";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { providerCatalogPreviewsToGatewayModels } from "@/lib/chat/providerCatalogPreviewModels";

type ChatPlaygroundLoaderProps = {
    modelParam?: string | null;
    promptParam?: string | null;
};

const decodeQueryValue = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

export default async function ChatPlaygroundLoader({
    modelParam,
    promptParam,
}: ChatPlaygroundLoaderProps) {
	const [catalogue, effectivePolicy, providerPreviews] = await Promise.all([
		fetchFrontendGatewayModels(),
		fetchChatEffectivePolicy().catch(() => null),
		fetchServerProviderCatalogPreviews(),
	]);
	const catalogueIds = new Set(catalogue.map((model) => model.modelId));
	const previewModels = providerCatalogPreviewsToGatewayModels(providerPreviews)
		.filter((model) => !catalogueIds.has(model.modelId));
	const models = applyChatEffectivePolicy([...catalogue, ...previewModels], effectivePolicy);
	const trimmedModelParam = decodeQueryValue((modelParam ?? "").trim());
	const modelIdSet = new Set(models.map((m) => m.modelId));
	let resolvedModelParam: string | null = trimmedModelParam || null;

	if (resolvedModelParam && !modelIdSet.has(resolvedModelParam)) {
		// Unknown/unsupported model; let the playground fall back to its default.
		resolvedModelParam = null;
	}

    return (
        <ChatPlayground
            models={models}
            modelParam={resolvedModelParam}
            promptParam={promptParam ?? null}
        />
    );
}
