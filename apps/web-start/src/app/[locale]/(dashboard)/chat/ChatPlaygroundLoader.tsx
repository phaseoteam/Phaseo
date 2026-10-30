import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { useSuspenseQueries } from "@tanstack/react-query";
import { applyChatEffectivePolicy } from "@/lib/chat/effectivePolicy";
import { providerCatalogPreviewsToGatewayModels } from "@/lib/chat/providerCatalogPreviewModels";
import { chatGatewayModelsQuery } from "./chat.queries";
import { chatPlaygroundLoaderAccountDataQuery } from "./chat.functions";

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

export default function ChatPlaygroundLoader({
    modelParam,
    promptParam,
}: ChatPlaygroundLoaderProps) {
	const [{ data: catalogue }, { data: { effectivePolicy, providerPreviews } }] = useSuspenseQueries({
		queries: [chatGatewayModelsQuery(), chatPlaygroundLoaderAccountDataQuery()],
	});
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
